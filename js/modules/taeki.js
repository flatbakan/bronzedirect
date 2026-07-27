// modules/taeki.js — Tæki (ljósabekkir): listi, spjaldskrá, peruskipti.
import { el, mount, btn } from '../render.js';
import { sb } from '../supabase.js';
import { listCustomers, listLocations, listProducts, listEquipment } from '../db.js';
import { getProfile } from '../auth.js';
import { modal, fieldRow, toast, errorView } from '../ui.js';
import { navigate } from '../router.js';
import { prefill } from '../state.js';
import { EQUIP_STATUS, fmtDate, todayISO } from '../fmt.js';

export async function render(container, param) {
  if (param === 'new') return equipForm(container, null);
  if (param) return renderDetail(container, param);
  return renderList(container);
}

// ---------------- Listi ----------------
async function renderList(container) {
  mount(container, el('div', { class: 'empty' }, 'Hleð…'));
  let rows;
  try { rows = await listEquipment(); }
  catch (e) { return errorView(container, e.message); }

  const search = el('input', { type: 'search', placeholder: 'Leita (gerð, raðnúmer, viðskiptavinur)…', style: { maxWidth: '320px' } });
  const listWrap = el('div', {});
  function draw() {
    const t = search.value.trim().toLowerCase();
    const list = rows.filter((e) => !t ||
      [e.brand, e.model, e.serial_number, e.customers?.name].some((x) => (x || '').toLowerCase().includes(t)));
    if (!list.length) { mount(listWrap, el('div', { class: 'empty' }, 'Ekkert tæki.')); return; }
    mount(listWrap, list.map((e) => el('a', { class: 'list-item', href: `#/taeki/${e.id}` }, [
      el('div', { class: 'grow' }, [
        el('div', { class: 'title' }, [e.brand, e.model].filter(Boolean).join(' ') || 'Bekkur'),
        el('div', { class: 'sub' }, [e.customers?.name, e.locations?.name, e.serial_number && ('nr. ' + e.serial_number)].filter(Boolean).join(' · ')),
      ]),
      el('span', { class: `badge ${e.status === 'in_service' ? 'done' : e.status === 'needs_service' ? 'urgent' : 'cancelled'}` }, EQUIP_STATUS[e.status] || e.status),
    ])));
  }
  search.addEventListener('input', draw);
  mount(container, el('div', {}, [
    el('div', { class: 'page-head' }, [
      el('h2', {}, 'Tæki'),
      el('span', { class: 'spacer' }),
      btn('+ Nýtt tæki', () => equipForm(container, null), { class: 'btn-primary' }),
    ]),
    el('div', { class: 'row', style: { marginBottom: '12px' } }, search),
    listWrap,
  ]));
  draw();
}

