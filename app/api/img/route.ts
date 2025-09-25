// app/api/img/route.ts  (undici 없이 동작 버전)
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOW_SUFFIXES = [
  '.alicdn.com',
  '.alicdn.com.cn',
  '.alicdn.net',
  '.pstatic.net',
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

async function fetchOrigin(u: URL) {
  const referer = guessReferer(u.hostname);
  return await fetch(u.toString(), {
    redirect: 'follow',
    headers: {
      'User-Agent': UA,
      'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
      'Accept-Language': 'ko,en;q=0.9',
      ...(referer ? { Referer: referer } : {}),
    },
  });
}

async function fetchViaWeserv(u: URL) {
  const hostAndPath = `${u.hostname}${u.pathname}${u.search || ''}`;
  const proxy = `https://images.weserv.nl/?url=${encodeURIComponent(hostAndPath)}`;
  return await fetch(proxy, {
    headers: { 'User-Agent': UA, 'Accept': 'image/*,*/*;q=0.8' },
  });
}

export async function GET(req: NextRequest) {
  try {
    const raw = req.nextUrl.searchParams.get('u');
    if (!raw) return NextResponse.json({ ok: false, error: 'missing_param_u' }, { status: 400 });

    let url: URL;
    try {
      try { url = new URL(decodeURIComponent(raw)); }
      catch { url = new URL(raw); }
    } catch {
      return NextResponse.json({ ok: false, error: 'invalid_url' }, { status: 400 });
    }

    if (!['http:', 'https:'].includes(url.protocol))
      return NextResponse.json({ ok: false, error: 'invalid_protocol' }, { status: 400 });

    if (!isAllowedHost(url.hostname))
      return NextResponse.json({ ok: false, error: `host_not_allowed:${url.hostname}` }, { status: 400 });

    // 1차: 원본 시도
    try {
      const r1 = await fetchOrigin(url);
      if (r1.ok) {
        const type = r1.headers.get('content-type') ?? 'image/jpeg';
        const buf = Buffer.from(await r1.arrayBuffer());
        return new NextResponse(buf, {
          headers: {
            'Content-Type': type,
            'Cache-Control': 'public, max-age=86400, s-maxage=86400, immutable',
          },
        });
      } else {
        const body = await r1.text().catch(() => '');
        return NextResponse.json(
          { ok: false, error: `upstream_${r1.status}`, detail: body.slice(0, 200) },
          { status: r1.status }
        );
      }
    } catch (e: any) {
      // 2차: weserv 폴백
      try {
        const r2 = await fetchViaWeserv(url);
        if (!r2.ok) {
          const t = await r2.text().catch(() => '');
          return NextResponse.json(
            { ok: false, error: `weserv_${r2.status}`, detail: t.slice(0, 200) },
            { status: r2.status }
          );
        }
        const type = r2.headers.get('content-type') ?? 'image/jpeg';
        const buf = Buffer.from(await r2.arrayBuffer());
        return new NextResponse(buf, {
          headers: {
            'Content-Type': type,
            'Cache-Control': 'public, max-age=86400, s-maxage=86400, immutable',
          },
        });
      } catch (e2: any) {
        return NextResponse.json(
          { ok: false, error: 'fetch failed', reason: e?.message, fallback: e2?.message },
          { status: 500 }
        );
      }
    }
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? 'img_proxy_failed' }, { status: 500 });
  }
}
