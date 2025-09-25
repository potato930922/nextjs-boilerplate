// app/api/row/[rowId]/save/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { verifyToken } from '@/lib/auth';
import { ParamCtx, getParam } from '@/lib/route15';

type SaveBody = {
  selected_idx: number | null;
  baedaji: number | null; // 원 단위
  skip: boolean;
  delete: boolean;
};

export async function POST(
  req: NextRequest,
  context: ParamCtx<'rowId'> // ✅ 프로젝트 규격: params가 Promise 형태
) {
  try {
    const rowIdStr = await getParam(context, 'rowId');
    const rowId = Number(rowIdStr);
    if (!Number.isFinite(rowId)) {
      return NextResponse.json({ ok: false, error: 'bad_row_id' }, { status: 400 });
    }

    // ── 인증 ─────────────────────────────────────────────
    const token = cookies().get('s_token')?.value; // cookies()는 동기 API
    const payload = verifyToken(token);
    if (!payload) {
      return NextResponse.json({ ok: false, error: 'unauth' }, { status: 401 });
    }

    // 행의 세션 확인 (rowId가 실제로 로그인된 세션 소유인지 체크)
    const { data: row, error: rowErr } = await supabaseAdmin
      .from('rows')
      .select('session_id')
      .eq('row_id', rowId)
      .maybeSingle();

    if (rowErr) {
      return NextResponse.json({ ok: false, error: rowErr.message }, { status: 500 });
    }
    if (!row) {
      return NextResponse.json({ ok: false, error: 'row_not_found' }, { status: 404 });
    }
    if (row.session_id !== payload.session_id) {
      return NextResponse.json({ ok: false, error: 'unauth' }, { status: 401 });
    }

    // 요청 바디
    const body = (await req.json()) as SaveBody;

    // 정규화: skip/delete 중 하나라도 true면 selected_idx는 null
    const willSkip = !!body?.skip;
    const willDelete = !!body?.delete;
    const selected =
      willSkip || willDelete
        ? null
        : body?.selected_idx === null || body?.selected_idx === undefined
        ? null
        : Number.isFinite(body.selected_idx)
        ? (body.selected_idx as number)
        : null;

    const baedaji =
      body?.baedaji === null || body?.baedaji === undefined
        ? null
        : Number.isFinite(body.baedaji)
        ? (body.baedaji as number)
        : null;

    const patch: Record<string, any> = {
      selected_idx: selected,
      baedaji,
      skip: willSkip,
      delete: willDelete,
      edited_by: 'web',
    };

    const { error: upErr } = await supabaseAdmin
      .from('rows')
      .update(patch)
      .eq('row_id', rowId);

    if (upErr) {
      return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? 'save_failed' }, { status: 500 });
  }
}
