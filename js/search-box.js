// search-box.js — global search in the topbar (customers, assets, work orders).
import { el, mount } from './render.js';
import { sb } from './supabase.js';
import { navigate } from './router.js';
import { WO_TYPE } from './fmt.js';

export function makeSearchBox() {
  const input = el('input', { type: 'search', placeholder: 'Search customers, assets, jobs…', autocomplete: 'off' });
  const results = el('div', { class: 'search-results', style: { display: 'none' } });
  const box = el('div', { class: 'search-box' }, [input, results]);
  let timer = null;

  const close = () => { results.style.display = 'none'; };
  const open = () => { results.style.display = ''; };
  const go = (href) => { close(); input.value = ''; input.blur(); navigate(href); };
  const link = (href, main, sub) => el('a', {
    href: '#' + href, onClick: (e) => { e.preventDefault(); go(href); },
  }, [el('div', {}, main), sub ? el('div', { class: 'r-sub' }, sub) : null]);

  async function run(term) {
    const t = term.trim();
    if (t.length < 2) { close(); return; }
    const like = `%${t}%`;
    const isNum = /^\d+$/.test(t);
    const [cust, assets, wos] = await Promise.all([
      sb.from('customers').select('id,name').ilike('name', like).limit(6),
      sb.from('equipment').select('id,name,brand,model,serial_number,asset_no,customers(name)')
        .or(`name.ilike.${like},brand.ilike.${like},model.ilike.${like},serial_number.ilike.${like}${isNum ? `,asset_no.eq.${t}` : ''}`).limit(6),
      isNum
        ? sb.from('work_orders').select('id,number,title,type,customers(name)').eq('number', Number(t)).limit(6)
        : sb.from('work_orders').select('id,number,title,type,customers(name)').ilike('title', like).limit(6),
    ]);
    draw(cust.data || [], assets.data || [], wos.data || []);
  }

  function draw(cust, assets, wos) {
    const kids = [];
    if (cust.length) {
      kids.push(el('div', { class: 'sec' }, 'Customers'));
      cust.forEach((c) => kids.push(link(`/vidskiptavinir/${c.id}`, c.name)));
    }
    if (assets.length) {
      kids.push(el('div', { class: 'sec' }, 'Assets'));
      assets.forEach((a) => {
        const nm = a.name || [a.brand, a.model].filter(Boolean).join(' ') || 'Asset';
        kids.push(link(`/taeki/${a.id}`, nm, [a.asset_no && ('#A' + a.asset_no), a.serial_number && ('S/N ' + a.serial_number), a.customers?.name].filter(Boolean).join(' · ')));
      });
    }
    if (wos.length) {
      kids.push(el('div', { class: 'sec' }, 'Work orders'));
      wos.forEach((w) => kids.push(link(`/verkbeidnir/${w.id}`, `#${w.number} · ${WO_TYPE[w.type] || w.type}`, [w.customers?.name, w.title].filter(Boolean).join(' · '))));
    }
    if (!kids.length) kids.push(el('div', { class: 'search-empty' }, 'No matches.'));
    mount(results, kids); open();
  }

  input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => run(input.value), 250); });
  input.addEventListener('focus', () => { if (input.value.trim().length >= 2 && results.childElementCount) open(); });
  input.addEventListener('keydown', (e) => { if (e.key === 'Escape') { close(); input.blur(); } });
  document.addEventListener('click', (e) => { if (!box.contains(e.target)) close(); });

  return box;
}
