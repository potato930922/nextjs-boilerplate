import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { verify } from '@/lib/auth';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const token = req.cookies.get('s_token')?.value;
  if (!token) return NextResponse.json({ ok:false, error:'unauth' }, { status: 401 });
  const payload = await verify(token).catch(() => null);
  if (!payload || payload.session_id !== params.id) return NextResponse.json({ ok:false, error:'forbidden' }, { status: 403 });

  const { data, error } = await supabaseAdmin.rpc('get_progress', { p_session_id: params.id });
  // get_progress를 만들지 않았다면 아래처럼 쿼리 2번으로 계산해도 됨
  // const tot = await supabaseAdmin.from('rows').select('row_id', { count: 'exact', head: true }).eq('session_id', params.id);
  // const done = await supabaseAdmin.from('rows').select('row_id', { count: 'exact', head: true }).eq('session_id', params.id).neq('status','pending');

  if (error) return NextResponse.json({ ok:false, error:'db' }, { status: 500 });
  return NextResponse.json({ ok:true, ...data });
}
