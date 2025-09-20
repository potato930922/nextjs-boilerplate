import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyToken } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

async function searchTaobao(img: string, mode: 'low'|'alt'='low') {
  const url = mode === 'low'
    ? 'https://taobao-advanced.p.rapidapi.com/item_image_search'
    : 'https://taobao-advanced.p.rapidapi.com/api?api=item_image_search';
  const headers: Record<string,string> = {
    'x-rapidapi-host': 'taobao-advanced.p.rapidapi.com',
    'x-rapidapi-key': process.env.RAPIDAPI_KEY_LOW ?? process.env.RAPIDAPI_KEY_ALT ?? ''
  };
  const u = new URL(url);
  u.searchParams.set('img', img.startsWith('//') ? `https:${img}` : img);

  const r = await fetch(u, { headers, cache: 'no-store' });
  if (!r.ok) return [];
  const j = await r.json();
  const data = j?.result?.item ?? j?.data ?? [];
  return (data as any[]).slice(0,8).map((i, idx) => ({
    idx,
    img_url: (i.pic?.startsWith('//') ? `https:${i.pic}` : i.pic) ?? '',
    detail_url: (i.detail_url?.startsWith('//') ? `https:${i.detail_url}` : i.detail_url) ?? '',
    price: i.price==null? null : Number(i.price),
    promo_price: i.promotion_price==null? null : Number(i.promotion_price),
    sales: i.sales ?? null,
    seller: i.seller_nick ?? null,
  }));
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }>}) {
  const { id: sessionId } = await ctx.params;
  const token = (await cookies()).get('s_token')?.value;
  const payload = verifyToken(token);
  if (!payload || payload.session_id !== sessionId)
    return NextResponse.json({ ok:false, error:'unauth' }, { status:401 });

  const mode = (new URL(req.url).searchParams.get('mode') as 'low'|'alt') ?? 'low';

  // rows 읽기
  const { data: rows, error } = await supabaseAdmin
    .from('rows').select('row_id, src_img_url').eq('session_id', sessionId).order('order_no');

  if (error) return NextResponse.json({ ok:false, error: error.message }, { status:500 });

  for (const row of rows ?? []) {
    const img = row.src_img_url ?? '';
    if (!img) continue;

    // 기존 후보 삭제
    await supabaseAdmin.from('candidates').delete().eq('row_id', row.row_id);

    const items = await searchTaobao(img, mode);
    if (items.length) {
      await supabaseAdmin.from('candidates').insert(
        items.map(it => ({ row_id: row.row_id, ...it }))
      );
    }
    // 너무 과도 호출 방지
    await new Promise(r=>setTimeout(r, 250));
  }

  return NextResponse.json({ ok:true });
}
