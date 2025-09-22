// app/lib/useEnsureSession.ts
'use client';

import { useEffect, useRef, useState } from 'react';

type EnsureOpts = {
  sessionId: string;
  getPin: () => Promise<string>; // PIN을 UI에서 받는 함수 (모달 등)
};

export function useEnsureSession({ sessionId, getPin }: EnsureOpts) {
  const [state, setState] = useState<'idle' | 'opening' | 'ok' | 'error'>('idle');
  const [error, setError] = useState<string>('');
  const tried = useRef(false);

  useEffect(() => {
    if (!sessionId || tried.current) return;
    tried.current = true;

    (async () => {
      setState('opening');
      setError('');

      // 세션에 저장된 PIN 재사용(탭별 보관)
      let pin = sessionStorage.getItem(`pin:${sessionId}`) || '';

      // 1) PIN 없으면 UI로 받기
      if (!pin) {
        try {
          pin = await getPin();
        } catch {
          setState('error');
          setError('pin_cancelled');
          return;
        }
        if (!pin) {
          setState('error');
          setError('pin_required');
          return;
        }
      }

      // 2) /api/session/open 호출
      try {
        const r = await fetch('/api/session/open', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ session_id: sessionId, pin }),
          credentials: 'include',
          cache: 'no-store',
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok || !j?.ok) {
          // PIN이 틀렸을 수도 있으니 캐시 삭제
          sessionStorage.removeItem(`pin:${sessionId}`);
          setState('error');
          setError(j?.error || `open_failed_${r.status}`);
          return;
        }

        // 성공 → PIN 저장(같은 탭에서는 재입력 없이 진행)
        sessionStorage.setItem(`pin:${sessionId}`, pin);
        setState('ok');
      } catch (e: any) {
        setState('error');
        setError(e?.message || 'network_failed');
      }
    })();
  }, [sessionId, getPin]);

  return { state, error };
}
