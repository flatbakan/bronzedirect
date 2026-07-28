// modules/taeki.js — Assets (the centre of the system): tabbed single-source-of-truth page.
import { el, mount, btn } from '../render.js';
import { sb } from '../supabase.js';
import { STORAGE_BUCKET } from '../config.js';
import { listCustomers, listLocations, listProducts, listEquipment, getSettings } from '../db.js';
import { getProfile } from '../auth.js';
import { modal, fieldRow, toast, confirmDialog, errorView } from '../ui.js';
import { navigate } from '../router.js';
import { prefill } from '../state.js';
import {
  EQUIP_STATUS, WO_TYPE, WO_STATUS, WO_OPEN, fmtDate, fmtDateTime, todayISO,
  money, bulbLife, bulbPct, isBulbDue,
} from '../fmt.js';

const assetName = (e) => e.name || [e.brand, e.model].filter(Boolean).join(' ') || 'Asset';

export async function render(container, param) {
  if (param === 'new') return equipForm(container, null);
  if (param) return renderDetail(container, param);
  return renderList(container);
}

// ---------------- List ----------------
async function renderList(container) {
  mount(container, el('div', { class: 'empty' }, 'Loading…'));
  let rows, settings;
  try { [rows, settings] = await Promise.all([listEquipment(), getSettings()]); }
  catch (e) { return errorView(container, e.message); }
  rows = rows.filter((e) => !e.archived);

  const search = el('input', { type: 'search', placeholder: 'Search (name, asset #, serial, customer)…', style: { maxWidth: '340px' } });
  const dueOnly = el('input', { type: 'checkbox' });
  const listWrap = el('div', {});
  function draw() {
    const t = search.value.trim().toLowerCase();
    const list = rows.filter((e) =>
      (!dueOnly.checked || isBulbDue(e, settings)) &&
      (!t || [assetName(e), e.serial_number, e.asset_no && ('A' + e.asset_no), e.customers?.name].some((x) => String(x || '').toLowerCase().includes(t))));
    if (!list.length) { mount(listWrap, el('div', { class: 'empty' }, 'No assets.')); return; }
    mount(listWrap, list.map((e) => el('a', { class: 'list-item', href: `#/taeki/${e.id}` }, [
      el('div', { class: 'grow' }, [
        el('div', { class: 'title' }, assetName(e)),
        el('div', { class: 'sub' }, [e.asset_no && ('#A' + e.asset_no), e.customers?.name, e.locations?.name, e.serial_number && ('S/N ' + e.serial_number)].filter(Boolean).join(' · ')),
      ]),
      isBulbDue(e, settings) ? el('span', { class: 'badge urgent' }, '💡 Bulbs due') : null,
      el('span', { class: `badge ${e.status === 'in_service' ? 'done' : e.status === 'needs_service' ? 'urgent' : 'cancelled'}` }, EQUIP_STATUS[e.status] || e.status),
    ])));
  }
  dueOnly.addEventListener('change', draw);
  search.addEventListener('input', draw);
  mount(container, el('div', {}, [
    el('div', { class: 'page-head' }, [
      el('h2', {}, 'Assets'),
      el('span', { class: 'spacer' }),
      btn('+ New asset', () => equipForm(container, null), { class: 'btn-primary' }),
    ]),
    el('div', { class: 'row', style: { marginBottom: '12px' } }, [
      search,
      el('label', { class: 'row', style: { gap: '6px', fontSize: '14px', color: 'var(--muted)' } }, [dueOnly, 'Bulbs due only']),
    ]),
    listWrap,
  ]));
  draw();
}

