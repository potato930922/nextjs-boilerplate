// app/api/img/route.ts
import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  try {
    const src = req.nextUrl.searchParams.get('src') || '';
    if (!src) return NextResponse.json({ ok: false, error: 'no_src' }, { status: 400 });

    const url = src.startsWith('//') ? 'https:' + src : src;
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) return NextResponse.json({ ok: false, error: `up_${r.status}` }, { status: 502 });

    const buf = Buffer.from(await r.arrayBuffer());
    const ct = r.headers.get('content-type') || 'image/jpeg';
    return new NextResponse(buf, { status: 200, headers: { 'content-type': ct, 'cache-control': 'no-store' } });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? 'img_proxy_error' }, { status: 500 });
  }
}
