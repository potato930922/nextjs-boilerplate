'use client';

import { useEffect, useState } from 'react';

type Cand = {
  idx: number;
  img_url: string;
  detail_url: string;
  price: number|null;
  promo_price: number|null;
  sales: string|null;
  seller: string|null;
};
type Row = {
  row_id: number;
  order_no: number;
  prev_name: string|null;
  category: string|null;
  src_img_url: string|null;
  main_thumb_url: string|null;
  selected_idx: number|null;
  baedaji: number|null;
  skip: boolean|null;
  delete: boolean|null;
  status: string|null;
  candidates: Cand[];
};

export default function WorkPage({ params }: { params: { id: string } }) {
  const sessionId = params.id;
  const [rows, setRows] = useState<Row[]>([]);
  const [idx, setIdx] = useState(0);
  const [msg, setMsg] = useState('');
  const cur = rows[idx];

  useEffect(() => {
    (async () => {
      const r = await fetch(`/api/session/${sessionId}/rows`, { cache:'no-store' });
      const j = await r.json();
      if (j.ok) setRows(j.rows);
      else setMsg('행 불러오기 실패: ' + (j.error || r.status));
    })();
  }, [sessionId]);

  async function saveRow(patch: Partial<Row>) {
    if (!cur) return;
    setMsg('저장중...');
    const r = await fetch(`/api/row/${cur.row_id}/save`, {
      method:'POST',
      headers:{ 'content-type':'application/json' },
      body: JSON.stringify({
        selected_idx: patch.selected_idx ?? cur.selected_idx,
        baedaji: patch.baedaji ?? cur.baedaji,
        skip: patch.skip ?? cur.skip ?? false,
        delete: patch.delete ?? cur.delete ?? false,
      })
    });
    const j = await r.json();
    if (!j.ok) { setMsg('저장 실패: ' + (j.error || r.status)); return; }
    setRows(rs => {
      const n = [...rs]; n[idx] = { ...cur, ...patch }; return n;
    });
    setMsg('저장됨');
  }

  async function onFinish() {
    setMsg('엑셀 생성 중...');
    const r = await fetch(`/api/session/${sessionId}/export`);
    if (!r.ok) { setMsg('export 실패: ' + r.status); return; }
    const blob = await r.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'results.xlsx'; // 파일명 고정
    a.click();
    URL.revokeObjectURL(a.href);
    setMsg('엑셀 다운로드 완료');
  }

  const total = rows.length;

  return (
    <div style={{padding:24, maxWidth:1200, margin:'0 auto', fontFamily:'system-ui, sans-serif'}}>
      <h2>작업창 · 세션 {sessionId}</h2>

      <div style={{display:'flex', gap:24}}>
        {/* 좌: 원본 + 정보 + 컨트롤 */}
        <div style={{flex:'0 0 360px'}}>
          {/* 원본 이미지 칸 */}
          <div style={{width:'100%', aspectRatio:'1/1', background:'#f3f3f3',
            borderRadius:10, overflow:'hidden', display:'flex', alignItems:'center', justifyContent:'center', marginBottom:12}}>
            {cur?.src_img_url
              ? <img src={`/api/proxy?img=${encodeURIComponent(cur.src_img_url)}`} style={{width:'100%', objectFit:'contain'}}/>
              : <span style={{color:'#bbb'}}>no image</span>}
          </div>

          <div style={{padding:12, background:'#f6f6f6', borderRadius:8}}>
            <div style={{fontWeight:700, marginBottom:8}}>{cur?.prev_name || '(이전상품명 없음)'}</div>
            <div style={{fontSize:12, color:'#666', marginBottom:8}}>{cur?.category}</div>
            <div style={{fontSize:12, color:'#999'}}>행 {idx+1} / {total}</div>
          </div>

          <div style={{marginTop:12}}>
            <label style={{fontSize:12}}>배대지(천원 단위)</label>
            <input
              key={cur?.row_id}
              style={{width:'100%', padding:'10px 12px', borderRadius:8, border:'1px solid #ddd', marginTop:6}}
              placeholder="예: 3 → 3,000원"
              defaultValue={cur?.baedaji ? String((cur.baedaji|0)/1000) : ''}
              onBlur={(e) => {
                const v = e.currentTarget.value.trim();
                if (!v) return;
                const num = Number(v);
                if (Number.isNaN(num)) { setMsg('숫자만 입력'); return; }
                saveRow({ baedaji: num*1000 });
              }}
            />
          </div>

          <div style={{display:'flex', gap:8, marginTop:12}}>
            <button onClick={() => { if (idx>0) setIdx(idx-1); }} disabled={idx===0}>이전</button>
            <button onClick={() => { if (idx<total-1) setIdx(idx+1); }} disabled={idx===total-1}>다음</button>
            <button onClick={onFinish} disabled={!rows.length}>완료(Export)</button>
          </div>

          <div style={{display:'flex', gap:8, marginTop:8}}>
            <button onClick={() => saveRow({ skip: !cur?.skip, delete:false, selected_idx: null })}>
              {cur?.skip ? '적합상품없음 ✅' : '적합상품없음'}
            </button>
            <button onClick={() => saveRow({ delete: !cur?.delete, skip:false, selected_idx: null })}>
              {cur?.delete ? '삭제 예정상품 ✅' : '삭제 예정상품'}
            </button>
          </div>

          <div style={{marginTop:8, color:'#666'}}>{msg}</div>
        </div>

        {/* 우: 후보 8개 (이미 선계산된 candidates 사용) */}
        <div style={{flex:1}}>
          <div style={{display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:12}}>
            {(cur?.candidates || []).map((it, i) => {
              const selected = cur?.selected_idx === i && !cur?.skip && !cur?.delete;
              return (
                <div key={i} style={{
                  border:'2px solid', borderColor: selected ? '#ff5a5a' : '#eee',
                  borderRadius:10, padding:8, background:'#fff'
                }}>
                  <div style={{width:'100%', aspectRatio:'1/1', background:'#f3f3f3',
                    display:'flex', alignItems:'center', justifyContent:'center', overflow:'hidden', borderRadius:8}}>
                    {it.img_url
                      ? <img src={`/api/proxy?img=${encodeURIComponent(it.img_url)}`} style={{width:'100%', objectFit:'cover'}} />
                      : <span style={{color:'#bbb'}}>no image</span>}
                  </div>
                  <div style={{fontSize:12, marginTop:8}}>
                    {it.promo_price != null || it.price != null
                      ? <>가격: {(it.promo_price ?? it.price)!.toLocaleString()} {it.promo_price==null ? '(정가)' : ''}</>
                      : <>가격: -</>}
                  </div>
                  <div style={{fontSize:12, marginTop:4}}>
                    판매량: {it.sales ?? '-'} {it.seller ? ` | 판매자: ${it.seller}` : ''}
                  </div>
                  <div style={{display:'flex', gap:8, marginTop:8}}>
                    <button onClick={() => saveRow({ selected_idx: (cur?.selected_idx===i ? null : i), skip:false, delete:false })}>
                      {selected ? '선택해제' : '선택'}
                    </button>
                    {it.detail_url &&
                      <a href={it.detail_url} target="_blank" rel="noreferrer">
                        <button type="button">열기</button>
                      </a>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