// ---------------- Form ----------------
async function equipForm(container, existing) {
  mount(container, el('div', { class: 'empty' }, 'Loading…'));
  const pre = prefill.take();
  let customers = [];
  try { customers = await listCustomers({ activeOnly: true }); }
  catch (e) { return errorView(container, e.message); }

  const custSel = el('select', {}, [el('option', { value: '' }, '— Select customer —'),
    ...customers.map((c) => el('option', { value: c.id, selected: (existing?.customer_id || pre?.customerId) === c.id }, c.name))]);
  const locSel = el('select', {}, [el('option', { value: '' }, '— None —')]);
  async function loadLocs(customerId, selectedId) {
    locSel.replaceChildren(el('option', { value: '' }, '— None —'));
    if (!customerId) return;
    const locs = await listLocations(customerId);
    locs.forEach((l) => locSel.append(el('option', { value: l.id, selected: l.id === selectedId }, l.name || l.address || 'Location')));
  }
  custSel.addEventListener('change', () => loadLocs(custSel.value, null));
  await loadLocs(custSel.value, existing?.location_id);

  const f = {
    name: el('input', { value: existing?.name || '' }),
    type: el('input', { value: existing?.type || '' }),
    brand: el('input', { value: existing?.brand || '' }),
    model: el('input', { value: existing?.model || '' }),
    serial: el('input', { value: existing?.serial_number || '' }),
    install: el('input', { type: 'date', value: existing?.install_date || '' }),
    warranty: el('input', { type: 'date', value: existing?.warranty_until || '' }),
    status: el('select', {}, Object.entries(EQUIP_STATUS).map(([v, l]) => el('option', { value: v, selected: (existing?.status || 'in_service') === v }, l))),
    bulbType: el('input', { value: existing?.bulb_type || '' }),
    bulbCount: el('input', { type: 'number', value: existing?.bulb_count ?? '' }),
    facial: el('input', { type: 'number', value: existing?.facial_bulb_count ?? '' }),
    hours: el('input', { type: 'number', step: '0.1', value: existing?.current_bulb_hours ?? '' }),
    life: el('input', { type: 'number', step: '1', value: existing?.bulb_life_hours ?? '' }),
    notes: el('textarea', {}, existing?.notes || ''),
  };

  const form = el('div', { class: 'form-grid' }, [
    fieldRow('Customer *', custSel, true),
    fieldRow('Location', locSel, true),
    fieldRow('Name', f.name),
    fieldRow('Type (e.g. Sunbed, Spare)', f.type),
    fieldRow('Manufacturer', f.brand),
    fieldRow('Model', f.model),
    fieldRow('Serial number', f.serial),
    fieldRow('Installed', f.install),
    fieldRow('Warranty until', f.warranty),
    fieldRow('Status', f.status),
    fieldRow('Bulb type', f.bulbType),
    fieldRow('Body bulbs', f.bulbCount),
    fieldRow('Facial bulbs', f.facial),
    fieldRow('Current bulb hours', f.hours),
    fieldRow('Bulb life (hrs, blank = default)', f.life),
    fieldRow('Notes', f.notes, true),
  ]);

  const save = btn(existing ? 'Save changes' : 'Create asset', async () => {
    if (!custSel.value) { toast('Select a customer.', 'err'); return; }
    save.disabled = true;
    const payload = {
      customer_id: custSel.value,
      location_id: locSel.value || null,
      name: f.name.value.trim() || null,
      type: f.type.value.trim() || null,
      brand: f.brand.value.trim() || null,
      model: f.model.value.trim() || null,
      serial_number: f.serial.value.trim() || null,
      install_date: f.install.value || null,
      warranty_until: f.warranty.value || null,
      status: f.status.value,
      bulb_type: f.bulbType.value.trim() || null,
      bulb_count: f.bulbCount.value ? Number(f.bulbCount.value) : null,
      facial_bulb_count: f.facial.value ? Number(f.facial.value) : null,
      current_bulb_hours: f.hours.value ? Number(f.hours.value) : null,
      bulb_life_hours: f.life.value ? Number(f.life.value) : null,
      notes: f.notes.value.trim() || null,
    };
    const q = existing
      ? sb.from('equipment').update(payload).eq('id', existing.id)
      : sb.from('equipment').insert(payload).select('id').single();
    const { data, error } = await q;
    save.disabled = false;
    if (error) { toast(error.message, 'err'); return; }
    toast('Saved.');
    navigate('/taeki/' + (existing?.id || data.id));
  }, { class: 'btn-primary' });

  mount(container, el('div', {}, [
    el('a', { href: '#/taeki', class: 'link-btn' }, '← Assets'),
    el('div', { class: 'page-head' }, el('h2', {}, existing ? 'Edit asset' : 'New asset')),
    el('div', { class: 'card' }, form),
    el('div', { class: 'row' }, save),
  ]));
}

