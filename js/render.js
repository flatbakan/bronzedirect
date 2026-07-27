// render.js — Örugg teikni-hjálp.
// Öll gögn eru sett í DOM gegnum createElement/textContent, sem escape-ar sjálfgefið.
// Þannig verður XSS-flokkur villna (ber innerHTML með notendagögnum) ómögulegur.
// Notaðu ALDREI node.innerHTML með gögnum úr gagnagrunni. Ef þú þarft fast HTML,
// notaðu { html: '<b>fast</b>' } sem er aðeins fyrir kyrrstæða, treysta strengi.

export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value == null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key === 'html') node.innerHTML = value;            // aðeins fyrir fast, treyst HTML
    else if (key === 'style' && typeof value === 'object') Object.assign(node.style, value);
    else if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key === 'value') node.value = value;
    else if (key === 'checked' || key === 'disabled' || key === 'selected') node[key] = !!value;
    else node.setAttribute(key, value);
  }
  append(node, children);
  return node;
}

function append(node, children) {
  const list = Array.isArray(children) ? children : [children];
  for (const child of list) {
    if (child == null || child === false || child === true) continue;
    if (Array.isArray(child)) { append(node, child); continue; } // fletja út hreiður
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

export const text = (value) => document.createTextNode(value == null ? '' : String(value));

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

export function mount(node, ...children) {
  clear(node);
  append(node, children);
  return node;
}

// Stuttar hjálparaðgerðir fyrir algeng element
export const div = (attrs, children) => el('div', attrs, children);
export const span = (attrs, children) => el('span', attrs, children);
export const btn = (label, onClick, attrs = {}) =>
  el('button', { type: 'button', ...attrs, onClick }, label);
