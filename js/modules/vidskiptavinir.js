// modules/vidskiptavinir.js — Viðskiptavinir: listi + spjaldskrá.
import { el, mount, btn } from '../render.js';
import { sb } from '../supabase.js';
import { listCustomers, getCustomer, listLocations } from '../db.js';
import { modal, fieldRow, toast, confirmDialog, errorView } from '../ui.js';
import { navigate } from '../router.js';
import { prefill } from '../state.js';
import { EQUIP_STATUS, WO_TYPE, WO_STATUS, fmtDate } from '../fmt.js';

export async function render(container, param) {
  if (param) return renderDetail(container, param);
  return renderList(container);
}

// ---------------- Listi ----------------
async function renderList(container) {
  mount(container, el('div', { class: 'empty' }, 'Hleð…'));
  let customers;
  try { customers = await listCustomers(); }
  catch (e) { return errorView(container, e.message); }

  const search = el('input', { type: 'search', placeholder: 'Leita…', style: { maxWidth: '260px' } });
  const listWrap = el('div', {});

  function draw() {
    const term = search.value.trim().toLowerCase();
    const rows = customers.filter((c) =>
      !term || (c.name || '').toLowerCase().includes(term) || (c.kennitala || '').includes(term));
    if (!rows.length) { mount(listWrap, el('div', { class: 'empty' }, 'Enginn viðskiptavinur.')); return; }
    mount(listWrap, rows.map((c) => el('a', { class: 'list-item', href: `#/vidskiptavinir/${c.id}` }, [
      el('div', { class: 'grow' }, [
        el('div', { class: 'title' }, c.name),
        el('div', { class: 'sub' }, [c.kennitala, c.phone, c.contact_name].filter(Boolean).join(' · ')),
      ]),
      c.is_active ? null : el('span', { class: 'badge cancelled' }, 'Óvirkur'),
    ])));
  }
  search.addEventListener('input', draw);

  mount(container, el('div', {}, [
    el('div', { class: 'page-head' }, [
      el('h2', {}, 'Viðskiptavinir'),
      el('span', { class: 'spacer' }),
      btn('+ Nýr', () => customerForm(null, () => renderList(container)), { class: 'btn-primary' }),
    ]),
    el('div', { class: 'row', style: { marginBottom: '12px' } }, search),
    listWrap,
  ]));
  draw();
}

// ---------------- Form (nýr/breyta) ----------------
function customerForm(existing, onDone) {
  const f = {
    name: el('input', { value: existing?.name || '' }),
    kennitala: el('input', { value: existing?.kennitala || '' }),
    phone: el('input', { value: existing?.phone || '' }),
    email: el('input', { type: 'email', value: existing?.email || '' }),
    contact_name: el('input', { value: existing?.contact_name || '' }),
    notes: el('textarea', {}, existing?.notes || ''),
  };
  const body = el('div', { class: 'form-grid' }, [
    fieldRow('Nafn *', f.name, true),
    fieldRow('Kennitala', f.kennitala),
    fieldRow('Sími', f.phone),
    fieldRow('Netfang', f.email),
    fieldRow('Tengiliður', f.contact_name),
    fieldRow('Athugasemdir', f.notes, true),
  ]);
  modal({
    title: existing ? 'Breyta viðskiptavini' : 'Nýr viðskiptavinur',
    body,
    onSave: async () => {
      const payload = {
        name: f.name.value.trim(),
        kennitala: f.kennitala.value.trim() || null,
        phone: f.phone.value.trim() || null,
        email: f.email.value.trim() || null,
        contact_name: f.contact_name.value.trim() || null,
        notes: f.notes.value.trim() || null,
      };
      if (!payload.name) { toast('Nafn vantar.', 'err'); return false; }
      const q = existing
        ? sb.from('customers').update(payload).eq('id', existing.id)
        : sb.from('customers').insert(payload);
      const { error } = await q;
      if (error) { toast(error.message, 'err'); return false; }
      toast('Vistað.');
      onDone && onDone();
    },
  });
}

