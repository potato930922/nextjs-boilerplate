// app/api/session/[id]/export/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { verifyToken } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Candidate = {
  idx: number | null;
  img_url: string | null;
  detail_url: string | null;
  price: number | null;
  promo_price: number | null;
  sales: string | null;
  seller: string | null;
};

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const sessionId = params.id;

  // 인증
  const token = req.cookies.get('s_token')?.value;
  const payload = verifyToken(token);
  if (!payload || payload.session_id !== sessionId) {
    return NextResponse.json({ ok: false, error: 'unauth' }, { status: 401 });
  }

  // 데이터 조회 (rows + candidates)
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

  // 🔸 동적 import (Turbopack/Edge 번들 이슈 회피)
  const XLSXMod = await import('xlsx');
  const XLSX = XLSXMod?.default ?? XLSXMod;

  // 시트 헤더
  const header = [
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
  ];

  // rows → 2차원 배열
  const aoa: any[][] = [header];

  for (const r of rows ?? []) {
    const cands = (r as any).candidates as Candidate[] | null;
    const selected =
      Array.isArray(cands) && typeof r.selected_idx === 'number'
        ? cands.find((c) => c.idx === r.selected_idx)
        : undefined;

    const remark =
      (r.skip ? '[적합상품없음]' : '') +
      (r.delete ? (r.skip ? ' + ' : '') + '[삭제예정]' : '');

    aoa.push([
      r.order_no ?? '',
      r.prev_name ?? '',
      r.category ?? '',
      r.src_img_url ?? '',
      r.selected_idx ?? '',
      selected?.seller ?? '',
      selected?.sales ?? '',
      selected?.price ?? '',
      selected?.promo_price ?? '',
      selected?.detail_url ?? '',
      r.baedaji ?? '',
      remark || '',
    ]);
  }

  // 워크북/시트 생성
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(aoa);

  // 열 너비 살짝 지정(가독성)
  (ws as any)['!cols'] = [
    { wch: 6 },  // 순번
    { wch: 28 }, // 이전상품명
    { wch: 18 }, // 카테고리
    { wch: 40 }, // 원본이미지
    { wch: 10 }, // 선택 인덱스
    { wch: 18 }, // 판매자
    { wch: 10 }, // 판매량
    { wch: 12 }, // 가격(정가)
    { wch: 14 }, // 가격(프로모션)
    { wch: 42 }, // 상세링크
    { wch: 10 }, // 배대지
    { wch: 16 }, // 비고
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'results');

  // Node에서 ArrayBuffer로 쓰기
  const ab = XLSX.write(wb, {
    type: 'array',
    bookType: 'xlsx',
  }) as ArrayBuffer;

  const buf = Buffer.from(ab);

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
