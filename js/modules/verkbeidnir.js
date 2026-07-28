// modules/verkbeidnir.js — Work orders: list, create, detail, workflow.
import { el, mount, btn } from '../render.js';
import { sb } from '../supabase.js';
import { STORAGE_BUCKET, VAT_RATE } from '../config.js';
import { listCustomers, listLocations, listEquipment, listStaff, listProducts, getSettings, listChecklistTemplates } from '../db.js';
import { getProfile, isAdmin, role } from '../auth.js';
import { modal, fieldRow, toast, confirmDialog, errorView } from '../ui.js';
import { navigate } from '../router.js';
import { prefill } from '../state.js';
import {
  WO_TYPE, WO_STATUS, WO_PRIORITY, WO_OPEN, WO_CLOSED,
  fmtDate, fmtDateTime, money, toLocalInput, isOverdue, fmtDuration, hoursFromMs,
} from '../fmt.js';
import { signaturePad } from './signature.js';

export async function render(container, param) {
  if (param === 'new') return woForm(container);
  if (param) return renderDetail(container, param);
  return renderList(container);
}

// Open job past its due date
function woOverdue(w) {
  if (WO_CLOSED.includes(w.status)) return false;
  return isOverdue(w.due_date);
}

// ---------------- List ----------------
async function renderList(container) {
  mount(container, el('div', { class: 'empty' }, 'Loading…'));
  const statusSel = el('select', { style: { maxWidth: '180px' } }, [
    el('option', { value: 'open' }, 'Open jobs'),
    el('option', { value: 'all' }, 'All'),
    ...Object.entries(WO_STATUS).map(([v, l]) => el('option', { value: v }, l)),
  ]);
  const search = el('input', { type: 'search', placeholder: 'Search…', style: { maxWidth: '240px' } });
  const techSel = el('select', { style: { maxWidth: '190px' } }, [el('option', { value: '' }, 'All technicians')]);
  listStaff().then((staff) => staff.forEach((s) => techSel.append(el('option', { value: s.id }, s.full_name || s.email)))).catch(() => {});
  const listWrap = el('div', {});
  let rows = []; // last fetched data (for client-side search)

  async function load() {
    mount(listWrap, el('div', { class: 'empty' }, 'Loading…'));
    let q = sb.from('work_orders').select('*, customers(name), profiles:assigned_to(full_name)')
      .order('created_at', { ascending: false });
    const s = statusSel.value;
    if (s === 'open') q = q.in('status', WO_OPEN);
    else if (s !== 'all') q = q.eq('status', s);
    const { data, error } = await q;
    if (error) { mount(listWrap, el('div', { class: 'empty' }, error.message)); return; }
    rows = data || [];
    draw();
  }
  function draw() {
    const t = search.value.trim().toLowerCase();
    const tech = techSel.value;
    const list = rows.filter((w) =>
      (!tech || w.assigned_to === tech) &&
      (!t || [`#${w.number}`, w.title, w.customers?.name].some((x) => (x || '').toLowerCase().includes(t))));
    if (!list.length) { mount(listWrap, el('div', { class: 'empty' }, 'No jobs.')); return; }
    mount(listWrap, list.map((w) => el('a', { class: 'list-item', href: `#/verkbeidnir/${w.id}` }, [
      el('div', { class: 'grow' }, [
        el('div', { class: 'title' }, `#${w.number} · ${w.customers?.name || 'Unknown'}`),
        el('div', { class: 'sub' }, [
          WO_TYPE[w.type] || w.type,
          w.scheduled_at && fmtDateTime(w.scheduled_at),
          w.profiles?.full_name && ('👤 ' + w.profiles.full_name),
          w.title,
        ].filter(Boolean).join(' · ')),
      ]),
      woOverdue(w) ? el('span', { class: 'badge urgent' }, 'Overdue') : null,
      w.priority === 'urgent' || w.priority === 'high'
        ? el('span', { class: `badge ${w.priority}` }, WO_PRIORITY[w.priority]) : null,
      el('span', { class: `badge ${w.status}` }, WO_STATUS[w.status] || w.status),
    ])));
  }
  statusSel.addEventListener('change', load);
  techSel.addEventListener('change', draw);
  search.addEventListener('input', draw);

  mount(container, el('div', {}, [
    el('div', { class: 'page-head' }, [
      el('h2', {}, 'Work orders'),
      el('span', { class: 'spacer' }),
      btn('+ New work order', () => woForm(container), { class: 'btn-primary' }),
    ]),
    el('div', { class: 'row', style: { marginBottom: '12px' } }, [statusSel, techSel, search]),
    listWrap,
  ]));
  await load();
}

