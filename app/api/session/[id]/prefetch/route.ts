// app/api/session/[id]/prefetch/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyToken } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

// 런타임/캐시 정책
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

type CandidateItem = {
  idx: number;
  img_url: string;
  detail_url: string;
  price: number | null;
  promo_price: number | null;
  sales: string | null;
  seller: string | null;
};

const HOST = 'taobao-advanced.p.rapidapi.com';
const URL_LOW = `https://${HOST}/item_image_search`;
const KEY_LOW = process.env.RAPIDAPI_TAOBAO_KEY_LOW || '';

const https = (u: string): string =>
  u ? (u.startsWith('//') ? `https:${u}` : u) : '';

const toNum = (v: unknown): number | null => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (!s || s === 'null') return null;
  const n = Number(s.replace(/[^\d.]/g, ''));
  return Number.isFinite(n) ? n : null;
};

function normalize(raw: unknown): CandidateItem[] {
  const arr = Array.isArray(raw) ? raw.slice(0, 8) : [];

  const items: CandidateItem[] = arr.map((i: any, idx: number) => ({
    idx,
    img_url: https(i?.pic ?? i?.pic_url ?? i?.pict_url ?? i?.image ?? i?.img ?? ''),
    detail_url: https(
      i?.detail_url ??
        i?.url ??
        i?.detailUrl ??
        i?.item_url ??
        (i?.num_iid ? `https://item.taobao.com/item.htm?id=${i.num_iid}` : '')
    ),
    price: toNum(i?.price ?? i?.reserve_price ?? i?.orgPrice ?? i?.view_price),
    promo_price: toNum(i?.promotion_price ?? i?.promo_price ?? i?.zk_final_price),
    sales: (i?.sales ?? i?.view_sales ?? i?.volume ?? null)
      ? String(i?.sales ?? i?.view_sales ?? i?.volume)
      : null,
    seller: i?.seller_nick ?? i?.nick ?? i?.shop_title ?? null,
  }));

  while (items.length < 8) {
    items.push({
      idx: items.length,
      img_url: '',
      detail_url: '',
      price: null,
      promo_price: null,
      sales: null,
      seller: null,
    });
  }
  return items;
}

async function searchTaobaoLow(img: string): Promise<CandidateItem[]> {
  if (!KEY_LOW) throw new Error('no_low_key');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);

  try {
    const u = new URL(URL_LOW);
    u.searchParams.set('img', https(img));

    const r = await fetch(u, {
      method: 'GET',
      headers: {
        'X-RapidAPI-Key': KEY_LOW,
        'X-RapidAPI-Host': HOST,
        'Accept': 'application/json',
        'User-Agent': 'dalae-taobao/1.0',
      },
      cache: 'no-store',
      redirect: 'follow',
      signal: controller.signal,
    });

    if (!r.ok) {
      const text = await r.text().catch(() => '');
      throw new Error(`upstream_${r.status}:${text.slice(0, 200)}`);
    }

    const j = await r.json();
    const raw = j?.result?.item ?? j?.data ?? [];
    return normalize(raw);
  } finally {
    clearTimeout(timer);
  }
}

// ✅ 프로젝트 타입 규칙: params는 Promise로 전달됨
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<Response> {
  const started = Date.now();

  try {
    const { id: sessionId } = await context.params;

    // ✅ 이 프로젝트에선 cookies()가 Promise 타입이므로 await 필요
    const cookieStore = await cookies();
    const token = cookieStore.get('s_token')?.value;

    const payload = verifyToken(token);
    if (!payload || payload.session_id !== sessionId) {
      return NextResponse.json({ ok: false, error: 'unauth' }, { status: 401 });
    }

    // rows 조회
    const { data: rows, error } = await supabaseAdmin
      .from('rows')
      .select('row_id, src_img_url')
      .eq('session_id', sessionId)
      .order('order_no');

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    let processed = 0;

    for (const row of rows ?? []) {
      const img = row.src_img_url ?? '';
      if (!img) continue;

      // 기존 후보 삭제
      await supabaseAdmin.from('candidates').delete().eq('row_id', row.row_id);

      // Taobao 이미지 서치 (low 전용)
      const items = await searchTaobaoLow(img);

      if (items.length) {
        // candidates 테이블: row_id, idx, img_url, detail_url, price, promo_price, sales, seller
        await supabaseAdmin.from('candidates').insert(
          items.map((it) => ({ row_id: row.row_id, ...it }))
        );
      }

      processed += 1;

      // 과도 호출 방지(필요 시 조정)
      await new Promise((r) => setTimeout(r, 250));
    }

    return NextResponse.json(
      { ok: true, session_id: sessionId, processed, dur_ms: Date.now() - started },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? 'prefetch_error' },
      { status: 500 }
    );
  }
}
