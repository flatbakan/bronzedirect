// modules/stjornun.js — Admin: staff and company settings (admin only).
import { el, mount, btn } from '../render.js';
import { sb } from '../supabase.js';
import { isAdmin, getProfile } from '../auth.js';
import { modal, fieldRow, toast, errorView } from '../ui.js';

const ROLES = { admin: 'Administrator', technician: 'Technician', office: 'Office' };

export async function render(container) {
  if (!isAdmin()) return errorView(container, 'Administrators only.');
  mount(container, el('div', { class: 'empty' }, 'Loading…'));
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
        el('div', { class: 'sub' }, [ROLES[p.role] || p.role, p.email, p.is_super_admin && 'super admin'].filter(Boolean).join(' · ')),
      ]),
      p.is_active ? null : el('span', { class: 'badge cancelled' }, 'Inactive'),
      btn('Edit', () => staffForm(p, reload), { class: 'btn-ghost btn-sm' }),
    ])));

    mount(container, el('div', {}, [
      el('div', { class: 'page-head' }, el('h2', {}, 'Admin')),

      el('div', { class: 'card' }, [
        el('h3', { style: { marginTop: 0 } }, 'Staff'),
        el('p', { class: 'muted', style: { fontSize: '13px' } }, 'New staff create an account on the sign-in page; here you manage their role and status.'),
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
    title: 'Edit staff member',
    body: el('div', {}, [
      fieldRow('Role', roleSel, true),
      el('div', { class: 'field' }, [el('label', {}, 'Active'), el('div', { class: 'row' }, [active, el('span', { class: 'muted' }, 'Can sign in')])]),
      el('div', { class: 'field' }, [el('label', {}, 'Super admin'), el('div', { class: 'row' }, [superAdmin, el('span', { class: 'muted' }, 'Full access')])]),
      isSelf ? el('div', { class: 'msg err' }, 'Note: you are editing your own account.') : null,
    ]),
    onSave: async () => {
      const { error } = await sb.from('profiles').update({
        role: roleSel.value,
        is_active: active.checked,
        is_super_admin: superAdmin.checked,
      }).eq('id', p.id);
      if (error) { toast(error.message, 'err'); return false; }
      toast('Saved.'); onDone && onDone();
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
  const save = btn('Save settings', async () => {
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
    toast('Settings saved.'); onDone && onDone();
  }, { class: 'btn-primary' });

  return el('div', { class: 'card' }, [
    el('h3', { style: { marginTop: 0 } }, 'Company settings'),
    el('div', { class: 'form-grid' }, [
      fieldRow('Name', f.company_name, true),
      fieldRow('Company reg. no.', f.kennitala),
      fieldRow('Phone', f.phone),
      fieldRow('Address', f.address),
      fieldRow('Postcode', f.postal_code),
      fieldRow('Town / city', f.city),
      fieldRow('Email', f.email, true),
    ]),
    el('div', { class: 'row', style: { marginTop: '12px' } }, save),
  ]);
}
