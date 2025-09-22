import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function safeDecode(u: string) {
  try { return decodeURIComponent(u); } catch { return u; }
}
function toHttps(u: string) {
  if (!u) return '';
  const s = u.trim();
  if (s.startsWith('//')) return 'https:' + s;
  if (/^https?:\/\//i.test(s)) return s.replace(/^http:\/\//i, 'https://');
  return 'https://' + s;
}
function pickReferer(hostname: string) {
  if (hostname.includes('tmall.com')) return 'https://detail.tmall.com/';
  if (hostname.includes('taobao.com')) return 'https://item.taobao.com/';
  if (hostname.includes('alicdn.com')) return 'https://item.taobao.com/';
  return 'https://item.taobao.com/';
}
function isGSearch(host: string) {
  return /^g\.search\d?\.alicdn\.com$/i.test(host);
}
function tryMirror(u: URL, which: 'img'|'gw'): URL {
  const mirror = which === 'img' ? 'img.alicdn.com' : 'gw.alicdn.com';
  const out = new URL(u.toString());
  out.hostname = mirror;

  // g.search*.alicdn.com 경로는 보통 /img/bao/uploaded/... 구조.
  // 미러는 /imgextra 또는 /bao/uploaded 모두에 존재하는 경우가 있어서 순서 그대로 둡니다.
  // 별도 치환이 필요한 경우 최소 치환만 시도:
  out.pathname = out.pathname
    .replace(/^\/img\/bao\//i, '/bao/')      // /img/bao/ → /bao/
    .replace(/^\/imgextra\/?/i, '/imgextra/');

  return out;
}

async function fetchImage(url: URL) {
  const r = await fetch(url, {
    redirect: 'follow',
    headers: {
      Referer: pickReferer(url.hostname),
      Accept: 'image/avif,image/webp,image/*,*/*;q=0.8',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8,ko;q=0.7',
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36',
    },
    cache: 'no-store',
  });
  return r;
}

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get('u') || '';
  if (!raw) return new NextResponse('missing u', { status: 400 });

  try {
    const normalized = toHttps(safeDecode(raw));
    let url = new URL(normalized);

    // 1차: 원본 시도
    let r = await fetchImage(url);

    // g.search*.alicdn.com 가 403/5xx 또는 TLS 이슈 등으로 실패하면 폴백
    if (!r.ok && isGSearch(url.hostname)) {
      // 2차: img.alicdn.com
      const m1 = tryMirror(url, 'img');
      const r1 = await fetchImage(m1);
      if (r1.ok) r = r1;
      else {
        // 3차: gw.alicdn.com
        const m2 = tryMirror(url, 'gw');
        const r2 = await fetchImage(m2);
        if (r2.ok) r = r2;
        else r = r1; // 마지막 실패 응답 유지
      }
    }

    if (!r.ok) {
      const text = await r.text().catch(() => '');
      return new NextResponse(
        `upstream_${r.status} ${url.hostname}\n${text.slice(0, 300)}`,
        { status: 502 }
      );
    }

    const ct = r.headers.get('content-type') || 'image/jpeg';
    return new NextResponse(r.body, {
      status: 200,
      headers: {
        'content-type': ct,
        'cache-control': 'public, max-age=600',
      },
    });
  } catch (e: any) {
    return new NextResponse(
      `proxy_error: ${e?.message || String(e)}`.slice(0, 400),
      { status: 500 }
    );
  }
}
