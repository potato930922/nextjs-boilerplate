// app/api/session/open/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { signToken } from '@/lib/auth';

/**
 * 세션 열기
 * - Body(JSON): { session_id: string }
 * - s_token 쿠키를 설정하고 { ok: true, session_id } 를 반환
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const session_id: string | undefined = body?.session_id;

    if (!session_id || typeof session_id !== 'string') {
      return NextResponse.json({ ok: false, error: 'missing_session_id' }, { status: 400 });
    }

    // signToken 이 Promise<string>일 수 있으므로 반드시 await
    const jwt = await signToken({ session_id });

    const res = NextResponse.json({ ok: true, session_id });
    // cookies.set(name, value, options) — value는 string 이어야 함
    res.cookies.set('s_token', jwt, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
    });
    return res;
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? 'open_failed' },
      { status: 500 }
    );
  }
}

/**
 * (옵션) GET ?session_id=... 으로도 열 수 있게 지원
 */
export async function GET(req: NextRequest) {
  const session_id = req.nextUrl.searchParams.get('session_id') ?? undefined;
  if (!session_id) {
    return NextResponse.json({ ok: false, error: 'missing_session_id' }, { status: 400 });
  }

  const jwt = await signToken({ session_id });

  const res = NextResponse.json({ ok: true, session_id });
  res.cookies.set('s_token', jwt, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
  });
  return res;
}
