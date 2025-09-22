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
  const singles = [i?.pic, i?.pict_url, i?.pictUrl, i?.pic_url, i?.picUrl, i?.image_url, i?.imageUrl, i?.img_url, i?.imgUrl, i?.img, i?.image, i?.main_pic, i?.mainPic, i?.thumbnail, i?.thumb];
  for (const v of singles) {
    const u = toUrl(v);
    if (u) return u;
  }
  return '';
}
function pickDetail(i: any): string {
  const v = i?.detail_url ?? i?.detailUrl ?? i?.url ?? i?.item_url ?? (i?.num_iid ? `https://item.taobao.com/item.htm?id=${i.num_iid}` : '');
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
        if (r.status === 429 || r.status >= 500) { await new Promise(res => setTimeout(res, 300 + 200 * n)); continue; }
        return [];
      }
      const j = await r.json();
      return normalize(j?.result?.item ?? j?.data ?? []);
    } catch {
      await new Promise(res => setTimeout(res, 300));
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
    const t0 = Date.now();

    for (const row of rows ?? []) {
      const img = toUrl(row.src_img_url);
      if (!img) { processed++; continue; }

      // 후보 삭제
      const del = await supabaseAdmin.from('candidates').delete().eq('row_id', row.row_id);
      if (del.error) return NextResponse.json({ ok: false, error: del.error.message }, { status: 500 });

      // 검색
      const items = await searchTaobao(img);

      // 저장
      if (items.length) {
        const ins = await supabaseAdmin
          .from('candidates')
          .insert(items.map((it, idx) => ({
            row_id: row.row_id,
            idx,
            img_url: it.img_url || '',
            detail_url: it.detail_url || '',
            price: it.price,
            promo_price: it.promo_price,
            sales: it.sales,
            seller: it.seller,
          })))
          .select('row_id');

        if (ins.error) return NextResponse.json({ ok: false, error: ins.error.message }, { status: 500 });
      }

      // ✅ 진행률을 위해 행 상태를 즉시 'done'으로
      await supabaseAdmin.from('rows').update({ status: 'done' }).eq('row_id', row.row_id);

      processed++;
      // 과도 호출 방지
      await new Promise((r) => setTimeout(r, 200));
    }

    return NextResponse.json({ ok: true, processed, dur_ms: Date.now() - t0 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'prefetch_failed' }, { status: 500 });
  }
}
