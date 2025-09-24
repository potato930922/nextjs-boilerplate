// app/api/img/route.ts
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import sharp from 'sharp';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic'; // node runtime 보장

const BUCKET = process.env.SUPABASE_STORAGE_BUCKET_THUMBS || 'thumbs';

function https(u: string) {
  if (!u) return '';
  return u.startsWith('//') ? 'https:' + u : u;
}
function sha256(buf: Buffer) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

async function fetchAndStoreThumb(srcUrl: string) {
  // 1) 원본 가져오기
  const res = await fetch(srcUrl, { cache: 'no-store' });
  if (!res.ok) throw new Error(`fetch_${res.status}`);
  const ab = await res.arrayBuffer();
  const input = Buffer.from(ab);

  // 2) 320px webp 썸네일
  const webp = await sharp(input)
    .resize({ width: 320, withoutEnlargement: true })
    .webp({ quality: 78 })
    .toBuffer();

  // 3) 중복 방지 키
  const hash = sha256(webp);
  const key = `thumbs/${hash}.webp`;

  // 4) 이미 있으면 업로드 생략
  const listed = await supabaseAdmin.storage.from(BUCKET).list('thumbs', { search: `${hash}.webp` });
  const exists = listed.data?.some(f => f.name === `${hash}.webp`);
  if (!exists) {
    const up = await supabaseAdmin.storage.from(BUCKET).upload(key, webp, {
      contentType: 'image/webp',
      upsert: true,
    });
    if (up.error) throw new Error(up.error.message);
  }

  // 5) 공개 URL
  const pub = supabaseAdmin.storage.from(BUCKET).getPublicUrl(key);
  const url = pub.data?.publicUrl;
  if (!url) throw new Error('no_public_url');

  return url;
}

export async function GET(req: NextRequest) {
  const u = req.nextUrl.searchParams.get('u') || '';
  const store = req.nextUrl.searchParams.get('store') === '1';
  if (!u) {
    return NextResponse.json({ ok: false, error: 'no_url' }, { status: 400 });
  }
  const url = https(u);

  if (store) {
    try {
      const out = await fetchAndStoreThumb(url);
      return NextResponse.json({ ok: true, url: out });
    } catch (e: any) {
      return NextResponse.json({ ok: false, error: e?.message || 'store_failed' }, { status: 502 });
    }
  }

  // 단순 프록시 (거의 사용하지 않지만 보존)
  try {
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) {
      const t = await r.text().catch(() => '');
      return NextResponse.json({ ok: false, error: `upstream_${r.status}`, detail: t.slice(0, 200) }, { status: 502 });
    }
    const ab = await r.arrayBuffer();
    return new NextResponse(ab, {
      status: 200,
      headers: { 'content-type': r.headers.get('content-type') || 'image/jpeg' },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: 'proxy_error' }, { status: 502 });
  }
}
