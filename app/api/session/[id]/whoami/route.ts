// app/api/session/[id]/whoami/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyToken } from '@/lib/auth';

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> } // ✅ Next 15: Promise 형태
) {
  const { id: sessionId } = await context.params; // ✅ await 필요

  const token = cookies().get('s_token')?.value; // ✅ cookies()는 동기
  const payload = verifyToken(token);

  if (!payload || payload.session_id !== sessionId) {
    return NextResponse.json({ ok: true, session_id: null });
  }
  return NextResponse.json({ ok: true, session_id: payload.session_id });
}
