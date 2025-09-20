// app/api/row/[rowId]/save/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { verifyToken } from '@/lib/auth';
import { cookies } from 'next/headers';
import { z } from 'zod';

const bodySchema = z.object({
  selected_idx: z.number().int().min(0).max(7).nullable().optional(),
  baedaji: z.number().int().min(0).nullable().optional(),
  skip: z.boolean().optional(),
  delete: z.boolean().optional(),
  expected_version: z.number().int(),
  actor: z.string().min(1),
});

export async function POST(
  req: NextRequest,
  { params }: { params: { rowId: string } }
) {
  const token = (await cookies()).get('s_token')?.value;
  const payload = verifyToken(token);
  if (!payload) return NextResponse.json({ ok: false, error: 'unauth' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'bad_request' }, { status: 400 });
  }

  const {
    selected_idx = null,
    baedaji = null,
    skip = false,
    delete: del = false,
    expected_version,
    actor,
  } = parsed.data;

  const rowId = Number(params.rowId);

  // 상태 결정
  let status: 'pending' | 'done' | 'skipped' | 'deleted' = 'pending';
  if (del) status = 'deleted';
  else if (skip) status = 'skipped';
  else status = 'done';

  // 낙관적 락(버전 일치할 때만 업데이트)
  const { data, error } = await supabaseAdmin
    .from('rows')
    .update({
      selected_idx,
      baedaji,
      skip,
      delete: del,
      status,
      edited_by: actor,
      updated_at: new Date().toISOString(),
      version: expected_version + 1,
    })
    .eq('row_id', rowId)
    .eq('version', expected_version)
    .select('version')
    .maybeSingle();

  if (error) {
    return NextResponse.json({ ok: false, error: 'db_error' }, { status: 500 });
  }
  if (!data) {
    // 버전 불일치 → 다른 기기가 먼저 저장함
    return NextResponse.json({ ok: false, error: 'conflict' }, { status: 409 });
  }

  // 잠금 해제(선택)
  await supabaseAdmin.from('locks').delete().eq('row_id', rowId);

  // 이벤트 로그(에러는 무시)
  await supabaseAdmin.from('events').insert({
    row_id: rowId,
    actor,
    action: status === 'done' ? 'save' : status,
    old_data: null,
    new_data: { selected_idx, baedaji, skip, delete: del },
  });

  return NextResponse.json({ ok: true, new_version: data.version });
}
