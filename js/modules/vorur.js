// modules/vorur.js — Vörur (perur, varahlutir, bekkir). Léttur grunnur.
import { el, mount, btn } from '../render.js';
import { sb } from '../supabase.js';
import { isAdmin } from '../auth.js';
import { modal, fieldRow, toast, errorView } from '../ui.js';
import { PRODUCT_CAT, fmtKr } from '../fmt.js';

export async function render(container) {
  mount(container, el('div', { class: 'empty' }, 'Hleð…'));
  let products;
  try {
    const { data, error } = await sb.from('products').select('*').order('name');
    if (error) throw error;
    products = data || [];
  } catch (e) { return errorView(container, e.message); }

  const catSel = el('select', { style: { maxWidth: '180px' } }, [
    el('option', { value: '' }, 'Allir flokkar'),
    ...Object.entries(PRODUCT_CAT).map(([v, l]) => el('option', { value: v }, l)),
  ]);
  const search = el('input', { type: 'search', placeholder: 'Leita…', style: { maxWidth: '240px' } });
  const listWrap = el('div', {});

  function draw() {
    const t = search.value.trim().toLowerCase();
    const cat = catSel.value;
    const list = products.filter((p) =>
      (!cat || p.category === cat) &&
      (!t || [p.name, p.sku, p.brand].some((x) => (x || '').toLowerCase().includes(t))));
    if (!list.length) { mount(listWrap, el('div', { class: 'empty' }, 'Engin vara.')); return; }
    mount(listWrap, list.map((p) => el('div', { class: 'list-item' }, [
      el('div', { class: 'grow' }, [
        el('div', { class: 'title' }, p.name),
        el('div', { class: 'sub' }, [PRODUCT_CAT[p.category], p.sku && ('SKU ' + p.sku), p.brand].filter(Boolean).join(' · ')),
      ]),
      el('div', { style: { textAlign: 'right' } }, [
        el('div', {}, fmtKr(p.sale_price)),
        el('div', { class: 'sub' }, `Lager: ${p.stock_qty ?? 0}`),
      ]),
      isAdmin() ? btn('Breyta', () => form(p, reload), { class: 'btn-ghost btn-sm' }) : null,
    ])));
  }
  const reload = () => render(container);
  catSel.addEventListener('change', draw);
  search.addEventListener('input', draw);

  mount(container, el('div', {}, [
    el('div', { class: 'page-head' }, [
      el('h2', {}, 'Vörur'),
      el('span', { class: 'spacer' }),
      isAdmin() ? btn('+ Ný vara', () => form(null, reload), { class: 'btn-primary' }) : null,
    ]),
    el('div', { class: 'row', style: { marginBottom: '12px' } }, [catSel, search]),
    listWrap,
  ]));
  draw();
}

function form(existing, onDone) {
  const f = {
    name: el('input', { value: existing?.name || '' }),
    sku: el('input', { value: existing?.sku || '' }),
    category: el('select', {}, Object.entries(PRODUCT_CAT).map(([v, l]) => el('option', { value: v, selected: (existing?.category || 'part') === v }, l))),
    brand: el('input', { value: existing?.brand || '' }),
    cost: el('input', { type: 'number', step: '1', value: existing?.cost_price ?? '' }),
    sale: el('input', { type: 'number', step: '1', value: existing?.sale_price ?? '' }),
    stock: el('input', { type: 'number', step: '1', value: existing?.stock_qty ?? '' }),
    unit: el('input', { value: existing?.unit || 'stk' }),
    desc: el('textarea', {}, existing?.description || ''),
  };
  modal({
    title: existing ? 'Breyta vöru' : 'Ný vara',
    body: el('div', { class: 'form-grid' }, [
      fieldRow('Heiti *', f.name, true),
      fieldRow('Flokkur', f.category),
      fieldRow('SKU', f.sku),
      fieldRow('Framleiðandi', f.brand),
      fieldRow('Innkaupsverð', f.cost),
      fieldRow('Söluverð', f.sale),
      fieldRow('Lager', f.stock),
      fieldRow('Eining', f.unit),
      fieldRow('Lýsing', f.desc, true),
    ]),
    onSave: async () => {
      const payload = {
        name: f.name.value.trim(),
        sku: f.sku.value.trim() || null,
        category: f.category.value,
        brand: f.brand.value.trim() || null,
        cost_price: f.cost.value ? Number(f.cost.value) : null,
        sale_price: f.sale.value ? Number(f.sale.value) : null,
        stock_qty: f.stock.value ? Number(f.stock.value) : 0,
        unit: f.unit.value.trim() || 'stk',
        description: f.desc.value.trim() || null,
      };
      if (!payload.name) { toast('Heiti vantar.', 'err'); return false; }
      const q = existing
        ? sb.from('products').update(payload).eq('id', existing.id)
        : sb.from('products').insert(payload);
      const { error } = await q;
      if (error) { toast(error.message, 'err'); return false; }
      toast('Vistað.'); onDone && onDone();
    },
  });
}
