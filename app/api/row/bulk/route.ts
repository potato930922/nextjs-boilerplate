// app/api/row/bulk/route.ts
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { verifyToken } from '@/lib/auth';
import { cookies } from 'next/headers';
import { parse } from 'csv-parse/sync';

// 요청 바디 타입(참고용)
type RowInput = {
  order_no?: number;
  prev_name: string;
  category?: string;
  src_img_url: string;
  new_name?: string;
  baedaji?: number; // 원단위(천원 입력시 1000 곱해오기)
};

export async function POST(req: NextRequest) {
  try {
    const token = (await cookies()).get('s_token')?.value;
    const payload = verifyToken(token);
    if (!payload) {
      return NextResponse.json({ ok: false, error: 'unauth' }, { status: 401 });
    }

    // formData(파일 업로드) 또는 JSON 둘 다 지원
    let session_id = '';
    let rows: RowInput[] = [];

    const contentType = req.headers.get('content-type') || '';
    if (contentType.includes('multipart/form-data')) {
      const form = await req.formData();
      session_id = String(form.get('session_id') || '');
      const csvText = String(form.get('file') ? await (form.get('file') as File).text() : (form.get('csv') || ''));
      if (!session_id || !csvText) {
        return NextResponse.json({ ok: false, error: 'bad_request' }, { status: 400 });
      }
      rows = parse(csvText, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
      }).map((r: any) => ({
        prev_name: r.prev_name || r.이전상품명 || '',
        category: r.category ?? r.카테고리 ?? '',
        src_img_url: r.src_img_url ?? r.이미지URL ?? r.image_url ?? '',
        new_name: r.new_name ?? r.상품명 ?? '',
        baedaji: r.baedaji ? Number(r.baedaji) : (r.배송비 ? Number(r.배송비) : undefined),
      }));
    } else {
      const body = await req.json();
      session_id = body.session_id || payload.session_id; // 바디에 없으면 토큰의 세션으로
      if (body.rows && Array.isArray(body.rows)) {
        rows = body.rows as RowInput[];
      } else if (typeof body.csv === 'string') {
        rows = parse(body.csv, {
          columns: true,
          skip_empty_lines: true,
          trim: true,
        }).map((r: any) => ({
          prev_name: r.prev_name || r.이전상품명 || '',
          category: r.category ?? r.카테고리 ?? '',
          src_img_url: r.src_img_url ?? r.이미지URL ?? r.image_url ?? '',
          new_name: r.new_name ?? r.상품명 ?? '',
          baedaji: r.baedaji ? Number(r.baedaji) : (r.배송비 ? Number(r.배송비) : undefined),
        }));
      }
    }

    // 세션 검증
    if (!session_id || payload.session_id !== session_id) {
      return NextResponse.json({ ok: false, error: 'bad_session' }, { status: 400 });
    }
    if (!rows?.length) {
      return NextResponse.json({ ok: false, error: 'no_rows' }, { status: 400 });
    }

    // 현재 최대 order_no 조회
    const { data: maxRow, error: maxErr } = await supabaseAdmin
      .from('rows')
      .select('order_no')
      .eq('session_id', session_id)
      .order('order_no', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (maxErr) {
      return NextResponse.json({ ok: false, error: 'db_read' }, { status: 500 });
    }
    let nextOrder = (maxRow?.order_no ?? 0) + 1;

    // insert payload 만들기
    const payloadRows = rows
      .filter((r) => r.prev_name && r.src_img_url)
      .map((r) => ({
        session_id,
        order_no: r.order_no ?? nextOrder++,
        prev_name: r.prev_name,
        category: r.category ?? '',
        src_img_url: r.src_img_url,
        // 옵션 필드
        baedaji: r.baedaji ?? null,
      }));

    if (!payloadRows.length) {
      return NextResponse.json({ ok: false, error: 'invalid_rows' }, { status: 400 });
    }

    const { error: insErr, count } = await supabaseAdmin
      .from('rows')
      .insert(payloadRows, { count: 'exact' });

    if (insErr) {
      return NextResponse.json({ ok: false, error: 'db_insert', detail: insErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, inserted: count ?? payloadRows.length });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: 'server', detail: String(e?.message || e) }, { status: 500 });
  }
}
