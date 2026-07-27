// modules/vidskiptavinir.js — Customers: list + profile.
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

// ---------------- List ----------------
async function renderList(container) {
  mount(container, el('div', { class: 'empty' }, 'Loading…'));
  let customers;
  try { customers = await listCustomers(); }
  catch (e) { return errorView(container, e.message); }

  const search = el('input', { type: 'search', placeholder: 'Search…', style: { maxWidth: '260px' } });
  const listWrap = el('div', {});

  function draw() {
    const term = search.value.trim().toLowerCase();
    const rows = customers.filter((c) =>
      !term || (c.name || '').toLowerCase().includes(term) || (c.kennitala || '').includes(term));
    if (!rows.length) { mount(listWrap, el('div', { class: 'empty' }, 'No customers.')); return; }
    mount(listWrap, rows.map((c) => el('a', { class: 'list-item', href: `#/vidskiptavinir/${c.id}` }, [
      el('div', { class: 'grow' }, [
        el('div', { class: 'title' }, c.name),
        el('div', { class: 'sub' }, [c.kennitala, c.phone, c.contact_name].filter(Boolean).join(' · ')),
      ]),
      c.is_active ? null : el('span', { class: 'badge cancelled' }, 'Inactive'),
    ])));
  }
  search.addEventListener('input', draw);

  mount(container, el('div', {}, [
    el('div', { class: 'page-head' }, [
      el('h2', {}, 'Customers'),
      el('span', { class: 'spacer' }),
      btn('+ New', () => customerForm(null, () => renderList(container)), { class: 'btn-primary' }),
    ]),
    el('div', { class: 'row', style: { marginBottom: '12px' } }, search),
    listWrap,
  ]));
  draw();
}

// ---------------- Form (new/edit) ----------------
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
    fieldRow('Name *', f.name, true),
    fieldRow('Company reg. no.', f.kennitala),
    fieldRow('Phone', f.phone),
    fieldRow('Email', f.email),
    fieldRow('Contact person', f.contact_name),
    fieldRow('Notes', f.notes, true),
  ]);
  modal({
    title: existing ? 'Edit customer' : 'New customer',
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
      if (!payload.name) { toast('Name is required.', 'err'); return false; }
      const q = existing
        ? sb.from('customers').update(payload).eq('id', existing.id)
        : sb.from('customers').insert(payload);
      const { error } = await q;
      if (error) { toast(error.message, 'err'); return false; }
      toast('Saved.');
      onDone && onDone();
    },
  });
}

// ---------------- Profile ----------------
async function renderDetail(container, id) {
  mount(container, el('div', { class: 'empty' }, 'Loading…'));
  try {
    const [customer, locations, equipment, woRes] = await Promise.all([
      getCustomer(id),
      listLocations(id),
      sb.from('equipment').select('*, locations(name)').eq('customer_id', id).order('created_at', { ascending: false }),
      sb.from('work_orders').select('*').eq('customer_id', id).order('created_at', { ascending: false }).limit(20),
    ]);
    if (!customer) return errorView(container, 'Customer not found.');
    if (equipment.error) throw equipment.error;

    const back = el('a', { href: '#/vidskiptavinir', class: 'link-btn' }, '← Customers');

    const info = el('div', { class: 'card' }, [
      el('div', { class: 'row', style: { justifyContent: 'space-between' } }, [
        el('h2', { style: { margin: 0 } }, customer.name),
        btn('Edit', () => customerForm(customer, () => renderDetail(container, id)), { class: 'btn-ghost btn-sm' }),
      ]),
      el('div', { class: 'muted', style: { marginTop: '8px' } },
        [customer.kennitala && ('Reg. ' + customer.kennitala), customer.phone, customer.email, customer.contact_name]
          .filter(Boolean).join(' · ')),
      customer.notes ? el('p', {}, customer.notes) : null,
    ]);

    // Locations
    const locSection = el('div', { class: 'card' }, [
      headRow('Locations', () => locationForm(id, null, () => renderDetail(container, id))),
      locations.length
        ? el('div', {}, locations.map((l) => el('div', { class: 'list-item' }, [
            el('div', { class: 'grow' }, [
              el('div', { class: 'title' }, l.name || l.address || 'Location'),
              el('div', { class: 'sub' }, [l.address, l.city, l.access_notes].filter(Boolean).join(' · ')),
            ]),
            btn('Edit', () => locationForm(id, l, () => renderDetail(container, id)), { class: 'btn-ghost btn-sm' }),
          ])))
        : el('div', { class: 'muted' }, 'No locations added.'),
    ]);

    // Equipment
    const equipList = equipment.data || [];
    const equipSection = el('div', { class: 'card' }, [
      headRow('Equipment', () => { prefill.set({ customerId: id }); navigate('/taeki/new'); }),
      equipList.length
        ? el('div', {}, equipList.map((e) => el('a', { class: 'list-item', href: `#/taeki/${e.id}` }, [
            el('div', { class: 'grow' }, [
              el('div', { class: 'title' }, [e.brand, e.model].filter(Boolean).join(' ') || 'Sunbed'),
              el('div', { class: 'sub' }, [e.serial_number && ('S/N ' + e.serial_number), e.locations?.name].filter(Boolean).join(' · ')),
            ]),
            el('span', { class: `badge ${e.status === 'in_service' ? 'done' : e.status === 'needs_service' ? 'urgent' : 'cancelled'}` }, EQUIP_STATUS[e.status] || e.status),
          ])))
        : el('div', { class: 'muted' }, 'No equipment added.'),
    ]);

    // Service history
    const wos = woRes.data || [];
    const woSection = el('div', { class: 'card' }, [
      headRow('Service history', () => { prefill.set({ customerId: id }); navigate('/verkbeidnir/new'); }),
      wos.length
        ? el('div', {}, wos.map((w) => el('a', { class: 'list-item', href: `#/verkbeidnir/${w.id}` }, [
            el('div', { class: 'grow' }, [
              el('div', { class: 'title' }, `#${w.number} · ${WO_TYPE[w.type] || w.type}`),
              el('div', { class: 'sub' }, [fmtDate(w.created_at), w.title].filter(Boolean).join(' · ')),
            ]),
            el('span', { class: `badge ${w.status}` }, WO_STATUS[w.status] || w.status),
          ])))
        : el('div', { class: 'muted' }, 'No service recorded.'),
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
    btn('+ Add', onAdd, { class: 'btn-ghost btn-sm' }),
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
    fieldRow('Name (e.g. High Street)', f.name, true),
    fieldRow('Address', f.address),
    fieldRow('Postcode', f.postal_code),
    fieldRow('Town / city', f.city),
    fieldRow('Access notes (key code, where the beds are…)', f.access_notes, true),
  ]);
  modal({
    title: existing ? 'Edit location' : 'New location',
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
      toast('Saved.');
      onDone && onDone();
    },
  });
}