// ---------------- Asset page (tabbed) ----------------
async function renderDetail(container, id) {
  mount(container, el('div', { class: 'empty' }, 'Loading…'));
  let asset, settings;
  try {
    const [eqRes, s] = await Promise.all([
      sb.from('equipment').select('*, customers(id,name), locations(name)').eq('id', id).maybeSingle(),
      getSettings(),
    ]);
    if (eqRes.error) throw eqRes.error;
    asset = eqRes.data; settings = s;
  } catch (e) { return errorView(container, e.message); }
  if (!asset) return errorView(container, 'Asset not found.');
  const reload = () => renderDetail(container, id);

  const statusBadge = el('span', { class: `badge ${asset.status === 'in_service' ? 'done' : asset.status === 'needs_service' ? 'urgent' : 'cancelled'}` }, EQUIP_STATUS[asset.status] || asset.status);

  const header = el('div', { class: 'card' }, [
    el('div', { class: 'row', style: { justifyContent: 'space-between' } }, [
      el('div', {}, [
        el('h2', { style: { margin: 0 } }, assetName(asset)),
        el('div', { class: 'muted', style: { fontSize: '13px' } }, [
          asset.asset_no && ('#A' + asset.asset_no),
          asset.customers && '·', asset.customers?.name,
        ].filter(Boolean).join(' ')),
      ]),
      el('div', { class: 'row' }, [
        isBulbDue(asset, settings) ? el('span', { class: 'badge urgent' }, '💡 Bulbs due') : null,
        statusBadge,
      ]),
    ]),
    el('div', { class: 'row', style: { marginTop: '10px' } }, [
      asset.customers ? el('a', { href: `#/vidskiptavinir/${asset.customers.id}`, class: 'link-btn' }, '↗ Customer') : null,
      btn('Edit', () => equipForm(container, asset), { class: 'btn-ghost btn-sm' }),
      btn('🏷 QR', () => showQr(asset), { class: 'btn-ghost btn-sm' }),
      btn('+ Work order', () => { prefill.set({ customerId: asset.customer_id, equipmentId: asset.id }); navigate('/verkbeidnir/new'); }, { class: 'btn-primary btn-sm' }),
      btn(asset.archived ? 'Unarchive' : 'Archive', async () => {
        const { error } = await sb.from('equipment').update({ archived: !asset.archived }).eq('id', id);
        if (error) { toast(error.message, 'err'); return; }
        toast(asset.archived ? 'Unarchived.' : 'Archived.'); reload();
      }, { class: 'btn-ghost btn-sm' }),
    ]),
  ]);

  // Tabs
  const TABS = [
    ['overview', 'Overview'], ['history', 'History'], ['workorders', 'Work orders'],
    ['photos', 'Photos'], ['documents', 'Documents'], ['maintenance', 'Maintenance'], ['parts', 'Parts'],
  ];
  const content = el('div', {});
  const tabBar = el('div', { class: 'tabs' });
  const renderers = {
    overview: () => tabOverview(asset, settings, content),
    history: () => tabHistory(asset, content),
    workorders: () => tabWorkOrders(asset, content),
    photos: () => tabPhotos(asset, content),
    documents: () => tabDocuments(asset, content),
    maintenance: () => tabMaintenance(asset, settings, content),
    parts: () => tabParts(asset, content),
  };
  function activate(key) {
    tabBar.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.k === key));
    mount(content, el('div', { class: 'empty' }, 'Loading…'));
    renderers[key]();
  }
  TABS.forEach(([k, label]) => tabBar.append(btn(label, () => activate(k), { dataset: { k } })));

  mount(container, el('div', {}, [
    el('a', { href: '#/taeki', class: 'link-btn' }, '← Assets'),
    header, tabBar, content,
  ]));
  activate('overview');
}

