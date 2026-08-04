import { supabase } from './supabase';

export interface Model {
  id: string;
  name: string;
  email: string;
}

export const DEFAULT_MODELS: Model[] = [
  { id: 'def-1', name: 'Pooja', email: 'pooja@example.com' },
  { id: 'def-2', name: 'Ananya', email: 'ananya@example.com' },
  { id: 'def-3', name: 'Riya', email: 'riya@example.com' }
];

const CACHE_KEY = 'model_pool_cache';
const DELETED_KEY = 'deleted_model_emails';

export function getDeletedEmails(): string[] {
  try {
    const raw = localStorage.getItem(DELETED_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveDeletedEmail(email: string) {
  try {
    const deleted = getDeletedEmails();
    const cleanEmail = email.trim().toLowerCase();
    if (!deleted.includes(cleanEmail)) {
      deleted.push(cleanEmail);
      localStorage.setItem(DELETED_KEY, JSON.stringify(deleted));
    }
  } catch (e) {
    console.warn("Failed to save deleted email:", e);
  }
}

export function unmarkDeletedEmail(email: string) {
  try {
    const deleted = getDeletedEmails();
    const cleanEmail = email.trim().toLowerCase();
    const filtered = deleted.filter(e => e !== cleanEmail);
    localStorage.setItem(DELETED_KEY, JSON.stringify(filtered));
  } catch (e) {
    console.warn("Failed to unmark deleted email:", e);
  }
}

export function getLocalModels(): Model[] {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) {
      const parsed: Model[] = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const deleted = getDeletedEmails();
        return parsed.filter(m => !deleted.includes(m.email.toLowerCase()));
      }
    }
  } catch (e) {
    console.warn("Error reading local models cache:", e);
  }
  
  // Initialize with DEFAULT_MODELS if cache is empty
  const deleted = getDeletedEmails();
  const initial = DEFAULT_MODELS.filter(m => !deleted.includes(m.email.toLowerCase()));
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(initial));
  } catch (e) {
    console.warn("Error setting initial local models cache:", e);
  }
  return initial;
}

export function setLocalModels(models: Model[]) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(models));
  } catch (e) {
    console.warn("Error saving local models:", e);
  }
}

export async function fetchAllModels(): Promise<Model[]> {
  const local = getLocalModels();
  const deleted = getDeletedEmails();

  try {
    const { data, error } = await supabase
      .from('models')
      .select('id, name, email')
      .order('name');

    if (!error && data && Array.isArray(data) && data.length > 0) {
      const map = new Map<string, Model>();

      // Put local models in map first
      local.forEach(m => {
        if (!deleted.includes(m.email.toLowerCase())) {
          map.set(m.email.toLowerCase(), m);
        }
      });

      // Overlay/Add DB models if not marked as deleted
      data.forEach(dbm => {
        const cleanEmail = (dbm.email || '').toLowerCase();
        if (cleanEmail && !deleted.includes(cleanEmail)) {
          map.set(cleanEmail, {
            id: String(dbm.id),
            name: dbm.name,
            email: dbm.email
          });
        }
      });

      const merged = Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
      setLocalModels(merged);
      return merged;
    }
  } catch (err) {
    console.warn("Supabase fetch models error (using local storage):", err);
  }

  return local.sort((a, b) => a.name.localeCompare(b.name));
}

export async function addModelToPool(name: string, email: string): Promise<{ success: boolean; models: Model[]; message?: string }> {
  const cleanName = name.trim();
  const cleanEmail = email.trim().toLowerCase();

  if (!cleanName || !cleanEmail) {
    return { success: false, models: getLocalModels(), message: 'Name and email are required' };
  }

  const currentModels = getLocalModels();
  if (currentModels.some(m => m.email.toLowerCase() === cleanEmail)) {
    return { success: false, models: currentModels, message: `Model with email "${cleanEmail}" already exists in pool` };
  }

  // Remove from deleted list if re-added
  unmarkDeletedEmail(cleanEmail);

  const isCryptoAvailable = typeof crypto !== 'undefined';
  const newId = (isCryptoAvailable && crypto.randomUUID) 
    ? crypto.randomUUID() 
    : 'model_' + Math.random().toString(36).substring(2, 11);

  const newModel: Model = {
    id: newId,
    name: cleanName,
    email: cleanEmail
  };

  const updated = [...currentModels, newModel].sort((a, b) => a.name.localeCompare(b.name));
  setLocalModels(updated);

  // Background DB sync
  try {
    // Attempt 1: Insert with ID, name, email
    let { data, error } = await supabase
      .from('models')
      .insert([{ id: newId, name: cleanName, email: cleanEmail }])
      .select();

    // Attempt 2: If insert with ID fails, try upserting with/without ID
    if (error) {
      console.warn("Supabase insert with ID failed, attempting fallback upsert/insert:", error.message);
      const res2 = await supabase
        .from('models')
        .upsert([{ name: cleanName, email: cleanEmail }], { onConflict: 'email' })
        .select();

      if (!res2.error && res2.data) {
        data = res2.data;
        error = null;
      } else {
        const res3 = await supabase
          .from('models')
          .insert([{ name: cleanName, email: cleanEmail }])
          .select();
        if (!res3.error && res3.data) {
          data = res3.data;
          error = null;
        }
      }
    }

    if (error) {
      console.error("Supabase models DB insert error:", error.message, error);
    } else if (data && data[0]) {
      const dbModel = data[0];
      const latest = getLocalModels();
      const mapped = latest.map(m => m.email.toLowerCase() === cleanEmail ? { ...m, id: String(dbModel.id || newId) } : m);
      setLocalModels(mapped);
      return { success: true, models: mapped };
    }
  } catch (err: any) {
    console.warn("Background DB insert exception (saved locally):", err?.message || err);
  }

  return { success: true, models: updated };
}

export async function deleteModelFromPool(id: string, email?: string): Promise<{ success: boolean; models: Model[] }> {
  const currentModels = getLocalModels();
  const targetModel = currentModels.find(m => m.id === id || (email && m.email.toLowerCase() === email.toLowerCase()));

  const targetEmail = targetModel?.email || email;
  if (targetEmail) {
    saveDeletedEmail(targetEmail);
  }

  const updated = currentModels.filter(m => m.id !== id && (!targetEmail || m.email.toLowerCase() !== targetEmail.toLowerCase()));
  setLocalModels(updated);

  // Background DB delete
  try {
    if (id) {
      await supabase.from('models').delete().eq('id', id);
    }
    if (targetEmail) {
      await supabase.from('models').delete().eq('email', targetEmail);
    }
  } catch (err) {
    console.warn("Background DB delete failed (deleted locally):", err);
  }

  return { success: true, models: updated };
}
