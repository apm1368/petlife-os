import type { BuilderSnapshot } from "./builder-state";

/**
 * The set a visitor is building, kept on their own device while they sign in (owner P4: build freely, sign in only to
 * send). Choices go to sessionStorage; picked design files go to IndexedDB (files are never put in web storage as
 * text). Both are cleared once the order is sent. Signed-in members' drafts live in their account (owner P5) instead.
 * Everything is best effort: private windows or blocked storage simply start fresh.
 */
export type SetPetDraft = {
  snapshot: BuilderSnapshot;
  /** Designs picked before signing in: the File itself is in IndexedDB under the same id. */
  files: Array<{ id: string; name: string }>;
};

const KEY = "opl.setpet.draft.v2";
const DB = "opl-setpet";
const STORE = "files";

export function readDraft(): SetPetDraft | null {
  try {
    const raw = window.sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as SetPetDraft) : null;
  } catch {
    return null;
  }
}

/** Keeps the visitor's choices (not files) as they build, so a reload does not lose them. */
export function saveDraftChoices(draft: SetPetDraft): void {
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(draft));
  } catch {
    // Storage blocked: nothing to keep.
  }
}

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === "undefined") return resolve(null);
      const request = indexedDB.open(DB, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function saveDraft(draft: SetPetDraft, files: Map<string, File>): Promise<void> {
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(draft));
  } catch {
    // Storage blocked: the visitor will pick again after signing in.
  }
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      store.clear();
      files.forEach((file, id) => store.put(file, id));
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    } catch {
      resolve();
    }
  });
  db.close();
}

export async function readDraftFiles(ids: string[]): Promise<Map<string, File>> {
  const found = new Map<string, File>();
  const db = await openDb();
  if (!db || !ids.length) return found;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE, "readonly");
      const store = tx.objectStore(STORE);
      ids.forEach((id) => {
        const request = store.get(id);
        request.onsuccess = () => {
          if (request.result instanceof Blob) found.set(id, request.result as File);
        };
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
  db.close();
  return found;
}

export async function clearDraft(): Promise<void> {
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    // ignore
  }
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
  db.close();
}
