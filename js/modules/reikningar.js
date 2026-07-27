// modules/reikningar.js — Invoices and quotes (from work orders or manual).
import { el, mount, btn } from '../render.js';
import { sb } from '../supabase.js';
import { listCustomers, getSettings } from '../db.js';
import { getProfile } from '../auth.js';
import { modal, fieldRow, toast, confirmDialog, errorView } from '../ui.js';
import { navigate } from '../router.js';
import { fmtDate, money, isOverdue } from '../fmt.js';
import { VAT_RATE } from '../config.js';

const KIND = { quote: 'Quote', invoice: 'Invoice' };
const INV_STATUS = { draft: 'Draft', sent: 'Sent', paid: 'Paid', cancelled: 'Cancelled' };

function invOverdue(i) {
  return i.kind === 'invoice' && i.status !== 'paid' && i.status !== 'cancelled' && isOverdue(i.due_date);
}

export async function render(container, param) {
  if (param) return renderDetail(container, param);
  return renderList(container);
}

async function renderList(container) {
  mount(container, el('div', { class: 'empty' }, 'Loading…'));
  let rows;
  try {
    const { data, error } = await sb.from('invoices')
      .select('*, customers(name)').order('created_at', { ascending: false });
    if (error) throw error;
    rows = data || [];
  } catch (e) { return errorView(container, e.message); }

  const filterSel = el('select', { style: { maxWidth: '180px' } }, [
    el('option', { value: 'all' }, 'All'),
    el('option', { value: 'unpaid' }, 'Unpaid invoices'),
    el('option', { value: 'overdue' }, 'Overdue'),
    el('option', { value: 'quote' }, 'Quotes'),
    el('option', { value: 'paid' }, 'Paid'),
  ]);
  const listWrap = el('div', {});

  function draw() {
    const fmode = filterSel.value;
    const list = rows.filter((i) => {
      if (fmode === 'unpaid') return i.kind === 'invoice' && i.status !== 'paid' && i.status !== 'cancelled';
      if (fmode === 'overdue') return invOverdue(i);
      if (fmode === 'quote') return i.kind === 'quote';
      if (fmode === 'paid') return i.status === 'paid';
      return true;
    });
    if (!list.length) { mount(listWrap, el('div', { class: 'empty' }, 'Nothing here.')); return; }
    mount(listWrap, list.map((i) => el('a', { class: 'list-item', href: `#/reikningar/${i.id}` }, [
      el('div', { class: 'grow' }, [
        el('div', { class: 'title' }, `${KIND[i.kind]} #${i.number} · ${i.customers?.name || ''}`),
        el('div', { class: 'sub' }, [fmtDate(i.issue_date), i.due_date && ('due ' + fmtDate(i.due_date))].filter(Boolean).join(' · ')),
      ]),
      invOverdue(i) ? el('span', { class: 'badge urgent' }, 'Overdue') : null,
      el('span', { class: `badge ${i.status === 'paid' ? 'done' : i.status === 'cancelled' ? 'cancelled' : 'scheduled'}` }, INV_STATUS[i.status]),
    ])));
  }
  filterSel.addEventListener('change', draw);

  mount(container, el('div', {}, [
    el('div', { class: 'page-head' }, [
      el('h2', {}, 'Invoices & quotes'),
      el('span', { class: 'spacer' }),
      btn('+ New', () => newInvoiceForm(() => renderList(container)), { class: 'btn-primary' }),
    ]),
    el('div', { class: 'row', style: { marginBottom: '12px' } }, filterSel),
    listWrap,
  ]));
  draw();
}

