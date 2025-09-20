import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type IngestRow = {
  prev_name: string;
  category: string;
  new_name: string;
  src_img_url: string;
};

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  // 1) params 언래핑
  const { id: sessionId } = await ctx.params;

  // 2) 인증
  const token = (await cookies()).get("s_token")?.value;
  const payload = verifyToken(token);
  if (!payload || payload.session_id !== sessionId) {
    return NextResponse.json({ ok: false, error: "unauth" }, { status: 401 });
  }

  // 3) 입력 파싱
  const body = (await req.json()) as { rows: IngestRow[] };
  const rows = Array.isArray(body?.rows) ? body.rows : [];
  if (rows.length === 0) {
    return NextResponse.json({ ok: false, error: "no_rows" }, { status: 400 });
  }

  // 4) 기존 데이터 삭제(세션의 rows/candidates 정리)
  const delCand = await supabaseAdmin
    .from("candidates")
    .delete()
    .in(
      "row_id",
      (
        await supabaseAdmin.from("rows").select("row_id").eq("session_id", sessionId)
      ).data?.map((r: any) => r.row_id) || [-1]
    );

  if (delCand.error) {
    return NextResponse.json({ ok: false, error: delCand.error.message }, { status: 500 });
  }

  const delRows = await supabaseAdmin.from("rows").delete().eq("session_id", sessionId);
  if (delRows.error) {
    return NextResponse.json({ ok: false, error: delRows.error.message }, { status: 500 });
  }

  // 5) 신규 rows 일괄 삽입
  const insertRows = rows.map((r, i) => ({
    session_id: sessionId,
    order_no: i + 1,
    prev_name: r.prev_name ?? "",
    category: r.category ?? "",
    src_img_url: r.src_img_url ?? "",
    main_thumb_url: null,
    selected_idx: null,
    baedaji: null,
    skip: false,
    delete: false,
    status: "pending",
    edited_by: "web",
  }));

  const ins = await supabaseAdmin
    .from("rows")
    .insert(insertRows)
    .select("row_id");
  if (ins.error) {
    return NextResponse.json({ ok: false, error: ins.error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, inserted: insertRows.length });
}
