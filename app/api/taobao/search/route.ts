// app/api/taobao/search/route.ts
import { NextRequest, NextResponse } from 'next/server';

type Item = {
  img_url: string;
  promo_price: number | null;
  price: number | null;
  sales: string | null;
  seller: string | null;
  detail_url: string;
};

const HOST = 'taobao-advanced.p.rapidapi.com';
const URL_LOW = `https://${HOST}/item_image_search`; // 저지연만 사용

const KEY = process.env.RAPIDAPI_TAOBAO_KEY_LOW || process.env.RAPIDAPI_KEY_LOW || '';

const https = (u?: string) => (u ? (u.startsWith('//') ? `https:${u}` : u) : '');
const toNum = (v: any): number | null => {
  if (v === null || v === undefined || v === '' || v === 'null') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

function pickImage(i: any): string {
  // 다양한 키 대응
  let v =
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
  let v =
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
    items.push({
      img_url: '',
      promo_price: null,
      price: null,
      sales: null,
      seller: null,
      detail_url: '',
    });
  }
  return items;
}

async function callRapid(img: string) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 15_000);
  try {
    const u = new URL(URL_LOW);
    u.searchParams.set('img', https(img));
    const r = await fetch(u, {
      headers: { 'x-rapidapi-key': KEY, 'x-rapidapi-host': HOST },
      cache: 'no-store',
      signal: controller.signal,
    });
    return r;
  } finally {
    clearTimeout(t);
  }
}

export async function POST(req: NextRequest) {
  try {
    if (!KEY) {
      return NextResponse.json({ ok: false, error: 'no_rapidapi_key' }, { status: 500 });
    }
    const { img } = (await req.json()) as { img: string };
    if (!img) return NextResponse.json({ ok: false, error: 'img_required' }, { status: 400 });

    // 2회 재시도(429/5xx/timeout)
    let lastErr = 'fetch_failed';
    for (let n = 0; n < 3; n++) {
      try {
        const r = await callRapid(img);
        if (!r.ok) {
          const txt = await r.text().catch(() => '');
          if (r.status >= 500 || r.status === 429) {
            lastErr = `upstream_${r.status}`;
            await new Promise((res) => setTimeout(res, 400 + n * 250));
            continue;
          }
          return NextResponse.json({ ok: false, error: `upstream_${r.status}`, detail: txt.slice(0, 2000) }, { status: 502 });
        }
        const j = await r.json();
        const data = j?.result?.item ?? j?.data ?? [];
        const items = normalize(data);
        return NextResponse.json({ ok: true, items }, { status: 200 });
      } catch (e: any) {
        lastErr = e?.name === 'AbortError' ? 'timeout' : (e?.message || 'fetch_failed');
        await new Promise((res) => setTimeout(res, 350));
      }
    }
    return NextResponse.json({ ok: false, error: lastErr }, { status: 502 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'server_error' }, { status: 500 });
  }
}
