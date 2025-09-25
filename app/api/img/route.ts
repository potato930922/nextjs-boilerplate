// app/api/img/route.ts
import { NextRequest, NextResponse } from 'next/server';

// 허용 도메인(와일드카드 끝매칭)
const ALLOW_SUFFIXES = [
  '.alicdn.com',        // img.alicdn.com, g.search1.alicdn.com ...
  '.alicdn.com.cn',
  '.pstatic.net',       // shop-phinf.pstatic.net 등
  '.alicdn.net',        // 일부 리전
];

function isAllowedHost(host: string) {
  const h = host.toLowerCase();
  return ALLOW_SUFFIXES.some(suf => h === suf.slice(1) || h.endsWith(suf));
}

export async function GET(req: NextRequest) {
  try {
    const u = req.nextUrl.searchParams.get('u');
    if (!u) {
      return NextResponse.json({ ok: false, error: 'missing_param_u' }, { status: 400 });
    }

    let target: URL;
    try {
      // 이미 인코딩된 값이 넘어오므로 그대로 URL 객체화 시도
      target = new URL(decodeURIComponent(u));
    } catch {
      // decode 실패하면 원문으로 시도
      try { target = new URL(u); } catch {
        return NextResponse.json({ ok: false, error: 'invalid_url' }, { status: 400 });
      }
    }

    if (target.protocol !== 'http:' && target.protocol !== 'https:') {
      return NextResponse.json({ ok: false, error: 'invalid_protocol' }, { status: 400 });
    }

    if (!isAllowedHost(target.hostname)) {
      return NextResponse.json({ ok: false, error: `host_not_allowed:${target.hostname}` }, { status: 400 });
    }

    const fetchRes = await fetch(target.toString(), {
      // 일부 CDN이 UA 없으면 403 내립니다
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36',
        'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
        'Accept-Language': 'ko,en;q=0.9',
        // Referer가 필요한 경우만 동작 — 보통 alicdn은 필요 X, Naver도 불필요
        // 'Referer': target.origin,
      },
      // Next 15 Edge 기본은 GET 캐시 가능
      cache: 'no-store', // 필요 시 'force-cache'로 바꿔도 됩니다(이미지 CDN 자체 캐시가 강함)
      // redirect: 'follow',
    });

    if (!fetchRes.ok) {
      return NextResponse.json(
        { ok: false, error: `upstream_${fetchRes.status}` },
        { status: fetchRes.status },
      );
    }

    // 컨텐츠 타입 전달
    const contentType = fetchRes.headers.get('content-type') ?? 'image/jpeg';
    const arrayBuf = await fetchRes.arrayBuffer();

    return new NextResponse(arrayBuf, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        // 앱 레벨 캐시 (원한다면 더 길게)
        'Cache-Control': 'public, max-age=86400, s-maxage=86400, immutable',
      },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? 'img_proxy_failed' }, { status: 500 });
  }
}
