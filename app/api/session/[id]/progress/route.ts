// app/api/session/[id]/progress/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { verifyToken } from '@/lib/auth';           // ⬅ 여기!
import { cookies } from 'next/headers';

// 간단 진행도 계산: 상태별 개수 집계
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
  { params }: { params: { id: string } }
) {
  const sessionId = params.id;

  // 인증 (쿠키 → 토큰 검증)
  const token = (await cookies()).get('s_token')?.value;
  const payload = verifyToken(token);
  if (!payload || payload.session_id !== sessionId) {
    return NextResponse.json({ ok: false, error: 'unauth' }, { status: 401 });
  }

  try {
    const [pending, done, skipped, deleted] = await Promise.all([
      countByStatus(sessionId, 'pending'),
      countByStatus(sessionId, 'done'),
      countByStatus(sessionId, 'skipped'),
      countByStatus(sessionId, 'deleted'),
    ]);

    const total = pending + done + skipped + deleted;
    const ratio = total ? (done + skipped + deleted) / total : 0;

    return NextResponse.json({
      ok: true,
      total,
      pending,
      done,
      skipped,
      deleted,
      ratio, // 0~1
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: 'db_error' }, { status: 500 });
  }
}
