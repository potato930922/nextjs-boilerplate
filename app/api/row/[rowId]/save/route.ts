// app/api/row/[rowId]/save/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { verifyToken } from '@/lib/auth';
import { cookies } from 'next/headers';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ rowId: string }> }   // ✅ Promise로 받기
) {
  const { rowId } = await params;
  const token = (await cookies()).get('s_token')?.value;
  const payload = verifyToken(token);
  if (!payload) {
    return NextResponse.json({ ok: false, error: 'unauth' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const {
    selected_idx,
    baedaji,
    skip,
    del,          // 프론트에서 delete 예약어 피해 'del'로 보냈다고 가정
  }: {
    selected_idx?: number | null;
    baedaji?: number | null;
    skip?: boolean;
    del?: boolean;
  } = body ?? {};

  // 상태 계산
  const status =
    del ? 'deleted' : skip ? 'skipped' : selected_idx != null ? 'done' : 'pending';

  // 업데이트 필드 구성
  const updatePayload: Record<string, any> = {
    selected_idx,
    baedaji,
    skip: !!skip,
    delete: !!del,
    status,
    updated_at: new Date().toISOString(),
    edited_by: payload.sub ?? 'web',
    // ❌ version은 트리거나 RPC가 없으면 아예 보내지 않는다
  };

  // null/undefined 정리(보내지 않도록)
  Object.keys(updatePayload).forEach((k) => {
    if (updatePayload[k] === undefined) delete updatePayload[k];
  });

  const { error } = await supabaseAdmin
    .from('rows')
    .update(updatePayload)
    .eq('row_id', Number(rowId));

  if (error) {
    return NextResponse.json({ ok: false, error: 'db_error' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