// ---------------- New work order ----------------
async function woForm(container) {
  mount(container, el('div', { class: 'empty' }, 'Loading…'));
  const pre = prefill.take();
  let customers, staff;
  try { [customers, staff] = await Promise.all([listCustomers({ activeOnly: true }), listStaff()]); }
  catch (e) { return errorView(container, e.message); }

  const custSel = el('select', {}, [el('option', { value: '' }, '— Select customer —'),
    ...customers.map((c) => el('option', { value: c.id, selected: pre?.customerId === c.id }, c.name))]);
  const locSel = el('select', {}, [el('option', { value: '' }, '— None —')]);
  const eqSel = el('select', {}, [el('option', { value: '' }, '— None —')]);

  async function loadChildren(customerId) {
    locSel.replaceChildren(el('option', { value: '' }, '— None —'));
    eqSel.replaceChildren(el('option', { value: '' }, '— None —'));
    if (!customerId) return;
    const [locs, equip] = await Promise.all([listLocations(customerId), listEquipment({ customerId })]);
    locs.forEach((l) => locSel.append(el('option', { value: l.id }, l.name || l.address || 'Location')));
    equip.forEach((e) => eqSel.append(el('option', { value: e.id }, [e.brand, e.model, e.serial_number].filter(Boolean).join(' ') || 'Sunbed')));
  }
  custSel.addEventListener('change', () => loadChildren(custSel.value));
  if (custSel.value) { await loadChildren(custSel.value); if (pre?.equipmentId) eqSel.value = pre.equipmentId; }

  const f = {
    type: el('select', {}, Object.entries(WO_TYPE).map(([v, l]) => el('option', { value: v, selected: v === 'repair' }, l))),
    priority: el('select', {}, Object.entries(WO_PRIORITY).map(([v, l]) => el('option', { value: v, selected: v === 'normal' }, l))),
    scheduled: el('input', { type: 'datetime-local' }),
    due: el('input', { type: 'date' }),
    estimated: el('input', { type: 'number', step: '0.25' }),
    assigned: el('select', {}, [el('option', { value: '' }, '— Unassigned —'),
      ...staff.map((s) => el('option', { value: s.id }, s.full_name || s.email))]),
    title: el('input', {}),
    description: el('textarea', {}, ''),
  };

  const save = btn('Create work order', async () => {
    if (!custSel.value) { toast('Select a customer.', 'err'); return; }
    save.disabled = true;
    const me = getProfile();
    const status = (f.assigned.value || f.scheduled.value) ? 'assigned' : 'new';
    const payload = {
      customer_id: custSel.value,
      location_id: locSel.value || null,
      equipment_id: eqSel.value || null,
      type: f.type.value,
      priority: f.priority.value,
      status,
      scheduled_at: f.scheduled.value ? new Date(f.scheduled.value).toISOString() : null,
      due_date: f.due.value || null,
      estimated_hours: f.estimated.value ? Number(f.estimated.value) : null,
      assigned_to: f.assigned.value || null,
      title: f.title.value.trim() || null,
      description: f.description.value.trim() || null,
      created_by: me?.id || null,
    };
    const { data, error } = await sb.from('work_orders').insert(payload).select('id').single();
    save.disabled = false;
    if (error) { toast(error.message, 'err'); return; }
    toast('Work order created.');
    navigate('/verkbeidnir/' + data.id);
  }, { class: 'btn-primary' });

  mount(container, el('div', {}, [
    el('a', { href: '#/verkbeidnir', class: 'link-btn' }, '← Work orders'),
    el('div', { class: 'page-head' }, el('h2', {}, 'New work order')),
    el('div', { class: 'card' }, el('div', { class: 'form-grid' }, [
      fieldRow('Customer *', custSel, true),
      fieldRow('Location', locSel),
      fieldRow('Equipment', eqSel),
      fieldRow('Type', f.type),
      fieldRow('Priority', f.priority),
      fieldRow('Scheduled time', f.scheduled),
      fieldRow('Due date', f.due),
      fieldRow('Estimated hours', f.estimated),
      fieldRow('Assign to', f.assigned),
      fieldRow('Title', f.title, true),
      fieldRow('Description', f.description, true),
    ])),
    el('div', { class: 'row' }, save),
  ]));
}

