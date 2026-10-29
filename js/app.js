(() => {
'use strict';

/* ---------- utilità ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const h = html => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
const pad = n => String(n).padStart(2, '0');
const fmtDate = iso => { const d = new Date(iso); return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} - ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const fmtSize = b => b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(0)} KB` : `${(b / 1048576).toFixed(1)} MB`;
const today = () => { const s = new Date().toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }); return s[0].toUpperCase() + s.slice(1); };
const pathsIn = html => [...String(html || '').matchAll(/data-path="([^"]+)"/g)].map(m => m[1]);
// ordine alfabetico italiano, con i numeri in ordine naturale ("Lotto 2" prima di "Lotto 10")
const byName = k => (a, b) => a[k].localeCompare(b[k], 'it', { sensitivity: 'base', numeric: true });

/* ---------- date e scadenze (formato 'AAAA-MM-GG', ora locale) ---------- */
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseYmd = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (s, n) => { const d = parseYmd(s); d.setDate(d.getDate() + n); return ymd(d); };
const todayKey = () => ymd(new Date());
const cap1 = s => s[0].toUpperCase() + s.slice(1);
const fmtDay = s => `${pad(parseYmd(s).getDate())}/${pad(parseYmd(s).getMonth() + 1)}/${parseYmd(s).getFullYear()}`;
const fmtLongDay = s => cap1(parseYmd(s).toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' }));
const WEEKDAYS = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];

function dueState(n) {
  const d = n.due_date;
  if (!d) return { cls: 'none', label: 'Scadenza' };
  const t = todayKey();
  if (n.done) return { cls: 'done', label: fmtDay(d) };
  if (d < t) return { cls: 'over', label: `Scaduta ${fmtDay(d)}` };
  if (d === t) return { cls: 'today', label: 'Oggi' };
  if (d === addDays(t, 1)) return { cls: 'soon', label: 'Domani' };
  const wd = parseYmd(d).toLocaleDateString('it-IT', { weekday: 'short' });
  return { cls: 'future', label: `${wd} ${fmtDay(d)}` };
}
// prima quelle con scadenza (dalla più vicina), poi le altre per data di inserimento
// a parità di scadenza: ente e argomento in ordine alfabetico
const cmpIt = (a, b) => a.localeCompare(b, 'it', { sensitivity: 'base', numeric: true });
const placeOf = n => { const t = topicOf(n.topic_id); const e = t && entityOf(t.entity_id); return [e?.name || '', t?.title || '']; };
const sortTodos = list => list.sort((a, b) => {
  const byDue = a.due_date && b.due_date ? a.due_date.localeCompare(b.due_date) : a.due_date ? -1 : b.due_date ? 1 : 0;
  if (byDue) return byDue;
  const [ea, ta] = placeOf(a), [eb, tb] = placeOf(b);
  return cmpIt(ea, eb) || cmpIt(ta, tb) || a.created_at.localeCompare(b.created_at);
});
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const ls = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch { /* ignora */ } }
};

/* ---------- icone (tratto lineare, stile Lucide) ---------- */
const ICONS = {
  logo: '<path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"/><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65"/>',
  dashboard: '<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>',
  todo: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="m9 12 2 2 4-4"/>',
  building: '<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4"/><path d="M8 6h.01M12 6h.01M16 6h.01M8 10h.01M12 10h.01M16 10h.01M8 14h.01M12 14h.01M16 14h.01"/>',
  folder: '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
  clip: '<path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/>',
  send: '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  trash: '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  file: '<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><path d="M14 2v6h6"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  chevron: '<path d="m9 18 6-6-6-6"/>',
  chevronLeft: '<path d="m15 18-6-6 6-6"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  alert: '<circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  bold: '<path d="M6 12h9a4 4 0 0 1 0 8H7a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h7a4 4 0 0 1 0 8"/>',
  italic: '<path d="M19 4h-9M14 20H5M15 4 9 20"/>',
  underline: '<path d="M6 4v6a6 6 0 0 0 12 0V4"/><path d="M4 20h16"/>',
  strike: '<path d="M16 4H9a3 3 0 0 0-2.83 4"/><path d="M14 12a4 4 0 0 1 0 8H6"/><path d="M4 12h16"/>',
  highlight: '<path d="m9 11-6 6v3h9l3-3"/><path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4"/>',
  h1: '<path d="M4 12h8M4 18V6M12 18V6"/><path d="m17 12 3-2v8"/>',
  h2: '<path d="M4 12h8M4 18V6M12 18V6"/><path d="M21 18h-4c0-4 4-3 4-6 0-1.5-2-2.5-4-1"/>',
  list: '<path d="M3 6h.01M3 12h.01M3 18h.01M8 6h13M8 12h13M8 18h13"/>',
  listOrdered: '<path d="M10 6h11M10 12h11M10 18h11"/><path d="M4 6h1v4M4 10h2M6 18H4c0-1 2-2 2-3s-1-1.5-2-1"/>',
  listChecks: '<path d="m3 17 2 2 4-4"/><path d="m3 7 2 2 4-4"/><path d="M13 6h8M13 12h8M13 18h8"/>',
  quote: '<path d="M16 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2 1 1 0 0 1 1 1v1a2 2 0 0 1-2 2 1 1 0 0 0-1 1v2a1 1 0 0 0 1 1 6 6 0 0 0 6-6V5a2 2 0 0 0-2-2z"/><path d="M5 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2 1 1 0 0 1 1 1v1a2 2 0 0 1-2 2 1 1 0 0 0-1 1v2a1 1 0 0 0 1 1 6 6 0 0 0 6-6V5a2 2 0 0 0-2-2z"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  eraser: '<path d="M4 7V4h16v3M5 20h6M13 4 8 20"/><path d="m15 15 5 5M20 15l-5 5"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  loader: '<path d="M21 12a9 9 0 1 1-6.22-8.56"/>',
  database: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14a9 3 0 0 0 18 0V5"/><path d="M3 12a9 3 0 0 0 18 0"/>',
  notes: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  activity: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
  inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  userPlus: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/>',
  at: '<circle cx="12" cy="12" r="4"/><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8"/>',
  swap: '<path d="m7 15 5 5 5-5"/><path d="m7 9 5-5 5 5"/>',
  move: '<path d="M2 9V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H20a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H2"/><path d="m8 16 3-3-3-3"/><path d="M2 16v-1a2 2 0 0 1 2-2h6"/>',
  mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>'
};
const icon = (n, cls = '') => `<svg class="i ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[n]}</svg>`;
const brand = `<span class="logo">${icon('logo')}</span><span class="brand-name">Second Brain</span>`;
const TINTS = ['blue', 'green', 'amber', 'violet', 'rose', 'teal'];
const tintOf = s => TINTS[[...String(s)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7) % TINTS.length];

const PURIFY_VIEW = { ADD_ATTR: ['target', 'contenteditable'], FORBID_TAGS: ['style', 'form', 'input', 'button', 'textarea', 'select'] };
const PURIFY_PASTE = {
  FORBID_TAGS: ['style', 'meta', 'link', 'form', 'input', 'button', 'textarea', 'select'],
  FORBID_ATTR: ['style', 'class', 'id', 'width', 'height', 'contenteditable']
};

/* ---------- finestre di dialogo dell'app (al posto di prompt/confirm del browser) ---------- */
function dialog({ title, text = '', input = null, okText = 'Salva', danger = false }) {
  return new Promise(resolve => {
    const wrap = h(`<div class="modal-back">
      <form class="modal" role="dialog" aria-modal="true" aria-label="${esc(title)}">
        <div class="modal-head">
          <span class="tile sm ${danger ? 'rose' : 'blue'}">${icon(danger ? 'trash' : 'edit')}</span>
          <h3>${esc(title)}</h3>
        </div>
        ${text ? `<p class="modal-text">${esc(text)}</p>` : ''}
        ${input ? `<input class="modal-input" value="${esc(input.value || '')}" placeholder="${esc(input.placeholder || '')}" ${input.required === false ? '' : 'required'}>` : ''}
        <div class="modal-actions">
          <button type="button" class="btn" data-m="cancel">Annulla</button>
          <button type="submit" class="btn ${danger ? 'danger-fill' : 'primary'}">${esc(okText)}</button>
        </div>
      </form>
    </div>`);
    document.body.append(wrap);
    const form = wrap.querySelector('form'), inp = wrap.querySelector('input');
    const cancelValue = input ? null : false;
    const close = v => { wrap.remove(); document.removeEventListener('keydown', onKey, true); resolve(v); };
    const onKey = ev => { if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); close(cancelValue); } };
    document.addEventListener('keydown', onKey, true);
    form.onsubmit = ev => { ev.preventDefault(); close(input ? inp.value.trim() : true); };
    wrap.querySelector('[data-m="cancel"]').onclick = () => close(cancelValue);
    wrap.addEventListener('mousedown', ev => { if (ev.target === wrap) close(cancelValue); });
    setTimeout(() => { if (inp) { inp.focus(); inp.select(); } else form.querySelector('[type="submit"]').focus(); }, 0);
  });
}
const askText = (title, value, okText = 'Salva', placeholder = '') => dialog({ title, input: { value, placeholder }, okText });
const askConfirm = (title, text, okText = 'Elimina') => dialog({ title, text, okText, danger: true });

// scelta tra alcune opzioni (es. lo spazio in cui spostare un ente)
function askChoice(title, text, options, okText = 'Conferma') {
  return new Promise(resolve => {
    const wrap = h(`<div class="modal-back">
      <form class="modal" role="dialog" aria-modal="true" aria-label="${esc(title)}">
        <div class="modal-head"><span class="tile sm blue">${icon('move')}</span><h3>${esc(title)}</h3></div>
        ${text ? `<p class="modal-text">${esc(text)}</p>` : ''}
        <div class="choice-list">${options.map((o, i) => `<label class="choice">
          <input type="radio" name="c" value="${esc(o.value)}" ${i ? '' : 'checked'}>
          <span><strong>${esc(o.label)}</strong>${o.sub ? `<small>${esc(o.sub)}</small>` : ''}</span></label>`).join('')}</div>
        <div class="modal-actions">
          <button type="button" class="btn" data-m="cancel">Annulla</button>
          <button type="submit" class="btn primary">${esc(okText)}</button>
        </div>
      </form>
    </div>`);
    document.body.append(wrap);
    const close = v => { wrap.remove(); document.removeEventListener('keydown', onKey, true); resolve(v); };
    const onKey = ev => { if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); close(null); } };
    document.addEventListener('keydown', onKey, true);
    wrap.querySelector('form').onsubmit = ev => { ev.preventDefault(); close(wrap.querySelector('input:checked')?.value || null); };
    wrap.querySelector('[data-m="cancel"]').onclick = () => close(null);
    wrap.addEventListener('mousedown', ev => { if (ev.target === wrap) close(null); });
    setTimeout(() => wrap.querySelector('input:checked')?.focus(), 0);
  });
}

