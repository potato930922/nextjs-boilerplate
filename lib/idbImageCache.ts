// lib/idbImageCache.ts
// 후보 이미지 blob을 rowId+idx 키로 저장/조회
const DB_NAME = 'img-cache-v1';
const STORE = 'blobs';

function openDB(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}

export async function idbPut(key: string, blob: Blob) {
  const db = await openDB();
  await new Promise<void>((res, rej) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(blob, key);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
  db.close();
}

export async function idbGet(key: string): Promise<Blob | undefined> {
  const db = await openDB();
  const out = await new Promise<Blob | undefined>((res, rej) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(key);
    req.onsuccess = () => res(req.result as Blob | undefined);
    req.onerror = () => rej(req.error);
  });
  db.close();
  return out;
}

export async function idbDelete(key: string) {
  const db = await openDB();
  await new Promise<void>((res, rej) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(key);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
  db.close();
}

export async function idbClear() {
  const db = await openDB();
  await new Promise<void>((res, rej) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).clear();
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
  db.close();
}
