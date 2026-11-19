function openStore() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("voiceforge-audio", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("clips");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function access<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>) {
  const database = await openStore();
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = database.transaction("clips", mode);
      const request = run(transaction.objectStore("clips"));
      transaction.oncomplete = () => resolve(request.result);
      transaction.onabort = () => reject(transaction.error);
      transaction.onerror = () => reject(transaction.error);
    });
  } finally {
    database.close();
  }
}

export const saveClip = (id: string, audio: Blob) => access("readwrite", (store) => store.put(audio, id));
export const loadClip = (id: string): Promise<Blob | undefined> => access("readonly", (store) => store.get(id));

export const deleteClip = (id: string) => access("readwrite", (store) => store.delete(id));
