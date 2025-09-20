export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { verifyToken } from '@/lib/auth';
import { cookies } from 'next/headers';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ rowId: string }> }   // ✅ Promise로!
) {
  const { rowId } = await params;                       // ✅ await로 꺼내기
  const token = (await cookies()).get('s_token')?.value;
  const payload = verifyToken(token);
  if (!payload) {
    return NextResponse.json({ ok: false, error: 'unauth' }, { status: 401 });
  }

  const lockedBy = payload.sub ?? 'web';
  const now = new Date().toISOString();

  const { error } = await supabaseAdmin
    .from('locks')
    .upsert(
      { row_id: Number(rowId), locked_by: lockedBy, locked_at: now },
      { onConflict: 'row_id' }
    );

  if (error) {
    return NextResponse.json({ ok: false, error: 'db_error' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
