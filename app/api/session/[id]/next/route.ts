export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { verify } from '@/lib/auth';

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const token = req.cookies.get('s_token')?.value;
  if (!token) return NextResponse.json({ ok: false, error: 'unauth' }, { status: 401 });

  const payload = await verify(token).catch(() => null);
  const { id } = await context.params;
  if (!payload || payload.session_id !== id) {
    return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
  }

  // pending 중 가장 작은 order_no
  const { data: row, error } = await supabaseAdmin
    .from('rows')
    .select('*')
    .eq('session_id', id)
    .eq('status', 'pending')
    .order('order_no', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) return NextResponse.json({ ok: false, error: 'db' }, { status: 500 });
  if (!row) return NextResponse.json({ ok: true, done: true });

  const { data: candidates } = await supabaseAdmin
    .from('candidates')
    .select('*')
    .eq('row_id', row.row_id)
    .order('idx', { ascending: true });

  return NextResponse.json({ ok: true, row, candidates: candidates ?? [] });
}
