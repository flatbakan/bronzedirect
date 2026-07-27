// fmt.js — Snið (dagsetningar, verð, textar á íslensku).

export const WO_TYPE = {
  install: 'Uppsetning', repair: 'Viðgerð', bulb_change: 'Peruskipti',
  maintenance: 'Viðhald', inspection: 'Skoðun', other: 'Annað',
};
export const WO_STATUS = {
  new: 'Nýtt', scheduled: 'Áætlað', in_progress: 'Í vinnslu',
  done: 'Lokið', invoiced: 'Reikningsfært', cancelled: 'Aflýst',
};
export const WO_PRIORITY = { low: 'Lág', normal: 'Venjuleg', high: 'Há', urgent: 'Áríðandi' };
export const PRODUCT_CAT = { bed: 'Ljósabekkur', bulb: 'Pera', part: 'Varahlutur', accessory: 'Aukahlutur' };
export const EQUIP_STATUS = { in_service: 'Í notkun', needs_service: 'Þarf þjónustu', removed: 'Fjarlægt' };

export function fmtDate(v) {
  if (!v) return '';
  const d = new Date(v);
  if (isNaN(d)) return '';
  return d.toLocaleDateString('is-IS', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
export function fmtDateTime(v) {
  if (!v) return '';
  const d = new Date(v);
  if (isNaN(d)) return '';
  return d.toLocaleString('is-IS', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
export function fmtKr(v) {
  if (v == null || v === '') return '';
  return new Intl.NumberFormat('is-IS', { style: 'currency', currency: 'ISK', maximumFractionDigits: 0 }).format(Number(v));
}

// Fyrir <input type="datetime-local"> — skilar 'YYYY-MM-DDTHH:mm' í staðartíma.
export function toLocalInput(v) {
  const d = v ? new Date(v) : new Date();
  if (isNaN(d)) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export const todayISO = () => {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
