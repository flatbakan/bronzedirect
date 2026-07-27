// app.js — Ræsir, auðkenningarhlið, skel og leiðsögn.
import { el, mount, clear, btn } from './render.js';
import { APP_NAME } from './config.js';
import * as auth from './auth.js';
import { route, setNotFound, startRouter, navigate, currentPath } from './router.js';
import { toast } from './ui.js';

const appRoot = document.getElementById('app');

// -------- Leiðsögn (nav) --------
const NAV = [
  { path: '/idag',          label: 'Í dag',          ico: '📅' },
  { path: '/verkbeidnir',   label: 'Verkbeiðnir',    ico: '🧰' },
  { path: '/vidskiptavinir',label: 'Viðskiptavinir', ico: '🏢' },
  { path: '/taeki',         label: 'Tæki',           ico: '🛏️' },
  { sep: 'Skrifstofa' },
  { path: '/vorur',         label: 'Vörur',          ico: '📦' },
  { path: '/reikningar',    label: 'Reikningar',     ico: '🧾', roles: ['admin','office'] },
  { sep: 'Stjórnun', roles: ['admin'] },
  { path: '/stjornun',      label: 'Stjórnun',       ico: '⚙️', roles: ['admin'] },
];

// Module-skrár (lazy import). render(container, param) er samningurinn.
const MODULES = {
  '/idag':           () => import('./modules/idag.js'),
  '/verkbeidnir':    () => import('./modules/verkbeidnir.js'),
  '/vidskiptavinir': () => import('./modules/vidskiptavinir.js'),
  '/taeki':          () => import('./modules/taeki.js'),
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

// -------- Innskráningarskjár --------
function renderAuth() {
  const email = el('input', { type: 'email', autocomplete: 'email', placeholder: 'nafn@bronsdirect.is' });
  const pass = el('input', { type: 'password', autocomplete: 'current-password', placeholder: '••••••••' });
  const msg = el('div');
  let mode = 'in'; // 'in' | 'up' | 'forgot'
  const nameInput = el('input', { type: 'text', placeholder: 'Fullt nafn' });

  const submit = btn('Skrá inn', async () => {
    msg.replaceChildren();
    submit.disabled = true;
    try {
      if (mode === 'in') {
        await auth.signIn(email.value, pass.value);
        await boot();
      } else if (mode === 'up') {
        await auth.signUp(email.value, pass.value, nameInput.value);
        setMsg('Aðgangur stofnaður. Þú getur nú skráð þig inn.', 'ok');
        setMode('in');
      } else {
        await auth.resetPassword(email.value);
        setMsg('Ef netfangið er til fær það endurstillingarpóst.', 'ok');
        setMode('in');
      }
    } catch (e) {
      setMsg(þýðaVillu(e), 'err');
    } finally {
      submit.disabled = false;
    }
  }, { class: 'btn-primary btn-block' });

  function setMsg(t, kind) { mount(msg, el('div', { class: `msg ${kind}` }, t)); }

  const nameField = el('div', { class: 'field' }, [el('label', {}, 'Nafn'), nameInput]);
  const passField = el('div', { class: 'field' }, [el('label', {}, 'Lykilorð'), pass]);
  const switchRow = el('div', { class: 'row', style: { justifyContent: 'space-between', marginTop: '8px' } });

  function setMode(m) {
    mode = m;
    nameField.style.display = m === 'up' ? '' : 'none';
    passField.style.display = m === 'forgot' ? 'none' : '';
    submit.textContent = m === 'in' ? 'Skrá inn' : m === 'up' ? 'Stofna aðgang' : 'Senda endurstillingu';
    mount(switchRow, [
      btn(m === 'in' ? 'Nýr aðgangur' : 'Innskráning', () => setMode(m === 'in' ? 'up' : 'in'), { class: 'link-btn' }),
      m === 'in' ? btn('Gleymt lykilorð?', () => setMode('forgot'), { class: 'link-btn' }) : null,
    ]);
    msg.replaceChildren();
  }

  const card = el('div', { class: 'auth-card' }, [
    el('div', { class: 'brand' }, [el('span', { class: 'dot' }), APP_NAME]),
    el('div', { class: 'auth-sub' }, 'Innra þjónustu- og heildsölukerfi'),
    el('div', { class: 'field' }, [el('label', {}, 'Netfang'), email]),
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

function þýðaVillu(e) {
  const m = (e && e.message) || String(e);
  if (/Invalid login credentials/i.test(m)) return 'Rangt netfang eða lykilorð.';
  if (/Email not confirmed/i.test(m)) return 'Netfang er óstaðfest.';
  if (/already registered/i.test(m)) return 'Netfang er þegar skráð.';
  if (/at least 6/i.test(m)) return 'Lykilorð verður að vera a.m.k. 6 stafir.';
  return m;
}

// -------- App-skel --------
function renderShell() {
  const profile = auth.getProfile();

  const navLinks = NAV.filter(canSee).map((item) => {
    if (item.sep) return el('div', { class: 'nav-sep' }, item.sep);
    return el('a', { href: '#' + item.path, dataset: { path: item.path } }, [
      el('span', { class: 'ico' }, item.ico), item.label,
    ]);
  });

  sidebarEl = el('aside', { class: 'sidebar' }, [
    el('div', { class: 'sidebar-head' }, el('div', { class: 'brand' }, [el('span', { class: 'dot' }), APP_NAME])),
    el('nav', { class: 'nav' }, navLinks),
    el('div', { class: 'sidebar-foot' }, [
      el('div', { class: 'muted', style: { fontSize: '13px', marginBottom: '8px' } },
        (profile?.full_name || profile?.email || '') + (auth.isAdmin() ? ' · admin' : '')),
      btn('Skrá út', async () => { await auth.signOut(); boot(); }, { class: 'btn-ghost btn-block btn-sm' }),
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

// -------- Route-meðhöndlun --------
function registerRoutes() {
  for (const [path, loader] of Object.entries(MODULES)) {
    route(path, async (param) => {
      const item = NAV.find((n) => n.path === path);
      if (item && !canSee(item)) { navigate('/idag'); return; }
      closeSidebar();
      setActiveNav(path);
      titleEl.textContent = item?.label || APP_NAME;
      mount(viewEl, el('div', { class: 'empty' }, 'Hleð…'));
      try {
        const mod = await loader();
        await mod.render(viewEl, param);
      } catch (e) {
        console.error(e);
        mount(viewEl, el('div', { class: 'empty' }, 'Villa við að hlaða einingu: ' + (e.message || e)));
      }
    });
  }
  setNotFound(() => navigate('/idag'));
}

// -------- Ræsing --------
async function boot() {
  appRoot.setAttribute('aria-busy', 'true');
  mount(appRoot, el('div', { class: 'boot' }, 'Hleð…'));
  const session = await auth.getSession();
  if (!session) { renderAuth(); return; }
  const profile = await auth.loadProfile();
  if (!profile) {
    // Innskráður en enginn profil / óvirkur
    renderAuth();
    toast('Aðgangur fannst ekki eða er óvirkur. Hafðu samband við stjórnanda.', 'err');
    await auth.signOut();
    return;
  }
  if (profile.is_active === false) {
    await auth.signOut();
    renderAuth();
    toast('Aðgangur er óvirkur.', 'err');
    return;
  }
  renderShell();
  registerRoutes();
  startRouter(); // les núverandi hash; tómt/ / fer sjálfkrafa á /idag gegnum notFound
}

// Bregst við útskráningu í öðrum flipa
auth.onAuthChange((session) => {
  if (!session && !document.querySelector('.auth-wrap')) boot();
});

boot();
