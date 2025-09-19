export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { verify } from '@/lib/auth';

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ rowId: string }> }
) {
  const token = req.cookies.get('s_token')?.value;
  if (!token) return NextResponse.json({ ok: false, error: 'unauth' }, { status: 401 });
  const payload = await verify(token).catch(() => null);
  if (!payload) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });

  const { rowId } = await context.params;

  const { error } = await supabaseAdmin.rpc('release_lock', { p_row_id: Number(rowId) });
  if (error) return NextResponse.json({ ok: false, error: 'db' }, { status: 500 });
  return NextResponse.json({ ok: true });
}
