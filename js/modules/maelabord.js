// modules/maelabord.js — Dashboard / KPIs. Cost & revenue cards are admin-only.
import { el, mount } from '../render.js';
import { sb } from '../supabase.js';
import { isAdmin } from '../auth.js';
import { getSettings } from '../db.js';
import { money, isOverdue, isBulbDue, WO_OPEN, WO_TYPE } from '../fmt.js';
import { barChart } from '../chart.js';
import { errorView } from '../ui.js';

const DAY = 86400000;
function startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function invoiceTotal(inv) {
  const net = (inv.invoice_lines || []).reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.unit_price) || 0), 0);
  return net * (1 + (Number(inv.vat_rate) || 0) / 100);
}

export async function render(container) {
  mount(container, el('div', { class: 'empty' }, 'Loading…'));
  const admin = isAdmin();
  const now = new Date();
  const today0 = startOfDay(now);
  const d14 = new Date(today0.getTime() - 13 * DAY);
  const month0 = new Date(now.getFullYear(), now.getMonth(), 1);
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);

  try {
    const jobs = [
      sb.from('work_orders').select('status,due_date').in('status', WO_OPEN),
      sb.from('work_orders').select('completed_at').gte('completed_at', d14.toISOString()),
      sb.from('equipment').select('current_bulb_hours,bulb_life_hours').neq('status', 'removed'),
      sb.from('work_order_time_logs').select('technician_id').is('clock_out', null),
      sb.from('work_orders').select('equipment_id, equipment(name,brand,model)').not('equipment_id', 'is', null),
      getSettings(),
    ];
    if (admin) {
      jobs.push(sb.from('invoices').select('kind,status,issue_date,vat_rate, invoice_lines(quantity,unit_price)').gte('issue_date', sixMonthsAgo.toISOString().slice(0, 10)));
    }
    const res = await Promise.all(jobs);
    const open = res[0].data || [];
    const completed = res[1].data || [];
    const equipment = res[2].data || [];
    const clockedIn = res[3].data || [];
    const repaired = res[4].data || [];
    const settings = res[5] || {};
    const invoices = admin ? (res[6].data || []) : [];

    // ---- KPIs (everyone) ----
    const overdue = open.filter((w) => isOverdue(w.due_date)).length;
    const onSite = open.filter((w) => w.status === 'on_site').length;
    const waiting = open.filter((w) => w.status === 'waiting_parts').length;
    const completedToday = completed.filter((c) => new Date(c.completed_at) >= today0).length;
    const techsActive = new Set(clockedIn.map((t) => t.technician_id).filter(Boolean)).size;
    const bulbsDue = equipment.filter((e) => isBulbDue(e, settings)).length;

    const kpis = [
      kpi(open.length, 'Open jobs'),
      kpi(overdue, 'Overdue', overdue > 0 ? 'danger' : null),
      kpi(onSite, 'On site now'),
      kpi(waiting, 'Waiting parts', waiting > 0 ? 'warn' : null),
      kpi(completedToday, 'Completed today'),
      kpi(techsActive, 'Techs clocked in'),
      kpi(bulbsDue, 'Bulbs due', bulbsDue > 0 ? 'warn' : null),
    ];

    // ---- Completed per day (14 days) ----
    const perDay = [];
    for (let i = 0; i < 14; i++) {
      const day = new Date(d14.getTime() + i * DAY);
      const label = i % 2 === 0 ? String(day.getDate()) : '';
      perDay.push({ label, value: completed.filter((c) => startOfDay(c.completed_at).getTime() === day.getTime()).length });
    }

    // ---- Most repaired assets (top 5) ----
    const counts = new Map();
    repaired.forEach((r) => {
      const key = r.equipment_id;
      const name = r.equipment ? (r.equipment.name || [r.equipment.brand, r.equipment.model].filter(Boolean).join(' ')) : 'Asset';
      const c = counts.get(key) || { id: key, name, n: 0 };
      c.n += 1; counts.set(key, c);
    });
    const topAssets = [...counts.values()].sort((a, b) => b.n - a.n).slice(0, 5);

    // ---- Admin cost cards + revenue ----
    let adminSection = null;
    if (admin) {
      const invOnly = invoices.filter((i) => i.kind === 'invoice');
      const invoicedThisMonth = invOnly
        .filter((i) => new Date(i.issue_date) >= month0)
        .reduce((s, i) => s + invoiceTotal(i), 0);
      const outstanding = invOnly
        .filter((i) => i.status !== 'paid' && i.status !== 'cancelled')
        .reduce((s, i) => s + invoiceTotal(i), 0);
      const openQuotes = invoices.filter((i) => i.kind === 'quote' && i.status !== 'cancelled').length;

      // revenue per month (6 months)
      const months = [];
      for (let i = 0; i < 6; i++) {
        const m = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1);
        const label = m.toLocaleDateString('en-GB', { month: 'short' });
        const total = invOnly
          .filter((inv) => { const d = new Date(inv.issue_date); return d.getFullYear() === m.getFullYear() && d.getMonth() === m.getMonth(); })
          .reduce((s, inv) => s + invoiceTotal(inv), 0);
        months.push({ label, value: Math.round(total) });
      }

      adminSection = el('div', {}, [
        el('div', { class: 'page-head', style: { marginTop: '22px' } }, [
          el('h2', {}, 'Finance'),
          el('span', { class: 'badge invoiced' }, 'Admin only'),
        ]),
        el('div', { class: 'stat-grid' }, [
          kpi(money(invoicedThisMonth), 'Invoiced this month'),
          kpi(money(outstanding), 'Outstanding', outstanding > 0 ? 'warn' : null),
          kpi(openQuotes, 'Open quotes'),
        ]),
        chartCard('Revenue (last 6 months)', barChart(months, { showValues: true, fmtVal: (v) => money(v) })),
      ]);
    }

    mount(container, el('div', {}, [
      el('div', { class: 'page-head' }, el('h2', {}, 'Dashboard')),
      el('div', { class: 'stat-grid' }, kpis),
      chartCard('Completed jobs (last 14 days)', barChart(perDay, { labelEvery: 1 })),
      el('div', { class: 'card' }, [
        el('h3', { style: { marginTop: 0 } }, 'Most repaired assets'),
        topAssets.length ? el('div', {}, topAssets.map((a) => el('a', { class: 'list-item', href: `#/taeki/${a.id}` }, [
          el('div', { class: 'grow title' }, a.name),
          el('span', { class: 'badge new' }, `${a.n} jobs`),
        ]))) : el('div', { class: 'muted' }, 'No data yet.'),
      ]),
      adminSection,
    ]));
  } catch (e) {
    console.error(e);
    errorView(container, e.message);
  }
}

function kpi(value, label, tone) {
  const color = tone === 'danger' ? 'var(--danger)' : tone === 'warn' ? 'var(--warn)' : null;
  return el('div', { class: 'stat' }, [
    el('div', { class: 'n', style: color ? { background: 'none', color, webkitBackgroundClip: 'initial' } : {} }, String(value)),
    el('div', { class: 'l' }, label),
  ]);
}

function chartCard(title, svg) {
  return el('div', { class: 'card' }, [
    el('h3', { style: { marginTop: 0, marginBottom: '12px' } }, title),
    el('div', { style: { overflowX: 'auto' } }, svg),
  ]);
}
