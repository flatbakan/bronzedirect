// modules/tilkynningar.js — Announcements (admin → all staff), with read receipts.
import { el, mount, btn } from '../render.js';
import { sb } from '../supabase.js';
import { getProfile, isAdmin } from '../auth.js';
import { modal, fieldRow, toast, confirmDialog, errorView } from '../ui.js';
import { fmtDateTime } from '../fmt.js';

export async function render(container) {
  mount(container, el('div', { class: 'empty' }, 'Loading…'));
  const me = getProfile();
  try {
    const [annRes, readsRes] = await Promise.all([
      sb.from('announcements').select('*, profiles:created_by(full_name)').order('is_pinned', { ascending: false }).order('created_at', { ascending: false }),
      sb.from('announcement_reads').select('announcement_id').eq('profile_id', me?.id),
    ]);
    if (annRes.error) throw annRes.error;
    const anns = annRes.data || [];
    const readIds = new Set((readsRes.data || []).map((r) => r.announcement_id));
    const reload = () => render(container);

    // Mark all shown announcements as read for this user
    const unread = anns.filter((a) => !readIds.has(a.id));
    if (unread.length && me?.id) {
      await sb.from('announcement_reads').upsert(
        unread.map((a) => ({ announcement_id: a.id, profile_id: me.id })),
        { onConflict: 'announcement_id,profile_id' },
      );
      // refresh nav unread dot
      window.dispatchEvent(new CustomEvent('bd:announcements-read'));
    }

    const list = anns.length
      ? el('div', {}, anns.map((a) => el('div', { class: 'card' }, [
          el('div', { class: 'row', style: { justifyContent: 'space-between' } }, [
            el('h3', { style: { margin: 0 } }, [a.is_pinned ? '📌 ' : '', a.title].join('')),
            isAdmin() ? el('div', { class: 'row' }, [
              btn('Edit', () => form(a, reload), { class: 'btn-ghost btn-sm' }),
              btn('Delete', async () => {
                if (!(await confirmDialog('Delete announcement?'))) return;
                await sb.from('announcements').delete().eq('id', a.id);
                reload();
              }, { class: 'btn-ghost btn-sm' }),
            ]) : (!readIds.has(a.id) ? el('span', { class: 'badge invoiced' }, 'New') : null),
          ]),
          a.body ? el('p', { style: { whiteSpace: 'pre-wrap' } }, a.body) : null,
          el('div', { class: 'muted', style: { fontSize: '12px' } },
            [a.profiles?.full_name, fmtDateTime(a.created_at)].filter(Boolean).join(' · ')),
        ])))
      : el('div', { class: 'empty' }, 'No announcements.');

    mount(container, el('div', {}, [
      el('div', { class: 'page-head' }, [
        el('h2', {}, 'Announcements'),
        el('span', { class: 'spacer' }),
        isAdmin() ? btn('+ New', () => form(null, reload), { class: 'btn-primary' }) : null,
      ]),
      list,
    ]));
  } catch (e) {
    console.error(e);
    errorView(container, e.message);
  }
}

function form(existing, onDone) {
  const me = getProfile();
  const title = el('input', { value: existing?.title || '' });
  const body = el('textarea', { style: { minHeight: '140px' } }, existing?.body || '');
  const pinned = el('input', { type: 'checkbox', checked: existing?.is_pinned || false });
  modal({
    title: existing ? 'Edit announcement' : 'New announcement',
    body: el('div', {}, [
      fieldRow('Title *', title, true),
      fieldRow('Message', body, true),
      el('div', { class: 'field' }, [el('label', {}, 'Pinned'), el('div', { class: 'row' }, [pinned, el('span', { class: 'muted' }, 'Keep at top')])]),
    ]),
    onSave: async () => {
      if (!title.value.trim()) { toast('Title is required.', 'err'); return false; }
      const payload = { title: title.value.trim(), body: body.value.trim() || null, is_pinned: pinned.checked };
      const q = existing
        ? sb.from('announcements').update(payload).eq('id', existing.id)
        : sb.from('announcements').insert({ ...payload, created_by: me?.id || null });
      const { error } = await q;
      if (error) { toast(error.message, 'err'); return false; }
      toast('Saved.'); onDone && onDone();
    },
  });
}
