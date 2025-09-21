// app/api/img/route.ts
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

const https = (u: string) => (u?.startsWith('//') ? `https:${u}` : (u || ''));
const pickReferer = (u: string) =>
  u.includes('tmall') ? 'https://detail.tmall.com/' : 'https://item.taobao.com/';

export async function GET(req: NextRequest) {
  try {
    const u = req.nextUrl.searchParams.get('u') || '';
    if (!u) return new NextResponse('no url', { status: 400 });

    const url = https(u);
    const r = await fetch(url, {
      headers: { Referer: pickReferer(url) }, // 🔑 레퍼러 강제
      cache: 'no-store',
    });

    if (!r.ok) {
      const txt = await r.text().catch(() => '');
      return new NextResponse(`bad upstream: ${r.status}\n${txt}`, { status: 502 });
    }

    const ctype = r.headers.get('content-type') || 'image/jpeg';
    const buf = Buffer.from(await r.arrayBuffer());
    return new NextResponse(buf, { status: 200, headers: { 'Content-Type': ctype, 'Cache-Control': 'no-store' } });
  } catch (e: any) {
    return new NextResponse(e?.message || 'proxy_error', { status: 500 });
  }
}
