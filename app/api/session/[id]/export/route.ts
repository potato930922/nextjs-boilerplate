// app/api/session/[id]/export/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import ExcelJS from 'exceljs';
import { verifyToken } from '@/lib/auth';

// 필요시 환경 맞게 수정
type Item = {
  img_url: string;
  promo_price: number | null;
  price: number | null;
  sales: string | null;
  seller: string | null;
  detail_url: string;
  // title?: string; // 만약 서버에서 내려주면 사용
};

type Row = {
  row_id: number;
  order_no: number;
  prev_name: string | null;
  category: string | null;
  src_img_url: string | null;
  main_thumb_url: string | null;
  selected_idx: number | null;
  baedaji: number | null;
  skip: boolean | null;
  delete: boolean | null;
  status: string | null;
  // new_name?: string | null; // 있으면 사용
  candidates?: Item[];
};

// 유틸
const abs = (u?: string | null) => {
  if (!u) return '';
  return u.startsWith('//') ? `https:${u}` : u;
};

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> } // Next 15
) {
  const { id: sessionId } = await context.params;

  try {
    // ── 인증 ────────────────────────────────────────────────────────────────
    const jar = await cookies();  
    const token = jar.get('s_token')?.value || '';
    const payload = verifyToken(token);
    if (!payload || payload.session_id !== sessionId) {
      return NextResponse.json({ ok: false, error: 'unauth' }, { status: 401 });
    }

    // ── rows API에서 프리패치된 후보 포함해서 받아오기(서버에서 그대로 사용) ──
    const proto =
      req.headers.get('x-forwarded-proto') ||
      (process.env.NODE_ENV === 'production' ? 'https' : 'http');
    const host = req.headers.get('host')!;
    const baseUrl = `${proto}://${host}`;

    const rowsRes = await fetch(`${baseUrl}/api/session/${sessionId}/rows`, {
      // 쿠키 전달(선택)
      headers: token ? { cookie: `s_token=${token}` } : undefined,
      cache: 'no-store',
    });
    const rowsJson = await rowsRes.json();
    if (!rowsJson?.ok) {
      return NextResponse.json(
        { ok: false, error: rowsJson?.error || 'rows_failed' },
        { status: 500 }
      );
    }
    const rows: Row[] = rowsJson.rows || [];

    // ── Excel 워크북 구성 ────────────────────────────────────────────────
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Export');

    // 컬럼 폭/행 높이 살짝 보기 좋게
    ws.columns = [
      { header: '상품이미지', key: 'imgCol', width: 18 },
      { header: '이전상품명', key: 'prev', width: 35 },
      { header: '카테고리', key: 'cat', width: 20 },
      { header: '상품명', key: 'name', width: 35 },
      { header: '배송비', key: 'ship', width: 12 },
      { header: '상품URL', key: 'detail', width: 45 },
      { header: '이미지URL', key: 'imgurl', width: 50 },
    ];
    // 헤더 스타일
    ws.getRow(1).font = { bold: true };

    // 이미지 넣기 위한 헬퍼: 우리 프록시를 통해 바이트 받아오기
    const fetchImageBuffer = async (imgUrl: string) => {
      try {
        if (!imgUrl) return null;
        const proxied = `${baseUrl}/api/img?u=${encodeURIComponent(imgUrl)}`;
        const r = await fetch(proxied, { cache: 'no-store' });
        if (!r.ok) return null;
        const ab = await r.arrayBuffer();
        return Buffer.from(ab);
      } catch {
        return null;
      }
    };

    // 데이터 행 작성
    for (const row of rows.sort((a, b) => a.order_no - b.order_no)) {
      const selected =
        row.selected_idx != null && row.candidates
          ? row.candidates[row.selected_idx]
          : undefined;

      const productName =
        // @ts-ignore - new_name이 존재하면 사용
        (row as any).new_name ?? row.prev_name ?? '';

      const detailUrl = selected?.detail_url ? abs(selected.detail_url) : '';
      const imgUrl =
        selected?.img_url
          ? abs(selected.img_url)
          : row.main_thumb_url
          ? abs(row.main_thumb_url)
          : '';

      // 새로운 데이터 행 추가 (이미지는 나중에 삽입)
      const excelRow = ws.addRow({
        imgCol: '', // 이미지 자리
        prev: row.prev_name ?? '',
        cat: row.category ?? '',
        name: productName ?? '',
        ship: row.baedaji ?? null, // 숫자
        detail: detailUrl,
        imgurl: imgUrl,
      });

      // 상품URL/이미지URL 하이퍼링크 처리
      if (detailUrl) {
        const c = ws.getCell(`F${excelRow.number}`);
        c.value = { text: detailUrl, hyperlink: detailUrl };
        c.font = { color: { argb: 'FF1B73E8' }, underline: true };
      }
      if (imgUrl) {
        const c = ws.getCell(`G${excelRow.number}`);
        c.value = { text: imgUrl, hyperlink: imgUrl };
        c.font = { color: { argb: 'FF1B73E8' }, underline: true };
      }

      // 행 높이(썸네일 보기 좋게)
      ws.getRow(excelRow.number).height = 100;

      // 썸네일 삽입(가능한 경우)
      if (imgUrl) {
        const buf = await fetchImageBuffer(imgUrl);
        if (buf) {
          // 확장자 추정(대부분 jpeg)
          const lower = imgUrl.toLowerCase();
          const ext =
            lower.endsWith('.png') || lower.includes('image/png')
              ? 'png'
              : 'jpeg';
          const imageId = wb.addImage({ buffer: buf, extension: ext as any });

          // A열(1번째) 셀 내부에 맞춰 배치
          // 셀 좌표: col,row 기반(0-index 아님)
          ws.addImage(imageId, {
            tl: { col: 0, row: excelRow.number - 1 }, // A열 = 0
            br: { col: 1, row: excelRow.number }, // 한 셀 영역
            editAs: 'oneCell',
          });
        }
      }
    }

    // 숫자 서식(배송비)
    ws.getColumn('ship').numFmt = '#,##0';

    // 워크북 → 버퍼
    const buf = await wb.xlsx.writeBuffer();

    // 파일 응답
    const filename = `export_${sessionId}.xlsx`;
    return new NextResponse(buf as any, {
      status: 200,
      headers: {
        'content-type':
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'content-disposition': `attachment; filename="${encodeURIComponent(
          filename
        )}"`,
        'cache-control': 'no-store',
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || 'export_failed' },
      { status: 500 }
    );
  }
}
