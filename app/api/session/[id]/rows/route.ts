// app/api/session/[id]/rows/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyToken } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Item = {
  img_url: string;
  promo_price: number | null;
  price: number | null;
  sales: string | null;
  seller: string | null;
  detail_url: string;
};

const toUrl = (u?: string | null) => {
  const s = (u || '').trim();
  if (!s) return '';
  if (s.startsWith('//')) return 'https:' + s;
  if (/^https?:\/\//i.test(s)) return s;
  if (/^[a-z0-9.-]+\//i.test(s)) return 'https://' + s;
  return s;
};
const blank = (): Item => ({ img_url: '', promo_price: null, price: null, sales: null, seller: null, detail_url: '' });

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id: sessionId } = await ctx.params;

    // 인증
    const store = await cookies();
    const token = store.get('s_token')?.value;
    const payload = verifyToken(token);
    if (!payload || payload.session_id !== sessionId) {
      return NextResponse.json({ ok: false, error: 'unauth' }, { status: 401 });
    }

    // rows
    const { data: rows, error: rowsErr } = await supabaseAdmin
      .from('rows')
      .select('row_id, order_no, prev_name, category, src_img_url, main_thumb_url, selected_idx, baedaji, skip, delete, status')
      .eq('session_id', sessionId)
      .order('order_no', { ascending: true });

    if (rowsErr) return NextResponse.json({ ok: false, error: rowsErr.message }, { status: 500 });
    if (!rows?.length) return NextResponse.json({ ok: true, rows: [] });

    const rowIds = rows.map(r => r.row_id);

    // candidates: *로 받아서 실제 존재하는 키만 사용 (여기서 더는 '없는 컬럼' 에러가 안 남)
    const { data: cand, error: candErr } = await supabaseAdmin
      .from('candidates')
      .select('*')
      .in('row_id', rowIds)
      .order('row_id', { ascending: true })
      .order('idx', { ascending: true });

    if (candErr) return NextResponse.json({ ok: false, error: candErr.message }, { status: 500 });

    // row_id -> items[]
    const byRow = new Map<number, Item[]>();
    for (const c of cand ?? []) {
      // 존재하는 필드들 중에서 우선순위 합성
      const img =
        c.img_url || c.img || c.image_url || c.pict_url || c.pic_url || c.picture || c.thumbnail || '';
      const detail =
        c.detail_url || c.url || c.item_url || '';
      const arr = byRow.get(c.row_id) ?? [];
      const pos = typeof c.idx === 'number' ? c.idx : arr.length;
      arr[pos] = {
        img_url: toUrl(img),
        detail_url: toUrl(detail),
        price: c.price ?? null,
        promo_price: c.promo_price ?? null,
        sales: (c.sales as any) ?? null,
        seller: (c.seller as any) ?? null,
      };
      byRow.set(c.row_id, arr);
    }

    const out = rows.map(r => {
      const arr = (byRow.get(r.row_id) ?? []).slice(0, 8);
      while (arr.length < 8) arr.push(blank());
      return {
        row_id: r.row_id,
        order_no: r.order_no,
        prev_name: r.prev_name,
        category: r.category,
        src_img_url: toUrl(r.src_img_url),
        main_thumb_url: toUrl(r.main_thumb_url),
        selected_idx: r.selected_idx,
        baedaji: r.baedaji,
        skip: r.skip,
        delete: r.delete,
        status: r.status,
        candidates: arr,
      };
    });

    return NextResponse.json({ ok: true, rows: out });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'rows_failed' }, { status: 500 });
  }
}
