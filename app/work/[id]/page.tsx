'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

type Item = {
  idx?: number | null;
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

function https(u?: string | null) {
  if (!u) return '';
  return u.startsWith('//') ? `https:${u}` : u;
}

// 판매량 문자열 → 숫자
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

export default function WorkPage({ params }: { params: { id: string } }) {
  const sessionId = params.id;
  const router = useRouter();

  const [rows, setRows] = useState<Row[]>([]);
  const [idx, setIdx] = useState(0);
  const [msg, setMsg] = useState('');
  const [bae, setBae] = useState(''); // 배대지(천원 단위)

  const cur = rows[idx];
  const total = rows.length;

  // 후보 8칸 보장 & 이미지 프록시 적용
  const items: Item[] = useMemo(() => {
    const raw = cur?.candidates ?? [];
    const eight = [...raw];
    while (eight.length < 8) {
      eight.push({
        img_url: '',
        promo_price: null,
        price: null,
        sales: null,
        seller: null,
        detail_url: '',
      });
    }
    return eight.map((it) => ({
      ...it,
      img_url: it.img_url ? `/api/img?u=${encodeURIComponent(https(it.img_url))}` : '',
    }));
  }, [cur?.row_id, cur?.candidates]);

  // 진입 시 인증 체크
  useEffect(() => {
    (async () => {
      const who = await fetch(`/api/session/${sessionId}/whoami`, { cache: 'no-store' });
      if (who.status === 401) {
        alert('세션 인증이 필요합니다. PIN을 입력해 주세요.');
        // 인증 페이지가 있다면 여기로 라우팅하도록 교체 가능
        // router.push(`/pin?sid=${encodeURIComponent(sessionId)}`);
      }
    })();
  }, [sessionId]);

  // rows 로드
  useEffect(() => {
    (async () => {
      try {
        setMsg('행 불러오는 중…');
        const r = await fetch(`/api/session/${sessionId}/rows`, { cache: 'no-store' });
        const j = await r.json();
        if (j?.ok) {
          setRows(j.rows as Row[]);
          setMsg('');
        } else {
          setMsg(`행 불러오기 실패: ${j?.error || r.status}`);
        }
      } catch {
        setMsg('네트워크 오류');
      }
    })();
  }, [sessionId]);

  // 현재 행 바뀌면 배대지 입력 값 세팅/리셋
  useEffect(() => {
    setBae(cur?.baedaji ? String((cur.baedaji | 0) / 1000) : '');
  }, [cur?.row_id]);

  // 후보가 보이면, 아직 선택이 비어 있을 때 판매량 최댓값으로 자동 선택
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

  // ✅ 데스크톱/모바일 반응형 레이아웃
  return (
    <div style={{ padding: 16, maxWidth: 1200, margin: '0 auto', fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif' }}>
      <style>{`
        /* 데스크톱: 좌(원본/컨트롤) + 우(후보그리드) 2열 */
        @media (min-width: 1025px) {
          .work-grid { display: grid; grid-template-columns: 360px 1fr; gap: 24px; }
        }
        /* 태블릿/모바일: 1열 스택 */
        @media (max-width: 1024px) {
          .work-grid { display: grid; grid-template-columns: 1fr; gap: 16px; }
        }
        /* 후보 카드 그리드: 모바일 2, 태블릿 3, 데스크톱 4 */
        @media (max-width: 720px) {
          [data-grid-cands] { grid-template-columns: repeat(2, 1fr) !important; }
        }
        @media (min-width: 721px) and (max-width: 1024px) {
          [data-grid-cands] { grid-template-columns: repeat(3, 1fr) !important; }
        }
        @media (min-width: 1025px) {
          [data-grid-cands] { grid-template-columns: repeat(4, 1fr) !important; }
        }
        .btn { padding: 10px 14px; border-radius: 10px; border: 1px solid #ddd; background: #fff; }
        .btn-primary { border: none; background: #41c265; color: #fff; }
      `}</style>

      <h2 style={{ margin: '8px 0 12px' }}>작업창 · 세션 {sessionId}</h2>

      <div className="work-grid">
        {/* 좌측: 원본/정보/컨트롤 */}
        <div>
          <div style={{ padding: 12, background: '#f6f6f6', borderRadius: 10 }}>
            <div style={{ fontWeight: 700, marginBottom: 6, lineHeight: 1.3 }}>
              {cur?.prev_name || '(이전상품명 없음)'}
            </div>
            <div style={{ fontSize: 12, color: '#666', marginBottom: 8 }}>
              {cur?.category || ''}
            </div>
            <div style={{ fontSize: 12, color: '#999' }}>
              행 {Math.min(idx + 1, total)} / {total || 0}
            </div>
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
                  src={`/api/img?u=${encodeURIComponent(https(cur.src_img_url))}`}
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
              inputMode="numeric"
              placeholder="예: 3 → 3,000원"
              style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #ddd', marginTop: 6 }}
              value={bae}
              onChange={(e) => setBae(e.currentTarget.value)}
              onBlur={() => {
                if (!bae) return;
                const num = Number(bae);
                if (Number.isNaN(num)) { setMsg('숫자만 입력'); return; }
                saveRow({ baedaji: num * 1000 });
              }}
            />
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            <button type="button" className="btn" onClick={() => { if (idx > 0) { setIdx(idx - 1); setBae(''); } }} disabled={idx === 0}>
              이전
            </button>
            <button type="button" className="btn" onClick={() => { if (idx < total - 1) { setIdx(idx + 1); setBae(''); } }} disabled={idx === total - 1}>
              다음
            </button>
            <button type="button" className="btn btn-primary" onClick={exportExcel} disabled={!rows.length}>
              완료(엑셀 다운로드)
            </button>
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
            <button type="button" className="btn" onClick={() => saveRow({ skip: !cur?.skip, delete: false, selected_idx: null })}>
              {cur?.skip ? '적합상품없음 ✅' : '적합상품없음'}
            </button>
            <button type="button" className="btn" onClick={() => saveRow({ delete: !cur?.delete, skip: false, selected_idx: null })}>
              {cur?.delete ? '삭제 예정상품 ✅' : '삭제 예정상품'}
            </button>
          </div>

          <div style={{ marginTop: 8, color: '#666', minHeight: 20 }}>{msg}</div>
        </div>

        {/* 우측: 후보 8개 */}
        <div>
          <div data-grid-cands style={{ display: 'grid', gap: 12 }}>
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
                        src={it.img_url}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        alt={`candidate-${i}`}
                        loading="lazy"
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
                      className="btn"
                      style={{ flex: 1 }}
                      onClick={() => saveRow({ selected_idx: selected ? null : i, skip: false, delete: false })}
                    >
                      {selected ? '선택해제' : '선택'}
                    </button>
                    <a href={it.detail_url || '#'} target="_blank" rel="noreferrer" style={{ flex: 1 }}>
                      <button type="button" className="btn" disabled={!it.detail_url} style={{ width: '100%' }}>
                        열기
                      </button>
                    </a>
                  </div>
                </div>
              );
            })}
          </div>

          {/* 후보가 실제로 8칸 모두 빈 경우에만 안내 문구 */}
          {!items.some((x) => x?.img_url) && (
            <div style={{ marginTop: 12, color: '#999' }}>
              표시할 후보가 없습니다. (이미지서치가 끝나지 않았거나 프리패치 결과가 비어 있음)
            </div>
          )}
        </div>
      </div>

      {/* 하단 스티키 버튼바 (모바일 편의) */}
      <div style={{ position: 'sticky', bottom: 0, marginTop: 14, background: '#fff', padding: 8, display: 'flex', gap: 8, borderTop: '1px solid #eee' }}>
        <button type="button" className="btn" style={{ flex: 1 }} onClick={() => { if (idx > 0) { setIdx(idx - 1); setBae(''); } }} disabled={idx === 0}>
          이전
        </button>
        <button type="button" className="btn" style={{ flex: 1 }} onClick={() => { if (idx < total - 1) { setIdx(idx + 1); setBae(''); } }} disabled={idx === total - 1}>
          다음
        </button>
        <button type="button" className="btn btn-primary" style={{ flex: 1 }} onClick={exportExcel} disabled={!rows.length}>
          엑셀
        </button>
      </div>
    </div>
  );
}
