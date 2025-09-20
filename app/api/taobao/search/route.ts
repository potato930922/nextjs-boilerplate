// app/api/taobao/search/route.ts
import { NextRequest, NextResponse } from "next/server";
const HOST = "taobao-advanced.p.rapidapi.com";
const URL_LOW = `https://${HOST}/item_image_search`;

function https(u: string) { return u?.startsWith("//") ? "https:" + u : u; }
function toNum(v: any): number | null {
  if (v === null || v === undefined || v === "" || v === "null") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function normalize(data: any[]) {
  const items = (data || []).slice(0, 8).map((i: any) => ({
    img_url: https(i?.pic ?? ""),
    promo_price: toNum(i?.promotion_price),
    price: toNum(i?.price),
    sales: i?.sales ?? null,
    seller: i?.seller_nick ?? null,
    detail_url: https(i?.detail_url ?? ""),
  }));
  while (items.length < 8) items.push({ img_url:"", promo_price:null, price:null, sales:null, seller:null, detail_url:"" });
  return items;
}

export async function POST(req: NextRequest) {
  try {
    const { img } = await req.json();
    if (!img) return NextResponse.json({ ok:false, error:"img_required" }, { status:400 });

    const key = process.env.RAPIDAPI_KEY_LOW;
    if (!key) return NextResponse.json({ ok:false, error:"rapidapi_key_missing" }, { status:500 });

    const r = await fetch(`${URL_LOW}?img=${encodeURIComponent(https(img))}`, {
      headers: { "x-rapidapi-key": key, "x-rapidapi-host": HOST },
    });
    if (!r.ok) return NextResponse.json({ ok:false, error:`upstream_${r.status}` }, { status:502 });

    const j = await r.json();
    const raw = j?.result?.item ?? j?.data ?? [];
    return NextResponse.json({ ok:true, items: normalize(raw) });
  } catch (e:any) {
    return NextResponse.json({ ok:false, error:e?.message ?? "proxy_error" }, { status:500 });
  }
}
