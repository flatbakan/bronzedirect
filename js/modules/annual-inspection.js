// modules/annual-inspection.js — Kwik Tan annual inspection, per asset, template by unit type.
import { el, mount, btn } from '../render.js';
import { sb } from '../supabase.js';
import { STORAGE_BUCKET } from '../config.js';
import { getProfile } from '../auth.js';
import { toast, confirmDialog, errorView, fieldRow } from '../ui.js';
import { navigate } from '../router.js';
import { prefill } from '../state.js';
import { fmtDate, todayISO } from '../fmt.js';
import { signaturePad } from './signature.js';

const STATES = ['pass', 'repaired', 'fault'];
const STATE_LABEL = { pass: 'Pass', repaired: 'Repaired', fault: 'Fault' };
const TEMPLATE_LABEL = { power_tower: 'Power Tower', ixtreme: 'iXtreme Plus', p9s: 'megaSun P9S', k11: 'megaSun K11' };

let TEMPLATES = null;
async function loadTemplates() {
  if (!TEMPLATES) TEMPLATES = await fetch('./js/inspection-templates.json').then((r) => r.json());
  return TEMPLATES;
}

function detectTemplate(asset) {
  const s = [asset?.model, asset?.type, asset?.name].filter(Boolean).join(' ').toLowerCase();
  if (s.includes('power tower')) return 'power_tower';
  if (s.includes('xtreme')) return 'ixtreme';
  if (s.includes('p9s')) return 'p9s';
  if (s.includes('k11')) return 'k11';
  return 'power_tower';
}

export async function render(container, param) {
  if (param === 'new') return createDraft(container);
  if (param) return editor(container, param);
  return errorView(container, 'No inspection selected.');
}

async function createDraft(container) {
  mount(container, el('div', { class: 'empty' }, 'Creating inspection…'));
  const pre = prefill.take();
  const equipmentId = pre?.equipmentId;
  if (!equipmentId) return errorView(container, 'Open a new inspection from an asset.');
  try {
    const { data: asset } = await sb.from('equipment')
      .select('*, customers(name), locations(name,city)').eq('id', equipmentId).maybeSingle();
    const me = getProfile();
    const data = {
      salon: asset?.locations?.name || asset?.locations?.city || asset?.customers?.name || '',
      room: asset?.name || '',
      technician_name: me?.full_name || '',
    };
    const { data: row, error } = await sb.from('inspections')
      .insert({ equipment_id: equipmentId, template: detectTemplate(asset), inspection_date: todayISO(), data, created_by: me?.id || null })
      .select('id').single();
    if (error) throw error;
    navigate('/inspection/' + row.id);
  } catch (e) { errorView(container, e.message); }
}

