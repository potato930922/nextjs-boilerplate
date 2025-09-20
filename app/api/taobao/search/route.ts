// app/api/taobao/search/route.ts
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type Item = {
  img_url: string;
  promo_price: number | null;
  price: number | null;
  sales: string | null;
  seller: string | null;
  detail_url: string;
};

const HOST = "taobao-advanced.p.rapidapi.com";
const URL_LOW = `https://${HOST}/item_image_search`; // 저지연만 사용

const KEY_LOW = process.env.RAPIDAPI_TAOBAO_KEY_LOW || ""; // ✅ 환경변수 이름 복구

const https = (u: string) => (u?.startsWith("//") ? "https:" + u : u || "");

const toNum = (v: any): number | null => {
  if (v === null || v === undefined || v === "" || v === "null") return null;
  const n = Number(String(v).replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? n : null;
};

function normalize(data: any[]): Item[] {
  const items = (data || []).slice(0, 8).map((i: any) => ({
    img_url: https(i?.pic ?? i?.pic_url ?? i?.pict_url ?? i?.image ?? i?.img ?? ""),
    promo_price: toNum(i?.promotion_price ?? i?.promo_price ?? i?.zk_final_price),
    price: toNum(i?.price ?? i?.reserve_price ?? i?.orgPrice ?? i?.view_price),
    sales: (i?.sales ?? i?.view_sales ?? i?.volume ?? null) ? String(i?.sales ?? i?.view_sales ?? i?.volume) : null,
    seller: i?.seller_nick ?? i?.nick ?? i?.shop_title ?? null,
    detail_url: https(
      i?.detail_url ??
        i?.url ??
        i?.detailUrl ??
        i?.item_url ??
        (i?.num_iid ? `https://item.taobao.com/item.htm?id=${i.num_iid}` : "")
    ),
  }));

  while (items.length < 8) {
    items.push({ img_url: "", promo_price: null, price: null, sales: null, seller: null, detail_url: "" });
  }
  return items;
}

export async function POST(req: NextRequest) {
  try {
    const { img } = (await req.json()) as { img: string; mode?: "low" | "alt" };

    if (!img) {
      return NextResponse.json({ ok: false, error: "img_required" }, { status: 400, headers: { "Cache-Control": "no-store" } });
    }
    if (!KEY_LOW) {
      return NextResponse.json({ ok: false, error: "no_low_key" }, { status: 500, headers: { "Cache-Control": "no-store" } });
    }

    const params = new URLSearchParams({ img: https(img) });
    const r = await fetch(`${URL_LOW}?${params.toString()}`, {
      method: "GET",
      headers: {
        "X-RapidAPI-Key": KEY_LOW,    // ✅ 대문자 헤더
        "X-RapidAPI-Host": HOST,
        "Accept": "application/json",
        "User-Agent": "dalae-taobao/1.0",
      },
      cache: "no-store",
      redirect: "follow",
    });

    if (!r.ok) {
      const text = await r.text();
      return NextResponse.json(
        { ok: false, error: `upstream_${r.status}`, detail: text.slice(0, 2000) },
        { status: 502, headers: { "Cache-Control": "no-store" } }
      );
    }

    const j = await r.json();
    const raw = j?.result?.item ?? j?.data ?? [];
    const items = normalize(raw);

    return NextResponse.json({ ok: true, items }, { status: 200, headers: { "Cache-Control": "no-store" } });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "proxy_error" },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
