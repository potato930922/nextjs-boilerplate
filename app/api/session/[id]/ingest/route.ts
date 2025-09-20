// app/api/session/[id]/ingest/route.ts
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type InRow = {
  prev_name: string;
  category: string;
  new_name: string;
  src_img_url: string; // 이미지 원본 URL
};

function salesToInt(s: string | null): number {
  if (!s) return -1;
  const t = s.toLowerCase().replace(/,/g,'').trim();
  const m = t.match(/([\d\.]+)\s*([kw万]?)/);
  if (!m) { const d = t.match(/\d+/); return d ? Number(d[0]) : -1; }
  let n = parseFloat(m[1]); const u = m[2];
  if (u === 'w' || u === '万') n *= 10000;
  if (u === 'k') n *= 1000;
  return Math.round(n);
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const token = (await cookies()).get("s_token")?.value;
    const payload = verifyToken(token);
    if (!payload || payload.session_id !== params.id) {
      return NextResponse.json({ ok:false, error:"unauth" }, { status:401 });
    }

    const body = await req.json() as { rows: InRow[] };
    const rows = (body?.rows || []).filter(r => r.src_img_url && (r.prev_name || r.new_name));
    if (rows.length === 0) return NextResponse.json({ ok:false, error:"no_rows" }, { status:400 });

    // 1) 기존 데이터 삭제
    await supabaseAdmin.from("candidates")
      .delete()
      .in("row_id",
        (await supabaseAdmin.from("rows").select("row_id").eq("session_id", params.id)).data?.map(r=>r.row_id) || []
      );
    await supabaseAdmin.from("rows").delete().eq("session_id", params.id);

    // 2) rows 입력
    const toInsert = rows.map((r, i) => ({
      session_id: params.id,
      order_no: i + 1,
      prev_name: r.prev_name || r.new_name || "",
      category: r.category || "",
      src_img_url: r.src_img_url || "",
      main_thumb_url: r.src_img_url || "",
      status: "pending",
    }));
    const { data: newRows, error: insErr } = await supabaseAdmin
      .from("rows").insert(toInsert).select("row_id, src_img_url");
    if (insErr) throw insErr;

    // 3) 일괄 프리페치(저지연만) + candidates 저장 + 자동선택
    const key = process.env.RAPIDAPI_KEY_LOW;
    if (!key) return NextResponse.json({ ok:false, error:"rapidapi_key_missing" }, { status:500 });

    const HOST = "taobao-advanced.p.rapidapi.com";
    const URL = `https://${HOST}/item_image_search`;

    for (const r of newRows) {
      const url = r.src_img_url?.startsWith("//") ? "https:" + r.src_img_url : r.src_img_url;
      const resp = await fetch(`${URL}?img=${encodeURIComponent(url)}`, {
        headers:{ "x-rapidapi-key": key, "x-rapidapi-host": HOST },
      });
      const j = await resp.json();
      const arr = (j?.result?.item ?? j?.data ?? []).slice(0,8);

      // candidates 저장
      const cands = arr.map((it:any, i:number) => ({
        row_id: r.row_id,
        idx: i,
        img_url: it?.pic ? (it.pic.startsWith("//") ? "https:" + it.pic : it.pic) : "",
        detail_url: it?.detail_url ? (it.detail_url.startsWith("//") ? "https:" + it.detail_url : it.detail_url) : "",
        price: it?.price ?? null,
        promo_price: it?.promotion_price ?? null,
        sales: it?.sales ?? null,
        seller: it?.seller_nick ?? null,
      }));
      while (cands.length < 8) cands.push({
        row_id: r.row_id, idx: cands.length, img_url:"", detail_url:"", price:null, promo_price:null, sales:null, seller:null
      });
      await supabaseAdmin.from("candidates").insert(cands);

      // 자동 선택(판매량 최댓값)
      const best = cands
        .map((c, i) => ({ i, s: salesToInt(c.sales) }))
        .sort((a,b)=>b.s-a.s)[0]?.i ?? null;

      await supabaseAdmin.from("rows")
        .update({ selected_idx: best })
        .eq("row_id", r.row_id);
    }

    return NextResponse.json({ ok:true, inserted: newRows.length });
  } catch (e:any) {
    return NextResponse.json({ ok:false, error: e?.message ?? "ingest_error" }, { status:500 });
  }
}
