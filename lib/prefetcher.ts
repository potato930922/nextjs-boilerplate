// lib/prefetcher.ts
// 행 단위로 8개 후보를 미리 받아서 즉시 띄우게 해주는 프리패처

import { idbGet, idbPut } from './idbImageCache';

export type Row = {
  rowId: number;
  srcImageUrl: string;     // 원본 이미지 URL
  prevName?: string;
  category?: string;
  // ...필요한 메타 필드들
};

export type CandMeta = {
  idx: number;           // 0..7
  img_url: string;
  price?: number;
  promo_price?: number;
  sales?: string;
  seller?: string;
  detail_url?: string;
};

export type RowBundle = {
  rowId: number;
  cands: Array<CandMeta & { blobUrl: string }>; // 즉시표시용 objectURL
};

// ---------------------
// 간단한 동시성 제한기
// ---------------------
function runWithLimit<T>(limit: number, tasks: Array<() => Promise<T>>) {
  return new Promise<T[]>((resolve, reject) => {
    const results: T[] = [];
    let i = 0, running = 0, done = 0;

    const next = () => {
      while (running < limit && i < tasks.length) {
        const cur = i++;
        running++;
        tasks[cur]().then((r) => {
          results[cur] = r;
          running--;
          done++;
          if (done === tasks.length) resolve(results);
          else next();
        }).catch(reject);
      }
    };
    next();
  });
}

// ---------------------
// 내부 캐시 (메모리)
// ---------------------
const memory = new Map<number, RowBundle>(); // rowId -> bundle

export function getFromMemory(rowId: number) {
  return memory.get(rowId);
}

export function evictFromMemory(rowId: number) {
  const b = memory.get(rowId);
  if (b) {
    // objectURL 해제
    b.cands.forEach(c => URL.revokeObjectURL(c.blobUrl));
    memory.delete(rowId);
  }
}

export function clearMemory() {
  for (const b of memory.values()) b.cands.forEach(c => URL.revokeObjectURL(c.blobUrl));
  memory.clear();
}

// ---------------------
// API 호출(후보 8개 메타)
// `/api/search?src=...&rowId=...` 같은 본인 라우트로 바꿔줘
// ---------------------
async function fetchCandidates(row: Row): Promise<CandMeta[]> {
  const api = `/api/search?rowId=${row.rowId}&src=${encodeURIComponent(row.srcImageUrl)}`;
  const r = await fetch(api);
  if (!r.ok) throw new Error(`search ${r.status}`);
  const j = await r.json();
  // 예상: { ok:true, candidates:[{idx,img_url,price...}, ...] }
  if (!j.ok) throw new Error(j.error || 'search_failed');
  return (j.candidates || []).slice(0, 8);
}

// 이미지(프록시)를 Blob으로 받기
async function fetchImageBlob(url: string): Promise<Blob> {
  // 우리 프록시: /api/img?u=...
  const r = await fetch(`/api/img?u=${encodeURIComponent(url)}`);
  if (!r.ok) throw new Error(`img ${r.status}`);
  return await r.blob();
}

// ---------------------
// 한 행 프리패치(후보 8개 전부 준비 → 메모리+IDB 저장)
// ---------------------
export async function prefetchRow(row: Row): Promise<RowBundle> {
  // 이미 메모리에 있으면 바로 반환
  const m = memory.get(row.rowId);
  if (m) return m;

  // 후보 메타
  const metas = await fetchCandidates(row);

  // 8개 이미지를 병렬(동시성 4)로
  const tasks = metas.map((meta) => async () => {
    const key = `${row.rowId}:${meta.idx}`;
    // 1) IDB캐시 먼저
    const cached = await idbGet(key);
    let blob: Blob;
    if (cached) {
      blob = cached;
    } else {
      // 2) 원격 프록시에서 가져오기
      blob = await fetchImageBlob(meta.img_url);
      // 3) IDB에 저장(실패해도 무시)
      idbPut(key, blob).catch(() => {});
    }
    const blobUrl = URL.createObjectURL(blob);
    return { ...meta, blobUrl };
  });

  const cands = await runWithLimit(4, tasks);
  const bundle: RowBundle = { rowId: row.rowId, cands };
  memory.set(row.rowId, bundle);
  return bundle;
}

// ---------------------
// 행 목록 전체 프리패치(150개 같은 대량)
// - progress 콜백: 행 하나 완료 시마다 호출
// - windowing: 동시에 너무 많이 돌리면 네트워크 과부하라서
//   batchSize(예: 20)씩 순차 돌려도 됨.
// ---------------------
export async function prefetchAllRows(
  rows: Row[],
  opts?: { concurrency?: number; onRowDone?: (done: number, total: number) => void; batchSize?: number }
) {
  const total = rows.length;
  let done = 0;
  const concurrency = opts?.concurrency ?? 5; // 한 번에 5행씩
  const batch = opts?.batchSize ?? rows.length;

  for (let off = 0; off < rows.length; off += batch) {
    const slice = rows.slice(off, off + batch);
    const tasks = slice.map((row) => async () => {
      await prefetchRow(row); // 내부에서 후보 8개까지 전부 준비
      done++;
      opts?.onRowDone?.(done, total);
    });
    // 행 단위 동시성 제한
    await runWithLimit(concurrency, tasks);
  }
}

// ---------------------
// 다음 행을 미리 빨리 준비하고 싶으면
// 현재 행 기준 앞뒤 N개만 선별 프리패치도 가능
// ---------------------
export async function prefetchWindow(rows: Row[], centerIdx: number, radius = 2) {
  const start = Math.max(0, centerIdx - radius);
  const end = Math.min(rows.length, centerIdx + radius + 1);
  const slice = rows.slice(start, end);
  await runWithLimit(3, slice.map(r => () => prefetchRow(r)));
}
