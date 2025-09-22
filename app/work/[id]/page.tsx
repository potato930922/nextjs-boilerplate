// app/work/[id]/page.tsx
'use client';

import SessionGate from '@/app/components/SessionGate';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

type Item = {
  img_url: string;
  promo_price: number | null;
  price: number | null;
  sales: string | null;
  seller: string | null;
  detail_url: string;
};

type Row = {
  row_id: number;
  order_no: number;
  prev_name: string | null;
  category: string | null;
  src_img_url: string | null;
  main_thumb_url: string | null;
  selected_idx: number | null;
  baedaji: number | null;
  skip: boolean | null;
  delete: boolean | null;
  status: string | null;
  candidates?: Item[];
};

function salesToInt(s: string | null): number {
  if (!s) return -1;
  const t = s.toLowerCase().replace(/,/g, '').trim();
  const m = t.match(/([\d\.]+)\s*([kw万]?)/);
  if (!m) { const d = t.match(/\d+/); return d ? Number(d[0]) : -1; }
  let n = parseFloat(m[1]); const u = m[2];
  if (u === 'w' || u === '万') n *= 10_000;
  if (u === 'k') n *= 1_000;
  return Math.round(n);
}
const https = (u?: string | null) => (u ? (u.startsWith('//') ? `https:${u}` : u) : '');
const proxied = (u?: string | null) => { const s = https(u || ''); return s ? `/api/img?u=${encodeURIComponent(s)}` : ''; };

export default function Page({ params }: { params: { id: string } }) {
  const sessionId = params.id;
  return (
    <SessionGate sessionId={sessionId}>
      <WorkClient sessionId={sessionId} />
    </SessionGate>
  );
}