// ---------------- Detail / workflow ----------------
async function renderDetail(container, id) {
  mount(container, el('div', { class: 'empty' }, 'Loading…'));
  try {
    const [woRes, partsRes, photosRes, commentsRes, timeRes, checklistRes, staff] = await Promise.all([
      sb.from('work_orders').select('*, customers(id,name,kennitala), locations(name,address,access_notes), equipment(id,brand,model,serial_number), profiles:assigned_to(full_name)').eq('id', id).maybeSingle(),
      sb.from('work_order_parts').select('*, products(name)').eq('work_order_id', id).order('created_at'),
      sb.from('work_order_photos').select('*').eq('work_order_id', id).order('uploaded_at'),
      sb.from('work_order_comments').select('*, profiles:author_id(full_name)').eq('work_order_id', id).order('created_at'),
      sb.from('work_order_time_logs').select('*, profiles:technician_id(full_name)').eq('work_order_id', id),
      sb.from('work_order_checklist_items').select('*, profiles:checked_by(full_name)').eq('work_order_id', id).order('position'),
      listStaff(),
    ]);
    if (woRes.error) throw woRes.error;
    const wo = woRes.data;
    if (!wo) return errorView(container, 'Work order not found.');
    const parts = partsRes.data || [];
    const photos = photosRes.data || [];
    const comments = commentsRes.data || [];
    const timeLogs = timeRes.data || [];
    const checklist = checklistRes.data || [];
    const reload = () => renderDetail(container, id);

    // --- Header ---
    const header = el('div', { class: 'card' }, [
      el('div', { class: 'row', style: { justifyContent: 'space-between' } }, [
        el('h2', { style: { margin: 0 } }, `Job #${wo.number}`),
        el('div', { class: 'row' }, [
          woOverdue(wo) ? el('span', { class: 'badge urgent' }, 'Overdue') : null,
          el('span', { class: `badge ${wo.priority}` }, WO_PRIORITY[wo.priority]),
          el('span', { class: `badge ${wo.status}` }, WO_STATUS[wo.status]),
        ]),
      ]),
      el('div', { class: 'muted', style: { marginTop: '8px' } }, [
        wo.customers && el('a', { href: `#/vidskiptavinir/${wo.customers.id}`, class: 'link-btn' }, wo.customers.name),
      ]),
      infoGrid([
        ['Type', WO_TYPE[wo.type]],
        ['Location', wo.locations?.name],
        ['Equipment', wo.equipment && [wo.equipment.brand, wo.equipment.model].filter(Boolean).join(' ')],
        ['Scheduled', fmtDateTime(wo.scheduled_at)],
        ['Due date', fmtDate(wo.due_date)],
        ['Est. hours', wo.estimated_hours],
        ['Assigned', wo.profiles?.full_name],
        ['Created', fmtDate(wo.created_at)],
        ['Labour hours', wo.labor_hours],
        ['Completed', fmtDateTime(wo.completed_at)],
      ]),
      wo.locations?.access_notes ? el('p', { class: 'muted' }, '🔑 ' + wo.locations.access_notes) : null,
      wo.title ? el('p', {}, el('strong', {}, wo.title)) : null,
      wo.description ? el('p', {}, wo.description) : null,
      wo.resolution ? el('p', {}, [el('span', { class: 'muted' }, 'Resolution: '), wo.resolution]) : null,
      el('div', { class: 'row', style: { marginTop: '8px' } }, [
        btn('Edit', () => editWo(wo, staff, reload), { class: 'btn-ghost btn-sm' }),
        btn('🖨️ Print job sheet', () => printJobSheet(wo, parts), { class: 'btn-ghost btn-sm' }),
        wo.signature_path ? btn('View signature', async () => openStored(wo.signature_path), { class: 'btn-ghost btn-sm' }) : null,
        isAdmin() ? btn('Delete', async () => {
          if (!(await confirmDialog(`Delete job #${wo.number}? This cannot be undone.`))) return;
          const { error } = await sb.from('work_orders').delete().eq('id', wo.id);
          if (error) { toast(error.message, 'err'); return; }
          toast('Work order deleted.'); navigate('/verkbeidnir');
        }, { class: 'btn-ghost btn-sm' }) : null,
      ]),
    ]);

    // --- Workflow (status) ---
    const flow = el('div', { class: 'card' }, [
      el('h3', { style: { marginTop: 0 } }, 'Job status'),
      el('div', { class: 'row' }, statusButtons(wo, reload)),
    ]);

    // --- Parts / bulbs ---
    const partsTotal = parts.reduce((s, p) => s + (Number(p.quantity) || 0) * (Number(p.unit_price) || 0), 0);
    const partsSection = el('div', { class: 'card' }, [
      el('div', { class: 'row', style: { justifyContent: 'space-between', marginBottom: '10px' } }, [
        el('h3', { style: { margin: 0 } }, 'Parts & bulbs'),
        btn('+ Add', () => partForm(wo.id, reload), { class: 'btn-ghost btn-sm' }),
      ]),
      parts.length ? el('div', {}, parts.map((p) => el('div', { class: 'list-item' }, [
        el('div', { class: 'grow' }, [
          el('div', { class: 'title' }, p.description || p.products?.name || 'Item'),
          el('div', { class: 'sub' }, `${p.quantity} × ${money(p.unit_price || 0)} = ${money((p.quantity || 0) * (p.unit_price || 0))}`),
        ]),
        btn('✕', async () => {
          if (!(await confirmDialog('Remove item?'))) return;
          await sb.from('work_order_parts').delete().eq('id', p.id);
          reload();
        }, { class: 'btn-ghost btn-sm' }),
      ]))) : el('div', { class: 'muted' }, 'No items recorded.'),
      parts.length ? el('div', { class: 'row', style: { justifyContent: 'flex-end', fontWeight: '600' } }, `Total: ${money(partsTotal)}`) : null,
    ]);

    // --- Photos ---
    const photoSection = el('div', { class: 'card' }, [
      el('div', { class: 'row', style: { justifyContent: 'space-between', marginBottom: '10px' } }, [
        el('h3', { style: { margin: 0 } }, 'Photos'),
        photoUploadBtn(wo.id, reload),
      ]),
      photos.length
        ? el('div', { class: 'row' }, photos.map((ph) => photoThumb(ph, reload)))
        : el('div', { class: 'muted' }, 'No photos.'),
    ]);

    // --- Complete job ---
    const completeSection = (!WO_CLOSED.includes(wo.status))
      ? el('div', { class: 'card' }, [
          el('h3', { style: { marginTop: 0 } }, 'Complete job'),
          btn('Record resolution & signature', () => completeWo(wo, reload), { class: 'btn-primary' }),
        ])
      : null;

    // --- Invoice ---
    const invoiceSection = (isAdmin() || role() === 'office')
      ? el('div', { class: 'card' }, [
          el('h3', { style: { marginTop: 0 } }, 'Invoicing'),
          wo.status === 'invoiced'
            ? el('div', { class: 'muted' }, 'This job has been invoiced.')
            : el('div', { class: 'row' }, [
                btn('Create invoice', () => makeInvoice(wo, parts, 'invoice', reload), { class: 'btn-primary' }),
                btn('Create quote', () => makeInvoice(wo, parts, 'quote', reload), { class: 'btn-ghost' }),
              ]),
        ])
      : null;

    const commentsSection = buildComments(wo.id, comments, reload);
    const timeSection = buildTimeCard(wo, timeLogs, reload);
    const checklistSection = buildChecklist(wo, checklist, reload);

    mount(container, el('div', {}, [
      el('a', { href: '#/verkbeidnir', class: 'link-btn' }, '← Work orders'),
      header, flow, timeSection, checklistSection, partsSection, photoSection, commentsSection, completeSection, invoiceSection,
    ]));
  } catch (e) {
    console.error(e);
    errorView(container, e.message);
  }
}

