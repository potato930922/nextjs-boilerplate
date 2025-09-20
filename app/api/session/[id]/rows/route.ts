import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { verifyToken } from '@/lib/auth';
import { cookies } from 'next/headers';

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;

  const token = (await cookies()).get('s_token')?.value;
  const payload = verifyToken(token);
  if (!payload || payload.session_id !== id) {
    return NextResponse.json({ ok:false, error:'unauth' }, { status:401 });
  }

  const { data, error } = await supabaseAdmin
    .from('rows')
    .select('row_id, order_no, prev_name, category, src_img_url, main_thumb_url, selected_idx, baedaji, skip, "delete", status')
    .eq('session_id', id)
    .order('order_no', { ascending: true });

  if (error) return NextResponse.json({ ok:false, error:'db' }, { status:500 });

  return NextResponse.json({ ok:true, rows:data });
}
