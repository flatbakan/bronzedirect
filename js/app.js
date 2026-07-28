// app.js — Boot, auth gate, shell and navigation.
import { el, mount, clear, btn } from './render.js';
import { APP_NAME } from './config.js';
import { sb } from './supabase.js';
import * as auth from './auth.js';
import { route, setNotFound, startRouter, navigate, currentPath } from './router.js';
import { toast } from './ui.js';

const appRoot = document.getElementById('app');

// Brand logo (wordmark SVG at repo root). Falls back to text if it fails to load.
function logo(height) {
  const img = el('img', { src: 'logobd.svg', alt: APP_NAME });
  if (height) img.style.height = height;
  const wrap = el('div', { class: 'brand' }, img);
  img.addEventListener('error', () => mount(wrap, el('span', { class: 'fallback' }, APP_NAME)));
  return wrap;
}

// -------- Navigation --------
const NAV = [
  { path: '/idag',          label: 'Today',        ico: '📅' },
  { path: '/dagatal',       label: 'Schedule',     ico: '🗓️' },
  { path: '/verkbeidnir',   label: 'Work orders',  ico: '🧰' },
  { path: '/vidskiptavinir',label: 'Customers',    ico: '🏢' },
  { path: '/taeki',         label: 'Assets',       ico: '🛏️' },
  { path: '/scan',          label: 'Scan QR',      ico: '📷' },
  { path: '/tilkynningar',  label: 'Announcements',ico: '📢' },
  { sep: 'Office' },
  { path: '/vorur',         label: 'Products',     ico: '📦' },
  { path: '/reikningar',    label: 'Invoices',     ico: '🧾', roles: ['admin','office'] },
  { sep: 'Admin', roles: ['admin'] },
  { path: '/stjornun',      label: 'Admin',        ico: '⚙️', roles: ['admin'] },
];

// Module files (lazy import). Contract: render(container, param).
const MODULES = {
  '/idag':           () => import('./modules/idag.js'),
  '/dagatal':        () => import('./modules/dagatal.js'),
  '/verkbeidnir':    () => import('./modules/verkbeidnir.js'),
  '/vidskiptavinir': () => import('./modules/vidskiptavinir.js'),
  '/taeki':          () => import('./modules/taeki.js'),
  '/scan':           () => import('./modules/scan.js'),
  '/tilkynningar':   () => import('./modules/tilkynningar.js'),
  '/vorur':          () => import('./modules/vorur.js'),
  '/reikningar':     () => import('./modules/reikningar.js'),
  '/stjornun':       () => import('./modules/stjornun.js'),
};

let viewEl, sidebarEl, scrimEl, titleEl;

function canSee(item) {
  if (!item.roles) return true;
  const r = auth.role();
  return auth.isAdmin() || item.roles.includes(r);
}

// -------- Login screen --------
function renderAuth() {
  const email = el('input', { type: 'email', autocomplete: 'email', placeholder: 'name@bronzedirect.com' });
  const pass = el('input', { type: 'password', autocomplete: 'current-password', placeholder: '••••••••' });
  const msg = el('div');
  let mode = 'in'; // 'in' | 'up' | 'forgot'
  const nameInput = el('input', { type: 'text', placeholder: 'Full name' });

  const submit = btn('Sign in', async () => {
    msg.replaceChildren();
    submit.disabled = true;
    try {
      if (mode === 'in') {
        await auth.signIn(email.value, pass.value);
        await boot();
      } else if (mode === 'up') {
        await auth.signUp(email.value, pass.value, nameInput.value);
        setMsg('Account created. You can now sign in.', 'ok');
        setMode('in');
      } else {
        await auth.resetPassword(email.value);
        setMsg('If the email exists, a reset link has been sent.', 'ok');
        setMode('in');
      }
    } catch (e) {
      setMsg(translateError(e), 'err');
    } finally {
      submit.disabled = false;
    }
  }, { class: 'btn-primary btn-block' });

  function setMsg(t, kind) { mount(msg, el('div', { class: `msg ${kind}` }, t)); }

  const nameField = el('div', { class: 'field' }, [el('label', {}, 'Name'), nameInput]);
  const passField = el('div', { class: 'field' }, [el('label', {}, 'Password'), pass]);
  const switchRow = el('div', { class: 'row', style: { justifyContent: 'space-between', marginTop: '8px' } });

  function setMode(m) {
    mode = m;
    nameField.style.display = m === 'up' ? '' : 'none';
    passField.style.display = m === 'forgot' ? 'none' : '';
    submit.textContent = m === 'in' ? 'Sign in' : m === 'up' ? 'Create account' : 'Send reset link';
    mount(switchRow, [
      btn(m === 'in' ? 'Create account' : 'Sign in', () => setMode(m === 'in' ? 'up' : 'in'), { class: 'link-btn' }),
      m === 'in' ? btn('Forgot password?', () => setMode('forgot'), { class: 'link-btn' }) : null,
    ]);
    msg.replaceChildren();
  }

  const card = el('div', { class: 'auth-card' }, [
    logo('26px'),
    el('div', { class: 'auth-sub' }, 'Internal service & wholesale system'),
    el('div', { class: 'field' }, [el('label', {}, 'Email'), email]),
    nameField,
    passField,
    submit,
    msg,
    switchRow,
  ]);

  mount(appRoot, el('div', { class: 'auth-wrap' }, card));
  appRoot.setAttribute('aria-busy', 'false');
  setMode('in');
  email.focus();
}

