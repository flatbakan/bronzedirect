// modules/reikningar.js — Reikningar og tilboð (úr verkbeiðnum eða handvirkt).
import { el, mount, btn } from '../render.js';
import { sb } from '../supabase.js';
import { modal, fieldRow, toast, confirmDialog, errorView } from '../ui.js';
import { fmtDate, fmtKr } from '../fmt.js';

const KIND = { quote: 'Tilboð', invoice: 'Reikningur' };
const INV_STATUS = { draft: 'Drög', sent: 'Sent', paid: 'Greitt', cancelled: 'Aflýst' };

export async function render(container, param) {
  if (param) return renderDetail(container, param);
  return renderList(container);
}

async function renderList(container) {
  mount(container, el('div', { class: 'empty' }, 'Hleð…'));
  let rows;
  try {
    const { data, error } = await sb.from('invoices')
      .select('*, customers(name)').order('created_at', { ascending: false });
    if (error) throw error;
    rows = data || [];
  } catch (e) { return errorView(container, e.message); }

  const body = rows.length
    ? el('div', {}, rows.map((i) => el('a', { class: 'list-item', href: `#/reikningar/${i.id}` }, [
        el('div', { class: 'grow' }, [
          el('div', { class: 'title' }, `${KIND[i.kind]} #${i.number} · ${i.customers?.name || ''}`),
          el('div', { class: 'sub' }, fmtDate(i.issue_date)),
        ]),
        el('span', { class: `badge ${i.status === 'paid' ? 'done' : i.status === 'cancelled' ? 'cancelled' : 'scheduled'}` }, INV_STATUS[i.status]),
      ])))
    : el('div', { class: 'empty' }, 'Engir reikningar.');

  mount(container, el('div', {}, [
    el('div', { class: 'page-head' }, el('h2', {}, 'Reikningar og tilboð')),
    body,
  ]));
}

async function renderDetail(container, id) {
  mount(container, el('div', { class: 'empty' }, 'Hleð…'));
  try {
    const [invRes, linesRes, company] = await Promise.all([
      sb.from('invoices').select('*, customers(name,kennitala,address)').eq('id', id).maybeSingle(),
      sb.from('invoice_lines').select('*').eq('invoice_id', id).order('created_at'),
      sb.from('company_settings').select('*').eq('id', 1).maybeSingle(),
    ]);
    if (invRes.error) throw invRes.error;
    const inv = invRes.data;
    if (!inv) return errorView(container, 'Reikningur fannst ekki.');
    const lines = linesRes.data || [];
    const co = company.data || {};

    const net = lines.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.unit_price) || 0), 0);
    const vat = net * (Number(inv.vat_rate) || 0) / 100;
    const total = net + vat;

    const reload = () => renderDetail(container, id);

    const lineRows = lines.map((l) => el('div', { class: 'list-item' }, [
      el('div', { class: 'grow' }, [
        el('div', { class: 'title' }, l.description),
        el('div', { class: 'sub' }, `${l.quantity} × ${fmtKr(l.unit_price)}`),
      ]),
      el('div', {}, fmtKr((l.quantity || 0) * (l.unit_price || 0))),
    ]));

    const totals = el('div', { class: 'card' }, [
      totalRow('Nettó', fmtKr(net)),
      totalRow(`VSK (${inv.vat_rate}%)`, fmtKr(vat)),
      totalRow('Samtals', fmtKr(total), true),
    ]);

    const statusSel = el('select', { style: { maxWidth: '160px' } },
      Object.entries(INV_STATUS).map(([v, l]) => el('option', { value: v, selected: v === inv.status }, l)));
    statusSel.addEventListener('change', async () => {
      const { error } = await sb.from('invoices').update({ status: statusSel.value }).eq('id', inv.id);
      if (error) toast(error.message, 'err'); else toast('Staða uppfærð.');
    });

    mount(container, el('div', {}, [
      el('a', { href: '#/reikningar', class: 'link-btn' }, '← Reikningar'),
      el('div', { class: 'page-head' }, [
        el('h2', {}, `${KIND[inv.kind]} #${inv.number}`),
        el('span', { class: 'spacer' }),
        el('div', { class: 'row' }, [statusSel, btn('🖨️ Prenta', () => window.print(), { class: 'btn-ghost btn-sm' })]),
      ]),
      el('div', { class: 'card' }, [
        el('div', { class: 'row', style: { justifyContent: 'space-between' } }, [
          el('div', {}, [el('strong', {}, co.company_name || 'Bronze Direct'), el('div', { class: 'muted' }, [co.address, co.kennitala && ('kt. ' + co.kennitala)].filter(Boolean).join(' · '))]),
          el('div', { style: { textAlign: 'right' } }, [el('strong', {}, inv.customers?.name || ''), el('div', { class: 'muted' }, [inv.customers?.kennitala && ('kt. ' + inv.customers.kennitala), inv.customers?.address].filter(Boolean).join(' · '))]),
        ]),
        el('div', { class: 'muted', style: { marginTop: '10px' } }, `Dagsetning: ${fmtDate(inv.issue_date)}`),
      ]),
      el('div', { class: 'card' }, [
        el('div', { class: 'row', style: { justifyContent: 'space-between', marginBottom: '10px' } }, [
          el('h3', { style: { margin: 0 } }, 'Línur'),
          btn('+ Lína', () => lineForm(inv.id, reload), { class: 'btn-ghost btn-sm' }),
        ]),
        lines.length ? el('div', {}, lineRows) : el('div', { class: 'muted' }, 'Engar línur.'),
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
  const price = el('input', { type: 'number', step: '1', value: '' });
  modal({
    title: 'Ný lína',
    body: el('div', { class: 'form-grid' }, [
      fieldRow('Lýsing *', desc, true),
      fieldRow('Fjöldi', qty),
      fieldRow('Einingaverð', price),
    ]),
    onSave: async () => {
      if (!desc.value.trim()) { toast('Lýsingu vantar.', 'err'); return false; }
      const { error } = await sb.from('invoice_lines').insert({
        invoice_id: invoiceId,
        description: desc.value.trim(),
        quantity: Number(qty.value) || 1,
        unit_price: price.value ? Number(price.value) : 0,
      });
      if (error) { toast(error.message, 'err'); return false; }
      toast('Lína bætt við.'); onDone && onDone();
    },
  });
}
