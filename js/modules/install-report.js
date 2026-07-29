// modules/install-report.js — KBL Installation Report (FOR0901-06), attached to an asset.
// Faithful electronic reproduction: fill in-app, store on the asset, print to the original layout.
import { el, mount, btn } from '../render.js';
import { sb } from '../supabase.js';
import { STORAGE_BUCKET } from '../config.js';
import { getProfile } from '../auth.js';
import { toast, confirmDialog, errorView, fieldRow } from '../ui.js';
import { navigate } from '../router.js';
import { prefill } from '../state.js';
import { fmtDate, todayISO } from '../fmt.js';
import { signaturePad } from './signature.js';

// ---------------- Form schema (mirrors FOR0901-06) ----------------
const HEADER = [
  ['facility_name', 'Facility name'], ['country', 'Country'],
  ['contact_person', 'Contact person'], ['technician_name', 'Name of technician'],
  ['street', 'Street'], ['kbl_model', 'KBL model name'],
  ['city', 'City'], ['serial_number', 'Serial number'],
  ['post_code', 'Post code'], ['cabin_no', 'Cabin N°.'],
];
const MEASUREMENTS = [
  ['v1', 'Voltage Phase 1'], ['a1', 'Ampere Phase 1'],
  ['v2', 'Voltage Phase 2'], ['a2', 'Ampere Phase 2'],
  ['v3', 'Voltage Phase 3'], ['a3', 'Ampere Phase 3'],
];
// checklist items: [key, label, states]
const VERIFY = [
  ['hoses', 'Connecting hoses between upper and lower part are mounted and secured', ['na', 'yes']],
  ['exhaust_studio', 'Exhaust air connected to studio system, free airflow min. 300 mm diameter pipe', ['na', 'yes']],
  ['springs', 'Springs are evenly tensioned', ['na', 'yes']],
  ['aqua', 'Aqua initialization carried out', ['na', 'yes']],
  ['lamps', 'Lamps function tested', ['na', 'yes']],
  ['deco_light', 'Decorative light tested', ['na', 'yes']],
  ['canopy', 'Canopy lifting system tested and adjusted', ['na', 'yes']],
  ['control_panel', 'Exterior and/or interior control panel preselect functions tested', ['na', 'yes']],
  ['facial_tanner', 'Facial/Shoulder tanner function tested', ['na', 'yes']],
  ['protective_film', 'Protective film is removed from acrylics', ['na', 'yes']],
  ['exhaust_fn', 'Exhaust air function tested', ['na', 'yes']],
  ['music', 'Music volume tested and adjusted', ['na', 'yes']],
  ['aircon', 'Air-condition function tested', ['na', 'yes']],
  ['bluetooth', 'Bluetooth function tested', ['na', 'yes']],
  ['ventilation', 'All Body and Facial ventilation areas tested and adjustable', ['na', 'yes']],
  ['phone_charge', 'Mobile phone charging function checked', ['na', 'yes']],
  ['k11_uva', 'K11: UVA-LEDs function tested', ['na', 'yes']],
  ['infinity_mirror', 'Infinity Mirror function tested', ['na', 'yes']],
  ['k11_uvb', 'K11: UVB-LEDs function tested', ['na', 'yes']],
  ['metal_plastic', 'Metal/Plastic parts and acrylics without damage', ['na', 'no', 'yes']],
  ['beautybooster', 'BeautyBooster PRO function tested', ['na', 'yes']],
  ['wifi', 'Wifi-connection tested. Signal sufficient.', ['na', 'no', 'yes']],
];
const SAFETY = [
  ['filterglass_damage', 'Filterglasses without damage', ['na', 'no', 'yes']],
  ['stop_buttons', 'STOP-buttons functional', ['no', 'yes']],
  ['filterglass_switch', 'Filterglass switches functional (switchable)', ['na', 'no', 'yes']],
  ['safety_switches', 'All Safety-Switches functional', ['no', 'yes']],
  ['external_timer', 'Operation with external Timer tested', ['na', 'no', 'yes']],
  ['eyewear', 'Protective eyewear available', ['no', 'yes']],
  ['test_run_30', 'Installation test run of 30 min must be completed without error messages', ['no', 'yes']],
];
const STATE_LABEL = { na: 'n/a', no: 'No', yes: 'Yes' };

