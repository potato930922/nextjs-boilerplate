import { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { verifyToken } from '@/lib/auth';

/**
 * 간단 CSV 다운로드 (엑셀에서 바로 열림)
 * 컬럼: 상품이미지, 이전상품명, 카테고리, 상품명, 배송비, 상품URL, 이미지URL
 *  - 상품URL: rows.selected_idx 가 가리키는 candidates.detail_url 을 우선 사용(없으면 빈칸)
 *  - 이미지URL: 선택된 후보 img_url 이 있으면 그것, 아니면 원본 src_img_url
 *
 * 필요 시 XLSX 로 변경 가능(현재는 의존성 없이 가볍게 CSV 제공)
 */
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> } // ✅
) {
  const { id: sessionId } = await context.params; // ✅

  const token = (await req.cookies).get('s_token')?.value;
  const payload = verifyToken(token);
  if (!payload || payload.session_id !== sessionId) {
    return new Response(JSON.stringify({ ok: false, error: 'unauth' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    });
  }

  // rows
  const { data: rows, error: rerr } = await supabaseAdmin
    .from('rows')
    .select(
      `row_id, order_no, prev_name, category, src_img_url, main_thumb_url,
       selected_idx, baedaji, skip, "delete", status`
    )
    .eq('session_id', sessionId)
    .order('order_no', { ascending: true });

  if (rerr) {
    return new Response(JSON.stringify({ ok: false, error: 'db_rows' }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }

  // candidates (선택된 idx만 쓰기 위해 한 번에 전부 로드)
  const rowIds = (rows ?? []).map(r => r.row_id);
  let candByRow = new Map<number, any[]>();
  if (rowIds.length) {
    const { data: cands, error: cerr } = await supabaseAdmin
      .from('candidates')
      .select('row_id, idx, img_url, detail_url, price, promo_price, sales, seller')
      .in('row_id', rowIds);

    if (!cerr && cands) {
      for (const c of cands) {
        const arr = candByRow.get(c.row_id) ?? [];
        arr.push(c);
        candByRow.set(c.row_id, arr);
      }
    }
  }

  // CSV 만들기
  const escape = (v: any) => {
    const s = String(v ?? '');
    if (s.includes('"') || s.includes(',') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };

  const header = [
    '상품이미지',
    '이전상품명',
    '카테고리',
    '상품명',
    '배송비',
    '상품URL',
    '이미지URL',
  ];

  const lines: string[] = [];
  lines.push(header.map(escape).join(','));

  for (const r of rows ?? []) {
    if (r.delete) continue; // 삭제 예정은 제외

    // 선택된 후보
    let selectedUrl = '';
    let selectedImg = '';
    if (r.selected_idx != null) {
      const list = candByRow.get(r.row_id) ?? [];
      const found = list.find(x => x.idx === r.selected_idx);
      if (found) {
        selectedUrl = found.detail_url ?? '';
        selectedImg = found.img_url ?? '';
      }
    }

    const imgFinal = selectedImg || r.src_img_url || '';
    const ship = r.baedaji ? String(r.baedaji) : '';

    const row = [
      '', // "상품이미지" 셀(엑셀 이미지 삽입은 CSV로는 불가, 링크만 저장)
      r.prev_name ?? '',
      r.category ?? '',
      '', // "상품명"은 작업 중 새 이름이 따로 있으면 여기에 매핑(현재 스키마엔 new_name 칼럼 없음)
      ship,
      selectedUrl,
      imgFinal,
    ];

    lines.push(row.map(escape).join(','));
  }

  const csv = lines.join('\r\n');

  return new Response(csv, {
    status: 200,
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="results.csv"`,
      'cache-control': 'no-store',
    },
  });
}
