// Super Sanatan — Panchang planner. Reads and writes Arcbha/Content-distribution through the GitHub REST API.
// The token lives only in this browser's localStorage and is sent only to api.github.com.
// Data contract: planner/README.md in Content-distribution.
'use strict';
const $ = id => document.getElementById(id);
const API = 'https://api.github.com';
const K = { tok: 'ss.token', repo: 'ss.repo', branch: 'ss.branch', share: 'ss.share' };
const PLANS = 'planner/plans.json', PANCHANG = 'data/panchang_2026.json', REFS = 'planner/refs', REQUESTS = 'planner/requests';
const BOOKMARKS = 'planner/bookmarks.json', BM_DIR = 'planner/bookmarks';
const ARTWORKS = 'planner/artworks.json', AW_DIR = 'planner/artworks', CREATIONS = 'planner/creations.json', CREATE_REQ = 'planner/create-requests', CR_DIR = 'planner/creations';
const QUOTES = 'planner/quotes.json', QT_DIR = 'planner/quotes';
const ACCOUNTS_FILE = 'planner/claude-accounts.json';
const ACCOUNT_ORDER = [['google', 'Account Google'], ['outlook', 'Account Outlook']];   // first in sequence = Account Google
const ACTIVE = ['queued', 'writing', 'briefing', 'drawing'];
const MAX_CR_IMAGES = 6;
const POLL_MS = 7000, AI_SLOW_MS = 4 * 60 * 1000, AI_GIVE_UP_MS = 15 * 60 * 1000;
const MAX_FILE = 50 * 1024 * 1024, MAX_SIDE = 2000, JPEG_Q = 0.88, MAX_REFS = 16;

// ── Rules mirrored from core/strategy_engine.py ─────────────────────────
const TIER_BOOST = { MEGA: 63, MAJOR: 35, NOTABLE: 15 };
const RAMP_UP = 3, RAMP_DOWN = 2;
// Python weekday numbering: Monday = 0 … Sunday = 6. Ordered by base weight.
const PEAK_DAYS = {
  Shiva: [0], Krishna: [2, 3], Hanuman: [1, 5], Ram: [6], Ganesh: [2],
  Devi: [4], Kanahiya: [0, 2], Nandlal: [2, 4], Mahakal: [0, 5], RadhaKrishna: [2, 4],
  Vishnu: [3], ShivaParvati: [0, 4], Lakshmi: [4], Saraswati: [2, 3], Surya: [6],
};
const DEITIES = Object.keys(PEAK_DAYS);
const LUNAR = ['ekadashi', 'purnima', 'amavasya', 'pradosh'];
const LUNAR_LABEL = { ekadashi: 'Ekadashi', purnima: 'Purnima', amavasya: 'Amavasya', pradosh: 'Pradosh' };
const KINDS = [['still', 'Still'], ['reel', 'Reel'], ['carousel', 'Carousel'], ['text', 'Text post'], ['task', 'Task']];
const PLATFORMS = [['instagram', 'Instagram'], ['youtube', 'YouTube'], ['x', 'X'], ['facebook', 'Facebook'], ['linkedin', 'LinkedIn']];
const STATUSES = [['idea', 'Idea'], ['making', 'Making'], ['ready', 'Ready'], ['posted', 'Posted']];
const STATUS_RANK = { making: 0, ready: 1, idea: 2, posted: 3 };
const REF_TYPES = { 'image/png': ['image', 'png'], 'image/jpeg': ['image', 'jpg'], 'image/webp': ['image', 'webp'], 'image/gif': ['image', 'gif'], 'video/mp4': ['video', 'mp4'], 'video/webm': ['video', 'webm'], 'video/quicktime': ['video', 'mov'], 'application/pdf': ['pdf', 'pdf'] };
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// ── Small helpers ───────────────────────────────────────────────────────
const store = {
  get: k => { try { return localStorage.getItem(k) || '' } catch { return '' } },
  set: (k, v) => { try { localStorage.setItem(k, v) } catch {} },
  del: k => { try { localStorage.removeItem(k) } catch {} },
};
const cfg = () => ({ tok: store.get(K.tok), repo: store.get(K.repo) || 'Arcbha/Content-distribution', branch: store.get(K.branch) || 'main' });
const stamp = () => new Date().toISOString().replace(/[:.]/g, '-');
const slugify = s => String(s).toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').replace(/[\s_]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'ref';
const b64utf8 = s => btoa(unescape(encodeURIComponent(s)));
const newId = () => 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const safeUrl = u => typeof u === 'string' && /^https:\/\/[^\s]+$/i.test(u.trim()) ? u.trim() : '';
const isDate = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
const istToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const toUTC = s => { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)) };
const addDays = (s, n) => { const d = toUTC(s); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) };
const diffDays = (a, b) => Math.round((toUTC(a) - toUTC(b)) / 86400000);
const jsDow = s => toUTC(s).getUTCDay();
const pyDow = s => (jsDow(s) + 6) % 7;
const longDate = s => { const d = toUTC(s); return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}` };
const shortDate = s => { const d = toUTC(s); return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()].slice(0, 3)}` };
const relLabel = n => n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : n === -1 ? 'Yesterday' : n > 0 ? `In ${n} days` : `${-n} days ago`;
function rampBoost(tier, daysTo) {
  const peak = TIER_BOOST[tier] || 0;
  if (!peak) return 0;
  if (daysTo === 0) return peak;
  if (daysTo >= 1 && daysTo <= RAMP_UP) return Math.round(peak * (RAMP_UP + 1 - daysTo) / (RAMP_UP + 1) * 10) / 10;
  if (daysTo <= -1 && daysTo >= -RAMP_DOWN) return Math.round(peak * (RAMP_DOWN + 1 + daysTo) / (RAMP_DOWN + 1) * 10) / 10;
  return 0;
}
// DOM builder: every value goes in as text, never as markup.
function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'value') el.value = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, String(v));
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  return el;
}
function icon(d) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 16 16'); svg.setAttribute('class', 'icon'); svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('fill', 'none'); svg.setAttribute('stroke', 'currentColor'); svg.setAttribute('stroke-width', '1.5'); svg.setAttribute('stroke-linejoin', 'round');
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path'); p.setAttribute('d', d); svg.append(p);
  return svg;
}
const SPARK = 'M8 1.5 9.4 6.6 14.5 8 9.4 9.4 8 14.5 6.6 9.4 1.5 8 6.6 6.6Z';
function msg(id, kind, text) { const m = $(id); m.className = 'msg' + (id === 'appMsg' ? ' banner' : '') + (kind ? ' ' + kind : ''); m.textContent = text || ''; m.hidden = !text }
// A message with a checklist (✓ / ✗ lines) and an optional button, for connection problems.
function msgList(id, kind, title, lines, action) {
  const m = $(id); m.className = 'msg' + (id === 'appMsg' ? ' banner' : '') + (kind ? ' ' + kind : ''); m.hidden = false;
  m.replaceChildren(h('div', { style: 'font-weight:600' }, title),
    h('ul', { class: 'diag' }, lines.map(l => h('li', { class: l.ok ? 'ok' : 'bad' }, h('span', { 'aria-hidden': 'true' }, l.ok ? '✓' : '✗'), h('span', null, l.text)))),
    action ? h('button', { type: 'button', class: 'btn sm', onclick: action.run }, action.label) : null);
}
// Tap twice to confirm: confirm() pop-ups are blocked in some in-app browsers.
function armTap(btn, label) {
  if (btn.dataset.armed === '1') { clearTimeout(btn._t); return true }
  const old = btn.textContent; btn.dataset.armed = '1'; btn.textContent = label; btn.classList.add('armed');
  btn._t = setTimeout(() => { btn.dataset.armed = ''; btn.textContent = old; btn.classList.remove('armed') }, 4000);
  return false;
}

// ── GitHub ──────────────────────────────────────────────────────────────
class GhError extends Error { constructor(status, text) { super(plain(status, text)); this.status = status } }
function plain(status, text) {
  const t = (text || '').toLowerCase();
  if (status === 0) return 'No connection to GitHub. Check your network and try again.';
  if (status === 401) return 'GitHub rejected the token. It may have expired or been revoked. Tap “Forget token” and paste a new one.';
  if (status === 403 && t.includes('rate limit')) return 'GitHub’s rate limit was hit. Wait a few minutes and try again.';
  if (status === 403) return 'The token is missing a permission. It needs Contents: Read and write on Content-distribution (github.com → Settings → Developer settings → Fine-grained tokens → this token).';
  if (status === 404) return 'Not found. Check the repository and branch names, and that the token includes Content-distribution.';
  if (status === 409) return 'The repository is empty or the branch is missing.';
  if (status === 413 || t.includes('too large')) return 'The file is too large for GitHub.';
  if (status === 422 && t.includes('fast forward')) return 'Someone else saved at the same moment. Try again.';
  if (status >= 500) return 'GitHub is having trouble right now (' + status + '). Try again in a minute.';
  return 'GitHub said: ' + (text || status);
}
async function api(path, opts = {}) {
  const { tok } = cfg();
  let r;
  try {
    r = await fetch(API + path, { ...opts, headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', Authorization: 'Bearer ' + tok, ...(opts.body ? { 'Content-Type': 'application/json' } : {}), ...(opts.headers || {}) } });
  } catch { throw new GhError(0) }
  if (r.status === 204) return null;
  const txt = await r.text();
  if (!r.ok) { let m = txt; try { m = JSON.parse(txt).message } catch {} throw new GhError(r.status, m) }
  return txt ? JSON.parse(txt) : null;
}
// A repo file at a ref: text, Blob, or null when it doesn't exist.
async function raw(path, ref, asBlob) {
  const { tok, repo, branch } = cfg();
  let r;
  const enc = path.split('/').map(encodeURIComponent).join('/');
  try { r = await fetch(`${API}/repos/${repo}/contents/${enc}?ref=${encodeURIComponent(ref || branch)}`, { headers: { Authorization: 'Bearer ' + tok, Accept: 'application/vnd.github.raw', 'X-GitHub-Api-Version': '2022-11-28' }, cache: 'no-store' }) }
  catch { throw new GhError(0) }
  if (r.status === 404) return null;
  if (!r.ok) { let m = await r.text(); try { m = JSON.parse(m).message } catch {} throw new GhError(r.status, m) }
  return asBlob ? r.blob() : r.text();
}
// Blob upload via XHR so large files report progress.
function postBlob(b64, onProgress) {
  const { tok, repo } = cfg();
  return new Promise((res, rej) => {
    const x = new XMLHttpRequest();
    x.open('POST', `${API}/repos/${repo}/git/blobs`);
    x.setRequestHeader('Authorization', 'Bearer ' + tok);
    x.setRequestHeader('Accept', 'application/vnd.github+json');
    x.setRequestHeader('Content-Type', 'application/json');
    if (onProgress) x.upload.onprogress = e => e.lengthComputable && onProgress(e.loaded / e.total);
    x.onload = () => { if (x.status >= 200 && x.status < 300) res(JSON.parse(x.responseText).sha); else { let m = x.responseText; try { m = JSON.parse(m).message } catch {} rej(new GhError(x.status, m)) } };
    x.onerror = () => rej(new GhError(0));
    x.send(JSON.stringify({ content: b64, encoding: 'base64' }));
  });
}
// One commit for many files (Git Data API: blobs → tree → commit → ref).
// files: [{path, b64}] to add, [{path, del:true}] to remove. rebuild(headSha) returns more files computed from the head.
async function commitFiles(files, message, onProgress, rebuild) {
  const { repo, branch } = cfg();
  const total = files.reduce((n, f) => n + (f.b64 ? f.b64.length : 0), 0) || 1;
  let done = 0;
  const entries = [];
  for (const f of files) {
    if (f.del) { entries.push({ path: f.path, mode: '100644', type: 'blob', sha: null }); continue }
    const sha = await postBlob(f.b64, p => onProgress && onProgress(.9 * (done + p * f.b64.length) / total));
    done += f.b64.length;
    entries.push({ path: f.path, mode: '100644', type: 'blob', sha });
  }
  for (let attempt = 1; ; attempt++) {           // blobs are reused; only tree/commit/ref retry on a race
    try {
      const ref = await api(`/repos/${repo}/git/ref/heads/${encodeURIComponent(branch)}`);
      const head = await api(`/repos/${repo}/git/commits/${ref.object.sha}`);
      const extra = [];
      if (rebuild) for (const f of await rebuild(ref.object.sha)) extra.push({ path: f.path, mode: '100644', type: 'blob', sha: await postBlob(f.b64) });
      const tree = await api(`/repos/${repo}/git/trees`, { method: 'POST', body: JSON.stringify({ base_tree: head.tree.sha, tree: [...entries, ...extra] }) });
      const commit = await api(`/repos/${repo}/git/commits`, { method: 'POST', body: JSON.stringify({ message, tree: tree.sha, parents: [ref.object.sha] }) });
      await api(`/repos/${repo}/git/refs/heads/${encodeURIComponent(branch)}`, { method: 'PATCH', body: JSON.stringify({ sha: commit.sha, force: false }) });
      onProgress && onProgress(1);
      return commit;
    } catch (e) {
      if (attempt < 4 && (e.status === 422 || e.status === 409)) { await new Promise(r => setTimeout(r, 600 * attempt)); continue }
      throw e;
    }
  }
}
function parsePlans(txt) {
  if (!txt) return [];
  let doc; try { doc = JSON.parse(txt) } catch { throw new Error('planner/plans.json in the repo is not valid JSON. Fix or remove it, then refresh.') }
  return (Array.isArray(doc && doc.plans) ? doc.plans : []).filter(p => p && typeof p.id === 'string');
}
// Read the latest plans at the branch head, change them, commit them together with any files.
async function savePlans(mutate, message, files = [], onProgress) {
  let result;
  await commitFiles(files, message, onProgress, async headSha => {
    result = mutate(parsePlans(await raw(PLANS, headSha)).map(p => ({ ...p })));
    const body = JSON.stringify({ version: 1, note: 'Written by the Super Sanatan app. Format: planner/README.md', plans: result }, null, 2) + '\n';
    return [{ path: PLANS, b64: b64utf8(body) }];
  });
  state.plans = result;
  return result;
}
function parseList(txt, key, path) {
  if (!txt) return [];
  let doc; try { doc = JSON.parse(txt) } catch { throw new Error(`${path} in the repo is not valid JSON. Fix or remove it, then refresh.`) }
  return (Array.isArray(doc && doc[key]) ? doc[key] : []).filter(x => x && typeof x.id === 'string');
}
async function saveBookmarks(mutate, message, files = []) {
  let result;
  await commitFiles(files, message, null, async headSha => {
    result = mutate(parseList(await raw(BOOKMARKS, headSha), 'bookmarks', BOOKMARKS).map(b => ({ ...b })));
    const body = JSON.stringify({ version: 1, note: 'Written by the Super Sanatan app. Bookmarks only; never sent to Claude. Format: planner/README.md', bookmarks: result }, null, 2) + '\n';
    return [{ path: BOOKMARKS, b64: b64utf8(body) }];
  });
  state.bookmarks = result;
  return result;
}
const blobUrls = new Map();
function refSrc(path, ver = '') {
  const key = path + '@' + ver;
  if (!blobUrls.has(key)) blobUrls.set(key, raw(path, null, true).then(b => b ? URL.createObjectURL(b) : null).catch(() => null));
  return blobUrls.get(key);
}
const fileB64 = blob => new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(',')[1]); fr.onerror = () => rej(fr.error); fr.readAsDataURL(blob) });
async function shrinkImage(file) {                    // big photos → ≤2000 px JPEG; GIFs and small files untouched
  if (file.type === 'image/gif') return file;
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
    if (scale === 1 && file.size < 3 * 1024 * 1024) { bmp.close && bmp.close(); return file }
    const c = document.createElement('canvas'); c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height); bmp.close && bmp.close();
    const out = await new Promise(r => c.toBlob(r, 'image/jpeg', JPEG_Q));
    return out ? new File([out], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' }) : file;
  } catch { return file }
}

