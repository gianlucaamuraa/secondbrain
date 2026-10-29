// Archivio locale (IndexedDB): usato quando Supabase non è configurato.
// Non ci sono account: si possono comunque creare spazi e aggiungere persone (solo nome) da taggare.
function createLocalStore() {
  const ME = 'local';
  const newId = () => crypto.randomUUID();
  const now = () => new Date().toISOString();
  const pathsIn = html => [...String(html || '').matchAll(/data-path="([^"]+)"/g)].map(m => m[1]);
  const byDate = (a, b) => a.created_at.localeCompare(b.created_at);

  let dbPromise;
  const open = () => dbPromise || (dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open('secondbrain', 2);
    req.onupgradeneeded = ev => {
      const db = req.result;
      if (ev.oldVersion < 1) {
        db.createObjectStore('entities', { keyPath: 'id' });
        db.createObjectStore('topics', { keyPath: 'id' }).createIndex('entity_id', 'entity_id');
        db.createObjectStore('notes', { keyPath: 'id' }).createIndex('topic_id', 'topic_id');
        db.createObjectStore('files');
      }
      if (ev.oldVersion < 2) {
        db.createObjectStore('workspaces', { keyPath: 'id' });
        db.createObjectStore('members', { keyPath: 'id' });
      }
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

  async function addWorkspace(name, personal) {
    const w = { id: newId(), name, personal, created_by: ME, created_at: now() };
    await put('workspaces', w);
    await put('members', { id: newId(), workspace_id: w.id, user_id: ME, email: null, name: 'Io', role: 'owner', created_at: now() });
    return w;
  }

  return {
    mode: 'local',
    uid: ME,
    email: '',
    async init() {
      await open();
      // spazio personale e dati creati prima degli spazi di lavoro
      let personal = (await all('workspaces')).find(w => w.personal);
      if (!personal) personal = await addWorkspace('Personale', true);
      const entWs = new Map();
      for (const e of await all('entities')) {
        if (!e.workspace_id) { e.workspace_id = personal.id; await put('entities', e); }
        entWs.set(e.id, e.workspace_id);
      }
      const topWs = new Map();
      for (const t of await all('topics')) {
        if (!t.workspace_id) { t.workspace_id = entWs.get(t.entity_id) || personal.id; await put('topics', t); }
        topWs.set(t.id, t.workspace_id);
      }
      for (const n of await all('notes')) {
        if (!n.workspace_id || !n.mentions) {
          n.workspace_id = n.workspace_id || topWs.get(n.topic_id) || personal.id;
          n.mentions = n.mentions || [];
          await put('notes', n);
        }
      }
      return { needsLogin: false };
    },

    /* spazi di lavoro e persone */
    async listWorkspaces() { return (await all('workspaces')).sort(byDate); },
    createWorkspace: name => addWorkspace(name, false),
    async updateWorkspace(id, patch) {
      const w = Object.assign(await get('workspaces', id), patch);
      await put('workspaces', w); return w;
    },
    async deleteWorkspace(id) {
      for (const e of (await all('entities')).filter(x => x.workspace_id === id)) await this.deleteEntity(e.id);
      for (const m of (await all('members')).filter(x => x.workspace_id === id)) await del('members', m.id);
      await del('workspaces', id);
    },
    async listMembers() { return (await all('members')).sort(byDate); },
    async addMember({ workspace_id, name }) {
      const m = { id: newId(), workspace_id, user_id: null, email: null, name: name || '', role: 'member', created_at: now() };
      await put('members', m); return m;
    },
    async updateMember(id, patch) {
      const m = Object.assign(await get('members', id), patch);
      await put('members', m); return m;
    },
    removeMember: id => del('members', id),
    listProfiles: async () => [],
    async updateProfile() { return null; },

    /* enti, argomenti, note */
    listEntities: () => all('entities'),
    async createEntity(name, workspace_id) {
      const e = { id: newId(), name, workspace_id, created_at: now() };
      await put('entities', e); return e;
    },
    async updateEntity(id, patch) {
      const e = Object.assign(await get('entities', id), patch);
      await put('entities', e);
      if (patch.workspace_id) {
        // spostato in un altro spazio: seguono argomenti e note
        for (const t of await byIndex('topics', 'entity_id', id)) {
          t.workspace_id = patch.workspace_id; await put('topics', t);
          for (const n of await byIndex('notes', 'topic_id', t.id)) { n.workspace_id = patch.workspace_id; await put('notes', n); }
        }
      }
      return e;
    },
    async deleteEntity(id) {
      for (const t of await byIndex('topics', 'entity_id', id)) await this.deleteTopic(t.id);
      await del('entities', id);
    },

    listTopics: () => all('topics'),
    async createTopic(entity_id, title) {
      const ent = await get('entities', entity_id);
      const t = { id: newId(), entity_id, workspace_id: ent?.workspace_id, title, created_at: now(), last_activity: now() };
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
    async createNote({ topic_id, html, text, todo, due_date, mentions }) {
      const t = now();
      const tp = await get('topics', topic_id);
      const n = {
        id: newId(), topic_id, workspace_id: tp?.workspace_id, user_id: ME, html, text, todo: !!todo, done: false,
        due_date: due_date || null, mentions: mentions || [], created_at: t, updated_at: t
      };
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
    async listMentions(memberIds) {
      const ids = new Set(memberIds);
      return (await all('notes')).filter(n => (n.mentions || []).some(m => ids.has(m)))
        .sort((a, b) => byDate(b, a)).slice(0, 300);
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
      return {
        workspaces: await all('workspaces'), members: await all('members'),
        entities: await all('entities'), topics: await all('topics'), notes: await all('notes')
      };
    }
  };
}