// ---- Comments thread ----
function buildComments(woId, comments, reload) {
  const input = el('textarea', { placeholder: 'Write a comment…', style: { minHeight: '60px' } });
  const post = btn('Post', async () => {
    const body = input.value.trim();
    if (!body) return;
    post.disabled = true;
    const me = getProfile();
    const { error } = await sb.from('work_order_comments').insert({ work_order_id: woId, author_id: me?.id || null, body });
    post.disabled = false;
    if (error) { toast(error.message, 'err'); return; }
    input.value = ''; reload();
  }, { class: 'btn-primary btn-sm' });

  return el('div', { class: 'card' }, [
    el('h3', { style: { marginTop: 0 } }, `Comments${comments.length ? ` (${comments.length})` : ''}`),
    comments.length ? el('div', { style: { marginBottom: '12px' } }, comments.map((c) => el('div', {
      style: { padding: '10px 12px', background: 'var(--surface-2)', borderRadius: 'var(--radius-sm)', marginBottom: '8px' },
    }, [
      el('div', { style: { whiteSpace: 'pre-wrap' } }, c.body),
      el('div', { class: 'muted', style: { fontSize: '12px', marginTop: '4px' } },
        [c.profiles?.full_name || 'Unknown', fmtDateTime(c.created_at)].join(' · ')),
    ]))) : el('div', { class: 'muted', style: { marginBottom: '12px' } }, 'No comments yet.'),
    input,
    el('div', { class: 'row', style: { justifyContent: 'flex-end', marginTop: '8px' } }, post),
  ]);
}

// ---- Checklist ----
function buildChecklist(wo, items, reload) {
  const total = items.length;
  const done = items.filter((i) => i.is_done).length;
  const pct = total ? Math.round((done / total) * 100) : 0;

  const toggle = async (item, checked) => {
    const me = getProfile();
    const patch = checked
      ? { is_done: true, checked_by: me?.id || null, checked_at: new Date().toISOString() }
      : { is_done: false, checked_by: null, checked_at: null };
    const { error } = await sb.from('work_order_checklist_items').update(patch).eq('id', item.id);
    if (error) toast(error.message, 'err'); else reload();
  };

  const rowEls = items.map((item) => {
    const cb = el('input', { type: 'checkbox', checked: item.is_done, style: { width: 'auto' } });
    cb.addEventListener('change', () => toggle(item, cb.checked));
    return el('div', { class: 'row', style: { justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid var(--border)' } }, [
      el('label', { class: 'row', style: { gap: '10px', flex: '1', cursor: 'pointer' } }, [
        cb, el('span', item.is_done ? { style: { textDecoration: 'line-through', color: 'var(--muted)' } } : {}, item.label),
      ]),
      item.is_done && item.profiles?.full_name ? el('span', { class: 'muted', style: { fontSize: '11px', whiteSpace: 'nowrap' } }, item.profiles.full_name) : null,
      btn('✕', async () => { await sb.from('work_order_checklist_items').delete().eq('id', item.id); reload(); }, { class: 'link-btn' }),
    ]);
  });

  const newItem = el('input', { placeholder: 'Add item…' });
  const addItem = async () => {
    const label = newItem.value.trim(); if (!label) return;
    const { error } = await sb.from('work_order_checklist_items').insert({ work_order_id: wo.id, label, position: items.length });
    if (error) { toast(error.message, 'err'); return; }
    reload();
  };
  newItem.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addItem(); } });

  return el('div', { class: 'card' }, [
    el('div', { class: 'row', style: { justifyContent: 'space-between', marginBottom: '8px' } }, [
      el('h3', { style: { margin: 0 } }, `Checklist${total ? ` · ${done}/${total}` : ''}`),
      btn('Apply template', () => applyTemplate(wo, items.length, reload), { class: 'btn-ghost btn-sm' }),
    ]),
    total ? el('div', { class: `meter ${pct === 100 ? '' : 'warn'}` }, el('span', { style: { width: pct + '%' } })) : null,
    total ? el('div', { style: { marginTop: '10px' } }, rowEls) : el('div', { class: 'muted' }, 'No checklist. Apply a template or add items below.'),
    el('div', { class: 'row', style: { marginTop: '10px' } }, [newItem, btn('Add', addItem, { class: 'btn-ghost btn-sm' })]),
  ]);
}

