// app/api/img/route.ts
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function safeDecode(u: string) {
  try { return decodeURIComponent(u); } catch { return u; }
}
function toHttps(u: string) {
  if (!u) return '';
  const s = u.trim();
  if (!s) return '';
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

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get('u') || '';
  if (!raw) return new NextResponse('missing u', { status: 400 });

  try {
    // URL 보정 (이중 인코딩/스킴 누락 방지)
    const normalized = toHttps(safeDecode(raw));
    const target = new URL(normalized);

    const r = await fetch(target, {
      redirect: 'follow',
      // 일부 CDN이 Referer/UA/Accept-Language 없으면 차단
      headers: {
        Referer: pickReferer(target.hostname),
        Accept: 'image/avif,image/webp,image/*,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8,ko;q=0.7',
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36',
      },
      cache: 'no-store',
    });

    if (!r.ok) {
      // 업스트림 사유를 그대로 보여줘서 디버깅 쉽게
      const text = await r.text().catch(() => '');
      return new NextResponse(
        `upstream_${r.status}${text ? `\n${text.slice(0, 300)}` : ''}`,
        { status: 502 }
      );
    }

    // ✅ 스트리밍으로 바로 전송 (arrayBuffer 사용 안 함)
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
