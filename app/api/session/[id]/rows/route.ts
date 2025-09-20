// app/api/session/[id]/rows/route.ts
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { verifyToken } from "@/lib/auth";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const token = (await cookies()).get("s_token")?.value;
    const payload = verifyToken(token);
    if (!payload || payload.session_id !== params.id) {
      return NextResponse.json({ ok:false, error:"unauth" }, { status:401 });
    }

    const { data, error } = await supabaseAdmin
      .from("rows")
      .select(`
        row_id,order_no,prev_name,category,src_img_url,main_thumb_url,selected_idx,baedaji,skip,delete,status,
        candidates: candidates ( idx, img_url, detail_url, price, promo_price, sales, seller )
      `)
      .eq("session_id", params.id)
      .order("order_no", { ascending: true });

    if (error) throw error;
    return NextResponse.json({ ok:true, rows: data ?? [] });
  } catch (e:any) {
    return NextResponse.json({ ok:false, error:e?.message ?? "db_error" }, { status:500 });
  }
}
