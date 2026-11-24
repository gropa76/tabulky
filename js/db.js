'use strict';
/* Ukládání do zařízení (IndexedDB). Když není k dispozici, data drží jen v paměti. */
const DB = (() => {
  let db = null, mem = { tables: new Map(), recipes: new Map() }, ok = false;
  function open() {
    return new Promise(resolve => {
      try {
        const req = indexedDB.open('tabulky-db', 1);
        req.onupgradeneeded = () => {
          const d = req.result;
          if (!d.objectStoreNames.contains('tables')) d.createObjectStore('tables', { keyPath: 'id' });
          if (!d.objectStoreNames.contains('recipes')) d.createObjectStore('recipes', { keyPath: 'id' });
        };
        req.onsuccess = () => { db = req.result; ok = true; resolve(true); };
        req.onerror = () => resolve(false);
      } catch (e) { resolve(false); }
    });
  }
  function tx(store, mode, fn) {
    return new Promise((resolve, reject) => {
      const t = db.transaction(store, mode), s = t.objectStore(store);
      const r = fn(s);
      t.oncomplete = () => resolve(r && 'result' in r ? r.result : undefined);
      t.onerror = () => reject(t.error);
    });
  }
  return {
    open,
    get persistent() { return ok; },
    all: store => ok ? tx(store, 'readonly', s => s.getAll()) : Promise.resolve([...mem[store].values()]),
    put: (store, obj) => ok ? tx(store, 'readwrite', s => s.put(obj)) : (mem[store].set(obj.id, obj), Promise.resolve()),
    del: (store, id) => ok ? tx(store, 'readwrite', s => s.delete(id)) : (mem[store].delete(id), Promise.resolve()),
  };
})();
