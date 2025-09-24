// app/api/session/[id]/export/route.ts
import { NextRequest, NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { verifyToken } from '@/lib/auth';

export const runtime = 'nodejs';

const COLS = [
  { header: '상품이미지', key: 'img', width: 24 },
  { header: '이전상품명', key: 'prev_name', width: 40 },
  { header: '카테고리', key: 'category', width: 28 },
  { header: '상품명', key: 'title', width: 46 },
  { header: '배송비', key: 'baedaji', width: 12 },
  { header: '상품URL', key: 'detail_url', width: 60 },
  { header: '이미지URL', key: 'img_url', width: 60 },
] as const;

type Cand = {
  row_id: number;
  idx: number;
  img_url: string | null;
  detail_url: string | null;
  title?: string | null;
  price?: number | null;
  promo_price?: number | null;
  sales?: string | null;
  seller?: string | null;
};

type RowDB = {
  row_id: number;
  order_no: number;
  prev_name: string | null;
  category: string | null;
  baedaji: number | null;
  selected_idx: number | null;
  src_img_url: string | null;
};

function https(u?: string | null) {
  if (!u) return '';
  return u.startsWith('//') ? `https:${u}` : u;
}

const IMG_W = 160;
const IMG_H = 160;
const ROW_HEIGHT = 130;

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id: sessionId } = await context.params;

  try {
    // ── 인증 ─────────────────────────────────────────────
    const token = req.cookies.get('s_token')?.value;
    const payload = verifyToken(token);
    if (!payload || payload.session_id !== sessionId) {
      return NextResponse.json({ ok: false, error: 'unauth' }, { status: 401 });
    }

    // 1) rows 읽기
    const { data: rowsData, error: rowsErr } = await supabaseAdmin
      .from('rows')
      .select('row_id, order_no, prev_name, category, baedaji, selected_idx, src_img_url')
      .eq('session_id', sessionId)
      .order('order_no', { ascending: true });

    if (rowsErr) {
      return NextResponse.json({ ok: false, error: String(rowsErr.message || rowsErr) }, { status: 500 });
    }

    const rows = (rowsData || []) as RowDB[];
    const rowIds = rows.map(r => r.row_id);
    // 빈 경우도 엑셀은 내려주자
    // 2) candidates 한번에 읽기
    let candMap = new Map<number, Cand[]>();
    if (rowIds.length) {
      const { data: cands, error: candErr } = await supabaseAdmin
        .from('candidates')
        .select('row_id, idx, img_url, detail_url, title, price, promo_price, sales, seller')
        .in('row_id', rowIds);

      if (candErr) {
        return NextResponse.json({ ok: false, error: String(candErr.message || candErr) }, { status: 500 });
      }

      for (const c of (cands || []) as Cand[]) {
        const arr = candMap.get(c.row_id) || [];
        arr.push(c);
        candMap.set(c.row_id, arr);
      }
    }

    // 엑셀 생성
    const wb = new ExcelJS.Workbook();
    wb.creator = 'work-export';
    wb.created = new Date();

    const ws = wb.addWorksheet(`세션 ${sessionId}`, {
      views: [{ state: 'frozen', ySplit: 1 }],
    });

    ws.columns = COLS.map(c => ({ header: c.header, key: c.key as string, width: c.width }));

    const headerRow = ws.getRow(1);
    headerRow.font = { bold: true };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
    headerRow.height = 20;

    // 절대 URL (이미지 프록시 호출용)
    const origin = new URL(req.url).origin;

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const rowIdx = i + 2;

      const allCands = candMap.get(r.row_id) || [];
      const cand = (r.selected_idx != null)
        ? allCands.find(c => (c.idx | 0) === (r.selected_idx as number))
        : undefined;

      const title = (cand?.title ?? '').trim();
      const detailUrl = https(cand?.detail_url ?? '');
      const chosenImgUrl = https(cand?.img_url ?? '') || https(r.src_img_url);

      ws.getCell(rowIdx, 2).value = r.prev_name ?? '';
      ws.getCell(rowIdx, 3).value = r.category ?? '';
      ws.getCell(rowIdx, 4).value = title;
      ws.getCell(rowIdx, 5).value = r.baedaji != null ? r.baedaji : '';
      ws.getCell(rowIdx, 6).value = detailUrl;
      ws.getCell(rowIdx, 7).value = chosenImgUrl;

      ws.getRow(rowIdx).height = ROW_HEIGHT;

      if (chosenImgUrl) {
        try {
          // 프록시 통해 이미지 받아 Excel 삽입
          const proxied = `${origin}/api/img?u=${encodeURIComponent(chosenImgUrl)}`;
          const res = await fetch(proxied, { cache: 'no-store' });
          if (res.ok) {
            const ab = await res.arrayBuffer();
            const base64 = Buffer.from(ab).toString('base64');
            const ext: 'png' | 'jpeg' = /\.png($|\?)/i.test(chosenImgUrl) ? 'png' : 'jpeg';

            const imageId = wb.addImage({
              base64,
              extension: ext,
            });

            ws.addImage(imageId, {
              tl: { col: 0, row: rowIdx - 1 },
              ext: { width: IMG_W, height: IMG_H },
              editAs: 'oneCell',
            });
          }
        } catch {
          /* ignore image errors */
        }
      }

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

    const buf = await wb.xlsx.writeBuffer();
    const filename = `${sessionId}.xlsx`;
    return new NextResponse(buf, {
      status: 200,
      headers: {
        'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'content-disposition': `attachment; filename="${encodeURIComponent(filename)}"`,
        'cache-control': 'no-store',
      },
    });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: String(err?.message || err) }, { status: 500 });
  }
}
