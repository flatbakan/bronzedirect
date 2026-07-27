// ui.js — Sameiginlegir UI-hlutir (tilkynningar, gluggi, staðfesting).
import { el, mount, clear, btn } from './render.js';

// ---- Toast ----
let toastHost = null;
export function toast(message, kind = 'ok') {
  if (!toastHost) {
    toastHost = el('div', { style: {
      position: 'fixed', left: '50%', bottom: '20px', transform: 'translateX(-50%)',
      zIndex: '80', display: 'flex', flexDirection: 'column', gap: '8px', width: 'min(92vw,420px)',
    }});
    document.body.append(toastHost);
  }
  const node = el('div', { class: `msg ${kind === 'err' ? 'err' : 'ok'}`, style: { boxShadow: 'var(--shadow)' } }, message);
  toastHost.append(node);
  setTimeout(() => node.remove(), 3800);
}

// ---- Modal ----
// opts: { title, body(node), onSave?(), saveLabel?, wide? }
export function modal({ title, body, onSave, saveLabel = 'Vista', hideSave = false }) {
  const scrim = el('div', { class: 'modal-scrim' });
  const close = () => scrim.remove();
  scrim.addEventListener('click', (e) => { if (e.target === scrim) close(); });

  const saveBtn = btn(saveLabel, async () => {
    if (!onSave) return close();
    saveBtn.disabled = true;
    try { const ok = await onSave(); if (ok !== false) close(); }
    finally { saveBtn.disabled = false; }
  }, { class: 'btn-primary' });

  const foot = el('div', { class: 'modal-foot' }, [
    btn('Hætta við', close, { class: 'btn-ghost' }),
    hideSave ? null : saveBtn,
  ]);

  const modalEl = el('div', { class: 'modal' }, [
    el('div', { class: 'modal-head' }, el('h3', {}, title)),
    el('div', { class: 'modal-body' }, body),
    foot,
  ]);
  scrim.append(modalEl);
  document.body.append(scrim);
  return { close };
}

export function confirmDialog(message, { danger = true, confirmLabel = 'Staðfesta' } = {}) {
  return new Promise((resolve) => {
    const scrim = el('div', { class: 'modal-scrim' });
    const done = (v) => { scrim.remove(); resolve(v); };
    scrim.append(el('div', { class: 'modal' }, [
      el('div', { class: 'modal-body' }, el('p', {}, message)),
      el('div', { class: 'modal-foot' }, [
        btn('Hætta við', () => done(false), { class: 'btn-ghost' }),
        btn(confirmLabel, () => done(true), { class: danger ? 'btn-danger' : 'btn-primary' }),
      ]),
    ]));
    document.body.append(scrim);
  });
}

// Hjálp: bygg form-svæði (label + input). Skilar { wrap, input }.
export function fieldRow(label, inputEl, full = false) {
  return el('div', { class: full ? 'field full' : 'field' }, [
    el('label', {}, label),
    inputEl,
  ]);
}

export function spinnerView(container, message = 'Hleð…') {
  mount(container, el('div', { class: 'empty' }, message));
}

export function errorView(container, message) {
  mount(container, el('div', { class: 'empty' }, [
    el('p', {}, 'Villa kom upp'),
    el('p', { class: 'muted' }, message || ''),
  ]));
}
