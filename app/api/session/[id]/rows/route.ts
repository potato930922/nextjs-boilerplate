// app/api/session/[id]/rows/route.ts
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { verifyToken } from "@/lib/auth";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  // Next 15: params는 Promise이므로 언래핑 필요
  const { id: sessionId } = await ctx.params;

  // 인증: 세션 토큰이 이 세션ID와 일치하는지 확인
  const token = (await cookies()).get("s_token")?.value;
  const payload = verifyToken(token);
  if (!payload || payload.session_id !== sessionId) {
    return NextResponse.json({ ok: false, error: "unauth" }, { status: 401 });
  }

  // 행 목록 조회 (work 화면에서 필요한 필드만)
  const { data, error } = await supabaseAdmin
    .from("rows")
    .select(
      "row_id, order_no, prev_name, category, src_img_url, main_thumb_url, selected_idx, baedaji, skip, delete, status"
    )
    .eq("session_id", sessionId)
    .order("order_no", { ascending: true });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, rows: data ?? [] });
}
