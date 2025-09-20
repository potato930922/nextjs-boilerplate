// app/api/row/[rowId]/lock/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { verifyToken } from '@/lib/auth';
import { cookies } from 'next/headers';
import { z } from 'zod';

const schema = z.object({ actor: z.string().min(1) });

export async function POST(
  req: NextRequest,
  { params }: { params: { rowId: string } }
) {
  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'bad_request' }, { status: 400 });
  }

  const token = (await cookies()).get('s_token')?.value;
  const payload = verifyToken(token);
  if (!payload) return NextResponse.json({ ok: false, error: 'unauth' }, { status: 401 });

  const rowId = Number(params.rowId);

  // upsert soft lock
  const { error } = await supabaseAdmin
    .from('locks')
    .upsert({ row_id: rowId, locked_by: parsed.data.actor, locked_at: new Date().toISOString() }, { onConflict: 'row_id' });

  if (error) {
    return NextResponse.json({ ok: false, error: 'db_error' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
