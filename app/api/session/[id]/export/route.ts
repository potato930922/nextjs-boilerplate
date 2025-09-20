import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { verifyToken } from '@/lib/auth';
import { cookies } from 'next/headers';
import ExcelJS from 'exceljs';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const sessionId = params.id;
  const token = (await cookies()).get('s_token')?.value;
  const payload = verifyToken(token);
  if (!payload || payload.session_id !== sessionId) {
    return NextResponse.json({ ok: false, error: 'unauth' }, { status: 401 });
  }

  // rows 가져오기
  const { data: rows, error: rowsErr } = await supabaseAdmin
    .from('rows')
    .select('row_id, prev_name, category, src_img_url, new_name, baedaji, skip, delete, selected_idx')
    .eq('session_id', sessionId)
    .order('order_no', { ascending: true });

  if (rowsErr) {
    return NextResponse.json({ ok: false, error: 'db_rows' }, { status: 500 });
  }

  // 선택된 후보 가져오기 (선택된 것만)
  const selectedRowIds = rows
    .filter(r => !r.delete && !r.skip && r.selected_idx !== null)
    .map(r => r.row_id);

  let candMap = new Map<number, { detail_url: string; img_url: string }>();
  if (selectedRowIds.length) {
    const { data: cands, error: cErr } = await supabaseAdmin
      .from('candidates')
      .select('row_id, idx, detail_url, img_url')
      .in('row_id', selectedRowIds);

    if (cErr) {
      return NextResponse.json({ ok: false, error: 'db_cands' }, { status: 500 });
    }
    // row_id + idx 매칭해서 map 생성
    for (const r of rows) {
      const sel = r.selected_idx;
      if (sel === null) continue;
      const found = cands?.find(c => c.row_id === r.row_id && c.idx === sel);
      if (found) candMap.set(r.row_id, { detail_url: found.detail_url, img_url: found.img_url });
    }
  }

  // 엑셀 구성 (원래 포맷 유지)
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Sheet1');

  ws.columns = [
    { header: '상품이미지', key: 'colA', width: 40 },
    { header: '이전상품명', key: 'colB', width: 30 },
    { header: '카테고리',   key: 'colC', width: 20 },
    { header: '상품명',     key: 'colD', width: 30 },
    { header: '배송비',     key: 'colE', width: 12 },
    { header: '상품URL',    key: 'colF', width: 60 },
    { header: '이미지URL',  key: 'colG', width: 60 },
  ];

  const mainRows: any[] = [];
  const skipRows: any[] = [];

  for (const r of rows) {
    if (r.delete) continue;

    const base = {
      colA: '',
      colB: r.prev_name ?? '',
      colC: r.category ?? '',
      colD: r.new_name ?? '',
      colE: r.baedaji ?? '',
      colF: '',
      colG: r.src_img_url || '',
    };

    if (!r.skip && r.selected_idx !== null) {
      const sel = candMap.get(r.row_id);
      mainRows.push({
        ...base,
        colF: sel?.detail_url ?? '',
        colG: sel?.img_url ? sel.img_url.replace(/^https:/, '') : base.colG,
      });
    } else {
      // skip 또는 미선택 → 뒤에 붙임
      skipRows.push(base);
    }
  }

  for (const row of [...mainRows, ...skipRows]) ws.addRow(row);

  const buf = await wb.xlsx.writeBuffer();

  return new NextResponse(buf as any, {
    status: 200,
    headers: {
      'content-type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'content-disposition': `attachment; filename="results.xlsx"`,
      'cache-control': 'no-store',
    },
  });
}
