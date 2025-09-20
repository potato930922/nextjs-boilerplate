import { NextRequest, NextResponse } from 'next/server';

type Item = {
  pic?: string;
  promotion_price?: number | string | null;
  price?: number | string | null;
  sales?: string | null;
  seller_nick?: string | null;
  detail_url?: string | null;
};

function toHttps(u: string) {
  if (!u) return '';
  return u.startsWith('//') ? `https:${u}` : u;
}

export async function POST(req: NextRequest) {
  try {
    const { img, mode } = await req.json() as { img: string; mode?: 'low'|'alt' };
    if (!img) return NextResponse.json({ ok:false, error:'no_img' }, { status:400 });

    const host = process.env.RAPIDAPI_HOST!;
    const isLow = (mode ?? 'low') === 'low';
    const url = isLow
      ? `https://${host}/item_image_search`
      : `https://${host}/api?api=item_image_search&img=${encodeURIComponent(img)}`;

    const headers: Record<string,string> = {
      'x-rapidapi-host': host,
      'x-rapidapi-key': isLow ? (process.env.RAPIDAPI_KEY_LOW||'') : (process.env.RAPIDAPI_KEY_ALT||''),
    };

    const r = await fetch(isLow ? `${url}?img=${encodeURIComponent(img)}` : url, { headers, cache: 'no-store' });
    if (!r.ok) {
      const t = await r.text();
      return NextResponse.json({ ok:false, error:'upstream', status:r.status, body:t }, { status:502 });
    }
    const j = await r.json();

    const raw: Item[] =
      j?.result?.item || j?.data || [];

    const items = (raw as Item[]).slice(0, 8).map(i => ({
      img_url: toHttps(i.pic || ''),
      promo_price: i.promotion_price == null || i.promotion_price === '' ? null : Number(i.promotion_price),
      price: i.price == null || i.price === '' ? null : Number(i.price),
      sales: i.sales || null,
      seller: i.seller_nick || null,
      detail_url: toHttps(i.detail_url || ''),
    }));

    while (items.length < 8) items.push({ img_url:'', promo_price:null, price:null, sales:null, seller:null, detail_url:'' });

    return NextResponse.json({ ok:true, items });
  } catch (e:any) {
    return NextResponse.json({ ok:false, error:'server', message:e?.message }, { status:500 });
  }
}
