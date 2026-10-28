// Archivio cloud (Supabase): database + file privati, accesso solo con login.
function createSupabaseStore(cfg) {
  const sb = window.supabase.createClient(cfg.url, cfg.anonKey);
  const BUCKET = 'files';
  const pathsIn = html => [...String(html || '').matchAll(/data-path="([^"]+)"/g)].map(m => m[1]);
  const q = async p => { const { data, error } = await p; if (error) throw error; return data; };
  const urlCache = new Map();
  let uid = null;

  // Supabase restituisce al massimo 1000 righe per richiesta: scarica a pagine.
  async function fetchAll(table, cols = '*', apply = b => b) {
    const out = [];
    for (let from = 0; ; from += 1000) {
      const rows = await q(apply(sb.from(table).select(cols)).range(from, from + 999));
      out.push(...rows);
      if (rows.length < 1000) return out;
    }
  }

  return {
    mode: 'cloud',
    async init() {
      const { data } = await sb.auth.getSession();
      uid = data.session?.user?.id || null;
      this.email = data.session?.user?.email || '';
      return { needsLogin: !uid };
    },
    async login(email, password) {
      const d = await q(sb.auth.signInWithPassword({ email, password }));
      uid = d.user.id;
      this.email = d.user.email || email;
    },
    async logout() { await sb.auth.signOut(); uid = null; },

    listEntities: () => fetchAll('entities'),
    createEntity: name => q(sb.from('entities').insert({ name }).select().single()),
    updateEntity: (id, patch) => q(sb.from('entities').update(patch).eq('id', id).select().single()),
    async deleteEntity(id) {
      const tps = await q(sb.from('topics').select('id').eq('entity_id', id));
      if (tps.length) {
        const notes = await fetchAll('notes', 'html', b => b.in('topic_id', tps.map(t => t.id)));
        await this.deleteFiles(notes.flatMap(n => pathsIn(n.html)));
      }
      await q(sb.from('entities').delete().eq('id', id));
    },

    listTopics: () => fetchAll('topics'),
    createTopic: (entity_id, title) => q(sb.from('topics').insert({ entity_id, title }).select().single()),
    updateTopic: (id, patch) => q(sb.from('topics').update(patch).eq('id', id).select().single()),
    async deleteTopic(id) {
      const notes = await fetchAll('notes', 'html', b => b.eq('topic_id', id));
      await this.deleteFiles(notes.flatMap(n => pathsIn(n.html)));
      await q(sb.from('topics').delete().eq('id', id));
    },

    listNotes: topic_id => fetchAll('notes', '*', b => b.eq('topic_id', topic_id).order('created_at')),
    async createNote({ topic_id, html, text, todo, due_date }) {
      const n = await q(sb.from('notes').insert({ topic_id, html, text, todo: !!todo, due_date: due_date || null }).select().single());
      await q(sb.from('topics').update({ last_activity: n.created_at }).eq('id', topic_id));
      return n;
    },
    updateNote: (id, patch) => q(sb.from('notes').update(patch).eq('id', id).select().single()),
    async deleteNote(id) {
      const n = await q(sb.from('notes').select('html').eq('id', id).maybeSingle());
      if (n) await this.deleteFiles(pathsIn(n.html));
      await q(sb.from('notes').delete().eq('id', id));
    },
    openTodos: () => fetchAll('notes', 'id,topic_id,text,created_at,todo,done,due_date',
      b => b.eq('todo', true).eq('done', false).order('created_at')),
    // cose da fare (aperte e chiuse) con scadenza tra due date 'AAAA-MM-GG'
    listDue: (from, to) => fetchAll('notes', 'id,topic_id,text,created_at,todo,done,due_date',
      b => b.eq('todo', true).gte('due_date', from).lte('due_date', to).order('due_date').order('created_at')),
    searchNotes: s => q(sb.from('notes').select('id,topic_id,text,created_at,todo,done,due_date')
      .ilike('text', `%${s.replace(/[%_\\]/g, m => '\\' + m)}%`)
      .order('created_at', { ascending: false }).limit(100)),

    async uploadFile(file) {
      const ext = (file.name || '').match(/\.[a-z0-9]{1,8}$/i)?.[0] || '';
      const path = `${uid}/${crypto.randomUUID()}${ext.toLowerCase()}`;
      await q(sb.storage.from(BUCKET).upload(path, file, { contentType: file.type || 'application/octet-stream' }));
      return path;
    },
    // I file sono privati: per mostrarli si generano link temporanei (6 ore).
    async resolveUrls(paths) {
      const t = Date.now();
      const need = paths.filter(p => !(urlCache.get(p)?.exp > t));
      if (need.length) {
        const rows = await q(sb.storage.from(BUCKET).createSignedUrls(need, 6 * 3600));
        rows.forEach(r => r.signedUrl && urlCache.set(r.path, { url: r.signedUrl, exp: t + 5 * 3600 * 1000 }));
      }
      return Object.fromEntries(paths.map(p => [p, urlCache.get(p)?.url]));
    },
    async deleteFiles(paths) { if (paths.length) await q(sb.storage.from(BUCKET).remove(paths)); },

    async exportAll() {
      return { entities: await fetchAll('entities'), topics: await fetchAll('topics'), notes: await fetchAll('notes') };
    }
  };
}
