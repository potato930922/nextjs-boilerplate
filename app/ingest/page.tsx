// app/ingest/page.tsx (핵심만)
'use client';
import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

export default function Ingest() {
  const [pct, setPct] = useState(0);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const router = useRouter();
  const sp = useSearchParams();
  const sessionId = sp.get('sid') ?? 'S2025-09-19-01';

  async function startPrefetch() {
    setBusy(true); setMsg('서버에서 이미지서치 시작…');
    const r = await fetch(`/api/session/${sessionId}/prefetch?mode=low`, { method: 'POST' });
    if (!r.ok) { setBusy(false); setMsg('시작 실패'); return; }

    // 진행 폴링
    const t = setInterval(async () => {
      const pr = await fetch(`/api/session/${sessionId}/progress`, { cache: 'no-store' });
      const pj = await pr.json(); // {ok,total,pending,done,skipped,deleted,ratio}
      if (pj.ok) setPct(Math.round((pj.ratio ?? 0) * 100));
      if (pj.ok && pj.ratio >= 1) { clearInterval(t); setBusy(false); setMsg('완료!'); }
    }, 1000);
  }

  return (
    <div style={{padding:24}}>
      {/* 열 입력 폼은 기존 그대로 (각 텍스트영역) */}
      <div style={{marginTop:12, display:'flex', gap:8}}>
        <button type="button" disabled={busy} onClick={startPrefetch}>이미지서치(저지연)</button>
        <button type="button" disabled={pct<100} onClick={() => router.push(`/work/${sessionId}`)}>
          작업창 열기
        </button>
      </div>

      {/* 진행바 */}
      <div style={{marginTop:12, width:400}}>
        <div style={{height:10, background:'#eee', borderRadius:6, overflow:'hidden'}}>
          <div style={{width:`${pct}%`, height:'100%', background:'#3b82f6', transition:'width .3s'}} />
        </div>
        <div style={{marginTop:6, fontSize:12}}>{pct}% {msg}</div>
      </div>
    </div>
  );
}
