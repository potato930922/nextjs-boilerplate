// app/api/session/[id]/whoami/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const sessionId = params.id;
  const token = req.cookies.get('s_token')?.value;
  const payload = verifyToken(token);
  if (!payload || payload.session_id !== sessionId) {
    return NextResponse.json({ ok: false, session_id: null }, { status: 200 });
  }
  return NextResponse.json({ ok: true, session_id: payload.session_id }, { status: 200 });
}
