import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { verify } from '@/lib/auth';
import { z } from 'zod';

const bodySchema = z.object({
  selected_idx: z.number().int().min(0).max(7).nullable(),
  baedaji: z.number().int().min(0).nullable(),
  skip: z.boolean().optional().default(false),
  delete: z.boolean().optional().default(false),
  expected_version: z.number().int(),
  actor: z.string().min(1),
});

export async function POST(req: NextRequest, { params }: { params: { rowId: string }}) {
  const token = req.cookies.get('s_token')?.value;
  if (!token) return NextResponse.json({ ok:false, error:'unauth' }, { status: 401 });
  const payload = await verify(token).catch(() => null);
  if (!payload) return NextResponse.json({ ok:false, error:'forbidden' }, { status: 403 });

  const { selected_idx, baedaji, skip, delete: del, expected_version, actor } =
    bodySchema.parse(await req.json());

  const { data, error } = await supabaseAdmin.rpc('save_row', {
    p_row_id: Number(params.rowId),
    p_selected_idx: selected_idx,
    p_baedaji: baedaji,
    p_skip: skip,
    p_delete: del,
    p_expected_version: expected_version,
    p_actor: actor,
  });

  if (error) return NextResponse.json({ ok:false, error:'db' }, { status: 500 });
  if (data === -1) return NextResponse.json({ ok:false, error:'version_conflict' }, { status: 409 });

  return NextResponse.json({ ok:true, new_version: data });
}
