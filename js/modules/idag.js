// modules/idag.js — Dashboard: today's jobs and status.
import { el, mount } from '../render.js';
import { sb } from '../supabase.js';
import { getProfile } from '../auth.js';
import { getSettings } from '../db.js';
import { WO_TYPE, WO_STATUS, fmtDateTime, fmtDate, isOverdue, isBulbDue } from '../fmt.js';
import { errorView } from '../ui.js';

function jobIsOverdue(w) {
  return isOverdue(w.due_date) || (w.scheduled_at && new Date(w.scheduled_at).getTime() < Date.now());
}

function woLink(wo) {
  const cust = wo.customers?.name || 'Unknown';
  return el('a', { class: 'list-item', href: `#/verkbeidnir/${wo.id}` }, [
    el('div', { class: 'grow' }, [
      el('div', { class: 'title' }, `#${wo.number} · ${cust}`),
      el('div', { class: 'sub' }, [
        WO_TYPE[wo.type] || wo.type,
        wo.scheduled_at ? ' · ' + fmtDateTime(wo.scheduled_at) : '',
        wo.title ? ' · ' + wo.title : '',
      ].join('')),
    ]),
    el('span', { class: `badge ${wo.status}` }, WO_STATUS[wo.status] || wo.status),
  ]);
}

export async function render(container) {
  mount(container, el('div', { class: 'empty' }, 'Loading…'));
  const me = getProfile();

  try {
    const sel = '*, customers(name)';
    const openStatuses = ['new', 'scheduled', 'in_progress'];

    const [openRes, mineRes, equipRes, settings] = await Promise.all([
      sb.from('work_orders').select(sel).in('status', openStatuses).order('scheduled_at', { nullsFirst: false }),
      sb.from('work_orders').select(sel).eq('assigned_to', me?.id || '00000000-0000-0000-0000-000000000000')
        .in('status', openStatuses).order('scheduled_at', { nullsFirst: false }),
      sb.from('equipment').select('*, customers(name), locations(name)').neq('status', 'removed'),
      getSettings(),
    ]);
    if (openRes.error) throw openRes.error;
    const open = openRes.data || [];
    const mine = mineRes.data || [];
    const overdue = open.filter(jobIsOverdue);
    const bulbsDue = (equipRes.data || []).filter((e) => isBulbDue(e, settings));

    const byStatus = (s) => open.filter((w) => w.status === s).length;

    const stats = el('div', { class: 'stat-grid' }, [
      stat(open.length, 'Open jobs'),
      stat(overdue.length, 'Overdue'),
      stat(byStatus('in_progress'), 'In progress'),
      stat(bulbsDue.length, 'Bulbs due'),
    ]);

    const overdueSection = overdue.length ? el('div', {}, [
      el('div', { class: 'page-head', style: { marginTop: '20px' } }, el('h2', {}, '⚠︎ Overdue')),
      el('div', {}, overdue.map(woLink)),
    ]) : null;

    const bulbsSection = bulbsDue.length ? el('div', {}, [
      el('div', { class: 'page-head', style: { marginTop: '20px' } }, [
        el('h2', {}, '💡 Bulbs due'),
        el('span', { class: 'spacer' }),
        el('a', { class: 'link-btn', href: '#/taeki' }, 'Equipment →'),
      ]),
      el('div', {}, bulbsDue.slice(0, 10).map((e) => el('a', { class: 'list-item', href: `#/taeki/${e.id}` }, [
        el('div', { class: 'grow' }, [
          el('div', { class: 'title' }, [e.brand, e.model].filter(Boolean).join(' ') || 'Sunbed'),
          el('div', { class: 'sub' }, [e.customers?.name, e.locations?.name].filter(Boolean).join(' · ')),
        ]),
        el('span', { class: 'badge urgent' }, `${e.current_bulb_hours ?? 0} hrs`),
      ]))),
    ]) : null;

    const mineSection = el('div', {}, [
      el('div', { class: 'page-head', style: { marginTop: '20px' } }, el('h2', {}, 'My jobs')),
      mine.length
        ? el('div', {}, mine.map(woLink))
        : el('div', { class: 'empty' }, 'No jobs assigned to you.'),
    ]);

    const allSection = el('div', {}, [
      el('div', { class: 'page-head', style: { marginTop: '20px' } }, [
        el('h2', {}, 'All open jobs'),
        el('span', { class: 'spacer' }),
        el('a', { class: 'btn-primary btn-sm', href: '#/verkbeidnir', style: { textDecoration: 'none', padding: '8px 12px', borderRadius: '10px' } }, 'All jobs →'),
      ]),
      open.length
        ? el('div', {}, open.slice(0, 12).map(woLink))
        : el('div', { class: 'empty' }, 'No open jobs. 🎉'),
    ]);

    mount(container, el('div', {}, [
      el('div', { class: 'page-head' }, el('h2', {}, `Hello${me?.full_name ? ', ' + me.full_name.split(' ')[0] : ''}`)),
      stats,
      overdueSection,
      bulbsSection,
      mineSection,
      allSection,
    ]));
  } catch (e) {
    console.error(e);
    errorView(container, e.message);
  }
}

function stat(n, label) {
  return el('div', { class: 'stat' }, [
    el('div', { class: 'n' }, String(n)),
    el('div', { class: 'l' }, label),
  ]);
}
