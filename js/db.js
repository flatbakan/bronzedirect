// db.js — Sameiginlegar gagnafyrirspurnir.
import { sb } from './supabase.js';

export async function listCustomers({ activeOnly = false } = {}) {
  let q = sb.from('customers').select('*').order('name');
  if (activeOnly) q = q.eq('is_active', true);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

export async function getCustomer(id) {
  const { data, error } = await sb.from('customers').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

export async function listLocations(customerId) {
  const { data, error } = await sb.from('locations').select('*').eq('customer_id', customerId).order('name');
  if (error) throw error;
  return data || [];
}

export async function listEquipment({ customerId } = {}) {
  let q = sb.from('equipment').select('*, customers(name), locations(name)').order('created_at', { ascending: false });
  if (customerId) q = q.eq('customer_id', customerId);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

export async function listProducts({ category, activeOnly = true } = {}) {
  let q = sb.from('products').select('*').order('name');
  if (activeOnly) q = q.eq('is_active', true);
  if (category) q = q.eq('category', category);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

export async function listMaintenancePlans(equipmentId) {
  const { data, error } = await sb.from('maintenance_plans')
    .select('*, checklist_templates(name), profiles:assigned_to(full_name)')
    .eq('equipment_id', equipmentId).order('next_due_date');
  if (error) throw error;
  return data || [];
}

export async function dueMaintenance(withinDays = 7) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + withinDays);
  const iso = cutoff.toISOString().slice(0, 10);
  const { data, error } = await sb.from('maintenance_plans')
    .select('*, equipment(id,name,brand,model,customer_id,customers(name))')
    .eq('is_active', true).lte('next_due_date', iso).order('next_due_date');
  if (error) throw error;
  return data || [];
}

export async function listChecklistTemplates({ activeOnly = true } = {}) {
  let q = sb.from('checklist_templates').select('*').order('name');
  if (activeOnly) q = q.eq('is_active', true);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

export async function getSettings() {
  const { data, error } = await sb.from('company_settings').select('*').eq('id', 1).maybeSingle();
  if (error) throw error;
  return data || {};
}

export async function listStaff({ activeOnly = true } = {}) {
  let q = sb.from('profiles').select('*').order('full_name');
  if (activeOnly) q = q.eq('is_active', true);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}