// ── State ───────────────────────────────────────────────────────────────
const state = {
  today: istToday(), start: istToday(), panchang: null, plans: [], loaded: false,
  editing: null, draft: null, removed: new Set(), saving: false, progress: 0, formError: '', notice: '',
  view: 'calendar', bookmarks: [], bm: { file: null, preview: null, saving: false },
  artworks: [], aw: { files: [], saving: false }, creations: [], cr: { picked: [], files: [], format: '4:5', saving: false, revise: null },
  quotes: [], qt: { file: null, preview: null, saving: false },
};
const cleanRefs = refs => (Array.isArray(refs) ? refs : []).filter(r => r && ((r.type === 'text' && typeof r.text === 'string' && r.text.trim()) || (['image', 'video', 'pdf'].includes(r.type) && typeof r.path === 'string' && r.path.startsWith(REFS + '/'))));
const kindLabel = k => (KINDS.find(x => x[0] === k) || [null, 'Item'])[1];
// Claude prompt state on a plan: queued (Action running), done (text ready), error, or none.
function aiState(p) {
  const a = p && p.aiPrompt;
  if (!a || typeof a !== 'object') return { kind: 'none' };
  if (a.status === 'queued') {
    const age = Date.now() - Date.parse(a.requestedAt || 0);
    return { kind: age > AI_GIVE_UP_MS ? 'stuck' : 'queued', slow: age > AI_SLOW_MS };
  }
  if (a.status === 'error') return { kind: 'error', error: String(a.error || 'Unknown error') };
  if (a.status === 'done' && typeof a.text === 'string' && a.text.trim()) return { kind: 'done', text: a.text.trim(), suggestion: a.text.trim() !== String(p.mjPrompt || '').trim(), account: typeof a.account === 'string' ? a.account : '' };
  return { kind: 'none' };
}

// Step-by-step check of the connection. Each line says what worked or what to change.
async function probe(path, tok) {
  try {
    const r = await fetch(API + path, { headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', Authorization: 'Bearer ' + tok } });
    let json = null; try { json = await r.json() } catch {}
    return { status: r.status, json };
  } catch { return { status: 0 } }
}
async function diagnose(tok, repo, branch) {
  const lines = [];
  const user = await probe('/user', tok);
  if (user.status === 0) return [{ ok: false, text: 'Can’t reach GitHub from this phone. Check the internet connection (or turn off a VPN / data saver) and try again.' }];
  if (user.status === 401) return [{ ok: false, text: 'GitHub doesn’t accept this token: it is mistyped, expired or revoked. Make a new fine-grained token and paste it again. Paste it in one go; a line break or space inside the token breaks it.' }];
  if (user.status !== 200) return [{ ok: false, text: `GitHub answered ${user.status} when checking the token (${(user.json && user.json.message) || 'no details'}).` }];
  lines.push({ ok: true, text: `Token accepted by GitHub${user.json && user.json.login ? ' (@' + user.json.login + ')' : ''}.` });
  const r = await probe(`/repos/${repo}`, tok);
  if (r.status === 404) { lines.push({ ok: false, text: `This token can’t see ${repo}. GitHub → Settings → Developer settings → Fine-grained tokens → your token → Repository access: choose “Only select repositories” and tick Content-distribution (or “All repositories”). A token made for another repo, like Rupee Mechanics’, won’t work here.` }); return lines }
  if (r.status !== 200) { lines.push({ ok: false, text: `GitHub answered ${r.status} for ${repo} (${(r.json && r.json.message) || 'no details'}).` }); return lines }
  lines.push({ ok: true, text: `${repo} found.` });
  if (!r.json.permissions || !r.json.permissions.push) { lines.push({ ok: false, text: 'The token can read the repo but not write to it. In the token’s settings, Permissions → Repository permissions → Contents: set to “Read and write”, then Update.' }); return lines }
  lines.push({ ok: true, text: 'The token can write to the repo.' });
  const b = await probe(`/repos/${repo}/git/ref/heads/${encodeURIComponent(branch)}`, tok);
  if (b.status !== 200) { lines.push({ ok: false, text: `The branch “${branch}” wasn’t found (GitHub answered ${b.status}). It should be main.` }); return lines }
  lines.push({ ok: true, text: `Branch ${branch} found.` });
  return lines;
}
function storageWorks() {
  try { localStorage.setItem('ss.probe', '1'); const ok = localStorage.getItem('ss.probe') === '1'; localStorage.removeItem('ss.probe'); return ok } catch { return false }
}
const STORAGE_MSG = 'This browser won’t keep the token (a private or incognito window, an in-app browser such as WhatsApp or Instagram, or blocked site data), so the app would ask for it every time. Open https://arcbha.github.io/super-sanatan-app/ in a normal Chrome or Samsung Internet tab, connect there, then use Add to Home screen from that same browser.';
function reconnect() { store.del(K.tok); state.plans = []; state.loaded = false; closeEditor(); location.hash = ''; boot() }

async function loadAll(first) {
  msg('appMsg', '', first ? 'Loading from GitHub…' : '');
  try {
    const [pan, plans, bms, aws, crs, qts, acc] = await Promise.all([state.panchang ? null : raw(PANCHANG), raw(PLANS), raw(BOOKMARKS), raw(ARTWORKS), raw(CREATIONS), raw(QUOTES), raw(ACCOUNTS_FILE).catch(() => null)]);
    state.accounts = parseAccounts(acc);
    state.quotes = parseList(qts, 'quotes', QUOTES);
    state.bookmarks = parseList(bms, 'bookmarks', BOOKMARKS);
    state.artworks = parseList(aws, 'artworks', ARTWORKS);
    state.creations = parseList(crs, 'creations', CREATIONS);
    if (pan) {
      const p = JSON.parse(pan);
      const festivals = (p.major_festivals || []).filter(e => e && isDate(e.date));
      const lunar = [];
      for (const cat of LUNAR) for (const e of (p[cat] || [])) if (e && isDate(e.date)) lunar.push({ ...e, category: cat });
      state.panchang = { festivals, lunar, year: p.year };
    }
    if (!state.editing) state.plans = parsePlans(plans);
    state.loaded = true;
    msg('appMsg', '', state.notice); state.notice = '';
  } catch (e) {
    if ([401, 403, 404].includes(e.status)) {
      msg('appMsg', 'err', 'Checking the connection…');
      const c = cfg();
      msgList('appMsg', 'err', 'The app couldn’t open your content repo.', await diagnose(c.tok, c.repo, c.branch), { label: 'Reconnect with a new token', run: reconnect });
    } else msg('appMsg', 'err', e.message);
  }
  if (!state.editing) render();
  if (state.view === 'bookmarks') renderBookmarks();
  if (state.view === 'artwork') renderArtworks();
  if (state.view === 'create') renderCreate();
  if (state.view === 'quotes') renderQuotes();
  scheduleCreatePoll();
  takeShared();
  schedulePoll();
}

// While Claude is writing a prompt, re-read plans.json every few seconds until the Action has answered.
let pollTimer = null;
function schedulePoll() {
  if (pollTimer || !cfg().tok) return;
  if (!state.plans.some(p => aiState(p).kind === 'queued')) return;
  pollTimer = setTimeout(poll, POLL_MS);
}
async function poll() {
  pollTimer = null;
  if (document.visibilityState !== 'visible' || state.editing || state.saving) { schedulePoll(); return }
  try {
    const before = new Map(state.plans.map(p => [p.id, aiState(p).kind]));
    const plans = parsePlans(await raw(PLANS));
    if (state.editing || state.saving) { schedulePoll(); return }
    state.plans = plans;
    raw(ACCOUNTS_FILE).then(t => { state.accounts = parseAccounts(t) }).catch(() => {});
    for (const p of plans) {
      const k = aiState(p).kind;
      if (before.get(p.id) === 'queued' && k === 'done') msg('appMsg', 'ok', `Claude wrote the Midjourney prompt for “${p.title}”.`);
      if (before.get(p.id) === 'queued' && k === 'error') msg('appMsg', 'err', `Claude couldn't write a prompt for “${p.title}”. Open the plan to see why.`);
    }
    render();
  } catch { /* network blip: try again next tick */ }
  schedulePoll();
}

// ── Calendar ────────────────────────────────────────────────────────────
function observancesOn(date) {
  if (!state.panchang) return [];
  return [...state.panchang.festivals.filter(e => e.date === date).map(e => ({ ...e, kind: 'festival' })),
          ...state.panchang.lunar.filter(e => e.date === date).map(e => ({ ...e, kind: 'lunar' }))];
}
function rampsFor(date) {
  if (!state.panchang) return [];
  const out = [];
  for (const e of state.panchang.festivals) {
    const daysTo = diffDays(e.date, date);
    if (daysTo === 0 || daysTo < -RAMP_DOWN || daysTo > RAMP_UP) continue;
    const boost = rampBoost(e.tier, daysTo);
    if (boost > 0 && e.deity) out.push({ e, daysTo, boost });
  }
  return out;
}
function upcomingAfter(from, span) {
  if (!state.panchang) return [];
  const end = addDays(from, span);
  return [...state.panchang.festivals.map(e => ({ ...e, kind: 'festival' })), ...state.panchang.lunar.map(e => ({ ...e, kind: 'lunar' }))]
    .filter(e => e.date > from && e.date <= end).sort((a, b) => a.date.localeCompare(b.date));
}

function render() {
  state.today = istToday();
  const t = state.today, end = addDays(state.start, 3);
  $('todayLine').textContent = `${shortDate(state.start)} – ${shortDate(end)} ${end.slice(0, 4)} · Today is ${WEEKDAYS[jsDow(t)]}, ${longDate(t)} · IST`;
  $('todayBtn').setAttribute('aria-pressed', String(state.start === t));
  renderStats();
  $('days').replaceChildren(...[0, 1, 2, 3].map(i => dayCard(addDays(state.start, i))));
  renderAhead();
  renderDrawer();
}

function renderStats() {
  const days = [0, 1, 2, 3].map(i => addDays(state.start, i));
  const inView = state.plans.filter(p => days.includes(p.date));
  const count = s => inView.filter(p => p.status === s).length;
  const nextObs = upcomingAfter(addDays(state.today, -1), 60)[0];
  const stat = (label, value, foot, text) => h('div', { class: 'stat' }, h('div', { class: 'stat-label' }, label), h('div', { class: `stat-value${text ? ' text' : ''}` }, value), foot ? h('div', { class: 'stat-foot' }, foot) : null);
  $('stats').replaceChildren(
    stat('Plans in these 4 days', state.loaded ? String(inView.length) : '–', `${count('idea')} idea${count('idea') === 1 ? '' : 's'}`),
    stat('In progress', state.loaded ? String(count('making')) : '–', 'Status: Making'),
    stat('Ready to post', state.loaded ? String(count('ready')) : '–', `${count('posted')} posted`),
    stat('Next observance', nextObs ? nextObs.name : (state.panchang ? 'None in 60 days' : '–'), nextObs ? `${relLabel(diffDays(nextObs.date, state.today))} · ${shortDate(nextObs.date)}` : '', true));
}

function dayCard(date) {
  const rel = diffDays(date, state.today);
  const obs = observancesOn(date);
  const peaks = DEITIES.filter(d => PEAK_DAYS[d].includes(pyDow(date)));
  const lock = obs.find(o => o.kind === 'festival' && (o.tier === 'MEGA' || o.tier === 'MAJOR') && o.deity);
  const outOfRange = state.panchang && date.slice(0, 4) !== String(state.panchang.year);
  const obsSec = h('div', { class: 'sec' }, h('span', { class: 'sec-label' }, 'Panchang'));
  if (!state.panchang) obsSec.append(h('span', { class: 'quiet' }, state.loaded ? 'Festival dates unavailable.' : 'Loading…'));
  else if (outOfRange) obsSec.append(h('span', { class: 'quiet' }, `No panchang data for ${date.slice(0, 4)} yet.`));
  else if (!obs.length) obsSec.append(h('span', { class: 'quiet' }, 'No observance'));
  for (const o of obs) {
    const fest = o.kind === 'festival';
    const meta = [o.deity || 'No deity', o.theme ? `${o.theme} theme` : null, fest && o.content_mode === 'text_only' ? 'text-only post' : null, fest && TIER_BOOST[o.tier] ? `+${TIER_BOOST[o.tier]} boost` : null].filter(Boolean).join(' · ');
    obsSec.append(h('div', { class: 'obs' },
      h('span', { class: 'name' }, o.name, h('span', { class: `badge ${fest ? o.tier : 'lunar'}` }, fest ? (o.tier ? o.tier[0] + o.tier.slice(1).toLowerCase() : 'Festival') : LUNAR_LABEL[o.category])),
      h('span', { class: 'meta' }, meta)));
  }
  if (lock) obsSec.append(h('div', { class: 'ramp lock' }, `Deity locked to ${lock.deity}`));
  for (const r of rampsFor(date)) {
    const pct = Math.round(r.boost / TIER_BOOST[r.e.tier] * 100);
    const when = r.daysTo > 0 ? `${r.e.name} in ${r.daysTo} day${r.daysTo > 1 ? 's' : ''}` : `${r.e.name} ${-r.daysTo} day${r.daysTo < -1 ? 's' : ''} ago`;
    obsSec.append(h('div', { class: 'ramp' }, h('span', null, `${when} · ${r.e.deity} +${r.boost} (${pct}%)`),
      h('div', { class: 'ramp-bar', role: 'img', 'aria-label': `${pct}% of peak boost` }, h('span', { style: `width:${pct}%` }))));
  }
  const relBadge = rel === 0 ? h('span', { class: 'badge accent plain' }, 'Today') : rel === 1 ? h('span', { class: 'badge plain' }, 'Tomorrow') : null;
  return h('article', { class: `day${rel === 0 ? ' is-today' : ''}`, 'aria-label': `${WEEKDAYS[jsDow(date)]} ${longDate(date)}` },
    h('div', { class: 'day-head' },
      h('div', null, h('div', { class: 'day-name' }, `${WEEKDAYS[jsDow(date)]}, ${shortDate(date)}`), rel > 1 || rel < 0 ? h('div', { class: 'day-sub' }, relLabel(rel)) : null),
      relBadge),
    h('div', { class: 'day-body' },
      obsSec,
      h('div', { class: 'sec' }, h('span', { class: 'sec-label' }, 'Peak deities'), h('div', { class: 'chips' }, peaks.map(d => h('span', { class: 'chip' }, d)))),
      h('div', { class: 'sec' }, h('span', { class: 'sec-label' }, 'Plans'), plansBlock(date))));
}

function plansBlock(date) {
  const wrap = h('div', { class: 'plans' });
  const items = state.plans.filter(p => p.date === date)
    .sort((a, b) => (STATUS_RANK[a.status] ?? 9) - (STATUS_RANK[b.status] ?? 9) || String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
  for (const p of items) wrap.append(planRow(p));
  if (!items.length && !state.loaded) wrap.append(h('span', { class: 'quiet' }, 'Loading…'));
  if (state.loaded) wrap.append(h('button', { type: 'button', class: 'add-btn', onclick: () => openEditor(date, null) }, '+ Add plan'));
  return wrap;
}

function planRow(p) {
  const plats = (Array.isArray(p.platforms) ? p.platforms : []).map(x => (PLATFORMS.find(q => q[0] === x) || [x, x])[1]);
  const meta = [kindLabel(p.kind), p.deity, plats.join(', ')].filter(Boolean).join(' · ');
  const status = STATUSES.some(s => s[0] === p.status) ? p.status : 'idea';
  const open = () => { if (!state.saving) openEditor(p.date, p.id) };
  return h('div', { class: `plan tap ${status}`, role: 'button', tabindex: '0', onclick: open,
    onkeydown: e => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); open() } } },
    h('div', { class: 'plan-top' },
      h('span', { class: 'plan-title' }, String(p.title || 'Untitled')),
      h('button', { type: 'button', class: `badge ${status}`, title: 'Move to the next status', onclick: e => { e.stopPropagation(); cycleStatus(p, e.currentTarget) } }, STATUSES.find(s => s[0] === status)[1])),
    meta ? h('span', { class: 'plan-meta' }, meta) : null,
    p.notes ? h('span', { class: 'plan-meta' }, String(p.notes)) : null,
    aiChip(p), refStrip(p), planActions(p));
}
function aiChip(p) {
  const a = aiState(p);
  if (a.kind === 'queued') return h('span', { class: 'badge ai working' }, a.slow ? 'Claude is taking a while…' : 'Claude is writing…');
  if (a.kind === 'stuck') return h('span', { class: 'badge MEGA' }, 'Claude didn’t answer');
  if (a.kind === 'error') return h('span', { class: 'badge MEGA', title: a.error }, 'Claude prompt failed');
  if (a.kind === 'done' && a.suggestion) return h('span', { class: 'badge ai' }, 'New Claude suggestion');
  return null;
}

