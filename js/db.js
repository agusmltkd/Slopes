// Almacenamiento local (IndexedDB): días procesados, ficheros originales y ajustes.
const NAME = 'traza', VER = 1;
let dbp;
function open() {
  return dbp ||= new Promise((res, rej) => {
    const r = indexedDB.open(NAME, VER);
    r.onupgradeneeded = () => {
      const db = r.result;
      db.createObjectStore('days', { keyPath: 'id' });
      db.createObjectStore('raw', { keyPath: 'id' });
      db.createObjectStore('kv');
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function tx(store, mode, fn) {
  const db = await open();
  return new Promise((res, rej) => {
    const t = db.transaction(store, mode);
    const out = fn(t.objectStore(store));
    t.oncomplete = () => res(out && 'result' in out ? out.result : undefined);
    t.onerror = t.onabort = () => rej(t.error);
  });
}
export const db = {
  allDays: () => tx('days', 'readonly', s => s.getAll()),
  putDay: d => tx('days', 'readwrite', s => s.put(d)),
  delDay: async id => { await tx('days', 'readwrite', s => s.delete(id)); await tx('raw', 'readwrite', s => s.delete(id)); },
  putRaw: r => tx('raw', 'readwrite', s => s.put(r)),
  allRaw: () => tx('raw', 'readonly', s => s.getAll()),
  get: k => tx('kv', 'readonly', s => s.get(k)),
  set: (k, v) => tx('kv', 'readwrite', s => s.put(v, k)),
};
