export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// app/api/session/[id]/progress/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { verifyToken } from '@/lib/auth';
import { cookies } from 'next/headers';

async function countByStatus(sessionId: string, status: string) {
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
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params; // sessionId

  const token = (await cookies()).get('s_token')?.value;
  const payload = verifyToken(token);
  if (!payload || payload.session_id !== id) {
    return NextResponse.json({ ok: false, error: 'unauth' }, { status: 401 });
  }

  try {
    const [pending, done, skipped, deleted] = await Promise.all([
      countByStatus(id, 'pending'),
      countByStatus(id, 'done'),
      countByStatus(id, 'skipped'),
      countByStatus(id, 'deleted'),
    ]);
    const total = pending + done + skipped + deleted;
    const ratio = total ? (done + skipped + deleted) / total : 0;
    return NextResponse.json({ ok: true, total, pending, done, skipped, deleted, ratio });
  } catch {
    return NextResponse.json({ ok: false, error: 'db_error' }, { status: 500 });
  }
}
