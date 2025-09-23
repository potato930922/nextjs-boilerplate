// app/api/session/[id]/export/route.ts
import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { verifyToken } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Candidate = {
  img_url: string | null;
  detail_url: string | null;
  price: number | null;
  promo_price: number | null;
  sales: string | null;
  seller: string | null;
  idx?: number | null;
};

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const sessionId = params.id;

  // 인증 (세션 쿠키 s_token 확인)
  const token = req.cookies.get('s_token')?.value;
  const payload = verifyToken(token);
  if (!payload || payload.session_id !== sessionId) {
    return NextResponse.json({ ok: false, error: 'unauth' }, { status: 401 });
  }

  // rows + 선택된 candidate 조인
  const { data: rows, error } = await supabaseAdmin
    .from('rows')
    .select(
      `
      row_id, order_no, prev_name, category, src_img_url,
      selected_idx, baedaji, skip, delete, status,
      candidates: candidates (idx, img_url, detail_url, price, promo_price, sales, seller)
    `
    )
    .eq('session_id', sessionId)
    .order('order_no', { ascending: true });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  // 워크시트용 배열 만들기
  const out = [
    [
      '순번',
      '이전상품명',
      '카테고리',
      '원본이미지',
      '선택 인덱스',
      '판매자',
      '판매량',
      '가격(정가)',
      '가격(프로모션)',
      '상세링크',
      '배대지',
      '비고(skip/delete)',
    ],
  ] as (string | number | null)[][];

  for (const r of rows ?? []) {
    const cand: Candidate | undefined =
      Array.isArray(r.candidates) && typeof r.selected_idx === 'number'
        ? (r.candidates as Candidate[]).find((c) => c.idx === r.selected_idx)
        : undefined;

    const remark =
      (r.skip ? '[적합상품없음]' : '') + (r.delete ? (r.skip ? ' + ' : '') + '[삭제예정]' : '');

    out.push([
      r.order_no ?? '',
      r.prev_name ?? '',
      r.category ?? '',
      r.src_img_url ?? '',
      r.selected_idx ?? null,
      cand?.seller ?? '',
      cand?.sales ?? '',
      cand?.price ?? null,
      cand?.promo_price ?? null,
      cand?.detail_url ?? '',
      r.baedaji ?? null,
      remark || '',
    ]);
  }

  // XLSX 생성
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(out);
  XLSX.utils.book_append_sheet(wb, ws, 'results');

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  return new NextResponse(buf, {
    status: 200,
    headers: {
      'content-type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'content-disposition': `attachment; filename="results_${sessionId}.xlsx"`,
      'cache-control': 'no-store',
    },
  });
}
