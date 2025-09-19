export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { verify } from '@/lib/auth';

// 선택: 간단 진행도 계산 (RPC 없이)
async function getProgress(sessionId: string) {
  const total = await supabaseAdmin
    .from('rows')
    .select('row_id', { count: 'exact', head: true })
    .eq('session_id', sessionId);

  const done = await supabaseAdmin
    .from('rows')
    .select('row_id', { count: 'exact', head: true })
    .eq('session_id', sessionId)
    .neq('status', 'pending');

  return {
    total: total.count ?? 0,
    completed: done.count ?? 0,
  };
}

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

  const prog = await getProgress(id);
  return NextResponse.json({ ok: true, ...prog });
}