// ---------------- Form ----------------
async function equipForm(container, existing) {
  mount(container, el('div', { class: 'empty' }, 'Hleð…'));
  const pre = prefill.take();
  let customers = [];
  try { customers = await listCustomers({ activeOnly: true }); }
  catch (e) { return errorView(container, e.message); }

  const custSel = el('select', {}, [el('option', { value: '' }, '— Veldu viðskiptavin —'),
    ...customers.map((c) => el('option', { value: c.id, selected: (existing?.customer_id || pre?.customerId) === c.id }, c.name))]);
  const locSel = el('select', {}, [el('option', { value: '' }, '— Engin —')]);

  async function loadLocs(customerId, selectedId) {
    locSel.replaceChildren(el('option', { value: '' }, '— Engin —'));
    if (!customerId) return;
    const locs = await listLocations(customerId);
    locs.forEach((l) => locSel.append(el('option', { value: l.id, selected: l.id === selectedId }, l.name || l.address || 'Starfsstöð')));
  }
  custSel.addEventListener('change', () => loadLocs(custSel.value, null));
  await loadLocs(custSel.value, existing?.location_id);

  const f = {
    brand: el('input', { value: existing?.brand || '' }),
    model: el('input', { value: existing?.model || '' }),
    serial: el('input', { value: existing?.serial_number || '' }),
    install: el('input', { type: 'date', value: existing?.install_date || '' }),
    status: el('select', {}, Object.entries(EQUIP_STATUS).map(([v, l]) => el('option', { value: v, selected: (existing?.status || 'in_service') === v }, l))),
    bulbType: el('input', { value: existing?.bulb_type || '' }),
    bulbCount: el('input', { type: 'number', value: existing?.bulb_count ?? '' }),
    facial: el('input', { type: 'number', value: existing?.facial_bulb_count ?? '' }),
    hours: el('input', { type: 'number', step: '0.1', value: existing?.current_bulb_hours ?? '' }),
    notes: el('textarea', {}, existing?.notes || ''),
  };

  const form = el('div', { class: 'form-grid' }, [
    fieldRow('Viðskiptavinur *', custSel, true),
    fieldRow('Starfsstöð', locSel, true),
    fieldRow('Framleiðandi', f.brand),
    fieldRow('Gerð', f.model),
    fieldRow('Raðnúmer', f.serial),
    fieldRow('Uppsett', f.install),
    fieldRow('Staða', f.status),
    fieldRow('Perutegund', f.bulbType),
    fieldRow('Fjöldi líkamspera', f.bulbCount),
    fieldRow('Fjöldi andlitspera', f.facial),
    fieldRow('Núv. peru-klst', f.hours),
    fieldRow('Athugasemdir', f.notes, true),
  ]);

  const save = btn(existing ? 'Vista breytingar' : 'Stofna tæki', async () => {
    if (!custSel.value) { toast('Veldu viðskiptavin.', 'err'); return; }
    save.disabled = true;
    const payload = {
      customer_id: custSel.value,
      location_id: locSel.value || null,
      brand: f.brand.value.trim() || null,
      model: f.model.value.trim() || null,
      serial_number: f.serial.value.trim() || null,
      install_date: f.install.value || null,
      status: f.status.value,
      bulb_type: f.bulbType.value.trim() || null,
      bulb_count: f.bulbCount.value ? Number(f.bulbCount.value) : null,
      facial_bulb_count: f.facial.value ? Number(f.facial.value) : null,
      current_bulb_hours: f.hours.value ? Number(f.hours.value) : null,
      notes: f.notes.value.trim() || null,
    };
    const q = existing
      ? sb.from('equipment').update(payload).eq('id', existing.id)
      : sb.from('equipment').insert(payload).select('id').single();
    const { data, error } = await q;
    save.disabled = false;
    if (error) { toast(error.message, 'err'); return; }
    toast('Vistað.');
    navigate('/taeki/' + (existing?.id || data.id));
  }, { class: 'btn-primary' });

  mount(container, el('div', {}, [
    el('a', { href: '#/taeki', class: 'link-btn' }, '← Tæki'),
    el('div', { class: 'page-head' }, el('h2', {}, existing ? 'Breyta tæki' : 'Nýtt tæki')),
    el('div', { class: 'card' }, form),
    el('div', { class: 'row' }, save),
  ]));
}

