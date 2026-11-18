// Tiny IndexedDB key/value store (Studio drafts, media blobs, local sound overrides).
const DB = 'hella-party';
const STORES = ['packs', 'files', 'kv'] as const;
type Store = (typeof STORES)[number];

let dbp: Promise<IDBDatabase> | null = null;
function open() {
  return (dbp ??= new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => STORES.forEach(s => r.result.objectStoreNames.contains(s) || r.result.createObjectStore(s));
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  }));
}

async function tx<T>(store: Store, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((res, rej) => {
    const req = fn(db.transaction(store, mode).objectStore(store));
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}

export const db = {
  get: <T = any>(s: Store, k: string) => tx<T>(s, 'readonly', st => st.get(k)),
  set: (s: Store, k: string, v: any) => tx(s, 'readwrite', st => st.put(v, k)),
  del: (s: Store, k: string) => tx(s, 'readwrite', st => st.delete(k)),
  keys: (s: Store) => tx<IDBValidKey[]>(s, 'readonly', st => st.getAllKeys()) as Promise<string[]>,
  /** Delete every key starting with prefix. */
  async delPrefix(s: Store, prefix: string) { for (const k of await db.keys(s)) if (k.startsWith(prefix)) await db.del(s, k); },
};
