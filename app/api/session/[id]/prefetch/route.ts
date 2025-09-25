// app/api/session/[id]/prefetch/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import crypto from 'crypto';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { verifyToken } from '@/lib/auth';
import { ParamCtx, getParam, getToken } from '@/lib/route15';

const HOST = 'taobao-advanced.p.rapidapi.com';
const URL_LOW = `https://${HOST}/item_image_search`;

function https(u: string) {
  if (!u) return '';
  return u.startsWith('//') ? 'https:' + u : u;
}
function toNum(v: any): number | null {
  if (v === null || v === undefined || v === '' || v === 'null') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function normalize(data: any[]) {
  const items = (data || []).slice(0, 8).map((i: any) => ({
    img_url: https(i?.pic || ''),
    promo_price: toNum(i?.promotion_price),
    price: toNum(i?.price),
    sales: i?.sales ?? null,
    seller: i?.seller_nick ?? null,
    detail_url: https(i?.detail_url || ''),
  }));
  while (items.length < 8) items.push({ img_url: '', promo_price: null, price: null, sales: null, seller: null, detail_url: '' });
  return items;
}

async function taobaoSearch(imgUrl: string): Promise<ReturnType<typeof normalize>> {
  const key = process.env.RAPIDAPI_KEY_LOW || process.env.RAPIDAPI_TAOBAO_KEY_LOW || '';
  if (!key) throw new Error('no_rapidapi_key');

  const u = new URL(URL_LOW);
  u.searchParams.set('img', https(imgUrl));

  const r = await fetch(u, {
    method: 'GET',
    headers: {
      'x-rapidapi-key': key,
      'x-rapidapi-host': HOST,
    },
    cache: 'no-store',
  });
  if (!r.ok) {
    const t = await r.text().catch(() => '');
    throw new Error(`rapidapi_${r.status}:${t.slice(0, 200)}`);
  }
  const j = await r.json();
  const raw = j?.result?.item ?? j?.data ?? [];
  return normalize(raw);
}

export async function POST(req: NextRequest, context: ParamCtx<'id'>) {
  const sessionId = await getParam(context, 'id');

  try {
    // 인증
    const token = await getToken('s_token'); // ✅
    const payload = verifyToken(token);
    if (!payload || payload.session_id !== sessionId) {
      return NextResponse.json({ ok: false, error: 'unauth' }, { status: 401 });
    }

    // rows 읽기
    const { data: rows, error } = await supabaseAdmin
      .from('rows')
      .select('row_id, src_img_url')
      .eq('session_id', sessionId)
      .order('order_no');
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    // 후보 테이블 정리
    const rowIds = (rows ?? []).map(r => r.row_id);
    if (rowIds.length) {
      await supabaseAdmin.from('candidates').delete().in('row_id', rowIds);
    }

    // 병렬(적당한 동시성: 4)
    const CONC = 4;
    let processed = 0;

    async function workOne(row: { row_id: number; src_img_url: string | null }) {
      const img = row.src_img_url || '';
      if (!img) return;

      const items = await taobaoSearch(img);
      if (items?.length) {
        await supabaseAdmin.from('candidates').insert(
          items.map((it, idx) => ({ row_id: row.row_id, idx, ...it }))
        );
      }
      processed++;
      // 진행률 업데이트(옵션)
      await supabaseAdmin
        .from('sessions')
        .update({ progress: processed }) // 세션 테이블에 progress 칼럼이 있을 때만
        .eq('session_id', sessionId);
    }

    const queue = [...(rows ?? [])];
    const runners: Promise<void>[] = [];
    for (let i = 0; i < CONC; i++) {
      runners.push((async () => {
        while (queue.length) {
          const r = queue.shift()!;
          try { await workOne(r); } catch { /* ignore */ }
        }
      })());
    }
    const start = Date.now();
    await Promise.all(runners);
    const dur = Date.now() - start;

    return NextResponse.json({ ok: true, processed, dur_ms: dur });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? 'prefetch_failed' }, { status: 500 });
  }
}
