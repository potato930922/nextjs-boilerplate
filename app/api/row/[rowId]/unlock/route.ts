import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { verify } from '@/lib/auth';
import { z } from 'zod';

const schema = z.object({});

export async function POST(req: NextRequest, { params }: { params: { rowId: string }}) {
  const token = req.cookies.get('s_token')?.value;
  if (!token) return NextResponse.json({ ok:false, error:'unauth' }, { status: 401 });
  const payload = await verify(token).catch(() => null);
  if (!payload) return NextResponse.json({ ok:false, error:'forbidden' }, { status: 403 });

  const { error } = await supabaseAdmin.rpc('release_lock', { p_row_id: Number(params.rowId) });
  if (error) return NextResponse.json({ ok:false, error:'db' }, { status: 500 });
  return NextResponse.json({ ok:true });
}