// ---- Overview tab ----
async function tabOverview(asset, settings, content) {
  const { count: openCount } = await sb.from('work_orders').select('id', { count: 'exact', head: true })
    .eq('equipment_id', asset.id).in('status', WO_OPEN);
  const { data: lastWo } = await sb.from('work_orders').select('created_at, type')
    .eq('equipment_id', asset.id).order('created_at', { ascending: false }).limit(1).maybeSingle();

  mount(content, el('div', {}, [
    el('div', { class: 'stat-grid', style: { marginBottom: '14px' } }, [
      statCard(openCount || 0, 'Open work orders'),
      statCard(lastWo ? fmtDate(lastWo.created_at) : '—', 'Last service'),
    ]),
    el('div', { class: 'card' }, [
      infoGrid([
        ['Asset #', asset.asset_no && ('A' + asset.asset_no)],
        ['Type', asset.type],
        ['Serial number', asset.serial_number],
        ['Manufacturer', asset.brand],
        ['Model', asset.model],
        ['Location', asset.locations?.name],
        ['Status', EQUIP_STATUS[asset.status]],
        ['Installed', fmtDate(asset.install_date)],
        ['Warranty until', fmtDate(asset.warranty_until)],
        ['Bulb type', asset.bulb_type],
        ['Body bulbs', asset.bulb_count],
        ['Facial bulbs', asset.facial_bulb_count],
      ]),
      bulbMeter(asset, settings),
      asset.notes ? el('p', {}, asset.notes) : null,
    ]),
  ]));
}

// ---- History tab (work orders + bulb changes, merged) ----
async function tabHistory(asset, content) {
  const [woRes, bcRes] = await Promise.all([
    sb.from('work_orders').select('id, number, type, status, created_at, completed_at, title').eq('equipment_id', asset.id),
    sb.from('bulb_changes').select('id, changed_at, quantity, notes, profiles(full_name)').eq('equipment_id', asset.id),
  ]);
  const events = [];
  (woRes.data || []).forEach((w) => events.push({
    date: w.completed_at || w.created_at,
    title: `Work order #${w.number} · ${WO_TYPE[w.type] || w.type}`,
    sub: [WO_STATUS[w.status], w.title].filter(Boolean).join(' · '),
    href: `#/verkbeidnir/${w.id}`,
  }));
  (bcRes.data || []).forEach((c) => events.push({
    date: c.changed_at,
    title: `Bulb change${c.quantity ? ` · ${c.quantity} bulbs` : ''}`,
    sub: [c.profiles?.full_name, c.notes].filter(Boolean).join(' · '),
  }));
  events.sort((a, b) => new Date(b.date) - new Date(a.date));
  if (!events.length) { mount(content, el('div', { class: 'empty' }, 'No history yet.')); return; }
  mount(content, el('div', { class: 'card' }, events.map((ev) => el('div', { class: 'timeline-item' }, [
    el('div', { class: 'dot' }),
    el('div', { class: 'grow' }, [
      el('div', {}, ev.href ? el('a', { class: 'linkish', href: ev.href, style: { fontWeight: '600' } }, ev.title) : el('strong', {}, ev.title)),
      ev.sub ? el('div', { class: 'muted', style: { fontSize: '13px' } }, ev.sub) : null,
    ]),
    el('div', { class: 'muted', style: { fontSize: '12px', whiteSpace: 'nowrap' } }, fmtDate(ev.date)),
  ]))));
}

