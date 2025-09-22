// app/api/img/route.ts
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

const https = (u: string) => (u?.startsWith('//') ? `https:${u}` : (u || ''));

function pickReferer(url: string) {
  try {
    const h = new URL(url).hostname;
    if (h.endsWith('tmall.com')) return 'https://detail.tmall.com/';
    if (h.endsWith('taobao.com')) return 'https://item.taobao.com/';
    if (h.endsWith('alicdn.com')) return 'https://item.taobao.com/'; // 알리 CDN은 보통 타오바오 리퍼러 허용
    return 'https://item.taobao.com/';
  } catch {
    return 'https://item.taobao.com/';
  }
}

export async function GET(req: NextRequest) {
  try {
    const u = req.nextUrl.searchParams.get('u') || '';
    if (!u) return new NextResponse('no url', { status: 400 });

    const url = https(u);
    const r = await fetch(url, {
      headers: {
        Referer: pickReferer(url),
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123 Safari/537.36',
        Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
      },
      cache: 'no-store',
    });

    if (!r.ok) {
      const txt = await r.text().catch(() => '');
      return new NextResponse(`bad upstream: ${r.status}\n${txt}`, { status: 502 });
    }

    const ctype = r.headers.get('content-type') || 'image/jpeg';
    const buf = Buffer.from(await r.arrayBuffer());
    return new NextResponse(buf, {
      status: 200,
      headers: {
        'Content-Type': ctype,
        'Cache-Control': 'no-store',
        'Content-Disposition': 'inline',
      },
    });
  } catch (e: any) {
    return new NextResponse(e?.message || 'proxy_error', { status: 500 });
  }
}