async function newInvoiceForm(onDone) {
  let customers = [];
  try { customers = await listCustomers({ activeOnly: true }); } catch { /* ignore */ }
  const kind = el('select', {}, [el('option', { value: 'invoice' }, 'Invoice'), el('option', { value: 'quote' }, 'Quote')]);
  const cust = el('select', {}, [el('option', { value: '' }, '— Select customer —'),
    ...customers.map((c) => el('option', { value: c.id }, c.name))]);
  const due = el('input', { type: 'date' });
  modal({
    title: 'New invoice / quote',
    saveLabel: 'Create',
    body: el('div', { class: 'form-grid' }, [
      fieldRow('Type', kind),
      fieldRow('Customer *', cust, true),
      fieldRow('Due date', due),
    ]),
    onSave: async () => {
      if (!cust.value) { toast('Select a customer.', 'err'); return false; }
      const me = getProfile();
      const settings = await getSettings().catch(() => ({}));
      const { data, error } = await sb.from('invoices').insert({
        kind: kind.value,
        customer_id: cust.value,
        due_date: due.value || null,
        vat_rate: settings?.vat_rate ?? VAT_RATE,
        created_by: me?.id || null,
      }).select('id').single();
      if (error) { toast(error.message, 'err'); return false; }
      onDone && onDone();
      navigate('/reikningar/' + data.id);
    },
  });
}