// ---------------- Spjaldskrá ----------------
async function renderDetail(container, id) {
  mount(container, el('div', { class: 'empty' }, 'Hleð…'));
  try {
    const [eqRes, bcRes] = await Promise.all([
      sb.from('equipment').select('*, customers(id,name), locations(name)').eq('id', id).maybeSingle(),
      sb.from('bulb_changes').select('*, profiles(full_name), products(name)').eq('equipment_id', id).order('changed_at', { ascending: false }),
    ]);
    if (eqRes.error) throw eqRes.error;
    const eq = eqRes.data;
    if (!eq) return errorView(container, 'Tæki fannst ekki.');
    const changes = bcRes.data || [];

    const info = el('div', { class: 'card' }, [
      el('div', { class: 'row', style: { justifyContent: 'space-between' } }, [
        el('h2', { style: { margin: 0 } }, [eq.brand, eq.model].filter(Boolean).join(' ') || 'Bekkur'),
        btn('Breyta', () => equipForm(container, eq), { class: 'btn-ghost btn-sm' }),
      ]),
      el('div', { class: 'muted', style: { marginTop: '6px' } }, [
        eq.customers && el('a', { href: `#/vidskiptavinir/${eq.customers.id}`, class: 'link-btn' }, eq.customers.name),
      ]),
      infoGrid([
        ['Raðnúmer', eq.serial_number],
        ['Starfsstöð', eq.locations?.name],
        ['Staða', EQUIP_STATUS[eq.status]],
        ['Uppsett', fmtDate(eq.install_date)],
        ['Perutegund', eq.bulb_type],
        ['Líkamsperur', eq.bulb_count],
        ['Andlitsperur', eq.facial_bulb_count],
        ['Núv. peru-klst', eq.current_bulb_hours],
      ]),
      eq.notes ? el('p', {}, eq.notes) : null,
    ]);

    const bulbSection = el('div', { class: 'card' }, [
      el('div', { class: 'row', style: { justifyContent: 'space-between', marginBottom: '10px' } }, [
        el('h3', { style: { margin: 0 } }, 'Perusaga'),
        btn('+ Skrá peruskipti', () => bulbChangeForm(eq, () => renderDetail(container, id)), { class: 'btn-ghost btn-sm' }),
      ]),
      changes.length
        ? el('div', {}, changes.map((c) => el('div', { class: 'list-item' }, [
            el('div', { class: 'grow' }, [
              el('div', { class: 'title' }, fmtDate(c.changed_at) + (c.quantity ? ` · ${c.quantity} perur` : '')),
              el('div', { class: 'sub' }, [c.products?.name, c.hours_at_change != null && (`${c.hours_at_change} klst`), c.profiles?.full_name, c.notes].filter(Boolean).join(' · ')),
            ]),
          ])))
        : el('div', { class: 'muted' }, 'Engin peruskipti skráð.'),
    ]);

    mount(container, el('div', {}, [
      el('a', { href: '#/taeki', class: 'link-btn' }, '← Tæki'),
      info, bulbSection,
    ]));
  } catch (e) {
    console.error(e);
    errorView(container, e.message);
  }
}

function infoGrid(pairs) {
  return el('div', { class: 'grid', style: { gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', marginTop: '12px' } },
    pairs.filter(([, v]) => v != null && v !== '').map(([k, v]) => el('div', {}, [
      el('div', { class: 'muted', style: { fontSize: '12px' } }, k),
      el('div', {}, String(v)),
    ])));
}

async function bulbChangeForm(eq, onDone) {
  const me = getProfile();
  let bulbs = [];
  try { bulbs = await listProducts({ category: 'bulb' }); } catch { /* skip */ }
  const f = {
    date: el('input', { type: 'date', value: todayISO() }),
    product: el('select', {}, [el('option', { value: '' }, '— Perutegund (valfrjálst) —'),
      ...bulbs.map((b) => el('option', { value: b.id }, b.name))]),
    qty: el('input', { type: 'number', value: eq.bulb_count ?? '' }),
    hours: el('input', { type: 'number', step: '0.1', value: eq.current_bulb_hours ?? '' }),
    notes: el('textarea', {}, ''),
    reset: el('input', { type: 'checkbox', checked: true }),
  };
  const body = el('div', { class: 'form-grid' }, [
    fieldRow('Dagsetning', f.date),
    fieldRow('Fjöldi pera', f.qty),
    fieldRow('Perutegund', f.product, true),
    fieldRow('Klst á bekk við skipti', f.hours),
    el('div', { class: 'field' }, [el('label', {}, 'Núllstilla peru-klst eftir skipti'), el('div', { class: 'row' }, [f.reset, el('span', { class: 'muted' }, 'Já')])]),
    fieldRow('Athugasemdir', f.notes, true),
  ]);
  modal({
    title: 'Skrá peruskipti',
    body,
    onSave: async () => {
      const payload = {
        equipment_id: eq.id,
        changed_at: f.date.value || todayISO(),
        changed_by: me?.id || null,
        bulb_product_id: f.product.value || null,
        quantity: f.qty.value ? Number(f.qty.value) : null,
        hours_at_change: f.hours.value ? Number(f.hours.value) : null,
        notes: f.notes.value.trim() || null,
      };
      const { error } = await sb.from('bulb_changes').insert(payload);
      if (error) { toast(error.message, 'err'); return false; }
      // Núllstilla peru-klst á bekknum ef valið
      if (f.reset.checked) {
        await sb.from('equipment').update({ current_bulb_hours: 0 }).eq('id', eq.id);
      }
      toast('Peruskipti skráð.');
      onDone && onDone();
    },
  });
}
