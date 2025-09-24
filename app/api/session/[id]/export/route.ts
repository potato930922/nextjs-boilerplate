// app/api/session/[id]/export/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import ExcelJS from 'exceljs';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { verifyToken } from '@/lib/auth';

export const runtime = 'nodejs'; // ✅ exceljs + fetch 이미지용 (Node 런타임)

// 엑셀 스타일 상수
const COLS = [
  { header: '상품이미지', key: 'img', width: 24 }, // 이미지 칼럼(폭)
  { header: '이전상품명', key: 'prev_name', width: 40 },
  { header: '카테고리', key: 'category', width: 28 },
  { header: '상품명', key: 'title', width: 46 },
  { header: '배송비', key: 'baedaji', width: 12 },
  { header: '상품URL', key: 'detail_url', width: 60 },
  { header: '이미지URL', key: 'img_url', width: 60 },
] as const;

type Item = {
  img_url: string;
  promo_price: number | null;
  price: number | null;
  sales: string | null;
  seller: string | null;
  detail_url: string;
  title?: string; // 일부 응답에는 title이 있을 수 있음
};

type RowDB = {
  order_no: number;
  prev_name: string | null;
  category: string | null;
  baedaji: number | null; // 원 단위
  selected_idx: number | null;
  candidates: Item[] | null;
  src_img_url: string | null;
};

function https(u?: string | null) {
  if (!u) return '';
  return u.startsWith('//') ? `https:${u}` : u;
}

// 워크시트에 이미지 사각형(셀 내부) 크기
const IMG_W = 160; // px
const IMG_H = 160; // px
const ROW_HEIGHT = 130; // pt 대략 (px과 1:1은 아님, 보기 좋은 값)

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const sessionId = params.id;

  try {
    // ── 인증 ────────────────────────────────────────────────────────────────
    const jar = await cookies();
    const token = jar.get('s_token')?.value;
    const payload = verifyToken(token);

    if (!payload || payload.session_id !== sessionId) {
      return NextResponse.json({ ok: false, error: 'unauth' }, { status: 401 });
    }

    // ── 데이터 로딩 ─────────────────────────────────────────────────────────
    const { data, error } = await supabaseAdmin
      .from('rows')
      .select(
        'order_no, prev_name, category, baedaji, selected_idx, candidates, src_img_url'
      )
      .eq('session_id', sessionId)
      .order('order_no', { ascending: true });

    if (error) {
      return NextResponse.json({ ok: false, error: String(error.message || error) }, { status: 500 });
    }

    const rows = (data || []) as RowDB[];

    // ── 엑셀 생성 ───────────────────────────────────────────────────────────
    const wb = new ExcelJS.Workbook();
    wb.creator = 'work-export';
    wb.created = new Date();

    const ws = wb.addWorksheet(`세션 ${sessionId}`, {
      views: [{ state: 'frozen', ySplit: 1 }], // 헤더 고정
    });

    // 컬럼/헤더 설정
    ws.columns = COLS.map(c => ({ header: c.header, key: c.key as string, width: c.width }));

    // 헤더 스타일
    const headerRow = ws.getRow(1);
    headerRow.font = { bold: true };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
    headerRow.height = 20;

    // ── 한 줄씩 작성 ─────────────────────────────────────────────────────────
    const origin = new URL(req.url).origin;

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const rowIdx = i + 2; // 실제 엑셀 row 번호(헤더 다음)

      // 선택된 후보
      const cand =
        (r.selected_idx != null &&
          Array.isArray(r.candidates) &&
          r.candidates[r.selected_idx | 0]) ||
        null;

      const title = (cand?.title ?? '').trim();
      const detailUrl = https(cand?.detail_url ?? '');
      const chosenImgUrl = https(cand?.img_url ?? '') || https(r.src_img_url);

      // 값 채우기(이미지 제외)
      ws.getCell(rowIdx, 2).value = r.prev_name ?? '';
      ws.getCell(rowIdx, 3).value = r.category ?? '';
      ws.getCell(rowIdx, 4).value = title;
      ws.getCell(rowIdx, 5).value = r.baedaji != null ? r.baedaji : '';
      ws.getCell(rowIdx, 6).value = detailUrl;
      ws.getCell(rowIdx, 7).value = chosenImgUrl;

      // 행 높이(이미지 칸이 보이도록)
      ws.getRow(rowIdx).height = ROW_HEIGHT;

      // 이미지 삽입(있을 때만)
      if (chosenImgUrl) {
        try {
          // referer 우회를 위해 내부 프록시 이용
          const proxied = `${origin}/api/img?u=${encodeURIComponent(chosenImgUrl)}`;
          const res = await fetch(proxied, { cache: 'no-store' });
          if (res.ok) {
            const ab = await res.arrayBuffer();
            const base64 = Buffer.from(ab).toString('base64');

            const ext: 'png' | 'jpeg' =
              /\.png($|\?)/i.test(chosenImgUrl) ? 'png' : 'jpeg';

            const imageId = wb.addImage({
              base64,
              extension: ext,
            });

            // A열(1번째) 셀 내부에 이미지 배치
            ws.addImage(imageId, {
              tl: { col: 0, row: rowIdx - 1 }, // tl은 0-index 기반
              ext: { width: IMG_W, height: IMG_H },
              editAs: 'oneCell',
            });
          }
        } catch {
          // 이미지 실패는 무시하고 텍스트만 남김
        }
      }

      // 약간의 테두리/정렬(선택)
      for (let c = 2; c <= 7; c++) {
        const cell = ws.getCell(rowIdx, c);
        cell.alignment = { vertical: 'middle', wrapText: true };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFDDDDDD' } },
          left: { style: 'thin', color: { argb: 'FFDDDDDD' } },
          bottom: { style: 'thin', color: { argb: 'FFDDDDDD' } },
          right: { style: 'thin', color: { argb: 'FFDDDDDD' } },
        };
      }
    }

    // 버퍼로 쓰기 및 응답
    const buf = await wb.xlsx.writeBuffer();

    const filename = `${sessionId}.xlsx`;
    return new NextResponse(buf, {
      status: 200,
      headers: {
        'content-type':
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'content-disposition': `attachment; filename="${encodeURIComponent(filename)}"`,
        'cache-control': 'no-store',
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: String(err?.message || err) },
      { status: 500 }
    );
  }
}
