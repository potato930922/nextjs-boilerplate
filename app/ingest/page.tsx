// app/ingest/page.tsx
import { Suspense } from 'react';
import IngestClient from './IngestClient';

// 프리렌더 시 CSR 훅 때문에 빌드가 막히지 않게
export const dynamic = 'force-dynamic';

export default function Page() {
  return (
    <Suspense fallback={<div style={{ padding: 24 }}>로딩 중…</div>}>
      <IngestClient />
    </Suspense>
  );
}
