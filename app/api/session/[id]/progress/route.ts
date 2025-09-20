import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { verifyToken } from '@/lib/auth';

async function countBy(sessionId: string, status: string) {
  const { count, error } = await supabaseAdmin
    .from('rows')
    .select('row_id', { count: 'exact', head: true })
    .eq('session_id', sessionId)
    .eq('status', status);
  if (error) throw error;
  return count ?? 0;
}

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

    const [pending, done, skipped, deleted] = await Promise.all([
      countBy(sessionId, 'pending'),
      countBy(sessionId, 'done'),
      countBy(sessionId, 'skipped'),
      countBy(sessionId, 'deleted'),
    ]);

    const total = pending + done + skipped + deleted;
    const ratio = total ? (done + skipped + deleted) / total : 0;

    return NextResponse.json({ ok: true, total, pending, done, skipped, deleted, ratio });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? 'progress_failed' }, { status: 500 });
  }
}