// ---- Work orders tab ----
async function tabWorkOrders(asset, content) {
  const { data } = await sb.from('work_orders').select('*, profiles:assigned_to(full_name)')
    .eq('equipment_id', asset.id).order('created_at', { ascending: false });
  const rows = data || [];
  mount(content, el('div', {}, [
    el('div', { class: 'row', style: { justifyContent: 'flex-end', marginBottom: '10px' } },
      btn('+ New work order', () => { prefill.set({ customerId: asset.customer_id, equipmentId: asset.id }); navigate('/verkbeidnir/new'); }, { class: 'btn-primary btn-sm' })),
    rows.length ? el('div', {}, rows.map((w) => el('a', { class: 'list-item', href: `#/verkbeidnir/${w.id}` }, [
      el('div', { class: 'grow' }, [
        el('div', { class: 'title' }, `#${w.number} · ${WO_TYPE[w.type] || w.type}`),
        el('div', { class: 'sub' }, [fmtDate(w.created_at), w.profiles?.full_name, w.title].filter(Boolean).join(' · ')),
      ]),
      el('span', { class: `badge ${w.status}` }, WO_STATUS[w.status] || w.status),
    ]))) : el('div', { class: 'empty' }, 'No work orders for this asset.'),
  ]));
}

// ---- Photos tab (asset photos + work-order photos) ----
async function tabPhotos(asset, content) {
  const [apRes, wpRes] = await Promise.all([
    sb.from('asset_photos').select('*').eq('equipment_id', asset.id).order('uploaded_at', { ascending: false }),
    sb.from('work_order_photos').select('*, work_orders!inner(number,equipment_id)').eq('work_orders.equipment_id', asset.id),
  ]);
  const assetPhotos = apRes.data || [];
  const woPhotos = wpRes.data || [];

  const input = el('input', { type: 'file', accept: 'image/*', capture: 'environment', style: { display: 'none' } });
  input.addEventListener('change', async () => {
    const file = input.files[0]; if (!file) return;
    try {
      const path = `assets/${asset.id}/${Date.now()}-${Math.round(Math.random() * 1e6)}.jpg`;
      const { error: up } = await sb.storage.from(STORAGE_BUCKET).upload(path, file, { contentType: file.type || 'image/jpeg' });
      if (up) throw up;
      await sb.from('asset_photos').insert({ equipment_id: asset.id, storage_path: path, uploaded_by: getProfile()?.id || null });
      toast('Photo added.'); tabPhotos(asset, content);
    } catch (e) { toast('Upload failed: ' + e.message, 'err'); }
  });

  mount(content, el('div', {}, [
    el('div', { class: 'row', style: { justifyContent: 'flex-end', marginBottom: '10px' } }, [
      btn('+ Add photo', () => input.click(), { class: 'btn-primary btn-sm' }), input,
    ]),
    (assetPhotos.length || woPhotos.length) ? el('div', { class: 'row' }, [
      ...assetPhotos.map((p) => photoThumb(p.storage_path, () => deleteAssetPhoto(p, () => tabPhotos(asset, content)))),
      ...woPhotos.map((p) => photoThumb(p.storage_path, null, `#${p.work_orders?.number}`)),
    ]) : el('div', { class: 'empty' }, 'No photos.'),
  ]));
}

async function deleteAssetPhoto(p, done) {
  if (!(await confirmDialog('Delete photo?'))) return;
  await sb.storage.from(STORAGE_BUCKET).remove([p.storage_path]);
  await sb.from('asset_photos').delete().eq('id', p.id);
  done();
}

// ---- Documents tab ----
async function tabDocuments(asset, content) {
  const { data } = await sb.from('asset_documents').select('*').eq('equipment_id', asset.id).order('uploaded_at', { ascending: false });
  const docs = data || [];
  mount(content, el('div', {}, [
    el('div', { class: 'row', style: { justifyContent: 'flex-end', marginBottom: '10px' } },
      btn('+ Add document', () => docForm(asset, () => tabDocuments(asset, content)), { class: 'btn-primary btn-sm' })),
    docs.length ? el('div', {}, docs.map((d) => el('div', { class: 'list-item' }, [
      el('div', { class: 'grow' }, [
        el('div', { class: 'title' }, d.title),
        el('div', { class: 'sub' }, [d.doc_type, fmtDate(d.uploaded_at)].filter(Boolean).join(' · ')),
      ]),
      btn('Open', () => openStored(d.storage_path), { class: 'btn-ghost btn-sm' }),
      btn('✕', async () => {
        if (!(await confirmDialog('Delete document?'))) return;
        await sb.storage.from(STORAGE_BUCKET).remove([d.storage_path]);
        await sb.from('asset_documents').delete().eq('id', d.id);
        tabDocuments(asset, content);
      }, { class: 'btn-ghost btn-sm' }),
    ]))) : el('div', { class: 'empty' }, 'No documents. Add manuals, wiring diagrams, certificates…'),
  ]));
}