async function editor(container, id) {
  mount(container, el('div', { class: 'empty' }, 'Loading…'));
  let insp, asset, templates;
  try {
    templates = await loadTemplates();
    const { data, error } = await sb.from('inspections').select('*').eq('id', id).maybeSingle();
    if (error) throw error;
    insp = data;
    if (!insp) return errorView(container, 'Inspection not found.');
    const { data: eq } = await sb.from('equipment').select('id,name,brand,model,serial_number,customers(name),locations(name)').eq('id', insp.equipment_id).maybeSingle();
    asset = eq;
  } catch (e) { return errorView(container, e.message); }

  const tmpl = templates[insp.template] || templates.power_tower;
  const data = { ...insp.data };
  const done = insp.status === 'completed';

  const text = (k, label, type = 'text') => {
    const input = el('input', { type, value: data[k] || '', disabled: done });
    input.addEventListener('input', () => { data[k] = input.value; });
    return fieldRow(label, input);
  };

  function itemRow(si, ii, label) {
    const k = `s${si}i${ii}`;
    const seg = el('div', { class: 'seg' }, STATES.map((st) => {
      const b = btn(STATE_LABEL[st], () => {
        if (done) return;
        data[k] = st;
        seg.querySelectorAll('button').forEach((x) => x.classList.remove('on', ...STATES));
        b.classList.add('on', st);
      }, { class: (data[k] === st ? `on ${st}` : '') });
      return b;
    }));
    const det = el('input', { placeholder: 'Details', value: data[k + 'd'] || '', disabled: done });
    det.addEventListener('input', () => { data[k + 'd'] = det.value; });
    return el('div', { class: 'insp-item' }, [
      el('div', { class: 'lbl' }, label),
      el('div', { class: 'ctrl' }, [seg, det]),
    ]);
  }

  const checklist = el('div', {});
  tmpl.sections.forEach((sec, si) => {
    if (sec.title) checklist.append(el('div', { class: 'insp-sec-title' }, sec.title));
    sec.items.forEach((label, ii) => checklist.append(itemRow(si, ii, label)));
  });

  // amp / volt
  const amperage = el('div', { class: 'form-grid' }, [
    text('amp_p1', 'Amps — P1'), text('volt_p1', 'Volts — P1'),
    text('amp_p2', 'Amps — P2'), text('volt_p2', 'Volts — P2'),
    text('amp_p3', 'Amps — P3'), text('volt_p3', 'Volts — P3'),
  ]);
  const comments = el('textarea', { disabled: done }, data.comments || '');
  comments.addEventListener('input', () => { data.comments = comments.value; });
  const recommendation = el('textarea', { disabled: done }, data.recommendation || '');
  recommendation.addEventListener('input', () => { data.recommendation = recommendation.value; });
  const shopCables = el('input', { value: data.shop_cables || '', disabled: done });
  shopCables.addEventListener('input', () => { data.shop_cables = shopCables.value; });

  const pad = signaturePad();

  // template switcher
  const tmplSel = el('select', { disabled: done }, Object.keys(templates).map((k) => el('option', { value: k, selected: k === insp.template }, TEMPLATE_LABEL[k] || k)));
  tmplSel.addEventListener('change', async () => {
    if (!(await confirmDialog('Switch inspection template? Existing ticks may not line up with the new layout.'))) { tmplSel.value = insp.template; return; }
    await sb.from('inspections').update({ template: tmplSel.value }).eq('id', id);
    editor(container, id);
  });

  async function persist(extra = {}) {
    const { error } = await sb.from('inspections').update({ data, updated_at: new Date().toISOString(), ...extra }).eq('id', id);
    if (error) { toast(error.message, 'err'); return false; }
    return true;
  }

  const actions = done
    ? el('div', { class: 'row' }, [
        btn('🖨 Print inspection', () => printInspection(insp, asset, tmpl, data), { class: 'btn-primary' }),
        btn('Reopen (edit)', async () => { if (await persist({ status: 'draft' })) editor(container, id); }, { class: 'btn-ghost' }),
      ])
    : el('div', { class: 'row' }, [
        btn('Save draft', async () => { if (await persist()) toast('Saved.'); }, { class: 'btn-ghost' }),
        btn('Complete & sign', async () => {
          if (!(await confirmDialog('Mark this inspection as completed?', { danger: false, confirmLabel: 'Complete' }))) return;
          const extra = { status: 'completed', inspection_date: data.inspection_date_val || insp.inspection_date };
          if (pad.hasInk()) {
            try {
              const blob = await pad.toBlob();
              const path = `assets/${insp.equipment_id}/inspections/${id}/sig-${Date.now()}.png`;
              const { error } = await sb.storage.from(STORAGE_BUCKET).upload(path, blob, { upsert: true, contentType: 'image/png' });
              if (error) throw error;
              extra.signature_path = path; extra.signed_at = todayISO();
            } catch (e) { toast('Signature upload failed: ' + e.message, 'err'); }
          }
          if (await persist(extra)) { toast('Inspection completed.'); editor(container, id); }
        }, { class: 'btn-primary' }),
        btn('🖨 Print', () => printInspection(insp, asset, tmpl, data), { class: 'btn-ghost' }),
      ]);

  const dateInput = el('input', { type: 'date', value: insp.inspection_date || todayISO(), disabled: done });
  dateInput.addEventListener('change', () => { data.inspection_date_val = dateInput.value; sb.from('inspections').update({ inspection_date: dateInput.value }).eq('id', id); });

  mount(container, el('div', {}, [
    el('a', { href: `#/taeki/${insp.equipment_id}`, class: 'link-btn' }, '← Asset'),
    el('div', { class: 'page-head' }, [
      el('h2', {}, 'Annual inspection'),
      el('span', { class: `badge ${done ? 'completed' : 'assigned'}` }, done ? 'Completed' : 'Draft'),
    ]),
    el('div', { class: 'muted', style: { marginBottom: '12px', fontSize: '13px' } },
      [asset && (asset.name || [asset.brand, asset.model].filter(Boolean).join(' ')), asset?.customers?.name, asset?.serial_number && ('S/N ' + asset.serial_number)].filter(Boolean).join(' · ')),
    el('div', { class: 'card' }, el('div', { class: 'form-grid' }, [
      fieldRow('Unit type', tmplSel),
      fieldRow('Inspection date', dateInput),
      text('salon', 'Salon'),
      text('room', 'Room'),
      text('technician_name', 'Technician'),
    ])),
    el('div', { class: 'card' }, [el('h3', { style: { marginTop: 0 } }, 'Service undertaken'), checklist]),
    el('div', { class: 'card' }, [
      el('h3', { style: { marginTop: 0 } }, 'Amp & voltage over phases'), amperage,
      fieldRow('Comments', comments, true),
      fieldRow('Recommendation', recommendation, true),
      fieldRow('Shop cables', shopCables, true),
    ]),
    el('div', { class: 'card' }, [
      el('h3', { style: { marginTop: 0 } }, 'Sign-off'),
      done
        ? el('div', {}, [el('div', { class: 'muted', style: { fontSize: '12px', marginBottom: '4px' } }, `Technician · ${fmtDate(insp.signed_at)}`), sigImg(insp.signature_path)])
        : el('div', { class: 'field' }, [el('label', {}, 'Signature — Technician'), pad.element]),
    ]),
    el('div', { class: 'row', style: { marginTop: '4px' } }, actions),
  ]));
}

