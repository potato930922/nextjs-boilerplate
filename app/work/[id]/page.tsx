// app/work/[id]/page.tsx
'use client';

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
  if (!m) {
    const d = t.match(/\d+/);
    return d ? Number(d[0]) : -1;
    }
  let n = parseFloat(m[1]);
  const u = m[2];
  if (u === 'w' || u === '万') n *= 10_000;
  if (u === 'k') n *= 1_000;
  return Math.round(n);
}

function https(u?: string | null) {
  if (!u) return '';
  return u.startsWith('//') ? `https:${u}` : u;
}

export default function WorkPage({ params }: { params: { id: string } }) {
  const sessionId = params.id;
  const router = useRouter();

  // PIN 모달
  const [needPin, setNeedPin] = useState<boolean>(false);
  const [pin, setPin] = useState('');
  const [pinMsg, setPinMsg] = useState('');

  const [rows, setRows] = useState<Row[]>([]);
  const [idx, setIdx] = useState(0);
  const cur = rows[idx];

  const items: Item[] = useMemo(
    () =>
      (cur?.candidates ?? new Array(8).fill(null)).map(
        (v) =>
          v ?? {
            img_url: '',
            promo_price: null,
            price: null,
            sales: null,
            seller: null,
            detail_url: '',
          }
      ),
    [cur?.row_id]
  );

  const total = rows.length;

  const [msg, setMsg] = useState('');
  const [bae, setBae] = useState(''); // 천원 단위

  // ✅ 1) 진입 시 세션 검사 → 실패하면 PIN 모달 표시
  useEffect(() => {
    (async () => {
      const r = await fetch(`/api/session/${sessionId}/whoami`, { cache: 'no-store' });
      const j = await r.json().catch(() => ({}));
      if (!j?.ok) {
        setNeedPin(true);
      } else {
        loadRows();
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  async function openSessionByPin() {
    if (!pin.trim()) { setPinMsg('PIN을 입력하세요'); return; }
    setPinMsg('검증 중…');
    const r = await fetch(`/api/session/open`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId, pin }),
      cache: 'no-store',
    });
    const j = await r.json().catch(() => ({}));
    if (r.ok && j?.ok) {
      setNeedPin(false);
      setPinMsg('');
      await loadRows();
    } else {
      setPinMsg(`실패: ${j?.error || r.status}`);
    }
  }

  // 행 목록 로드
  async function loadRows() {
    setMsg('행 불러오는 중…');
    const r = await fetch(`/api/session/${sessionId}/rows`, { cache: 'no-store' });
    const j = await r.json();
    if (j?.ok) {
      setRows(j.rows as Row[]);
      setMsg('');
    } else {
      setMsg(`행 불러오기 실패: ${j?.error || r.status}`);
    }
  }

  // 현재 행 바뀌면 배대지 입력 값 세팅/리셋
  useEffect(() => {
    setBae(cur?.baedaji ? String((cur.baedaji | 0) / 1000) : '');
  }, [cur?.row_id]);

  // 후보 보이면, 선택 비었을 때 판매량 최댓값으로 자동 선택
  useEffect(() => {
    if (!cur) return;
    if (cur.selected_idx != null) return;
    if (!Array.isArray(items) || !items.some((it) => it?.img_url)) return;

    let best = -1;
    let bestIdx = 0;
    items.forEach((it, i) => {
      const s = salesToInt(it?.sales ?? null);
      if (s > best) {
        best = s;
        bestIdx = i;
      }
    });
    if (best >= 0) {
      saveRow({ selected_idx: bestIdx, skip: false, delete: false }, false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, cur?.row_id]);

  // 저장
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
    if (!j?.ok) {
      setMsg(`저장 실패: ${j?.error || r.status}`);
      return;
    }

    setRows((old) => {
      const n = [...old];
      n[idx] = { ...cur, ...patch };
      return n;
    });
    if (showToast) setMsg('저장됨');
  }

  function exportExcel() {
    window.location.href = `/api/session/${sessionId}/export`;
  }

  // ---------- UI ----------
  return (
    <div style={{ padding: 16, maxWidth: 1200, margin: '0 auto', fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif' }}>

      {/* PIN 모달 */}
      {needPin && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,.35)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50
          }}
        >
          <div style={{ background: '#fff', width: 'min(92vw, 420px)', borderRadius: 12, padding: 16, boxShadow: '0 10px 24px rgba(0,0,0,.2)' }}>
            <h3 style={{ margin: 0, marginBottom: 8 }}>세션 PIN 확인</h3>
            <p style={{ marginTop: 0, color: '#666' }}>세션 <b>{sessionId}</b> 에 접근하려면 PIN이 필요합니다.</p>
            <input
              inputMode="numeric"
              placeholder="PIN"
              value={pin}
              onChange={(e) => setPin(e.currentTarget.value)}
              style={{ width: '100%', padding: '12px 14px', borderRadius: 10, border: '1px solid #ddd' }}
            />
            <div style={{ marginTop: 10, color: pinMsg.startsWith('실패') ? '#c33' : '#666' }}>{pinMsg}</div>
            <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
              <button onClick={() => router.back()} style={{ padding: '10px 14px', borderRadius: 10, border: '1px solid #ddd', background: '#fff' }}>취소</button>
              <button onClick={openSessionByPin} style={{ padding: '10px 14px', borderRadius: 10, border: 'none', background: '#4f8cff', color: '#fff' }}>확인</button>
            </div>
          </div>
        </div>
      )}

      <h2 style={{ margin: '8px 0 12px' }}>작업창 · 세션 {sessionId}</h2>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 16 }}>
        {/* 좌측(모바일: 위) */}
        <div>
          <div style={{ padding: 12, background: '#f6f6f6', borderRadius: 10 }}>
            <div style={{ fontWeight: 700, marginBottom: 6, lineHeight: 1.3 }}>{cur?.prev_name || '(이전상품명 없음)'}</div>
            <div style={{ fontSize: 12, color: '#666', marginBottom: 8 }}>{cur?.category || ''}</div>
            <div style={{ fontSize: 12, color: '#999' }}>행 {Math.min(idx + 1, total)} / {total || 0}</div>
          </div>

          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 12, marginBottom: 6 }}>원본 이미지</div>
            <div
              style={{
                width: '100%', aspectRatio: '1/1', background: '#f3f3f3',
                borderRadius: 10, overflow: 'hidden', display: 'flex',
                alignItems: 'center', justifyContent: 'center'
              }}
            >
              {cur?.src_img_url ? (
                <img
                  loading="lazy"
                  src={https(cur.src_img_url)}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  alt="원본"
                />
              ) : (
                <span style={{ color: '#bbb' }}>원본 이미지 없음</span>
              )}
            </div>
          </div>

          <div style={{ marginTop: 12 }}>
            <label style={{ fontSize: 12 }}>배대지(천원 단위)</label>
            <input
              value={bae}
              inputMode="numeric"
              onChange={(e) => setBae(e.currentTarget.value)}
              onBlur={() => {
                if (!bae) return;
                const num = Number(bae);
                if (Number.isNaN(num)) { setMsg('숫자만 입력'); return; }
                saveRow({ baedaji: num * 1000 });
              }}
              placeholder="예: 3 → 3,000원"
              style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #ddd', marginTop: 6 }}
            />
          </div>

          {/* 액션 버튼들: 버튼 요소로 교체 + 모바일 친화 */}
          <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => { if (idx > 0) { setIdx(idx - 1); setBae(''); } }}
              disabled={idx === 0}
              style={{ padding: '10px 14px', borderRadius: 10, border: '1px solid #ddd', background: '#fff' }}
            >
              이전
            </button>
            <button
              type="button"
              onClick={() => { if (idx < total - 1) { setIdx(idx + 1); setBae(''); } }}
              disabled={idx === total - 1}
              style={{ padding: '10px 14px', borderRadius: 10, border: '1px solid #ddd', background: '#fff' }}
            >
              다음
            </button>
            <button
              type="button"
              onClick={exportExcel}
              disabled={!rows.length}
              style={{ padding: '10px 14px', borderRadius: 10, border: 'none', background: '#41c265', color: '#fff' }}
            >
              완료(엑셀 다운로드)
            </button>
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => saveRow({ skip: !cur?.skip, delete: false, selected_idx: null })}
              style={{
                padding: '10px 14px', borderRadius: 10,
                border: cur?.skip ? '2px solid #ff5a5a' : '1px solid #ddd',
                background: '#fff'
              }}
            >
              {cur?.skip ? '적합상품없음 ✅' : '적합상품없음'}
            </button>
            <button
              type="button"
              onClick={() => saveRow({ delete: !cur?.delete, skip: false, selected_idx: null })}
              style={{
                padding: '10px 14px', borderRadius: 10,
                border: cur?.delete ? '2px solid #ff5a5a' : '1px solid #ddd',
                background: '#fff'
              }}
            >
              {cur?.delete ? '삭제 예정상품 ✅' : '삭제 예정상품'}
            </button>
          </div>

          <div style={{ marginTop: 8, color: '#666', minHeight: 20 }}>{msg}</div>
        </div>

        {/* 우측(모바일: 아래) - 반응형 그리드 */}
        <div>
          <div
            style={{
              display: 'grid',
              gap: 12,
              gridTemplateColumns: 'repeat(4, 1fr)',
            }}
          >
            {/* 반응형: 모바일 2, 태블릿 3, 데스크탑 4 */}
            <style>{`
              @media (max-width: 720px) {
                div[data-grid-cands] { grid-template-columns: repeat(2, 1fr) !important; }
              }
              @media (min-width: 721px) and (max-width: 1024px) {
                div[data-grid-cands] { grid-template-columns: repeat(3, 1fr) !important; }
              }
            `}</style>

            <div data-grid-cands style={{ display: 'contents' }} />

            {items.map((it, i) => {
              const selected = cur?.selected_idx === i && !cur?.skip && !cur?.delete;
              const price = it.promo_price ?? it.price;
              return (
                <div
                  key={i}
                  style={{
                    border: '2px solid',
                    borderColor: selected ? '#ff5a5a' : '#eee',
                    borderRadius: 12,
                    padding: 8,
                    background: '#fff',
                    minWidth: 0,
                  }}
                >
                  <div
                    style={{
                      width: '100%',
                      aspectRatio: '1/1',
                      background: '#f3f3f3',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      overflow: 'hidden',
                      borderRadius: 10,
                    }}
                  >
                    {it?.img_url ? (
                      <img
                        loading="lazy"
                        src={`/api/img?u=${encodeURIComponent(https(it.img_url))}`}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        alt={`candidate-${i}`}
                      />
                    ) : (
                      <span style={{ color: '#bbb', fontSize: 12 }}>no image</span>
                    )}
                  </div>

                  <div style={{ fontSize: 12, marginTop: 8, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {price != null
                      ? <>가격: {price.toLocaleString()} {it.promo_price == null ? '(정가)' : ''}</>
                      : <>가격: -</>}
                  </div>
                  <div style={{ fontSize: 12, marginTop: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    판매량: {it.sales ?? '-'} {it.seller ? ` | 판매자: ${it.seller}` : ''}
                  </div>

                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <button
                      type="button"
                      onClick={() =>
                        saveRow({ selected_idx: selected ? null : i, skip: false, delete: false })
                      }
                      style={{
                        flex: 1, padding: '8px 10px', borderRadius: 10,
                        border: '1px solid #ddd', background: selected ? '#ffe5e5' : '#fff'
                      }}
                    >
                      {selected ? '선택해제' : '선택'}
                    </button>
                    <a href={it.detail_url || '#'} target="_blank" rel="noreferrer" style={{ flex: 1 }}>
                      <button
                        type="button"
                        disabled={!it.detail_url}
                        style={{
                          width: '100%', padding: '8px 10px', borderRadius: 10,
                          border: '1px solid #ddd', background: '#fff'
                        }}
                      >
                        열기
                      </button>
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

      {/* 모바일에선 하단 고정 액션 바(손가락 큰 터치 타깃) */}
      <div
        style={{
          position: 'sticky', bottom: 0, marginTop: 14, background: '#fff',
          padding: 8, display: 'flex', gap: 8, borderTop: '1px solid #eee'
        }}
      >
        <button
          type="button"
          onClick={() => { if (idx > 0) { setIdx(idx - 1); setBae(''); } }}
          disabled={idx === 0}
          style={{ flex: 1, padding: '12px 14px', borderRadius: 12, border: '1px solid #ddd', background: '#fff' }}
        >
          이전
        </button>
        <button
          type="button"
          onClick={() => { if (idx < total - 1) { setIdx(idx + 1); setBae(''); } }}
          disabled={idx === total - 1}
          style={{ flex: 1, padding: '12px 14px', borderRadius: 12, border: '1px solid #ddd', background: '#fff' }}
        >
          다음
        </button>
        <button
          type="button"
          onClick={exportExcel}
          disabled={!rows.length}
          style={{ flex: 1, padding: '12px 14px', borderRadius: 12, border: 'none', background: '#41c265', color: '#fff' }}
        >
          엑셀
        </button>
      </div>
    </div>
  );
}