function docForm(asset, done) {
  const title = el('input', {});
  const type = el('input', { placeholder: 'Manual, Certificate, Diagram…' });
  const file = el('input', { type: 'file' });
  modal({
    title: 'Add document',
    saveLabel: 'Upload',
    body: el('div', { class: 'form-grid' }, [
      fieldRow('Title *', title, true),
      fieldRow('Type', type, true),
      fieldRow('File *', file, true),
    ]),
    onSave: async () => {
      const fl = file.files[0];
      if (!title.value.trim() || !fl) { toast('Title and file required.', 'err'); return false; }
      try {
        const safe = fl.name.replace(/[^\w.\-]+/g, '_');
        const path = `assets/${asset.id}/docs/${Date.now()}-${safe}`;
        const { error: up } = await sb.storage.from(STORAGE_BUCKET).upload(path, fl, { contentType: fl.type || 'application/octet-stream' });
        if (up) throw up;
        const { error } = await sb.from('asset_documents').insert({
          equipment_id: asset.id, title: title.value.trim(), doc_type: type.value.trim() || null,
          storage_path: path, uploaded_by: getProfile()?.id || null,
        });
        if (error) throw error;
        toast('Uploaded.'); done();
      } catch (e) { toast('Upload failed: ' + e.message, 'err'); return false; }
    },
  });
}

// ---- Maintenance tab ----
async function tabMaintenance(asset, settings, content) {
  const { data } = await sb.from('work_orders').select('*, profiles:assigned_to(full_name)')
    .eq('equipment_id', asset.id).in('type', ['maintenance', 'inspection', 'bulb_change']).order('created_at', { ascending: false });
  const rows = data || [];
  mount(content, el('div', {}, [
    el('div', { class: 'card' }, [
      el('h3', { style: { marginTop: 0 } }, 'Bulb life'),
      bulbMeter(asset, settings) || el('div', { class: 'muted' }, 'No bulb-life data. Set current hours and life on the asset.'),
      el('div', { style: { marginTop: '10px' } }, btn('+ Log bulb change', () => bulbChangeForm(asset, () => tabMaintenance(asset, settings, content)), { class: 'btn-ghost btn-sm' })),
    ]),
    el('div', { class: 'card' }, [
      el('h3', { style: { marginTop: 0 } }, 'Maintenance & inspections'),
      rows.length ? el('div', {}, rows.map((w) => el('a', { class: 'list-item', href: `#/verkbeidnir/${w.id}` }, [
        el('div', { class: 'grow' }, [
          el('div', { class: 'title' }, `#${w.number} · ${WO_TYPE[w.type] || w.type}`),
          el('div', { class: 'sub' }, [fmtDate(w.created_at), w.profiles?.full_name].filter(Boolean).join(' · ')),
        ]),
        el('span', { class: `badge ${w.status}` }, WO_STATUS[w.status] || w.status),
      ]))) : el('div', { class: 'muted' }, 'No maintenance recorded.'),
      el('p', { class: 'muted', style: { fontSize: '13px' } }, 'Recurring preventive-maintenance plans are coming in a later phase.'),
    ]),
  ]));
}