function WorkClient({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>([]);
  const [idx, setIdx] = useState(0);
  const cur = rows[idx];
  const total = rows.length;

  const items: Item[] = useMemo(
    () => (cur?.candidates ?? new Array(8).fill(null)).map((v) => v ?? ({
      img_url: '', promo_price: null, price: null, sales: null, seller: null, detail_url: '',
    })),
    [cur?.row_id, cur?.candidates]
  );

  const [msg, setMsg] = useState('');
  const [bae, setBae] = useState('');

  useEffect(() => {
    (async () => {
      setMsg('행 불러오는 중…');
      const r = await fetch(`/api/session/${sessionId}/rows`, { cache: 'no-store', credentials: 'include' });
      const j = await r.json();
      if (j?.ok) { setRows(j.rows as Row[]); setMsg(''); }
      else { setMsg(`행 불러오기 실패: ${j?.error || r.status}`); }
    })();
  }, [sessionId]);

  useEffect(() => { setBae(cur?.baedaji ? String((cur.baedaji | 0) / 1000) : ''); }, [cur?.row_id]);

  useEffect(() => {
    if (!cur) return;
    if (cur.selected_idx != null) return;
    if (!Array.isArray(items) || !items.some((it) => it?.img_url)) return;
    let best = -1, bestIdx = 0;
    items.forEach((it, i) => { const s = salesToInt(it?.sales ?? null); if (s > best) { best = s; bestIdx = i; } });
    if (best >= 0) saveRow({ selected_idx: bestIdx, skip: false, delete: false }, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, cur?.row_id]);

  async function saveRow(patch: Partial<Row>, showToast = true) {
    if (!cur) return;
    if (showToast) setMsg('저장 중…');
    const r = await fetch(`/api/row/${cur.row_id}/save`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        selected_idx: patch.selected_idx ?? cur.selected_idx,
        baedaji: patch.baedaji ?? cur.baedaji,
        skip: patch.skip ?? cur.skip ?? false,
        delete: patch.delete ?? cur.delete ?? false,
      }),
    });
    const j = await r.json();
    if (!j?.ok) { setMsg(`저장 실패: ${j?.error || r.status}`); return; }
    setRows((old) => { const n = [...old]; n[idx] = { ...cur, ...patch }; return n; });
    if (showToast) setMsg('저장됨');
  }

  function exportExcel() { window.location.href = `/api/session/${sessionId}/export`; }

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto', fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif' }}>
      <h2 style={{ marginBottom: 16 }}>작업창 · 세션 {sessionId}</h2>

      <div style={{ display: 'flex', gap: 24 }}>
        {/* 좌측: 원본/정보/컨트롤 */}
        <div style={{ flex: '0 0 340px' }}>
          <div style={{ padding: 12, background: '#f6f6f6', borderRadius: 8 }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>{cur?.prev_name || '(이전상품명 없음)'}</div>
            <div style={{ fontSize: 12, color: '#666', marginBottom: 8 }}>{cur?.category || ''}</div>
            <div style={{ fontSize: 12, color: '#999' }}>행 {idx + 1} / {total}</div>
          </div>

          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 12, marginBottom: 6 }}>원본 이미지</div>
            <div style={{ width: '100%', aspectRatio: '1/1', background: '#f3f3f3',
                          borderRadius: 8, overflow: 'hidden', display: 'flex',
                          alignItems: 'center', justifyContent: 'center' }}>
              {cur?.src_img_url ? (
                <img src={proxied(cur.src_img_url)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="원본" />
              ) : <span style={{ color: '#bbb' }}>원본 이미지 없음</span>}
            </div>
          </div>

          <div style={{ marginTop: 12 }}>
            <label style={{ fontSize: 12 }}>배대지(천원 단위)</label>
            <input
              value={bae}
              onChange={(e) => setBae(e.currentTarget.value)}
              onBlur={() => {
                if (!bae) return;
                const num = Number(bae);
                if (Number.isNaN(num)) { setMsg('숫자만 입력'); return; }
                saveRow({ baedaji: num * 1000 });
              }}
              placeholder="예: 3 → 3,000원"
              style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #ddd', marginTop: 6 }}
            />
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button onClick={() => { if (idx > 0) { setIdx(idx - 1); setBae(''); } }} disabled={idx === 0}>이전</button>
            <button onClick={() => { if (idx < total - 1) { setIdx(idx + 1); setBae(''); } }} disabled={idx === total - 1}>다음</button>
            <button onClick={exportExcel} disabled={!rows.length}>완료(엑셀 다운로드)</button>
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button onClick={() => saveRow({ skip: !cur?.skip, delete: false, selected_idx: null })}>
              {cur?.skip ? '적합상품없음 ✅' : '적합상품없음'}
            </button>
            <button onClick={() => saveRow({ delete: !cur?.delete, skip: false, selected_idx: null })}>
              {cur?.delete ? '삭제 예정상품 ✅' : '삭제 예정상품'}
            </button>
          </div>

          <div style={{ marginTop: 8, color: '#666', minHeight: 20 }}>{msg}</div>
        </div>

        {/* 우측: 후보 8개 */}
        <div style={{ flex: 1 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
            {items.map((it, i) => {
              const selected = cur?.selected_idx === i && !cur?.skip && !cur?.delete;
              const price = it.promo_price ?? it.price;
              const imgSrc = proxied(it?.img_url || '');
              return (
                <div key={i} style={{ border: '2px solid', borderColor: selected ? '#ff5a5a' : '#eee',
                                       borderRadius: 10, padding: 8, background: '#fff' }}>
                  <div style={{ width: '100%', aspectRatio: '1/1', background: '#f3f3f3',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                overflow: 'hidden', borderRadius: 8 }}>
                    {imgSrc ? (
                      <img src={imgSrc} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt={`candidate-${i}`} />
                    ) : <span style={{ color: '#bbb' }}>no image</span>}
                  </div>

                  <div style={{ fontSize: 12, marginTop: 8 }}>
                    {price != null ? <>가격: {price.toLocaleString()} {it.promo_price == null ? '(정가)' : ''}</>
                                   : <>가격: -</>}
                  </div>
                  <div style={{ fontSize: 12, marginTop: 4 }}>
                    판매량: {it.sales ?? '-'} {it.seller ? ` | 판매자: ${it.seller}` : ''}
                  </div>

                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <button onClick={() => saveRow({ selected_idx: selected ? null : i, skip: false, delete: false })}>
                      {selected ? '선택해제' : '선택'}
                    </button>
                    <a href={https(it.detail_url) || '#'} target="_blank" rel="noreferrer">
                      <button type="button" disabled={!it.detail_url}>열기</button>
                    </a>
                  </div>
                </div>
              );
            })}
          </div>

          {!items.some((x) => x?.img_url) && (
            <div style={{ marginTop: 12, color: '#999' }}>
              표시할 후보가 없습니다. (이미지서치가 끝나지 않았거나 프리패치 결과가 비어 있음)
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
