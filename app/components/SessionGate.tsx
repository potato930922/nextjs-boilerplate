// app/components/SessionGate.tsx
'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { useEnsureSession } from '@/app/lib/useEnsureSession';

export default function SessionGate({
  sessionId,
  children,
  title = '세션 인증',
}: {
  sessionId: string;
  children: React.ReactNode;
  title?: string;
}) {
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const resolverRef = useRef<{ ok?: (v: string) => void; cancel?: () => void }>({});

  const askPin = useCallback(() => {
    setOpen(true);
    return new Promise<string>((resolve, reject) => {
      resolverRef.current.ok = (v: string) => {
        setOpen(false);
        resolve(v);
      };
      resolverRef.current.cancel = () => {
        setOpen(false);
        reject(new Error('cancel'));
      };
    });
  }, []);

  const onConfirm = () => {
    const v = inputRef.current?.value.trim() || '';
    resolverRef.current.ok?.(v);
  };
  const onCancel = () => resolverRef.current.cancel?.();

  const { state, error } = useEnsureSession({ sessionId, askPin });

  const body = useMemo(() => {
    if (state === 'ok') return children;
    if (state === 'opening') return <div style={{ padding: 24 }}>세션 여는 중…</div>;
    if (state === 'error')
      return (
        <div style={{ padding: 24 }}>
          <div>세션 열기 실패: {error}</div>
          <button onClick={() => location.reload()}>다시 시도</button>
        </div>
      );
    return <div style={{ padding: 24 }}>준비 중…</div>;
  }, [state, error, children]);

  return (
    <>
      {body}
      {open && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,.35)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div style={{ background: '#fff', padding: 20, borderRadius: 12, width: 320 }}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>{title}</div>
            <div style={{ fontSize: 12, color: '#666', marginBottom: 12 }}>세션 PIN을 입력하세요.</div>
            <input
              ref={inputRef}
              type="password"
              placeholder="PIN"
              style={{ width: '100%', padding: '10px 12px', border: '1px solid #ddd', borderRadius: 8 }}
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
              <button onClick={onCancel}>취소</button>
              <button onClick={onConfirm}>확인</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
