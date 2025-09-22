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
  out.pathname = out.pathname
    .replace(/^\/img\/bao\//i, '/bao/')
    .replace(/^\/imgextra\/?/i, '/imgextra/');
  return out;
}
async function fetchImage(url: URL) {
  return fetch(url, {
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
}

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get('u') || '';
  if (!raw) return new NextResponse('missing u', { status: 400 });

  const normalized = toHttps(safeDecode(raw));
  let url: URL;
  try {
    url = new URL(normalized);
  } catch {
    return new NextResponse('bad url', { status: 400 });
  }

  try {
    // 1) 원본
    let r = await fetchImage(url);

    // 2) g.search*면 미러 폴백
    if (!r.ok && isGSearch(url.hostname)) {
      const r1 = await fetchImage(tryMirror(url, 'img'));
      if (r1.ok) r = r1;
      else {
        const r2 = await fetchImage(tryMirror(url, 'gw'));
        if (r2.ok) r = r2;
        else r = r1;
      }
    }

    if (r.ok) {
      const ct = r.headers.get('content-type') || 'image/jpeg';
      return new NextResponse(r.body, {
        status: 200,
        headers: { 'content-type': ct, 'cache-control': 'public, max-age=600' },
      });
    }

    // 3) 마지막 폴백: weserv 프록시로 리다이렉트 (클라이언트가 직접 받음)
    const hostPathQuery = url.hostname + url.pathname + (url.search || '');
    const weserv = 'https://images.weserv.nl/?url=' + encodeURIComponent(hostPathQuery);
    return NextResponse.redirect(weserv, 302);

  } catch (e: any) {
    // fetch 자체가 실패해도 weserv로 리다이렉트
    const hostPathQuery = url.hostname + url.pathname + (url.search || '');
    const weserv = 'https://images.weserv.nl/?url=' + encodeURIComponent(hostPathQuery);
    return NextResponse.redirect(weserv, 302);
  }
}
