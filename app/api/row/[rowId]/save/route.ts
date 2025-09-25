// app/api/row/[rowId]/save/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { verifyToken } from '@/lib/auth';

export async function POST(
  req: NextRequest,
  { params }: { params: { rowId: string } } // ✅ 폴더명 [rowId]와 동일한 키
) {
  const rowId = Number(params.rowId);
  if (!Number.isFinite(rowId)) {
    return NextResponse.json({ ok: false, error: 'bad_row_id' }, { status: 400 });
  }

  try {
    // 인증
    const token = cookies().get('s_token')?.value; // ✅ Next 15: 동기 API
    const payload = verifyToken(token);
    if (!payload) {
      return NextResponse.json({ ok: false, error: 'unauth' }, { status: 401 });
    }

    // 저장할 값
    const body = await req.json().catch(() => ({}));
    const patch = {
      selected_idx: body?.selected_idx ?? null,
      baedaji: body?.baedaji ?? null,
      skip: !!body?.skip,
      delete: !!body?.delete,
    };

    // 업데이트
    const { error } = await supabaseAdmin
      .from('rows')
      .update(patch)
      .eq('row_id', rowId);

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? 'save_failed' },
      { status: 500 }
    );
  }
}