function thumb(r, small) {
  const cls = `thumb${small ? ' sm' : ''}`;
  if (r.pending) {
    const el = h('span', { class: cls, title: r.name });
    if (r.type === 'image') el.append(h('img', { src: r.preview, alt: r.name || 'Reference image' })); else el.textContent = r.type === 'video' ? 'Video' : 'PDF';
    return el;
  }
  const a = h('a', { class: cls, href: '#', title: r.name || r.path, onclick: async e => { e.preventDefault(); e.stopPropagation(); const u = await refSrc(r.path); if (u) window.open(u, '_blank') } });
  if (r.type === 'image') {
    a.textContent = '…';
    refSrc(r.path).then(u => { if (u) a.replaceChildren(h('img', { src: u, alt: r.name || 'Reference image' })); else a.textContent = 'Missing' });
  } else a.textContent = r.type === 'video' ? 'Video' : 'PDF';
  return a;
}
function refStrip(p) {
  const refs = cleanRefs(p.refs);
  if (!refs.length) return null;
  const media = refs.filter(r => r.type !== 'text'), notes = refs.length - media.length;
  return h('div', { class: 'ref-strip', onclick: e => e.stopPropagation() },
    media.slice(0, 5).map(r => thumb(r, true)),
    media.length > 5 ? h('span', { class: 'ref-count' }, `+${media.length - 5}`) : null,
    notes ? h('span', { class: 'ref-count' }, `${notes} text reference${notes > 1 ? 's' : ''}`) : null);
}
function planActions(p) {
  const prompt = typeof p.mjPrompt === 'string' ? p.mjPrompt.trim() : '';
  const link = safeUrl(p.mjLink);
  const box = h('div', { class: 'plan-actions', onclick: e => e.stopPropagation(), onkeydown: e => e.stopPropagation() });
  if (prompt) box.append(h('button', { type: 'button', class: 'mini', onclick: e => copyText(e.currentTarget, prompt, box, 'Copy MJ prompt') }, 'Copy MJ prompt'),
    h('a', { class: 'mini', href: 'https://www.midjourney.com/imagine', target: '_blank', rel: 'noopener noreferrer' }, 'Imagine ↗'));
  if (link) box.append(h('a', { class: 'mini', href: link, target: '_blank', rel: 'noopener noreferrer' }, 'Open generation ↗'));
  box.append(h('button', { type: 'button', class: 'mini', onclick: e => copyText(e.currentTarget, briefFor(p), box, 'Copy brief for Claude') }, 'Copy brief for Claude'));
  return box;
}
async function copyText(btn, text, box, label) {
  try {
    await navigator.clipboard.writeText(text);
    btn.textContent = 'Copied'; btn.classList.add('done');
    setTimeout(() => { btn.textContent = label; btn.classList.remove('done') }, 1800);
  } catch {
    box.querySelector('textarea.copy-fallback')?.remove();
    const ta = h('textarea', { class: 'copy-fallback', rows: '4', readonly: true, 'aria-label': label });
    ta.value = text; box.append(ta); ta.focus(); ta.select();
    btn.textContent = 'Select and copy';
  }
}
function briefFor(p) {
  const refs = cleanRefs(p.refs);
  const obs = isDate(p.date) ? observancesOn(p.date).map(o => o.name).join(', ') : '';
  return [
    `Make this Super Sanatan plan (id ${p.id}, stored in ${PLANS}):`,
    `- ${kindLabel(p.kind)}: ${p.title || 'Untitled'}`,
    `- Day: ${p.date}${isDate(p.date) ? ` (${WEEKDAYS[jsDow(p.date)]})` : ''}${obs ? ` · ${obs}` : ''}`,
    p.deity ? `- Deity: ${p.deity}` : null,
    Array.isArray(p.platforms) && p.platforms.length ? `- Platforms: ${p.platforms.join(', ')}` : null,
    p.notes ? `- Notes: ${p.notes}` : null,
    ...refs.filter(r => r.type === 'text').map(r => `- Text reference: ${r.text}`),
    ...refs.filter(r => r.type !== 'text').map(r => `- Reference ${r.type}: ${r.path}`),
    p.mjPrompt ? `- Midjourney prompt: ${p.mjPrompt}` : null,
    safeUrl(p.mjLink) ? `- Midjourney generation: ${safeUrl(p.mjLink)}` : null,
  ].filter(Boolean).join('\n');
}
function renderAhead() {
  const windowEnd = addDays(state.start, 3);
  const items = upcomingAfter(windowEnd, 21);
  $('aheadHint').textContent = !state.panchang ? (state.loaded ? 'Festival dates unavailable' : 'Loading…')
    : `${shortDate(addDays(windowEnd, 1))} – ${shortDate(addDays(windowEnd, 21))} · plan stills and reels ahead`;
  const rows = items.map(e => {
    const fest = e.kind === 'festival';
    return h('li', null,
      h('span', { class: 'ahead-when' }, `${WEEKDAYS[jsDow(e.date)].slice(0, 3)}, ${shortDate(e.date)}`, h('small', null, relLabel(diffDays(e.date, state.today)))),
      h('span', { class: 'ahead-what' }, e.name, h('small', null, [e.deity || 'No deity', e.theme ? `${e.theme} theme` : null, fest && e.content_mode === 'text_only' ? 'text-only' : null].filter(Boolean).join(' · '))),
      h('span', { class: `badge ${fest ? e.tier : 'lunar'}` }, fest ? e.tier[0] + e.tier.slice(1).toLowerCase() : LUNAR_LABEL[e.category]));
  });
  if (state.panchang && !rows.length) rows.push(h('li', null, h('span', { class: 'quiet', style: 'grid-column:1/-1' }, `No observances in this period in the ${state.panchang.year} panchang.`)));
  $('aheadList').replaceChildren(...rows);
}

// ── Editor ──────────────────────────────────────────────────────────────
function openEditor(date, id, preset) {
  dropPending();
  const p = id ? state.plans.find(x => x.id === id) : null;
  state.editing = { date, id };
  state.draft = p ? {
    title: String(p.title || ''), kind: p.kind || 'still', deity: p.deity || '', status: p.status || 'idea', date: isDate(p.date) ? p.date : date,
    platforms: Array.isArray(p.platforms) ? [...p.platforms] : [], notes: String(p.notes || ''), mjPrompt: String(p.mjPrompt || ''), mjLink: String(p.mjLink || ''),
    refs: cleanRefs(p.refs).map(r => ({ ...r })),
  } : { title: '', kind: 'still', deity: '', status: 'idea', date, platforms: ['instagram'], notes: '', mjPrompt: '', mjLink: '', refs: [], ...(preset || {}) };
  state.removed = new Set(); state.formError = '';
  render();
  const form = document.querySelector('form.plan-form');
  if (form) (p ? $('drawer').querySelector('.drawer-head button') : form.querySelector('input[name=title]'))?.focus({ preventScroll: true });
}
function dropPending() {
  if (state.draft) for (const r of state.draft.refs) if (r.pending && r.preview) URL.revokeObjectURL(r.preview);
}
function renderDrawer() {
  const dr = $('drawer'), sc = $('scrim');
  if (!state.editing) { dr.hidden = true; sc.hidden = true; document.body.classList.remove('locked'); dr.replaceChildren(); return }
  const d = state.draft, obs = observancesOn(d.date).map(o => o.name).join(', ');
  dr.replaceChildren(
    h('div', { class: 'drawer-head' },
      h('div', null, h('h2', { id: 'drawerTitle' }, state.editing.id ? 'Edit plan' : 'New plan'),
        h('p', null, `${WEEKDAYS[jsDow(d.date)]}, ${longDate(d.date)}${obs ? ' · ' + obs : ''}`)),
      h('button', { type: 'button', class: 'btn ghost sm', 'aria-label': 'Close', disabled: state.saving, onclick: closeEditor }, '✕')),
    planForm());
  dr.hidden = false; sc.hidden = false; document.body.classList.add('locked');
}
function closeEditor() {
  dropPending();
  state.editing = null; state.draft = null; state.removed = new Set(); state.formError = '';
  render();
}