// ---- Parts tab (parts ever used on this asset) ----
async function tabParts(asset, content) {
  const { data } = await sb.from('work_order_parts')
    .select('*, work_orders!inner(number,equipment_id,created_at), products(name)')
    .eq('work_orders.equipment_id', asset.id);
  const rows = (data || []).sort((a, b) => new Date(b.work_orders?.created_at || 0) - new Date(a.work_orders?.created_at || 0));
  if (!rows.length) { mount(content, el('div', { class: 'empty' }, 'No parts used on this asset yet.')); return; }
  const total = rows.reduce((s, p) => s + (Number(p.quantity) || 0) * (Number(p.unit_price) || 0), 0);
  mount(content, el('div', { class: 'card' }, [
    ...rows.map((p) => el('div', { class: 'list-item' }, [
      el('div', { class: 'grow' }, [
        el('div', { class: 'title' }, p.description || p.products?.name || 'Item'),
        el('div', { class: 'sub' }, [`WO #${p.work_orders?.number}`, fmtDate(p.work_orders?.created_at), `${p.quantity} × ${money(p.unit_price || 0)}`].filter(Boolean).join(' · ')),
      ]),
      el('div', {}, money((p.quantity || 0) * (p.unit_price || 0))),
    ])),
    el('div', { class: 'row', style: { justifyContent: 'flex-end', fontWeight: '600', marginTop: '6px' } }, `Total: ${money(total)}`),
  ]));
}

// ---------------- QR code ----------------
function assetUrl(id) {
  return location.origin + location.pathname + '#/taeki/' + id;
}

async function showQr(asset) {
  const canvas = el('canvas', { width: 240, height: 240 });
  const printBtn = btn('🖨 Print label', () => {}, { class: 'btn-primary btn-sm' });
  const body = el('div', { style: { textAlign: 'center' } }, [
    canvas,
    el('div', { style: { fontWeight: '600', marginTop: '8px' } }, assetName(asset)),
    asset.asset_no ? el('div', { class: 'muted', style: { fontSize: '12px' } }, '#A' + asset.asset_no) : null,
    el('div', { class: 'row', style: { justifyContent: 'center', marginTop: '12px' } }, printBtn),
  ]);
  modal({ title: 'Asset QR code', hideSave: true, body });
  try {
    const QR = (await import('https://esm.sh/qrcode@1.5.4')).default;
    await QR.toCanvas(canvas, assetUrl(asset.id), { width: 240, margin: 1, color: { dark: '#531E52', light: '#ffffff' } });
    printBtn.addEventListener('click', () => printLabel(asset, canvas.toDataURL('image/png')));
  } catch (e) {
    body.replaceChildren(el('div', { class: 'msg err' }, 'Could not generate QR: ' + (e.message || e)));
  }
}

