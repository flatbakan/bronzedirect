// modules/verkbeidnir.js — Verkbeiðnir: listi, stofnun, spjaldskrá, verkferli.
import { el, mount, btn } from '../render.js';
import { sb } from '../supabase.js';
import { STORAGE_BUCKET } from '../config.js';
import { listCustomers, listLocations, listEquipment, listStaff, listProducts } from '../db.js';
import { getProfile, isAdmin, role } from '../auth.js';
import { modal, fieldRow, toast, confirmDialog, errorView } from '../ui.js';
import { navigate } from '../router.js';
import { prefill } from '../state.js';
import {
  WO_TYPE, WO_STATUS, WO_PRIORITY, fmtDate, fmtDateTime, fmtKr, toLocalInput,
} from '../fmt.js';
import { signaturePad } from './signature.js';

export async function render(container, param) {
  if (param === 'new') return woForm(container);
  if (param) return renderDetail(container, param);
  return renderList(container);
}

// ---------------- Listi ----------------
async function renderList(container) {
  mount(container, el('div', { class: 'empty' }, 'Hleð…'));
  const statusSel = el('select', { style: { maxWidth: '180px' } }, [
    el('option', { value: 'open' }, 'Opin verk'),
    el('option', { value: 'all' }, 'Öll'),
    ...Object.entries(WO_STATUS).map(([v, l]) => el('option', { value: v }, l)),
  ]);
  const search = el('input', { type: 'search', placeholder: 'Leita…', style: { maxWidth: '240px' } });
  const listWrap = el('div', {});
  let rows = []; // síðast sótt gögn (fyrir client-leit)

  async function load() {
    mount(listWrap, el('div', { class: 'empty' }, 'Hleð…'));
    let q = sb.from('work_orders').select('*, customers(name), profiles:assigned_to(full_name)')
      .order('created_at', { ascending: false });
    const s = statusSel.value;
    if (s === 'open') q = q.in('status', ['new', 'scheduled', 'in_progress']);
    else if (s !== 'all') q = q.eq('status', s);
    const { data, error } = await q;
    if (error) { mount(listWrap, el('div', { class: 'empty' }, error.message)); return; }
    rows = data || [];
    draw();
  }
  function draw() {
    const t = search.value.trim().toLowerCase();
    const list = rows.filter((w) => !t ||
      [`#${w.number}`, w.title, w.customers?.name].some((x) => (x || '').toLowerCase().includes(t)));
    if (!list.length) { mount(listWrap, el('div', { class: 'empty' }, 'Engin verk.')); return; }
    mount(listWrap, list.map((w) => el('a', { class: 'list-item', href: `#/verkbeidnir/${w.id}` }, [
      el('div', { class: 'grow' }, [
        el('div', { class: 'title' }, `#${w.number} · ${w.customers?.name || 'Óþekktur'}`),
        el('div', { class: 'sub' }, [
          WO_TYPE[w.type] || w.type,
          w.scheduled_at && fmtDateTime(w.scheduled_at),
          w.profiles?.full_name && ('👤 ' + w.profiles.full_name),
          w.title,
        ].filter(Boolean).join(' · ')),
      ]),
      w.priority === 'urgent' || w.priority === 'high'
        ? el('span', { class: `badge ${w.priority}` }, WO_PRIORITY[w.priority]) : null,
      el('span', { class: `badge ${w.status}` }, WO_STATUS[w.status] || w.status),
    ])));
  }
  statusSel.addEventListener('change', load);
  search.addEventListener('input', draw);

  mount(container, el('div', {}, [
    el('div', { class: 'page-head' }, [
      el('h2', {}, 'Verkbeiðnir'),
      el('span', { class: 'spacer' }),
      btn('+ Ný verkbeiðni', () => woForm(container), { class: 'btn-primary' }),
    ]),
    el('div', { class: 'row', style: { marginBottom: '12px' } }, [statusSel, search]),
    listWrap,
  ]));
  await load();
}