function planForm() {
  const d = state.draft, fid = state.editing.id || 'new';
  const sync = form => {
    const fd = new FormData(form);
    for (const k of ['title', 'kind', 'deity', 'status', 'date', 'notes', 'mjPrompt', 'mjLink']) if (fd.has(k)) d[k] = String(fd.get(k));
    d.platforms = fd.getAll('platforms').map(String);
  };
  const refsBox = h('div', { class: 'sec' });
  const sel = (id, name, options, value) => h('select', { id, name }, options.map(([k, label]) => h('option', { value: k, selected: k === value }, label)));
  const form = h('form', { class: 'plan-form',
    oninput: e => sync(e.currentTarget), onchange: e => sync(e.currentTarget),
    onsubmit: e => { e.preventDefault(); sync(e.currentTarget); savePlan() },
    onpaste: e => { const files = [...(e.clipboardData?.files || [])]; if (files.length) { e.preventDefault(); addFiles(files, refsBox) } } },
    h('div', { class: 'form-body' },
      h('div', { class: 'form-section' },
        h('label', { class: 'field', for: `t-${fid}` }, 'Title', h('input', { type: 'text', id: `t-${fid}`, name: 'title', value: d.title, placeholder: 'e.g. Hanuman Chalisa Chaupai 20 still', maxlength: '140', required: true })),
        h('div', { class: 'row2' },
          h('label', { class: 'field', for: `k-${fid}` }, 'Type', sel(`k-${fid}`, 'kind', KINDS, d.kind)),
          h('label', { class: 'field', for: `d-${fid}` }, 'Deity', sel(`d-${fid}`, 'deity', [['', 'None'], ...DEITIES.map(x => [x, x])], d.deity))),
        h('div', { class: 'row2' },
          h('label', { class: 'field', for: `s-${fid}` }, 'Status', sel(`s-${fid}`, 'status', STATUSES, d.status)),
          h('label', { class: 'field', for: `dt-${fid}` }, 'Date', h('input', { type: 'date', id: `dt-${fid}`, name: 'date', value: d.date, required: true }))),
        h('div', { class: 'field' }, 'Platforms', h('div', { class: 'plat', role: 'group', 'aria-label': 'Platforms' }, PLATFORMS.map(([k, label]) => h('label', { for: `p-${fid}-${k}` },
          h('input', { type: 'checkbox', id: `p-${fid}-${k}`, name: 'platforms', value: k, checked: d.platforms.includes(k) }), label)))),
        h('label', { class: 'field', for: `n-${fid}` }, 'Notes', h('textarea', { id: `n-${fid}`, name: 'notes', rows: '3', maxlength: '1000', placeholder: 'Verse, caption idea, look…', value: d.notes }))),
      h('div', { class: 'form-section' }, h('div', { class: 'form-section-title' }, 'References'), refsBox),
      h('div', { class: 'form-section' },
        h('div', { class: 'form-section-title' }, 'Midjourney prompt',
          h('button', { type: 'button', class: 'btn ghost sm', onclick: () => { sync(form); const ta = form.querySelector('textarea[name=mjPrompt]'); ta.value = starterPrompt(); d.mjPrompt = ta.value; ta.focus() } }, 'Starter prompt')),
        aiPanel(() => form, sync),
        h('label', { class: 'field', for: `mp-${fid}` }, 'Prompt', h('textarea', { id: `mp-${fid}`, name: 'mjPrompt', rows: '3', maxlength: '4000', placeholder: 'Paste or write the /imagine prompt', value: d.mjPrompt })),
        h('label', { class: 'field', for: `ml-${fid}` }, 'Generation link', h('input', { type: 'url', id: `ml-${fid}`, name: 'mjLink', inputmode: 'url', value: d.mjLink, placeholder: 'https://www.midjourney.com/jobs/…' }))),
      state.formError ? h('div', { class: 'msg banner err', role: 'alert' }, state.formError) : null),
    h('div', { class: 'form-actions' },
      state.editing.id ? h('button', { type: 'button', class: 'btn danger', disabled: state.saving, onclick: e => { if (armTap(e.currentTarget, 'Tap again to delete')) deletePlan() } }, 'Delete') : h('span'),
      h('div', { class: 'right' },
        h('button', { type: 'button', class: 'btn', disabled: state.saving, onclick: closeEditor }, 'Cancel'),
        h('button', { type: 'submit', class: 'btn primary', disabled: state.saving }, state.saving ? `Saving… ${Math.round(state.progress * 100)}%` : state.editing.id ? 'Save changes' : 'Create plan'))));
  renderRefs(refsBox);
  return form;
}

function aiPanel(getForm, sync) {   // the form is still being built when this runs
  const plan = state.editing.id ? state.plans.find(x => x.id === state.editing.id) : null;
  const a = aiState(plan);
  const d = state.draft;
  const busy = a.kind === 'queued';
  const box = h('div', { class: 'ai-panel' },
    h('div', { class: 'ai-row' },
      h('div', { class: 'ai-copy' },
        h('div', { class: 'ai-title' }, icon(SPARK), 'Write with Claude'),
        h('div', { class: 'ai-sub' }, busy ? (a.slow ? 'Still working. If nothing arrives in a few minutes, check the Actions tab in Content-distribution.' : 'Claude is reading the references. This usually takes under a minute; you can close this panel.')
          : 'Claude looks at this plan’s reference art, written references, notes, deity and day, then writes the prompt. Saves the plan first.')),
      h('button', { type: 'button', class: 'btn claude sm', disabled: busy || state.saving, onclick: () => { sync(getForm()); savePlan({ ai: true }) } },
        busy ? h('span', { class: 'spinner', 'aria-hidden': 'true' }) : icon(SPARK), busy ? 'Writing…' : a.kind === 'done' ? 'Write again' : 'Write with Claude')));
  if (a.kind === 'done' && a.suggestion) {
    box.append(h('div', { class: 'ai-result' },
      h('div', { class: 'ai-result-label' }, 'Claude’s prompt' + (a.account ? ' · ' + a.account : '')),
      h('p', { class: 'ai-result-text' }, a.text),
      h('div', { class: 'ai-actions' },
        h('button', { type: 'button', class: 'btn primary sm', onclick: () => { const ta = getForm().querySelector('textarea[name=mjPrompt]'); ta.value = a.text; d.mjPrompt = a.text; box.querySelector('.ai-result')?.remove() } }, 'Use this prompt'),
        h('button', { type: 'button', class: 'btn sm', onclick: e => copyText(e.currentTarget, a.text, box, 'Copy') }, 'Copy'))));
  }
  if (a.kind === 'error' || a.kind === 'stuck') box.append(h('div', { class: 'msg banner err' }, a.kind === 'stuck' ? 'Claude didn’t answer. In Content-distribution, open Actions → “Planner — Claude prompt writer” to see why. Usually the Claude sign-in token is missing or expired: run `claude setup-token` and save it as the CLAUDE_CODE_OAUTH_TOKEN secret.' : `Claude couldn’t write a prompt: ${a.error}`));
  return box;
}

function renderRefs(box, note) {
  const d = state.draft, fid = state.editing.id || 'new';
  const media = d.refs.filter(r => r.type !== 'text'), texts = d.refs.filter(r => r.type === 'text');
  const remove = r => () => {
    d.refs = d.refs.filter(x => x !== r);
    if (r.pending && r.preview) URL.revokeObjectURL(r.preview);
    if (!r.pending && r.path) state.removed.add(r.path);
    renderRefs(box);
  };
  const input = h('input', { type: 'file', id: `f-${fid}`, multiple: true, accept: Object.keys(REF_TYPES).join(',') });
  input.addEventListener('change', () => { addFiles([...input.files], box); input.value = '' });
  const drop = h('div', { class: 'drop',
    ondragover: e => { e.preventDefault(); drop.classList.add('over') }, ondragleave: () => drop.classList.remove('over'),
    ondrop: e => { e.preventDefault(); drop.classList.remove('over'); addFiles([...(e.dataTransfer?.files || [])], box) } },
    input, h('label', { for: `f-${fid}`, class: 'btn sm', style: 'cursor:pointer' }, 'Upload files'),
    h('span', null, 'Drop or paste images, MP4/MOV or PDF. Files upload to the repo when you save.'));
  const noteBox = h('textarea', { class: 'plain-input', id: `tr-${fid}`, rows: '2', 'aria-label': 'Text reference', maxlength: '2000', placeholder: 'Describe a reference: look, verse, pose, colours, a link…' });
  const addNote = () => {
    const text = noteBox.value.trim();
    if (!text) { noteBox.focus(); return }
    if (d.refs.length >= MAX_REFS) { renderRefs(box, { err: true, text: `A plan can hold up to ${MAX_REFS} references.` }); return }
    d.refs.push({ type: 'text', text }); renderRefs(box); box.querySelector('textarea')?.focus();
  };
  box.replaceChildren(
    media.length ? h('div', { class: 'thumbs' }, media.map(r => h('span', { class: 'thumb-wrap' }, thumb(r, false), r.pending ? h('span', { class: 'new' }, 'NEW') : null,
      h('button', { type: 'button', class: 'x', 'aria-label': `Remove ${r.name || 'reference'}`, onclick: remove(r) }, '×')))) : '',
    drop,
    note ? h('span', { class: note.err ? 'msg err' : 'msg' }, note.text) : '',
    texts.length ? h('ul', { class: 'text-refs' }, texts.map(r => h('li', null, h('span', null, r.text), h('button', { type: 'button', class: 'rm', 'aria-label': 'Remove text reference', onclick: remove(r) }, '×')))) : '',
    h('div', { class: 'add-note' }, noteBox, h('button', { type: 'button', class: 'btn sm', onclick: addNote }, 'Add')));
}
function addFiles(files, box) {
  const d = state.draft, problems = [];
  for (const f of files) {
    const t = REF_TYPES[f.type];
    if (!t) { problems.push(`${f.name}: use a photo, MP4/MOV/WebM or PDF`); continue }
    if (f.size > MAX_FILE) { problems.push(`${f.name}: over 50 MB`); continue }
    if (d.refs.length >= MAX_REFS) { problems.push(`a plan can hold up to ${MAX_REFS} references`); break }
    d.refs.push({ type: t[0], pending: true, file: f, name: String(f.name || 'reference').slice(0, 120), preview: t[0] === 'image' ? URL.createObjectURL(f) : null });
  }
  renderRefs(box, problems.length ? { err: true, text: problems.join(' · ') } : null);
}
function starterPrompt() {
  const d = state.draft;
  const obs = observancesOn(d.date).find(o => o.kind === 'festival') || observancesOn(d.date)[0];
  const subject = [d.deity ? `Lord ${d.deity}` : 'Hindu deity', obs ? `for ${obs.name}` : null].filter(Boolean).join(' ');
  const texts = d.refs.filter(r => r.type === 'text').map(r => r.text).join(', ');
  return `${subject}, ${d.title ? d.title + ', ' : ''}${texts ? texts + ', ' : ''}devotional Indian art, divine glow, intricate ornaments, rich saffron and gold palette, cinematic lighting, highly detailed, space for text overlay --ar ${d.kind === 'reel' ? '9:16' : '4:5'} --style raw`;
}

function usedElsewhere(path, exceptId) { return state.plans.some(p => p.id !== exceptId && cleanRefs(p.refs).some(r => r.path === path)) }

async function savePlan(opts = {}) {
  if (state.saving) return;
  const d = state.draft, editingId = state.editing.id;
  const title = d.title.trim();
  if (!title) { state.formError = 'Add a short title.'; render(); return }
  if (!isDate(d.date)) { state.formError = 'Pick a day.'; render(); return }
  if (d.mjLink.trim() && !safeUrl(d.mjLink)) { state.formError = 'The generation link must start with https://'; render(); return }
  const id = editingId || newId();
  state.saving = true; state.progress = 0; state.formError = ''; render();
  try {
    const files = [], refs = [];
    for (const r of d.refs) {
      if (r.type === 'text') { refs.push({ type: 'text', text: r.text.trim() }); continue }
      if (!r.pending) { refs.push({ type: r.type, path: r.path, name: r.name || '' }); continue }
      const f = r.type === 'image' ? await shrinkImage(r.file) : r.file;
      const ext = (REF_TYPES[f.type] || REF_TYPES[r.file.type])[1];
      const path = `${REFS}/${id}/${stamp()}-${slugify(r.name.replace(/\.\w+$/, ''))}.${ext}`;
      files.push({ path, b64: await fileB64(f) });
      refs.push({ type: r.type, path, name: r.name });
    }
    for (const path of state.removed) if (!usedElsewhere(path, id)) files.push({ path, del: true });
    const now = new Date().toISOString();
    if (opts.ai) files.push({ path: `${REQUESTS}/${id}-${stamp()}.json`, b64: b64utf8(JSON.stringify({ planId: id, requestedAt: now }) + '\n') });
    const fields = { title, date: d.date, kind: d.kind, deity: d.deity, status: d.status, platforms: d.platforms, notes: d.notes.trim(), mjPrompt: d.mjPrompt.trim(), mjLink: d.mjLink.trim(), refs, updatedAt: now, ...(opts.ai ? { aiPrompt: { status: 'queued', requestedAt: now } } : {}) };
    const upload = files.filter(f => f.b64 && f.path.startsWith(REFS + '/')).length;
    await savePlans(plans => {
      const i = plans.findIndex(p => p.id === id);
      if (i >= 0) plans[i] = { ...plans[i], ...fields };
      else plans.push({ id, createdAt: now, ...fields });
      return plans;
    }, `planner: ${editingId ? 'update' : 'add'} "${title}" (${d.date})${upload ? ` with ${upload} reference file${upload > 1 ? 's' : ''}` : ''}${opts.ai ? ' + ask Claude for a prompt' : ''}`, files, p => { state.progress = p; const b = document.querySelector('form.plan-form button[type=submit]'); if (b) b.textContent = `Saving… ${Math.round(p * 100)}%` });
    state.saving = false;
    closeEditor();
    msg('appMsg', 'ok', opts.ai ? `Saved “${title}”. Claude is writing the prompt; it appears on the plan in about a minute.` : `Saved “${title}” to the repo.`);
    schedulePoll();
  } catch (e) {
    state.saving = false; state.formError = e.message || 'Couldn’t save. Try again.'; render();
  }
}
async function deletePlan() {
  const id = state.editing && state.editing.id;
  if (!id || state.saving) return;
  const p = state.plans.find(x => x.id === id);
  const files = cleanRefs(p && p.refs).filter(r => r.path && !usedElsewhere(r.path, id)).map(r => ({ path: r.path, del: true }));
  state.saving = true; render();
  try {
    await savePlans(plans => plans.filter(x => x.id !== id), `planner: delete "${(p && p.title) || id}"`, files);
    state.saving = false; closeEditor(); msg('appMsg', 'ok', 'Plan deleted.');
  } catch (e) { state.saving = false; state.formError = e.message; render() }
}
async function cycleStatus(p, btn) {
  if (state.saving) return;
  const order = STATUSES.map(s => s[0]);
  const next = order[(order.indexOf(p.status) + 1) % order.length];
  state.saving = true; btn.disabled = true; btn.textContent = '…';
  try {
    await savePlans(plans => plans.map(x => x.id === p.id ? { ...x, status: next, updatedAt: new Date().toISOString() } : x), `planner: "${p.title}" → ${next}`);
  } catch (e) { msg('appMsg', 'err', e.message) }
  state.saving = false; if (!state.editing) render();
}