// ---------------- Spjaldskrá ----------------
async function renderDetail(container, id) {
  mount(container, el('div', { class: 'empty' }, 'Hleð…'));
  try {
    const [customer, locations, equipment, woRes] = await Promise.all([
      getCustomer(id),
      listLocations(id),
      sb.from('equipment').select('*, locations(name)').eq('customer_id', id).order('created_at', { ascending: false }),
      sb.from('work_orders').select('*').eq('customer_id', id).order('created_at', { ascending: false }).limit(20),
    ]);
    if (!customer) return errorView(container, 'Viðskiptavinur fannst ekki.');
    if (equipment.error) throw equipment.error;

    const back = el('a', { href: '#/vidskiptavinir', class: 'link-btn' }, '← Viðskiptavinir');

    const info = el('div', { class: 'card' }, [
      el('div', { class: 'row', style: { justifyContent: 'space-between' } }, [
        el('h2', { style: { margin: 0 } }, customer.name),
        btn('Breyta', () => customerForm(customer, () => renderDetail(container, id)), { class: 'btn-ghost btn-sm' }),
      ]),
      el('div', { class: 'muted', style: { marginTop: '8px' } },
        [customer.kennitala && ('kt. ' + customer.kennitala), customer.phone, customer.email, customer.contact_name]
          .filter(Boolean).join(' · ')),
      customer.notes ? el('p', {}, customer.notes) : null,
    ]);

    // Starfsstöðvar
    const locSection = el('div', { class: 'card' }, [
      headRow('Starfsstöðvar', () => locationForm(id, null, () => renderDetail(container, id))),
      locations.length
        ? el('div', {}, locations.map((l) => el('div', { class: 'list-item' }, [
            el('div', { class: 'grow' }, [
              el('div', { class: 'title' }, l.name || l.address || 'Starfsstöð'),
              el('div', { class: 'sub' }, [l.address, l.city, l.access_notes].filter(Boolean).join(' · ')),
            ]),
            btn('Breyta', () => locationForm(id, l, () => renderDetail(container, id)), { class: 'btn-ghost btn-sm' }),
          ])))
        : el('div', { class: 'muted' }, 'Engin starfsstöð skráð.'),
    ]);

    // Tæki
    const equipList = equipment.data || [];
    const equipSection = el('div', { class: 'card' }, [
      headRow('Tæki', () => { prefill.set({ customerId: id }); navigate('/taeki/new'); }),
      equipList.length
        ? el('div', {}, equipList.map((e) => el('a', { class: 'list-item', href: `#/taeki/${e.id}` }, [
            el('div', { class: 'grow' }, [
              el('div', { class: 'title' }, [e.brand, e.model].filter(Boolean).join(' ') || 'Bekkur'),
              el('div', { class: 'sub' }, [e.serial_number && ('nr. ' + e.serial_number), e.locations?.name].filter(Boolean).join(' · ')),
            ]),
            el('span', { class: `badge ${e.status === 'in_service' ? 'done' : e.status === 'needs_service' ? 'urgent' : 'cancelled'}` }, EQUIP_STATUS[e.status] || e.status),
          ])))
        : el('div', { class: 'muted' }, 'Engin tæki skráð.'),
    ]);

    // Þjónustusaga
    const wos = woRes.data || [];
    const woSection = el('div', { class: 'card' }, [
      headRow('Þjónustusaga', () => { prefill.set({ customerId: id }); navigate('/verkbeidnir/new'); }),
      wos.length
        ? el('div', {}, wos.map((w) => el('a', { class: 'list-item', href: `#/verkbeidnir/${w.id}` }, [
            el('div', { class: 'grow' }, [
              el('div', { class: 'title' }, `#${w.number} · ${WO_TYPE[w.type] || w.type}`),
              el('div', { class: 'sub' }, [fmtDate(w.created_at), w.title].filter(Boolean).join(' · ')),
            ]),
            el('span', { class: `badge ${w.status}` }, WO_STATUS[w.status] || w.status),
          ])))
        : el('div', { class: 'muted' }, 'Engin þjónusta skráð.'),
    ]);

    mount(container, el('div', {}, [back, info, locSection, equipSection, woSection]));
  } catch (e) {
    console.error(e);
    errorView(container, e.message);
  }
}

function headRow(title, onAdd) {
  return el('div', { class: 'row', style: { justifyContent: 'space-between', marginBottom: '10px' } }, [
    el('h3', { style: { margin: 0 } }, title),
    btn('+ Bæta við', onAdd, { class: 'btn-ghost btn-sm' }),
  ]);
}

function locationForm(customerId, existing, onDone) {
  const f = {
    name: el('input', { value: existing?.name || '' }),
    address: el('input', { value: existing?.address || '' }),
    postal_code: el('input', { value: existing?.postal_code || '' }),
    city: el('input', { value: existing?.city || '' }),
    access_notes: el('textarea', {}, existing?.access_notes || ''),
  };
  const body = el('div', { class: 'form-grid' }, [
    fieldRow('Heiti (t.d. Hamraborg)', f.name, true),
    fieldRow('Heimilisfang', f.address),
    fieldRow('Póstnúmer', f.postal_code),
    fieldRow('Staður', f.city),
    fieldRow('Aðgangsupplýsingar (lyklaboð, staðsetning bekkja…)', f.access_notes, true),
  ]);
  modal({
    title: existing ? 'Breyta starfsstöð' : 'Ný starfsstöð',
    body,
    onSave: async () => {
      const payload = {
        customer_id: customerId,
        name: f.name.value.trim() || null,
        address: f.address.value.trim() || null,
        postal_code: f.postal_code.value.trim() || null,
        city: f.city.value.trim() || null,
        access_notes: f.access_notes.value.trim() || null,
      };
      const q = existing
        ? sb.from('locations').update(payload).eq('id', existing.id)
        : sb.from('locations').insert(payload);
      const { error } = await q;
      if (error) { toast(error.message, 'err'); return false; }
      toast('Vistað.');
      onDone && onDone();
    },
  });
}
