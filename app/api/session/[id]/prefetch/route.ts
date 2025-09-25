// app/api/session/[id]/prefetch/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import crypto from 'crypto';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { verifyToken } from '@/lib/auth';

// 내부 이미지 정규화(알리/타오 전용 https 보정)
const https = (u?: string | null) => (u?.startsWith('//') ? `https:${u}` : (u || ''));

// 8칸 고정 포맷
type Cand = {
  idx: number;
  img_url: string;
  detail_url: string;
  price: number | null;
  promo_price: number | null;
  sales: string | null;
  seller: string | null;
};

async function fetchTaobaoItems(imgUrl: string) {
  // 내부 프록시 라우트 사용 권장: /api/taobao/search
  const r = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || ''}/api/taobao/search`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    cache: 'no-store',
    body: JSON.stringify({ img: imgUrl, mode: 'low' }),
  }).catch(() => null);

  if (!r || !r.ok) return [];
  const j = await r.json().catch(() => ({}));
  const items = Array.isArray(j?.items) ? j.items : [];
  // idx 보장
  return (items as any[]).slice(0, 8).map((i, idx) => ({
    idx,
    img_url: https(i?.img_url),
    detail_url: https(i?.detail_url),
    price: i?.price == null ? null : Number(i.price),
    promo_price: i?.promo_price == null ? null : Number(i.promo_price),
    sales: i?.sales ?? null,
    seller: i?.seller ?? null,
  })) as Cand[];
}

async function runWithPool<T>(
  tasks: (() => Promise<T>)[],
  limit = 3
): Promise<T[]> {
  const results: T[] = [];
  let i = 0;
  let running = 0;

  return await new Promise<T[]>((resolve) => {
    const kick = () => {
      while (running < limit && i < tasks.length) {
        const my = i++;
        running++;
        tasks[my]().then((res) => {
          results[my] = res;
        }).finally(() => {
          running--;
          if (results.length === tasks.length && results.every((v) => v !== undefined)) {
            resolve(results);
          } else {
            kick();
          }
        });
      }
    };
    kick();
  });
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> } // ✅ Next 15: Promise 형태
) {
  const { id: sessionId } = await context.params; // ✅ await 필요

  try {
    // 인증
    const token = cookies().get('s_token')?.value; // ✅ 동기
    const payload = verifyToken(token);
    if (!payload || payload.session_id !== sessionId) {
      return NextResponse.json({ ok: false, error: 'unauth' }, { status: 401 });
    }

    // 세션의 rows 조회
    const { data: rows, error } = await supabaseAdmin
      .from('rows')
      .select('row_id, src_img_url')
      .eq('session_id', sessionId)
      .order('order_no', { ascending: true });

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    const valid = (rows ?? []).filter((r) => r.src_img_url);

    // 후보 초기화(중복 방지: row별 candidates 삭제)
    if (valid.length) {
      await supabaseAdmin.from('candidates').delete().in(
        'row_id',
        valid.map((r) => r.row_id)
      );
    }

    // 태스크 구성
    const tasks = valid.map((r) => async () => {
      const items = await fetchTaobaoItems(r.src_img_url!);
      if (items.length) {
        await supabaseAdmin.from('candidates').insert(
          items.map((it) => ({
            row_id: r.row_id,
            idx: it.idx,
            img_url: it.img_url,
            detail_url: it.detail_url,
            price: it.price,
            promo_price: it.promo_price,
            sales: it.sales,
            seller: it.seller,
          }))
        );
      }
      return r.row_id;
    });

    const started = Date.now();
    await runWithPool(tasks, 3); // 동시 3개
    const dur = Date.now() - started;

    return NextResponse.json({ ok: true, processed: valid.length, dur_ms: dur });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? 'prefetch_failed' }, { status: 500 });
  }
}
