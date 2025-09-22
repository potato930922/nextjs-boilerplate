// app/api/img/route.ts
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const u = req.nextUrl.searchParams.get('u') || '';
  if (!u) return new NextResponse('missing u', { status: 400 });

  try {
    const upstream = await fetch(u, {
      // referrer/headers를 숨겨야 알리/타오바오가 허용
      headers: {
        // 최소 헤더만; 필요 시 UA 정도만 흉내
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36',
      },
      cache: 'no-store',
    });

    if (!upstream.ok) {
      return new NextResponse(`upstream ${upstream.status}`, { status: 502 });
    }

    // 원본 content-type 유지
    const ct = upstream.headers.get('content-type') || 'image/jpeg';
    const arr = new Uint8Array(await upstream.arrayBuffer());

    return new NextResponse(arr, {
      status: 200,
      headers: {
        'content-type': ct,
        'cache-control': 'public, max-age=600', // 적당 캐시
      },
    });
  } catch (e: any) {
    return new NextResponse('proxy_error', { status: 500 });
  }
}
