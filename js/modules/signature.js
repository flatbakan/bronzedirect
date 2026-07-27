// modules/signature.js — Einfalt undirskriftar-teikniborð (canvas).
import { el, btn } from '../render.js';

export function signaturePad() {
  const canvas = el('canvas', {
    width: 600, height: 200,
    style: { width: '100%', height: '160px', background: '#fff', borderRadius: '10px', touchAction: 'none', border: '1px solid var(--border)' },
  });
  const ctx = canvas.getContext('2d');
  ctx.lineWidth = 2.2; ctx.lineCap = 'round'; ctx.strokeStyle = '#111';
  let drawing = false, inked = false, last = null;

  const pos = (e) => {
    const r = canvas.getBoundingClientRect();
    const p = e.touches ? e.touches[0] : e;
    return { x: (p.clientX - r.left) * (canvas.width / r.width), y: (p.clientY - r.top) * (canvas.height / r.height) };
  };
  const start = (e) => { e.preventDefault(); drawing = true; last = pos(e); };
  const move = (e) => {
    if (!drawing) return;
    e.preventDefault();
    const p = pos(e);
    ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.lineTo(p.x, p.y); ctx.stroke();
    last = p; inked = true;
  };
  const end = () => { drawing = false; };

  canvas.addEventListener('mousedown', start);
  canvas.addEventListener('mousemove', move);
  window.addEventListener('mouseup', end);
  canvas.addEventListener('touchstart', start, { passive: false });
  canvas.addEventListener('touchmove', move, { passive: false });
  canvas.addEventListener('touchend', end);

  const clearBtn = btn('Clear', () => { ctx.clearRect(0, 0, canvas.width, canvas.height); inked = false; }, { class: 'btn-ghost btn-sm' });

  const element = el('div', {}, [
    canvas,
    el('div', { class: 'row', style: { justifyContent: 'flex-end', marginTop: '6px' } }, clearBtn),
  ]);

  return {
    element,
    hasInk: () => inked,
    toBlob: () => new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/png')),
  };
}
