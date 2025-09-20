"use client";

import { useState } from "react";

export default function JoinPage() {
  const [sessionId, setSessionId] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function openSession() {
    setBusy(true); setMsg("");
    const r = await fetch("/api/session/open", {
      method: "POST",
      headers: { "content-type":"application/json" },
      body: JSON.stringify({ session_id: sessionId, pin }),
    });
    const j = await r.json();
    setBusy(false);
    if (j.ok) {
      location.href = `/session/${encodeURIComponent(sessionId)}`;
    } else {
      setMsg("세션 오픈 실패: " + (j.error || r.status));
    }
  }

  return (
    <main className="p-6 max-w-md mx-auto space-y-4">
      <h1 className="text-xl font-semibold">세션 입장</h1>
      <input className="w-full border rounded p-2" placeholder="세션 ID"
             value={sessionId} onChange={e=>setSessionId(e.target.value)} />
      <input className="w-full border rounded p-2" placeholder="PIN(6자리)" type="password"
             value={pin} onChange={e=>setPin(e.target.value)} />
      <button onClick={openSession} disabled={busy}
              className="px-4 py-2 rounded bg-black text-white disabled:opacity-50">입장</button>
      {msg && <p className="text-red-600">{msg}</p>}
    </main>
  );
}
