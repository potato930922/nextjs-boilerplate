// app/components/SessionGate.tsx
'use client';

import { useCallback, useMemo, useState } from 'react';
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
  const [pinInput, setPinInput] = useState('');
  const [modalOpen, setModalOpen] = useState(false);

  const getPin = useCallback(async () => {
    // 모달 열고 완료를 기다림 (아주 단순한 프로미스)
    setModalOpen(true);
    return new Promise<string>((resolve, reject) => {
      const onOk = () => {
        setModalOpen(false);
        const v = pinInput.trim();
        setPinInput('');
        v ? resolve(v) : reject(new Error('pin_required'));
      };
      const onCancel = () => {
        setModalOpen(false);
        setPinInput('');
        reject(new Error('cancel'));
      };
      // 버튼 핸들러를 전역에 묶어두기보단, 아래 JSX에서 직접 참조
      (window as any).__gate_ok = onOk;
      (window as any).__gate_cancel = onCancel;
    });
  }, [pinInput]);

  const { state, error } = useEnsureSession({ sessionId, getPin });

  const body = useMemo(() => {
    if (state === 'ok') return children;
    if (state === 'opening') return <div style={{ padding: 24 }}>세션 여는 중…</div>;
    if (state === 'error') {
      return (
        <div style={{ padding: 24 }}>
          <div>세션 열기 실패: {error}</div>
          <button onClick={() => location.reload()}>다시 시도</button>
        </div>
      );
    }
    return <div style={{ padding: 24 }}>준비 중…</div>;
  }, [state, error, children]);

  return (
    <>
      {body}

      {modalOpen && (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,.35)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <div style={{ background: '#fff', padding: 20, borderRadius: 12, width: 320 }}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>{title}</div>
            <div style={{ fontSize: 12, color: '#666', marginBottom: 12 }}>
              세션 PIN을 입력하세요. (브라우저 탭을 닫으면 다시 묻습니다)
            </div>
            <input
              type="password"
              placeholder="PIN"
              value={pinInput}
              onChange={(e) => setPinInput(e.currentTarget.value)}
              style={{ width: '100%', padding: '10px 12px', border: '1px solid #ddd', borderRadius: 8 }}
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
              <button onClick={() => (window as any).__gate_cancel?.()}>취소</button>
              <button onClick={() => (window as any).__gate_ok?.()}>확인</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
