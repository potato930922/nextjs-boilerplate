// app/ingest/IngestClient.tsx
'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';

type RawRow = {
  prev_name: string;
  category: string;
  new_name: string;
  src_img_url: string;
};

function splitLines(v: string) {
  return v.replace(/\r\n/g, '\n').split('\n').map(s => s.trim()).filter(Boolean);
}

export default function IngestClient() {
  const sp = useSearchParams();
  const router = useRouter();
  const sid = useMemo(() => sp.get('sid') ?? '', [sp]);

  // 폼
  const [prevNames, setPrevNames] = useState('');
  const [categories, setCategories] = useState('');
  const [newNames, setNewNames] = useState('');
  const [imgUrls, setImgUrls] = useState('');

  // 진행
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [percent, setPercent] = useState<number>(0);
  const [canGoWork, setCanGoWork] = useState(false);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  async function pollProgress(sessionId: string) {
    try {
      const r = await fetch(`/api/session/${sessionId}/progress`, { cache: 'no-store' });
      if (!r.ok) return;
      const j = await r.json();
      if (j.ok) {
        const ratio = typeof j.ratio === 'number' ? j.ratio : 0;
        setPercent(Math.round(ratio * 100));
        if (ratio >= 1) {
          stopPolling();
          setBusy(false);
          setMsg('이미지 서칭 완료!');
          setCanGoWork(true);
        }
      }
    } catch {/* ignore */}
  }
  function startPolling() { stopPolling(); if (!sid) return; pollTimer.current = setInterval(() => pollProgress(sid), 1500); }
  function stopPolling() { if (pollTimer.current) clearInterval(pollTimer.current); pollTimer.current = null; }
  useEffect(() => stopPolling, []);

  function buildRows(): RawRow[] {
    const a = splitLines(prevNames);
    const b = splitLines(categories);
    const c = splitLines(newNames);
    const d = splitLines(imgUrls);
    const n = Math.max(a.length, b.length, c.length, d.length);
    const rows: RawRow[] = [];
    for (let i = 0; i < n; i++) {
      const row: RawRow = { prev_name: a[i] || '', category: b[i] || '', new_name: c[i] || '', src_img_url: d[i] || '' };
      if (!row.src_img_url || (!row.prev_name && !row.new_name)) continue;
      rows.push(row);
    }
    return rows;
  }

  // 업로드 → 프리페치 시작 → 진행률 폴링
  async function doIngest() {
    if (!sid) { alert('세션 ID(?sid=...)가 필요합니다.'); return; }
    const rows = buildRows();
    if (!rows.length) { alert('입력된 행이 없습니다. (이미지 URL과 이름 중 하나는 있어야 함)'); return; }

    setBusy(true); setMsg('서버로 업로드 중…'); setPercent(0); setCanGoWork(false);

    try {
      const r = await fetch(`/api/session/${encodeURIComponent(sid)}/ingest`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ purge: true, rows }),
        cache: 'no-store',
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) { setBusy(false); setMsg(`업로드 실패: ${j.error || r.status}`); return; }

      setMsg('이미지 서칭 시작…');
      const pf = await fetch(`/api/session/${encodeURIComponent(sid)}/prefetch`, { method: 'POST', cache: 'no-store' });
      const pj = await pf.json().catch(() => ({}));
      if (!pf.ok || !pj.ok) { setBusy(false); setMsg(`프리페치 시작 실패: ${pj.error || pf.status}`); return; }

      setMsg('이미지 서칭 중…');
      startPolling();
    } catch { setBusy(false); setMsg('네트워크 오류로 실패했어요.'); }
  }

  function goWork() { if (!sid) return; router.push(`/work/${encodeURIComponent(sid)}`); }

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto', fontFamily: 'system-ui, sans-serif' }}>
      <h2>행 단위 입력 (엑셀 열 그대로 줄 단위로 붙여넣기)</h2>
      <div style={{ marginTop: 8, fontSize: 14 }}>세션 ID:&nbsp;<b>{sid || '(미지정)'}</b></div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginTop: 16 }}>
        <div>
          <div style={{ marginBottom: 6, fontWeight: 600 }}>이전상품명 (줄 단위)</div>
          <textarea value={prevNames} onChange={e => setPrevNames(e.currentTarget.value)} rows={12} style={{ width: '100%', resize: 'vertical' }} />
        </div>
        <div>
          <div style={{ marginBottom: 6, fontWeight: 600 }}>카테고리 (줄 단위)</div>
          <textarea value={categories} onChange={e => setCategories(e.currentTarget.value)} rows={12} style={{ width: '100%', resize: 'vertical' }} />
        </div>
        <div>
          <div style={{ marginBottom: 6, fontWeight: 600 }}>상품명 (줄 단위)</div>
          <textarea value={newNames} onChange={e => setNewNames(e.currentTarget.value)} rows={12} style={{ width: '100%', resize: 'vertical' }} />
        </div>
        <div>
          <div style={{ marginBottom: 6, fontWeight: 600 }}>이미지 URL (줄 단위)</div>
          <textarea value={imgUrls} onChange={e => setImgUrls(e.currentTarget.value)} rows={12} style={{ width: '100%', resize: 'vertical' }} />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
        <button onClick={doIngest} disabled={busy}>이미지서치(저지연)</button>
        <button onClick={goWork} disabled={!canGoWork}>Work로 이동</button>
      </div>

      <div style={{ marginTop: 16, maxWidth: 600 }}>
        <div style={{ height: 12, background: '#eee', borderRadius: 8, overflow: 'hidden' }}>
          <div style={{ width: `${percent}%`, height: '100%', background: busy ? '#4f8cff' : '#41c265', transition: 'width .4s ease' }} />
        </div>
        <div style={{ marginTop: 6, color: '#555' }}>
          {busy ? `${percent}% 진행 중…` : percent >= 100 ? '완료' : msg || '대기 중'}
        </div>
      </div>
    </div>
  );
}
