import { NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { verifyToken } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import ExcelJS from 'exceljs';

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }>}) {
  const { id: sessionId } = await ctx.params;
  const token = (await cookies()).get('s_token')?.value;
  const payload = verifyToken(token);
  if (!payload || payload.session_id !== sessionId)
    return new Response(JSON.stringify({ ok:false, error:'unauth' }), { status:401 });

  // 1) 선택된 행만 가져오기
  const { data: rows, error } = await supabaseAdmin
    .from('rows')
    .select('row_id, prev_name, category, new_name, baedaji, selected_idx')
    .eq('session_id', sessionId)
    .is('delete', false)
    .is('skip', false)
    .not('selected_idx','is', null)
    .order('order_no');

  if (error) return new Response(JSON.stringify({ ok:false, error:error.message }), { status:500 });

  // 2) 각 행의 선택된 후보 1개 조회
  const out: Array<Record<string, any>> = [];
  for (const r of rows ?? []) {
    const { data: cand } = await supabaseAdmin
      .from('candidates')
      .select('detail_url, img_url')
      .eq('row_id', r.row_id)
      .eq('idx', r.selected_idx)
      .single();

    out.push({
      상품이미지: '',
      이전상품명: r.prev_name ?? '',
      카테고리: r.category ?? '',
      상품명: (r as any).new_name ?? r.prev_name ?? '',
      배송비: r.baedaji ?? '',
      상품URL: cand?.detail_url ?? '',
      이미지URL: cand?.img_url?.startsWith('//') ? `https:${cand?.img_url}` : (cand?.img_url ?? ''),
    });
  }

  // 3) 엑셀 생성
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Sheet1');
  ws.columns = [
    { header: '상품이미지', key: '상품이미지', width: 40 },
    { header: '이전상품명', key: '이전상품명', width: 30 },
    { header: '카테고리', key: '카테고리', width: 25 },
    { header: '상품명', key: '상품명', width: 30 },
    { header: '배송비', key: '배송비', width: 12 },
    { header: '상품URL', key: '상품URL', width: 60 },
    { header: '이미지URL', key: '이미지URL', width: 60 },
  ];
  ws.addRows(out);

  const buf = await wb.xlsx.writeBuffer();
  return new Response(buf, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="results.xlsx"`,
    }
  });
}
