// app/work/WorkClient.tsx
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Row, prefetchAllRows, prefetchRow, getFromMemory, prefetchWindow } from '@/lib/prefetcher';

type Props = {
  sessionId: string;
  // 서버에서 내려준 작업 행들 (rowId, srcImageUrl 등)
  rows: Row[];
};

export default function WorkClient({ sessionId, rows }: Props) {
  const [cur, setCur] = useState(0);
  const [progress, setProgress] = useState(0); // 0~100
  const total = rows.length;

  // 현재 행 bundle
  const bundle = useMemo(() => getFromMemory(rows[cur]?.rowId), [cur, rows]);

  // 1) 전체 프리패치(행 단위로 진행될 때마다 프로그래스 갱신)
  useEffect(() => {
    let mounted = true;
    setProgress(0);
    prefetchAllRows(rows, {
      concurrency: 5,
      onRowDone: (done, tot) => {
        if (!mounted) return;
        setProgress(Math.round((done / tot) * 100));
      },
    }).catch(console.error);
    return () => { mounted = false; };
  }, [rows]);

  // 2) 현재 인덱스 바뀔 때, 주변 2개 윈도우 선행 프리패치 (즉시표시율 ↑)
  useEffect(() => {
    prefetchWindow(rows, cur, 2).catch(() => {});
  }, [cur, rows]);

  // 3) 배대지 입력 후 Enter → 다음
  const inputRef = useRef<HTMLInputElement>(null);
  const onEnterBaedaji = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') goNext();
  };

  // 4) 다음/이전
  const goNext = () => setCur((i) => Math.min(total - 1, i + 1));
  const goPrev = () => setCur((i) => Math.max(0, i - 1));

  // 5) 현재 행을 보장(혹시 전체 프리패치 전에 들어오면 여기서만 단건 프리패치)
  useEffect(() => {
    if (!rows[cur]) return;
    if (!getFromMemory(rows[cur].rowId)) {
      prefetchRow(rows[cur]).catch(() => {});
    }
  }, [cur, rows]);

  return (
    <div style={{ padding: 16 }}>
      <h3>세션 {sessionId}</h3>

      {/* 진행률: "행 단위 요청/응답" 기준으로 상승 */}
      <div style={{ margin: '8px 0' }}>
        <div style={{ height: 8, background: '#eee', borderRadius: 6 }}>
          <div style={{
            height: 8,
            width: `${progress}%`,
            background: '#41c265',
            borderRadius: 6,
            transition: 'width .15s ease'
          }} />
        </div>
        <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>{progress}% 진행 중…</div>
      </div>

      {/* 원본 이미지 */}
      <div style={{ display: 'flex', gap: 16 }}>
        <div style={{ flex: '0 0 360px' }}>
          <div style={{ fontSize: 12, marginBottom: 6 }}>원본 이미지</div>
          <div style={{ width: 360, aspectRatio: '1 / 1', background: '#f3f3f3', borderRadius: 10, overflow: 'hidden' }}>
            {rows[cur]?.srcImageUrl ? (
              <img src={rows[cur].srcImageUrl} alt="원본" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : null}
          </div>

          <div style={{ marginTop: 12 }}>
            <label style={{ fontSize: 12 }}>배대지(천원 단위)</label>
            <input
              ref={inputRef}
              onKeyDown={onEnterBaedaji}
              placeholder="예: 3 → 3,000원"
              style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #ddd', marginTop: 6 }}
            />
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button onClick={goPrev} style={btn}>이전</button>
            <button onClick={goNext} style={btn}>다음</button>
          </div>
        </div>

        {/* 후보 8개(즉시 표시: blobUrl 사용) */}
        <div style={{ flex: 1 }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: 12
          }}>
            {bundle?.cands?.length
              ? bundle.cands.map((c) => (
                  <div key={c.idx} style={card}>
                    <div style={thumb}>
                      <img src={c.blobUrl} alt={`cand-${c.idx}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    </div>
                    <div style={meta}>가격: {c.promo_price ?? c.price ?? '-'} / 판매량: {c.sales ?? '-'}</div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                      <button style={btnSm}>선택</button>
                      <a href={c.detail_url || '#'} target="_blank" rel="noreferrer" style={{ flex: 1 }}>
                        <button style={btnSm}>열기</button>
                      </a>
                    </div>
                  </div>
                ))
              : // 아직 현재 행이 메모리에 없으면 place-holder
                Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} style={card}>
                    <div style={thumb}><span style={{ color: '#bbb', fontSize: 12 }}>loading…</span></div>
                    <div style={meta}>가격: - / 판매량: -</div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                      <button style={btnSm} disabled>선택</button>
                      <button style={btnSm} disabled>열기</button>
                    </div>
                  </div>
                ))}
          </div>
        </div>
      </div>
    </div>
  );
}

const btn: React.CSSProperties = {
  padding: '10px 14px',
  borderRadius: 10,
  border: '1px solid #ddd',
  background: '#fff',
};

const btnSm: React.CSSProperties = {
  flex: 1,
  padding: '8px 10px',
  borderRadius: 10,
  border: '1px solid #ddd',
  background: '#fff',
  width: '100%',
};

const card: React.CSSProperties = {
  border: '2px solid #eee',
  borderRadius: 12,
  padding: 8,
  background: '#fff',
  minWidth: 0,
};

const thumb: React.CSSProperties = {
  width: '100%',
  aspectRatio: '1 / 1',
  background: '#f3f3f3',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  overflow: 'hidden',
  borderRadius: 10,
};

const meta: React.CSSProperties = {
  fontSize: 12,
  marginTop: 8,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
};
