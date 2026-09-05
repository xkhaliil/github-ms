/**
 * A minimal promise wrapper over IndexedDB. The app has no server and no disk,
 * so proposals, evidence, inventory and audit all live here, in the user's own
 * browser.
 *
 * localStorage would have been less code, but a scan of a large account plus its
 * evidence bundles runs well past the 5MB limit, and losing a run to a quota
 * error after paying for it is not an acceptable failure mode.
 */

const DB_NAME = "gitms";
const DB_VERSION = 1;

/** One store per kind of record, so a clear of one never touches the others. */
export const STORE_KV = "kv";
export const STORE_PROPOSALS = "proposals";
export const STORE_EVIDENCE = "evidence";

let dbPromise: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const name of [STORE_KV, STORE_PROPOSALS, STORE_EVIDENCE]) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(
        request.error ?? new Error("Could not open the local gitms database."),
      );
  });
  return dbPromise;
}

function run<T>(
  store: string,
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(store, mode);
        const request = work(tx.objectStore(store));
        request.onsuccess = () => resolve(request.result);
        // Surface the transaction error too: a quota failure lands there, not on
        // the request, and it is the one the user actually needs to be told about.
        request.onerror = () => reject(request.error ?? tx.error);
        tx.onabort = () =>
          reject(tx.error ?? new Error("Local storage transaction aborted."));
      }),
  );
}

export async function idbGet<T>(store: string, key: string): Promise<T | null> {
  const value = await run<T | undefined>(store, "readonly", (s) => s.get(key));
  return value ?? null;
}

export function idbSet(
  store: string,
  key: string,
  value: unknown,
): Promise<IDBValidKey> {
  return run(store, "readwrite", (s) => s.put(value, key));
}

export function idbDelete(store: string, key: string): Promise<undefined> {
  return run(store, "readwrite", (s) => s.delete(key));
}

export function idbKeys(store: string): Promise<IDBValidKey[]> {
  return run(store, "readonly", (s) => s.getAllKeys());
}

export function idbValues<T>(store: string): Promise<T[]> {
  return run<T[]>(store, "readonly", (s) => s.getAll());
}

export function idbClear(store: string): Promise<undefined> {
  return run(store, "readwrite", (s) => s.clear());
}
