// app/api/session/[id]/ingest/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { verifyToken } from '@/lib/auth';

type RawRow = {
  prev_name: string;
  category: string;
  new_name: string;
  src_img_url: string;
};

async function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

// 내부 검색 호출 헬퍼(저지연)
async function searchLow(origin: string, img: string) {
  const r = await fetch(`${origin}/api/search`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ img, mode: 'low' })
  });
  if (!r.ok) throw new Error(`search ${r.status}`);
  const j = await r.json();
  if (!j.ok) throw new Error(j.error || 'search_fail');
  return j.items as {
    img_url: string;
    detail_url: string;
    promo_price: number | null;
    price: number | null;
    sales: string | null;
    seller: string | null;
  }[];
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const sessionId = params.id;
  const origin = req.headers.get('origin') || process.env.NEXT_PUBLIC_SITE_URL || '';

  // 인증
  const token = (await req.cookies).get('s_token')?.value;
  const payload = verifyToken(token);
  if (!payload || payload.session_id !== sessionId) {
    return NextResponse.json({ ok: false, error: 'unauth' }, { status: 401 });
    }

  const body = await req.json().catch(() => ({}));
  const purge = !!body.purge;
  const rows: RawRow[] = Array.isArray(body.rows) ? body.rows : [];

  if (!rows.length) {
    return NextResponse.json({ ok: false, error: 'no_rows' }, { status: 400 });
  }

  // 1) 기존 rows/candidates 비우기(선택)
  if (purge) {
    await supabaseAdmin.from('candidates')
      .delete()
      .in('row_id',
        (await supabaseAdmin.from('rows').select('row_id').eq('session_id', sessionId)).data?.map(r => r.row_id) || []
      );
    await supabaseAdmin.from('rows').delete().eq('session_id', sessionId);
  }

  // 2) rows INSERT (status=pending)
  const toInsert = rows.map((r, i) => ({
    session_id: sessionId,
    order_no: i + 1,
    prev_name: r.prev_name || null,
    category: r.category || null,
    src_img_url: r.src_img_url || null,
    main_thumb_url: null,
    selected_idx: null,
    baedaji: null,
    skip: false,
    delete: false,
    status: 'pending',
    edited_by: 'ingest',
  }));
  const { data: inserted, error } = await supabaseAdmin
    .from('rows')
    .insert(toInsert)
    .select('row_id, src_img_url');
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  // 3) 각 row에 대해 저지연 이미지서치 → candidates 저장 → status=done
  //    (API 제한을 고려해 약간의 sleep)
  for (const r of inserted!) {
    const img = r.src_img_url as string | null;
    if (!img) {
      await supabaseAdmin.from('rows').update({ status: 'skipped' }).eq('row_id', r.row_id);
      continue;
    }
    try {
      const items = await searchLow(origin, img);
      const payload = items.slice(0, 8).map((it, idx) => ({
        row_id: r.row_id,
        idx,
        img_url: it.img_url,
        detail_url: it.detail_url,
        price: it.price,
        promo_price: it.promo_price,
        sales: it.sales,
        seller: it.seller,
      }));
      if (payload.length) {
        await supabaseAdmin.from('candidates').insert(payload);
      }
      await supabaseAdmin.from('rows').update({ status: 'done' }).eq('row_id', r.row_id);
    } catch (e) {
      // 실패 시 넘김 (progress엔 미포함되지만 pending으로 남음)
      await supabaseAdmin.from('rows').update({ status: 'pending' }).eq('row_id', r.row_id);
    }
    await sleep(300); // RapidAPI rate-limit 보호
  }

  return NextResponse.json({ ok: true, inserted: inserted?.length || 0 });
}
