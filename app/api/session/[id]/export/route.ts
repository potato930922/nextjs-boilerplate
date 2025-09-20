import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import ExcelJS from "exceljs";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;                   // ← Promise 언래핑
  const token = (await cookies()).get("s_token")?.value;
  const payload = verifyToken(token);
  if (!payload || payload.session_id !== id) {
    return new Response(JSON.stringify({ ok:false, error:"unauth" }), { status:401 });
  }

  const { data: rows, error } = await supabaseAdmin
    .from("rows")
    .select(`
      row_id, order_no, prev_name, category, selected_idx, baedaji, skip, delete, src_img_url,
      candidates: candidates ( idx, img_url, detail_url )
    `)
    .eq("session_id", id)
    .order("order_no", { ascending: true });

  if (error) {
    return new Response(JSON.stringify({ ok:false, error:"db_rows" }), { status:500 });
  }

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Results");
  const header = ["상품이미지", "이전상품명", "카테고리", "상품명", "배송비", "상품URL", "이미지URL"];
  ws.addRow(header);

  for (const r of rows || []) {
    if (r.delete) continue;
    const bae = r.baedaji ?? "";
    let prodUrl = "", imgUrl = r.src_img_url || "";

    if (!r.skip && r.selected_idx != null) {
      const sel = (r.candidates || []).find((c:any) => c.idx === r.selected_idx);
      if (sel) {
        prodUrl = sel.detail_url || "";
        imgUrl  = sel.img_url || imgUrl;
      }
    }

    ws.addRow([
      "",
      r.prev_name || "",
      r.category || "",
      "",
      bae,
      prodUrl,
      imgUrl?.startsWith("https:") ? imgUrl.slice(6) : imgUrl,
    ]);
  }

  ws.getColumn(1).width = 40;
  ws.getColumn(2).width = 30;
  ws.getColumn(3).width = 20;
  ws.getColumn(4).width = 30;

  const buf = await wb.xlsx.writeBuffer();
  return new Response(buf, {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="results.xlsx"`,
    },
  });
}