export async function render(container, param) {
  if (param === 'new') return createDraft(container);
  if (param) return editor(container, param);
  return errorView(container, 'No report selected.');
}

async function createDraft(container) {
  mount(container, el('div', { class: 'empty' }, 'Creating report…'));
  const pre = prefill.take();
  const equipmentId = pre?.equipmentId;
  if (!equipmentId) return errorView(container, 'Open a new report from an asset.');
  try {
    const { data: asset } = await sb.from('equipment')
      .select('*, customers(name,contact_name,address,postal_code,city), locations(address,postal_code,city)').eq('id', equipmentId).maybeSingle();
    const me = getProfile();
    const loc = asset?.locations || {};
    const cust = asset?.customers || {};
    const data = {
      facility_name: cust.name || '',
      contact_person: cust.contact_name || '',
      technician_name: me?.full_name || '',
      street: loc.address || cust.address || '',
      city: loc.city || cust.city || '',
      post_code: loc.postal_code || cust.postal_code || '',
      kbl_model: [asset?.brand, asset?.model].filter(Boolean).join(' '),
      serial_number: asset?.serial_number || '',
      installation_date: asset?.install_date || todayISO(),
    };
    const { data: row, error } = await sb.from('installation_reports')
      .insert({ equipment_id: equipmentId, data, created_by: me?.id || null }).select('id').single();
    if (error) throw error;
    navigate('/report/' + row.id);
  } catch (e) { errorView(container, e.message); }
}