let toastTimer;
function toast(msg, type = '') {
  const t = $('#toast');
  t.textContent = msg;
  t.className = `toast show ${type}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.className = 'toast'; }, 3500);
}
const toastErr = e => { console.error(e); toast('Errore: ' + (e?.message || e), 'err'); };

function loadScript(src) {
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = src; s.onload = res; s.onerror = () => rej(new Error('Impossibile caricare ' + src));
    document.head.append(s);
  });
}

/* ---------- stato ---------- */
let store;
// S.todos e S.myMentions contengono solo lo spazio di lavoro corrente; S.allTodos tutti gli spazi.
const S = { workspaces: [], members: [], profiles: [], entities: [], topics: [], allTodos: [], todos: [], mentionsAll: [], myMentions: [], wsId: null, route: null };
const main = $('#main');

async function reloadAll() {
  [S.workspaces, S.members, S.profiles, S.entities, S.topics, S.allTodos] = await Promise.all([
    store.listWorkspaces(), store.listMembers(), store.listProfiles(),
    store.listEntities(), store.listTopics(), store.openTodos()
  ]);
  S.entities.sort(byName('name'));
  S.topics.sort(byName('title'));
  S.workspaces.sort((a, b) => (b.personal - a.personal) || cmpIt(a.name, b.name));
  S.mentionsAll = await store.listMentions(myMemberIds());
  if (!wsById(S.wsId)) setWs(ls.get('sb-ws'));
  applyWs();
}
async function reloadTodos() {
  [S.allTodos, S.mentionsAll] = await Promise.all([store.openTodos(), store.listMentions(myMemberIds())]);
  applyWs();
  renderSidebar();
}
/* ---------- spazi di lavoro e persone ---------- */
const wsById = id => S.workspaces.find(w => w.id === id);
const curWs = () => wsById(S.wsId);
function setWs(id) {
  const w = wsById(id) || S.workspaces.find(x => x.personal) || S.workspaces[0];
  S.wsId = w?.id || null;
  ls.set('sb-ws', S.wsId || '');
}
const wsOfNote = n => n.workspace_id || entityOf(topicOf(n.topic_id)?.entity_id)?.workspace_id;
function applyWs() {
  S.todos = sortTodos(S.allTodos.filter(n => wsOfNote(n) === S.wsId));
  S.myMentions = S.mentionsAll.filter(n => n.todo && !n.done);
}
const wsLabel = w => w ? (w.personal ? 'Personale' : w.name) : '';
const profileOf = uid => S.profiles.find(p => p.id === uid);
const memberById = id => S.members.find(m => m.id === id);
const memberName = m => !m ? 'Persona rimossa'
  : (m.user_id && m.user_id === store.uid && store.mode === 'local') ? 'Io'
  : (m.user_id && profileOf(m.user_id)?.name) || m.name || m.email || 'Senza nome';
// prima tu, poi gli altri in ordine alfabetico
const membersOf = wsId => S.members.filter(m => m.workspace_id === wsId)
  .sort((a, b) => ((b.user_id === store.uid) - (a.user_id === store.uid)) || cmpIt(memberName(a), memberName(b)));
const myMemberIds = () => S.members.filter(m => m.user_id && m.user_id === store.uid).map(m => m.id);
const isOwner = wsId => S.members.some(m => m.workspace_id === wsId && m.user_id === store.uid && m.role === 'owner');
const accountsOf = wsId => S.members.filter(m => m.workspace_id === wsId && m.user_id);
// nome dell'autore di una nota (o argomento): profilo, poi nome dato nello spazio, poi email
const authorName = (uid, wsId) => {
  if (!uid) return '';
  if (uid === store.uid) return 'Tu';
  const m = S.members.find(x => x.user_id === uid && x.workspace_id === wsId) || S.members.find(x => x.user_id === uid);
  return (profileOf(uid)?.name) || m?.name || m?.email || profileOf(uid)?.email || 'Utente';
};
const initialsOf = s => String(s || '?').trim().split(/[\s@._-]+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';
const wsEntities = () => S.entities.filter(e => e.workspace_id === S.wsId);
const wsTopics = () => S.topics.filter(t => entityOf(t.entity_id)?.workspace_id === S.wsId);
const overdueCount = () => { const t = todayKey(); return S.todos.filter(n => n.due_date && n.due_date < t).length; };
const entityOf = id => S.entities.find(e => e.id === id);
const topicOf = id => S.topics.find(t => t.id === id);
const topicsOf = eid => S.topics.filter(t => t.entity_id === eid);
const todosOfTopic = tid => S.todos.filter(n => n.topic_id === tid).length;
const todosOfEntity = eid => { const ids = new Set(topicsOf(eid).map(t => t.id)); return S.todos.filter(n => ids.has(n.topic_id)).length; };
const byActivity = (a, b) => (b.last_activity || '').localeCompare(a.last_activity || '');

/* ---------- avvio ---------- */
async function boot() {
  const cfg = window.SB_CONFIG || {};
  try { document.execCommand('defaultParagraphSeparator', false, 'div'); } catch { /* ignora */ }
  try {
    if (cfg.url && cfg.anonKey) {
      await loadScript('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js');
      store = createSupabaseStore(cfg);
    } else {
      store = createLocalStore();
    }
    const { needsLogin } = await store.init();
    needsLogin ? showLogin() : await start();
  } catch (e) { toastErr(e); }
}

function showLogin() {
  $('#loginBrand').innerHTML = brand;
  $('#login').classList.remove('hidden');
  $('#app').classList.add('hidden');
  let signup = false;
  const setMode = on => {
    signup = on;
    $('#loginTitle').textContent = on ? 'Primo accesso' : 'Accedi';
    $('#loginSub').textContent = on
      ? 'Sei stato invitato? Usa l’email dell’invito e scegli una password (almeno 6 caratteri).'
      : 'Inserisci le credenziali per aprire il tuo archivio.';
    $('#loginSubmit').textContent = on ? 'Crea la password ed entra' : 'Accedi';
    $('#loginSwitch').textContent = on ? 'Hai già un account? Accedi' : 'Primo accesso? Crea la tua password';
    $('#loginPw').autocomplete = on ? 'new-password' : 'current-password';
    $('#loginErr').textContent = ''; $('#loginOk').textContent = '';
  };
  $('#loginSwitch').onclick = () => setMode(!signup);
  $('#loginForm').onsubmit = async ev => {
    ev.preventDefault();
    $('#loginErr').textContent = ''; $('#loginOk').textContent = '';
    const email = $('#loginEmail').value.trim(), pw = $('#loginPw').value;
    try {
      if (signup) {
        const { needsConfirm } = await store.signUp(email, pw);
        if (needsConfirm) {
          setMode(false);
          $('#loginOk').textContent = 'Ti abbiamo inviato un’email: clicca il link di conferma, poi accedi qui.';
          return;
        }
      } else {
        await store.login(email, pw);
      }
      $('#login').classList.add('hidden');
      await start();
    } catch (e) { $('#loginErr').textContent = (signup ? 'Registrazione non riuscita: ' : 'Accesso non riuscito: ') + (e.message || e); }
  };
}

async function start() {
  $('#app').classList.remove('hidden');
  await reloadAll();
  window.addEventListener('hashchange', render);
  // quando torni sulla pagina, aggiorna con le modifiche fatte dagli altri
  let lastLoad = Date.now();
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState !== 'visible' || Date.now() - lastLoad < 30000) return;
    lastLoad = Date.now();
    try { await reloadAll(); renderSidebar(); } catch { /* ignora */ }
  });
  render();
}

/* ---------- router ---------- */
function parseRoute() {
  const [path, qs] = (location.hash.slice(1) || '/').split('?');
  const params = new URLSearchParams(qs || '');
  const p = path.split('/').filter(Boolean);
  if (p[0] === 'e' && p[2] === 't') return { view: 'topic', eid: p[1], tid: p[3], params };
  if (p[0] === 'e') return { view: 'entity', eid: p[1], params };
  if (p[0] === 'todo') return { view: 'todo', params };
  if (p[0] === 'calendar') return { view: 'calendar', params };
  if (p[0] === 'search') return { view: 'search', params };
  if (p[0] === 'mentions') return { view: 'mentions', params };
  if (p[0] === 'people') return { view: 'people', params };
  return { view: 'home', params };
}

async function render() {
  const r = parseRoute();
  S.route = r;
  S.onNoteUpdated = null;
  $$('.mention-box').forEach(x => x.remove());
  // un link a un ente di un altro spazio apre quello spazio
  const ent = r.eid && entityOf(r.eid);
  if (ent && ent.workspace_id !== S.wsId) { setWs(ent.workspace_id); applyWs(); }
  renderSidebar();
  closeDrawer();
  try { await VIEWS[r.view](r); } catch (e) { toastErr(e); }
}

/* ---------- barra laterale ---------- */
function renderSidebar() {
  const r = S.route || {};
  const sb = $('#sidebar');
  const email = store.email || '';
  const myName = profileOf(store.uid)?.name || '';
  const initials = initialsOf(myName || email);
  const ws = curWs();
  const people = ws ? membersOf(ws.id).length : 0;
  sb.innerHTML = `
    <div class="sb-head"><a href="#/" class="brand">${brand}</a></div>
    <div class="ws-wrap menu-wrap">
      <button class="ws-btn" data-act="ws-menu" title="Cambia spazio di lavoro">
        <span class="ws-tile ${ws?.personal ? '' : tintOf(ws?.name || '')}">${icon(ws?.personal ? 'user' : 'users')}</span>
        <span class="ws-info"><strong class="ellipsis">${esc(wsLabel(ws))}</strong>
          <span class="ellipsis">${ws?.personal ? 'Spazio personale' : `Condiviso · ${plural(people, 'persona', 'persone')}`}</span></span>
        ${icon('swap', 'ws-swap')}
      </button>
      <div class="menu ws-menu" role="menu">
        <div class="menu-head">Spazi di lavoro</div>
        ${S.workspaces.map(w => `<button class="menu-item ${w.id === S.wsId ? 'on' : ''}" data-act="ws-switch" data-ws="${w.id}">
          <span class="tile sm ${w.personal ? 'blue' : tintOf(w.name)}">${icon(w.personal ? 'user' : 'users')}</span>
          <span><strong>${esc(wsLabel(w))}</strong><small>${w.personal ? 'Solo tuo' : plural(membersOf(w.id).length, 'persona', 'persone')}</small></span>
          ${w.id === S.wsId ? icon('check', 'menu-check') : ''}</button>`).join('')}
        <div class="menu-sep"></div>
        <button class="menu-item" data-act="ws-new"><span class="tile sm green">${icon('plus')}</span><span><strong>Nuovo spazio condiviso</strong><small>Per lavorare insieme ad altri</small></span></button>
      </div>
    </div>
    <nav class="sb-nav">
      <a href="#/" class="nav-item ${r.view === 'home' ? 'active' : ''}">${icon('dashboard')}<span>Dashboard</span></a>
      <a href="#/todo" class="nav-item ${r.view === 'todo' ? 'active' : ''}">${icon('todo')}<span>Da fare</span>${S.todos.length ? `<span class="badge ${overdueCount() ? 'red' : ''}" title="${overdueCount() ? overdueCount() + ' scadute' : ''}">${S.todos.length}</span>` : ''}</a>
      <a href="#/calendar" class="nav-item ${r.view === 'calendar' ? 'active' : ''}">${icon('calendar')}<span>Calendario</span></a>
      <a href="#/mentions" class="nav-item ${r.view === 'mentions' ? 'active' : ''}">${icon('at')}<span>Menzioni</span>${S.myMentions.length ? `<span class="badge" title="Attività aperte in cui sei taggato">${S.myMentions.length}</span>` : ''}</a>
      <a href="#/people" class="nav-item ${r.view === 'people' ? 'active' : ''}">${icon('users')}<span>Persone</span></a>
    </nav>
    <div class="sb-section"><span>Enti</span><button class="sb-add" id="sbNewEntity" title="Nuovo ente">${icon('plus')}</button></div>
    <form class="sb-new hidden" id="sbNewForm"><input placeholder="Nome ente e Invio" required></form>
    <div class="sb-entities">
      ${wsEntities().map(e => {
        const open = r.eid === e.id;
        const tps = topicsOf(e.id);
        return `<div class="sb-entity ${open ? 'open' : ''}">
          <a href="#/e/${e.id}" title="${esc(e.name)}" class="nav-item ${open && r.view === 'entity' ? 'active' : ''} ${open ? 'current' : ''}">
            ${icon('building')}<span class="ellipsis">${esc(e.name)}</span>${icon('chevron', 'chev')}</a>
          ${open ? `<div class="sb-topics">${tps.map(t => `<a href="#/e/${e.id}/t/${t.id}" class="sub-item ${r.tid === t.id ? 'active' : ''}"><span class="ellipsis">${esc(t.title)}</span>${todosOfTopic(t.id) ? '<span class="dot" title="Ci sono cose da fare"></span>' : ''}</a>`).join('') || '<span class="sub-empty">Nessun argomento</span>'}</div>` : ''}
        </div>`;
      }).join('') || '<p class="sb-empty">Nessun ente. Usa + per crearne uno.</p>'}
    </div>
    <div class="sb-foot">
      <button class="nav-item" data-act="export">${icon('download')}<span>Esporta backup</span></button>
      ${store.mode === 'cloud' ? `
        <div class="user-card">
          <a class="avatar" href="#/people" title="Il tuo nome e le persone">${esc(initials)}</a>
          <span class="user-info"><strong class="ellipsis">${esc(myName || 'Il mio archivio')}</strong><span class="ellipsis">${esc(email)}</span></span>
          <button class="sb-icon-btn" data-act="logout" title="Esci">${icon('logout')}</button>
        </div>` : `
        <div class="user-card local">
          <span class="avatar">${icon('database')}</span>
          <span class="user-info"><strong>Modalità locale</strong><span>Dati salvati solo in questo browser</span></span>
        </div>`}
    </div>`;

  $('#sbNewEntity').onclick = () => {
    const f = $('#sbNewForm');
    f.classList.toggle('hidden');
    if (!f.classList.contains('hidden')) f.querySelector('input').focus();
  };
  $('#sbNewForm').onsubmit = ev => {
    ev.preventDefault();
    createEntity(ev.target.querySelector('input').value);
  };
}

/* ---------- larghezza della barra laterale: si trascina il bordo destro ---------- */
(() => {
  const MIN = 200, MAX = 520, DEF = 264;
  const root = document.documentElement;
  const set = w => root.style.setProperty('--sb-w', `${Math.round(w)}px`);
  const saved = Number(ls.get('sb-width'));
  if (saved >= MIN && saved <= MAX) set(saved);
  const handle = $('#sbResizer');
  handle.addEventListener('pointerdown', ev => {
    ev.preventDefault();
    handle.setPointerCapture(ev.pointerId);
    document.body.classList.add('resizing');
    const move = e => set(Math.min(MAX, Math.max(MIN, e.clientX)));
    const up = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
      handle.removeEventListener('pointercancel', up);
      document.body.classList.remove('resizing');
      ls.set('sb-width', String(parseInt(root.style.getPropertyValue('--sb-w'), 10) || DEF));
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
    handle.addEventListener('pointercancel', up);
  });
  // doppio clic: torna alla larghezza iniziale
  handle.addEventListener('dblclick', () => { root.style.removeProperty('--sb-w'); ls.set('sb-width', ''); });
})();

const openDrawer = () => document.body.classList.add('drawer-open');
const closeDrawer = () => document.body.classList.remove('drawer-open');
$('#backdrop').onclick = closeDrawer;

// Intestazione: titolo + sottotitolo a sinistra, ricerca e azioni a destra.
function topbar(title, sub = '', actions = '') {
  const q = S.route?.view === 'search' ? S.route.params.get('q') || '' : '';
  return `<header class="topbar">
    <button class="icon-btn menu-btn" data-act="menu" title="Menu">${icon('menu')}</button>
    <div class="tb-title">
      <h1 class="ellipsis">${title}</h1>
      ${sub ? `<div class="tb-sub">${sub}</div>` : ''}
    </div>
    <form class="tb-search" data-search>
      ${icon('search')}<input type="search" placeholder="Cerca in enti, argomenti e note" value="${esc(q)}">
    </form>
    ${actions ? `<div class="actions">${actions}</div>` : ''}
  </header>`;
}

// clic su una persona taggata in una nota salvata: le sue menzioni
document.addEventListener('click', ev => {
  const m = ev.target.closest('.note-body .mention[data-mention]');
  if (m && !m.closest('[contenteditable="true"]')) location.hash = `#/mentions?p=${m.dataset.mention}`;
});