function sigImg(path) {
  const img = el('img', { alt: 'Signature', style: { maxWidth: '260px', background: '#fff', borderRadius: '8px', border: '1px solid var(--line)' } });
  if (path) sb.storage.from(STORAGE_BUCKET).createSignedUrl(path, 3600).then(({ data }) => { if (data?.signedUrl) img.src = data.signedUrl; });
  return img;
}

// ---------------- Faithful print ----------------
async function printInspection(insp, asset, tmpl, data) {
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  let sig = '';
  try { if (insp.signature_path) sig = (await sb.storage.from(STORAGE_BUCKET).createSignedUrl(insp.signature_path, 600)).data?.signedUrl || ''; } catch { /* */ }

  const boxes = (k) => STATES.map((st) => `<span class="bx">${data[k] === st ? '☒' : '☐'} ${STATE_LABEL[st]}</span>`).join(' ');
  let rows = '';
  tmpl.sections.forEach((sec, si) => {
    if (sec.title) rows += `<tr><td colspan="3" class="sec">${esc(sec.title)}</td></tr>`;
    sec.items.forEach((label, ii) => {
      const k = `s${si}i${ii}`;
      rows += `<tr><td>${esc(label)}</td><td class="bxs">${boxes(k)}</td><td class="det">${esc(data[k + 'd'] || '')}</td></tr>`;
    });
  });

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Annual Inspection — ${esc(asset?.serial_number || '')}</title>
  <style>
    @page { size: A4; margin: 12mm; }
    body { font-family: Archivo, 'Segoe UI', Arial, sans-serif; color: #2A1529; font-size: 11px; line-height: 1.35; }
    .top { display:flex; justify-content:space-between; border-bottom:2px solid #8a2f78; padding-bottom:8px; }
    .brand { color:#8a2f78; font-weight:700; letter-spacing:.5px; font-size:15px; }
    h1 { font-size:17px; margin:0; } h2 { font-size:12px; margin:12px 0 5px; }
    .muted { color:#6b5568; font-size:10px; }
    .meta { display:grid; grid-template-columns:1fr 1fr 1fr; gap:2px 16px; margin-top:8px; }
    .lbl { color:#6b5568; }
    table { width:100%; border-collapse:collapse; }
    td { padding:3px 4px; border-bottom:1px solid #e4dccf; vertical-align:top; }
    td.sec { font-weight:700; background:#f4ecf1; color:#531E52; }
    .bxs { white-space:nowrap; width:168px; } .bx { margin-right:6px; }
    .det { color:#6b5568; font-size:10px; }
    .amp { display:grid; grid-template-columns:repeat(3,1fr); gap:4px 16px; margin-top:6px; }
    .sign { border-top:1px solid #333; padding-top:4px; margin-top:24px; width:280px; }
    .sign img { max-height:60px; display:block; }
  </style></head><body>
  <div class="top"><div><div class="brand">BRONZE DIRECT</div><h1>Annual Inspection</h1><div class="muted">Kwik Tan · ${esc(TEMPLATE_LABEL[insp.template] || '')}</div></div>
    <div class="muted" style="text-align:right">${esc(fmtDate(insp.inspection_date))}<br>${insp.status === 'completed' ? 'Completed' : 'Draft'}</div></div>
  <div class="meta">
    <div><span class="lbl">Salon:</span> ${esc(data.salon)}</div><div><span class="lbl">Room:</span> ${esc(data.room)}</div><div><span class="lbl">Technician:</span> ${esc(data.technician_name)}</div>
    <div><span class="lbl">Unit:</span> ${esc([asset?.brand, asset?.model].filter(Boolean).join(' '))}</div><div><span class="lbl">Serial:</span> ${esc(asset?.serial_number)}</div><div><span class="lbl">Date:</span> ${esc(fmtDate(insp.inspection_date))}</div>
  </div>
  <h2>Service undertaken</h2>
  <table>${rows}</table>
  <h2>Amp &amp; voltage over phases</h2>
  <div class="amp">
    <div>P1 — ${esc(data.amp_p1)} A / ${esc(data.volt_p1)} V</div>
    <div>P2 — ${esc(data.amp_p2)} A / ${esc(data.volt_p2)} V</div>
    <div>P3 — ${esc(data.amp_p3)} A / ${esc(data.volt_p3)} V</div>
  </div>
  ${data.comments ? `<h2>Comments</h2><div>${esc(data.comments)}</div>` : ''}
  ${data.recommendation ? `<h2>Recommendation</h2><div>${esc(data.recommendation)}</div>` : ''}
  ${data.shop_cables ? `<div class="muted" style="margin-top:8px">Shop cables: ${esc(data.shop_cables)}</div>` : ''}
  <div class="sign">${sig ? `<img src="${sig}">` : ''}Date / Signature Technician${insp.signed_at ? ' · ' + esc(fmtDate(insp.signed_at)) : ''}</div>
  </body></html>`;

  const w = window.open('', '_blank');
  if (!w) { toast('Allow pop-ups to print.', 'err'); return; }
  w.document.write(html); w.document.close(); w.focus();
  setTimeout(() => w.print(), 400);
}