// ---------------- Ný verkbeiðni ----------------
async function woForm(container) {
  mount(container, el('div', { class: 'empty' }, 'Hleð…'));
  const pre = prefill.take();
  let customers, staff;
  try { [customers, staff] = await Promise.all([listCustomers({ activeOnly: true }), listStaff()]); }
  catch (e) { return errorView(container, e.message); }

  const custSel = el('select', {}, [el('option', { value: '' }, '— Veldu viðskiptavin —'),
    ...customers.map((c) => el('option', { value: c.id, selected: pre?.customerId === c.id }, c.name))]);
  const locSel = el('select', {}, [el('option', { value: '' }, '— Engin —')]);
  const eqSel = el('select', {}, [el('option', { value: '' }, '— Ekkert —')]);

  async function loadChildren(customerId) {
    locSel.replaceChildren(el('option', { value: '' }, '— Engin —'));
    eqSel.replaceChildren(el('option', { value: '' }, '— Ekkert —'));
    if (!customerId) return;
    const [locs, equip] = await Promise.all([listLocations(customerId), listEquipment({ customerId })]);
    locs.forEach((l) => locSel.append(el('option', { value: l.id }, l.name || l.address || 'Starfsstöð')));
    equip.forEach((e) => eqSel.append(el('option', { value: e.id }, [e.brand, e.model, e.serial_number].filter(Boolean).join(' ') || 'Bekkur')));
  }
  custSel.addEventListener('change', () => loadChildren(custSel.value));
  if (custSel.value) await loadChildren(custSel.value);

  const f = {
    type: el('select', {}, Object.entries(WO_TYPE).map(([v, l]) => el('option', { value: v, selected: v === 'repair' }, l))),
    priority: el('select', {}, Object.entries(WO_PRIORITY).map(([v, l]) => el('option', { value: v, selected: v === 'normal' }, l))),
    scheduled: el('input', { type: 'datetime-local' }),
    assigned: el('select', {}, [el('option', { value: '' }, '— Óúthlutað —'),
      ...staff.map((s) => el('option', { value: s.id }, s.full_name || s.email))]),
    title: el('input', {}),
    description: el('textarea', {}, ''),
  };

  const save = btn('Stofna verkbeiðni', async () => {
    if (!custSel.value) { toast('Veldu viðskiptavin.', 'err'); return; }
    save.disabled = true;
    const me = getProfile();
    const status = f.scheduled.value ? 'scheduled' : 'new';
    const payload = {
      customer_id: custSel.value,
      location_id: locSel.value || null,
      equipment_id: eqSel.value || null,
      type: f.type.value,
      priority: f.priority.value,
      status,
      scheduled_at: f.scheduled.value ? new Date(f.scheduled.value).toISOString() : null,
      assigned_to: f.assigned.value || null,
      title: f.title.value.trim() || null,
      description: f.description.value.trim() || null,
      created_by: me?.id || null,
    };
    const { data, error } = await sb.from('work_orders').insert(payload).select('id').single();
    save.disabled = false;
    if (error) { toast(error.message, 'err'); return; }
    toast('Verkbeiðni stofnuð.');
    navigate('/verkbeidnir/' + data.id);
  }, { class: 'btn-primary' });

  mount(container, el('div', {}, [
    el('a', { href: '#/verkbeidnir', class: 'link-btn' }, '← Verkbeiðnir'),
    el('div', { class: 'page-head' }, el('h2', {}, 'Ný verkbeiðni')),
    el('div', { class: 'card' }, el('div', { class: 'form-grid' }, [
      fieldRow('Viðskiptavinur *', custSel, true),
      fieldRow('Starfsstöð', locSel),
      fieldRow('Tæki', eqSel),
      fieldRow('Tegund', f.type),
      fieldRow('Forgangur', f.priority),
      fieldRow('Áætlaður tími', f.scheduled),
      fieldRow('Úthluta á', f.assigned),
      fieldRow('Yfirskrift', f.title, true),
      fieldRow('Lýsing', f.description, true),
    ])),
    el('div', { class: 'row' }, save),
  ]));
}

