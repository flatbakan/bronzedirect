// router.js — Einföld hash-leiðsögn (#/leið).
const routes = new Map();
let notFound = null;

export function route(path, handler) { routes.set(path, handler); }
export function setNotFound(handler) { notFound = handler; }

export function navigate(path) {
  if (('#' + path) === window.location.hash) handleRoute();
  else window.location.hash = path;
}

export function currentPath() {
  const hash = window.location.hash.replace(/^#/, '') || '/';
  return hash;
}

// Skiptir slóð "/taeki/123" í { path:'/taeki', param:'123' }
function parse(full) {
  const parts = full.split('/').filter(Boolean);
  if (parts.length === 0) return { path: '/', param: null };
  return { path: '/' + parts[0], param: parts[1] ? decodeURIComponent(parts[1]) : null };
}

function handleRoute() {
  const { path, param } = parse(currentPath());
  const handler = routes.get(path) || notFound;
  if (handler) handler(param);
}

export function startRouter() {
  window.addEventListener('hashchange', handleRoute);
  handleRoute();
}
