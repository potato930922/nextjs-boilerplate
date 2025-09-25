// app/api/row/[row_id]/save/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { verifyToken } from '@/lib/auth';
import { ParamCtx, getParam, getToken } from '@/lib/route15';

export async function POST(req: NextRequest, context: ParamCtx<'row_id'>) {
  const rowIdStr = await getParam(context, 'row_id'); // ✅
  const rowId = Number(rowIdStr);

  try {
    const token = await getToken('s_token'); // ✅
    const payload = verifyToken(token);
    if (!payload) {
      return NextResponse.json({ ok: false, error: 'unauth' }, { status: 401 });
    }

    const body = await req.json();
    const patch = {
      selected_idx: body?.selected_idx ?? null,
      baedaji: body?.baedaji ?? null,
      skip: !!body?.skip,
      delete: !!body?.delete,
    };

    const { error } = await supabaseAdmin.from('rows').update(patch).eq('row_id', rowId);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? 'save_failed' }, { status: 500 });
  }
}
