'use client';

import { useState } from 'react';

export default function IngestPage() {
  const [sessionId, setSessionId] = useState('');
  const [prevNames, setPrevNames]   = useState('');
  const [categories, setCategories] = useState('');
  const [newNames, setNewNames]     = useState('');
  const [imgUrls, setImgUrls]       = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function submit(useAlt = false) {
    setBusy(true); setMsg(null);
    try {
      const res = await fetch(`/api/session/${encodeURIComponent(sessionId)}/ingest`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          prev_names:   prevNames.split('\n').map(s => s.trim()).filter(Boolean),
          categories:   categories.split('\n').map(s => s.trim()),
          new_names:    newNames.split('\n').map(s => s.trim()),
          image_urls:   imgUrls.split('\n').map(s => s.trim()).filter(Boolean),
          use_alt_api:  useAlt,  // 나중에 크롤러에서 참고할 플래그 (지금은 저장만)
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'ingest_failed');

      setMsg(`총 ${data.inserted}건 등록 완료! 이제 작업 진행 후, /api/session/${sessionId}/export 로 다운로드하세요.`);
    } catch (e: any) {
      setMsg(`오류: ${e.message ?? e}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ padding: 24 }}>
      <h2>행 단위 입력 (엑셀 열 그대로 줄 단위로 붙여넣기)</h2>
      <div style={{ marginTop: 12 }}>
        <label>세션 ID:&nbsp;</label>
        <input
          value={sessionId}
          onChange={e => setSessionId(e.target.value)}
          placeholder="예: S2025-09-19-01"
          style={{ width: 260, padding: 6 }}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 2fr', gap: 16, marginTop: 20 }}>
        <div>
          <div>이전상품명 (줄 단위)</div>
          <textarea value={prevNames} onChange={e => setPrevNames(e.target.value)} rows={12} style={{ width: '100%' }} />
        </div>
        <div>
          <div>카테고리 (줄 단위)</div>
          <textarea value={categories} onChange={e => setCategories(e.target.value)} rows={12} style={{ width: '100%' }} />
        </div>
        <div>
          <div>상품명 (줄 단위)</div>
          <textarea value={newNames} onChange={e => setNewNames(e.target.value)} rows={12} style={{ width: '100%' }} />
        </div>
        <div>
          <div>이미지 URL (줄 단위)</div>
          <textarea value={imgUrls} onChange={e => setImgUrls(e.target.value)} rows={12} style={{ width: '100%' }} />
        </div>
      </div>

      <div style={{ marginTop: 16, display: 'flex', gap: 12 }}>
        <button disabled={busy || !sessionId} onClick={() => submit(false)}>이미지서치</button>
        <button disabled={busy || !sessionId} onClick={() => submit(true)}>이미지서치(저지연)</button>
        {busy && <span> 저장 중… </span>}
      </div>

      {msg && <div style={{ marginTop: 16, whiteSpace: 'pre-wrap' }}>{msg}</div>}
    </div>
  );
}
