// app/work/[id]/page.tsx
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
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
  candidates?: Item[]; // 서버가 프리패치로 채워줄 후보 8개
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

  const [rows, setRows] = useState<Row[]>([]);
  const [idx, setIdx] = useState(0);
  const cur = rows[idx];
  const total = rows.length;

  const [msg, setMsg] = useState('');
  const [bae, setBae] = useState('');
  const [pinOpen, setPinOpen] = useState(false);
  const [pin, setPin] = useState('');
  const [authChecked, setAuthChecked] = useState(false);

  // 그리드 “잔상” 방지용 키(행 바뀔 때 깨끗하게 리셋)
  const gridKey = cur?.row_id ?? 0;

  // ---------- 1) PIN 체크 & rows 로딩 ----------
  useEffect(() => {
    (async () => {
      try {
        // 쿠키 기반 세션 확인
        const who = await fetch(`/api/session/${sessionId}/whoami`, { cache: 'no-store' }).then(r => r.json());
        if (!who?.ok || who?.session_id !== sessionId) {
          // 인증 안됨 → PIN 모달 오픈
          setPinOpen(true);
          setAuthChecked(true);
          return;
        }
        setAuthChecked(true);
        await loadRows();
      } catch (e) {
        setPinOpen(true);
        setAuthChecked(true);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  // PIN 제출
  async function submitPin() {
    if (!pin) return;
    setMsg('인증 중…');
    const r = await fetch(`/api/session/open`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId, pin }),
    });
    const j = await r.json();
    if (!j?.ok) {
      setMsg(`인증 실패: ${j?.error || r.status}`);
      return;
    }
    setMsg('');
    setPinOpen(false);
    setPin('');
    await loadRows();
  }

  // 행 목록 로드
  async function loadRows() {
    setMsg('행 불러오는 중…');
    const r = await fetch(`/api/session/${sessionId}/rows`, { cache: 'no-store' });
    const j = await r.json();
    if (j?.ok) {
      setRows(j.rows as Row[]);
      setIdx(0);
      setMsg('');
      // 3) 첫 화면에서 다음 행 후보 미리 가져오기
      warmNext(0);
    } else {
      setMsg(`행 불러오기 실패: ${j?.error || r.status}`);
    }
  }

  // ---------- 2) 현재 행 바뀌면 배대지 입력값 세팅 ----------
  useEffect(() => {
    setBae(cur?.baedaji ? String((cur.baedaji | 0) / 1000) : '');
  }, [cur?.row_id]); // row_id가 바뀔 때만

  // ---------- 3) 후보 자동 선택(판매량 최대) ----------
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
    // gridKey를 의존성으로 사용 → 행 바뀔 때 깨끗하게 리셋
    [gridKey]
  );

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
  }, [gridKey, items]);

  // ---------- 4) 행 저장 ----------
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

  // ---------- 5) 엔터로 저장 + 다음 ----------
  async function onBaeEnter() {
    if (!cur) return;
    if (!bae) {
      // 비워두고 엔터면 그냥 다음
      gotoNext();
      return;
    }
    const num = Number(bae);
    if (Number.isNaN(num)) {
      setMsg('숫자만 입력');
      return;
    }
    await saveRow({ baedaji: num * 1000 });
    gotoNext();
  }

  // ---------- 6) 다음/이전 ----------
  function gotoPrev() {
    if (idx > 0) {
      setIdx((v) => v - 1);
      setBae('');
      // 이전으로 갈 땐 그 이전의 이전까지 워밍
      warmNext(idx - 1);
    }
  }

  function gotoNext() {
    if (idx < total - 1) {
      const nextIdx = idx + 1;
      setIdx(nextIdx);
      setBae('');
      warmNext(nextIdx); // 다음 행 후보 미리 로딩
    }
  }

  // ---------- 7) 후보 미리 로딩(다음 1~2개 워밍) ----------
  async function warmNext(baseIdx: number) {
    // rows가 비어있거나 범위 밖이면 무시
    if (!rows.length) return;
    const want: number[] = [];
    const i1 = baseIdx + 1;
    const i2 = baseIdx + 2;
    if (rows[i1]) want.push(rows[i1].row_id);
    if (rows[i2]) want.push(rows[i2].row_id);
    if (!want.length) return;

    try {
      // 서버에 “이 row_id들만 프리패치” 요청 (서버가 지원 못해도 그냥 무시)
      await fetch(`/api/session/${sessionId}/prefetch`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ only: want }),
      });
      // 잠깐 기다렸다가 rows 최신화 시도(프리패치가 반영되면 candidates가 채워짐)
      setTimeout(async () => {
        const r = await fetch(`/api/session/${sessionId}/rows`, { cache: 'no-store' });
        const j = await r.json();
        if (j?.ok) {
          setRows(j.rows as Row[]);
        }
      }, 500);
    } catch {
      // 실패해도 UX에 큰 영향 없음
    }
  }

  // ---------- 8) 엑셀 ----------
  function exportExcel() {
    window.location.href = `/api/session/${sessionId}/export`;
  }

  // ---------- 렌더 ----------
  if (!authChecked) {
    return <div style={{ padding: 24 }}>세션 확인 중…</div>;
  }

  return (
    <div style={{ padding: 16, maxWidth: 1200, margin: '0 auto', fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif' }}>
      <h2 style={{ margin: '8px 0 12px' }}>작업창 · 세션 {sessionId}</h2>

      <div style={{ display: 'grid', gridTemplateColumns: '360px 1fr', gap: 16 }}>
        {/* 좌측 */}
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
                width: '100%',
                aspectRatio: '1/1',
                background: '#f3f3f3',
                borderRadius: 10,
                overflow: 'hidden',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {cur?.src_img_url ? (
                <img
                  src={https(cur.src_img_url)}
                  alt="원본"
                  loading="lazy"
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : (
                <span style={{ color: '#bbb' }}>원본 이미지 없음</span>
              )}
            </div>
          </div>

          <div style={{ marginTop: 12 }}>
            <label style={{ fontSize: 12 }}>배대지(천원 단위)</label>
            <input
              inputMode="numeric"
              value={bae}
              onChange={(e) => setBae(e.currentTarget.value)}
              onBlur={() => {
                if (!bae) return;
                const num = Number(bae);
                if (Number.isNaN(num)) { setMsg('숫자만 입력'); return; }
                saveRow({ baedaji: num * 1000 });
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onBaeEnter();
              }}
              placeholder="예: 3 → 3,000원"
              style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #ddd', marginTop: 6 }}
            />
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            <button type="button" style={btn()} onClick={gotoPrev} disabled={idx === 0}>이전</button>
            <button type="button" style={btn()} onClick={gotoNext} disabled={idx === total - 1}>다음</button>
            <button type="button" style={btnPrimary()} onClick={exportExcel} disabled={!rows.length}>완료(엑셀 다운로드)</button>
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
            <button type="button" style={btn()} onClick={() => saveRow({ skip: !cur?.skip, delete: false, selected_idx: null })}>
              {cur?.skip ? '적합상품없음 ✅' : '적합상품없음'}
            </button>
            <button type="button" style={btn()} onClick={() => saveRow({ delete: !cur?.delete, skip: false, selected_idx: null })}>
              {cur?.delete ? '삭제 예정상품 ✅' : '삭제 예정상품'}
            </button>
          </div>

          <div style={{ marginTop: 8, color: '#666', minHeight: 20 }}>{msg}</div>
        </div>

        {/* 우측: 후보 그리드 */}
        <div key={gridKey /* ← 행 바뀔 때 깨끗이 리셋 */}>
          {/* 반응형: 모바일 2 / 태블릿 3 / 데스크탑 4 */}
          <style>{`
            @media (max-width: 720px) {
              div[data-grid-cands] { grid-template-columns: repeat(2, 1fr) !important; }
            }
            @media (min-width: 721px) and (max-width: 1024px) {
              div[data-grid-cands] { grid-template-columns: repeat(3, 1fr) !important; }
            }
          `}</style>
          <div data-grid-cands style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(4, 1fr)' }}>
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
                        alt={`candidate-${i}`}
                        src={`/api/img?u=${encodeURIComponent(https(it.img_url))}`}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    ) : (
                      <span style={{ color: '#bbb', fontSize: 12 }}>no image</span>
                    )}
                  </div>

                  <div style={{ fontSize: 12, marginTop: 8, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {price != null ? <>가격: {price.toLocaleString()} {it.promo_price == null ? '(정가)' : ''}</> : <>가격: -</>}
                  </div>
                  <div style={{ fontSize: 12, marginTop: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    판매량: {it.sales ?? '-'} {it.seller ? ` | 판매자: ${it.seller}` : ''}
                  </div>

                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <button
                      type="button"
                      style={btn()}
                      onClick={() => saveRow({ selected_idx: selected ? null : i, skip: false, delete: false })}
                    >
                      {selected ? '선택해제' : '선택'}
                    </button>
                    <a href={it.detail_url || '#'} target="_blank" rel="noreferrer" style={{ flex: 1 }}>
                      <button type="button" style={{ ...btn(), width: '100%' }} disabled={!it.detail_url}>열기</button>
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

      {/* 하단 고정 단축 버튼 */}
      <div style={{ position: 'sticky', bottom: 0, marginTop: 14, background: '#fff', padding: 8, display: 'flex', gap: 8, borderTop: '1px solid #eee' }}>
        <button type="button" style={{ ...btn(), flex: 1 }} onClick={gotoPrev} disabled={idx === 0}>이전</button>
        <button type="button" style={{ ...btn(), flex: 1 }} onClick={gotoNext} disabled={idx === total - 1}>다음</button>
        <button type="button" style={{ ...btnPrimary(), flex: 1 }} onClick={exportExcel} disabled={!rows.length}>엑셀</button>
      </div>

      {/* PIN 모달 */}
      {pinOpen && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }}>
          <div style={{ width: 320, background: '#fff', borderRadius: 12, padding: 16, boxShadow: '0 10px 24px rgba(0,0,0,0.2)' }}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>PIN 입력</div>
            <div style={{ fontSize: 13, color: '#666', marginBottom: 10 }}>세션 {sessionId} 접근을 위해 PIN이 필요합니다.</div>
            <input
              type="password"
              value={pin}
              onChange={(e) => setPin(e.currentTarget.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') submitPin(); }}
              placeholder="PIN"
              style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #ddd' }}
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
              <button type="button" style={btn()} onClick={() => { setPinOpen(false); setPin(''); }}>취소</button>
              <button type="button" style={btnPrimary()} onClick={submitPin}>확인</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function btn() {
  return {
    padding: '10px 14px',
    borderRadius: 10,
    border: '1px solid #ddd',
    background: '#fff',
    cursor: 'pointer' as const,
  };
}
function btnPrimary() {
  return {
    padding: '10px 14px',
    borderRadius: 10,
    border: 'none',
    background: '#41c265',
    color: '#fff',
    cursor: 'pointer' as const,
  };
}
