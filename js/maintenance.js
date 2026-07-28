// maintenance.js — generate a work order from a preventive-maintenance plan.
import { sb } from './supabase.js';
import { getProfile } from './auth.js';

const iso = (d) => d.toISOString().slice(0, 10);

// plan: a maintenance_plans row (optionally with equipment(customer_id) embedded).
// Returns the new work order id.
export async function generateFromPlan(plan) {
  let customerId = plan.equipment?.customer_id;
  if (!customerId) {
    const { data } = await sb.from('equipment').select('customer_id').eq('id', plan.equipment_id).maybeSingle();
    customerId = data?.customer_id;
  }
  if (!customerId) throw new Error('Asset has no customer.');

  const me = getProfile();
  const { data: wo, error } = await sb.from('work_orders').insert({
    customer_id: customerId,
    equipment_id: plan.equipment_id,
    type: 'maintenance',
    status: plan.assigned_to ? 'assigned' : 'new',
    priority: plan.priority || 'normal',
    title: plan.title,
    description: plan.description || null,
    assigned_to: plan.assigned_to || null,
    created_by: me?.id || null,
  }).select('id').single();
  if (error) throw error;

  if (plan.checklist_template_id) {
    const { data: t } = await sb.from('checklist_templates').select('items').eq('id', plan.checklist_template_id).maybeSingle();
    const items = (t?.items || []).map((label, i) => ({ work_order_id: wo.id, label, position: i }));
    if (items.length) await sb.from('work_order_checklist_items').insert(items);
  }

  const today = new Date();
  const next = new Date(today.getTime() + (plan.interval_days || 180) * 86400000);
  await sb.from('maintenance_plans').update({ last_done_date: iso(today), next_due_date: iso(next) }).eq('id', plan.id);

  return wo.id;
}