// ---------------- Spjaldskrá / verkferli ----------------
async function renderDetail(container, id) {
  mount(container, el('div', { class: 'empty' }, 'Hleð…'));
  try {
    const [woRes, partsRes, photosRes, staff] = await Promise.all([
      sb.from('work_orders').select('*, customers(id,name,kennitala), locations(name,address,access_notes), equipment(id,brand,model,serial_number), profiles:assigned_to(full_name)').eq('id', id).maybeSingle(),
      sb.from('work_order_parts').select('*, products(name)').eq('work_order_id', id).order('created_at'),
      sb.from('work_order_photos').select('*').eq('work_order_id', id).order('uploaded_at'),
      listStaff(),
    ]);
    if (woRes.error) throw woRes.error;
    const wo = woRes.data;
    if (!wo) return errorView(container, 'Verkbeiðni fannst ekki.');
    const parts = partsRes.data || [];
    const photos = photosRes.data || [];
    const reload = () => renderDetail(container, id);

    // --- Haus ---
    const header = el('div', { class: 'card' }, [
      el('div', { class: 'row', style: { justifyContent: 'space-between' } }, [
        el('h2', { style: { margin: 0 } }, `Verk #${wo.number}`),
        el('div', { class: 'row' }, [
          el('span', { class: `badge ${wo.priority}` }, WO_PRIORITY[wo.priority]),
          el('span', { class: `badge ${wo.status}` }, WO_STATUS[wo.status]),
        ]),
      ]),
      el('div', { class: 'muted', style: { marginTop: '8px' } }, [
        wo.customers && el('a', { href: `#/vidskiptavinir/${wo.customers.id}`, class: 'link-btn' }, wo.customers.name),
      ]),
      infoGrid([
        ['Tegund', WO_TYPE[wo.type]],
        ['Starfsstöð', wo.locations?.name],
        ['Tæki', wo.equipment && [wo.equipment.brand, wo.equipment.model].filter(Boolean).join(' ')],
        ['Áætlað', fmtDateTime(wo.scheduled_at)],
        ['Úthlutað', wo.profiles?.full_name],
        ['Stofnað', fmtDate(wo.created_at)],
        ['Vinnustundir', wo.labor_hours],
        ['Lokið', fmtDateTime(wo.completed_at)],
      ]),
      wo.locations?.access_notes ? el('p', { class: 'muted' }, '🔑 ' + wo.locations.access_notes) : null,
      wo.title ? el('p', {}, el('strong', {}, wo.title)) : null,
      wo.description ? el('p', {}, wo.description) : null,
      wo.resolution ? el('p', {}, [el('span', { class: 'muted' }, 'Úrlausn: '), wo.resolution]) : null,
      el('div', { class: 'row', style: { marginTop: '8px' } }, [
        btn('Breyta', () => editWo(wo, staff, reload), { class: 'btn-ghost btn-sm' }),
        wo.signature_path ? btn('Skoða undirskrift', async () => openStored(wo.signature_path), { class: 'btn-ghost btn-sm' }) : null,
      ]),
    ]);

    // --- Verkferli (staða) ---
    const flow = el('div', { class: 'card' }, [
      el('h3', { style: { marginTop: 0 } }, 'Staða verks'),
      el('div', { class: 'row' }, statusButtons(wo, reload)),
    ]);

    // --- Varahlutir/perur ---
    const partsTotal = parts.reduce((s, p) => s + (Number(p.quantity) || 0) * (Number(p.unit_price) || 0), 0);
    const partsSection = el('div', { class: 'card' }, [
      el('div', { class: 'row', style: { justifyContent: 'space-between', marginBottom: '10px' } }, [
        el('h3', { style: { margin: 0 } }, 'Varahlutir og perur'),
        btn('+ Bæta við', () => partForm(wo.id, reload), { class: 'btn-ghost btn-sm' }),
      ]),
      parts.length ? el('div', {}, parts.map((p) => el('div', { class: 'list-item' }, [
        el('div', { class: 'grow' }, [
          el('div', { class: 'title' }, p.description || p.products?.name || 'Hlutur'),
          el('div', { class: 'sub' }, `${p.quantity} × ${fmtKr(p.unit_price || 0)} = ${fmtKr((p.quantity || 0) * (p.unit_price || 0))}`),
        ]),
        btn('✕', async () => {
          if (!(await confirmDialog('Fjarlægja hlut?'))) return;
          await sb.from('work_order_parts').delete().eq('id', p.id);
          reload();
        }, { class: 'btn-ghost btn-sm' }),
      ]))) : el('div', { class: 'muted' }, 'Engir hlutir skráðir.'),
      parts.length ? el('div', { class: 'row', style: { justifyContent: 'flex-end', fontWeight: '600' } }, `Samtals: ${fmtKr(partsTotal)}`) : null,
    ]);

    // --- Myndir ---
    const photoSection = el('div', { class: 'card' }, [
      el('div', { class: 'row', style: { justifyContent: 'space-between', marginBottom: '10px' } }, [
        el('h3', { style: { margin: 0 } }, 'Myndir'),
        photoUploadBtn(wo.id, reload),
      ]),
      photos.length
        ? el('div', { class: 'row' }, photos.map((ph) => photoThumb(ph, reload)))
        : el('div', { class: 'muted' }, 'Engar myndir.'),
    ]);

    // --- Ljúka verki ---
    const completeSection = (wo.status !== 'done' && wo.status !== 'invoiced' && wo.status !== 'cancelled')
      ? el('div', { class: 'card' }, [
          el('h3', { style: { marginTop: 0 } }, 'Ljúka verki'),
          btn('Skrá úrlausn og undirskrift', () => completeWo(wo, reload), { class: 'btn-primary' }),
        ])
      : null;

    // --- Reikningur ---
    const invoiceSection = (isAdmin() || role() === 'office')
      ? el('div', { class: 'card' }, [
          el('h3', { style: { marginTop: 0 } }, 'Reikningur'),
          wo.status === 'invoiced'
            ? el('div', { class: 'muted' }, 'Verk er reikningsfært.')
            : btn('Búa til reikning úr verki', () => makeInvoice(wo, parts, reload), { class: 'btn-primary' }),
        ])
      : null;

    mount(container, el('div', {}, [
      el('a', { href: '#/verkbeidnir', class: 'link-btn' }, '← Verkbeiðnir'),
      header, flow, partsSection, photoSection, completeSection, invoiceSection,
    ]));
  } catch (e) {
    console.error(e);
    errorView(container, e.message);
  }
}

