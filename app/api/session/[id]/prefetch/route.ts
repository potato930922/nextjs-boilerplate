// app/api/session/[id]/prefetch/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyToken } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const HOST = 'taobao-advanced.p.rapidapi.com';
const URL_LOW = `https://${HOST}/item_image_search`;
const KEY = process.env.RAPIDAPI_TAOBAO_KEY_LOW || process.env.RAPIDAPI_KEY_LOW || '';

type Item = {
  img_url: string;
  promo_price: number | null;
  price: number | null;
  sales: string | null;
  seller: string | null;
  detail_url: string;
};

const toUrl = (u?: any) => {
  if (!u) return '';
  let s = String(u).trim();
  if (!s) return '';
  if (s.startsWith('//')) return 'https:' + s;
  if (/^https?:\/\//i.test(s)) return s;
  if (/^[a-z0-9.-]+\//i.test(s)) return 'https://' + s;
  return s;
};

function pickImage(i: any): string {
  const singles = [
    i?.pic, i?.pict_url, i?.pictUrl, i?.pic_url, i?.picUrl,
    i?.image_url, i?.imageUrl, i?.img_url, i?.imgUrl, i?.img, i?.image,
    i?.main_pic, i?.mainPic, i?.thumbnail, i?.thumb,
  ];
  for (const v of singles) {
    const u = toUrl(v);
    if (u) return u;
  }
  const arrays = [i?.small_images, i?.smallImages, i?.images, i?.imgs];
  for (const a of arrays) {
    if (Array.isArray(a) && a.length) {
      const u = toUrl(a[0]);
      if (u) return u;
    }
    if (typeof a === 'string' && a) {
      try {
        const parsed = JSON.parse(a);
        if (Array.isArray(parsed) && parsed.length) {
          const u = toUrl(parsed[0]);
          if (u) return u;
        }
      } catch {
        const u = toUrl(a.split(',')[0]);
        if (u) return u;
      }
    }
  }
  return '';
}
function pickDetail(i: any): string {
  const v = i?.detail_url ?? i?.detailUrl ?? i?.url ?? i?.item_url ??
    (i?.num_iid ? `https://item.taobao.com/item.htm?id=${i.num_iid}` : '');
  return toUrl(v);
}
const toNum = (v: any): number | null => {
  if (v === null || v === undefined || v === '' || v === 'null') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

function normalize(raw: any[]): Item[] {
  const list = Array.isArray(raw) ? raw : [];
  const out: Item[] = list.slice(0, 8).map((i) => ({
    img_url: pickImage(i),
    promo_price: toNum(i?.promotion_price ?? i?.promotionPrice),
    price: toNum(i?.price),
    sales: i?.sales ?? i?.sold ?? null,
    seller: i?.seller_nick ?? i?.sellerNick ?? null,
    detail_url: pickDetail(i),
  }));
  while (out.length < 8) out.push({ img_url: '', promo_price: null, price: null, sales: null, seller: null, detail_url: '' });
  return out;
}

async function searchTaobao(img: string): Promise<Item[]> {
  if (!KEY) return [];
  for (let n = 0; n < 3; n++) {
    try {
      const u = new URL(URL_LOW);
      u.searchParams.set('img', toUrl(img));
      const r = await fetch(u, {
        headers: { 'x-rapidapi-key': KEY, 'x-rapidapi-host': HOST },
        cache: 'no-store',
      });
      if (!r.ok) {
        if (r.status === 429 || r.status >= 500) { await new Promise(res => setTimeout(res, 400 + n * 250)); continue; }
        return [];
      }
      const j = await r.json();
      return normalize(j?.result?.item ?? j?.data ?? []);
    } catch {
      await new Promise(res => setTimeout(res, 350));
    }
  }
  return [];
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id: sessionId } = await ctx.params;

    const token = (await cookies()).get('s_token')?.value;
    const payload = verifyToken(token);
    if (!payload || payload.session_id !== sessionId) {
      return NextResponse.json({ ok: false, error: 'unauth' }, { status: 401 });
    }

    const { data: rows, error } = await supabaseAdmin
      .from('rows')
      .select('row_id, src_img_url')
      .eq('session_id', sessionId)
      .order('order_no', { ascending: true });
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    let processed = 0;
    for (const row of rows ?? []) {
      const img = toUrl(row.src_img_url);
      if (!img) { processed++; continue; }

      // 기존 후보 삭제
      const del = await supabaseAdmin.from('candidates').delete().eq('row_id', row.row_id);
      if (del.error) return NextResponse.json({ ok: false, error: `del_candidates: ${del.error.message}` }, { status: 500 });

      const items = await searchTaobao(img);

      if (items.length) {
        // ⬇️ 실제 저장 확인(컬럼 불일치면 여기서 바로 에러가 납니다)
        const ins = await supabaseAdmin
          .from('candidates')
          .insert(items.map((it, idx) => ({
            row_id: row.row_id,
            idx,                                // ← 정렬용 인덱스
            img_url: it.img_url || '',          // ← 이미지 컬럼명 통일
            detail_url: it.detail_url || '',
            price: it.price,
            promo_price: it.promo_price,
            sales: it.sales,
            seller: it.seller,
          })))
          .select('row_id, idx, img_url');

        if (ins.error) {
          return NextResponse.json({ ok: false, error: `ins_candidates: ${ins.error.message}` }, { status: 500 });
        }
      }
      processed++;
    }

    return NextResponse.json({ ok: true, processed });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'prefetch_failed' }, { status: 500 });
  }
}
