// app/api/session/[id]/export/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { verifyToken } from '@/lib/auth';
import { ParamCtx, getParam, getToken } from '@/lib/route15';

// 간단 CSV 인코딩
function toCSV(rows: string[][]) {
  return rows
    .map(r =>
      r
        .map((v) => {
          const s = v ?? '';
          return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(',')
    )
    .join('\r\n');
}

export async function GET(req: NextRequest, context: ParamCtx<'id'>) {
  const sessionId = await getParam(context, 'id'); // ✅ Next.js 15 규격(params: Promise)

  try {
    // ── 인증 ─────────────────────────────────────────────
    const token = await getToken('s_token'); // cookies() 헬퍼
    const payload = verifyToken(token);
    if (!payload || payload.session_id !== sessionId) {
      return NextResponse.json({ ok: false, error: 'unauth' }, { status: 401 });
    }

    // rows 조회
    const { data: rows, error: rowsErr } = await supabaseAdmin
      .from('rows')
      .select('*')
      .eq('session_id', sessionId)
      .order('order_no');

    if (rowsErr) {
      return NextResponse.json({ ok: false, error: rowsErr.message }, { status: 500 });
    }

    // 후보들 조회 후 row_id => candidates 매핑
    const ids = (rows ?? []).map((r) => r.row_id);
    const candMap = new Map<number, any[]>();

    if (ids.length) {
      const { data: cands, error: cErr } = await supabaseAdmin
        .from('candidates')
        .select('row_id, idx, img_url, promo_price, price, sales, seller, detail_url')
        .in('row_id', ids)
        .order('idx', { ascending: true });

      if (!cErr) {
        (cands ?? []).forEach((c) => {
          if (!candMap.has(c.row_id)) candMap.set(c.row_id, []);
          candMap.get(c.row_id)!.push(c);
        });
      }
    }

    // 첫행(헤더)
    const header = [
      '이전상품명',
      '카테고리',
      '상품명',
      '원본이미지',
      '선택이미지URL',
      '정가',
      '프로모션가',
      '판매량',
      '판매자',
      '상세URL',
      '배대지(원)',
      '비고',
    ];

    // 데이터 행
    const body: string[][] = [];
    for (const r of rows ?? []) {
      const picks = candMap.get(r.row_id) ?? [];
      const sel =
        r.selected_idx != null &&
        r.selected_idx >= 0 &&
        r.selected_idx < picks.length
          ? picks[r.selected_idx]
          : null;

      body.push([
        r.prev_name ?? '',
        r.category ?? '',
        '', // (new_name을 rows에 안넣는 구조면 빈값)
        r.src_img_url ?? '',
        sel?.img_url ?? '',
        sel?.price != null ? String(sel.price) : '',
        sel?.promo_price != null ? String(sel.promo_price) : '',
        sel?.sales ?? '',
        sel?.seller ?? '',
        sel?.detail_url ?? '',
        r.baedaji != null ? String(r.baedaji) : '',
        r.skip ? '적합상품없음' : r.delete ? '삭제예정' : '',
      ]);
    }

    const csv = toCSV([header, ...body]);
    const fileName = `export_${sessionId}.csv`;

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="${encodeURIComponent(fileName)}"`,
        'cache-control': 'no-store',
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? 'export_failed' },
      { status: 500 }
    );
  }
}