function translateError(e) {
  const m = (e && e.message) || String(e);
  if (/Invalid login credentials/i.test(m)) return 'Wrong email or password.';
  if (/Email not confirmed/i.test(m)) return 'Email is not confirmed.';
  if (/already registered/i.test(m)) return 'Email is already registered.';
  if (/at least 6/i.test(m)) return 'Password must be at least 6 characters.';
  return m;
}

// -------- App shell --------
function renderShell() {
  const profile = auth.getProfile();

  const navLinks = NAV.filter(canSee).map((item) => {
    if (item.sep) return el('div', { class: 'nav-sep' }, item.sep);
    return el('a', { href: '#' + item.path, dataset: { path: item.path } }, [
      el('span', { class: 'ico' }, item.ico), item.label,
    ]);
  });

  sidebarEl = el('aside', { class: 'sidebar' }, [
    el('div', { class: 'sidebar-head' }, logo()),
    el('nav', { class: 'nav' }, navLinks),
    el('div', { class: 'sidebar-foot' }, [
      el('div', { class: 'muted', style: { fontSize: '13px', marginBottom: '8px' } },
        (profile?.full_name || profile?.email || '') + (auth.isAdmin() ? ' · admin' : '')),
      btn('Sign out', async () => { await auth.signOut(); boot(); }, { class: 'btn-ghost btn-block btn-sm' }),
    ]),
  ]);

  scrimEl = el('div', { class: 'scrim', onClick: closeSidebar });
  titleEl = el('h1', {}, APP_NAME);
  viewEl = el('div', { class: 'view' });

  const topbar = el('header', { class: 'topbar' }, [
    btn('☰', toggleSidebar, { class: 'hamburger' }),
    titleEl,
  ]);

  mount(appRoot, el('div', { class: 'layout' }, [
    sidebarEl,
    scrimEl,
    el('main', { class: 'main' }, [topbar, viewEl]),
  ]));
  appRoot.setAttribute('aria-busy', 'false');
}

function toggleSidebar() { sidebarEl.classList.toggle('open'); scrimEl.classList.toggle('show'); }
function closeSidebar() { sidebarEl.classList.remove('open'); scrimEl.classList.remove('show'); }

function setActiveNav(path) {
  sidebarEl.querySelectorAll('.nav a').forEach((a) => {
    a.classList.toggle('active', a.dataset.path === path);
  });
}

// Unread-announcements dot on the nav link
async function refreshAnnouncementBadge() {
  const me = auth.getProfile();
  if (!me || !sidebarEl) return;
  const link = sidebarEl.querySelector('.nav a[data-path="/tilkynningar"]');
  if (!link) return;
  try {
    const [{ data: anns }, { data: reads }] = await Promise.all([
      sb.from('announcements').select('id'),
      sb.from('announcement_reads').select('announcement_id').eq('profile_id', me.id),
    ]);
    const readSet = new Set((reads || []).map((r) => r.announcement_id));
    const unread = (anns || []).filter((a) => !readSet.has(a.id)).length;
    let dot = link.querySelector('.unread-dot');
    if (unread > 0 && !dot) link.append(el('span', { class: 'unread-dot' }));
    else if (unread === 0 && dot) dot.remove();
  } catch { /* table may not exist yet */ }
}
window.addEventListener('bd:announcements-read', refreshAnnouncementBadge);

// -------- Routing --------
function registerRoutes() {
  for (const [path, loader] of Object.entries(MODULES)) {
    route(path, async (param) => {
      const item = NAV.find((n) => n.path === path);
      if (item && !canSee(item)) { navigate('/idag'); return; }
      closeSidebar();
      setActiveNav(path);
      titleEl.textContent = item?.label || APP_NAME;
      mount(viewEl, el('div', { class: 'empty' }, 'Loading…'));
      try {
        const mod = await loader();
        await mod.render(viewEl, param);
      } catch (e) {
        console.error(e);
        mount(viewEl, el('div', { class: 'empty' }, 'Failed to load module: ' + (e.message || e)));
      }
    });
  }
  setNotFound(() => navigate('/idag'));
}

// -------- Boot --------
async function boot() {
  appRoot.setAttribute('aria-busy', 'true');
  mount(appRoot, el('div', { class: 'boot' }, 'Loading…'));
  const session = await auth.getSession();
  if (!session) { renderAuth(); return; }
  const profile = await auth.loadProfile();
  if (!profile) {
    renderAuth();
    toast('Account not found or inactive. Contact an administrator.', 'err');
    await auth.signOut();
    return;
  }
  if (profile.is_active === false) {
    await auth.signOut();
    renderAuth();
    toast('Account is inactive.', 'err');
    return;
  }
  renderShell();
  registerRoutes();
  startRouter(); // reads current hash; empty/ / falls back to /idag
  refreshAnnouncementBadge();
}

// React to sign-out in another tab
auth.onAuthChange((session) => {
  if (!session && !document.querySelector('.auth-wrap')) boot();
});

// Register service worker (PWA / installable). Ignored on http/file, works on https.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((e) => console.warn('SW registration failed', e));
  });
}

boot();
