import { NextRequest, NextResponse } from "next/server";

function https(url: string) {
  if (!url) return "";
  return url.startsWith("//") ? "https:" + url : url;
}

function toNum(v: any) {
  return v === null || v === "" || v === "null" ? null : Number(v);
}

function normalize(data: any[]) {
  const items = (data || []).slice(0, 8).map((i: any) => ({
    img_url: https(i?.pic || ""),
    promo_price: toNum(i?.promotion_price),
    price: toNum(i?.price),
    sales: i?.sales ?? null,
    seller: i?.seller_nick ?? null,
    detail_url: https(i?.detail_url || ""),
  }));
  while (items.length < 8) items.push({ img_url:"", promo_price:null, price:null, sales:null, seller:null, detail_url:"" });
  return items;
}

export async function GET(req: NextRequest) {
  const img = req.nextUrl.searchParams.get("img");
  const mode = req.nextUrl.searchParams.get("mode") || "low"; // low|alt

  if (!img) return NextResponse.json({ ok:false, error:"missing_img" }, { status: 400 });

  const host = process.env.RAPIDAPI_HOST!;
  const key  = process.env.RAPIDAPI_KEY!;
  if (!host || !key) return NextResponse.json({ ok:false, error:"server_no_key" }, { status: 500 });

  try {
    let url: string;
    let params: Record<string, string>;
    if (mode === "alt") {
      url = `https://${host}/api`;
      params = { api: "item_image_search", img: https(img) };
    } else {
      url = `https://${host}/item_image_search`;
      params = { img: https(img) };
    }

    const qs = new URLSearchParams(params).toString();
    const r = await fetch(`${url}?${qs}`, {
      headers: { "x-rapidapi-key": key, "x-rapidapi-host": host },
      cache: "no-store",
    });
    if (!r.ok) throw new Error(`rapidapi ${r.status}`);
    const j = await r.json();
    const data = j?.result?.item || j?.data || [];
    return NextResponse.json({ ok:true, items: normalize(data) });
  } catch (e:any) {
    return NextResponse.json({ ok:false, error:"rapid_fail", detail:String(e) }, { status: 502 });
  }
}
