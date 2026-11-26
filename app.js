// Super Sanatan — Panchang planner. Reads and writes Arcbha/Content-distribution through the GitHub REST API.
// The token lives only in this browser's localStorage and is sent only to api.github.com.
// Data contract: planner/README.md in Content-distribution.
'use strict';
const $ = id => document.getElementById(id);
const API = 'https://api.github.com';
const K = { tok: 'ss.token', repo: 'ss.repo', branch: 'ss.branch', share: 'ss.share' };
const PLANS = 'planner/plans.json', PANCHANG = 'data/panchang_2026.json', REFS = 'planner/refs', REQUESTS = 'planner/requests';
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
const VAAR = ['रविवार', 'सोमवार', 'मंगलवार', 'बुधवार', 'गुरुवार', 'शुक्रवार', 'शनिवार'];
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
const blobUrls = new Map();
function refSrc(path) {
  if (!blobUrls.has(path)) blobUrls.set(path, raw(path, null, true).then(b => b ? URL.createObjectURL(b) : null).catch(() => null));
  return blobUrls.get(path);
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
  if (a.status === 'done' && typeof a.text === 'string' && a.text.trim()) return { kind: 'done', text: a.text.trim(), suggestion: a.text.trim() !== String(p.mjPrompt || '').trim() };
  return { kind: 'none' };
}

async function loadAll(first) {
  msg('appMsg', '', first ? 'Loading from GitHub…' : '');
  try {
    const [pan, plans] = await Promise.all([state.panchang ? null : raw(PANCHANG), raw(PLANS)]);
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
    msg('appMsg', 'err', e.message);
  }
  if (!state.editing) render();
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
  $('todayLine').textContent = `${shortDate(state.start)} – ${shortDate(end)} ${end.slice(0, 4)} · Today is ${WEEKDAYS[jsDow(t)]}, ${longDate(t)} (${VAAR[jsDow(t)]}) · IST`;
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
      h('div', null, h('div', { class: 'day-name' }, `${WEEKDAYS[jsDow(date)]}, ${shortDate(date)}`), h('div', { class: 'day-sub' }, VAAR[jsDow(date)])),
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
      h('div', { class: 'ai-result-label' }, 'Claude’s prompt'),
      h('p', { class: 'ai-result-text' }, a.text),
      h('div', { class: 'ai-actions' },
        h('button', { type: 'button', class: 'btn primary sm', onclick: () => { const ta = getForm().querySelector('textarea[name=mjPrompt]'); ta.value = a.text; d.mjPrompt = a.text; box.querySelector('.ai-result')?.remove() } }, 'Use this prompt'),
        h('button', { type: 'button', class: 'btn sm', onclick: e => copyText(e.currentTarget, a.text, box, 'Copy') }, 'Copy'))));
  }
  if (a.kind === 'error' || a.kind === 'stuck') box.append(h('div', { class: 'msg banner err' }, a.kind === 'stuck' ? 'Claude didn’t answer. Check that the ANTHROPIC_API_KEY secret is set and the Actions tab shows the “Planner — Claude prompt writer” run, then try again.' : `Claude couldn’t write a prompt: ${a.error}`));
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
  if (!state.loaded || state.editing) return;
  let s; try { s = JSON.parse(store.get(K.share) || 'null') } catch { s = null }
  if (!s) return;
  store.del(K.share);
  const link = (s.url || (s.text.match(/https?:\/\/\S+/) || [''])[0]).trim();
  const note = [s.text && s.text !== link ? s.text.trim() : '', link].filter(Boolean).join('\n');
  state.start = istToday();
  openEditor(state.start, null, { title: s.title.slice(0, 140), refs: note ? [{ type: 'text', text: note }] : [] });
  msg('appMsg', 'ok', 'Shared link added as a reference. Give it a title and save.');
}

// ── Setup and navigation ────────────────────────────────────────────────
function boot() {
  const c = cfg(), on = !!c.tok;
  $('repo').value = c.repo; $('branch').value = c.branch;
  $('setup').classList.toggle('hide', on);
  for (const id of ['topActions', 'pageHead', 'stats', 'days', 'ahead', 'foot']) $(id).classList.toggle('hide', !on);
  $('repoLbl').textContent = on ? `${c.repo} · ${c.branch}` : '';
  render();
  if (!on) return;
  api('/user').then(u => $('who').textContent = 'Signed in as @' + u.login).catch(() => {});
  loadAll(true);
}
$('connect').onclick = async () => {
  const tok = $('tok').value.trim(), repo = $('repo').value.trim().replace(/^https:\/\/github\.com\//, '').replace(/\/$/, ''), branch = $('branch').value.trim() || 'main';
  if (!/^(github_pat_|ghp_)/.test(tok)) return msg('setupMsg', 'err', 'That doesn’t look like a GitHub token (it should start with github_pat_).');
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) return msg('setupMsg', 'err', 'Repository should look like Arcbha/Content-distribution.');
  msg('setupMsg', '', 'Checking the token…');
  store.set(K.tok, tok); store.set(K.repo, repo); store.set(K.branch, branch);
  try {
    const r = await api(`/repos/${repo}`);
    if (!r.permissions || !r.permissions.push) throw new GhError(403);
    await api(`/repos/${repo}/git/ref/heads/${encodeURIComponent(branch)}`);
    $('tok').value = ''; msg('setupMsg', '', ''); boot();
  } catch (e) { store.del(K.tok); msg('setupMsg', 'err', e.message) }
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
