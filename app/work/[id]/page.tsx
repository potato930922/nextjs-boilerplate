'use client';

import { useEffect, useMemo, useState } from 'react';

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
};

type Item = {
  img_url: string;
  promo_price: number|null;
  price: number|null;
  sales: string|null;
  seller: string|null;
  detail_url: string;
};

function salesToInt(s: string | null): number {
  if (!s) return -1;
  const t = s.toLowerCase().replace(/,/g,'').trim();
  const m = t.match(/([\d\.]+)\s*([kw万]?)/);
  if (!m) { const d = t.match(/\d+/); return d ? Number(d[0]) : -1; }
  let n = parseFloat(m[1]); const u = m[2];
  if (u === 'w' || u === '万') n *= 10000;
  if (u === 'k') n *= 1000;
  return Math.round(n);
}

export default function WorkPage({ params }: { params: { id: string } }) {
  const sessionId = params.id;

  const [rows, setRows] = useState<Row[]>([]);
  const [idx, setIdx] = useState(0);
  const cur = rows[idx];

  const [items, setItems] = useState<Item[]>(Array(8).fill({img_url:'',promo_price:null,price:null,sales:null,seller:null,detail_url:''}));
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<'low'|'alt'>('low'); // 저지연/일반 토글
  const [msg, setMsg] = useState<string>('');

  // 1) 세션 행 로드
  useEffect(() => {
    (async () => {
      const r = await fetch(`/api/session/${sessionId}/rows`, { cache:'no-store' });
      const j = await r.json();
      if (j.ok) setRows(j.rows);
      else setMsg(`행 불러오기 실패: ${j.error || r.status}`);
    })();
  }, [sessionId]);

  // 2) 후보 8개 불러오기
  async function loadCandidates(row: Row, useAlt = mode) {
    if (!row?.src_img_url) { setItems(Array(8).fill({img_url:'',promo_price:null,price:null,sales:null,seller:null,detail_url:''})); return; }
    setLoading(true); setMsg('');
    const r = await fetch('/api/taobao/search', {
      method:'POST',
      headers:{ 'content-type':'application/json' },
      body: JSON.stringify({ img: row.src_img_url, mode: useAlt })
    });
    const j = await r.json();
    setLoading(false);
    if (j.ok) setItems(j.items as Item[]);
    else setMsg(`이미지서치 실패: ${j.error || r.status}`);
  }

  useEffect(() => { if (cur) loadCandidates(cur); }, [idx, rows.length]);

  // 3) 선택/스킵/삭제/배대지 저장
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
    if (!j.ok) { setMsg(`저장 실패: ${j.error || r.status}`); return; }
    setRows(rs => {
      const n = [...rs];
      n[idx] = { ...cur, ...patch };
      return n;
    });
    setMsg('저장됨');
  }

  const total = rows.length;

  return (
    <div style={{padding:24, maxWidth:1100, margin:'0 auto', fontFamily:'system-ui, sans-serif'}}>
      <h2>작업창 · 세션 {sessionId}</h2>

      <div style={{display:'flex', gap:24}}>
        {/* 좌: 기본정보 + 컨트롤 */}
        <div style={{flex:'0 0 360px'}}>
          <div style={{padding:12, background:'#f6f6f6', borderRadius:8}}>
            <div style={{fontWeight:700, marginBottom:8}}>{cur?.prev_name || '(이전상품명 없음)'}</div>
            <div style={{fontSize:12, color:'#666', marginBottom:8}}>{cur?.category}</div>
            <div style={{fontSize:12, color:'#999'}}>행 {idx+1} / {total}</div>
          </div>

          <div style={{marginTop:12}}>
            <label style={{fontSize:12}}>배대지(천원 단위)</label>
            <input
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
            <button onClick={() => { if (cur) loadCandidates(cur, mode); }} disabled={loading}>재검색</button>
            <select value={mode} onChange={e => setMode(e.target.value as any)}>
              <option value="low">저지연</option>
              <option value="alt">일반</option>
            </select>
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

        {/* 우: 후보 8개 */}
        <div style={{flex:1}}>
          <div style={{display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:12}}>
            {items.map((it, i) => {
              const selected = cur?.selected_idx === i && !cur?.skip && !cur?.delete;
              return (
                <div key={i} style={{
                  border:'2px solid', borderColor: selected ? '#ff5a5a' : '#eee',
                  borderRadius:10, padding:8, background:'#fff'
                }}>
                  <div style={{width:'100%', aspectRatio:'1/1', background:'#f3f3f3',
                    display:'flex', alignItems:'center', justifyContent:'center', overflow:'hidden', borderRadius:8}}>
                    {it.img_url
                      ? <img src={it.img_url} style={{width:'100%', objectFit:'cover'}} />
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
          {loading && <div style={{marginTop:8}}>이미지서치 중...</div>}
        </div>
      </div>
    </div>
  );
}