// ── Shared links (Android Share menu / iPhone Shortcut: ?url= ?text= ?title=) ──
(function readShare() {
  const q = new URLSearchParams(location.search);
  const url = q.get('url') || '', text = q.get('text') || '', title = q.get('title') || '';
  if (!url && !text && !title) return;
  store.set(K.share, JSON.stringify({ url, text, title }));
  history.replaceState(null, '', location.pathname);
})();
function takeShared() {
  if (!state.loaded) return;
  let sh; try { sh = JSON.parse(store.get(K.share) || 'null') } catch { sh = null }
  if (!sh) return;
  store.del(K.share);
  const link = cleanUrl(findUrl(sh.url) || findUrl(sh.text) || '');
  const rest = String(sh.text || '').replace(/https?:\/\/\S+/g, '').trim();
  const note = [sh.title, rest].filter(Boolean).join(' — ').slice(0, 300);
  if (state.editing && !state.saving) closeEditor();
  if (location.hash !== '#bookmarks') location.hash = '#bookmarks'; else applyView();
  $('bmUrl').value = link; $('bmNote').value = note;
  bmMsg('ok', 'Shared link ready. Add a note if you like, then tap Save.');
  $('bmSave').focus({ preventScroll: true });
}

// ── Bookmarks: a plain shelf of links and screenshots (never sent to Claude) ──
const SITES = [[/(^|\.)instagram\.com$|(^|\.)instagr\.am$/, 'Instagram'], [/(^|\.)youtube\.com$|(^|\.)youtu\.be$/, 'YouTube'], [/(^|\.)pinterest\.[a-z.]+$|(^|\.)pin\.it$/, 'Pinterest'],
  [/(^|\.)x\.com$|(^|\.)twitter\.com$/, 'X'], [/(^|\.)facebook\.com$|(^|\.)fb\.watch$/, 'Facebook'], [/(^|\.)tiktok\.com$/, 'TikTok'], [/(^|\.)behance\.net$/, 'Behance'], [/(^|\.)artstation\.com$/, 'ArtStation']];
function findUrl(text) {
  const t = String(text || '').trim();
  const m = t.match(/https?:\/\/[^\s<>"']+/i);
  if (m) return m[0].replace(/[),.;!?]+$/, '');
  if (/^(www\.)?[\w-]+(\.[\w-]+)+(\/\S*)?$/i.test(t)) return 'https://' + t;
  return '';
}
function cleanUrl(u) {
  if (!u) return '';
  try {
    const url = new URL(u);
    for (const k of [...url.searchParams.keys()]) if (/^(utm_|igsh|igshid|si$|feature$|fbclid|mibextid)/i.test(k)) url.searchParams.delete(k);
    return url.toString();
  } catch { return '' }
}
function sourceOf(u) {
  try { const host = new URL(u).hostname.replace(/^www\.|^m\./, ''); return (SITES.find(([re]) => re.test(host)) || [null, host])[1] } catch { return '' }
}
function ytId(u) {
  try {
    const url = new URL(u), host = url.hostname.replace(/^www\.|^m\./, '');
    const id = host === 'youtu.be' ? url.pathname.slice(1) : url.searchParams.get('v') || (url.pathname.match(/^\/(shorts|live|embed)\/([\w-]{11})/) || [])[2];
    return /^[\w-]{11}$/.test(id || '') ? id : '';
  } catch { return '' }
}
const isVideoLink = u => /\/(reel|reels|shorts|video|videos|watch|tv)\b|youtu\.be|tiktok\.com|fb\.watch/i.test(u || '');
const istDate = iso => { try { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date(iso)) } catch { return '' } };
function bmMsg(kind, text) { msg('bmMsg', kind, text) }

function stageShot(file) {
  if (!file || !/^image\/(png|jpeg|webp|gif)$/.test(file.type)) { bmMsg('err', 'Screenshots can be PNG, JPEG, WebP or GIF.'); return }
  if (file.size > MAX_FILE) { bmMsg('err', 'That image is over 50 MB.'); return }
  const bm = state.bm;
  if (bm.preview) URL.revokeObjectURL(bm.preview);
  bm.file = file; bm.preview = URL.createObjectURL(file);
  const box = $('bmShot');
  box.replaceChildren(h('img', { src: bm.preview, alt: 'Screenshot to save' }),
    h('span', { class: 'quiet' }, 'Screenshot added'),
    h('button', { type: 'button', class: 'btn ghost sm', onclick: clearShot }, 'Remove'));
  box.classList.remove('hide');
  bmMsg('', '');
  $('bmNote').focus({ preventScroll: true });
}
function clearShot() {
  const bm = state.bm;
  if (bm.preview) URL.revokeObjectURL(bm.preview);
  bm.file = null; bm.preview = null;
  $('bmShot').replaceChildren(); $('bmShot').classList.add('hide');
}

async function saveBookmark() {
  const bm = state.bm;
  if (bm.saving) return;
  const raw_ = $('bmUrl').value.trim(), note = $('bmNote').value.trim();
  const url = cleanUrl(findUrl(raw_));
  if (raw_ && !url) { bmMsg('err', 'That doesn’t look like a link. It should start with https://'); return }
  if (!url && !bm.file) { bmMsg('err', 'Paste a link or add a screenshot first.'); $('bmUrl').focus(); return }
  const dupe = url && state.bookmarks.find(b => b.url === url);
  if (dupe) { bmMsg('err', `That link is already saved (${shortDate(istDate(dupe.createdAt))}).`); return }
  const id = 'bm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  bm.saving = true; $('bmSave').disabled = true; $('bmSave').textContent = 'Saving…';
  try {
    const files = []; let image = '';
    if (bm.file) {
      const f = await shrinkImage(bm.file);
      image = `${BM_DIR}/${id}.${(REF_TYPES[f.type] || REF_TYPES[bm.file.type])[1]}`;
      files.push({ path: image, b64: await fileB64(f) });
    }
    const source = url ? sourceOf(url) : '';
    const entry = { id, ...(url ? { url, source } : {}), ...(image ? { image } : {}), note, createdAt: new Date().toISOString() };
    await saveBookmarks(list => [entry, ...list], `planner: bookmark ${source || 'screenshot'}${note ? ` — ${note.slice(0, 50)}` : ''}`, files);
    $('bmUrl').value = ''; $('bmNote').value = ''; clearShot();
    bmMsg('ok', 'Saved to bookmarks.');
    renderBookmarks();
  } catch (e) { bmMsg('err', e.message || 'Couldn’t save. Try again.') }
  bm.saving = false; $('bmSave').disabled = false; $('bmSave').textContent = 'Save';
}
async function deleteBookmark(b) {
  if (state.bm.saving) return;
  state.bm.saving = true;
  try {
    await saveBookmarks(list => list.filter(x => x.id !== b.id), `planner: remove bookmark ${b.source || 'screenshot'}`, b.image ? [{ path: b.image, del: true }] : []);
    bmMsg('ok', 'Bookmark removed.');
  } catch (e) { bmMsg('err', e.message) }
  state.bm.saving = false;
  renderBookmarks();
}

function renderBookmarks() {
  const q = '';
  const all = state.bookmarks;
  const list = q ? all.filter(b => [b.note, b.url, b.source].some(v => String(v || '').toLowerCase().includes(q))) : all;
  if (!state.loaded) { $('bmList').replaceChildren(); return }
  if (!list.length) {
    $('bmList').replaceChildren(h('div', { class: 'bm-empty' }, q ? 'No bookmarks match that search.' : 'No bookmarks yet. Paste a link or a screenshot above to save your first one.'));
    return;
  }
  $('bmList').replaceChildren(...list.map(bmCard));
}
function bmCard(b) {
  const url = safeUrl(b.url), yt = url ? ytId(url) : '';
  const label = b.note || b.source || 'Bookmark';
  const tile = () => h('div', { class: 'site' }, h('b', null, (b.source || '?').slice(0, 1).toUpperCase()), b.source || 'Link');
  const media = url
    ? h('a', { class: 'bm-media', href: url, target: '_blank', rel: 'noopener noreferrer', 'aria-label': `Open ${label}` })
    : h('a', { class: 'bm-media', href: '#', 'aria-label': `View screenshot: ${label}`, onclick: async e => { e.preventDefault(); const u = await refSrc(b.image); if (u) window.open(u, '_blank') } });
  if (b.image) {
    media.textContent = '…';
    refSrc(b.image).then(u => media.replaceChildren(u ? h('img', { src: u, alt: label, loading: 'lazy' }) : tile(), url && isVideoLink(url) ? h('span', { class: 'play' }, '▶ Video') : ''));
  } else if (yt) {
    const img = h('img', { src: `https://i.ytimg.com/vi/${yt}/hqdefault.jpg`, alt: label, loading: 'lazy', referrerpolicy: 'no-referrer' });
    img.addEventListener('error', () => img.replaceWith(tile()), { once: true });
    media.append(img);
  } else media.append(tile());
  if (!b.image && url && isVideoLink(url)) media.append(h('span', { class: 'play' }, '▶ Video'));
  const d = istDate(b.createdAt);
  return h('article', { class: 'bm-card' }, media,
    h('div', { class: 'bm-body' },
      h('div', { class: 'bm-meta' }, h('span', { class: 'badge plain' }, b.source || 'Screenshot'), d ? h('span', null, shortDate(d)) : null),
      b.note ? h('div', { class: 'bm-note' }, b.note) : null,
      url ? h('div', { class: 'bm-url', title: url }, url.replace(/^https?:\/\/(www\.)?/, '')) : null,
      h('div', { class: 'bm-actions' },
        url ? h('a', { class: 'mini', href: url, target: '_blank', rel: 'noopener noreferrer' }, 'Open ↗') : null,
        url ? h('button', { type: 'button', class: 'mini', onclick: e => copyText(e.currentTarget, url, e.currentTarget.parentElement, 'Copy link') }, 'Copy link') : null,
        h('button', { type: 'button', class: 'btn danger', onclick: e => { if (armTap(e.currentTarget, 'Tap again')) deleteBookmark(b) } }, 'Delete'))));
}

