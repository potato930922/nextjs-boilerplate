import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { verifyToken } from '@/lib/auth';
import { cookies } from 'next/headers';
import ExcelJS from 'exceljs';

// exceljs는 Node 런타임 필요
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }   // ← Promise 타입
) {
  const { id: sessionId } = await ctx.params; // ← await

  const token = (await cookies()).get('s_token')?.value;
  const payload = verifyToken(token);
  if (!payload || payload.session_id !== sessionId) {
    return NextResponse.json({ ok: false, error: 'unauth' }, { status: 401 });
  }

  const { data: rows, error: rowsErr } = await supabaseAdmin
    .from('rows')
    .select('row_id, prev_name, category, src_img_url, new_name, baedaji, skip, delete, selected_idx')
    .eq('session_id', sessionId)
    .order('order_no', { ascending: true });

  if (rowsErr) {
    return NextResponse.json({ ok: false, error: 'db_rows' }, { status: 500 });
  }

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
    for (const r of rows) {
      const sel = r.selected_idx;
      if (sel === null) continue;
      const found = cands?.find(c => c.row_id === r.row_id && c.idx === sel);
      if (found) candMap.set(r.row_id, { detail_url: found.detail_url, img_url: found.img_url });
    }
  }

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Sheet1');
  ws.columns = [
    { header: '상품이미지', key: 'A', width: 40 },
    { header: '이전상품명', key: 'B', width: 30 },
    { header: '카테고리',   key: 'C', width: 20 },
    { header: '상품명',     key: 'D', width: 30 },
    { header: '배송비',     key: 'E', width: 12 },
    { header: '상품URL',    key: 'F', width: 60 },
    { header: '이미지URL',  key: 'G', width: 60 },
  ];

  const mainRows: any[] = [];
  const skipRows: any[] = [];

  for (const r of rows) {
    if (r.delete) continue;
    const base = {
      A: '',
      B: r.prev_name ?? '',
      C: r.category ?? '',
      D: r.new_name ?? '',
      E: r.baedaji ?? '',
      F: '',
      G: r.src_img_url || '',
    };
    if (!r.skip && r.selected_idx !== null) {
      const sel = candMap.get(r.row_id);
      mainRows.push({
        ...base,
        F: sel?.detail_url ?? '',
        G: sel?.img_url ? sel.img_url.replace(/^https:/, '') : base.G,
      });
    } else {
      skipRows.push(base);
    }
  }

  for (const row of [...mainRows, ...skipRows]) ws.addRow(row);

  const buf = await wb.xlsx.writeBuffer();

  return new NextResponse(buf as any, {
    status: 200,
    headers: {
      'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'content-disposition': 'attachment; filename="results.xlsx"',
      'cache-control': 'no-store',
    },
  });
}
