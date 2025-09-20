'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function IngestPage() {
  const [sid, setSid] = useState('');
  const [prevs, setPrevs] = useState('');
  const [cats, setCats] = useState('');
  const [names, setNames] = useState('');
  const [imgs, setImgs] = useState('');
  const [msg, setMsg] = useState('');
  const [done, setDone] = useState(false);
  const router = useRouter();

  function lines(s:string){ return s.split('\n').map(v=>v.trim()).filter(Boolean); }

  async function onSubmit() {
    try {
      setMsg('등록 중...');
      const P = lines(prevs), C = lines(cats), N = lines(names), I = lines(imgs);
      const m = Math.max(P.length, C.length, N.length, I.length);
      const rows = Array.from({length:m}).map((_,i)=>({
        prev_name: P[i] || N[i] || '',
        category: C[i] || '',
        new_name: N[i] || '',
        src_img_url: I[i] || '',
      }));
      const r = await fetch(`/api/session/${sid}/ingest`, {
        method:'POST',
        headers:{ 'content-type':'application/json' },
        body: JSON.stringify({ rows })
      });
      const j = await r.json();
      if (!j.ok) { setMsg('실패: ' + (j.error || r.status)); return; }
      setMsg(`완료: ${j.inserted}건 등록 + 프리페치`);
      setDone(true);
    } catch (e:any) {
      setMsg('에러: ' + e?.message);
    }
  }

  return (
    <div style={{padding:24, maxWidth:900, margin:'0 auto', fontFamily:'system-ui'}}>
      <h2>세션 Ingest</h2>

      <div style={{marginTop:8}}>
        <label>세션 ID</label>
        <input value={sid} onChange={e=>setSid(e.target.value)} placeholder="예: S2025-09-19-01" />
      </div>

      <div style={{display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:12, marginTop:12}}>
        <div>
          <div>이전상품명 (줄단위)</div>
          <textarea rows={10} value={prevs} onChange={e=>setPrevs(e.target.value)} />
        </div>
        <div>
          <div>카테고리 (줄단위)</div>
          <textarea rows={10} value={cats} onChange={e=>setCats(e.target.value)} />
        </div>
        <div>
          <div>상품명 (줄단위)</div>
          <textarea rows={10} value={names} onChange={e=>setNames(e.target.value)} />
        </div>
        <div>
          <div>이미지 URL (줄단위)</div>
          <textarea rows={10} value={imgs} onChange={e=>setImgs(e.target.value)} />
        </div>
      </div>

      <div style={{marginTop:12, display:'flex', gap:8}}>
        <button onClick={onSubmit}>이미지서치(저지연)</button>
        {done && <button onClick={()=>router.push(`/work/${sid}`)}>작업 시작 (work)</button>}
      </div>

      <div style={{marginTop:8}}>{msg}</div>
    </div>
  );
}
