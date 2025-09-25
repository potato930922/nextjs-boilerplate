// app/api/img/route.ts
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs'; // ✅ 엣지 대신 Node.js로

// 허용 도메인(후행 일치)
const ALLOW_SUFFIXES = [
  '.alicdn.com',
  '.alicdn.com.cn',
  '.alicdn.net',
  '.pstatic.net',        // shop-phinf.pstatic.net 등
  '.pstatp.com',         // 혹시 사용중이면
];

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36';

function isAllowedHost(host: string) {
  const h = host.toLowerCase();
  return ALLOW_SUFFIXES.some(s => h === s.slice(1) || h.endsWith(s));
}

function guessReferer(host: string) {
  if (host.endsWith('.pstatic.net')) return 'https://shopping.naver.com/';
  if (host.endsWith('.alicdn.com') || host.endsWith('.alicdn.com.cn') || host.endsWith('.alicdn.net')) {
    return 'https://www.aliexpress.com/';
  }
  return undefined;
}

export async function GET(req: NextRequest) {
  try {
    const raw = req.nextUrl.searchParams.get('u');
    if (!raw) return NextResponse.json({ ok: false, error: 'missing_param_u' }, { status: 400 });

    let url: URL;
    try {
      // decodeURIComponent 로 들어오거나 이미 인코딩된 경우 모두 수용
      try { url = new URL(decodeURIComponent(raw)); }
      catch { url = new URL(raw); }
    } catch {
      return NextResponse.json({ ok: false, error: 'invalid_url' }, { status: 400 });
    }

    if (!['http:', 'https:'].includes(url.protocol))
      return NextResponse.json({ ok: false, error: 'invalid_protocol' }, { status: 400 });

    if (!isAllowedHost(url.hostname))
      return NextResponse.json({ ok: false, error: `host_not_allowed:${url.hostname}` }, { status: 400 });

    const referer = guessReferer(url.hostname);
    const res = await fetch(url.toString(), {
      redirect: 'follow',
      headers: {
        'User-Agent': UA,
        'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
        'Accept-Language': 'ko,en;q=0.9',
        ...(referer ? { Referer: referer } : {}),
      },
    });

    if (!res.ok) {
      // 상류 상태코드 그대로 전달 + 이유 기입
      const text = await res.text().catch(() => '');
      return NextResponse.json(
        { ok: false, error: `upstream_${res.status}`, detail: text.slice(0, 200) },
        { status: res.status }
      );
    }

    const type = res.headers.get('content-type') ?? 'image/jpeg';
    const buf = Buffer.from(await res.arrayBuffer());
    return new NextResponse(buf, {
      headers: {
        'Content-Type': type,
        'Cache-Control': 'public, max-age=86400, s-maxage=86400, immutable',
      },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? 'img_proxy_failed' }, { status: 500 });
  }
}