document.addEventListener('submit', ev => {
  if (!ev.target.matches('[data-search]')) return;
  ev.preventDefault();
  const v = ev.target.querySelector('input').value.trim();
  if (v) location.hash = `#/search?q=${encodeURIComponent(v)}`;
});

/* ---------- azioni comuni ---------- */
async function createEntity(name) {
  name = name.trim();
  if (!name) return;
  try {
    const e = await store.createEntity(name, S.wsId);
    S.entities.push(e); S.entities.sort(byName('name'));
    location.hash = `#/e/${e.id}`;
  } catch (e) { toastErr(e); }
}

async function createTopic(eid, title) {
  title = title.trim();
  if (!title) return;
  try {
    const t = await store.createTopic(eid, title);
    S.topics.push(t); S.topics.sort(byName('title'));
    location.hash = `#/e/${eid}/t/${t.id}`;
  } catch (e) { toastErr(e); }
}

// chiude il menu "Scarica" cliccando altrove
document.addEventListener('click', ev => {
  for (const w of $$('.menu-wrap.open')) if (!w.contains(ev.target)) w.classList.remove('open');
});

async function downloadDoc(scope, format) {
  const r = S.route, ent = entityOf(r.eid);
  if (!ent) return;
  const label = format === 'pdf' ? 'PDF' : 'Word';
  toast(`Preparo il documento ${label}…`);
  if (scope === 'entity') {
    await SBExport.entityIndex({
      format, entityName: ent.name,
      topics: topicsOf(ent.id).map(t => ({ title: t.title, created_at: t.created_at }))
    });
  } else {
    const tp = topicOf(r.tid);
    await SBExport.topic({
      format, entityName: ent.name, topicTitle: tp.title,
      notes: await store.listNotes(tp.id),
      resolveUrls: paths => store.resolveUrls(paths)
    });
  }
  toast(`Documento ${label} scaricato`);
}

