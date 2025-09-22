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

const https = (u?: string | null) => (u ? (u.startsWith('//') ? `https:${u}` : u) : '');

function blankItem(): Item {
  return { img_url: '', promo_price: null, price: null, sales: null, seller: null, detail_url: '' };
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id: sessionId } = await ctx.params;

    const store = await cookies();
    const token = store.get('s_token')?.value;
    const payload = verifyToken(token);
    if (!payload || payload.session_id !== sessionId) {
      return NextResponse.json({ ok: false, error: 'unauth' }, { status: 401 });
    }

    // 1) 세션의 rows 가져오기
    const { data: rows, error: rowsErr } = await supabaseAdmin
      .from('rows')
      .select(
        'row_id, order_no, prev_name, category, src_img_url, main_thumb_url, selected_idx, baedaji, skip, delete, status'
      )
      .eq('session_id', sessionId)
      .order('order_no', { ascending: true });

    if (rowsErr) {
      return NextResponse.json({ ok: false, error: rowsErr.message }, { status: 500 });
    }

    if (!rows?.length) {
      return NextResponse.json({ ok: true, rows: [] });
    }

    const rowIds = rows.map((r) => r.row_id);

    // 2) 후보 전체를 한 번에 가져와서 row_id별로 묶기
    const { data: cs, error: candErr } = await supabaseAdmin
      .from('candidates')
      .select('row_id, idx, img_url, detail_url, price, promo_price, sales, seller')
      .in('row_id', rowIds)
      .order('row_id', { ascending: true })
      .order('idx', { ascending: true });

    if (candErr) {
      return NextResponse.json({ ok: false, error: candErr.message }, { status: 500 });
    }

    const map = new Map<number, Item[]>();
    for (const c of cs ?? []) {
      const arr = map.get(c.row_id) ?? [];
      arr[c.idx ?? arr.length] = {
        img_url: https(c.img_url || ''),
        detail_url: https(c.detail_url || ''),
        price: c.price ?? null,
        promo_price: c.promo_price ?? null,
        sales: (c.sales as any) ?? null,
        seller: (c.seller as any) ?? null,
      };
      map.set(c.row_id, arr);
    }

    const out = rows.map((r) => {
      const arr = (map.get(r.row_id) ?? []).slice(0, 8);
      while (arr.length < 8) arr.push(blankItem());
      return {
        row_id: r.row_id,
        order_no: r.order_no,
        prev_name: r.prev_name,
        category: r.category,
        src_img_url: https(r.src_img_url),
        main_thumb_url: https(r.main_thumb_url),
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
