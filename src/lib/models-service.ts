import { supabase } from './supabase';
import { v4 as uuidv4 } from 'uuid';

export interface Model {
  id: string;
  name: string;
  email: string;
}

export function isValidUuid(str?: string): boolean {
  if (!str) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(str.trim());
}

export const DEFAULT_MODELS: Model[] = [
  { id: '3df773b5-1324-49d5-8d44-d307e7340816', name: 'Pooja', email: 'pooja@example.com' },
  { id: '63f9c222-9f98-4d91-a508-4be57c2ee231', name: 'Sakshi', email: 'crm.mumbai@ginzalimited.com' },
  { id: '24d92afd-853b-47c7-8cbb-ff347d7f37c2', name: 'Lalna', email: 'lalna@example.com' },
  { id: '5752e23b-1883-4693-9157-46dc167c80f4', name: 'Sheetal', email: 'sheetal@example.com' },
  { id: 'af6caad2-624f-4f1d-b4bb-0b2bb8983582', name: 'Tushar', email: 'tushar@example.com' }
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
        // Sanitize any legacy non-UUID IDs
        const sanitized = parsed
          .filter(m => !deleted.includes((m.email || '').toLowerCase()))
          .map(m => ({
            ...m,
            id: isValidUuid(m.id) ? m.id : uuidv4()
          }));
        return sanitized;
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
    const sanitized = models.map(m => ({
      ...m,
      id: isValidUuid(m.id) ? m.id : uuidv4()
    }));
    localStorage.setItem(CACHE_KEY, JSON.stringify(sanitized));
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

    if (!error && data && Array.isArray(data)) {
      const map = new Map<string, Model>();

      // Put local models in map first
      local.forEach(m => {
        if (!deleted.includes((m.email || '').toLowerCase())) {
          map.set((m.email || '').toLowerCase(), m);
        }
      });

      // Overlay/Add DB models if not marked as deleted
      data.forEach(dbm => {
        const cleanEmail = (dbm.email || '').toLowerCase();
        if (cleanEmail && !deleted.includes(cleanEmail)) {
          map.set(cleanEmail, {
            id: isValidUuid(dbm.id) ? dbm.id : uuidv4(),
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

  // Always generate a valid UUID
  const newId = uuidv4();

  const newModel: Model = {
    id: newId,
    name: cleanName,
    email: cleanEmail
  };

  const updated = [...currentModels, newModel].sort((a, b) => a.name.localeCompare(b.name));
  setLocalModels(updated);

  // Supabase DB Sync
  try {
    // Check if model already exists in Supabase
    const { data: existing } = await supabase
      .from('models')
      .select('id')
      .eq('email', cleanEmail)
      .maybeSingle();

    if (existing && existing.id) {
      // Model exists in DB, update local model with DB's UUID
      const latest = getLocalModels().map(m => m.email.toLowerCase() === cleanEmail ? { ...m, id: existing.id } : m);
      setLocalModels(latest);
      return { success: true, models: latest };
    }

    // Insert new model with valid UUID
    const { data, error } = await supabase
      .from('models')
      .insert([{ id: newId, name: cleanName, email: cleanEmail }])
      .select();

    if (!error && data && data[0]) {
      const dbId = data[0].id;
      const latest = getLocalModels().map(m => m.email.toLowerCase() === cleanEmail ? { ...m, id: dbId } : m);
      setLocalModels(latest);
      return { success: true, models: latest };
    }
  } catch (err: any) {
    console.warn("Supabase model insert error (saved locally):", err?.message || err);
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
    if (id && isValidUuid(id)) {
      await supabase.from('models').delete().eq('id', id);
    }
    if (targetEmail) {
      await supabase.from('models').delete().eq('email', targetEmail);
    }
  } catch (err) {
    console.warn("Supabase model delete failed (deleted locally):", err);
  }

  return { success: true, models: updated };
}
