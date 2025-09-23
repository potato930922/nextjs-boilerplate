import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { verifyToken } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Candidate = {
  row_id: number;
  idx: number | null;
  img_url: string | null;
  detail_url: string | null;
  price: number | null;
  promo_price: number | null;
  sales: string | null;
  seller: string | null;
};

function https(u?: string | null) {
  if (!u) return '';
  return u.startsWith('//') ? `https:${u}` : u;
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> } // Next.js 15: Promise 시그니처
) {
  const { id: sessionId } = await ctx.params;

  // 인증 확인 (PIN 미검증이면 401)
  const token = req.cookies.get('s_token')?.value;
  const payload = verifyToken(token);
  if (!payload || payload.session_id !== sessionId) {
    return NextResponse.json({ ok: false, error: 'unauth' }, { status: 401 });
  }

  // rows 기본 정보 조회
  const { data: rows, error } = await supabaseAdmin
    .from('rows')
    .select(
      `
      row_id, order_no, prev_name, category, src_img_url, main_thumb_url,
      selected_idx, baedaji, skip, delete, status
    `
    )
    .eq('session_id', sessionId)
    .order('order_no', { ascending: true });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  if (!rows?.length) {
    return NextResponse.json({ ok: true, rows: [] }, { status: 200, headers: { 'cache-control': 'no-store' } });
  }

  // 해당 rows의 candidates를 한 번에 가져와서 그룹핑
  const rowIds = rows.map((r: any) => r.row_id);
  const { data: cands, error: candErr } = await supabaseAdmin
    .from('candidates')
    .select('row_id, idx, img_url, detail_url, price, promo_price, sales, seller')
    .in('row_id', rowIds)
    .order('idx', { ascending: true });

  if (candErr) {
    return NextResponse.json({ ok: false, error: candErr.message }, { status: 500 });
  }

  const map = new Map<number, Candidate[]>();
  for (const c of (cands ?? []) as Candidate[]) {
    const arr = map.get(c.row_id) ?? [];
    arr.push({
      ...c,
      img_url: https(c.img_url),
      detail_url: https(c.detail_url),
    });
    map.set(c.row_id, arr);
  }

  // 각 row에 candidates 8개로 맞춰서 세팅 (부족하면 빈 슬롯)
  const normalized = rows.map((r: any) => {
    const arr = (map.get(r.row_id) ?? []).slice(0, 8);
    while (arr.length < 8) {
      arr.push({
        row_id: r.row_id,
        idx: arr.length,
        img_url: '',
        detail_url: '',
        price: null,
        promo_price: null,
        sales: null,
        seller: null,
      });
    }
    return { ...r, candidates: arr };
  });

  return NextResponse.json(
    { ok: true, rows: normalized },
    { status: 200, headers: { 'cache-control': 'no-store' } }
  );
}
