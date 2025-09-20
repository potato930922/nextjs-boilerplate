// app/work/page.tsx
import { redirect } from "next/navigation";

export default function WorkEntry({ searchParams }: { searchParams: { sid?: string } }) {
  const sid = searchParams?.sid?.trim();
  if (sid) return redirect(`/work/${encodeURIComponent(sid)}`);
  return (
    <main style={{ padding: 24 }}>
      <h3>세션 ID가 필요합니다</h3>
      <p>/work?sid=세션ID 또는 /work/세션ID 로 접속하세요.</p>
    </main>
  );
}
