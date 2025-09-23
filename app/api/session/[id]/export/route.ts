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
  ctx: { params: Promise<{ id: string }> } // ✅ Next.js 15: params는 Promise
) {
  const { id: sessionId } = await ctx.params; // ✅ await 필요

  // 인증
  const token = req.cookies.get('s_token')?.value;
  const payload = verifyToken(token);
  if (!payload || payload.session_id !== sessionId) {
    return NextResponse.json({ ok: false, error: 'unauth' }, { status: 401 });
  }

  // 데이터 조회
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

  // 🔸 동적 import (번들 이슈 회피)
  const XLSXMod = await import('xlsx');
  const XLSX = (XLSXMod as any).default ?? XLSXMod;

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

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(aoa);

  (ws as any)['!cols'] = [
    { wch: 6 },
    { wch: 28 },
    { wch: 18 },
    { wch: 40 },
    { wch: 10 },
    { wch: 18 },
    { wch: 10 },
    { wch: 12 },
    { wch: 14 },
    { wch: 42 },
    { wch: 10 },
    { wch: 16 },
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'results');

  const ab = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
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
