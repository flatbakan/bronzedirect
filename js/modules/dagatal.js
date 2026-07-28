// modules/dagatal.js — Schedule: week view of jobs + unscheduled bucket.
import { el, mount, btn } from '../render.js';
import { sb } from '../supabase.js';
import { listStaff } from '../db.js';
import { WO_TYPE, WO_STATUS, WO_OPEN } from '../fmt.js';
import { errorView } from '../ui.js';

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function startOfWeek(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const day = (x.getDay() + 6) % 7; // Monday = 0
  x.setDate(x.getDate() - day);
  return x;
}
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function sameDay(a, b) { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); }
function fmtTime(d) { return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }); }
function fmtDayLabel(d) { return `${DAY_NAMES[(d.getDay() + 6) % 7]} ${d.getDate()}/${d.getMonth() + 1}`; }

export async function render(container) {
  let weekStart = startOfWeek(new Date());
  let techFilter = '';
  let staff = [];
  try { staff = await listStaff(); } catch { /* ignore */ }

  const techSel = el('select', { style: { maxWidth: '200px' } }, [
    el('option', { value: '' }, 'All technicians'),
    ...staff.map((s) => el('option', { value: s.id }, s.full_name || s.email)),
  ]);
  techSel.addEventListener('change', () => { techFilter = techSel.value; draw(); });

  const rangeLabel = el('h2', { style: { margin: 0, fontSize: '18px' } });
  const body = el('div', {});

  async function draw() {
    mount(body, el('div', { class: 'empty' }, 'Loading…'));
    const weekEnd = addDays(weekStart, 7);
    rangeLabel.textContent = `${fmtDayLabel(weekStart)} – ${fmtDayLabel(addDays(weekStart, 6))}`;

    const sel = '*, customers(name), profiles:assigned_to(full_name)';
    let scheduledQ = sb.from('work_orders').select(sel)
      .gte('scheduled_at', weekStart.toISOString()).lt('scheduled_at', weekEnd.toISOString())
      .not('status', 'in', '(cancelled,invoiced,completed)');
    let unscheduledQ = sb.from('work_orders').select(sel)
      .is('scheduled_at', null).in('status', WO_OPEN);
    if (techFilter) { scheduledQ = scheduledQ.eq('assigned_to', techFilter); unscheduledQ = unscheduledQ.eq('assigned_to', techFilter); }

    const [schedRes, unschedRes] = await Promise.all([scheduledQ, unscheduledQ]);
    if (schedRes.error) { errorView(body, schedRes.error.message); return; }
    const scheduled = schedRes.data || [];
    const unscheduled = unschedRes.data || [];

    const today = new Date();
    const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
    const dayCards = days.map((day) => {
      const jobs = scheduled.filter((w) => sameDay(new Date(w.scheduled_at), day))
        .sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at));
      return el('div', { class: 'card', style: sameDay(day, today) ? { borderColor: 'var(--brand-2)' } : {} }, [
        el('div', { class: 'row', style: { justifyContent: 'space-between', marginBottom: jobs.length ? '8px' : '0' } }, [
          el('strong', {}, fmtDayLabel(day) + (sameDay(day, today) ? ' · Today' : '')),
          el('span', { class: 'muted', style: { fontSize: '13px' } }, jobs.length ? `${jobs.length} job${jobs.length > 1 ? 's' : ''}` : 'No jobs'),
        ]),
        ...jobs.map((w) => jobRow(w, true)),
      ]);
    });

    mount(body, el('div', {}, [
      ...dayCards,
      unscheduled.length ? el('div', { class: 'card', style: { background: 'var(--surface-2)' } }, [
        el('strong', {}, `⚠︎ Unscheduled (${unscheduled.length})`),
        el('div', { style: { marginTop: '8px' } }, unscheduled.map((w) => jobRow(w, false))),
      ]) : null,
    ]));
  }

  function jobRow(w, showTime) {
    const t = showTime && w.scheduled_at ? fmtTime(new Date(w.scheduled_at)) + ' · ' : '';
    return el('a', { class: 'list-item', href: `#/verkbeidnir/${w.id}` }, [
      el('div', { class: 'grow' }, [
        el('div', { class: 'title' }, `${t}${w.customers?.name || 'Unknown'}`),
        el('div', { class: 'sub' }, [WO_TYPE[w.type] || w.type, w.profiles?.full_name && ('👤 ' + w.profiles.full_name), w.title].filter(Boolean).join(' · ')),
      ]),
      el('span', { class: `badge ${w.status}` }, WO_STATUS[w.status] || w.status),
    ]);
  }

  mount(container, el('div', {}, [
    el('div', { class: 'page-head' }, [
      rangeLabel,
      el('span', { class: 'spacer' }),
      el('div', { class: 'row' }, [
        techSel,
        btn('‹', () => { weekStart = addDays(weekStart, -7); draw(); }, { class: 'btn-ghost btn-sm' }),
        btn('Today', () => { weekStart = startOfWeek(new Date()); draw(); }, { class: 'btn-ghost btn-sm' }),
        btn('›', () => { weekStart = addDays(weekStart, 7); draw(); }, { class: 'btn-ghost btn-sm' }),
      ]),
    ]),
    body,
  ]));
  await draw();
}