function applyView() {
  const on = !!cfg().tok;
  const h = location.hash.replace('#', '');
  state.view = ['create', 'artwork', 'bookmarks', 'quotes'].includes(h) ? h : 'calendar';
  const show = v => on && state.view === v;
  for (const id of ['pageHead', 'stats', 'days', 'ahead']) $(id).classList.toggle('hide', !show('calendar'));
  $('createView').classList.toggle('hide', !show('create'));
  $('artworkView').classList.toggle('hide', !show('artwork'));
  $('bookmarksView').classList.toggle('hide', !show('bookmarks'));
  $('quotesView').classList.toggle('hide', !show('quotes'));
  for (const [id, v] of [['tabCalendar', 'calendar'], ['tabCreate', 'create'], ['tabArtwork', 'artwork'], ['tabBookmarks', 'bookmarks'], ['tabQuotes', 'quotes']]) { if (state.view === v) $(id).setAttribute('aria-current', 'page'); else $(id).removeAttribute('aria-current') }
  if (show('bookmarks')) renderBookmarks();
  if (show('artwork')) renderArtworks();
  if (show('create')) renderCreate();
  if (show('quotes')) renderQuotes();
}
window.addEventListener('hashchange', () => {
  if (state.editing && !state.saving) closeEditor();
  applyView(); window.scrollTo(0, 0);
  if (state.swipeDir) {                      // slide the new tab in from the side it came from
    const box = document.querySelector('main.page .container');
    box.classList.remove('swipe-left', 'swipe-right'); void box.offsetWidth;
    box.classList.add('swipe-' + state.swipeDir); state.swipeDir = '';
    setTimeout(() => box.classList.remove('swipe-left', 'swipe-right'), 260);
  }
});
// ── Swipe left / right to move between tabs (phones) ─────────────────────
const tabOrder = () => [...document.querySelectorAll('.tabs a')].map(a => a.getAttribute('href'));
function scrollsSideways(el) {
  for (; el && el !== document.body; el = el.parentElement) {
    const ox = getComputedStyle(el).overflowX;
    if ((ox === 'auto' || ox === 'scroll') && el.scrollWidth > el.clientWidth + 2) return true;
  }
  return false;
}
let swipe = null;
document.addEventListener('touchstart', e => {
  swipe = null;
  if (e.touches.length !== 1 || state.editing || !cfg().tok || !$('drawer').hidden) return;
  const t = e.touches[0];
  if (t.clientX < 24 || t.clientX > window.innerWidth - 24) return;          // screen edges belong to the phone's back gesture
  const field = e.target.closest('input, textarea, select, [contenteditable="true"]');
  if ((field && (field === document.activeElement || field.type === 'range')) || e.target.closest('.no-swipe') || scrollsSideways(e.target)) return;   // only the field you're typing in keeps the swipe
  swipe = { x: t.clientX, y: t.clientY, at: Date.now() };
}, { passive: true });
document.addEventListener('touchend', e => {
  if (!swipe) return;
  const t = e.changedTouches[0], dx = t.clientX - swipe.x, dy = t.clientY - swipe.y, dt = Date.now() - swipe.at;
  swipe = null;
  if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.7 || dt > 900) return;   // mostly sideways, quick, far enough
  if (String(window.getSelection && window.getSelection()).length) return;         // selecting text, not swiping
  const order = tabOrder(), cur = order.indexOf('#' + state.view), next = cur + (dx < 0 ? 1 : -1);
  if (cur < 0 || next < 0 || next >= order.length) return;
  state.swipeDir = dx < 0 ? 'left' : 'right';
  location.hash = order[next];
}, { passive: true });
document.addEventListener('touchcancel', () => { swipe = null }, { passive: true });
$('bmSave').onclick = saveBookmark;
for (const id of ['bmUrl', 'bmNote']) $(id).addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); saveBookmark() } });
$('bmFile').addEventListener('change', e => { const f = e.target.files[0]; if (f) stageShot(f); e.target.value = '' });
$('bmPaste').onclick = async () => {
  try {
    if (navigator.clipboard && navigator.clipboard.read) {
      for (const item of await navigator.clipboard.read()) {
        const t = item.types.find(x => /^image\/(png|jpeg|webp|gif)$/.test(x));
        if (t) { const blob = await item.getType(t); stageShot(new File([blob], 'screenshot.' + t.split('/')[1], { type: t })); return }
      }
    }
  } catch { /* fall through to text */ }
  try {
    const u = findUrl(await navigator.clipboard.readText());
    if (u) { $('bmUrl').value = cleanUrl(u) || u; bmMsg('', ''); $('bmNote').focus({ preventScroll: true }); return }
    bmMsg('err', 'The clipboard has no link or image. Copy one first, or tap Screenshot.');
  } catch { bmMsg('err', 'Your browser didn’t allow reading the clipboard. Long-press the link box and choose Paste.') }
};
const drop = $('bmDrop');
drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('over') });
drop.addEventListener('dragleave', () => drop.classList.remove('over'));
drop.addEventListener('drop', e => {
  e.preventDefault(); drop.classList.remove('over');
  const f = [...(e.dataTransfer?.files || [])].find(x => x.type.startsWith('image/'));
  if (f) return stageShot(f);
  const u = findUrl(e.dataTransfer?.getData('text/uri-list') || e.dataTransfer?.getData('text/plain'));
  if (u) $('bmUrl').value = cleanUrl(u) || u;
});
// Paste a screenshot (or a link) anywhere on the Bookmarks page.
document.addEventListener('paste', e => {
  if (['artwork', 'create', 'quotes'].includes(state.view) && !state.editing && cfg().tok) {
    const imgs = [...(e.clipboardData?.files || [])].filter(x => x.type.startsWith('image/'));
    if (imgs.length) { e.preventDefault(); if (state.view === 'artwork') stageArtworks(imgs); else if (state.view === 'create') stageCreateRefs(imgs); else stageQuoteShot(imgs[0]) }
    return;
  }
  if (state.view !== 'bookmarks' || state.editing || !cfg().tok) return;
  const f = [...(e.clipboardData?.files || [])].find(x => x.type.startsWith('image/'));
  if (f) { e.preventDefault(); stageShot(f); return }
  const text = e.clipboardData?.getData('text') || '';
  const u = findUrl(text);
  if (!u) return;
  if (e.target === $('bmUrl') || !e.target.closest('input, textarea')) { e.preventDefault(); $('bmUrl').value = cleanUrl(u) || u; $('bmNote').focus({ preventScroll: true }) }
});


// ── Shared JSON list saver (artworks, creations) ────────────────────────
async function saveDoc(path, key, mutate, message, files = [], onProgress) {
  let result;
  await commitFiles(files, message, onProgress, async headSha => {
    result = mutate(parseList(await raw(path, headSha), key, path).map(x => ({ ...x })));
    const body = JSON.stringify({ version: 1, note: 'Written by the Super Sanatan app. Format: planner/README.md', [key]: result }, null, 2) + '\n';
    return [{ path, b64: b64utf8(body) }];
  });
  state[key] = result;
  return result;
}
const deityOptions = (el, none) => el.replaceChildren(h('option', { value: '' }, none), ...DEITIES.map(d => h('option', { value: d }, d)));

// ── Artwork: saved artwork to replicate or draw inspiration from ─────────
function stageArtworks(files) {
  const ok = files.filter(f => /^image\/(png|jpeg|webp|gif)$/.test(f.type) && f.size <= MAX_FILE);
  if (ok.length < files.length) msg('awMsg', 'err', 'Some files were skipped: use PNG, JPEG, WebP or GIF under 50 MB.'); else msg('awMsg', '', '');
  for (const f of ok.slice(0, 12 - state.aw.files.length)) state.aw.files.push({ file: f, preview: URL.createObjectURL(f) });
  renderStaged();
}
function renderStaged() {
  const box = $('awStaged');
  box.replaceChildren(...state.aw.files.map((x, i) => h('span', { class: 'thumb-wrap' }, h('img', { src: x.preview, alt: 'Artwork to save' }),
    h('button', { type: 'button', class: 'x', 'aria-label': 'Remove this image', onclick: () => { URL.revokeObjectURL(x.preview); state.aw.files.splice(i, 1); renderStaged() } }, '×'))));
  box.classList.toggle('hide', !state.aw.files.length);
  $('awSave').textContent = state.aw.files.length > 1 ? `Save ${state.aw.files.length} artworks` : 'Save artwork';
}
async function saveArtworks() {
  const aw = state.aw;
  if (aw.saving) return;
  if (!aw.files.length) { msg('awMsg', 'err', 'Add an image first: choose, paste or drop one.'); return }
  const url = $('awUrl').value.trim() ? cleanUrl(findUrl($('awUrl').value)) : '';
  if ($('awUrl').value.trim() && !url) { msg('awMsg', 'err', 'The source link should start with https://'); return }
  const deity = $('awDeity').value, note = $('awNote').value.trim();
  aw.saving = true; $('awSave').disabled = true; $('awSave').textContent = 'Saving…';
  try {
    const files = [], entries = [], now = new Date().toISOString();
    for (const x of aw.files) {
      const f = await shrinkImage(x.file);
      const id = 'aw' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
      const image = `${AW_DIR}/${id}.${(REF_TYPES[f.type] || REF_TYPES[x.file.type])[1]}`;
      files.push({ path: image, b64: await fileB64(f) });
      entries.push({ id, image, title: x.file.name.replace(/\.\w+$/, '').slice(0, 80), ...(deity ? { deity } : {}), ...(note ? { note } : {}), ...(url ? { url } : {}), createdAt: now });
    }
    await saveDoc(ARTWORKS, 'artworks', list => [...entries, ...list], `planner: save ${entries.length} artwork${entries.length > 1 ? 's' : ''}${deity ? ' (' + deity + ')' : ''}`, files,
      p => { $('awSave').textContent = `Saving… ${Math.round(p * 100)}%` });
    for (const x of aw.files) URL.revokeObjectURL(x.preview);
    aw.files = []; renderStaged(); $('awNote').value = ''; $('awUrl').value = '';
    msg('awMsg', 'ok', `Saved ${entries.length} artwork${entries.length > 1 ? 's' : ''}.`);
    renderArtworks();
  } catch (e) { msg('awMsg', 'err', e.message || 'Couldn’t save. Try again.') }
  aw.saving = false; $('awSave').disabled = false; renderStaged();
}
async function deleteArtwork(a) {
  try {
    await saveDoc(ARTWORKS, 'artworks', list => list.filter(x => x.id !== a.id), `planner: delete artwork ${a.title || a.id}`, a.image ? [{ path: a.image, del: true }] : []);
    state.cr.picked = state.cr.picked.filter(id => id !== a.id);
    msg('awMsg', 'ok', 'Artwork deleted.');
  } catch (e) { msg('awMsg', 'err', e.message) }
  renderArtworks();
}
function artImg(path, alt, ver) {
  const box = h('div', { class: 'art-img' }, '…');
  refSrc(path, ver).then(u => box.replaceChildren(u ? h('img', { src: u, alt, loading: 'lazy' }) : 'Missing'));
  return box;
}
function renderArtworks() {
  if (!state.loaded) { $('awList').replaceChildren(); return }
  if (!state.artworks.length) { $('awList').replaceChildren(h('div', { class: 'empty' }, 'No artwork saved yet. Add the pieces you want to replicate or draw inspiration from.')); return }
  $('awList').replaceChildren(...state.artworks.map(a => {
    const url = safeUrl(a.url), d = istDate(a.createdAt);
    return h('article', { class: 'art-card' }, artImg(a.image, a.title || 'Artwork'),
      h('div', { class: 'art-body' },
        h('div', { class: 'art-title' }, a.deity || a.title || 'Artwork'),
        a.note ? h('div', { class: 'art-meta' }, a.note) : null,
        h('div', { class: 'art-meta' }, [d ? shortDate(d) : null, url ? sourceOf(url) : null].filter(Boolean).join(' · ')),
        h('div', { class: 'art-actions' },
          h('button', { type: 'button', class: 'mini go', onclick: () => { state.cr.picked = [a.id]; if (a.deity) $('crDeity').value = a.deity; location.hash = '#create' } }, 'Get MJ prompt'),
          url ? h('a', { class: 'mini', href: url, target: '_blank', rel: 'noopener noreferrer' }, 'Source ↗') : null,
          h('button', { type: 'button', class: 'btn danger', onclick: e => { if (armTap(e.currentTarget, 'Tap again')) deleteArtwork(a) } }, 'Delete'))));
  }));
}

