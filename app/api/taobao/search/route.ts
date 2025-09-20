import { NextRequest, NextResponse } from 'next/server';
import dns from 'node:dns';
import { Agent } from 'undici';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const preferredRegion = ['icn1', 'hnd1'] as const;

// ✅ Node의 DNS 해석 순서를 IPv4 먼저로
dns.setDefaultResultOrder('ipv4first');

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

// ✅ IPv4 강제용 undici Agent
const ipv4Agent = new Agent({
  connect: { family: 4, timeout: 20_000 },
  keepAliveTimeout: 10_000,
});

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
      i?.detail_url ?? i?.url ?? i?.detailUrl ?? i?.item_url ??
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

async function dnsDiag(host: string) {
  try {
    const v4 = await new Promise<string[]>((res, rej) => dns.resolve4(host, (e, a) => e ? rej(e) : res(a)));
    return { ok: true, v4 };
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }
}

async function pingRapidIndex() {
  try {
    const r = await fetch('https://taobao-advanced.p.rapidapi.com/', {
      headers: {
        'X-RapidAPI-Key': KEY_LOW,
        'X-RapidAPI-Host': HOST,
        'User-Agent': 'dalae-taobao/1.0',
        'Accept': 'application/json',
      },
      cache: 'no-store',
      // ✅ IPv4 고정
      dispatcher: ipv4Agent,
    });
    return { ok: r.ok, status: r.status };
  } catch (e: any) {
    return { ok: false, name: e?.name, msg: e?.message, cause: e?.cause ?? null };
  }
}

async function callRapidLow(img: string) {
  const url = `${URL_LOW}?img=${encodeURIComponent(img)}`;
  return fetch(url, {
    method: 'GET',
    headers: {
      'X-RapidAPI-Key': KEY_LOW,
      'X-RapidAPI-Host': HOST,
      'Accept': 'application/json',
      'User-Agent': 'dalae-taobao/1.0 (+https://example.com)',
    },
    cache: 'no-store',
    redirect: 'follow',
    // ✅ IPv4 고정
    dispatcher: ipv4Agent,
  });
}

export async function POST(req: NextRequest) {
  const t0 = Date.now();
  try {
    const { img } = (await req.json()) as { img: string };
    if (!img) {
      return NextResponse.json({ ok: false, error: 'no_img' }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
    }
    if (!KEY_LOW) {
      return NextResponse.json({ ok: false, error: 'no_low_key' }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
    }

    const imgUrl = https(String(img));

    // ✅ 사전 진단: DNS / Rapid index 핑
    const [dnsInfo, indexPing] = await Promise.all([dnsDiag(HOST), pingRapidIndex()]);

    try {
      const res = await callRapidLow(imgUrl);
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        return NextResponse.json(
          { ok: false, status: res.status, error: text || 'bad_status', dur_ms: Date.now() - t0, dnsInfo, indexPing },
          { status: 502, headers: { 'Cache-Control': 'no-store' } }
        );
      }
      const json = await res.json();
      const items = parseItems(json);
      return NextResponse.json(
        { ok: true, items, dur_ms: Date.now() - t0, dnsInfo, indexPing },
        { status: 200, headers: { 'Cache-Control': 'no-store' } }
      );
    } catch (e: any) {
      const cause = (e && e.cause) ? {
        code: e.cause.code,
        errno: e.cause.errno,
        syscall: e.cause.syscall,
        address: e.cause.address,
        port: e.cause.port
      } : null;
      return NextResponse.json(
        { ok: false, error: 'fetch_failed', name: e?.name, msg: e?.message, cause, dur_ms: Date.now() - t0, dnsInfo, indexPing },
        { status: 500, headers: { 'Cache-Control': 'no-store' } }
      );
    }
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? 'server_error', dur_ms: Date.now() - t0 },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
