// app/lib/useEnsureSession.ts
'use client';

import { useEffect, useState } from 'react';

type EnsureOpts = {
  sessionId: string;
  askPin: () => Promise<string>; // 모달로 PIN 받기
};

export function useEnsureSession({ sessionId, askPin }: EnsureOpts) {
  const [state, setState] = useState<'idle' | 'opening' | 'ok' | 'error'>('idle');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!sessionId) return;
    let dead = false;

    (async () => {
      setState('opening');
      setError('');

      // 1) 이미 쿠키가 있으면 통과
      try {
        const chk = await fetch(`/api/session/check?sid=${encodeURIComponent(sessionId)}`, {
          cache: 'no-store',
          credentials: 'include',
        });
        if (chk.ok) {
          if (!dead) setState('ok');
          return;
        }
      } catch {
        /* ignore */
      }

      // 2) PIN 받아서 open
      let pin = '';
      try {
        pin = await askPin();
      } catch {
        if (!dead) {
          setState('error');
          setError('pin_cancelled');
        }
        return;
      }
      if (!pin) {
        if (!dead) {
          setState('error');
          setError('pin_required');
        }
        return;
      }

      // 3) /open 호출
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
          if (!dead) {
            setState('error');
            setError(j?.error || `open_failed_${r.status}`);
          }
          return;
        }
        if (!dead) setState('ok');
      } catch (e: any) {
        if (!dead) {
          setState('error');
          setError(e?.message || 'network_failed');
        }
      }
    })();

    return () => {
      dead = true;
    };
  }, [sessionId, askPin]);

  return { state, error };
}
