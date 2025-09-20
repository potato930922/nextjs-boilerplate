// app/api/row/[rowId]/unlock/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { verifyToken } from '@/lib/auth';
import { cookies } from 'next/headers';

export async function POST(
  _req: NextRequest,
  { params }: { params: { rowId: string } }
) {
  const token = (await cookies()).get('s_token')?.value;
  const payload = verifyToken(token);
  if (!payload) return NextResponse.json({ ok: false, error: 'unauth' }, { status: 401 });

  const rowId = Number(params.rowId);

  const { error } = await supabaseAdmin.from('locks').delete().eq('row_id', rowId);
  if (error) {
    return NextResponse.json({ ok: false, error: 'db_error' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
