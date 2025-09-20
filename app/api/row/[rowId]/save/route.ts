// app/api/row/[rowId]/save/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { verifyToken } from '@/lib/auth';
import { cookies } from 'next/headers';
import { z } from 'zod';

const bodySchema = z.object({
  selected_idx: z.number().int().min(0).max(7).nullable(), // null 허용(스킵/삭제)
  baedaji: z.number().int().nullable(),
  skip: z.boolean().optional().default(false),
  delete: z.boolean().optional().default(false),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ rowId: string }> }
) {
  const { rowId } = await params;

  const token = (await cookies()).get('s_token')?.value;
  const payload = verifyToken(token);
  if (!payload) return NextResponse.json({ ok: false, error: 'unauth' }, { status: 401 });

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'bad_request' }, { status: 400 });
  }
  const { selected_idx, baedaji, skip, delete: del } = parsed.data;

  // 상태 결정
  let status: 'done' | 'skipped' | 'deleted' | 'pending' = 'pending';
  if (del) status = 'deleted';
  else if (skip) status = 'skipped';
  else if (selected_idx !== null && selected_idx !== undefined) status = 'done';

  const { error } = await supabaseAdmin
    .from('rows')
    .update({
      selected_idx: selected_idx ?? null,
      baedaji: baedaji ?? null,
      skip: !!skip,
      delete: !!del,
      status,
      updated_at: new Date().toISOString(),
      edited_by: payload.sub ?? 'web',
      version: supabaseAdmin.rpc ? undefined : undefined, // 단순 업데이트(필요시 트리거/함수로 증분)
    })
    .eq('row_id', Number(rowId));

  if (error) return NextResponse.json({ ok: false, error: 'db_error' }, { status: 500 });

  // 저장 후 락 해제(선택)
  await supabaseAdmin.from('locks').delete().eq('row_id', Number(rowId));

  return NextResponse.json({ ok: true });
}
