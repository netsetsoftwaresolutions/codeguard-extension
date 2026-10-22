/** Blobs stay in extension-origin IndexedDB, never in Chrome's JSON runtime messages. */
export interface UploadFile { name: string; path: string; blob: Blob }
const TTL = 10 * 60 * 1000;

export function validateUploadFiles(files: UploadFile[], maxBytes: number): void {
  if (!files.length) throw new Error('Select at least one file.');
  if (files.length > 5000) throw new Error('Select at most 5,000 files.');
  if (files.reduce((sum, f) => sum + f.blob.size, 0) > maxBytes) throw new Error('The selection exceeds the server upload limit. Your plan may have a lower limit.');
  const paths = new Set<string>();
  for (const file of files) {
    if (!file.name || !file.path || file.path.length > 1024 || /[\\\x00-\x1f]/.test(file.path) || file.path.split('/').some((part) => !part || part === '.' || part === '..')) throw new Error('A selected file has an invalid relative path.');
    if (paths.has(file.path)) throw new Error('Duplicate file paths. Select a folder to preserve its directory structure.');
    paths.add(file.path);
  }
}

async function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('codeguard-uploads', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('uploads');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** Expired source bytes are purged whenever the upload page opens or stages a selection. */
export async function cleanUploads(): Promise<void> {
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('uploads', 'readwrite');
      const request = tx.objectStore('uploads').openCursor();
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;
        if (cursor.value.expiresAt < Date.now()) cursor.delete();
        cursor.continue();
      };
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error);
    });
  } finally { db.close(); }
}

export async function stageUpload(files: UploadFile[]): Promise<string> {
  await cleanUploads();
  const id = crypto.randomUUID();
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('uploads', 'readwrite');
      tx.objectStore('uploads').put({ files, expiresAt: Date.now() + TTL }, id);
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error);
    });
    return id;
  } finally { db.close(); }
}

/** Read and delete atomically, including on failed requests; retry requires a fresh selection. */
export async function takeUpload(id: string): Promise<UploadFile[]> {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction('uploads', 'readwrite');
      const store = tx.objectStore('uploads');
      const request = store.get(id);
      request.onsuccess = () => store.delete(id);
      tx.oncomplete = () => {
        const record = request.result;
        if (!record || record.expiresAt < Date.now()) reject(new Error('Upload expired. Select your files again.'));
        else resolve(record.files);
      };
      tx.onabort = () => reject(tx.error);
    });
  } finally { db.close(); }
}
