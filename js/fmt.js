// fmt.js — Formatting (dates, money, English labels).
import { LOCALE, CURRENCY } from './config.js';

export const WO_TYPE = {
  install: 'Installation', repair: 'Repair', bulb_change: 'Bulb change',
  maintenance: 'Maintenance', inspection: 'Inspection', other: 'Other',
};
export const WO_STATUS = {
  new: 'New', scheduled: 'Scheduled', in_progress: 'In progress',
  done: 'Done', invoiced: 'Invoiced', cancelled: 'Cancelled',
};
export const WO_PRIORITY = { low: 'Low', normal: 'Normal', high: 'High', urgent: 'Urgent' };
export const PRODUCT_CAT = { bed: 'Sunbed', bulb: 'Bulb / tube', part: 'Spare part', accessory: 'Accessory' };
export const EQUIP_STATUS = { in_service: 'In service', needs_service: 'Needs service', removed: 'Removed' };

export function fmtDate(v) {
  if (!v) return '';
  const d = new Date(v);
  if (isNaN(d)) return '';
  return d.toLocaleDateString(LOCALE, { day: '2-digit', month: '2-digit', year: 'numeric' });
}
export function fmtDateTime(v) {
  if (!v) return '';
  const d = new Date(v);
  if (isNaN(d)) return '';
  return d.toLocaleString(LOCALE, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
export function money(v) {
  if (v == null || v === '') return '';
  return new Intl.NumberFormat(LOCALE, { style: 'currency', currency: CURRENCY, maximumFractionDigits: 2 }).format(Number(v));
}

// For <input type="datetime-local"> — returns 'YYYY-MM-DDTHH:mm' in local time.
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

// ---- Bulb-life helpers ----
export function bulbLife(equip, settings) {
  return Number(equip?.bulb_life_hours ?? settings?.default_bulb_life_hours ?? 0) || 0;
}
export function bulbPct(equip, settings) {
  const life = bulbLife(equip, settings);
  if (!life || equip?.current_bulb_hours == null) return null;
  return Math.min(100, Math.round((Number(equip.current_bulb_hours) / life) * 100));
}
export function isBulbDue(equip, settings) {
  const pct = bulbPct(equip, settings);
  return pct != null && pct >= 100;
}

// True if a date (yyyy-mm-dd) or timestamp is in the past (end-of-day for dates).
export function isOverdue(v, endOfDay = true) {
  if (!v) return false;
  const d = new Date(v);
  if (isNaN(d)) return false;
  if (endOfDay && /^\d{4}-\d{2}-\d{2}$/.test(String(v))) d.setHours(23, 59, 59, 999);
  return d.getTime() < Date.now();
}
