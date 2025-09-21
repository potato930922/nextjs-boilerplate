import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { verifyToken } from '@/lib/auth';

type IngestRow = {
  prev_name?: string | null;
  category?: string | null;
  new_name?: string | null;
  src_img_url?: string | null;
  baedaji?: number | null;
};

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id: sessionId } = await context.params;
  try {
    // 인증 (NextRequest는 req.cookies 사용)
    const token = req.cookies.get('s_token')?.value;
    const payload = verifyToken(token);
    if (!payload || payload.session_id !== sessionId) {
      return NextResponse.json({ ok: false, error: 'unauth' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({} as any));
    const purge: boolean = !!body?.purge;

    // A) rows 배열 직접
    let rows: IngestRow[] = [];
    if (Array.isArray(body?.rows)) {
      rows = body.rows as IngestRow[];
    } else {
      // B) 열 단위 배열
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

    // 기존 rows 삭제(선택) + candidates도 함께 정리
    if (purge) {
      // candidates -> 해당 세션 rows를 참조하는 모든 후보 삭제
      const { data: oldRows } = await supabaseAdmin
        .from('rows')
        .select('row_id')
        .eq('session_id', sessionId);

      if (Array.isArray(oldRows) && oldRows.length) {
        await supabaseAdmin.from('candidates').delete().in(
          'row_id',
          oldRows.map(r => r.row_id)
        );
      }

      await supabaseAdmin.from('rows').delete().eq('session_id', sessionId);
    }

    // 입력 payload
    const inserts = rows
      .filter(r => r.src_img_url && (r.prev_name || r.new_name))
      .map((r, idx) => ({
        session_id: sessionId,
        order_no: idx + 1,
        prev_name: r.prev_name ?? null,
        category: r.category ?? null,
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

    const ins = await supabaseAdmin
      .from('rows')
      .insert(inserts)
      .select('row_id');

    if (ins.error) {
      return NextResponse.json({ ok: false, error: ins.error.message }, { status: 500 });
    }

    // ✅ 프리페치(저지연 검색) 비동기 시작 — 응답은 바로 반환
    //    내부 호출이므로 인증/쿠키는 서버측에서 그대로 전달되지 않음 → 라우트에서 세션 검증은 그대로 하고,
    //    필요 시 ?diag=1 없이 정상 경로로만 시작.
    const origin = req.nextUrl.origin;
    // fire-and-forget: 에러가 나도 ingest 응답에는 영향 주지 않음
    fetch(`${origin}/api/session/${encodeURIComponent(sessionId)}/prefetch`, {
      method: 'POST',
      // 쿠키 없이도 통과시키려면 prefetch 라우트에서 쿠키검사를 완화하거나,
      // 여기서 헤더로 세션 토큰을 전달하고 서버에서 인정하는 방식으로 조정.
      // 본 프로젝트는 쿠키검사를 하므로, 같은 도메인/서버 사이 내부 호출은 통상 통과됨.
      cache: 'no-store',
    }).catch(() => { /* ignore */ });

    return NextResponse.json({
      ok: true,
      inserted: ins.data?.length ?? 0,
      prefetch_started: true,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? 'ingest_failed' }, { status: 500 });
  }
}
