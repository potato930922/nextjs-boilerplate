// app/api/session/[id]/prefetch/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import pLimit from 'p-limit';
import sharp from 'sharp';
import crypto from 'crypto';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { verifyToken } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const HOST = 'taobao-advanced.p.rapidapi.com';
const URL_LOW = `https://${HOST}/item_image_search`;
const BUCKET = process.env.SUPABASE_STORAGE_BUCKET_THUMBS || 'thumbs';

type Item = {
  img_url: string;
  promo_price: number | null;
  price: number | null;
  sales: string | null;
  seller: string | null;
  detail_url: string;
};

function https(u?: string | null) {
  if (!u) return '';
  return u.startsWith('//') ? `https:${u}` : u;
}
function toNum(v: any): number | null {
  if (v === null || v === undefined || v === '' || v === 'null') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function normalizeTaobao(json: any): Item[] {
  const list = json?.result?.item ?? json?.data ?? json?.item ?? [];
  const items = (Array.isArray(list) ? list : []).slice(0, 8).map((i: any) => ({
    img_url: https(i?.pic ?? ''),
    promo_price: toNum(i?.promotion_price),
    price: toNum(i?.price),
    sales: i?.sales ?? null,
    seller: i?.seller_nick ?? null,
    detail_url: https(i?.detail_url ?? (i?.url ?? '')),
  }));
  while (items.length < 8) {
    items.push({ img_url: '', promo_price: null, price: null, sales: null, seller: null, detail_url: '' });
  }
  return items;
}

async function taobaoSearch(img: string) {
  const key =
    process.env.RAPIDAPI_TAOBAO_KEY_LOW ||
    process.env.RAPIDAPI_KEY_LOW ||
    '';
  if (!key) throw new Error('no_rapid_key');

  const u = new URL(URL_LOW);
  u.searchParams.set('img', https(img));

  const r = await fetch(u, {
    method: 'GET',
    headers: { 'x-rapidapi-key': key, 'x-rapidapi-host': HOST },
    cache: 'no-store',
  });
  if (!r.ok) {
    const t = await r.text().catch(() => '');
    throw new Error(`rapid_${r.status}:${t.slice(0, 300)}`);
  }
  const j = await r.json();
  return normalizeTaobao(j);
}

// --- 썸네일 저장 (prefetch 내부에서 직접 사용) ---
function sha256(buf: Buffer) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}
async function storeThumb(srcUrl: string): Promise<string> {
  const res = await fetch(srcUrl, { cache: 'no-store' });
  if (!res.ok) throw new Error(`img_${res.status}`);
  const ab = await res.arrayBuffer();
  const input = Buffer.from(ab);

  const webp = await sharp(input)
    .resize({ width: 320, withoutEnlargement: true })
    .webp({ quality: 78 })
    .toBuffer();

  const hash = sha256(webp);
  const key = `thumbs/${hash}.webp`;

  // 존재 확인/업서트
  const listed = await supabaseAdmin.storage.from(BUCKET).list('thumbs', { search: `${hash}.webp` });
  const exists = listed.data?.some(f => f.name === `${hash}.webp`);
  if (!exists) {
    const up = await supabaseAdmin.storage.from(BUCKET).upload(key, webp, {
      upsert: true,
      contentType: 'image/webp',
    });
    if (up.error) throw new Error(up.error.message);
  }
  const pub = supabaseAdmin.storage.from(BUCKET).getPublicUrl(key);
  const url = pub.data?.publicUrl;
  if (!url) throw new Error('no_public_url');
  return url;
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const sessionId = params.id;

  try {
    // ── 인증 ─────────────────────────────────
    const token = cookies().get('s_token')?.value;
    const payload = verifyToken(token);
    if (!payload || payload.session_id !== sessionId) {
      return NextResponse.json({ ok: false, error: 'unauth' }, { status: 401 });
    }

    // rows 읽기
    const qr = await supabaseAdmin
      .from('rows')
      .select('row_id, src_img_url')
      .eq('session_id', sessionId)
      .order('order_no', { ascending: true });

    if (qr.error) {
      return NextResponse.json({ ok: false, error: qr.error.message }, { status: 500 });
    }
    const rows = qr.data || [];
    if (!rows.length) {
      return NextResponse.json({ ok: false, error: 'no_rows' }, { status: 400 });
    }

    let processed = 0;
    const startedAt = Date.now();
    const limit = pLimit(4); // RapidAPI/Storage 부담 완화

    await Promise.all(
      rows.map((row: any) =>
        limit(async () => {
          const src = row.src_img_url || '';
          if (!src) return;

          // 1) 기존 후보 제거
          await supabaseAdmin.from('candidates').delete().eq('row_id', row.row_id);

          // 2) 검색
          const items = await taobaoSearch(src);

          // 3) 이미지 저장(없으면 원본 유지)
          const saved = await Promise.all(
            items.map(async (it) => {
              if (!it.img_url) return it;
              try {
                const fixed = await storeThumb(it.img_url);
                return { ...it, img_url: fixed };
              } catch {
                return it;
              }
            })
          );

          // 4) 후보 insert
          const inserts = saved.map((it, idx) => ({
            row_id: row.row_id,
            idx,
            img_url: it.img_url,
            detail_url: it.detail_url,
            price: it.price,
            promo_price: it.promo_price,
            sales: it.sales,
            seller: it.seller,
          }));
          await supabaseAdmin.from('candidates').insert(inserts);

          // 5) 진행상태 갱신
          await supabaseAdmin.from('rows').update({ status: 'ready' }).eq('row_id', row.row_id);

          processed += 1;
        })
      )
    );

    const dur = Date.now() - startedAt;
    return NextResponse.json({ ok: true, processed, dur_ms: dur });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'prefetch_failed' }, { status: 500 });
  }
}
