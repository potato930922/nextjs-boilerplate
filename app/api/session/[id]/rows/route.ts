// app/api/session/[id]/rows/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { verifyToken } from '@/lib/auth';
import { ParamCtx, getParam, getToken } from '@/lib/route15';

export async function GET(req: NextRequest, context: ParamCtx<'id'>) {
  const sessionId = await getParam(context, 'id');

  try {
    const token = await getToken('s_token'); // ✅
    const payload = verifyToken(token);
    if (!payload || payload.session_id !== sessionId) {
      return NextResponse.json({ ok: false, error: 'unauth' }, { status: 401 });
    }

    const { data: rows, error } = await supabaseAdmin
      .from('rows')
      .select('*')
      .eq('session_id', sessionId)
      .order('order_no');
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    // 각 row의 후보 8개 조인
    const ids = (rows ?? []).map(r => r.row_id);
    let candMap = new Map<number, any[]>();
    if (ids.length) {
      const { data: cands } = await supabaseAdmin
        .from('candidates')
        .select('row_id, idx, img_url, promo_price, price, sales, seller, detail_url')
        .in('row_id', ids)
        .order('idx', { ascending: true });
      (cands ?? []).forEach(c => {
        if (!candMap.has(c.row_id)) candMap.set(c.row_id, []);
        candMap.get(c.row_id)!.push({
          img_url: c.img_url || '',
          promo_price: c.promo_price ?? null,
          price: c.price ?? null,
          sales: c.sales ?? null,
          seller: c.seller ?? null,
          detail_url: c.detail_url || '',
        });
      });
    }

    const out = (rows ?? []).map(r => ({
      ...r,
      candidates: candMap.get(r.row_id) ?? new Array(8).fill({
        img_url: '',
        promo_price: null,
        price: null,
        sales: null,
        seller: null,
        detail_url: '',
      }),
    }));

    return NextResponse.json({ ok: true, rows: out });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? 'rows_failed' }, { status: 500 });
  }
}
