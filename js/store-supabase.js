// Archivio cloud (Supabase): database + file privati, accesso solo con login.
function createSupabaseStore(cfg) {
  const sb = window.supabase.createClient(cfg.url, cfg.anonKey);
  const BUCKET = 'files';
  const pathsIn = html => [...String(html || '').matchAll(/data-path="([^"]+)"/g)].map(m => m[1]);
  const q = async p => { const { data, error } = await p; if (error) throw error; return data; };
  const urlCache = new Map();
  const NOTE_COLS = 'id,topic_id,workspace_id,user_id,text,created_at,todo,done,due_date,mentions';

  // Supabase restituisce al massimo 1000 righe per richiesta: scarica a pagine.
  async function fetchAll(table, cols = '*', apply = b => b) {
    const out = [];
    for (let from = 0; ; from += 1000) {
      const rows = await q(apply(sb.from(table).select(cols)).range(from, from + 999));
      out.push(...rows);
      if (rows.length < 1000) return out;
    }
  }

  // Errori di Supabase tradotti in italiano dove serve.
  const authError = e => {
    const m = String(e?.message || e);
    if (/invalid login credentials/i.test(m)) return new Error('Email o password non corretti');
    if (/email not confirmed/i.test(m)) return new Error('Devi prima confermare l’email: controlla la posta');
    if (/database error saving new user|non è stata invitata/i.test(m)) return new Error('Questa email non è stata invitata. Chiedi a chi gestisce lo spazio di aggiungerti.');
    if (/already registered/i.test(m)) return new Error('Questa email ha già un account: usa Accedi');
    if (/password should be at least/i.test(m)) return new Error('La password deve avere almeno 6 caratteri');
    return e;
  };

  async function afterLogin(store, user) {
    store.uid = user.id;
    store.email = user.email || '';
    await q(sb.rpc('bootstrap'));
  }

  return {
    mode: 'cloud',
    uid: null,
    email: '',
    async init() {
      const { data } = await sb.auth.getSession();
      const user = data.session?.user;
      if (!user) return { needsLogin: true };
      await afterLogin(this, user);
      return { needsLogin: false };
    },
    async login(email, password) {
      try {
        const d = await q(sb.auth.signInWithPassword({ email, password }));
        await afterLogin(this, d.user);
      } catch (e) { throw authError(e); }
    },
    // Primo accesso di una persona invitata. Se Supabase chiede la conferma dell'email
    // restituisce needsConfirm: l'accesso sarà possibile dopo aver cliccato il link ricevuto.
    async signUp(email, password) {
      try {
        const d = await q(sb.auth.signUp({ email, password, options: { emailRedirectTo: location.href.split('#')[0] } }));
        if (!d.session) return { needsConfirm: true };
        await afterLogin(this, d.user);
        return { needsConfirm: false };
      } catch (e) { throw authError(e); }
    },
    async logout() { await sb.auth.signOut(); this.uid = null; },

    /* spazi di lavoro e persone */
    listWorkspaces: () => fetchAll('workspaces', '*', b => b.order('created_at')),
    createWorkspace: name => q(sb.from('workspaces').insert({ name }).select().single()),
    updateWorkspace: (id, patch) => q(sb.from('workspaces').update(patch).eq('id', id).select().single()),
    async deleteWorkspace(id) {
      const ents = await q(sb.from('entities').select('id').eq('workspace_id', id));
      for (const e of ents) await this.deleteEntity(e.id);
      await q(sb.from('workspaces').delete().eq('id', id));
    },
    listMembers: () => fetchAll('members', '*', b => b.order('created_at')),
    addMember: ({ workspace_id, name, email }) =>
      q(sb.from('members').insert({ workspace_id, name: name || '', email: email ? email.toLowerCase() : null }).select().single()),
    updateMember: (id, patch) => q(sb.from('members').update(patch).eq('id', id).select().single()),
    removeMember: id => q(sb.from('members').delete().eq('id', id)),
    listProfiles: () => fetchAll('profiles'),
    updateProfile(patch) { return q(sb.from('profiles').update(patch).eq('id', this.uid).select().single()); },

    /* enti, argomenti, note */
    listEntities: () => fetchAll('entities'),
    createEntity: (name, workspace_id) => q(sb.from('entities').insert({ name, workspace_id }).select().single()),
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
    async createNote({ topic_id, html, text, todo, due_date, mentions }) {
      const n = await q(sb.from('notes').insert({
        topic_id, html, text, todo: !!todo, due_date: due_date || null, mentions: mentions || []
      }).select().single());
      await q(sb.from('topics').update({ last_activity: n.created_at }).eq('id', topic_id));
      return n;
    },
    updateNote: (id, patch) => q(sb.from('notes').update(patch).eq('id', id).select().single()),
    async deleteNote(id) {
      const n = await q(sb.from('notes').select('html').eq('id', id).maybeSingle());
      if (n) await this.deleteFiles(pathsIn(n.html));
      await q(sb.from('notes').delete().eq('id', id));
    },
    openTodos: () => fetchAll('notes', NOTE_COLS, b => b.eq('todo', true).eq('done', false).order('created_at')),
    // cose da fare (aperte e chiuse) con scadenza tra due date 'AAAA-MM-GG'
    listDue: (from, to) => fetchAll('notes', NOTE_COLS,
      b => b.eq('todo', true).gte('due_date', from).lte('due_date', to).order('due_date').order('created_at')),
    searchNotes: s => q(sb.from('notes').select(NOTE_COLS)
      .ilike('text', `%${s.replace(/[%_\\]/g, m => '\\' + m)}%`)
      .order('created_at', { ascending: false }).limit(100)),
    // note in cui è taggata almeno una delle persone indicate (id di members)
    listMentions: memberIds => memberIds.length
      ? q(sb.from('notes').select(NOTE_COLS).overlaps('mentions', memberIds)
        .order('created_at', { ascending: false }).limit(300))
      : Promise.resolve([]),

    async uploadFile(file) {
      const ext = (file.name || '').match(/\.[a-z0-9]{1,8}$/i)?.[0] || '';
      const path = `${this.uid}/${crypto.randomUUID()}${ext.toLowerCase()}`;
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
      return {
        workspaces: await fetchAll('workspaces'), members: await fetchAll('members'),
        entities: await fetchAll('entities'), topics: await fetchAll('topics'), notes: await fetchAll('notes')
      };
    }
  };
}
