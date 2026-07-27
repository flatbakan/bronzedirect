// modules/idag.js — Mælaborð: verk dagsins og staða.
import { el, mount } from '../render.js';
import { sb } from '../supabase.js';
import { getProfile } from '../auth.js';
import { WO_TYPE, WO_STATUS, fmtDateTime } from '../fmt.js';
import { errorView } from '../ui.js';

function woLink(wo) {
  const cust = wo.customers?.name || 'Óþekktur';
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
  mount(container, el('div', { class: 'empty' }, 'Hleð…'));
  const me = getProfile();

  try {
    const sel = '*, customers(name)';
    const openStatuses = ['new', 'scheduled', 'in_progress'];

    const [openRes, mineRes] = await Promise.all([
      sb.from('work_orders').select(sel).in('status', openStatuses).order('scheduled_at', { nullsFirst: false }),
      sb.from('work_orders').select(sel).eq('assigned_to', me?.id || '00000000-0000-0000-0000-000000000000')
        .in('status', openStatuses).order('scheduled_at', { nullsFirst: false }),
    ]);
    if (openRes.error) throw openRes.error;
    const open = openRes.data || [];
    const mine = mineRes.data || [];

    const byStatus = (s) => open.filter((w) => w.status === s).length;

    const stats = el('div', { class: 'stat-grid' }, [
      stat(open.length, 'Opin verk'),
      stat(byStatus('scheduled'), 'Áætluð'),
      stat(byStatus('in_progress'), 'Í vinnslu'),
      stat(byStatus('new'), 'Ný / óúthlutað'),
    ]);

    const mineSection = el('div', {}, [
      el('div', { class: 'page-head', style: { marginTop: '20px' } }, el('h2', {}, 'Mín verk')),
      mine.length
        ? el('div', {}, mine.map(woLink))
        : el('div', { class: 'empty' }, 'Engin verk úthlutuð á þig.'),
    ]);

    const allSection = el('div', {}, [
      el('div', { class: 'page-head', style: { marginTop: '20px' } }, [
        el('h2', {}, 'Öll opin verk'),
        el('span', { class: 'spacer' }),
        el('a', { class: 'btn-primary btn-sm', href: '#/verkbeidnir', style: { textDecoration: 'none', padding: '8px 12px', borderRadius: '10px' } }, 'Öll verk →'),
      ]),
      open.length
        ? el('div', {}, open.slice(0, 12).map(woLink))
        : el('div', { class: 'empty' }, 'Engin opin verk. 🎉'),
    ]);

    mount(container, el('div', {}, [
      el('div', { class: 'page-head' }, el('h2', {}, `Góðan dag${me?.full_name ? ', ' + me.full_name.split(' ')[0] : ''}`)),
      stats,
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
