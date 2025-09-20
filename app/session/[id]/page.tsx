"use client";

import { useEffect, useMemo, useState } from "react";

type Row = {
  row_id: number;
  session_id: string;
  order_no: number;
  prev_name: string | null;
  category: string | null;
  src_img_url: string | null;
  main_thumb_url: string | null;
  selected_idx: number | null;
  baedaji: number | null;
  skip: boolean | null;
  delete: boolean | null;
};

type Item = {
  img_url: string; promo_price: number|null; price: number|null;
  sales: string|null; seller: string|null; detail_url: string;
};

function salesToInt(s: string | null) {
  if (!s) return -1;
  const t = s.toLowerCase().replace(/,/g,"").trim();
  const m = t.match(/([\d\.]+)\s*([kw万]?)/);
  if (!m) return parseInt((t.match(/\d+/)||["-1"])[0], 10);
  let num = parseFloat(m[1]); const unit = m[2];
  if (unit === "w" || unit === "万") num *= 10000;
  else if (unit === "k") num *= 1000;
  return Math.round(num);
}

export default function Viewer({ params }: { params:{ id:string } }) {
  const sessionId = decodeURIComponent(params.id);
  const [row, setRow] = useState<Row | null>(null);
  const [items, setItems] = useState<Item[]>(Array(8).fill(null as any));
  const [selected, setSelected] = useState<number | null>(null);
  const [skip, setSkip] = useState(false);
  const [del, setDel] = useState(false);
  const [baedaji, setBaedaji] = useState<string>(""); // 천원 단위 입력

  // 다음 행 가져오기
  async function loadNext() {
    const r = await fetch(`/api/session/${encodeURIComponent(sessionId)}/next`, { cache:"no-store" });
    const j = await r.json();
    if (!j.ok || !j.row) { alert("더 이상 작업이 없어요"); return; }
    const rw: Row = j.row;
    setRow(rw);
    setSelected(rw.selected_idx);
    setSkip(!!rw.skip); setDel(!!rw.delete);
    setBaedaji(rw.baedaji ? String(Math.round(rw.baedaji/1000)) : "");
    // 후보는 DB에 없을 수도 있으니, 이미지로 즉시 검색
    if (rw.src_img_url) {
      const s = await fetch(`/api/search?img=${encodeURIComponent(rw.src_img_url)}&mode=low`, { cache:"no-store" });
      const sj = await s.json();
      setItems(sj.ok ? sj.items : Array(8).fill(null));
      // 판매량 최대 자동선택(스킵/삭제가 아닐 때만)
      if (!rw.skip && !rw.delete) {
        let best = 0, idx = 0;
        sj.items.forEach((it:Item, i:number) => { const v = salesToInt(it.sales); if (v > best) { best = v; idx = i; } });
        setSelected(idx);
      }
    }
  }

  useEffect(() => { loadNext(); }, [sessionId]);

  async function save() {
    if (!row) return;
    if (!skip && !del && selected === null) { alert("이미지 하나 골라줘!"); return; }
    const payload: any = { selected_idx: selected, skip, delete: del };
    if (baedaji) payload.baedaji = Number(baedaji) * 1000;
    const r = await fetch(`/api/row/${row.row_id}/save`, {
      method:"POST", headers:{ "content-type":"application/json" },
      body: JSON.stringify(payload),
    });
    const j = await r.json();
    if (!j.ok) { alert("저장 실패"); return; }
    await loadNext();
  }

  const grid = useMemo(() => items || [], [items]);

  return (
    <main className="p-4 space-y-4 max-w-6xl mx-auto">
      <header className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-lg font-semibold">{row?.prev_name || "-"}</h1>
          <p className="text-sm text-gray-600">{row?.category || ""}</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="text-sm">배대지(천원):</label>
          <input value={baedaji} onChange={e=>setBaedaji(e.target.value)}
                 className="w-24 border rounded p-2" inputMode="numeric" />
          <button onClick={()=>{ setSkip(s=>!s); setDel(false); setSelected(null); }}
                  className={`px-3 py-2 rounded border ${skip?'bg-yellow-100':''}`}>적합상품없음</button>
          <button onClick={()=>{ setDel(d=>!d); setSkip(false); setSelected(null); }}
                  className={`px-3 py-2 rounded border ${del?'bg-red-100':''}`}>삭제 예정상품</button>
          <button onClick={save} className="px-4 py-2 rounded bg-black text-white">저장 → 다음</button>
        </div>
      </header>

      {/* 원본 이미지 */}
      {row?.src_img_url && (
        <div className="flex justify-end">
          <img src={row.src_img_url} alt="" className="w-[220px] h-[220px] object-contain rounded border" />
        </div>
      )}

      {/* 8칸 그리드 */}
      <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {grid.map((it: Item, i: number) => (
          <div key={i}
               className={`p-2 rounded border ${selected===i ? "ring-2 ring-red-500" : ""}`}>
            {it?.img_url ? (
              <img src={it.img_url} alt="" className="w-full h-40 object-contain" onClick={()=>{ setSelected(selected===i?null:i); setSkip(false); setDel(false); }} />
            ) : (
              <div className="w-full h-40 bg-gray-200" />
            )}
            <div className="mt-2 text-sm">
              <div>가격: {it?.promo_price ?? it?.price ?? "-"}</div>
              <div className="font-semibold">판매량: {it?.sales ?? "-" } {it?.seller ? `| 판매자: ${it.seller}` : ""}</div>
              {it?.detail_url && (
                <a href={it.detail_url} target="_blank" className="text-blue-600 break-all text-xs">{it.detail_url}</a>
              )}
            </div>
          </div>
        ))}
      </section>
    </main>
  );
}