function printLabel(asset, dataUrl) {
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const w = window.open('', '_blank');
  if (!w) { toast('Allow pop-ups to print.', 'err'); return; }
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>QR ${esc(assetName(asset))}</title>
    <style>body{font-family:Segoe UI,system-ui,Arial,sans-serif;text-align:center;padding:24px}
    .brand{color:#8a2f78;font-weight:700;letter-spacing:.5px}img{width:260px;height:260px}h2{margin:8px 0 2px}</style></head>
    <body><div class="brand">BRONZE DIRECT</div><img src="${dataUrl}"><h2>${esc(assetName(asset))}</h2>
    <div>${asset.asset_no ? '#A' + asset.asset_no : ''}${asset.serial_number ? ' · S/N ' + esc(asset.serial_number) : ''}</div>
    </body></html>`);
  w.document.close(); w.focus(); setTimeout(() => w.print(), 300);
}

// ---------------- Shared bits ----------------
function statCard(n, label) {
  return el('div', { class: 'stat' }, [el('div', { class: 'n' }, String(n)), el('div', { class: 'l' }, label)]);
}

function infoGrid(pairs) {
  return el('div', { class: 'grid', style: { gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))' } },
    pairs.filter(([, v]) => v != null && v !== '').map(([k, v]) => el('div', {}, [
      el('div', { class: 'muted', style: { fontSize: '12px' } }, k),
      el('div', {}, String(v)),
    ])));
}

function bulbMeter(eq, settings) {
  const life = bulbLife(eq, settings);
  const pct = bulbPct(eq, settings);
  const hrs = eq.current_bulb_hours;
  if (hrs == null && !life) return null;
  const due = isBulbDue(eq, settings);
  const cls = pct == null ? '' : due ? 'due' : pct >= 80 ? 'warn' : '';
  return el('div', { style: { marginTop: '14px' } }, [
    el('div', { class: 'row', style: { justifyContent: 'space-between', fontSize: '13px' } }, [
      el('span', { class: 'muted' }, 'Bulb hours'),
      el('span', due ? { style: { color: 'var(--danger)', fontWeight: '600' } } : { class: 'muted' },
        `${hrs ?? 0}${life ? ' / ' + life : ''} hrs${due ? ' · replace due' : (pct != null ? ' · ' + pct + '%' : '')}`),
    ]),
    pct != null ? el('div', { class: `meter ${cls}` }, el('span', { style: { width: pct + '%' } })) : null,
  ]);
}

function photoThumb(path, onDelete, tag) {
  const img = el('img', { alt: 'Photo', style: { width: '90px', height: '90px', objectFit: 'cover', borderRadius: '10px', cursor: 'pointer', border: '1px solid var(--border)' } });
  sb.storage.from(STORAGE_BUCKET).createSignedUrl(path, 3600).then(({ data }) => { if (data?.signedUrl) img.src = data.signedUrl; });
  img.addEventListener('click', () => openStored(path));
  return el('div', {}, [
    img,
    el('div', { style: { textAlign: 'center', fontSize: '11px' } }, tag ? el('span', { class: 'muted' }, tag)
      : (onDelete ? btn('✕', onDelete, { class: 'link-btn' }) : null)),
  ]);
}

async function openStored(path) {
  const { data } = await sb.storage.from(STORAGE_BUCKET).createSignedUrl(path, 3600);
  if (data?.signedUrl) window.open(data.signedUrl, '_blank');
}

async function bulbChangeForm(eq, onDone) {
  const me = getProfile();
  let bulbs = [];
  try { bulbs = await listProducts({ category: 'bulb' }); } catch { /* skip */ }
  const f = {
    date: el('input', { type: 'date', value: todayISO() }),
    product: el('select', {}, [el('option', { value: '' }, '— Bulb type (optional) —'),
      ...bulbs.map((b) => el('option', { value: b.id }, b.name))]),
    qty: el('input', { type: 'number', value: eq.bulb_count ?? '' }),
    hours: el('input', { type: 'number', step: '0.1', value: eq.current_bulb_hours ?? '' }),
    notes: el('textarea', {}, ''),
    reset: el('input', { type: 'checkbox', checked: true }),
  };
  modal({
    title: 'Log bulb change',
    body: el('div', { class: 'form-grid' }, [
      fieldRow('Date', f.date),
      fieldRow('Number of bulbs', f.qty),
      fieldRow('Bulb type', f.product, true),
      fieldRow('Hours on bed at change', f.hours),
      el('div', { class: 'field' }, [el('label', {}, 'Reset bulb hours after change'), el('div', { class: 'row' }, [f.reset, el('span', { class: 'muted' }, 'Yes')])]),
      fieldRow('Notes', f.notes, true),
    ]),
    onSave: async () => {
      const { error } = await sb.from('bulb_changes').insert({
        equipment_id: eq.id, changed_at: f.date.value || todayISO(), changed_by: me?.id || null,
        bulb_product_id: f.product.value || null, quantity: f.qty.value ? Number(f.qty.value) : null,
        hours_at_change: f.hours.value ? Number(f.hours.value) : null, notes: f.notes.value.trim() || null,
      });
      if (error) { toast(error.message, 'err'); return false; }
      if (f.reset.checked) await sb.from('equipment').update({ current_bulb_hours: 0 }).eq('id', eq.id);
      toast('Bulb change logged.'); onDone && onDone();
    },
  });
}
