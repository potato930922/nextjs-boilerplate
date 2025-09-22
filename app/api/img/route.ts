// app/api/img/route.ts
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function https(u: string) {
  if (!u) return '';
  return u.startsWith('//') ? 'https:' + u : u;
}
function refererFor(url: URL) {
  const h = url.hostname;
  if (h.includes('tmall.com')) return 'https://detail.tmall.com/';
  if (h.includes('taobao.com')) return 'https://item.taobao.com/';
  if (h.includes('alicdn.com')) return 'https://item.taobao.com/';
  // 기본값 – 굳이 우리 도메인을 넣지 말기
  return 'https://item.taobao.com/';
}

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get('u') || '';
  if (!raw) return new NextResponse('missing u', { status: 400 });

  try {
    const target = new URL(https(raw));

    const r = await fetch(target, {
      // 중요: 일부 CDN은 리퍼러가 없으면 403/500을 냄
      headers: {
        Referer: refererFor(target),
        // 이미지 요청처럼 보이도록 Accept 맞추기
        Accept: 'image/avif,image/webp,image/*,*/*;q=0.8',
        // 일부 CDN은 UA 체크함
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36',
        // 언어 헤더가 없어서 막는 경우 방지
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8,ko;q=0.7',
      },
      redirect: 'follow',
      cache: 'no-store',
    });

    if (!r.ok) {
      const text = await r.text().catch(() => '');
      return new NextResponse(
        `upstream_${r.status}${text ? `\n${text.slice(0, 200)}` : ''}`,
        { status: 502 }
      );
    }

    const ct = r.headers.get('content-type') || 'image/jpeg';
    const buf = await r.arrayBuffer();

    return new NextResponse(buf, {
      status: 200,
      headers: {
        'content-type': ct,
        // 너무 길게 캐시하면 디버깅 어려움
        'cache-control': 'public, max-age=600',
      },
    });
  } catch (e: any) {
    return new NextResponse(`proxy_error: ${e?.message || 'unknown'}`, { status: 500 });
  }
}