async function applyTemplate(wo, startPos, reload) {
  let templates = [];
  try { templates = await listChecklistTemplates(); } catch (e) { toast(e.message, 'err'); return; }
  if (!templates.length) { toast('No templates yet — create them in Admin.', 'err'); return; }
  const sel = el('select', {}, templates.map((t) => el('option', { value: t.id }, t.name + (t.wo_type ? ` (${WO_TYPE[t.wo_type] || t.wo_type})` : ''))));
  const match = templates.find((t) => t.wo_type === wo.type); if (match) sel.value = match.id;
  modal({
    title: 'Apply checklist template',
    saveLabel: 'Apply',
    body: el('div', {}, fieldRow('Template', sel, true)),
    onSave: async () => {
      const t = templates.find((x) => x.id === sel.value);
      if (!t) return false;
      const rows = (t.items || []).map((label, i) => ({ work_order_id: wo.id, label, position: startPos + i }));
      if (rows.length) { const { error } = await sb.from('work_order_checklist_items').insert(rows); if (error) { toast(error.message, 'err'); return false; } }
      toast('Checklist applied.'); reload();
    },
  });
}

// ---- Time tracking (clock in / out) ----
function buildTimeCard(wo, logs, reload) {
  const me = getProfile();
  const dur = (l) => (l.clock_out ? new Date(l.clock_out) : new Date()).getTime() - new Date(l.clock_in).getTime();
  const totalMs = logs.reduce((s, l) => s + dur(l), 0);
  const trackedH = hoursFromMs(totalMs);
  const myOpen = logs.find((l) => !l.clock_out && l.technician_id === me?.id);

  const clockBtn = myOpen
    ? btn('■ Clock out', async () => {
        const { error } = await sb.from('work_order_time_logs').update({ clock_out: new Date().toISOString() }).eq('id', myOpen.id);
        if (error) { toast(error.message, 'err'); return; }
        toast('Clocked out.'); reload();
      }, { class: 'btn-primary btn-sm' })
    : btn('▶ Clock in', async () => {
        const patch = { work_order_id: wo.id, technician_id: me?.id || null };
        const { error } = await sb.from('work_order_time_logs').insert(patch);
        if (error) { toast(error.message, 'err'); return; }
        // moving to work → mark on site if still en route
        if (['new', 'assigned', 'accepted', 'travelling'].includes(wo.status)) {
          await sb.from('work_orders').update({ status: 'on_site' }).eq('id', wo.id);
        }
        toast('Clocked in.'); reload();
      }, { class: 'btn-primary btn-sm' });

  const rows = logs.slice().sort((a, b) => new Date(b.clock_in) - new Date(a.clock_in)).map((l) =>
    el('div', { class: 'list-item' }, [
      el('div', { class: 'grow' }, [
        el('div', { class: 'title' }, l.profiles?.full_name || 'Technician'),
        el('div', { class: 'sub' }, fmtDateTime(l.clock_in) + ' → ' + (l.clock_out ? fmtDateTime(l.clock_out) : 'now')),
      ]),
      el('span', { class: `badge ${l.clock_out ? 'completed' : 'on_site'}` }, (l.clock_out ? '' : 'active · ') + fmtDuration(dur(l))),
    ]));

  const useBtn = trackedH > 0 ? btn(`Use ${trackedH}h as labour`, async () => {
    const { error } = await sb.from('work_orders').update({ labor_hours: trackedH }).eq('id', wo.id);
    if (error) { toast(error.message, 'err'); return; }
    toast('Labour hours set to ' + trackedH + 'h.'); reload();
  }, { class: 'btn-ghost btn-sm' }) : null;

  return el('div', { class: 'card' }, [
    el('div', { class: 'row', style: { justifyContent: 'space-between', marginBottom: '10px' } }, [
      el('h3', { style: { margin: 0 } }, 'Time tracking'),
      clockBtn,
    ]),
    el('div', { class: 'row', style: { justifyContent: 'space-between' } }, [
      el('span', { class: 'muted' }, 'Total tracked'),
      el('strong', {}, fmtDuration(totalMs) + (trackedH ? ` · ${trackedH}h` : '')),
    ]),
    useBtn ? el('div', { class: 'row', style: { marginTop: '8px' } }, useBtn) : null,
    rows.length ? el('div', { style: { marginTop: '10px' } }, rows) : el('div', { class: 'muted', style: { marginTop: '8px' } }, 'No time logged yet.'),
  ]);
}

