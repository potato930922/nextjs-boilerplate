// app/ingest/page.tsx
import SessionGate from '@/app/components/SessionGate';
import IngestClient from './IngestClient';

export default function Page({ searchParams }: { searchParams: { sid?: string } }) {
  const sid = searchParams.sid ?? '';
  return (
    <SessionGate sessionId={sid}>
      <IngestClient />
    </SessionGate>
  );
}
