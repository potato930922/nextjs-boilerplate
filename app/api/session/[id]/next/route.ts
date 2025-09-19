import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { verify } from '@/lib/auth';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const token = req.cookies.get('s_token')?.value;
  if (!token) return NextResponse.json({ ok:false, error:'unauth' }, { status: 401 });
  const payload = await verify(token).catch(() => null);
  if (!payload || payload.session_id !== params.id) return NextResponse.json({ ok:false, error:'forbidden' }, { status: 403 });

  // pending 중 가장 작은 order_no 1건
  const { data: row, error } = await supabaseAdmin
    .from('rows')
    .select('*')
    .eq('session_id', params.id)
    .eq('status', 'pending')
    .order('order_no', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) return NextResponse.json({ ok:false, error:'db' }, { status: 500 });
  if (!row) return NextResponse.json({ ok:true, done:true }); // 더 없음

  const { data: cands } = await supabaseAdmin
    .from('candidates')
    .select('*')
    .eq('row_id', row.row_id)
    .order('idx', { ascending: true });

  return NextResponse.json({ ok:true, row, candidates: cands ?? [] });
}
