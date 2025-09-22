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

    const { data: rows, error: rowsErr } = await supabaseAdmin
      .from('rows')
      .select('row_id, order_no, prev_name, category, src_img_url, main_thumb_url, selected_idx, baedaji, skip, delete, status')
      .eq('session_id', sessionId)
      .order('order_no', { ascending: true });

    if (rowsErr) return NextResponse.json({ ok: false, error: rowsErr.message }, { status: 500 });
    if (!rows?.length) return NextResponse.json({ ok: true, rows: [] });

    const rowIds = rows.map((r) => r.row_id);
