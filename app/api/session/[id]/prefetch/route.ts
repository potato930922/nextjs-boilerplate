// app/api/session/[id]/prefetch/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyToken } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

const HOST = 'taobao-advanced.p.rapidapi.com';
const URL_LOW = `https://${HOST}/item_image_search`;
const KEY_LOW = process.env.RAPIDAPI_TAOBAO_KEY_LOW || '';

const https = (u: string) => (u?.startsWith('//') ? `https:${u}` : (u || ''));

const toNum = (v: any): number | null => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (!s || s === 'null') return null;
  const n = Number(s.replace(/[^\d.]/g, ''));
  return Number.isFinite(n) ? n : null;
};

type Cand = {
  idx: number;
  img_url: string;
  detail_url: string;
  price: number | null;
  promo_price: number | null;
  sales: string | null;
  seller: string | null;
};

// 다양한 응답 스키마를 흡수
function pickList(j: any): any[] {
  if (!j || typeof j !== 'object') return [];
  return (
    j?.result?.items ??
    j?.result?.item ??
    j?.data?.items ??
    j?.data ??
    j?.items ??
    []
  );
}

function normalize(raw: any): Cand[] {
  const arr = Array.isArray(raw) ? raw.slice(0, 8) : [];
  const items = arr.map((i: any, idx: number) => {
    const img =
      i?.pic ?? i?.pic_url ?? i?.pict_url ?? i?.image ?? i?.img ?? (Array.isArray(i?.small_images) ? i.small_images[0] : '');
    const detail =
      i?.detail_url ?? i?.url ?? i?.detailUrl ?? i?.item_url ??
      (i?.num_iid ? `https://item.taobao.com/item.htm?id=${i.num_iid}` : '');
    const promo =
      i?.promotion_price ?? i?.promo_price ?? i?.zk_final_price;
    const price =
      i?.price ?? i?.reserve_price ?? i?.orgPrice ?? i?.view_price ?? promo;

    const sales =
      i?.sales ?? i?.view_sales ?? i?.volume ?? i?.sold ?? i?.sold_quantity ?? null;
    const seller = i?.seller_nick ?? i?.nick ?? i?.seller ?? i?.shop_title ?? null;

    return {
      idx,
      img_url: https(String(img || '')),
      detail_url: https(String(detail || '')),
      price: toNum(price),
      promo_price: toNum(promo),
      sales: sales ? String(sales) : null,
      seller: seller ? String(seller) : null,
    };
  });

  // 빈 슬롯 보충(프론트 렌더 안정성)
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

async function taobaoLow(img: string) {
  const u = new URL(URL_LOW);
  u.searchParams.set('img', https(img));
  const r = await fetch(u, {
    headers: {
      'X-RapidAPI-Key': KEY_LOW,
      'X-RapidAPI-Host': HOST,
      'Accept': 'application/json',
      'User-Agent': 'dalae-taobao/1.0',
    },
    cache: 'no-store',
  });
  const text = await r.text();
  if (!r.ok) {
    throw new Error(`upstream_${r.status}:${text.slice(0, 300)}`);
  }
  // parse 후 꼭 list 길이 확인
  let j: any = {};
  try { j = JSON.parse(text); } catch { j = {}; }
  const list = pickList(j);
  return { list, raw: j, text: text.slice(0, 5000) };
}

// 프로젝트 타입: params, cookies 둘 다 Promise
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id: sessionId } = await ctx.params;

  // 인증
  const store = await cookies();
  const token = store.get('s_token')?.value;
  const payload = verifyToken(token);
  if (!payload || payload.session_id !== sessionId) {
    return NextResponse.json({ ok: false, error: 'unauth' }, { status: 401 });
  }

  if (!KEY_LOW) {
    return NextResponse.json({ ok: false, error: 'no_low_key' }, { status: 500 });
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
  let withCandidates = 0;
  const debugSamples: any[] = []; // 각 row마다 상위 1개만 디버그 기록

  for (const row of rows ?? []) {
    const img = row.src_img_url ?? '';
    if (!img) continue;

    // 기존 후보 삭제(실패 시 즉시 리턴해서 원인 파악)
    const del = await supabaseAdmin.from('candidates').delete().eq('row_id', row.row_id);
    if (del.error) {
      return NextResponse.json({ ok: false, error: 'cand_delete_failed', detail: del.error.message }, { status: 500 });
    }

    try {
      const { list, raw, text } = await taobaoLow(img);
      const items = normalize(list)
        // 완전 빈 레코드는 삽입하지 않음(적어도 하나는 있어야 카드가 의미)
        .filter((it) => it.img_url || it.detail_url);

      if (items.length) {
        const ins = await supabaseAdmin.from('candidates').insert(
          items.map((it) => ({ row_id: row.row_id, ...it }))
        );
        if (ins.error) {
          return NextResponse.json({ ok: false, error: 'cand_insert_failed', detail: ins.error.message }, { status: 500 });
        }
        withCandidates++;
      }

      // 디버그 샘플 기록(최상위 1개 + list 길이)
      debugSamples.push({
        row_id: row.row_id,
        list_len: Array.isArray(list) ? list.length : 0,
        sample: items[0] ?? null,
        // rapid_text: text.slice(0, 300), // 필요 시 열기
      });

    } catch (e: any) {
      // 이 row는 스킵하고 계속
      debugSamples.push({
        row_id: row.row_id,
        error: e?.message || String(e),
      });
    }

    processed++;
    await new Promise(r => setTimeout(r, 250));
  }

  return NextResponse.json({
    ok: true,
    session_id: sessionId,
    processed,
    rows: rows?.length ?? 0,
    withCandidates,      // 후보가 실제 삽입된 row 수
    debugSamples,        // 각 row의 list_len/첫 샘플/오류 등
  });
}
