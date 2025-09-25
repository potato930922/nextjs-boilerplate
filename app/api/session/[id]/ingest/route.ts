// app/api/session/[id]/ingest/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { verifyToken } from '@/lib/auth';

/**
 * Body 형태 2가지를 모두 허용
 *  A) { rows: Array<{ prev_name, category, new_name, src_img_url, baedaji? }> }
 *  B) { prev_names: string[], categories: string[], new_names: string[], img_urls: string[] }
 */
type IngestRow = {
  prev_name?: string | null;
  category?: string | null;
  new_name?: string | null;
  src_img_url?: string | null;
  baedaji?: number | null;
};

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> } // Next 15: Promise 형태
) {
  const { id: sessionId } = await context.params;

  try {
    // ✅ Next 15: cookies()는 Promise<ReadonlyRequestCookies>
    const jar = await cookies();
    const token = jar.get('s_token')?.value;
    const payload = verifyToken(token);
    if (!payload || payload.session_id !== sessionId) {
      return NextResponse.json({ ok: false, error: 'unauth' }, { status: 401 });
    }

    const body = await req.json();

    let rows: IngestRow[] = [];
    if (Array.isArray(body?.rows)) {
      rows = body.rows as IngestRow[];
    } else {
      const prev = (body?.prev_names ?? []) as string[];
      const cats = (body?.categories ?? []) as string[];
      const news = (body?.new_names ?? []) as string[];
      const urls = (body?.img_urls ?? []) as string[];
      const max = Math.max(prev.length, cats.length, news.length, urls.length);
      for (let i = 0; i < max; i++) {
        rows.push({
          prev_name: (prev[i] ?? '').trim() || null,
          category: (cats[i] ?? '').trim() || null,
          new_name: (news[i] ?? '').trim() || null,
          src_img_url: (urls[i] ?? '').trim() || null,
          baedaji: null,
        });
      }
    }

    // 기존 행 삭제
    const del = await supabaseAdmin.from('rows').delete().eq('session_id', sessionId);
    if (del.error) {
      return NextResponse.json({ ok: false, error: del.error.message }, { status: 500 });
    }

    // rows insert
    const inserts = rows
      .filter((r) => r.src_img_url && (r.prev_name || r.new_name))
      .map((r, idx) => ({
        session_id: sessionId,
        order_no: idx + 1,
        prev_name: r.prev_name ?? null,
        category: r.category ?? null,
        new_name: r.new_name ?? null, // 스키마에 없으면 제거
        src_img_url: r.src_img_url ?? null,
        main_thumb_url: null,
        selected_idx: null,
        baedaji: r.baedaji ?? null,
        skip: false,
        delete: false,
        status: 'pending',
        edited_by: 'web',
        version: 0,
      }));

    if (inserts.length === 0) {
      return NextResponse.json({ ok: false, error: 'no_rows' }, { status: 400 });
    }

    const ins = await supabaseAdmin.from('rows').insert(inserts).select('row_id');
    if (ins.error) {
      return NextResponse.json({ ok: false, error: ins.error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, inserted: ins.data?.length ?? 0 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? 'ingest_failed' }, { status: 500 });
  }
}