async function editor(container, id) {
  mount(container, el('div', { class: 'empty' }, 'Loading…'));
  let report, asset;
  try {
    const { data, error } = await sb.from('installation_reports').select('*').eq('id', id).maybeSingle();
    if (error) throw error;
    report = data;
    if (!report) return errorView(container, 'Report not found.');
    const { data: eq } = await sb.from('equipment').select('id,name,brand,model,serial_number,customers(name)').eq('id', report.equipment_id).maybeSingle();
    asset = eq;
  } catch (e) { return errorView(container, e.message); }

  const data = { ...report.data };
  const done = report.status === 'completed';

  // ---- field builders ----
  const textField = (k, label, type = 'text') => {
    const input = el('input', { type, value: data[k] || '', disabled: done });
    input.addEventListener('input', () => { data[k] = input.value; });
    return fieldRow(label, input);
  };
  const chkRow = (item) => {
    const [k, label, states] = item;
    const seg = el('div', { class: 'seg' }, states.map((st) => {
      const b = btn(STATE_LABEL[st], () => {
        if (done) return;
        data[k] = st;
        seg.querySelectorAll('button').forEach((x) => x.classList.remove('on', 'yes', 'no', 'na'));
        b.classList.add('on', st);
      }, { class: (data[k] === st ? `on ${st}` : '') });
      return b;
    }));
    return el('div', { class: 'chk-row' }, [el('div', { class: 'chk-label' }, label), seg]);
  };

  // ---- header ----
  const headerCard = el('div', { class: 'card' }, [
    el('h3', { style: { marginTop: 0 } }, 'Facility & unit'),
    el('div', { class: 'form-grid' }, [
      ...HEADER.map(([k, l]) => textField(k, l)),
      textField('installation_date', 'Installation date', 'date'),
    ]),
  ]);

  // ---- electrical ----
  const groundFault = chkRow(['ground_fault', '1. Ground fault circuit interrupter with specification ≥30mA is installed', ['no', 'yes']]);
  const electricalCard = el('div', { class: 'card' }, [
    el('h3', { style: { marginTop: 0 } }, 'Electrical connection'),
    groundFault,
    el('div', { class: 'report-warn' }, "If 'No', the tanning bed shall not be operated."),
    el('div', { class: 'form-grid', style: { marginTop: '12px' } }, [
      textField('fuse_spec', '2. Specification of installed fuse'),
      textField('cable_dim', '3. Power supply cable Ø [mm²]'),
    ]),
    el('div', { style: { marginTop: '10px', fontWeight: '600', fontSize: '14px' } }, '4. Electrical measurements'),
    el('div', { class: 'form-grid' }, MEASUREMENTS.map(([k, l]) => textField(k, l))),
  ]);

  // ---- verification (two columns) ----
  const half = Math.ceil(VERIFY.length / 2);
  const verifyCard = el('div', { class: 'card' }, [
    el('h3', { style: { marginTop: 0 } }, '5. Installation and functional verification'),
    el('div', { class: 'report-cols' }, [
      el('div', {}, VERIFY.slice(0, half).map(chkRow)),
      el('div', {}, VERIFY.slice(half).map(chkRow)),
    ]),
  ]);

  const halfS = Math.ceil(SAFETY.length / 2);
  const safetyCard = el('div', { class: 'card' }, [
    el('h3', { style: { marginTop: 0 } }, '6. Safety and performance relevant features'),
    el('div', { class: 'report-cols' }, [
      el('div', {}, SAFETY.slice(0, halfS).map(chkRow)),
      el('div', {}, SAFETY.slice(halfS).map(chkRow)),
    ]),
    el('div', { class: 'report-warn' }, "If 'No', the tanning bed shall not be operated."),
  ]);

  // ---- remarks + signatures ----
  const remarks = el('textarea', { disabled: done }, data.remarks || '');
  remarks.addEventListener('input', () => { data.remarks = remarks.value; });
  const techPad = signaturePad();
  const clientPad = signaturePad();
  const sigView = (path, label) => el('div', {}, [
    el('div', { class: 'muted', style: { fontSize: '12px', marginBottom: '4px' } }, label),
    signatureImg(path),
  ]);
  const remarksCard = el('div', { class: 'card' }, [
    el('h3', { style: { marginTop: 0 } }, '7. Remarks & sign-off'),
    fieldRow('Remarks', remarks, true),
    el('p', { class: 'muted', style: { fontSize: '13px' } }, 'The Technician and Client confirm that fresh in-studio airflow is provided (exhaust hose connected, min. 300 mm diameter) to ensure safe and performant operation.'),
    el('div', { class: 'report-cols' }, [
      done ? sigView(report.technician_signature_path, `Technician · ${fmtDate(report.technician_signed_at)}`)
           : el('div', { class: 'field' }, [el('label', {}, 'Signature — Technician'), techPad.element]),
      done ? sigView(report.client_signature_path, `Client · ${fmtDate(report.client_signed_at)}`)
           : el('div', { class: 'field' }, [el('label', {}, 'Signature — Client'), clientPad.element]),
    ]),
  ]);

  // ---- actions ----
  async function persist(extra = {}) {
    const { error } = await sb.from('installation_reports')
      .update({ data, updated_at: new Date().toISOString(), ...extra }).eq('id', id);
    if (error) { toast(error.message, 'err'); return false; }
    return true;
  }
  async function uploadSig(pad, name) {
    if (!pad.hasInk()) return null;
    const blob = await pad.toBlob();
    const path = `assets/${report.equipment_id}/reports/${id}/${name}-${Date.now()}.png`;
    const { error } = await sb.storage.from(STORAGE_BUCKET).upload(path, blob, { upsert: true, contentType: 'image/png' });
    if (error) throw error;
    return path;
  }

  const actions = done
    ? el('div', { class: 'row' }, [
        btn('🖨 Print report', () => printReport(report, asset, data), { class: 'btn-primary' }),
        btn('Reopen (edit)', async () => { if (await persist({ status: 'draft' })) editor(container, id); }, { class: 'btn-ghost' }),
      ])
    : el('div', { class: 'row' }, [
        btn('Save draft', async () => { if (await persist()) toast('Saved.'); }, { class: 'btn-ghost' }),
        btn('Complete & sign', async () => {
          if (!(await confirmDialog('Mark this installation report as completed?', { danger: false, confirmLabel: 'Complete' }))) return;
          try {
            const extra = { status: 'completed' };
            const tp = await uploadSig(techPad, 'technician');
            const cp = await uploadSig(clientPad, 'client');
            if (tp) { extra.technician_signature_path = tp; extra.technician_signed_at = todayISO(); }
            if (cp) { extra.client_signature_path = cp; extra.client_signed_at = todayISO(); }
            if (await persist(extra)) { toast('Report completed.'); editor(container, id); }
          } catch (e) { toast('Signature upload failed: ' + e.message, 'err'); }
        }, { class: 'btn-primary' }),
        btn('🖨 Print', () => printReport(report, asset, data), { class: 'btn-ghost' }),
      ]);

  mount(container, el('div', {}, [
    el('a', { href: `#/taeki/${report.equipment_id}`, class: 'link-btn' }, '← Asset'),
    el('div', { class: 'page-head' }, [
      el('h2', {}, 'Installation report'),
      el('span', { class: `badge ${done ? 'completed' : 'assigned'}` }, done ? 'Completed' : 'Draft'),
      el('span', { class: 'spacer' }),
    ]),
    el('div', { class: 'muted', style: { marginBottom: '12px', fontSize: '13px' } }, ['FOR0901-06', asset && (asset.name || [asset.brand, asset.model].filter(Boolean).join(' ')), asset?.customers?.name].filter(Boolean).join(' · ')),
    headerCard, electricalCard, verifyCard, safetyCard, remarksCard,
    el('div', { class: 'row', style: { marginTop: '4px' } }, actions),
  ]));
}

