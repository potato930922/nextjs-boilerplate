// app/api/proxy/route.ts
import { NextRequest } from "next/server";

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("img");
  if (!url) return new Response("img required", { status: 400 });

  try {
    const r = await fetch(url.startsWith("//") ? "https:" + url : url, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        // referer 필요 사이트 대비
        Referer: url.includes("tmall") ? "https://detail.tmall.com/" : "https://item.taobao.com/",
        Accept: "image/*;q=0.8",
      },
    });
    if (!r.ok) return new Response("upstream " + r.status, { status: 502 });

    const buf = await r.arrayBuffer();
    const ct = r.headers.get("content-type") || "image/jpeg";
    // 브라우저 캐시 살짝
    return new Response(buf, {
      headers: {
        "content-type": ct,
        "cache-control": "public, max-age=600",
      },
    });
  } catch (e: any) {
    return new Response("proxy_error", { status: 500 });
  }
}
