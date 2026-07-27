// auth.js — Auðkenning og seta.
import { sb } from './supabase.js';

let currentProfile = null;

export function getProfile() { return currentProfile; }
export function isAdmin() {
  return !!currentProfile && (currentProfile.role === 'admin' || currentProfile.is_super_admin);
}
export function isSuperAdmin() { return !!currentProfile && currentProfile.is_super_admin; }
export function role() { return currentProfile?.role || null; }

export async function getSession() {
  const { data } = await sb.auth.getSession();
  return data.session;
}

// Sækir profil innskráðs notanda (og cache-ar).
export async function loadProfile() {
  const session = await getSession();
  if (!session) { currentProfile = null; return null; }
  const { data, error } = await sb
    .from('profiles')
    .select('*')
    .eq('id', session.user.id)
    .maybeSingle();
  if (error) { console.error('loadProfile', error); currentProfile = null; return null; }
  currentProfile = data;
  return data;
}

export async function signIn(email, password) {
  const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw error;
  return loadProfile();
}

export async function signUp(email, password, fullName) {
  const { error } = await sb.auth.signUp({
    email: email.trim(),
    password,
    options: { data: { full_name: fullName } },
  });
  if (error) throw error;
}

export async function resetPassword(email) {
  const { error } = await sb.auth.resetPasswordForEmail(email.trim(), {
    redirectTo: window.location.origin,
  });
  if (error) throw error;
}

export async function signOut() {
  await sb.auth.signOut();
  currentProfile = null;
}

export function onAuthChange(cb) {
  return sb.auth.onAuthStateChange((_event, session) => cb(session));
}
