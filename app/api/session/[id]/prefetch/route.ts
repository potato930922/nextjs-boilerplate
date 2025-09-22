// app/api/session/[id]/prefetch/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyToken } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

const CONCURRENCY = 4;

type Item = {
  img_url: string;
  promo_price: number | null;
  price: number | null;
  sales: string | null;
  seller: string | null;
  detail_url: string;
};

const https = (u?: string) => (u ? (u.startsWith('//') ? `https:${u}` : u) : '');

async function taobao(img: string): Promise<Item[]> {
  const r = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || ''}/api/taobao/search`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ img }),
    cache: 'no-store',
  });
  if (!r.ok) return [];
  const j = await r.json();
  return Array.isArray(j?.items) ? j.items : [];
}

function pLimit<T>(concurrency: number) {
  let active = 0;
  const queue: (() => void)[] = [];
  const next = () => {
    active--;
    queue.shift()?.();
  };
  return async (fn: () => Promise<T>) =>
    new Promise<T>((resolve, reject) => {
      const run = async () => {
        active++;
        try {
          resolve(await fn());
        } catch (e) {
          reject(e);
        } finally {
          next();
        }
      };
      if (active < concurrency) run();
      else queue.push(run);
    });
}

export async function POST(req: NextRequest, ctx: { params: { id: string } }) {
  try {
    const sessionId = ctx.params.id;

    // 인증
    const store = await cookies();
    const token = store.get('s_token')?.value;
    const payload = verifyToken(token);
    if (!payload || payload.session_id !== sessionId) {
      return NextResponse.json({ ok: false, error: 'unauth' }, { status: 401 });
    }

    // 대상 행 조회
    const { data: rows, error: rowsErr } = await supabaseAdmin
      .from('rows')
      .select('row_id, session_id, src_img_url')
      .eq('session_id', sessionId)
      .order('order_no', { ascending: true });

    if (rowsErr) return NextResponse.json({ ok: false, error: rowsErr.message }, { status: 500 });

    const total = rows?.length || 0;
    if (!total) return NextResponse.json({ ok: true, processed: 0, dur_ms: 0 });

    const started = Date.now();
    const limit = pLimit<void>(CONCURRENCY);
    let done = 0;

    const jobs = (rows || []).map((row) =>
      limit(async () => {
        const img = row.src_img_url ? https(row.src_img_url) : '';
        if (!img) return;

        // 후보 삭제
        await supabaseAdmin.from('candidates').delete().eq('row_id', row.row_id);

        // 2회 재시도
        let items: Item[] = [];
        for (let n = 0; n < 3; n++) {
          try {
            items = await taobao(img);
            break;
          } catch {
            await new Promise((r) => setTimeout(r, 300 + n * 200));
          }
        }

        if (items.length) {
          await supabaseAdmin.from('candidates').insert(
            items.map((it, idx) => ({
              row_id: row.row_id,
              idx,
              img_url: it.img_url || '',
              detail_url: it.detail_url || '',
              price: it.price,
              promo_price: it.promo_price,
              sales: it.sales,
              seller: it.seller,
            }))
          );
        }
        // 진행률을 위한 "완료" 기준은 행 단위로 증가
        done++;
      })
    );

    await Promise.allSettled(jobs);

    const dur_ms = Date.now() - started;
    return NextResponse.json({ ok: true, session_id: sessionId, processed: done, total, dur_ms });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'prefetch_failed' }, { status: 500 });
  }
}
