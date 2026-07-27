// modules/stjornun.js — Stjórnun: starfsfólk og fyrirtækisstillingar (admin).
import { el, mount, btn } from '../render.js';
import { sb } from '../supabase.js';
import { isAdmin, getProfile } from '../auth.js';
import { modal, fieldRow, toast, errorView } from '../ui.js';

const ROLES = { admin: 'Stjórnandi', technician: 'Tæknimaður', office: 'Skrifstofa' };

export async function render(container) {
  if (!isAdmin()) return errorView(container, 'Aðeins stjórnendur.');
  mount(container, el('div', { class: 'empty' }, 'Hleð…'));
  try {
    const [staffRes, coRes] = await Promise.all([
      sb.from('profiles').select('*').order('full_name'),
      sb.from('company_settings').select('*').eq('id', 1).maybeSingle(),
    ]);
    if (staffRes.error) throw staffRes.error;
    const staff = staffRes.data || [];
    const co = coRes.data || {};
    const reload = () => render(container);

    const staffList = el('div', {}, staff.map((p) => el('div', { class: 'list-item' }, [
      el('div', { class: 'grow' }, [
        el('div', { class: 'title' }, p.full_name || p.email || '—'),
        el('div', { class: 'sub' }, [ROLES[p.role] || p.role, p.email, p.is_super_admin && 'ofurstjórnandi'].filter(Boolean).join(' · ')),
      ]),
      p.is_active ? null : el('span', { class: 'badge cancelled' }, 'Óvirkur'),
      btn('Breyta', () => staffForm(p, reload), { class: 'btn-ghost btn-sm' }),
    ])));

    mount(container, el('div', {}, [
      el('div', { class: 'page-head' }, el('h2', {}, 'Stjórnun')),

      el('div', { class: 'card' }, [
        el('h3', { style: { marginTop: 0 } }, 'Starfsfólk'),
        el('p', { class: 'muted', style: { fontSize: '13px' } }, 'Nýtt starfsfólk stofnar aðgang á innskráningarsíðunni; hér stýrir þú hlutverki og virkni.'),
        staffList,
      ]),

      companyCard(co, reload),
    ]));
  } catch (e) {
    console.error(e);
    errorView(container, e.message);
  }
}

function staffForm(p, onDone) {
  const me = getProfile();
  const roleSel = el('select', {}, Object.entries(ROLES).map(([v, l]) => el('option', { value: v, selected: v === p.role }, l)));
  const active = el('input', { type: 'checkbox', checked: p.is_active });
  const superAdmin = el('input', { type: 'checkbox', checked: p.is_super_admin });
  const isSelf = me?.id === p.id;

  modal({
    title: 'Breyta starfsmanni',
    body: el('div', {}, [
      fieldRow('Hlutverk', roleSel, true),
      el('div', { class: 'field' }, [el('label', {}, 'Virkur'), el('div', { class: 'row' }, [active, el('span', { class: 'muted' }, 'Getur skráð sig inn')])]),
      el('div', { class: 'field' }, [el('label', {}, 'Ofurstjórnandi'), el('div', { class: 'row' }, [superAdmin, el('span', { class: 'muted' }, 'Fullur aðgangur')])]),
      isSelf ? el('div', { class: 'msg err' }, 'Athugið: þú ert að breyta eigin aðgangi.') : null,
    ]),
    onSave: async () => {
      const { error } = await sb.from('profiles').update({
        role: roleSel.value,
        is_active: active.checked,
        is_super_admin: superAdmin.checked,
      }).eq('id', p.id);
      if (error) { toast(error.message, 'err'); return false; }
      toast('Vistað.'); onDone && onDone();
    },
  });
}

function companyCard(co, onDone) {
  const f = {
    company_name: el('input', { value: co.company_name || 'Bronze Direct' }),
    kennitala: el('input', { value: co.kennitala || '' }),
    address: el('input', { value: co.address || '' }),
    postal_code: el('input', { value: co.postal_code || '' }),
    city: el('input', { value: co.city || '' }),
    phone: el('input', { value: co.phone || '' }),
    email: el('input', { value: co.email || '' }),
  };
  const save = btn('Vista stillingar', async () => {
    save.disabled = true;
    const { error } = await sb.from('company_settings').update({
      company_name: f.company_name.value.trim(),
      kennitala: f.kennitala.value.trim() || null,
      address: f.address.value.trim() || null,
      postal_code: f.postal_code.value.trim() || null,
      city: f.city.value.trim() || null,
      phone: f.phone.value.trim() || null,
      email: f.email.value.trim() || null,
      updated_at: new Date().toISOString(),
    }).eq('id', 1);
    save.disabled = false;
    if (error) { toast(error.message, 'err'); return; }
    toast('Stillingar vistaðar.'); onDone && onDone();
  }, { class: 'btn-primary' });

  return el('div', { class: 'card' }, [
    el('h3', { style: { marginTop: 0 } }, 'Fyrirtækisstillingar'),
    el('div', { class: 'form-grid' }, [
      fieldRow('Nafn', f.company_name, true),
      fieldRow('Kennitala', f.kennitala),
      fieldRow('Sími', f.phone),
      fieldRow('Heimilisfang', f.address),
      fieldRow('Póstnúmer', f.postal_code),
      fieldRow('Staður', f.city),
      fieldRow('Netfang', f.email, true),
    ]),
    el('div', { class: 'row', style: { marginTop: '12px' } }, save),
  ]);
}