function signatureImg(path) {
  const img = el('img', { alt: 'Signature', style: { maxWidth: '260px', background: '#fff', borderRadius: '8px', border: '1px solid var(--line)' } });
  if (path) sb.storage.from(STORAGE_BUCKET).createSignedUrl(path, 3600).then(({ data }) => { if (data?.signedUrl) img.src = data.signedUrl; });
  return img;
}

// ---------------- Faithful print layout ----------------
async function printReport(report, asset, data) {
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  // resolve signature URLs
  let techSig = '', clientSig = '';
  try {
    if (report.technician_signature_path) techSig = (await sb.storage.from(STORAGE_BUCKET).createSignedUrl(report.technician_signature_path, 600)).data?.signedUrl || '';
    if (report.client_signature_path) clientSig = (await sb.storage.from(STORAGE_BUCKET).createSignedUrl(report.client_signature_path, 600)).data?.signedUrl || '';
  } catch { /* ignore */ }

  const box = (item) => {
    const [k, , states] = item;
    return states.map((st) => `<span class="bx">${data[k] === st ? '☒' : '☐'} ${STATE_LABEL[st]}</span>`).join(' ');
  };
  const chkLine = (item) => `<tr><td>${esc(item[1])}</td><td class="bxs">${box(item)}</td></tr>`;
  const field = (k, label) => `<div><span class="lbl">${esc(label)}:</span> ${esc(data[k])}</div>`;

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Installation Report — ${esc(data.serial_number || '')}</title>
  <style>
    @page { size: A4; margin: 14mm; }
    body { font-family: Archivo, 'Segoe UI', Arial, sans-serif; color: #2A1529; font-size: 11px; line-height: 1.4; }
    h1 { font-size: 17px; margin: 0; }
    h2 { font-size: 12px; margin: 14px 0 6px; border-bottom: 1px solid #cbb9c8; padding-bottom: 3px; }
    .top { display:flex; justify-content:space-between; align-items:flex-start; border-bottom:2px solid #8a2f78; padding-bottom:8px; }
    .brand { color:#8a2f78; font-weight:700; letter-spacing:.5px; font-size:15px; }
    .muted { color:#6b5568; font-size:10px; }
    .grid2 { display:grid; grid-template-columns:1fr 1fr; gap:2px 24px; }
    .lbl { color:#6b5568; }
    table { width:100%; border-collapse:collapse; }
    td { padding:3px 4px; border-bottom:1px solid #e4dccf; vertical-align:top; }
    .bxs { white-space:nowrap; text-align:right; width:150px; }
    .bx { margin-left:8px; }
    .cols { display:grid; grid-template-columns:1fr 1fr; gap:0 20px; }
    .warn { color:#b02a41; font-size:10px; margin:4px 0; }
    .sign { display:grid; grid-template-columns:1fr 1fr; gap:24px; margin-top:20px; }
    .sign .box { border-top:1px solid #333; padding-top:4px; }
    .sign img { max-height:60px; display:block; margin-bottom:2px; }
  </style></head><body>
  <div class="top">
    <div><div class="brand">BRONZE DIRECT</div><h1>Installation Report</h1><div class="muted">Form FOR0901-06 · Effective since 06.01.2025</div></div>
    <div class="muted" style="text-align:right">${esc(fmtDate(report.created_at))}<br>${report.status === 'completed' ? 'Completed' : 'Draft'}</div>
  </div>

  <h2>Facility &amp; unit</h2>
  <div class="grid2">
    ${field('facility_name', 'Facility name')}${field('country', 'Country')}
    ${field('contact_person', 'Contact person')}${field('technician_name', 'Technician')}
    ${field('street', 'Street')}${field('kbl_model', 'KBL model name')}
    ${field('city', 'City')}${field('serial_number', 'Serial number')}
    ${field('post_code', 'Post code')}${field('installation_date', 'Installation date')}
    ${field('cabin_no', 'Cabin N°.')}
  </div>

  <h2>Electrical connection</h2>
  <table><tr><td>1. Ground fault circuit interrupter (≥30mA) installed</td><td class="bxs">${box(['ground_fault', '', ['no', 'yes']])}</td></tr></table>
  <div class="warn">If 'No', the tanning bed shall not be operated.</div>
  <div class="grid2">${field('fuse_spec', '2. Fuse specification')}${field('cable_dim', '3. Cable Ø [mm²]')}</div>
  <div style="margin-top:6px"><strong>4. Electrical measurements</strong></div>
  <div class="grid2">${field('v1', 'Voltage Phase 1')}${field('a1', 'Ampere Phase 1')}${field('v2', 'Voltage Phase 2')}${field('a2', 'Ampere Phase 2')}${field('v3', 'Voltage Phase 3')}${field('a3', 'Ampere Phase 3')}</div>

  <h2>5. Installation and functional verification</h2>
  <div class="cols">
    <table>${VERIFY.slice(0, Math.ceil(VERIFY.length / 2)).map(chkLine).join('')}</table>
    <table>${VERIFY.slice(Math.ceil(VERIFY.length / 2)).map(chkLine).join('')}</table>
  </div>

  <h2>6. Safety and performance relevant features</h2>
  <div class="cols">
    <table>${SAFETY.slice(0, Math.ceil(SAFETY.length / 2)).map(chkLine).join('')}</table>
    <table>${SAFETY.slice(Math.ceil(SAFETY.length / 2)).map(chkLine).join('')}</table>
  </div>
  <div class="warn">If 'No', the tanning bed shall not be operated.</div>

  <h2>7. Remarks</h2>
  <div>${esc(data.remarks || '')}</div>
  <div class="sign">
    <div class="box">${techSig ? `<img src="${techSig}">` : ''}Date / Signature Technician${report.technician_signed_at ? ' · ' + esc(fmtDate(report.technician_signed_at)) : ''}</div>
    <div class="box">${clientSig ? `<img src="${clientSig}">` : ''}Date / Signature Client${report.client_signed_at ? ' · ' + esc(fmtDate(report.client_signed_at)) : ''}</div>
  </div>
  </body></html>`;

  const w = window.open('', '_blank');
  if (!w) { toast('Allow pop-ups to print.', 'err'); return; }
  w.document.write(html); w.document.close(); w.focus();
  setTimeout(() => w.print(), 400);
}