// ---- Staða-hnappar ----
function statusButtons(wo, reload) {
  const set = async (status, extra = {}) => {
    const payload = { status, ...extra };
    if (status === 'done') payload.completed_at = new Date().toISOString();
    const { error } = await sb.from('work_orders').update(payload).eq('id', wo.id);
    if (error) { toast(error.message, 'err'); return; }
    reload();
  };
  const out = [];
  if (wo.status === 'new') out.push(btn('Áætla / úthluta', () => set('scheduled'), { class: 'btn-ghost btn-sm' }));
  if (wo.status === 'new' || wo.status === 'scheduled') out.push(btn('Hefja vinnu', () => set('in_progress'), { class: 'btn-primary btn-sm' }));
  if (wo.status === 'in_progress' || wo.status === 'scheduled') out.push(btn('Merkja lokið', () => set('done'), { class: 'btn-primary btn-sm' }));
  if (wo.status !== 'cancelled' && wo.status !== 'invoiced') {
    out.push(btn('Aflýsa', async () => {
      if (!(await confirmDialog('Aflýsa verkbeiðni?'))) return;
      set('cancelled');
    }, { class: 'btn-ghost btn-sm' }));
  }
  if (!out.length) out.push(el('span', { class: 'muted' }, 'Engar aðgerðir í boði.'));
  return out;
}

// ---- Breyta verki ----
async function editWo(wo, staff, reload) {
  const f = {
    type: el('select', {}, Object.entries(WO_TYPE).map(([v, l]) => el('option', { value: v, selected: v === wo.type }, l))),
    priority: el('select', {}, Object.entries(WO_PRIORITY).map(([v, l]) => el('option', { value: v, selected: v === wo.priority }, l))),
    scheduled: el('input', { type: 'datetime-local', value: wo.scheduled_at ? toLocalInput(wo.scheduled_at) : '' }),
    assigned: el('select', {}, [el('option', { value: '' }, '— Óúthlutað —'),
      ...staff.map((s) => el('option', { value: s.id, selected: s.id === wo.assigned_to }, s.full_name || s.email))]),
    title: el('input', { value: wo.title || '' }),
    description: el('textarea', {}, wo.description || ''),
  };
  modal({
    title: `Breyta verki #${wo.number}`,
    body: el('div', { class: 'form-grid' }, [
      fieldRow('Tegund', f.type),
      fieldRow('Forgangur', f.priority),
      fieldRow('Áætlaður tími', f.scheduled),
      fieldRow('Úthluta á', f.assigned),
      fieldRow('Yfirskrift', f.title, true),
      fieldRow('Lýsing', f.description, true),
    ]),
    onSave: async () => {
      const { error } = await sb.from('work_orders').update({
        type: f.type.value,
        priority: f.priority.value,
        scheduled_at: f.scheduled.value ? new Date(f.scheduled.value).toISOString() : null,
        assigned_to: f.assigned.value || null,
        title: f.title.value.trim() || null,
        description: f.description.value.trim() || null,
      }).eq('id', wo.id);
      if (error) { toast(error.message, 'err'); return false; }
      toast('Vistað.'); reload();
    },
  });
}

