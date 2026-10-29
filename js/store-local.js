// Archivio locale (IndexedDB): usato quando Supabase non è configurato.
function createLocalStore() {
  const newId = () => crypto.randomUUID();
  const now = () => new Date().toISOString();
  const pathsIn = html => [...String(html || '').matchAll(/data-path="([^"]+)"/g)].map(m => m[1]);
  const byDate = (a, b) => a.created_at.localeCompare(b.created_at);

  let dbPromise;
  const open = () => dbPromise || (dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open('secondbrain', 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      db.createObjectStore('entities', { keyPath: 'id' });
      db.createObjectStore('topics', { keyPath: 'id' }).createIndex('entity_id', 'entity_id');
      db.createObjectStore('notes', { keyPath: 'id' }).createIndex('topic_id', 'topic_id');
      db.createObjectStore('files');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }));

  const P = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const os = async (name, mode = 'readonly') => (await open()).transaction(name, mode).objectStore(name);
  const all = async name => P((await os(name)).getAll());
  const get = async (name, key) => P((await os(name)).get(key));
  const put = async (name, val, key) => P((await os(name, 'readwrite')).put(val, key));
  const del = async (name, key) => P((await os(name, 'readwrite')).delete(key));
  const byIndex = async (name, idx, val) => P((await os(name)).index(idx).getAll(val));
  const urlCache = new Map();
  // come l'indice unico del database: niente due enti con lo stesso nome
  const nameKey = s => String(s ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
  async function noDuplicate(name, exceptId) {
    if ((await all('entities')).some(e => e.id !== exceptId && nameKey(e.name) === nameKey(name)))
      throw Object.assign(new Error('Esiste già un ente con questo nome'), { code: '23505' });
  }

  return {
    mode: 'local',
    async init() { await open(); return { needsLogin: false }; },

    listEntities: () => all('entities'),
    async createEntity(name, kind = 'ente') {
      await noDuplicate(name);
      const e = { id: newId(), name, kind, created_at: now() };
      await put('entities', e); return e;
    },
    async updateEntity(id, patch) {
      if ('name' in patch) await noDuplicate(patch.name, id);
      const e = Object.assign(await get('entities', id), patch);
      await put('entities', e); return e;
    },
    async deleteEntity(id) {
      for (const t of await byIndex('topics', 'entity_id', id)) await this.deleteTopic(t.id);
      await del('entities', id);
    },

    listTopics: () => all('topics'),
    async createTopic(entity_id, title) {
      const t = { id: newId(), entity_id, title, created_at: now(), last_activity: now() };
      await put('topics', t); return t;
    },
    async updateTopic(id, patch) {
      const t = Object.assign(await get('topics', id), patch);
      await put('topics', t); return t;
    },
    async deleteTopic(id) {
      for (const n of await byIndex('notes', 'topic_id', id)) {
        await this.deleteFiles(pathsIn(n.html));
        await del('notes', n.id);
      }
      await del('topics', id);
    },

    async listNotes(topic_id) { return (await byIndex('notes', 'topic_id', topic_id)).sort(byDate); },
    async createNote({ topic_id, html, text, todo, due_date }) {
      const t = now();
      const n = { id: newId(), topic_id, html, text, todo: !!todo, done: false, due_date: due_date || null, created_at: t, updated_at: t };
      await put('notes', n);
      await this.updateTopic(topic_id, { last_activity: t });
      return n;
    },
    async updateNote(id, patch) {
      const n = Object.assign(await get('notes', id), patch);
      await put('notes', n); return n;
    },
    async deleteNote(id) {
      const n = await get('notes', id);
      if (n) { await this.deleteFiles(pathsIn(n.html)); await del('notes', id); }
    },
    async openTodos() { return (await all('notes')).filter(n => n.todo && !n.done).sort(byDate); },
    async listDue(from, to) {
      return (await all('notes')).filter(n => n.todo && n.due_date && n.due_date >= from && n.due_date <= to)
        .sort((a, b) => a.due_date.localeCompare(b.due_date) || byDate(a, b));
    },
    async searchNotes(q) {
      const s = q.toLowerCase();
      return (await all('notes')).filter(n => (n.text || '').toLowerCase().includes(s))
        .sort((a, b) => byDate(b, a)).slice(0, 100);
    },

    async uploadFile(file) {
      const ext = (file.name || '').match(/\.[a-z0-9]{1,8}$/i)?.[0] || '';
      const path = newId() + ext.toLowerCase();
      await put('files', { blob: file, name: file.name, type: file.type }, path);
      return path;
    },
    async resolveUrls(paths) {
      const out = {};
      for (const p of paths) {
        if (!urlCache.has(p)) {
          const f = await get('files', p);
          if (f) urlCache.set(p, URL.createObjectURL(f.blob));
        }
        out[p] = urlCache.get(p);
      }
      return out;
    },
    async deleteFiles(paths) { for (const p of paths) await del('files', p); },

    async exportAll() {
      return { entities: await all('entities'), topics: await all('topics'), notes: await all('notes') };
    }
  };
}
