import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { verifyToken } from '@/lib/auth';

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> } // ✅
) {
  const { id: sessionId } = await context.params; // ✅
  try {
    const token = (await _req.cookies).get('s_token')?.value;
    const payload = verifyToken(token);
    if (!payload || payload.session_id !== sessionId) {
      return NextResponse.json({ ok: false, error: 'unauth' }, { status: 401 });
    }

    const { data, error } = await supabaseAdmin
      .from('rows')
      .select(
        `
        row_id, order_no, prev_name, category, src_img_url, main_thumb_url,
        selected_idx, baedaji, skip, "delete", status
      `
      )
      .eq('session_id', sessionId)
      .order('order_no', { ascending: true });

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, rows: data ?? [] });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? 'rows_failed' }, { status: 500 });
  }
}
