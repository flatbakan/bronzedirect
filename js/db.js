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