document.addEventListener('click', async ev => {
  const el = ev.target.closest('[data-act]');
  if (!el) return;
  const r = S.route;
  const ent = r && entityOf(r.eid);
  const tp = r && topicOf(r.tid);
  try {
    switch (el.dataset.act) {
      case 'menu': openDrawer(); break;
      case 'rename-entity': {
        const name = await askText('Rinomina ente', ent.name);
        if (!name || name === ent.name) return;
        Object.assign(ent, await store.updateEntity(ent.id, { name }));
        S.entities.sort(byName('name'));
        render(); break;
      }
      case 'delete-entity': {
        if (!await askConfirm(`Eliminare "${ent.name}"?`, 'Verranno eliminati anche tutti i suoi argomenti, le note e gli allegati. L’operazione non si può annullare.')) return;
        await store.deleteEntity(ent.id);
        await reloadAll();
        location.hash = '#/'; break;
      }
      case 'rename-topic': {
        const title = await askText('Rinomina argomento', tp.title);
        if (!title || title === tp.title) return;
        Object.assign(tp, await store.updateTopic(tp.id, { title }));
        S.topics.sort(byName('title'));
        render(); break;
      }
      case 'delete-topic': {
        if (!await askConfirm(`Eliminare l’argomento "${tp.title}"?`, 'Verranno eliminate anche tutte le sue note e gli allegati. L’operazione non si può annullare.')) return;
        await store.deleteTopic(tp.id);
        await reloadAll();
        location.hash = `#/e/${ent.id}`; break;
      }
      case 'export': {
        const data = await store.exportAll();
        const blob = new Blob([JSON.stringify({ exported_at: new Date().toISOString(), ...data }, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `secondbrain-backup-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        toast('Backup scaricato: contiene i testi delle note, gli allegati restano nell’archivio'); break;
      }
      case 'logout': await store.logout(); location.reload(); break;
      case 'ws-menu':
      case 'download-menu': el.closest('.menu-wrap').classList.toggle('open'); break;
      case 'ws-switch': {
        el.closest('.menu-wrap')?.classList.remove('open');
        if (el.dataset.ws === S.wsId) return;
        setWs(el.dataset.ws); applyWs();
        if (location.hash === '#/' || location.hash === '') render(); else location.hash = '#/';
        break;
      }
      case 'ws-new': {
        el.closest('.menu-wrap')?.classList.remove('open');
        const name = await askText('Nuovo spazio condiviso', '', 'Crea', 'es. Ufficio riscossione');
        if (!name) return;
        const w = await store.createWorkspace(name);
        await reloadAll();
        setWs(w.id); applyWs();
        toast('Spazio creato: ora aggiungi le persone');
        if (location.hash === '#/people') render(); else location.hash = '#/people';
        break;
      }
      case 'move-entity': {
        const others = S.workspaces.filter(w => w.id !== ent.workspace_id);
        if (!others.length) return toast('Crea prima uno spazio condiviso dal menu in alto a sinistra');
        const to = await askChoice(`Spostare "${ent.name}" in un altro spazio?`,
          'Si spostano anche tutti i suoi argomenti e le note. Lo vedranno le persone dello spazio scelto.',
          others.map(w => ({ value: w.id, label: wsLabel(w), sub: w.personal ? 'Solo tuo' : plural(membersOf(w.id).length, 'persona', 'persone') })), 'Sposta');
        if (!to) return;
        await store.updateEntity(ent.id, { workspace_id: to });
        await reloadAll();
        toast(`Spostato in ${wsLabel(wsById(to))}`);
        render(); break;
      }
      case 'download-doc': {
        el.closest('.menu-wrap').classList.remove('open');
        await downloadDoc(el.dataset.scope, el.dataset.format);
        break;
      }
    }
  } catch (e) { toastErr(e); }
});

/* ---------- scadenze: etichetta cliccabile che apre il calendario del browser ---------- */
function dueControl(n) {
  const st = dueState(n);
  return `<span class="due ${st.cls}" data-due-id="${n.id}">
    <button type="button" class="due-btn" title="${n.due_date ? 'Cambia o togli la scadenza' : 'Aggiungi una scadenza'}">${icon('calendar')}<span>${st.label}</span></button>
    <input type="date" class="due-input" value="${n.due_date || ''}" tabindex="-1" aria-label="Scadenza">
  </span>`;
}

document.addEventListener('click', ev => {
  const b = ev.target.closest('.due-btn');
  if (!b) return;
  ev.preventDefault();
  const inp = b.parentElement.querySelector('.due-input');
  try { inp.showPicker(); } catch { inp.focus(); inp.click(); }
});

document.addEventListener('change', async ev => {
  if (!ev.target.matches('.due-input')) return;
  const id = ev.target.closest('[data-due-id]').dataset.dueId;
  try {
    const upd = await store.updateNote(id, { due_date: ev.target.value || null });
    await reloadTodos();
    if (S.onNoteUpdated) S.onNoteUpdated(upd);
    else render();
    toast(upd.due_date ? `Scadenza: ${fmtLongDay(upd.due_date)}` : 'Scadenza rimossa');
  } catch (e) { toastErr(e); }
});

// Riga di una cosa da fare (Dashboard, Da fare, Calendario).
function todoRow(n, { compact = false } = {}) {
  const t = topicOf(n.topic_id), e = t && entityOf(t.entity_id);
  if (!t || !e) return '';
  return `<div class="todo-row ${n.done ? 'is-done' : ''} ${compact ? 'compact' : ''}" data-id="${n.id}">
    <input type="checkbox" class="todo-check" ${n.done ? 'checked' : ''} title="${n.done ? 'Riapri' : 'Segna come fatto'}">
    <div class="todo-main">
      <a href="#/e/${e.id}/t/${t.id}?n=${n.id}" class="todo-text">${esc(snippet(n.text, '', compact ? 90 : 220)) || '<em class="muted">(solo allegati)</em>'}</a>
      <span class="todo-path"><span class="tdot ${tintOf(e.name)}"></span><span class="ellipsis">${e.workspace_id !== S.wsId ? `${esc(wsLabel(wsById(e.workspace_id)))} · ` : ''}${esc(e.name)} / ${esc(t.title)}</span>${peopleTags(n)}</span>
    </div>
    ${dueControl(n)}
  </div>`;
}

document.addEventListener('change', async ev => {
  if (!ev.target.matches('.todo-row .todo-check')) return;
  const row = ev.target.closest('.todo-row');
  const done = ev.target.checked;
  try {
    row.classList.toggle('is-done', done);
    await store.updateNote(row.dataset.id, { done });
    await reloadTodos();
    toast(done ? 'Fatto' : 'Riaperta');
    setTimeout(render, done ? 350 : 0);
  } catch (e) { ev.target.checked = !done; row.classList.toggle('is-done', !done); toastErr(e); }
});

// persone taggate in una nota, come piccole etichette
function peopleTags(n) {
  const ids = (n.mentions || []).filter(memberById);
  if (!ids.length) return '';
  return `<span class="ptags">${ids.slice(0, 3).map(id => `<span class="ptag" title="Taggato: ${esc(memberName(memberById(id)))}">@${esc(memberName(memberById(id)))}</span>`).join('')}${ids.length > 3 ? `<span class="ptag">+${ids.length - 3}</span>` : ''}</span>`;
}

/* ---------- viste ---------- */
const actionBtns = kind => `
  <div class="menu-wrap">
    <button class="btn" data-act="download-menu" title="Scarica in Word o PDF">${icon('download')}<span class="btn-label">Scarica</span></button>
    <div class="menu" role="menu">
      <div class="menu-head">${kind === 'entity' ? 'Elenco argomenti (titolo e data)' : 'Tutte le note di questo argomento'}</div>
      <button class="menu-item" data-act="download-doc" data-scope="${kind}" data-format="docx">
        <span class="tile sm blue">${icon('file')}</span><span><strong>Word</strong><small>File .docx modificabile</small></span></button>
      <button class="menu-item" data-act="download-doc" data-scope="${kind}" data-format="pdf">
        <span class="tile sm rose">${icon('file')}</span><span><strong>PDF</strong><small>Pronto da stampare o inviare</small></span></button>
    </div>
  </div>
  ${kind === 'entity' && S.workspaces.length > 1 ? `<button class="icon-btn" data-act="move-entity" title="Sposta in un altro spazio">${icon('move')}</button>` : ''}
  <button class="icon-btn" data-act="rename-${kind}" title="Rinomina">${icon('edit')}</button>
  <button class="icon-btn danger" data-act="delete-${kind}" title="Elimina">${icon('trash')}</button>`;

const stat = (ic, tint, value, label, href) => `
  <a class="stat" href="${href}">
    <span class="tile ${tint}">${icon(ic)}</span>
    <div><div class="stat-value">${value}</div><div class="stat-label">${label}</div></div>
    <span class="stat-go">${icon('chevron')}</span>
  </a>`;

const VIEWS = {
  async home() {
    const lastAct = eid => topicsOf(eid).reduce((m, t) => (t.last_activity > m ? t.last_activity : m), '');
    const recent = wsTopics().sort(byActivity).slice(0, 6);
    const upcoming = S.todos.filter(n => n.due_date).slice(0, 6);
    main.innerHTML = `${topbar('Dashboard', `${esc(wsLabel(curWs()))} · ${today()}`)}
      <div class="page">
        <div class="stats">
          ${stat('todo', 'amber', S.todos.length, 'Attività da fare', '#/todo')}
          ${stat('alert', 'rose', overdueCount(), 'Attività scadute', '#/todo?f=over')}
          ${stat('at', 'violet', S.myMentions.length, 'Attività in cui sei taggato', '#/mentions')}
          ${stat('users', 'teal', membersOf(S.wsId).length, curWs()?.personal ? 'Persone da taggare' : 'Persone nello spazio', '#/people')}
        </div>
        <div class="dash-grid">
          <section class="panel">
            <div class="panel-head"><h2>Enti</h2></div>
            <form class="inline-form" id="newEntity">
              <input placeholder="Nuovo ente, es. Comune di Sassari" required>
              <button class="btn primary">${icon('plus')}Crea ente</button>
            </form>
            <div class="cards">
              ${wsEntities().map(e => {
                const n = topicsOf(e.id).length, todo = todosOfEntity(e.id), la = lastAct(e.id);
                return `<a class="card" href="#/e/${e.id}">
                  <div class="card-top"><span class="tile ${tintOf(e.name)}">${icon('building')}</span>
                    ${todo ? `<span class="pill amber">${todo} da fare</span>` : ''}</div>
                  <div class="card-title">${esc(e.name)}</div>
                  <div class="card-meta">${plural(n, 'argomento', 'argomenti')}${la ? ` · ${fmtDate(la)}` : ''}</div>
                </a>`;
              }).join('') || empty('building', 'Nessun ente', 'Crea il primo ente con il campo qui sopra.')}
            </div>
          </section>
          <div class="side-col">
          <section class="panel">
            <div class="panel-head"><h2>Prossime scadenze</h2><a class="link" href="#/calendar">Calendario</a></div>
            ${upcoming.length ? `<div class="rows">${upcoming.map(n => todoRow(n, { compact: true })).join('')}</div>`
              : empty('calendar', 'Nessuna scadenza', 'Quando segni una nota come da fare puoi darle una data.')}
          </section>
          <section class="panel">
            <div class="panel-head"><h2>Attività recente</h2></div>
            ${recent.length ? `<div class="rows">${recent.map(t => {
              const e = entityOf(t.entity_id);
              return `<a class="row" href="#/e/${t.entity_id}/t/${t.id}">
                <span class="tile sm ${tintOf(e?.name || '')}">${icon('folder')}</span>
                <span class="row-main"><strong class="ellipsis">${esc(t.title)}</strong><span class="ellipsis muted">${esc(e?.name)}</span></span>
                <span class="row-side">${t.last_activity ? fmtDate(t.last_activity).split(' - ')[0] : ''}</span></a>`;
            }).join('')}</div>` : empty('activity', 'Ancora nessuna attività', 'Gli argomenti aggiornati compariranno qui.')}
          </section>
          </div>
        </div>
      </div>`;
    $('#newEntity').onsubmit = ev => { ev.preventDefault(); createEntity(ev.target.querySelector('input').value); };
  },

  async entity(r) {
    const ent = entityOf(r.eid);
    if (!ent) return notFound();
    const tps = topicsOf(ent.id); // già in ordine alfabetico
    main.innerHTML = `${topbar(esc(ent.name),
      `<a href="#/">Dashboard</a>${icon('chevron')}<span>${plural(tps.length, 'argomento', 'argomenti')}</span>`, actionBtns('entity'))}
      <div class="page">
        <section class="panel">
          <div class="panel-head"><h2>Argomenti</h2></div>
          <form class="inline-form" id="newTopic">
            <input placeholder="Nuovo argomento, es. Lista di carico" required>
            <button class="btn primary">${icon('plus')}Crea argomento</button>
          </form>
          <div class="cards">
            ${tps.map(t => {
              const todo = todosOfTopic(t.id);
              return `<a class="card" href="#/e/${ent.id}/t/${t.id}">
                <div class="card-top"><span class="tile ${tintOf(t.title)}">${icon('folder')}</span>
                  ${todo ? `<span class="pill amber">${todo} da fare</span>` : ''}</div>
                <div class="card-title">${esc(t.title)}</div>
                <div class="card-meta">${t.last_activity ? `${icon('clock')}${fmtDate(t.last_activity)}` : ''}</div>
              </a>`;
            }).join('') || empty('folder', 'Nessun argomento', 'Crea il primo argomento con il campo qui sopra.')}
          </div>
        </section>
      </div>`;
    const inp = $('#newTopic input');
    $('#newTopic').onsubmit = ev => { ev.preventDefault(); createTopic(ent.id, inp.value); };
    if (!tps.length) inp.focus();
  },

  async topic(r) {
    const ent = entityOf(r.eid), tp = topicOf(r.tid);
    if (!ent || !tp) return notFound();
    main.innerHTML = `<div class="topic-view">
      ${topbar(esc(tp.title), `<a href="#/">Dashboard</a>${icon('chevron')}<a href="#/e/${ent.id}">${esc(ent.name)}</a>`, actionBtns('topic'))}
      <div class="feed" id="feed"><div class="feed-inner" id="feedInner"><p class="muted center">Caricamento…</p></div></div>
      <div class="composer"><div class="composer-card">
        <div class="editor" id="editor" contenteditable="true"
          data-placeholder="Scrivi una nota. Invio salva, Shift+Invio va a capo (negli elenchi salva con Ctrl+Invio). Scrivi @ per taggare una persona. Puoi incollare immagini e file."></div>
        <div class="composer-bar">
          <button class="tool-btn" id="attachBtn" type="button" title="Allega file">${icon('clip')}<span>Allega</span></button>
          <input type="file" id="fileInput" multiple hidden>
          <button class="tool-btn" id="mentionBtn" type="button" title="Tagga una persona (oppure scrivi @)">${icon('at')}<span>Tagga</span></button>
          <label class="tool-btn toggle" title="Segna la nota come cosa da fare"><input type="checkbox" id="todoToggle">${icon('todo')}<span>Da fare</span></label>
          <span class="due-pick hidden" id="duePick">
            <span class="date-field">${icon('calendar')}<input type="date" id="dueInput" title="Scadenza (facoltativa)"></span>
            <button type="button" class="chip" data-quick="0">Oggi</button>
            <button type="button" class="chip" data-quick="1">Domani</button>
          </span>
          <span class="spacer"></span>
          <button class="btn primary" id="sendBtn" type="button">${icon('send')}Salva</button>
        </div>
      </div></div>
    </div>`;

    const feed = $('#feed'), feedInner = $('#feedInner'), editor = $('#editor');
    const notesById = new Map();
    const draftKey = `sb-draft:${tp.id}`;
    const highlightId = r.params.get('n');

    // resta ancorato in fondo (come una chat) finché non scorri in su
    let stick = !highlightId;
    feed.addEventListener('scroll', () => { stick = feed.scrollHeight - feed.scrollTop - feed.clientHeight < 60; });
    new ResizeObserver(() => { if (stick) feed.scrollTop = feed.scrollHeight; }).observe(feedInner);

    const people = () => membersOf(ent.workspace_id);
    const ed = setupEditor(editor, {
      onSubmit: submit,
      people,
      onChange: () => {
        const { html, empty } = serializeEditor(editor);
        ls.set(draftKey, empty ? '' : html);
      }
    });

    editor.before(ed.toolbar);

    const draft = ls.get(draftKey);
    if (draft) { editor.innerHTML = DOMPurify.sanitize(draft, PURIFY_VIEW); hydrate(editor); }

    $('#attachBtn').onclick = () => $('#fileInput').click();
    $('#fileInput').onchange = ev => { ed.insertFiles([...ev.target.files]); ev.target.value = ''; editor.focus(); };
    $('#sendBtn').onclick = submit;
    $('#mentionBtn').onclick = () => ed.startMention();
    const setTodoMode = on => {
      $('#todoToggle').checked = on;
      $('#todoToggle').closest('.toggle').classList.toggle('on', on);
      $('#duePick').classList.toggle('hidden', !on);
      if (!on) $('#dueInput').value = '';
    };
    $('#todoToggle').onchange = ev => setTodoMode(ev.target.checked);
    $('#duePick').addEventListener('click', ev => {
      const q = ev.target.closest('[data-quick]');
      if (!q) return;
      $('#dueInput').value = addDays(todayKey(), +q.dataset.quick);
      editor.focus(); placeCaretEnd(editor);
    });

    const notes = await store.listNotes(tp.id);
    if (S.route !== r) return;
    // aggiornamento della scadenza da un'etichetta dentro questa pagina
    S.onNoteUpdated = upd => {
      const art = feedInner.querySelector(`[data-id="${CSS.escape(upd.id)}"]`);
      if (art) { notesById.set(upd.id, upd); replaceNote(art, upd); }
    };
    feedInner.innerHTML = '';
    const emptyMsg = () => h(`<div class="empty-msg">${empty('notes', 'Nessuna nota', 'Scrivi qui sotto la prima nota di questo argomento.')}</div>`);
    if (!notes.length) feedInner.append(emptyMsg());
    for (const n of notes) { notesById.set(n.id, n); feedInner.append(noteEl(n)); }
    await hydrate(feedInner);

    if (highlightId) {
      const art = feedInner.querySelector(`[data-id="${CSS.escape(highlightId)}"]`);
      if (art) { art.scrollIntoView({ block: 'center' }); art.classList.add('flash'); }
    } else {
      feed.scrollTop = feed.scrollHeight;
    }
    editor.focus();
    placeCaretEnd(editor);

    async function submit() {
      if (ed.busy) return toast('Attendi la fine del caricamento');
      const { html, text, mentions, empty: isEmpty } = serializeEditor(editor);
      if (isEmpty) return;
      const todo = $('#todoToggle').checked;
      const due_date = todo ? $('#dueInput').value || null : null;
      $('#sendBtn').disabled = true;
      try {
        const n = await store.createNote({ topic_id: tp.id, html, text, todo, due_date, mentions });
        const used = pathsIn(html);
        const unused = [...ed.uploaded].filter(p => !used.includes(p));
        ed.uploaded.clear();
        if (unused.length) store.deleteFiles(unused).catch(() => {});
        editor.innerHTML = '';
        ls.set(draftKey, '');
        setTodoMode(false);
        tp.last_activity = n.created_at;
        notesById.set(n.id, n);
        feedInner.querySelector('.empty-msg')?.remove();
        const el = noteEl(n);
        feedInner.append(el);
        stick = true;
        await hydrate(el);
        feed.scrollTop = feed.scrollHeight;
        if (todo || mentions.length) await reloadTodos();
      } catch (e) { toastErr(e); }
      finally { $('#sendBtn').disabled = false; editor.focus(); }
    }

    feedInner.addEventListener('click', async ev => {
      const art = ev.target.closest('.note');
      if (!art) return;
      const n = notesById.get(art.dataset.id);
      const editing = art.classList.contains('editing');
      try {
        if (ev.target.classList.contains('todo-check')) {
          const upd = await store.updateNote(n.id, { done: ev.target.checked });
          notesById.set(n.id, upd); replaceNote(art, upd);
          await reloadTodos();
          return;
        }
        const btn = ev.target.closest('[data-na]');
        if (btn) {
          if (btn.dataset.na === 'todo') {
            const upd = await store.updateNote(n.id, { todo: !n.todo, done: false });
            notesById.set(n.id, upd); replaceNote(art, upd);
            await reloadTodos();
          } else if (btn.dataset.na === 'edit') {
            startEdit(art, n);
          } else if (btn.dataset.na === 'del') {
            if (!await askConfirm('Eliminare questa nota?', 'Verranno eliminati anche i suoi allegati. L’operazione non si può annullare.')) return;
            await store.deleteNote(n.id);
            notesById.delete(n.id); art.remove();
            if (!feedInner.querySelector('.note')) feedInner.append(emptyMsg());
            if (n.todo) await reloadTodos();
          }
          return;
        }
        // spunta di una casella dentro una nota salvata
        const li = ev.target.closest('ul.checklist > li');
        if (li && !editing && ev.clientX - li.getBoundingClientRect().left <= 24) {
          li.dataset.checked = li.dataset.checked === 'true' ? 'false' : 'true';
          const body = art.querySelector('.note-body');
          const { html, text } = serializeEditor(body);
          const upd = await store.updateNote(n.id, { html, text });
          notesById.set(n.id, upd);
          return;
        }
        if (ev.target.tagName === 'IMG' && !editing) openLightbox(ev.target.src);
      } catch (e) { toastErr(e); }
    });

    function replaceNote(art, n) {
      const el = noteEl(n);
      art.replaceWith(el);
      hydrate(el);
      return el;
    }

    function startEdit(art, n) {
      art.classList.add('editing');
      const body = art.querySelector('.note-body');
      body.contentEditable = 'true';
      const bar = h(`<div class="edit-bar">
        <span class="hint">Invio salva, Esc annulla</span><span class="spacer"></span>
        <button class="btn" data-e="cancel" type="button">Annulla</button>
        <button class="btn primary" data-e="save" type="button">${icon('check')}Salva</button></div>`);
      art.append(bar);
      const edx = setupEditor(body, { onSubmit: save, onEscape: cancel, people });
      body.before(edx.toolbar);
      bar.querySelector('.hint').textContent = 'Invio salva (negli elenchi Ctrl+Invio), Esc annulla';
      body.focus(); placeCaretEnd(body);
      bar.addEventListener('click', ev => {
        const b = ev.target.closest('[data-e]');
        if (b) b.dataset.e === 'save' ? save() : cancel();
      });
      async function save() {
        if (edx.busy) return toast('Attendi la fine del caricamento');
        const { html, text, mentions, empty: isEmpty } = serializeEditor(body);
        if (isEmpty) return toast('La nota è vuota: per toglierla usa Elimina');
        try {
          const upd = await store.updateNote(n.id, { html, text, mentions, updated_at: new Date().toISOString() });
          const keep = pathsIn(html);
          const removed = [...pathsIn(n.html), ...edx.uploaded].filter(p => !keep.includes(p));
          if (removed.length) store.deleteFiles(removed).catch(() => {});
          notesById.set(n.id, upd);
          replaceNote(art, upd);
          if (String(n.mentions) !== String(mentions)) await reloadTodos();
        } catch (e) { toastErr(e); }
      }
      function cancel() {
        const old = pathsIn(n.html);
        const unused = [...edx.uploaded].filter(p => !old.includes(p));
        if (unused.length) store.deleteFiles(unused).catch(() => {});
        replaceNote(art, n);
      }
    }
  },

  async todo(r) {
    const onlyOver = r.params.get('f') === 'over';
    main.innerHTML = `${topbar(onlyOver ? 'Attività scadute' : 'Attività da fare',
      onlyOver ? 'Attività aperte con la scadenza già passata' : 'Tutte le attività aperte, in ordine di scadenza')}
      <div class="page"><div id="todoTabs"></div><div id="todoList"><p class="muted">Caricamento…</p></div></div>`;
    await reloadTodos();
    const over = overdueCount();
    $('#todoTabs').innerHTML = `<div class="seg">
      <a href="#/todo" class="${onlyOver ? '' : 'on'}">Tutte <span class="seg-n">${S.todos.length}</span></a>
      <a href="#/todo?f=over" class="${onlyOver ? 'on' : ''}">Scadute <span class="seg-n ${over ? 'red' : ''}">${over}</span></a>
    </div>`;
    const box = $('#todoList');
    if (!S.todos.length || (onlyOver && !over)) {
      box.innerHTML = `<section class="panel">${onlyOver
        ? empty('check', 'Nessuna attività scaduta', 'Sei in pari con tutte le scadenze.')
        : empty('check', 'Nessuna attività aperta', 'Per aggiungerne una, spunta “Da fare” quando scrivi una nota.')}</section>`;
      return;
    }
    const t = todayKey(), tomorrow = addDays(t, 1), week = addDays(t, 7);
    const buckets = [
      { key: 'over', title: 'Scadute', tint: 'rose', test: n => n.due_date && n.due_date < t },
      { key: 'today', title: 'Oggi', tint: 'amber', test: n => n.due_date === t },
      { key: 'tomorrow', title: 'Domani', tint: 'blue', test: n => n.due_date === tomorrow },
      { key: 'week', title: 'Prossimi 7 giorni', tint: 'violet', test: n => n.due_date > tomorrow && n.due_date <= week },
      { key: 'later', title: 'Più avanti', tint: 'teal', test: n => n.due_date > week },
      { key: 'none', title: 'Senza scadenza', tint: '', test: n => !n.due_date }
    ];
    box.innerHTML = buckets.filter(b => !onlyOver || b.key === 'over').map(b => {
      const items = S.todos.filter(b.test);
      if (!items.length) return '';
      return `<section class="panel bucket ${b.key}">
        <div class="panel-head"><h2><span class="bdot ${b.tint}"></span>${b.title}</h2><span class="pill ${b.key === 'over' ? 'red' : ''}">${items.length}</span></div>
        <div class="rows">${items.map(n => todoRow(n)).join('')}</div>
      </section>`;
    }).join('');
  },

  async calendar(r) {
    const tk = todayKey();
    const month = /^\d{4}-\d{2}$/.test(r.params.get('m') || '') ? r.params.get('m') : tk.slice(0, 7);
    let selected = r.params.get('d') || (tk.startsWith(month) ? tk : `${month}-01`);
    const first = parseYmd(`${month}-01`);
    const start = addDays(`${month}-01`, -((first.getDay() + 6) % 7)); // lunedì della prima settimana
    const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
    const weeks = Math.ceil(((first.getDay() + 6) % 7 + daysInMonth) / 7);
    const end = addDays(start, weeks * 7 - 1);
    const prev = ymd(new Date(first.getFullYear(), first.getMonth() - 1, 1)).slice(0, 7);
    const next = ymd(new Date(first.getFullYear(), first.getMonth() + 1, 1)).slice(0, 7);
    const monthLabel = cap1(first.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' }));

    main.innerHTML = `${topbar('Calendario', 'Le cose da fare giorno per giorno',
      `<a class="icon-btn" href="#/calendar?m=${prev}" title="Mese precedente">${icon('chevronLeft')}</a>
       <a class="btn" href="#/calendar">Oggi</a>
       <a class="icon-btn" href="#/calendar?m=${next}" title="Mese successivo">${icon('chevron')}</a>`)}
      <div class="page"><div class="cal-layout">
        <section class="panel cal-panel">
          <div class="panel-head"><h2>${monthLabel}</h2><span class="muted small" id="calInfo"></span></div>
          <div class="cal-grid" id="calGrid"><p class="muted">Caricamento…</p></div>
        </section>
        <section class="panel day-panel" id="dayPanel"></section>
      </div></div>`;

    const items = sortTodos((await store.listDue(start, end)).filter(n => wsOfNote(n) === S.wsId));
    if (S.route !== r) return;
    const byDay = new Map();
    for (const n of items) {
      if (!byDay.has(n.due_date)) byDay.set(n.due_date, []);
      byDay.get(n.due_date).push(n);
    }
    const open = items.filter(n => !n.done && n.due_date.startsWith(month)).length;
    $('#calInfo').textContent = open ? `${open} da fare nel mese` : '';

    const cells = [];
    for (let i = 0; i < weeks * 7; i++) {
      const d = addDays(start, i);
      const list = byDay.get(d) || [];
      const openList = list.filter(n => !n.done);
      const cls = [
        'cal-day',
        d.startsWith(month) ? '' : 'other',
        d === tk ? 'today' : '',
        d === selected ? 'selected' : '',
        openList.length && d < tk ? 'has-over' : ''
      ].join(' ');
      cells.push(`<button type="button" class="${cls}" data-day="${d}">
        <span class="cal-num">${parseYmd(d).getDate()}</span>
        <span class="cal-items">${list.slice(0, 3).map(n => {
          const e = entityOf(topicOf(n.topic_id)?.entity_id);
          return `<span class="cal-item ${n.done ? 'done' : ''} ${!n.done && d < tk ? 'over' : ''}"><span class="tdot ${tintOf(e?.name || '')}"></span><span class="ellipsis">${esc(n.text || '(allegati)')}</span></span>`;
        }).join('')}${list.length > 3 ? `<span class="cal-more">+${list.length - 3} altre</span>` : ''}</span>
        ${list.length ? `<span class="cal-dots">${openList.length ? `<i class="${d < tk ? 'over' : ''}"></i>` : ''}${list.length - openList.length ? '<i class="done"></i>' : ''}</span>` : ''}
      </button>`);
    }
    $('#calGrid').innerHTML = WEEKDAYS.map(w => `<span class="cal-wd">${w}</span>`).join('') + cells.join('');

    const showDay = d => {
      selected = d;
      $$('.cal-day', main).forEach(c => c.classList.toggle('selected', c.dataset.day === d));
      const list = byDay.get(d) || [];
      const noDue = S.todos.filter(n => !n.due_date).length;
      $('#dayPanel').innerHTML = `
        <div class="panel-head"><h2>${fmtLongDay(d)}${d === tk ? ' <span class="pill amber">Oggi</span>' : ''}</h2></div>
        ${list.length ? `<div class="rows">${list.map(n => todoRow(n)).join('')}</div>`
          : empty('calendar', 'Niente in scadenza', 'Per mettere una scadenza, apri una cosa da fare e clicca sulla sua data.')}
        ${noDue ? `<a class="nodue-link" href="#/todo">${icon('todo')}${plural(noDue, 'attività', 'attività')} senza scadenza${icon('chevron')}</a>` : ''}`;
      history.replaceState(null, '', `#/calendar?m=${month}&d=${d}`);
      S.route = parseRoute();
      r = S.route;
    };
    $('#calGrid').addEventListener('click', ev => {
      const c = ev.target.closest('[data-day]');
      if (!c) return;
      if (!c.dataset.day.startsWith(month)) { location.hash = `#/calendar?m=${c.dataset.day.slice(0, 7)}&d=${c.dataset.day}`; return; }
      showDay(c.dataset.day);
    });
    showDay(selected);
  },

  async people() {
    const ws = curWs();
    if (!ws) return notFound();
    const owner = isOwner(ws.id), cloud = store.mode === 'cloud';
    const canInvite = owner && cloud && !ws.personal;
    const list = membersOf(ws.id);
    const status = m => m.user_id
      ? `${m.user_id === store.uid ? 'Tu · ' : ''}${m.role === 'owner' ? 'Proprietario' : 'Utente'}${cloud && profileOf(m.user_id)?.email ? ` · ${profileOf(m.user_id).email}` : m.email ? ` · ${m.email}` : ''}`
      : m.email ? `Invito in attesa · ${m.email}` : 'Senza account · solo per i tag';
    const myName = profileOf(store.uid)?.name || '';
    main.innerHTML = `${topbar('Persone', `${esc(wsLabel(ws))} · ${plural(list.length, 'persona', 'persone')}`)}
      <div class="page">
        ${cloud ? `<section class="panel">
          <div class="panel-head"><h2>Il tuo nome</h2></div>
          <p class="muted small help">È il nome che vedono gli altri accanto alle tue note e quando ti taggano.</p>
          <form class="inline-form" id="myName">
            <input placeholder="Nome e cognome" value="${esc(myName)}" maxlength="80">
            <button class="btn primary">${icon('check')}Salva</button>
          </form>
        </section>` : ''}
        <section class="panel">
          <div class="panel-head"><h2>Persone in ${esc(wsLabel(ws))}</h2>${ws.personal ? '' : `<span class="pill">${plural(accountsOf(ws.id).length, 'account', 'account')}</span>`}</div>
          ${ws.personal ? `<p class="muted small help">Questo è il tuo spazio personale: nessun altro utente lo vede.
            Qui puoi aggiungere persone <strong>senza account</strong>, solo per taggarle nelle note (utile se più persone usano la stessa utenza).
            Per lavorare con altri utenti, ognuno con il suo accesso, crea uno spazio condiviso.</p>`
            : `<p class="muted small help">Tutti gli utenti di questo spazio vedono e modificano gli stessi enti, argomenti e note.
            Puoi invitare una persona con la sua email (avrà il suo accesso) oppure aggiungerla solo con il nome, per taggarla.</p>`}
          ${owner ? `<form class="person-form" id="addPerson">
            <input name="name" placeholder="Nome, es. Giorgio Rossi" maxlength="80">
            ${canInvite ? '<input name="email" type="email" placeholder="Email (facoltativa: per dargli un accesso)">' : ''}
            <button class="btn primary">${icon('userPlus')}Aggiungi</button>
          </form>` : ''}
          <div class="rows">${list.map(m => `<div class="row person" data-mid="${m.id}">
            <span class="avatar-lg ${tintOf(m.id)}">${esc(initialsOf(memberName(m)))}</span>
            <span class="row-main"><strong class="ellipsis">${esc(memberName(m))}</strong><span class="ellipsis muted">${esc(status(m))}</span></span>
            <a class="btn sm" href="#/mentions?p=${m.id}" title="Note in cui è taggato">${icon('at')}<span class="btn-label">Menzioni</span></a>
            ${owner && !m.user_id ? `<button class="icon-btn sm" data-pa="rename" title="Rinomina">${icon('edit')}</button>` : ''}
            ${owner && m.user_id !== store.uid ? `<button class="icon-btn sm danger" data-pa="remove" title="Togli dallo spazio">${icon('trash')}</button>` : ''}
            ${!owner && m.user_id === store.uid ? `<button class="btn sm" data-pa="leave">${icon('logout')}Esci dallo spazio</button>` : ''}
          </div>`).join('')}</div>
        </section>
        ${owner && !ws.personal ? `<section class="panel">
          <div class="panel-head"><h2>Spazio</h2></div>
          <div class="ws-actions">
            <button class="btn" id="wsRename">${icon('edit')}Rinomina spazio</button>
            <button class="btn danger-line" id="wsDelete">${icon('trash')}Elimina spazio</button>
          </div>
        </section>` : ''}
        ${ws.personal ? `<section class="panel">
          <div class="panel-head"><h2>Lavorare con altri</h2></div>
          <p class="muted small help">${cloud
            ? 'Crea uno spazio condiviso e invita i colleghi con la loro email. Puoi anche spostarci un ente che hai già, con il pulsante “Sposta” nella pagina dell’ente.'
            : 'In modalità locale i dati restano in questo browser: puoi creare altri spazi e aggiungere persone da taggare, ma non dare accesso ad altri utenti.'}</p>
          <button class="btn primary" data-act="ws-new">${icon('plus')}Nuovo spazio condiviso</button>
        </section>` : ''}
      </div>`;

    $('#myName')?.addEventListener('submit', async ev => {
      ev.preventDefault();
      try {
        const name = ev.target.querySelector('input').value.trim();
        const upd = await store.updateProfile({ name });
        const i = S.profiles.findIndex(p => p.id === store.uid);
        if (i >= 0) S.profiles[i] = upd; else S.profiles.push(upd);
        toast('Nome salvato'); render();
      } catch (e) { toastErr(e); }
    });
    $('#addPerson')?.addEventListener('submit', async ev => {
      ev.preventDefault();
      const f = ev.target, name = $('[name="name"]', f).value.trim(), email = $('[name="email"]', f)?.value.trim().toLowerCase() || '';
      if (!name && !email) return toast('Scrivi almeno il nome');
      if (email && S.members.some(m => m.workspace_id === ws.id && (m.email || '').toLowerCase() === email)) return toast('Questa email è già nello spazio');
      try {
        const m = await store.addMember({ workspace_id: ws.id, name, email: email || null });
        S.members.push(m);
        render();
        if (email) await dialog({
          title: 'Invito pronto', okText: 'Ho capito',
          text: `Comunica a ${name || email} di aprire Second Brain e scegliere “Primo accesso? Crea la tua password” usando l’email ${email}. Se ha già un account, basta che acceda: troverà lo spazio “${ws.name}”.`
        });
        else toast(`${name} aggiunto: ora puoi taggarlo con @`);
      } catch (e) { toastErr(e); }
    });
    main.querySelector('.rows')?.addEventListener('click', async ev => {
      const b = ev.target.closest('[data-pa]');
      if (!b) return;
      const m = memberById(b.closest('[data-mid]').dataset.mid);
      try {
        if (b.dataset.pa === 'rename') {
          const name = await askText('Rinomina persona', m.name);
          if (!name || name === m.name) return;
          Object.assign(m, await store.updateMember(m.id, { name }));
        } else if (b.dataset.pa === 'remove') {
          if (!await askConfirm(`Togliere ${memberName(m)} dallo spazio?`, m.user_id
            ? 'Non vedrà più gli enti e le note di questo spazio. Le note che ha scritto restano.'
            : 'Le note in cui è taggato restano, ma il tag non sarà più collegato a una persona.', 'Togli')) return;
          await store.removeMember(m.id);
          S.members = S.members.filter(x => x.id !== m.id);
        } else if (b.dataset.pa === 'leave') {
          if (!await askConfirm(`Uscire da “${ws.name}”?`, 'Non vedrai più gli enti e le note di questo spazio. Per rientrare dovrà invitarti di nuovo il proprietario.', 'Esci')) return;
          await store.removeMember(m.id);
          await reloadAll(); setWs(null); applyWs();
          location.hash = '#/'; return;
        }
        render();
      } catch (e) { toastErr(e); }
    });
    $('#wsRename')?.addEventListener('click', async () => {
      const name = await askText('Rinomina spazio', ws.name);
      if (!name || name === ws.name) return;
      try { Object.assign(ws, await store.updateWorkspace(ws.id, { name })); render(); } catch (e) { toastErr(e); }
    });
    $('#wsDelete')?.addEventListener('click', async () => {
      if (!await askConfirm(`Eliminare lo spazio “${ws.name}”?`, 'Verranno eliminati per tutti gli enti, gli argomenti, le note e gli allegati di questo spazio. L’operazione non si può annullare.')) return;
      try {
        await store.deleteWorkspace(ws.id);
        await reloadAll(); setWs(null); applyWs();
        toast('Spazio eliminato');
        location.hash = '#/';
      } catch (e) { toastErr(e); }
    });
  },

  async mentions(r) {
    const pid = r.params.get('p');
    const person = pid && memberById(pid);
    const ids = person ? [person.id] : myMemberIds();
    const who = person ? memberName(person) : 'te';
    const others = membersOf(S.wsId).filter(m => !(m.user_id && m.user_id === store.uid));
    main.innerHTML = `${topbar('Menzioni', person ? `Note in cui è taggato ${esc(who)}` : 'Note in cui sei taggato, in tutti gli spazi')}
      <div class="page">
        <div class="seg seg-wrap">
          <a href="#/mentions" class="${person ? '' : 'on'}">${icon('user')}Io</a>
          ${others.map(m => `<a href="#/mentions?p=${m.id}" class="${person?.id === m.id ? 'on' : ''}">${esc(memberName(m))}</a>`).join('')}
          ${person && !others.includes(person) && !(person.user_id === store.uid) ? `<a class="on">${esc(memberName(person))}</a>` : ''}
        </div>
        <div id="mentionList"><p class="muted">Caricamento…</p></div>
      </div>`;
    const notes = await store.listMentions(ids);
    if (S.route !== r) return;
    const box = $('#mentionList');
    if (!notes.length) {
      box.innerHTML = `<section class="panel">${empty('at', 'Nessuna menzione', person
        ? `Nessuna nota tagga ${esc(who)}. Nelle note scrivi @ e scegli la persona.`
        : 'Quando qualcuno ti tagga con @ in una nota, la trovi qui.')}</section>`;
      return;
    }
    const open = sortTodos(notes.filter(n => n.todo && !n.done));
    const rest = notes.filter(n => !(n.todo && !n.done));
    let html = '';
    if (open.length) html += `<section class="panel bucket">
      <div class="panel-head"><h2><span class="bdot amber"></span>Da fare</h2><span class="pill">${open.length}</span></div>
      <div class="rows">${open.map(n => todoRow(n)).join('')}</div></section>`;
    if (rest.length) html += `<section class="panel">
      <div class="panel-head"><h2>Altre note</h2><span class="pill">${rest.length}</span></div>
      <div class="rows">${rest.map(n => {
        const t = topicOf(n.topic_id), e = t && entityOf(t.entity_id);
        if (!t || !e) return '';
        const by = n.user_id && accountsOf(n.workspace_id).length > 1 ? ` · ${esc(authorName(n.user_id, n.workspace_id))}` : '';
        return `<a class="row" href="#/e/${e.id}/t/${t.id}?n=${n.id}">
          <span class="tile sm ${tintOf(t.title)}">${icon(n.todo ? 'check' : 'notes')}</span>
          <span class="row-main"><span class="muted small">${e.workspace_id !== S.wsId ? `${esc(wsLabel(wsById(e.workspace_id)))} · ` : ''}${esc(e.name)} / ${esc(t.title)} · ${fmtDate(n.created_at)}${by}</span>
          <span class="row-text">${esc(snippet(n.text, '', 240)) || '<em class="muted">(solo allegati)</em>'}</span></span></a>`;
      }).join('')}</div></section>`;
    box.innerHTML = html;
  },

  async search(r) {
    const q = (r.params.get('q') || '').trim();
    main.innerHTML = `${topbar('Ricerca', `Risultati per “${esc(q)}” in ${esc(wsLabel(curWs()))}`)}<div class="page"><div id="res"><p class="muted">Ricerca in corso…</p></div></div>`;
    const ql = q.toLowerCase();
    const ents = wsEntities().filter(e => e.name.toLowerCase().includes(ql));
    const tps = wsTopics().filter(t => t.title.toLowerCase().includes(ql));
    const notes = (await store.searchNotes(q)).filter(n => wsOfNote(n) === S.wsId);
    if (S.route !== r) return;
    let html = '';
    if (ents.length || tps.length) {
      html += `<section class="panel"><div class="panel-head"><h2>Enti e argomenti</h2></div><div class="rows">
        ${ents.map(e => `<a class="row" href="#/e/${e.id}"><span class="tile sm ${tintOf(e.name)}">${icon('building')}</span>
          <span class="row-main"><strong>${mark(e.name, q)}</strong><span class="muted">Ente</span></span></a>`).join('')}
        ${tps.map(t => `<a class="row" href="#/e/${t.entity_id}/t/${t.id}"><span class="tile sm ${tintOf(t.title)}">${icon('folder')}</span>
          <span class="row-main"><strong>${mark(t.title, q)}</strong><span class="muted">${esc(entityOf(t.entity_id)?.name)}</span></span></a>`).join('')}
      </div></section>`;
    }
    html += `<section class="panel"><div class="panel-head"><h2>Note</h2><span class="pill">${notes.length}${notes.length === 100 ? '+' : ''}</span></div>`;
    html += notes.length ? `<div class="rows">${notes.map(n => {
      const t = topicOf(n.topic_id), e = t && entityOf(t.entity_id);
      if (!t || !e) return '';
      return `<a class="row" href="#/e/${e.id}/t/${t.id}?n=${n.id}">
        <span class="tile sm ${tintOf(t.title)}">${icon('notes')}</span>
        <span class="row-main"><span class="muted small">${esc(e.name)} / ${esc(t.title)} · ${fmtDate(n.created_at)}</span>
        <span class="row-text">${mark(snippet(n.text, q, 240), q)}</span></span></a>`;
    }).join('')}</div>` : empty('search', 'Nessuna nota trovata', 'Prova con un’altra parola.');
    html += '</section>';
    $('#res').innerHTML = html;
  }
};

function empty(ic, title, text) {
  return `<div class="empty"><span class="tile">${icon(ic)}</span><strong>${title}</strong><span>${text}</span></div>`;
}

function notFound() {
  main.innerHTML = `${topbar('Non trovato')}<div class="page"><section class="panel">${empty('inbox', 'Elemento non trovato', 'Forse è stato eliminato.')}</section></div>`;
}

function snippet(text, q, len) {
  text = String(text || '').replace(/\s+/g, ' ').trim();
  if (text.length <= len) return text;
  const i = q ? text.toLowerCase().indexOf(q.toLowerCase()) : -1;
  const start = i > 60 ? i - 60 : 0;
  return (start ? '…' : '') + text.slice(start, start + len) + (start + len < text.length ? '…' : '');
}
function mark(text, q) {
  const t = esc(text);
  if (!q) return t;
  const re = new RegExp(esc(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
  return t.replace(re, m => `<mark>${m}</mark>`);
}

/* ---------- note ---------- */
// l'autore si mostra solo negli spazi con più di un account
const showAuthor = n => n.user_id && accountsOf(n.workspace_id).length > 1;
function noteEl(n) {
  const edited = n.updated_at && n.created_at && Math.abs(new Date(n.updated_at) - new Date(n.created_at)) > 1000;
  const el = h(`<article class="note ${n.todo ? 'is-todo' : ''} ${n.done ? 'is-done' : ''}" data-id="${n.id}">
    <div class="note-meta">
      ${n.todo ? `<input type="checkbox" class="todo-check" ${n.done ? 'checked' : ''} title="${n.done ? 'Fatto' : 'Segna come fatto'}">` : icon('clock', 'meta-ic')}
      ${showAuthor(n) ? `<span class="author" title="Scritta da ${esc(authorName(n.user_id, n.workspace_id))}"><span class="mini-av ${tintOf(n.user_id)}">${esc(initialsOf(authorName(n.user_id, n.workspace_id)))}</span>${esc(authorName(n.user_id, n.workspace_id))}</span>` : ''}
      <time title="${edited ? 'Modificata il ' + fmtDate(n.updated_at) : ''}">${fmtDate(n.created_at)}</time>
      ${edited ? '<span class="edited">modificata</span>' : ''}
      ${n.todo ? `<span class="pill ${n.done ? 'green' : 'amber'}">${n.done ? 'Fatto' : 'Da fare'}</span>${n.done && !n.due_date ? '' : dueControl(n)}` : ''}
      <span class="spacer"></span>
      <div class="note-actions">
        <button data-na="todo" type="button" title="${n.todo ? 'Togli da fare' : 'Segna come da fare'}" class="${n.todo ? 'on' : ''}">${icon('todo')}</button>
        <button data-na="edit" type="button" title="Modifica">${icon('edit')}</button>
        <button data-na="del" type="button" title="Elimina" class="danger">${icon('trash')}</button>
      </div>
    </div>
    <div class="note-body"></div>
  </article>`);
  el.querySelector('.note-body').innerHTML = DOMPurify.sanitize(n.html, PURIFY_VIEW);
  for (const a of $$('.note-body a[href]:not([data-path])', el)) { a.target = '_blank'; a.rel = 'noopener noreferrer'; }
  fixChips(el);
  return el;
}

// Gli allegati salvati prima del cambio grafico avevano un'emoji: la sostituisce con l'icona.
function fixChips(root) {
  for (const a of $$('a.file-chip', root)) {
    if (a.querySelector('svg')) continue;
    const name = a.dataset.name || a.textContent.trim();
    const size = a.querySelector('small')?.textContent || '';
    a.innerHTML = `${icon('file')}<span class="ellipsis">${esc(name)}</span>${size ? `<small>${esc(size)}</small>` : ''}`;
  }
}

// Collega immagini e allegati salvati ai loro indirizzi reali.
async function hydrate(root) {
  const els = $$('[data-path]', root);
  if (!els.length) return;
  try {
    const map = await store.resolveUrls([...new Set(els.map(e => e.dataset.path))]);
    for (const e of els) {
      const u = map[e.dataset.path];
      if (!u) { e.classList.add('missing'); continue; }
      if (e.tagName === 'IMG') e.src = u;
      else {
        e.href = u; e.target = '_blank'; e.rel = 'noopener';
        if (store.mode === 'local') e.download = e.dataset.name || '';
      }
    }
  } catch (e) { toastErr(e); }
}

function openLightbox(src) {
  const lb = $('#lightbox');
  lb.querySelector('img').src = src;
  lb.classList.remove('hidden');
}
$('#lightbox').onclick = () => $('#lightbox').classList.add('hidden');
document.addEventListener('keydown', ev => { if (ev.key === 'Escape') $('#lightbox').classList.add('hidden'); });

/* ---------- editor ---------- */
function serializeEditor(el) {
  const c = el.cloneNode(true);
  c.querySelectorAll('.uploading').forEach(x => x.remove());
  c.querySelectorAll('img[data-path]').forEach(i => i.removeAttribute('src'));
  c.querySelectorAll('a[data-path]').forEach(a => { a.removeAttribute('href'); a.removeAttribute('target'); a.removeAttribute('download'); });
  let html = DOMPurify.sanitize(c.innerHTML.replace(/​/g, ''), PURIFY_VIEW).trim();
  html = html.replace(/^(?:<br\s*\/?>|<div><br\s*\/?><\/div>|&nbsp;|\s)+|(?:<br\s*\/?>|<div><br\s*\/?><\/div>|&nbsp;|\s)+$/gi, '');
  const text = (el.innerText || '').replace(/ /g, ' ').replace(/​/g, '').trim();
  const hasMedia = !!c.querySelector('img, a[data-path], table');
  const mentions = [...new Set($$('[data-mention]', c).map(x => x.dataset.mention))];
  return { html, text, mentions, empty: !text && !hasMedia };
}

/* ---------- formattazione del testo ---------- */
// elemento più vicino al cursore che corrisponde al selettore, solo dentro l'editor
function closestIn(el, sel) {
  const s = getSelection();
  if (!s.rangeCount) return null;
  let n = s.getRangeAt(0).startContainer;
  if (n.nodeType === 3) n = n.parentNode;
  const found = n.closest?.(sel);
  return found && el.contains(found) && found !== el ? found : null;
}
const exec = (cmd, val = null) => document.execCommand(cmd, false, val);

function toggleBlock(el, tag) {
  exec('formatBlock', closestIn(el, tag) ? '<div>' : `<${tag}>`);
}

function toggleChecklist(el) {
  const li = closestIn(el, 'li');
  const list = li?.parentElement;
  if (list?.classList.contains('checklist')) { exec('insertUnorderedList'); return; } // toglie la lista
  if (!list || list.tagName !== 'UL') exec('insertUnorderedList');
  const ul = closestIn(el, 'li')?.parentElement;
  if (!ul || ul.tagName !== 'UL') return;
  ul.classList.add('checklist');
  for (const x of ul.children) if (x.tagName === 'LI' && !x.dataset.checked) x.dataset.checked = 'false';
}

async function insertLink(el) {
  const s = getSelection();
  const range = s.rangeCount ? s.getRangeAt(0).cloneRange() : null;
  let url = await askText('Inserisci link', '', 'Inserisci', 'https://…');
  if (!url) { el.focus(); if (range) { s.removeAllRanges(); s.addRange(range); } return; }
  if (!/^(https?:|mailto:)/i.test(url)) url = 'https://' + url;
  el.focus();
  if (range) { s.removeAllRanges(); s.addRange(range); }
  if (range && !range.collapsed) exec('createLink', url);
  else exec('insertHTML', `<a href="${esc(url)}">${esc(url)}</a>&nbsp;`);
}

const FORMATS = [
  { id: 'bold', ic: 'bold', title: 'Grassetto (Ctrl+B)', run: () => exec('bold'), state: () => document.queryCommandState('bold') },
  { id: 'italic', ic: 'italic', title: 'Corsivo (Ctrl+I)', run: () => exec('italic'), state: () => document.queryCommandState('italic') },
  { id: 'underline', ic: 'underline', title: 'Sottolineato (Ctrl+U)', run: () => exec('underline'), state: () => document.queryCommandState('underline') },
  { id: 'strike', ic: 'strike', title: 'Barrato', run: () => exec('strikeThrough'), state: () => document.queryCommandState('strikeThrough') },
  { id: 'highlight', ic: 'highlight', title: 'Evidenzia', run: () => { exec('styleWithCSS', true); exec('hiliteColor', '#fff1a8'); exec('styleWithCSS', false); } },
  '|',
  { id: 'h2', ic: 'h1', title: 'Titolo (# all’inizio della riga)', run: el => toggleBlock(el, 'h2'), state: el => !!closestIn(el, 'h2') },
  { id: 'h3', ic: 'h2', title: 'Sottotitolo (## all’inizio della riga)', run: el => toggleBlock(el, 'h3'), state: el => !!closestIn(el, 'h3') },
  '|',
  { id: 'ul', ic: 'list', title: 'Elenco puntato (- all’inizio della riga)', run: () => exec('insertUnorderedList'), state: el => !!closestIn(el, 'ul:not(.checklist) > li') },
  { id: 'ol', ic: 'listOrdered', title: 'Elenco numerato (1. all’inizio della riga)', run: () => exec('insertOrderedList'), state: el => !!closestIn(el, 'ol > li') },
  { id: 'check', ic: 'listChecks', title: 'Caselle di controllo ([] all’inizio della riga)', run: el => toggleChecklist(el), state: el => !!closestIn(el, 'ul.checklist > li') },
  '|',
  { id: 'quote', ic: 'quote', title: 'Citazione (> all’inizio della riga)', run: el => toggleBlock(el, 'blockquote'), state: el => !!closestIn(el, 'blockquote') },
  { id: 'link', ic: 'link', title: 'Link', run: el => insertLink(el) },
  { id: 'clear', ic: 'eraser', title: 'Togli formattazione', run: () => { exec('removeFormat'); exec('formatBlock', '<div>'); } }
];

function buildToolbar(el, changed) {
  const bar = h(`<div class="fmt-bar" role="toolbar" aria-label="Formattazione">${FORMATS.map(f => f === '|'
    ? '<span class="fmt-sep"></span>'
    : `<button type="button" class="fmt-btn" data-fmt="${f.id}" title="${f.title}">${icon(f.ic)}</button>`).join('')}</div>`);
  bar.addEventListener('mousedown', ev => ev.preventDefault()); // non togliere il cursore dall'editor
  bar.addEventListener('click', ev => {
    const b = ev.target.closest('[data-fmt]');
    if (!b) return;
    if (!el.contains(getSelection().anchorNode)) { el.focus(); placeCaretEnd(el); }
    FORMATS.find(f => f.id === b.dataset.fmt).run(el);
    changed();
    refresh();
  });
  // evidenzia i pulsanti attivi dove si trova il cursore
  function refresh() {
    if (!document.contains(el)) { document.removeEventListener('selectionchange', refresh); return; }
    const inside = el.contains(getSelection().anchorNode);
    for (const f of FORMATS) {
      if (f === '|' || !f.state) continue;
      bar.querySelector(`[data-fmt="${f.id}"]`).classList.toggle('on', inside && !!f.state(el));
    }
  }
  document.addEventListener('selectionchange', refresh);
  return bar;
}

// Scorciatoie a inizio riga: "- " "1. " "[] " "# " "## " "> "
const BLOCK_TAGS = /^(DIV|P|LI|H1|H2|H3|BLOCKQUOTE)$/;
function markdownShortcut(el) {
  const s = getSelection();
  if (!s.rangeCount || !s.isCollapsed) return false;
  const caret = s.getRangeAt(0);
  if (closestIn(el, 'li')) return false;
  let block = caret.startContainer;
  while (block !== el && !(block.nodeType === 1 && BLOCK_TAGS.test(block.tagName))) block = block.parentNode;
  const pre = document.createRange();
  pre.setEnd(caret.startContainer, caret.startOffset);
  if (block === el) {
    // riga "libera" dentro l'editor: parte dopo l'ultimo a capo
    let top = caret.startContainer;
    while (top !== el && top.parentNode !== el) top = top.parentNode;
    let p = top === el ? null : top.previousSibling;
    while (p && !(p.nodeName === 'BR' || (p.nodeType === 1 && BLOCK_TAGS.test(p.tagName)))) p = p.previousSibling;
    p ? pre.setStartAfter(p) : pre.setStart(el, 0);
  } else pre.setStart(block, 0);
  const key = pre.toString().replace(/​/g, '');
  const actions = {
    '-': () => exec('insertUnorderedList'), '*': () => exec('insertUnorderedList'),
    '1.': () => exec('insertOrderedList'),
    '[]': () => toggleChecklist(el), '[ ]': () => toggleChecklist(el),
    '#': () => toggleBlock(el, 'h2'), '##': () => toggleBlock(el, 'h3'),
    '>': () => toggleBlock(el, 'blockquote')
  };
  if (!actions[key]) return false;
  // prima si applica il formato (su una riga vuota il browser non lo applicherebbe), poi si cancella il simbolo
  actions[key]();
  const blockEl = closestIn(el, 'li, h2, h3, blockquote, div') || el;
  const walker = document.createTreeWalker(blockEl, NodeFilter.SHOW_TEXT);
  for (let tn = walker.nextNode(); tn; tn = walker.nextNode()) {
    const i = tn.data.indexOf(key);
    if (i === -1) continue;
    tn.deleteData(i, key.length);
    if (!blockEl.textContent.replace(/​/g, '')) tn.parentNode.insertBefore(document.createElement('br'), tn.nextSibling);
    const r = document.createRange();
    r.setStart(tn, i); r.collapse(true);
    s.removeAllRanges(); s.addRange(r);
    break;
  }
  return true;
}

function placeCaretEnd(el) {
  const r = document.createRange();
  r.selectNodeContents(el); r.collapse(false);
  const s = getSelection(); s.removeAllRanges(); s.addRange(r);
}

const norm = s => String(s || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

function setupEditor(el, { onSubmit, onEscape, onChange, people = () => [] }) {
  const api = { busy: 0, uploaded: new Set() };
  let lastRange = null;
  const changed = () => onChange && onChange();

  /* tag delle persone: "@" apre l'elenco, frecce per scegliere, Invio o Tab per inserire */
  const mention = { box: null, list: [], idx: 0, at: null };
  function mentionQuery() {
    const s = getSelection();
    if (!s.rangeCount || !s.isCollapsed) return null;
    const r = s.getRangeAt(0), node = r.startContainer;
    if (node.nodeType !== 3 || !el.contains(node)) return null;
    const m = node.data.slice(0, r.startOffset).match(/(?:^|[\s\u00a0(\u200b])@([^\s\u00a0@]{0,30})$/u);
    if (!m) return null;
    return { node, start: r.startOffset - m[1].length - 1, end: r.startOffset, q: norm(m[1]) };
  }
  function closeMention() { mention.box?.remove(); mention.box = null; mention.at = null; }
  function drawMention() {
    const b = mention.box;
    if (!mention.list.length) {
      b.innerHTML = `<div class="mention-empty">${people().length
        ? 'Nessuna persona con questo nome'
        : 'Nessuna persona in questo spazio. Aggiungile dalla pagina <a href="#/people">Persone</a>.'}</div>`;
      return;
    }
    b.innerHTML = mention.list.map((m, i) => `<button type="button" class="mention-opt ${i === mention.idx ? 'on' : ''}" data-i="${i}">
      <span class="mini-av ${tintOf(m.id)}">${esc(initialsOf(memberName(m)))}</span>
      <span class="ellipsis">${esc(memberName(m))}</span>
      <small>${m.user_id ? (m.user_id === store.uid ? 'tu' : 'utente') : m.email ? 'invitato' : 'senza account'}</small></button>`).join('');
  }
  function updateMention() {
    const at = mentionQuery();
    if (!at) return closeMention();
    mention.at = at;
    mention.list = people().filter(m => {
      const n = norm(memberName(m));
      return !at.q || n.startsWith(at.q) || n.split(/\s+/).some(w => w.startsWith(at.q)) || norm(m.email).startsWith(at.q);
    }).slice(0, 8);
    mention.idx = Math.min(mention.idx, Math.max(0, mention.list.length - 1));
    if (!mention.box) {
      mention.box = h('<div class="mention-box" role="listbox"></div>');
      mention.box.addEventListener('mousedown', ev => { if (!ev.target.closest('a')) ev.preventDefault(); });
      mention.box.addEventListener('click', ev => {
        const o = ev.target.closest('[data-i]');
        if (o) pickMention(+o.dataset.i);
      });
      document.body.append(mention.box);
    }
    drawMention();
    // sotto il cursore (o sopra, se non c'è spazio)
    const r = document.createRange();
    r.setStart(at.node, at.start); r.setEnd(at.node, at.end);
    const rect = r.getBoundingClientRect(), bh = mention.box.offsetHeight, bw = mention.box.offsetWidth;
    const top = rect.bottom + 6 + bh > innerHeight ? rect.top - bh - 6 : rect.bottom + 6;
    mention.box.style.top = `${Math.max(8, top)}px`;
    mention.box.style.left = `${Math.max(8, Math.min(rect.left, innerWidth - bw - 8))}px`;
  }
  function pickMention(i) {
    const m = mention.list[i], at = mention.at;
    if (!m || !at) return;
    const r = document.createRange();
    r.setStart(at.node, at.start); r.setEnd(at.node, at.end);
    r.deleteContents();
    const tag = h(`<span class="mention" contenteditable="false" data-mention="${esc(m.id)}">@${esc(memberName(m))}</span>`);
    const space = document.createTextNode('\u00a0');
    r.insertNode(space); r.insertNode(tag);
    const c = document.createRange(); c.setStart(space, 1); c.collapse(true);
    const s = getSelection(); s.removeAllRanges(); s.addRange(c);
    lastRange = c.cloneRange();
    closeMention();
    changed();
  }
  api.startMention = () => {
    el.focus();
    const s = getSelection();
    if (!s.rangeCount || !el.contains(s.anchorNode)) placeCaretEnd(el);
    const r = getSelection().getRangeAt(0), n = r.startContainer;
    const prev = n.nodeType === 3 && r.startOffset ? n.data[r.startOffset - 1] : '';
    exec('insertText', prev && !/\s|\u00a0/.test(prev) ? ' @' : '@');
    updateMention();
  };
  el.addEventListener('keydown', ev => {
    if (!mention.box) return;
    if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
      ev.preventDefault(); ev.stopImmediatePropagation();
      const n = mention.list.length;
      if (n) { mention.idx = (mention.idx + (ev.key === 'ArrowDown' ? 1 : n - 1)) % n; drawMention(); }
    } else if ((ev.key === 'Enter' || ev.key === 'Tab') && mention.list.length && !ev.shiftKey) {
      ev.preventDefault(); ev.stopImmediatePropagation();
      pickMention(mention.idx);
    } else if (ev.key === 'Escape') {
      ev.preventDefault(); ev.stopImmediatePropagation();
      closeMention();
    }
  });
  el.addEventListener('input', () => { mention.idx = mention.box ? mention.idx : 0; updateMention(); });
  el.addEventListener('blur', () => setTimeout(() => { if (document.activeElement !== el) closeMention(); }, 150));
  el.addEventListener('mouseup', () => { if (mention.box) updateMention(); });

  const saveRange = () => {
    const s = getSelection();
    if (s.rangeCount && el.contains(s.getRangeAt(0).commonAncestorContainer)) lastRange = s.getRangeAt(0).cloneRange();
  };
  ['keyup', 'mouseup', 'input', 'blur'].forEach(t => el.addEventListener(t, saveRange));

  function getRange() {
    const s = getSelection();
    if (s.rangeCount && el.contains(s.getRangeAt(0).commonAncestorContainer)) return s.getRangeAt(0);
    if (lastRange && el.contains(lastRange.commonAncestorContainer)) return lastRange;
    const r = document.createRange(); r.selectNodeContents(el); r.collapse(false); return r;
  }
  function insertAtCaret(node) {
    const r = getRange();
    r.deleteContents();
    let last = node.nodeType === 11 ? node.lastChild : node;
    r.insertNode(node);
    if (!last) return;
    // Chrome sposta il cursore prima di un elemento (immagine, allegato):
    // un carattere invisibile dopo l'elemento tiene il cursore al posto giusto.
    if (last.nodeType !== 3) {
      const z = document.createTextNode('​');
      last.after(z);
      last = z;
    }
    r.setStart(last, last.length); r.collapse(true);
    const s = getSelection(); s.removeAllRanges(); s.addRange(r);
    lastRange = r.cloneRange();
  }
  const placeholder = name => h(`<span class="uploading" contenteditable="false">${icon('loader', 'spin')}<span>${esc(name)}</span></span>`);

  async function upload(file) {
    const path = await store.uploadFile(file);
    api.uploaded.add(path);
    const url = (await store.resolveUrls([path]))[path];
    if (file.type.startsWith('image/')) {
      const img = document.createElement('img');
      img.dataset.path = path; img.alt = file.name || 'immagine'; img.src = url;
      return img;
    }
    const a = h(`<a class="file-chip" contenteditable="false" data-path="${esc(path)}" data-name="${esc(file.name)}">${icon('file')}<span class="ellipsis">${esc(file.name)}</span><small>${fmtSize(file.size)}</small></a>`);
    a.href = url; a.target = '_blank';
    return a;
  }
  function runUpload(ph, filePromise) {
    api.busy++;
    filePromise.then(upload)
      .then(node => ph.replaceWith(node))
      .catch(err => { ph.remove(); toastErr(err); })
      .finally(() => { api.busy--; changed(); });
  }

  api.insertFiles = files => {
    for (const f of files) {
      const ph = placeholder(f.name || 'file');
      insertAtCaret(ph);
      runUpload(ph, Promise.resolve(f));
    }
  };

  function insertPastedHtml(html) {
    const box = document.createElement('div');
    box.innerHTML = DOMPurify.sanitize(html, PURIFY_PASTE);
    // immagini incorporate (es. da Word) → caricate come file veri
    for (const img of $$('img', box)) {
      if (!img.getAttribute('src')?.startsWith('data:')) continue;
      const ph = placeholder('immagine');
      const src = img.getAttribute('src');
      img.replaceWith(ph);
      runUpload(ph, fetch(src).then(r => r.blob()).then(b => new File([b], 'immagine.' + (b.type.split('/')[1] || 'png'), { type: b.type })));
    }
    const frag = document.createDocumentFragment();
    while (box.firstChild) frag.append(box.firstChild);
    insertAtCaret(frag);
  }

  const trySubmit = () => { if (api.busy) return toast('Attendi la fine del caricamento'); onSubmit(); };

  el.addEventListener('keydown', ev => {
    if (ev.isComposing) return;
    if (ev.key === 'Enter') {
      if (ev.ctrlKey || ev.metaKey) { ev.preventDefault(); return trySubmit(); }
      if (ev.shiftKey) return;
      const li = closestIn(el, 'li');
      // dentro elenchi, titoli e citazioni Invio va a capo; altrimenti salva
      if (li) {
        if (li.parentElement?.classList.contains('checklist')) {
          setTimeout(() => { const n = closestIn(el, 'li'); if (n && n !== li) n.dataset.checked = 'false'; }, 0);
        }
        return;
      }
      if (closestIn(el, 'h2, h3, blockquote')) return;
      ev.preventDefault();
      trySubmit();
    } else if (ev.key === 'Escape' && onEscape) {
      ev.preventDefault(); onEscape();
    } else if (ev.key === 'Tab' && closestIn(el, 'li')) {
      ev.preventDefault();
      document.execCommand(ev.shiftKey ? 'outdent' : 'indent');
      changed();
    } else if (ev.key === ' ' && !ev.ctrlKey && !ev.metaKey) {
      if (markdownShortcut(el)) { ev.preventDefault(); changed(); }
    }
  });

  // clic sulla casella di una lista di controllo
  el.addEventListener('click', ev => {
    const li = ev.target.closest?.('ul.checklist > li');
    if (!li || !el.contains(li) || ev.clientX - li.getBoundingClientRect().left > 24) return;
    li.dataset.checked = li.dataset.checked === 'true' ? 'false' : 'true';
    changed();
  });

  api.toolbar = buildToolbar(el, changed);
  el.addEventListener('input', () => {
    if (el.innerHTML === '<br>') el.innerHTML = '';
    changed();
  });
  el.addEventListener('paste', ev => {
    const dt = ev.clipboardData;
    if (!dt) return;
    const files = [...dt.files];
    const html = dt.getData('text/html');
    const htmlText = html ? new DOMParser().parseFromString(html, 'text/html').body.textContent.trim() : '';
    // Screenshot, immagini copiate, file → inseriti come immagini/allegati.
    // Tabelle Excel e testo formattato → mantenuti come testo (anche se il clipboard contiene un'anteprima immagine).
    if (files.length && !htmlText) { ev.preventDefault(); api.insertFiles(files); changed(); return; }
    if (html) { ev.preventDefault(); insertPastedHtml(html); changed(); }
  });
  el.addEventListener('dragover', ev => {
    if (ev.dataTransfer?.types.includes('Files')) { ev.preventDefault(); el.classList.add('drag'); }
  });
  el.addEventListener('dragleave', () => el.classList.remove('drag'));
  el.addEventListener('drop', ev => {
    el.classList.remove('drag');
    const files = [...(ev.dataTransfer?.files || [])];
    if (!files.length) return;
    ev.preventDefault();
    const r = document.caretRangeFromPoint?.(ev.clientX, ev.clientY);
    if (r && el.contains(r.startContainer)) { const s = getSelection(); s.removeAllRanges(); s.addRange(r); }
    api.insertFiles(files);
  });

  return api;
}

boot();
})();