async function renderDetail(container, id) {
  mount(container, el('div', { class: 'empty' }, 'Loading…'));
  try {
    const [invRes, linesRes, company] = await Promise.all([
      sb.from('invoices').select('*, customers(name,kennitala,address,postal_code,city)').eq('id', id).maybeSingle(),
      sb.from('invoice_lines').select('*').eq('invoice_id', id).order('created_at'),
      sb.from('company_settings').select('*').eq('id', 1).maybeSingle(),
    ]);
    if (invRes.error) throw invRes.error;
    const inv = invRes.data;
    if (!inv) return errorView(container, 'Invoice not found.');
    const lines = linesRes.data || [];
    const co = company.data || {};

    const net = lines.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.unit_price) || 0), 0);
    const vat = net * (Number(inv.vat_rate) || 0) / 100;
    const total = net + vat;

    const reload = () => renderDetail(container, id);

    const lineRows = lines.map((l) => el('div', { class: 'list-item' }, [
      el('div', { class: 'grow' }, [
        el('div', { class: 'title' }, l.description),
        el('div', { class: 'sub' }, `${l.quantity} × ${money(l.unit_price)}`),
      ]),
      el('div', {}, money((l.quantity || 0) * (l.unit_price || 0))),
    ]));

    const totals = el('div', { class: 'card' }, [
      totalRow('Net', money(net)),
      totalRow(`VAT (${inv.vat_rate}%)`, money(vat)),
      totalRow('Total', money(total), true),
    ]);

    const statusSel = el('select', { style: { maxWidth: '150px' } },
      Object.entries(INV_STATUS).map(([v, l]) => el('option', { value: v, selected: v === inv.status }, l)));
    statusSel.addEventListener('change', async () => {
      const { error } = await sb.from('invoices').update({ status: statusSel.value }).eq('id', inv.id);
      if (error) toast(error.message, 'err'); else { toast('Status updated.'); reload(); }
    });

    const dueInput = el('input', { type: 'date', value: inv.due_date || '', style: { maxWidth: '170px' } });
    dueInput.addEventListener('change', async () => {
      const { error } = await sb.from('invoices').update({ due_date: dueInput.value || null }).eq('id', inv.id);
      if (error) toast(error.message, 'err'); else toast('Due date saved.');
    });

    const overdue = inv.kind === 'invoice' && inv.status !== 'paid' && inv.status !== 'cancelled' && isOverdue(inv.due_date);

    const actions = el('div', { class: 'row' }, [
      statusSel,
      (inv.kind === 'invoice' && inv.status !== 'paid') ? btn('Mark paid', async () => {
        const { error } = await sb.from('invoices').update({ status: 'paid' }).eq('id', inv.id);
        if (error) { toast(error.message, 'err'); return; }
        toast('Marked paid.'); reload();
      }, { class: 'btn-primary btn-sm' }) : null,
      inv.kind === 'quote' ? btn('Convert to invoice', async () => {
        if (!(await confirmDialog('Convert this quote to an invoice?', { danger: false, confirmLabel: 'Convert' }))) return;
        const { error } = await sb.from('invoices').update({ kind: 'invoice', status: 'draft', issue_date: new Date().toISOString().slice(0, 10) }).eq('id', inv.id);
        if (error) { toast(error.message, 'err'); return; }
        toast('Converted to invoice.'); reload();
      }, { class: 'btn-primary btn-sm' }) : null,
      btn('🖨️ Print', () => window.print(), { class: 'btn-ghost btn-sm' }),
    ]);

    mount(container, el('div', {}, [
      el('a', { href: '#/reikningar', class: 'link-btn' }, '← Invoices'),
      el('div', { class: 'page-head' }, [
        el('h2', {}, `${KIND[inv.kind]} #${inv.number}`),
        overdue ? el('span', { class: 'badge urgent' }, 'Overdue') : null,
        el('span', { class: 'spacer' }),
        actions,
      ]),
      el('div', { class: 'card' }, [
        el('div', { class: 'row', style: { justifyContent: 'space-between' } }, [
          el('div', {}, [el('strong', {}, co.company_name || 'Bronze Direct'), el('div', { class: 'muted' }, [co.address, co.kennitala && ('Reg. ' + co.kennitala)].filter(Boolean).join(' · '))]),
          el('div', { style: { textAlign: 'right' } }, [
            el('strong', {}, inv.customers?.name || ''),
            el('div', { class: 'muted' }, [inv.customers?.address, inv.customers?.postal_code, inv.customers?.city].filter(Boolean).join(', ')),
            el('div', { class: 'muted' }, inv.customers?.kennitala ? ('Reg. ' + inv.customers.kennitala) : ''),
          ]),
        ]),
        el('div', { class: 'row', style: { marginTop: '10px', gap: '18px' } }, [
          el('div', { class: 'muted' }, `Date: ${fmtDate(inv.issue_date)}`),
          el('label', { class: 'row', style: { gap: '6px', fontSize: '13px', color: 'var(--muted)' } }, ['Due:', dueInput]),
        ]),
      ]),
      el('div', { class: 'card' }, [
        el('div', { class: 'row', style: { justifyContent: 'space-between', marginBottom: '10px' } }, [
          el('h3', { style: { margin: 0 } }, 'Lines'),
          btn('+ Line', () => lineForm(inv.id, reload), { class: 'btn-ghost btn-sm' }),
        ]),
        lines.length ? el('div', {}, lineRows) : el('div', { class: 'muted' }, 'No lines.'),
      ]),
      totals,
    ]));
  } catch (e) {
    console.error(e);
    errorView(container, e.message);
  }
}

function totalRow(label, value, strong = false) {
  return el('div', { class: 'row', style: { justifyContent: 'space-between', fontWeight: strong ? '700' : '400', fontSize: strong ? '17px' : '15px' } }, [
    el('span', {}, label), el('span', {}, value),
  ]);
}

function lineForm(invoiceId, onDone) {
  const desc = el('input', {});
  const qty = el('input', { type: 'number', step: '0.01', value: '1' });
  const price = el('input', { type: 'number', step: '0.01', value: '' });
  modal({
    title: 'New line',
    body: el('div', { class: 'form-grid' }, [
      fieldRow('Description *', desc, true),
      fieldRow('Quantity', qty),
      fieldRow('Unit price', price),
    ]),
    onSave: async () => {
      if (!desc.value.trim()) { toast('Description is required.', 'err'); return false; }
      const { error } = await sb.from('invoice_lines').insert({
        invoice_id: invoiceId,
        description: desc.value.trim(),
        quantity: Number(qty.value) || 1,
        unit_price: price.value ? Number(price.value) : 0,
      });
      if (error) { toast(error.message, 'err'); return false; }
      toast('Line added.'); onDone && onDone();
    },
  });
}
