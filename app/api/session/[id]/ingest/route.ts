import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { verifyToken } from '@/lib/auth';
import { cookies } from 'next/headers';

type Body = {
  prev_names: string[];
  categories: string[];
  new_names: string[];
  image_urls: string[];
  use_alt_api?: boolean; // 참고용
};

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const sessionId = params.id;
  const token = (await cookies()).get('s_token')?.value;
  const payload = verifyToken(token);
  if (!payload || payload.session_id !== sessionId) {
    return NextResponse.json({ ok: false, error: 'unauth' }, { status: 401 });
  }

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'bad_json' }, { status: 400 });
  }

  const P = body.prev_names ?? [];
  const C = body.categories ?? [];
  const N = body.new_names ?? [];
  const U = body.image_urls ?? [];
  const len = Math.max(P.length, C.length, N.length, U.length);
  if (!len) return NextResponse.json({ ok: false, error: 'empty' }, { status: 400 });

  // 현재 세션에 이미 데이터가 있으면 order_no를 이어붙이기
  const { data: maxRow, error: maxErr } = await supabaseAdmin
    .from('rows')
    .select('order_no')
    .eq('session_id', sessionId)
    .order('order_no', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (maxErr) {
    return NextResponse.json({ ok: false, error: 'db_read' }, { status: 500 });
  }

  let base = maxRow?.order_no ?? 0;

  const rows = [];
  for (let i = 0; i < len; i++) {
    const prev = (P[i] ?? '').trim();
    const cat  = (C[i] ?? '').trim();
    const name = (N[i] ?? '').trim();
    const url  = (U[i] ?? '').trim();
    if (!url || (!prev && !name)) continue; // 이미지URL 필수, 이름 중 하나 이상

    base += 1;
    rows.push({
      session_id: sessionId,
      order_no: base,
      prev_name: prev || null,
      category: cat || null,
      src_img_url: url,
      selected_idx: null,
      baedaji: null,
      skip: false,
      delete: false,
      status: 'pending',
      edited_by: payload.sub ?? 'web',
    });
  }

  if (!rows.length) {
    return NextResponse.json({ ok: false, error: 'no_valid_rows' }, { status: 400 });
  }

  const { error } = await supabaseAdmin.from('rows').insert(rows);
  if (error) {
    return NextResponse.json({ ok: false, error: 'db_insert' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, inserted: rows.length });
}
