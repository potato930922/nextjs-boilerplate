import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyToken } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CONCURRENCY = 4;

// ==== RapidAPI 설정 ====
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

const https = (u?: string) => (u ? (u.startsWith('//') ? `https:${u}` : u) : '');
const toNum = (v: any): number | null => {
  if (v === null || v === undefined || v === '' || v === 'null') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

// 다양한 키를 커버해 확실히 이미지/상세링크를 뽑는다
function pickImage(i: any): string {
  const v =
    i?.pic ??
    i?.pict_url ??
    i?.pictUrl ??
    i?.image ??
    i?.img ??
    i?.main_pic ??
    i?.mainPic ??
    i?.thumbnail ??
    i?.thumb ??
    i?.img_url ??
    (Array.isArray(i?.small_images) ? i.small_images[0] : null) ??
    (Array.isArray(i?.smallImages) ? i.smallImages[0] : null);
  return https(String(v || ''));
}
function pickDetail(i: any): string {
  const v =
    i?.detail_url ??
    i?.detailUrl ??
    i?.url ??
    i?.item_url ??
    (i?.num_iid ? `https://item.taobao.com/item.htm?id=${i.num_iid}` : '');
  return https(String(v || ''));
}
function normalize(raw: any[]): Item[] {
  const list = Array.isArray(raw) ? raw : [];
  const items: Item[] = list.slice(0, 8).map((i) => ({
    img_url: pickImage(i),
    promo_price: toNum(i?.promotion_price ?? i?.promotionPrice),
    price: toNum(i?.price),
    sales: i?.sales ?? i?.sold ?? null,
    seller: i?.seller_nick ?? i?.sellerNick ?? null,
    detail_url: pickDetail(i),
  }));
  while (items.length < 8) {
    items.push({ img_url: '', promo_price: null, price: null, sales: null, seller: null, detail_url: '' });
  }
  return items;
}

// RapidAPI 호출(저지연 엔드포인트) + 3회 재시도
async function searchTaobao(img: string): Promise<Item[]> {
  if (!KEY) return [];
  const controller = new AbortController();
  const to = setTimeout(() => controller.abort(), 15000);
  try {
    let last = '';
    for (let n = 0; n < 3; n++) {
      try {
        const u = new URL(URL_LOW);
        u.searchParams.set('img', https(img));
        const r = await fetch(u, {
          headers: { 'x-rapidapi-key': KEY, 'x-rapidapi-host': HOST },
          cache: 'no-store',
          signal: controller.signal,
        });
        if (!r.ok) {
          last = `upstream_${r.status}`;
          if (r.status === 429 || r.status >= 500) {
            await new Promise((res) => setTimeout(res, 400 + n * 250));
            continue;
          }
          return [];
        }
        const j = await r.json();
        const data = j?.result?.item ?? j?.data ?? [];
        return normalize(data);
      } catch (e: any) {
        last = e?.name === 'AbortError' ? 'timeout' : (e?.message || 'fetch_failed');
        await new Promise((res) => setTimeout(res, 350));
      }
    }
    // 마지막 실패
    return [];
  } finally {
    clearTimeout(to);
  }
}

// 간단 p-limit (동시성 제어)
function pLimit<T>(concurrency: number) {
  let active = 0;
  const q: Array<() => void> = [];
  const next = () => { active--; q.shift()?.(); };
  return async (fn: () => Promise<T>) =>
    new Promise<T>((resolve, reject) => {
      const run = async () => {
        active++;
        try { resolve(await fn()); }
        catch (e) { reject(e); }
        finally { next(); }
      };
      if (active < concurrency) run();
      else q.push(run);
    });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id: sessionId } = await ctx.params;

    const store = await cookies();
    const token = store.get('s_token')?.value;
    const payload = verifyToken(token);
    if (!payload || payload.session_id !== sessionId) {
      return NextResponse.json({ ok: false, error: 'unauth' }, { status: 401 });
    }

    const { data: rows, error: rowsErr } = await supabaseAdmin
      .from('rows')
      .select('row_id, src_img_url')
      .eq('session_id', sessionId)
      .order('order_no', { ascending: true });

    if (rowsErr) return NextResponse.json({ ok: false, error: rowsErr.message }, { status: 500 });

    const total = rows?.length || 0;
    if (!total) return NextResponse.json({ ok: true, session_id: sessionId, processed: 0, total: 0, dur_ms: 0 });

    const limit = pLimit<void>(CONCURRENCY);
    const started = Date.now();
    let done = 0;

    const jobs = (rows || []).map((row) =>
      limit(async () => {
        const img = row.src_img_url ? https(row.src_img_url) : '';
        if (!img) return;

        // 기존 후보 삭제
        await supabaseAdmin.from('candidates').delete().eq('row_id', row.row_id);

        // RapidAPI 직접 호출
        const items = await searchTaobao(img);

        if (items.length) {
          await supabaseAdmin.from('candidates').insert(
            items.map((it, idx) => ({
              row_id: row.row_id,
              idx,
              img_url: it.img_url || '',
              detail_url: it.detail_url || '',
              price: it.price,
              promo_price: it.promo_price,
              sales: it.sales,
              seller: it.seller,
            }))
          );
        }

        // 진행률용 카운트(행 단위 완료)
        done++;
      })
    );

    await Promise.allSettled(jobs);

    const dur_ms = Date.now() - started;
    return NextResponse.json({ ok: true, session_id: sessionId, processed: done, total, dur_ms });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'prefetch_failed' }, { status: 500 });
  }
}
