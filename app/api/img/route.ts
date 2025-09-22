// app/api/img/route.ts
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

const toUrl = (u: string) => {
  const s = u?.trim() || '';
  if (!s) return '';
  if (s.startsWith('//')) return 'https:' + s;
  if (/^https?:\/\//i.test(s)) return s;
  if (/^[a-z0-9.-]+\//i.test(s)) return 'https://' + s;
  return s;
};

function refererCandidates(url: string) {
  try {
    const h = new URL(url).hostname;
    const refs: string[] = [];
    if (h.endsWith('tmall.com')) refs.push('https://detail.tmall.com/', 'https://item.taobao.com/');
    else if (h.endsWith('taobao.com')) refs.push('https://item.taobao.com/', 'https://detail.tmall.com/');
    else if (h.endsWith('alicdn.com')) refs.push('https://item.taobao.com/', 'https://detail.tmall.com/');
    else refs.push('https://item.taobao.com/');
    refs.push(''); // 마지막은 referer 없이
    return refs;
  } catch {
    return ['https://item.taobao.com/', ''];
  }
}

async function tryFetch(url: string, ref: string) {
  const headers: Record<string, string> = {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123 Safari/537.36',
    Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8,ko;q=0.7',
    'Sec-Fetch-Site': 'cross-site',
    'Sec-Fetch-Mode': 'no-cors',
    'Sec-Fetch-Dest': 'image',
  };
  if (ref) headers.Referer = ref;

  const controller = new AbortController();
  const to = setTimeout(() => controller.abort(), 12_000);
  try {
    const r = await fetch(url, { headers, cache: 'no-store', signal: controller.signal });
    return r;
  } finally {
    clearTimeout(to);
  }
}

export async function GET(req: NextRequest) {
  try {
    const raw = req.nextUrl.searchParams.get('u') || '';
    const debug = req.nextUrl.searchParams.get('debug') === '1';
    const url = toUrl(raw);
    if (!url) return new NextResponse('no url', { status: 400 });

    const referers = refererCandidates(url);
    let lastStatus = 0;
    let lastText = '';

    for (const ref of referers) {
      const r = await tryFetch(url, ref);
      lastStatus = r.status;
      if (r.ok) {
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
      }
      lastText = await r.text().catch(() => '');
    }

    if (debug) {
      return NextResponse.json(
        { ok: false, url, tried_referers: referers, status: lastStatus, body: lastText?.slice(0, 500) },
        { status: 502 }
      );
    }
    return new NextResponse('bad upstream', { status: 502 });
  } catch (e: any) {
    retur