// ---- Printable job sheet ----
function printJobSheet(wo, parts) {
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const rows = parts.map((p) => `<tr><td>${esc(p.description || p.products?.name || 'Item')}</td><td style="text-align:right">${p.quantity}</td><td style="text-align:right">${money(p.unit_price || 0)}</td><td style="text-align:right">${money((p.quantity || 0) * (p.unit_price || 0))}</td></tr>`).join('');
  const total = parts.reduce((s, p) => s + (Number(p.quantity) || 0) * (Number(p.unit_price) || 0), 0);
  const line = (label, val) => val ? `<div style="margin:4px 0"><strong>${esc(label)}:</strong> ${esc(val)}</div>` : '';
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Job #${wo.number}</title>
    <style>body{font-family:Segoe UI,system-ui,Arial,sans-serif;color:#1b1520;padding:32px;max-width:800px;margin:0 auto}
    h1{font-size:22px;margin:0 0 4px} .brand{background:linear-gradient(135deg,#531E52,#b24c96);-webkit-background-clip:text;background-clip:text;color:transparent;font-weight:700;font-size:20px}
    table{width:100%;border-collapse:collapse;margin-top:12px} td,th{border-bottom:1px solid #e4dfea;padding:8px;text-align:left}
    .muted{color:#6d6579;font-size:13px} .sig{margin-top:40px;border-top:1px solid #ccc;padding-top:6px;width:260px}</style></head>
    <body>
    <div class="brand">BRONZE DIRECT</div>
    <h1>Job sheet #${wo.number}</h1>
    <div class="muted">${esc(WO_TYPE[wo.type] || wo.type)} · ${esc(WO_STATUS[wo.status] || wo.status)}</div>
    <hr style="border:none;border-top:1px solid #e4dfea;margin:16px 0">
    ${line('Customer', wo.customers?.name)}
    ${line('Location', wo.locations?.name || wo.locations?.address)}
    ${line('Equipment', wo.equipment && [wo.equipment.brand, wo.equipment.model].filter(Boolean).join(' '))}
    ${line('Scheduled', fmtDateTime(wo.scheduled_at))}
    ${line('Assigned to', wo.profiles?.full_name)}
    ${line('Title', wo.title)}
    ${wo.description ? `<div style="margin:8px 0"><strong>Description:</strong><br>${esc(wo.description)}</div>` : ''}
    ${wo.resolution ? `<div style="margin:8px 0"><strong>Resolution:</strong><br>${esc(wo.resolution)}</div>` : ''}
    ${parts.length ? `<table><thead><tr><th>Item</th><th style="text-align:right">Qty</th><th style="text-align:right">Unit</th><th style="text-align:right">Total</th></tr></thead><tbody>${rows}<tr><td colspan="3" style="text-align:right"><strong>Total</strong></td><td style="text-align:right"><strong>${money(total)}</strong></td></tr></tbody></table>` : ''}
    ${line('Labour hours', wo.labor_hours)}
    <div class="sig">Signature${wo.signed_name ? ': ' + esc(wo.signed_name) : ''}</div>
    </body></html>`;
  const w = window.open('', '_blank');
  if (!w) { toast('Allow pop-ups to print.', 'err'); return; }
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 300);
}

// ---- Status buttons (technician workflow) ----
function statusButtons(wo, reload) {
  const set = (status, extra = {}) => async () => {
    const payload = { status, ...extra };
    if (status === 'completed' && !wo.completed_at) payload.completed_at = new Date().toISOString();
    const { error } = await sb.from('work_orders').update(payload).eq('id', wo.id);
    if (error) { toast(error.message, 'err'); return; }
    reload();
  };
  const S = wo.status;
  const out = [];
  if (S === 'new') out.push(btn('Mark assigned', set('assigned'), { class: 'btn-primary btn-sm' }));
  if (S === 'assigned') out.push(btn('Accept', set('accepted'), { class: 'btn-primary btn-sm' }));
  if (S === 'accepted') out.push(btn('Start travel', set('travelling'), { class: 'btn-primary btn-sm' }));
  if (S === 'travelling') out.push(btn('Arrived on site', set('on_site'), { class: 'btn-primary btn-sm' }));
  if (S === 'on_site') {
    out.push(btn('Pause', set('paused'), { class: 'btn-ghost btn-sm' }));
    out.push(btn('Waiting for parts', set('waiting_parts'), { class: 'btn-ghost btn-sm' }));
  }
  if (S === 'paused' || S === 'waiting_parts') out.push(btn('Resume (on site)', set('on_site'), { class: 'btn-primary btn-sm' }));
  if (['new', 'assigned', 'accepted', 'travelling'].includes(S)) out.push(btn('Skip to on site', set('on_site'), { class: 'btn-ghost btn-sm' }));
  if (!WO_CLOSED.includes(S)) {
    out.push(btn('Cancel', async () => {
      if (!(await confirmDialog('Cancel this work order?'))) return;
      await set('cancelled')();
    }, { class: 'btn-ghost btn-sm' }));
  }
  if (!out.length) out.push(el('span', { class: 'muted' }, 'No actions available.'));
  return out;
}

// ---- Edit work order ----
async function editWo(wo, staff, reload) {
  const f = {
    type: el('select', {}, Object.entries(WO_TYPE).map(([v, l]) => el('option', { value: v, selected: v === wo.type }, l))),
    priority: el('select', {}, Object.entries(WO_PRIORITY).map(([v, l]) => el('option', { value: v, selected: v === wo.priority }, l))),
    scheduled: el('input', { type: 'datetime-local', value: wo.scheduled_at ? toLocalInput(wo.scheduled_at) : '' }),
    due: el('input', { type: 'date', value: wo.due_date || '' }),
    estimated: el('input', { type: 'number', step: '0.25', value: wo.estimated_hours ?? '' }),
    assigned: el('select', {}, [el('option', { value: '' }, '— Unassigned —'),
      ...staff.map((s) => el('option', { value: s.id, selected: s.id === wo.assigned_to }, s.full_name || s.email))]),
    title: el('input', { value: wo.title || '' }),
    description: el('textarea', {}, wo.description || ''),
  };
  modal({
    title: `Edit job #${wo.number}`,
    body: el('div', { class: 'form-grid' }, [
      fieldRow('Type', f.type),
      fieldRow('Priority', f.priority),
      fieldRow('Scheduled time', f.scheduled),
      fieldRow('Due date', f.due),
      fieldRow('Estimated hours', f.estimated),
      fieldRow('Assign to', f.assigned),
      fieldRow('Title', f.title, true),
      fieldRow('Description', f.description, true),
    ]),
    onSave: async () => {
      const { error } = await sb.from('work_orders').update({
        type: f.type.value,
        priority: f.priority.value,
        scheduled_at: f.scheduled.value ? new Date(f.scheduled.value).toISOString() : null,
        due_date: f.due.value || null,
        estimated_hours: f.estimated.value ? Number(f.estimated.value) : null,
        assigned_to: f.assigned.value || null,
        title: f.title.value.trim() || null,
        description: f.description.value.trim() || null,
      }).eq('id', wo.id);
      if (error) { toast(error.message, 'err'); return false; }
      toast('Saved.'); reload();
    },
  });
}

// ---- Part ----
async function partForm(woId, reload) {
  let products = [];
  try { products = await listProducts(); } catch { /* skip */ }
  const prodSel = el('select', {}, [el('option', { value: '' }, '— Free text —'),
    ...products.map((p) => el('option', { value: p.id, dataset: { price: p.sale_price ?? '' } }, `${p.name}${p.sale_price ? ' · ' + money(p.sale_price) : ''}`))]);
  const desc = el('input', {});
  const qty = el('input', { type: 'number', step: '0.01', value: '1' });
  const price = el('input', { type: 'number', step: '0.01', value: '' });
  prodSel.addEventListener('change', () => {
    const opt = prodSel.selectedOptions[0];
    if (prodSel.value) {
      desc.value = opt.textContent.split(' · ')[0];
      if (opt.dataset.price) price.value = opt.dataset.price;
    }
  });
  modal({
    title: 'Add item',
    body: el('div', { class: 'form-grid' }, [
      fieldRow('Product', prodSel, true),
      fieldRow('Description', desc, true),
      fieldRow('Quantity', qty),
      fieldRow('Unit price', price),
    ]),
    onSave: async () => {
      if (!desc.value.trim() && !prodSel.value) { toast('Description is required.', 'err'); return false; }
      const { error } = await sb.from('work_order_parts').insert({
        work_order_id: woId,
        product_id: prodSel.value || null,
        description: desc.value.trim() || null,
        quantity: Number(qty.value) || 1,
        unit_price: price.value ? Number(price.value) : null,
      });
      if (error) { toast(error.message, 'err'); return false; }
      toast('Added.'); reload();
    },
  });
}

// ---- Complete job (resolution + signature) ----
function completeWo(wo, reload) {
  const resolution = el('textarea', {}, wo.resolution || '');
  const hours = el('input', { type: 'number', step: '0.25', value: wo.labor_hours ?? '' });
  const signedName = el('input', { value: wo.signed_name || '' });
  const pad = signaturePad();
  const body = el('div', {}, [
    fieldRow('Resolution / work done', resolution, true),
    fieldRow('Labour hours', hours),
    fieldRow('Name of signatory', signedName),
    el('div', { class: 'field' }, [el('label', {}, 'Customer signature'), pad.element]),
  ]);
  modal({
    title: `Complete job #${wo.number}`,
    saveLabel: 'Mark done',
    body,
    onSave: async () => {
      const update = {
        status: 'completed',
        resolution: resolution.value.trim() || null,
        labor_hours: hours.value ? Number(hours.value) : null,
        signed_name: signedName.value.trim() || null,
        completed_at: new Date().toISOString(),
      };
      if (pad.hasInk()) {
        try {
          const blob = await pad.toBlob();
          const path = `work_orders/${wo.id}/signature-${Date.now()}.png`;
          const { error: upErr } = await sb.storage.from(STORAGE_BUCKET).upload(path, blob, { upsert: true, contentType: 'image/png' });
          if (upErr) throw upErr;
          update.signature_path = path;
        } catch (e) { toast('Signature not saved: ' + e.message, 'err'); }
      }
      const { error } = await sb.from('work_orders').update(update).eq('id', wo.id);
      if (error) { toast(error.message, 'err'); return false; }
      toast('Job completed.'); reload();
    },
  });
}

// ---- Invoice / quote from job ----
async function makeInvoice(wo, parts, kind, reload) {
  const label = kind === 'quote' ? 'quote' : 'invoice';
  if (!(await confirmDialog(`Create a ${label} from this job?`, { danger: false, confirmLabel: 'Create' }))) return;
  const me = getProfile();
  const settings = await getSettings().catch(() => ({}));
  const laborRate = Number(settings?.labor_rate) || 0;
  const { data: inv, error } = await sb.from('invoices').insert({
    kind,
    customer_id: wo.customer_id,
    work_order_id: wo.id,
    vat_rate: settings?.vat_rate ?? VAT_RATE,
    created_by: me?.id || null,
  }).select('id').single();
  if (error) { toast(error.message, 'err'); return; }
  const lines = parts.map((p) => ({
    invoice_id: inv.id,
    product_id: p.product_id || null,
    description: p.description || p.products?.name || 'Item',
    quantity: p.quantity || 1,
    unit_price: p.unit_price || 0,
  }));
  if (wo.labor_hours) {
    lines.push({ invoice_id: inv.id, description: 'Labour', quantity: wo.labor_hours, unit_price: laborRate });
  }
  if (lines.length) {
    const { error: le } = await sb.from('invoice_lines').insert(lines);
    if (le) { toast(`${label} created but lines failed: ` + le.message, 'err'); }
  }
  if (kind === 'invoice') await sb.from('work_orders').update({ status: 'invoiced' }).eq('id', wo.id);
  toast(`${kind === 'quote' ? 'Quote' : 'Invoice'} created.`);
  navigate('/reikningar/' + inv.id);
}

// ---- Photos ----
function photoUploadBtn(woId, reload) {
  const input = el('input', { type: 'file', accept: 'image/*', capture: 'environment', style: { display: 'none' } });
  input.addEventListener('change', async () => {
    const file = input.files[0];
    if (!file) return;
    try {
      const path = `work_orders/${woId}/${Date.now()}-${Math.round(Math.random() * 1e6)}.jpg`;
      const { error: upErr } = await sb.storage.from(STORAGE_BUCKET).upload(path, file, { contentType: file.type || 'image/jpeg' });
      if (upErr) throw upErr;
      const me = getProfile();
      await sb.from('work_order_photos').insert({ work_order_id: woId, storage_path: path, uploaded_by: me?.id || null });
      toast('Photo saved.'); reload();
    } catch (e) { toast('Photo not saved: ' + e.message, 'err'); }
  });
  const b = btn('+ Photo', () => input.click(), { class: 'btn-ghost btn-sm' });
  return el('span', {}, [b, input]);
}

function photoThumb(ph, reload) {
  const img = el('img', { alt: ph.caption || 'Photo', style: { width: '90px', height: '90px', objectFit: 'cover', borderRadius: '10px', cursor: 'pointer', border: '1px solid var(--border)' } });
  sb.storage.from(STORAGE_BUCKET).createSignedUrl(ph.storage_path, 3600).then(({ data }) => { if (data?.signedUrl) img.src = data.signedUrl; });
  img.addEventListener('click', () => openStored(ph.storage_path));
  return el('div', {}, [
    img,
    el('div', { style: { textAlign: 'center' } }, btn('✕', async () => {
      if (!(await confirmDialog('Delete photo?'))) return;
      await sb.storage.from(STORAGE_BUCKET).remove([ph.storage_path]);
      await sb.from('work_order_photos').delete().eq('id', ph.id);
      reload();
    }, { class: 'link-btn' })),
  ]);
}

async function openStored(path) {
  const { data } = await sb.storage.from(STORAGE_BUCKET).createSignedUrl(path, 3600);
  if (data?.signedUrl) window.open(data.signedUrl, '_blank');
}

function infoGrid(pairs) {
  return el('div', { class: 'grid', style: { gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', marginTop: '12px' } },
    pairs.filter(([, v]) => v != null && v !== '').map(([k, v]) => el('div', {}, [
      el('div', { class: 'muted', style: { fontSize: '12px' } }, k),
      el('div', {}, String(v)),
    ])));
}