// ── Create: reference work + ask → Claude writes a Midjourney prompt (images are made in Midjourney) ─
const FORMAT_LABEL = { '4:5': 'Post 4:5', '1:1': 'Square 1:1', '9:16': 'Story 9:16', '16:9': 'Wide 16:9' };
const MJ_IMAGINE = 'https://www.midjourney.com/imagine';
function stageCreateRefs(files) {
  const cr = state.cr;
  const ok = files.filter(f => /^image\/(png|jpeg|webp|gif)$/.test(f.type) && f.size <= MAX_FILE);
  if (ok.length < files.length) msg('crMsg', 'err', 'Some files were skipped: use PNG, JPEG, WebP or GIF under 50 MB.'); else msg('crMsg', '', '');
  const room = MAX_CR_IMAGES - cr.files.length - cr.picked.length;
  if (ok.length > room) msg('crMsg', 'err', `Up to ${MAX_CR_IMAGES} images in all (uploads plus saved artwork).`);
  for (const f of ok.slice(0, Math.max(0, room))) cr.files.push({ file: f, preview: URL.createObjectURL(f), note: '' });
  renderCrStaged();
}
function renderCrStaged() {
  const box = $('crStaged'), cr = state.cr;
  box.replaceChildren(...cr.files.map((x, i) => h('div', { class: 'cr-ref' },
    h('span', { class: 'thumb-wrap' }, h('img', { src: x.preview, alt: 'Reference work' }),
      h('button', { type: 'button', class: 'x', 'aria-label': 'Remove this image', onclick: () => { URL.revokeObjectURL(x.preview); cr.files.splice(i, 1); renderCrStaged() } }, '×')),
    h('input', { type: 'text', class: 'cr-ref-note', maxlength: '200', placeholder: 'What to take from it (optional)', 'aria-label': 'What to take from this image', value: x.note, oninput: e => { x.note = e.target.value } }))));
  box.classList.toggle('hide', !cr.files.length);
}
function renderCreate() {
  const cr = state.cr;
  cr.picked = cr.picked.filter(id => state.artworks.some(a => a.id === id));
  $('crPicked').textContent = cr.picked.length ? `${cr.picked.length} picked` : 'optional';
  if (!state.loaded) $('crPick').replaceChildren(h('div', { class: 'pick-empty' }, 'Loading…'));
  else if (!state.artworks.length) $('crPick').replaceChildren(h('div', { class: 'pick-empty' }, h('span', null, 'No saved artwork yet. That’s fine: upload reference work above.'), h('a', { class: 'mini', href: '#artwork' }, 'Artwork library')));
  else $('crPick').replaceChildren(...state.artworks.map(a => {
    const on = cr.picked.includes(a.id);
    const b = h('button', { type: 'button', class: 'pick', 'aria-pressed': String(on), 'aria-label': `${on ? 'Unpick' : 'Pick'} ${a.deity || a.title || 'artwork'}`,
      onclick: () => {
        if (on) cr.picked = cr.picked.filter(x => x !== a.id);
        else if (cr.picked.length + cr.files.length < MAX_CR_IMAGES) { cr.picked.push(a.id); if (a.deity && !$('crDeity').value) $('crDeity').value = a.deity }
        else msg('crMsg', 'err', `Up to ${MAX_CR_IMAGES} images in all (uploads plus saved artwork).`);
        renderCreate();
      } }, h('span', { class: 'tick', 'aria-hidden': 'true' }, on ? '✓' : ''));
    refSrc(a.image).then(u => { if (u) b.prepend(h('img', { src: u, alt: '' })) });
    return b;
  }));
  for (const btn of document.querySelectorAll('.segmented.fmt button')) btn.setAttribute('aria-pressed', String(btn.dataset.fmt === cr.format));
  renderCrStaged();
  renderCreations();
}
const crRequest = (id, mode, now) => ({ path: `${CREATE_REQ}/${id}-${stamp()}.json`, b64: b64utf8(JSON.stringify({ creationId: id, mode, requestedAt: now }) + '\n') });
async function askForPrompt() {
  const cr = state.cr;
  if (cr.saving) return;
  const ask = $('crAsk').value.trim(), deity = $('crDeity').value, text = $('crNotes').value.trim(), date = $('crDate').value;
  if (!cr.files.length && !cr.picked.length && !text && !ask) { msg('crMsg', 'err', 'Add reference work (an image or a written note) or describe the image you want.'); return }
  if (!ask && !deity && !cr.files.length && !cr.picked.length) { msg('crMsg', 'err', 'Describe the image, or at least choose a deity.'); $('crAsk').focus(); return }
  const id = 'cr' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), now = new Date().toISOString();
  cr.saving = true; $('crGo').disabled = true; $('crGo').textContent = 'Sending…';
  try {
    const files = [], refs = [];
    for (const x of cr.files) {
      const f = await shrinkImage(x.file);
      const ext = (REF_TYPES[f.type] || REF_TYPES[x.file.type])[1];
      const path = `${CR_DIR}/${id}/refs/${stamp()}-${slugify(x.file.name.replace(/\.\w+$/, ''))}.${ext}`;
      files.push({ path, b64: await fileB64(f) });
      refs.push({ type: 'image', path, name: String(x.file.name || 'reference').slice(0, 120), ...(x.note.trim() ? { note: x.note.trim().slice(0, 200) } : {}) });
    }
    if (text) refs.push({ type: 'text', text });
    const entry = { id, refs, ...(cr.picked.length ? { artworkIds: [...cr.picked] } : {}), ...(deity ? { deity } : {}), ...(isDate(date) ? { date } : {}), ask,
      format: cr.format, textSpace: $('crText').checked, status: 'queued', files: files.map(f => f.path), requestedAt: now, createdAt: now };
    await saveDoc(CREATIONS, 'creations', list => [entry, ...list], `planner: Midjourney prompt request ${deity || ''} — ${(ask || text || 'from reference work').slice(0, 50)}`,
      [...files, crRequest(id, 'full', now)], p => { $('crGo').textContent = `Sending… ${Math.round(p * 100)}%` });
    for (const x of cr.files) URL.revokeObjectURL(x.preview);
    cr.files = []; cr.picked = []; $('crAsk').value = ''; $('crNotes').value = '';
    msg('crMsg', 'ok', 'Sent. Claude is studying your reference work and writing the Midjourney prompt; usually under a minute. You can leave this page.');
    renderCreate(); scheduleCreatePoll();
  } catch (e) { msg('crMsg', 'err', e.message || 'Couldn’t send. Try again.') }
  cr.saving = false; $('crGo').disabled = false; $('crGo').textContent = 'Get Midjourney prompt';
}
async function revisePrompt(c, feedback) {
  const now = new Date().toISOString();
  const mode = c.mjPrompt ? 'revise' : 'full';
  try {
    await saveDoc(CREATIONS, 'creations', list => list.map(x => x.id === c.id ? { ...x, ...(feedback ? { feedback } : {}), status: 'queued', error: '', requestedAt: now, updatedAt: now } : x),
      `planner: ${mode === 'revise' ? 'revise' : 'retry'} Midjourney prompt ${c.id}`, [crRequest(c.id, mode, now)]);
    state.cr.revise = null; msg('crMsg', 'ok', mode === 'revise' ? 'Claude is revising the prompt with your feedback.' : 'Asked Claude again.');
    scheduleCreatePoll();
  } catch (e) { msg('crMsg', 'err', e.message) }
  renderCreations();
}
async function deleteCreation(c) {
  try {
    const files = (Array.isArray(c.files) ? c.files : []).filter(p => typeof p === 'string' && p.startsWith(`${CR_DIR}/${c.id}/`)).map(path => ({ path, del: true }));
    await saveDoc(CREATIONS, 'creations', list => list.filter(x => x.id !== c.id), `planner: delete creation ${c.id}`, files);
    msg('crMsg', 'ok', 'Deleted.');
  } catch (e) { msg('crMsg', 'err', e.message) }
  renderCreations();
}
const modelName = m => String(m).replace(/^claude-/, '').replace(/-(\d+)-(\d+)$/, ' $1.$2').replace(/^\w/, x => x.toUpperCase());
function creationAge(c) { return Date.now() - Date.parse(c.requestedAt || c.createdAt || 0) }
function promptBox(text, label, box) {
  return h('div', { class: 'mj-box' }, label ? h('div', { class: 'mj-label' }, label) : null, h('p', { class: 'mj-text-p' }, text),
    h('div', { class: 'mj-row' },
      h('button', { type: 'button', class: 'mini go', onclick: e => copyText(e.currentTarget, text, box, 'Copy') }, 'Copy'),
      h('a', { class: 'mini', href: MJ_IMAGINE, target: '_blank', rel: 'noopener noreferrer', onclick: () => { try { navigator.clipboard.writeText(text) } catch {} } }, 'Copy & open Midjourney ↗')));
}
function crThumbs(c) {
  const refs = h('div', { class: 'cr-thumbs' });
  const paths = (c.refs || []).filter(r => r && r.type === 'image' && typeof r.path === 'string').map(r => r.path);
  for (const aid of c.artworkIds || []) { const a = state.artworks.find(x => x.id === aid); if (a && a.image) paths.push(a.image) }
  for (const path of paths.slice(0, MAX_CR_IMAGES)) refSrc(path).then(u => { if (u) refs.append(h('img', { src: u, alt: 'Reference work' })) });
  return paths.length ? refs : null;
}
function parseAccounts(txt) {
  try { const d = JSON.parse(txt || 'null'); return d && typeof d.accounts === 'object' && d.accounts ? d.accounts : {} } catch { return {} }
}
const istTime = iso => { try { return new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit', day: 'numeric', month: 'short' }).format(new Date(iso)) } catch { return '' } };
function renderAccounts() {
  const box = $('acctList');
  if (!box) return;
  const acc = state.accounts || {};
  box.replaceChildren(...ACCOUNT_ORDER.map(([key, name], i) => {
    const a = acc[key] || {};
    let status = a.status || 'unknown';
    const until = a.limitedUntil ? Date.parse(a.limitedUntil) : 0;
    if (status === 'limited' && until && until < Date.now()) status = 'ok';     // its limit has reset since
    const label = { ok: 'Ready', limited: 'Limited', signin: 'Sign-in problem', missing: 'Not set up', unknown: 'Not used yet' }[status] || 'Not used yet';
    const sub = status === 'limited' ? `Usage limit reached · back ${a.resetText ? a.resetText : 'around ' + istTime(a.limitedUntil)}. Jobs use the other account meanwhile.`
      : status === 'signin' ? 'Its token is missing, wrong or expired. Run claude setup-token for this account and update the secret.'
      : status === 'missing' ? (key === 'google' ? 'Save its claude setup-token as CLAUDE_CODE_OAUTH_TOKEN in Content-distribution.' : 'Save its token as ANTHROPIC_API_KEY_2 in Content-distribution.')
      : a.lastUsedAt ? 'Last used ' + istTime(a.lastUsedAt) : i === 0 ? 'Used first for every job.' : 'Takes over when Account Google is limited.';
    return h('li', { class: i === 0 ? 'first' : '' }, h('span', { class: 'acct-num' }, String(i + 1)),
      h('div', null, h('div', { class: 'acct-name' }, name), h('div', { class: 'acct-sub' }, sub)),
      h('span', { class: `badge ${status === 'unknown' ? 'unknown' : status}` }, label));
  }));
}
function renderCreations() {
  renderAccounts();
  if (!state.loaded) { $('crList').replaceChildren(); return }
  if (!state.creations.length) { $('crList').replaceChildren(h('div', { class: 'empty' }, 'No prompts yet. Add reference work above, say what you want and tap Get Midjourney prompt.')); return }
  $('crList').replaceChildren(...state.creations.map(c => {
    const active = ACTIVE.includes(c.status), stuck = active && creationAge(c) > 20 * 60 * 1000;
    const body = h('div', { class: 'cr-body' });
    const texts = (c.refs || []).filter(r => r && r.type === 'text').map(r => r.text);
    const d = istDate(c.createdAt);
    body.append(...[crThumbs(c),
      h('div', { class: 'cr-ask' }, c.ask || texts[0] || c.deity || 'From reference work'),
      h('div', { class: 'cr-meta' }, [c.deity, FORMAT_LABEL[c.format], c.date ? 'for ' + shortDate(c.date) : null, d ? shortDate(d) : null, c.status === 'done' && c.model ? 'by ' + modelName(c.model) : null, c.status === 'done' && typeof c.account === 'string' && c.account ? c.account : null].filter(Boolean).join(' · '))].filter(Boolean));
    if (texts.length && c.ask) body.append(h('div', { class: 'cr-meta' }, 'Notes: ' + texts.join(' · ')));
    if (active && !stuck) body.append(h('div', { class: 'cr-status' }, h('span', { class: 'spinner', 'aria-hidden': 'true' }), h('span', null, c.status === 'queued' ? 'Waiting for Claude…' : c.mjPrompt ? 'Claude is revising the prompt…' : 'Claude is writing the Midjourney prompt…')));
    else if (stuck) body.append(h('div', { class: 'msg err' }, 'This is taking much longer than usual. In Content-distribution, open Actions → “Planner — Midjourney prompt maker” to see why, or tap Try again.'));
    else if (c.status === 'error') body.append(h('div', { class: 'msg err' }, `Claude couldn’t write this prompt: ${c.error || 'unknown error'}`));
    const actions = h('div', { class: 'cr-actions' });
    if (c.mjPrompt) {
      body.append(promptBox(c.mjPrompt, 'Midjourney prompt', actions));
      if (c.why) body.append(h('div', { class: 'cr-why' }, c.why));
      if (Array.isArray(c.alternatives) && c.alternatives.length)
        body.append(h('details', { class: 'cr-brief' }, h('summary', null, `${c.alternatives.length} alternative${c.alternatives.length > 1 ? 's' : ''}`),
          ...c.alternatives.map((t, i) => promptBox(t, i === 0 ? 'Close to the inspiration' : 'Bolder', actions))));
      if (Array.isArray(c.history) && c.history.length)
        body.append(h('details', { class: 'cr-brief' }, h('summary', null, `Earlier prompts (${c.history.length})`),
          ...c.history.map(x => h('div', null, x.feedback ? h('div', { class: 'cr-meta' }, 'Changed after: ' + x.feedback) : null, promptBox(String(x.mjPrompt || ''), '', actions)))));
    }
    if (!active || stuck) actions.append(h('button', { type: 'button', class: 'mini', onclick: () => { state.cr.revise = state.cr.revise === c.id ? null : c.id; renderCreations() } }, c.mjPrompt ? 'Revise' : 'Try again'));
    actions.append(h('button', { type: 'button', class: 'btn danger', onclick: e => { if (armTap(e.currentTarget, 'Tap again')) deleteCreation(c) } }, 'Delete'));
    body.append(actions);
    if (state.cr.revise === c.id) {
      const ta = h('textarea', { 'aria-label': 'What to change', placeholder: 'What did Midjourney get wrong, or what should change? e.g. hands look off, more gold, plainer background' });
      body.append(h('div', { class: 'cr-redraw' },
        c.mjPrompt ? ta : h('div', { class: 'quiet' }, 'Claude will write the prompt again from your reference work.'),
        h('button', { type: 'button', class: 'btn primary', onclick: () => { if (c.mjPrompt && !ta.value.trim()) { ta.focus(); return } revisePrompt(c, c.mjPrompt ? ta.value.trim().slice(0, 1000) : '') } }, c.mjPrompt ? 'Revise prompt' : 'Try again')));
    }
    return h('article', { class: 'cr-card' }, body);
  }));
}
// Re-read creations every few seconds while Claude is writing one.
let createTimer = null;
function scheduleCreatePoll() {
  if (createTimer || !cfg().tok) return;
  if (!state.creations.some(c => ACTIVE.includes(c.status) && creationAge(c) < 30 * 60 * 1000)) return;
  createTimer = setTimeout(pollCreations, 6000);
}
async function pollCreations() {
  createTimer = null;
  if (document.visibilityState !== 'visible') { scheduleCreatePoll(); return }
  try {
    const before = new Map(state.creations.map(c => [c.id, c.status]));
    state.creations = parseList(await raw(CREATIONS), 'creations', CREATIONS);
    state.accounts = parseAccounts(await raw(ACCOUNTS_FILE).catch(() => null));
    for (const c of state.creations) {
      const was = before.get(c.id);
      if (was && was !== c.status && c.status === 'done') msg(state.view === 'create' ? 'crMsg' : 'appMsg', 'ok', `Midjourney prompt ready: “${(c.ask || c.deity || 'your reference work').slice(0, 60)}”.`);
      if (was && was !== c.status && c.status === 'error') msg(state.view === 'create' ? 'crMsg' : 'appMsg', 'err', 'Claude couldn’t write one of your prompts. See Create for why.');
    }
    if (state.view === 'create' && !state.cr.revise) renderCreations();
  } catch { /* try again next tick */ }
  scheduleCreatePoll();
}

// ── Quotes: quote-based inspiration (never sent to Claude) ──────────────
function stageQuoteShot(file) {
  const qt = state.qt;
  if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type) || file.size > MAX_FILE) { msg('qtMsg', 'err', 'Use a PNG, JPEG, WebP or GIF under 50 MB.'); return }
  if (qt.preview) URL.revokeObjectURL(qt.preview);
  qt.file = file; qt.preview = URL.createObjectURL(file);
  renderQtShot();
}
function renderQtShot() {
  const qt = state.qt, box = $('qtShot');
  box.replaceChildren(...(qt.preview ? [h('span', { class: 'thumb-wrap' }, h('img', { src: qt.preview, alt: 'Screenshot of the quote' }),
    h('button', { type: 'button', class: 'x', 'aria-label': 'Remove the screenshot', onclick: () => { URL.revokeObjectURL(qt.preview); qt.file = null; qt.preview = null; renderQtShot() } }, '×'))] : []));
  box.classList.toggle('hide', !qt.preview);
}
async function saveQuote() {
  const qt = state.qt;
  if (qt.saving) return;
  const text = $('qtText').value.trim();
  if (!text) { msg('qtMsg', 'err', 'Type or paste the quote first.'); $('qtText').focus(); return }
  const url = $('qtUrl').value.trim() ? cleanUrl(findUrl($('qtUrl').value)) : '';
  if ($('qtUrl').value.trim() && !url) { msg('qtMsg', 'err', 'The link should start with https://'); return }
  const norm = t => t.replace(/\s+/g, ' ').trim().toLowerCase();
  const dupe = state.quotes.find(q => norm(q.text || '') === norm(text));
  if (dupe) { msg('qtMsg', 'err', `That quote is already saved (${shortDate(istDate(dupe.createdAt))}).`); return }
  const translation = $('qtTrans').value.trim(), source = $('qtSource').value.trim(), deity = $('qtDeity').value, note = $('qtNote').value.trim();
  const tags = [...new Set($('qtTags').value.split(/[,#]/).map(t => t.trim().toLowerCase()).filter(Boolean))].slice(0, 12);
  qt.saving = true; $('qtSave').disabled = true; $('qtSave').textContent = 'Saving…';
  try {
    const id = 'qt' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), now = new Date().toISOString(), files = [];
    let image = '';
    if (qt.file) {
      const f = await shrinkImage(qt.file);
      image = `${QT_DIR}/${id}.${(REF_TYPES[f.type] || REF_TYPES[qt.file.type])[1]}`;
      files.push({ path: image, b64: await fileB64(f) });
    }
    const entry = { id, text: text.slice(0, 3000), ...(translation ? { translation: translation.slice(0, 2000) } : {}), ...(source ? { source: source.slice(0, 200) } : {}),
      ...(deity ? { deity } : {}), ...(tags.length ? { tags } : {}), ...(url ? { url } : {}), ...(image ? { image } : {}), ...(note ? { note: note.slice(0, 300) } : {}), used: false, createdAt: now, updatedAt: now };
    await saveDoc(QUOTES, 'quotes', list => [entry, ...list], `planner: save quote${source ? ' — ' + source.slice(0, 50) : ''}`, files);
    for (const id of ['qtText', 'qtTrans', 'qtSource', 'qtTags', 'qtUrl', 'qtNote']) $(id).value = '';
    if (qt.preview) URL.revokeObjectURL(qt.preview);
    qt.file = null; qt.preview = null; renderQtShot();
    msg('qtMsg', 'ok', 'Quote saved.');
    renderQuotes();
  } catch (e) { msg('qtMsg', 'err', e.message || 'Couldn’t save. Try again.') }
  qt.saving = false; $('qtSave').disabled = false; $('qtSave').textContent = 'Save quote';
}
async function toggleUsed(q) {
  try { await saveDoc(QUOTES, 'quotes', list => list.map(x => x.id === q.id ? { ...x, used: !x.used, updatedAt: new Date().toISOString() } : x), `planner: mark quote ${q.used ? 'unused' : 'used'}`) }
  catch (e) { msg('qtMsg', 'err', e.message) }
  renderQuotes();
}
async function deleteQuote(q) {
  try {
    await saveDoc(QUOTES, 'quotes', list => list.filter(x => x.id !== q.id), `planner: delete quote${q.source ? ' — ' + q.source.slice(0, 50) : ''}`, q.image ? [{ path: q.image, del: true }] : []);
    msg('qtMsg', 'ok', 'Quote deleted.');
  } catch (e) { msg('qtMsg', 'err', e.message) }
  renderQuotes();
}
function renderQuotes() {
  if (!state.loaded) { $('qtList').replaceChildren(); return }
  const q = $('qtSearch').value.trim().toLowerCase(), hideUsed = $('qtHideUsed').checked;
  const list = state.quotes.filter(x => (!hideUsed || !x.used) && (!q || [x.text, x.translation, x.source, x.deity, x.note, ...(x.tags || [])].some(v => String(v || '').toLowerCase().includes(q))));
  $('qtCount').textContent = state.quotes.length ? `${state.quotes.length} saved` : '';
  if (!list.length) { $('qtList').replaceChildren(h('div', { class: 'empty' }, state.quotes.length ? 'No quotes match.' : 'No quotes yet. Save the lines that inspire you above.')); return }
  $('qtList').replaceChildren(...list.map(x => {
    const url = safeUrl(x.url), d = istDate(x.createdAt);
    const actions = h('div', { class: 'qt-actions' });
    const copy = [x.text, x.translation, x.source ? '— ' + x.source : ''].filter(Boolean).join('\n');
    actions.append(...[
      h('button', { type: 'button', class: 'mini go', onclick: e => copyText(e.currentTarget, copy, actions, 'Copy') }, 'Copy'),
      h('button', { type: 'button', class: 'mini', 'aria-pressed': String(!!x.used), onclick: () => toggleUsed(x) }, x.used ? '✓ Used' : 'Mark used'),
      url ? h('a', { class: 'mini', href: url, target: '_blank', rel: 'noopener noreferrer' }, 'Source ↗') : null,
      h('button', { type: 'button', class: 'btn danger', onclick: e => { if (armTap(e.currentTarget, 'Tap again')) deleteQuote(x) } }, 'Delete')].filter(Boolean));
    const shot = x.image ? h('details', { class: 'cr-brief' }, h('summary', null, 'Screenshot')) : null;
    if (shot) shot.addEventListener('toggle', () => { if (shot.open && shot.children.length === 1) refSrc(x.image).then(u => { if (u) shot.append(h('img', { class: 'qt-img', src: u, alt: 'Screenshot of the quote' })) }) }, { once: false });
    return h('article', { class: 'qt-card' + (x.used ? ' used' : '') },
      h('blockquote', { class: 'qt-text' }, x.text),
      x.translation ? h('p', { class: 'qt-trans' }, x.translation) : null,
      h('div', { class: 'cr-meta' }, [x.source ? '— ' + x.source : null, x.deity, d ? shortDate(d) : null].filter(Boolean).join(' · ')),
      (x.tags || []).length ? h('div', { class: 'qt-tags' }, ...x.tags.map(t => h('button', { type: 'button', class: 'tag', onclick: () => { $('qtSearch').value = t; renderQuotes() } }, '#' + t))) : null,
      x.note ? h('div', { class: 'qt-note' }, x.note) : null,
      shot, actions);
  }));
}
deityOptions($('awDeity'), 'None'); deityOptions($('crDeity'), 'As in the reference work'); deityOptions($('qtDeity'), 'None');
$('awFile').addEventListener('change', e => { stageArtworks([...e.target.files]); e.target.value = '' });
$('awSave').onclick = saveArtworks;
$('awPaste').onclick = async () => {
  try {
    const files = [];
    for (const item of await navigator.clipboard.read()) {
      const t = item.types.find(x => /^image\/(png|jpeg|webp|gif)$/.test(x));
      if (t) files.push(new File([await item.getType(t)], 'artwork.' + t.split('/')[1], { type: t }));
    }
    if (files.length) stageArtworks(files); else msg('awMsg', 'err', 'The clipboard has no image. Copy one first, or tap Choose images.');
  } catch { msg('awMsg', 'err', 'Your browser didn’t allow reading the clipboard. Tap Choose images instead.') }
};
const awDrop = $('awDrop');
awDrop.addEventListener('dragover', e => { e.preventDefault(); awDrop.classList.add('over') });
awDrop.addEventListener('dragleave', () => awDrop.classList.remove('over'));
awDrop.addEventListener('drop', e => { e.preventDefault(); awDrop.classList.remove('over'); stageArtworks([...(e.dataTransfer?.files || [])].filter(f => f.type.startsWith('image/'))) });
for (const btn of document.querySelectorAll('.segmented.fmt button')) btn.addEventListener('click', () => { state.cr.format = btn.dataset.fmt; renderCreate() });
$('crGo').onclick = askForPrompt;
$('crFile').addEventListener('change', e => { stageCreateRefs([...e.target.files]); e.target.value = '' });
$('crPaste').onclick = async () => {
  try {
    const files = [];
    for (const item of await navigator.clipboard.read()) {
      const t = item.types.find(x => /^image\/(png|jpeg|webp|gif)$/.test(x));
      if (t) files.push(new File([await item.getType(t)], 'reference.' + t.split('/')[1], { type: t }));
    }
    if (files.length) stageCreateRefs(files); else msg('crMsg', 'err', 'The clipboard has no image. Copy one first, or tap Choose images.');
  } catch { msg('crMsg', 'err', 'Your browser didn’t allow reading the clipboard. Tap Choose images instead.') }
};
const crDrop = $('crDrop');
crDrop.addEventListener('dragover', e => { e.preventDefault(); crDrop.classList.add('over') });
crDrop.addEventListener('dragleave', () => crDrop.classList.remove('over'));
crDrop.addEventListener('drop', e => { e.preventDefault(); crDrop.classList.remove('over'); stageCreateRefs([...(e.dataTransfer?.files || [])].filter(f => f.type.startsWith('image/'))) });
$('qtSave').onclick = saveQuote;
$('qtFile').addEventListener('change', e => { if (e.target.files[0]) stageQuoteShot(e.target.files[0]); e.target.value = '' });
$('qtSearch').addEventListener('input', renderQuotes);
$('qtHideUsed').addEventListener('change', renderQuotes);

// ── Setup and navigation ────────────────────────────────────────────────
function boot() {
  const c = cfg(), on = !!c.tok;
  $('repo').value = c.repo; $('branch').value = c.branch;
  $('setup').classList.toggle('hide', on);
  for (const id of ['topActions', 'foot', 'mjLink']) $(id).classList.toggle('hide', !on);
  applyView();
  $('repoLbl').textContent = on ? `${c.repo} · ${c.branch}` : '';
  render();
  if (!on) { $('who').textContent = ''; if (!storageWorks()) msg('setupMsg', 'err', STORAGE_MSG); return }
  api('/user').then(u => $('who').textContent = '@' + u.login).catch(() => {});
  loadAll(true);
}
$('connect').onclick = async () => {
  const tok = $('tok').value.trim(), repo = $('repo').value.trim().replace(/^https:\/\/github\.com\//, '').replace(/\/$/, ''), branch = $('branch').value.trim() || 'main';
  if (!/^(github_pat_|ghp_)/.test(tok)) return msg('setupMsg', 'err', 'That doesn’t look like a GitHub token (it should start with github_pat_).');
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) return msg('setupMsg', 'err', 'Repository should look like Arcbha/Content-distribution.');
  msg('setupMsg', '', 'Checking the token…');
  store.set(K.tok, tok); store.set(K.repo, repo); store.set(K.branch, branch);
  if (store.get(K.tok) !== tok) return msg('setupMsg', 'err', STORAGE_MSG);
  try {
    const r = await api(`/repos/${repo}`);
    if (!r.permissions || !r.permissions.push) throw new GhError(403);
    await api(`/repos/${repo}/git/ref/heads/${encodeURIComponent(branch)}`);
    $('tok').value = ''; msg('setupMsg', '', ''); boot();
  } catch (e) {
    store.del(K.tok);
    msg('setupMsg', '', 'Checking what went wrong…');
    msgList('setupMsg', 'err', 'Couldn’t connect.', await diagnose(tok, repo, branch));
  }
};
$('forgetBtn').onclick = e => { if (!armTap(e.currentTarget, 'Tap again to forget')) return; store.del(K.tok); state.plans = []; state.loaded = false; closeEditor(); boot() };
$('refreshBtn').onclick = () => { if (!state.editing && !state.saving) loadAll() };
const move = fn => { if (state.saving) return; if (state.editing) { dropPending(); state.editing = null; state.draft = null } fn(); render() };
$('prevBtn').onclick = () => move(() => { state.start = addDays(state.start, -1) });
$('nextBtn').onclick = () => move(() => { state.start = addDays(state.start, 1) });
$('todayBtn').onclick = () => move(() => { state.start = istToday() });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && cfg().tok && !state.editing && !state.saving) { if (state.start === state.today) state.start = istToday(); loadAll() } });
$('scrim').onclick = () => { if (!state.saving) closeEditor() };
document.addEventListener('keydown', e => { if (e.key === 'Escape' && state.editing && !state.saving) closeEditor() });
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
boot();
