// app/api/row/[rowId]/save/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { verifyToken } from '@/lib/auth';
import { ParamCtx, getParam, getToken } from '@/lib/route15';

type SaveBody = {
  selected_idx?: number | null;
  baedaji?: number | null;
  skip?: boolean;
  delete?: boolean;
};

export async function POST(req: NextRequest, context: ParamCtx<'rowId'>) {
  try {
    // 1) 파라미터(rowId)
    const rowIdStr = await getParam(context, 'rowId');
    const rowId = Number(rowIdStr);
    if (!Number.isFinite(rowId)) {
      return NextResponse.json({ ok: false, error: 'invalid_row_id' }, { status: 400 });
    }

    // 2) 인증 (Next.js 15 헬퍼 사용)
    const token = await getToken('s_token');
    const payload = verifyToken(token);
    if (!payload) {
      return NextResponse.json({ ok: false, error: 'unauth' }, { status: 401 });
    }

    // 3) row의 session_id 조회해서 내 세션이 맞는지 검증
    const { data: rowOne, error: fetchErr } = await supabaseAdmin
      .from('rows')
      .select('session_id')
      .eq('row_id', rowId)
      .single();

    if (fetchErr || !rowOne) {
      return NextResponse.json({ ok: false, error: 'row_not_found' }, { status: 404 });
    }
    if (rowOne.session_id !== payload.session_id) {
      return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
    }

    // 4) 바디 파싱
    const body = (await req.json()) as SaveBody;

    const patch: Record<string, any> = {};
    if ('selected_idx' in body) patch.selected_idx = body.selected_idx ?? null;
    if ('baedaji' in body) patch.baedaji = body.baedaji ?? null;
    if ('skip' in body) patch.skip = !!body.skip;
    if ('delete' in body) patch.delete = !!body.delete;

    // 선택/스킵/삭제의 상호배제 보정(선택하면 skip/delete 해제)
    if (patch.selected_idx != null) {
      patch.skip = false;
      patch.delete = false;
    }
    if (patch.skip) {
      patch.selected_idx = null;
      patch.delete = false;
    }
    if (patch.delete) {
      patch.selected_idx = null;
      patch.skip = false;
    }

    // 5) 업데이트
    const { error: upErr } = await supabaseAdmin
      .from('rows')
      .update(patch)
      .eq('row_id', rowId);

    if (upErr) {
      return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? 'save_failed' },
      { status: 500 }
    );
  }
}
