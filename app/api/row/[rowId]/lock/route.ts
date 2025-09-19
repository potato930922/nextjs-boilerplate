export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { verify } from '@/lib/auth';
import { z } from 'zod';

const schema = z.object({ actor: z.string().min(1) });

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ rowId: string }> }
) {
  const token = req.cookies.get('s_token')?.value;
  if (!token) return NextResponse.json({ ok: false, error: 'unauth' }, { status: 401 });
  const payload = await verify(token).catch(() => null);
  if (!payload) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });

  const { rowId } = await context.params;
  const { actor } = schema.parse(await req.json());

  // acquire_lock RPC 사용 (앞서 만든 함수 기준)
  const { data, error } = await supabaseAdmin.rpc('acquire_lock', {
    p_row_id: Number(rowId),
    p_actor: actor,
  });

  if (error) return NextResponse.json({ ok: false, error: 'db' }, { status: 500 });
  if (!data) return NextResponse.json({ ok: false, error: 'locked' }, { status: 409 });

  return NextResponse.json({ ok: true });
}
