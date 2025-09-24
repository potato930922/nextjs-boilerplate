// lib/imageStore.ts
import crypto from 'crypto';
import sharp from 'sharp';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

const BUCKET = process.env.SUPABASE_STORAGE_BUCKET_THUMBS || 'thumbs';

// 동일 URL 여러 번 저장하지 않도록 SHA-256 해시로 키 생성
function sha256(buf: Buffer) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

export type StoreResult = {
  ok: true;
  url: string;      // 공개 접근 가능한 Storage URL
  key: string;      // thumbs/<hash>.webp
} | { ok: false; error: string };

export async function fetchAndStoreThumb(srcUrl: string): Promise<StoreResult> {
  try {
    const res = await fetch(srcUrl, { cache: 'no-store' });
    if (!res.ok) return { ok: false, error: `fetch_${res.status}` };

    const ab = await res.arrayBuffer();
    const buf = Buffer.from(ab);

    // 포맷/크기 표준화 (작고 빠른 썸네일)
    const webp = await sharp(buf).resize({ width: 320, withoutEnlargement: true })
      .webp({ quality: 78 }).toBuffer();

    const hash = sha256(webp);
    const key = `thumbs/${hash}.webp`;

    // 이미 존재하면 업로드 생략
    const head = await supabaseAdmin.storage.from(BUCKET).list('thumbs', { search: `${hash}.webp` });
    const exists = head.data?.some(f => f.name === `${hash}.webp`);
    if (!exists) {
      const up = await supabaseAdmin.storage.from(BUCKET).upload(key, webp, {
        contentType: 'image/webp',
        upsert: true,
      });
      if (up.error) return { ok: false, error: up.error.message };
    }

    // 공개 URL (Public bucket 권장)
    const pub = supabaseAdmin.storage.from(BUCKET).getPublicUrl(key);
    if (!pub.data?.publicUrl) return { ok: false, error: 'no_public_url' };

    return { ok: true, url: pub.data.publicUrl, key };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'store_failed' };
  }
}
