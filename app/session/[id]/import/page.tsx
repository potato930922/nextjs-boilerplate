// app/session/[id]/import/page.tsx
'use client';

import { useState } from 'react';

export default function ImportPage({ params }: { params: { id: string } }) {
  const sessionId = params.id;
  const [csv, setCsv] = useState<string>('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string>('');

  const example =
`prev_name,category,src_img_url,new_name,baedaji
이전상품명1,카테고리A,https://.../image1.jpg,새상품명1,6000
이전상품명2,카테고리B,https://.../image2.jpg,새상품명2,0`;

  async function submit(type: 'paste' | 'file') {
    setBusy(true); setMsg('');
    try {
      let res: Response;
      if (type === 'paste') {
        res = await fetch('/api/row/bulk', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ session_id: sessionId, csv }),
        });
      } else {
        const fd = new FormData();
        if (!file) { setMsg('파일을 선택하세요'); setBusy(false); return; }
        fd.append('session_id', sessionId);
        fd.append('file', file);
        res = await fetch('/api/row/bulk', { method: 'POST', body: fd });
      }
      const j = await res.json();
      if (!res.ok || !j.ok) {
        setMsg(`실패: ${j.error || res.statusText}`);
      } else {
        setMsg(`성공: ${j.inserted}건 추가`);
        setCsv(''); setFile(null);
      }
    } catch (e: any) {
      setMsg(`오류: ${String(e?.message || e)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-4xl p-6">
      <h1 className="text-2xl font-semibold mb-4">세션 데이터 입력 · {sessionId}</h1>

      <section className="mb-8 p-4 rounded-md border">
        <h2 className="font-medium mb-2">1) CSV 붙여넣기</h2>
        <p className="text-sm text-gray-600 mb-2">
          헤더 예시: <code>prev_name,category,src_img_url,new_name,baedaji</code>
        </p>
        <textarea
          className="w-full h-48 p-2 border rounded"
          placeholder={example}
          value={csv}
          onChange={(e) => setCsv(e.target.value)}
        />
        <div className="mt-2">
          <button
            onClick={() => submit('paste')}
            disabled={busy}
            className="px-4 py-2 rounded bg-black text-white disabled:opacity-50"
          >
            붙여넣기 등록
          </button>
        </div>
      </section>

      <section className="mb-8 p-4 rounded-md border">
        <h2 className="font-medium mb-2">2) CSV 파일 업로드(.csv)</h2>
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
          className="mb-2"
        />
        <div>
          <button
            onClick={() => submit('file')}
            disabled={busy}
            className="px-4 py-2 rounded bg-black text-white disabled:opacity-50"
          >
            파일 업로드
          </button>
        </div>
      </section>

      <div className="mt-4 text-sm">
        <a href={`/session/${sessionId}`} className="underline">작업 화면으로 돌아가기</a>
      </div>

      {msg && <p className="mt-4 p-3 rounded bg-gray-100">{msg}</p>}
    </main>
  );
}