// ---- Varahlutur ----
async function partForm(woId, reload) {
  let products = [];
  try { products = await listProducts(); } catch { /* skip */ }
  const prodSel = el('select', {}, [el('option', { value: '' }, '— Frjáls texti —'),
    ...products.map((p) => el('option', { value: p.id, dataset: { price: p.sale_price ?? '' } }, `${p.name}${p.sale_price ? ' · ' + fmtKr(p.sale_price) : ''}`))]);
  const desc = el('input', {});
  const qty = el('input', { type: 'number', step: '0.01', value: '1' });
  const price = el('input', { type: 'number', step: '1', value: '' });
  prodSel.addEventListener('change', () => {
    const opt = prodSel.selectedOptions[0];
    if (prodSel.value) {
      desc.value = opt.textContent.split(' · ')[0];
      if (opt.dataset.price) price.value = opt.dataset.price;
    }
  });
  modal({
    title: 'Bæta við hlut',
    body: el('div', { class: 'form-grid' }, [
      fieldRow('Vara', prodSel, true),
      fieldRow('Lýsing', desc, true),
      fieldRow('Fjöldi', qty),
      fieldRow('Einingaverð (kr)', price),
    ]),
    onSave: async () => {
      if (!desc.value.trim() && !prodSel.value) { toast('Lýsingu vantar.', 'err'); return false; }
      const { error } = await sb.from('work_order_parts').insert({
        work_order_id: woId,
        product_id: prodSel.value || null,
        description: desc.value.trim() || null,
        quantity: Number(qty.value) || 1,
        unit_price: price.value ? Number(price.value) : null,
      });
      if (error) { toast(error.message, 'err'); return false; }
      toast('Bætt við.'); reload();
    },
  });
}

// ---- Ljúka verki (úrlausn + undirskrift) ----
function completeWo(wo, reload) {
  const resolution = el('textarea', {}, wo.resolution || '');
  const hours = el('input', { type: 'number', step: '0.25', value: wo.labor_hours ?? '' });
  const signedName = el('input', { value: wo.signed_name || '' });
  const pad = signaturePad();
  const body = el('div', {}, [
    fieldRow('Úrlausn / unnin vinna', resolution, true),
    fieldRow('Vinnustundir', hours),
    fieldRow('Nafn þess sem kvittar', signedName),
    el('div', { class: 'field' }, [el('label', {}, 'Undirskrift viðskiptavinar'), pad.element]),
  ]);
  modal({
    title: `Ljúka verki #${wo.number}`,
    saveLabel: 'Merkja lokið',
    body,
    onSave: async () => {
      const update = {
        status: 'done',
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
        } catch (e) { toast('Undirskrift vistaðist ekki: ' + e.message, 'err'); }
      }
      const { error } = await sb.from('work_orders').update(update).eq('id', wo.id);
      if (error) { toast(error.message, 'err'); return false; }
      toast('Verki lokið.'); reload();
    },
  });
}

// ---- Reikningur úr verki ----
async function makeInvoice(wo, parts, reload) {
  if (!(await confirmDialog('Búa til reikning úr þessu verki?', { danger: false, confirmLabel: 'Búa til' }))) return;
  const me = getProfile();
  const { data: inv, error } = await sb.from('invoices').insert({
    kind: 'invoice',
    customer_id: wo.customer_id,
    work_order_id: wo.id,
    created_by: me?.id || null,
  }).select('id').single();
  if (error) { toast(error.message, 'err'); return; }
  const lines = parts.map((p) => ({
    invoice_id: inv.id,
    product_id: p.product_id || null,
    description: p.description || p.products?.name || 'Hlutur',
    quantity: p.quantity || 1,
    unit_price: p.unit_price || 0,
  }));
  if (wo.labor_hours) {
    lines.push({ invoice_id: inv.id, description: 'Vinna', quantity: wo.labor_hours, unit_price: 0 });
  }
  if (lines.length) {
    const { error: le } = await sb.from('invoice_lines').insert(lines);
    if (le) { toast('Reikningur búinn til en línur brugðust: ' + le.message, 'err'); }
  }
  await sb.from('work_orders').update({ status: 'invoiced' }).eq('id', wo.id);
  toast('Reikningur búinn til.');
  navigate('/reikningar/' + inv.id);
}

// ---- Myndir ----
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
      toast('Mynd vistuð.'); reload();
    } catch (e) { toast('Mynd vistaðist ekki: ' + e.message, 'err'); }
  });
  const b = btn('+ Mynd', () => input.click(), { class: 'btn-ghost btn-sm' });
  return el('span', {}, [b, input]);
}

function photoThumb(ph, reload) {
  const img = el('img', { alt: ph.caption || 'Mynd', style: { width: '90px', height: '90px', objectFit: 'cover', borderRadius: '10px', cursor: 'pointer', border: '1px solid var(--border)' } });
  sb.storage.from(STORAGE_BUCKET).createSignedUrl(ph.storage_path, 3600).then(({ data }) => { if (data?.signedUrl) img.src = data.signedUrl; });
  img.addEventListener('click', () => openStored(ph.storage_path));
  return el('div', {}, [
    img,
    el('div', { style: { textAlign: 'center' } }, btn('✕', async () => {
      if (!(await confirmDialog('Eyða mynd?'))) return;
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
