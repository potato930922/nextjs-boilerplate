import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';                 // Edge 금지
export const dynamic = 'force-dynamic';
export const revalidate = 0;
// Vercel: 가까운 리전 선호(도쿄/서울). 없는 플랫폼이면 무시됨.
export const preferredRegion = ['hnd1', 'icn1']; 

type Item = {
  img_url: string;
  promo_price: number | null;
  price: number | null;
  sales: string | null;
  seller: string | null;
  detail_url: string;
};

const URL_LOW = 'https://taobao-advanced.p.rapidapi.com/item_image_search';
const HOST = 'taobao-advanced.p.rapidapi.com';
const KEY_LOW = process.env.RAPIDAPI_TAOBAO_KEY_LOW || '';

const https = (u: string) => (u?.startsWith('//') ? `https:${u}` : (u || ''));

const toNum = (v: any): number | null => {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  const s = String(v).trim(); if (!s) return null;
  const n = Number(s.replace(/[^\d.]/g, ''));
  return Number.isFinite(n) ? n : null;
};
const normSales = (v: any): string | null => (v === null || v === undefined ? null : String(v).trim() || null);

function parseItems(json: any): Item[] {
  const candidates =
    json?.result?.items ?? json?.result?.item ?? json?.data?.items ?? json?.data ?? json?.items ?? [];
  const arr = Array.isArray(candidates) ? candidates.slice(0, 8) : [];

  const items: Item[] = arr.map((i: any) => {
    const img =
      i?.pic ?? i?.pic_url ?? i?.pict_url ?? i?.image ??
      (Array.isArray(i?.small_images) ? i.small_images[0] : '') ?? i?.img ?? '';

    const promo =
      i?.promotion_price ?? i?.promo_price ?? i?.zk_final_price ?? i?.lowPrice ?? i?.min_price ?? i?.discount_price;

    const price =
      i?.price ?? i?.reserve_price ?? i?.orgPrice ?? i?.view_price ??
      i?.max_price ?? i?.original_price ?? (promo ?? null);

    const sales =
      i?.sales ?? i?.view_sales ?? i?.sold ?? i?.sold_quantity ?? i?.comment_count ?? i?.volume ?? null;

    const seller = i?.seller_nick ?? i?.nick ?? i?.seller ?? i?.shop_title ?? null;

    const detail =
  i?.detail_url ??
  i?.url ??
  i?.detailUrl ??
  i?.item_url ??
  (i?.num_iid ? `https://item.taobao.com/item.htm?id=${i.num_iid}` : '');

    return {
      img_url: https(String(img)),
      promo_price: toNum(promo),
      price: toNum(price),
      sales: normSales(sales),
      seller: seller ? String(seller) : null,
      detail_url: https(String(detail)),
    };
  });

  while (items.length < 8) {
    items.push({ img_url: '', promo_price: null, price: null, sales: null, seller: null, detail_url: '' });
  }
  return items;
}

async function callRapidLow(img: string, signal: AbortSignal) {
  const url = `${URL_LOW}?img=${encodeURIComponent(img)}`;
  return fetch(url, {
    method: 'GET',
    headers: {
      'X-RapidAPI-Key': KEY_LOW,
      'X-RapidAPI-Host': HOST,
      'Accept': 'application/json',
      // 일부 WAF이 UA 없는 서버콜을 컷: UA 부여
      'User-Agent': 'dalae-taobao/1.0 (+https://example.com)',
    },
    // Edge 캐시 간섭 방지
    cache: 'no-store',
    redirect: 'follow',
    signal,
  });
}

export async function POST(req: NextRequest) {
  const started = Date.now();
  try {
    const { img } = (await req.json()) as { img: string };
    if (!img) {
      return NextResponse.json({ ok: false, error: 'no_img' }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
    }
    if (!KEY_LOW) {
      return NextResponse.json({ ok: false, error: 'no_low_key' }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
    }

    const imgUrl = https(String(img));

    // 타임아웃/에러 디테일 로그용
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);

    try {
      const res = await callRapidLow(imgUrl, controller.signal);
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        return NextResponse.json(
          { ok: false, status: res.status, error: text || 'bad_status', dur_ms: Date.now() - started },
          { status: 502, headers: { 'Cache-Control': 'no-store' } }
        );
      }
      const json = await res.json();
      const items = parseItems(json);
      return NextResponse.json(
        { ok: true, items, dur_ms: Date.now() - started },
        { status: 200, headers: { 'Cache-Control': 'no-store' } }
      );
    } catch (e: any) {
      // undici 에러 디테일 까보자
      const cause = (e && e.cause) ? {
        code: e.cause.code,
        errno: e.cause.errno,
        syscall: e.cause.syscall,
        address: e.cause.address,
        port: e.cause.port
      } : null;
      const name = e?.name;
      const msg = e?.message;
      return NextResponse.json(
        { ok: false, error: 'fetch_failed', name, msg, cause, dur_ms: Date.now() - started },
        { status: 500, headers: { 'Cache-Control': 'no-store' } }
      );
    } finally {
      clearTimeout(timeout);
    }
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? 'server_error', dur_ms: Date.now() - started },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
