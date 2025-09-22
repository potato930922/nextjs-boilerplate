// app/api/session/[id]/prefetch/route.ts
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

// 스킴/도메인 없는 형태까지 모두 보정
const toUrl = (u?: any) => {
  if (!u) return '';
  let s = String(u).trim();
  if (!s) return '';
  if (s.startsWith('//')) return 'https:' + s;
  if (/^https?:\/\//i.test(s)) return s;
  // img.alicdn.com/xxx.jpg 처럼 도메인/경로만 오면 https:// 부여
  if (/^[a-z0-9.-]+\//i.test(s)) return 'https://' + s;
  return s;
};

// 다양한 응답 키에서 이미지 뽑기 (문자열 JSON/콤마 리스트 포함)
function pickImage(i: any): string {
  const singles = [
    i?.pic,
    i?.pict_url, i?.pictUrl, i?.pic_url, i?.picUrl,
    i?.image_url, i?.imageUrl,
    i?.image, i?.img, i?.img_url, i?.imgUrl,
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
  const v =
    i?.detail_url ?? i?.detailUrl ?? i?.url ?? i?.item_url ??
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
  const items: Item[] = list.slice(0, 8).map((i) => ({
    img_url: pickImage(i),
    promo_price: toNum(i?.promotion_price ?? i?.promotionPrice),
    price: toNum(i?.price),
    sales: i?.sales ?? i?.sold ?? null,
    seller: i?.seller_nick ?? i?.sellerNick ?? null,
    detail_url: pickDetail(i),
  }));
  while (items.length < 8) items.push({ img_url: '', promo_price: null, price: null, sales: null, seller: null, detail_url: '' });
  return items;
}

// RapidAPI 호출(저지연) + 재시도
async function searchTaobao(img: string): Promise<Item[]> {
  if (!KEY) return [];
  const controller = new AbortController();
  const to = setTimeout(() => controller.abort(), 15000);
  try {
    for (let n = 0; n < 3; n++) {
      try {
        const u = new URL(URL_LOW);
        u.searchParams.set('img', toUrl(img));
        const r = await fetch(u, {
          headers: { 'x-rapidapi-key': KEY, 'x-rapidapi-host': HOST },
          cache: 'no-store',
          signal: controller.signal,
        });
        if (!r.ok) {
          if (r.status === 429 || r.status >= 500) {
            await new Promise((res) => setTimeout(res, 400 + n * 250));
            continue;
          }
          return [];
        }
        const j = await r.json();
        const data = j?.result?.item ?? j?.data ?? [];
        return normalize(data);
      } catch {
        await new Promise((res) => setTimeout(res, 350));
      }
    }
    return [];
  } finally {
    clearTimeout(to);
  }
}

// 간단 p-limit
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
        const img = row.src_img_url ? toUrl(row.src_img_url) : '';
        if (!img) return;

        // 기존 후보 삭제
        await supabaseAdmin.from('candidates').delete().eq('row_id', row.row_id);

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
