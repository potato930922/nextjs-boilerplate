// app/api/session/[id]/whoami/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';
import { ParamCtx, getParam, getToken } from '@/lib/route15';

export async function GET(req: NextRequest, context: ParamCtx<'id'>) {
  const sessionId = await getParam(context, 'id');
  const token = await getToken('s_token'); // ✅

  const payload = verifyToken(token);
  if (!payload || payload.session_id !== sessionId) {
    return NextResponse.json({ ok: false, session_id: null });
  }
  return NextResponse.json({ ok: true, session_id: payload.session_id });
}
