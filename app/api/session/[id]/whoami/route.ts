import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> } // ✅ Next.js 15: Promise
) {
  const { id: sessionId } = await ctx.params; // ✅ await 필요

  const token = req.cookies.get('s_token')?.value;
  const payload = verifyToken(token);

  if (!payload || payload.session_id !== sessionId) {
    // 인증 실패
    return NextResponse.json(
      { ok: false, session_id: null },
      { status: 401, headers: { 'cache-control': 'no-store' } }
    );
  }

  // 인증 성공
  return NextResponse.json(
    { ok: true, session_id: sessionId },
    { status: 200, headers: { 'cache-control': 'no-store' } }
  );
}
