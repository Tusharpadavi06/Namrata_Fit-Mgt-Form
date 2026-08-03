import React, { useState, useEffect } from 'react';
import { supabase, supabaseUrl, supabaseAnonKey } from '../lib/supabase';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Plus, Trash2, UserPlus, Loader2, Info } from 'lucide-react';
import { toast } from 'sonner';

interface Model {
  id: string;
  name: string;
  email: string;
}

interface ManageModelsTabProps {
  modelPool: Model[];
  loadingModels: boolean;
  onModelsChange: (updatedData?: any[]) => void | Promise<void>;
}

export function ManageModelsTab({ modelPool, loadingModels, onModelsChange }: ManageModelsTabProps) {
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const handleAddModel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName || !newEmail) return;
    
    setSubmitting(true);
    const toastId = toast.loading('Adding model to pool...');
    
    const isCryptoAvailable = typeof crypto !== 'undefined';
    const tempId = (isCryptoAvailable && crypto.randomUUID) 
      ? crypto.randomUUID() 
      : Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
      
    const newModel: Model = { 
      id: tempId,
      name: newName.trim(), 
      email: newEmail.trim().toLowerCase() 
    };

    try {
      // 1. Optimistically update local cache and show success
      const currentCacheStr = localStorage.getItem('model_pool_cache');
      let currentCache: Model[] = currentCacheStr ? JSON.parse(currentCacheStr) : [...modelPool];
      
      // Filter out duplicate emails locally
      if (!currentCache.some((m: any) => m.email.toLowerCase() === newModel.email.toLowerCase())) {
        currentCache.push(newModel);
        currentCache.sort((a, b) => a.name.localeCompare(b.name));
        localStorage.setItem('model_pool_cache', JSON.stringify(currentCache));
      }

      setNewName('');
      setNewEmail('');
      
      // Update UI state immediately
      onModelsChange(currentCache);

      // 2. Try to save to Supabase database in background
      const { data, error } = await supabase
        .from('models')
        .insert([{ 
          name: newModel.name, 
          email: newModel.email 
        }])
        .select();

      if (error) {
        if (error.code === '23505') {
          console.warn('A model with this email already exists in database.');
        } else {
          console.error("Database insert error details:", error);
        }
      } else if (data && data[0]) {
        // If DB returned a different auto-ID, we update our local state with DB ID
        const dbModel = data[0];
        const latestCacheStr = localStorage.getItem('model_pool_cache');
        if (latestCacheStr) {
          let latestCache: Model[] = JSON.parse(latestCacheStr);
          latestCache = latestCache.map(m => m.id === tempId ? { ...m, id: dbModel.id } : m);
          localStorage.setItem('model_pool_cache', JSON.stringify(latestCache));
          onModelsChange(latestCache);
        }
      }

      toast.success(`Model "${newModel.name}" added successfully`, { id: toastId });
    } catch (error: any) {
      console.warn("Database insert failed (using local fallback):", error.message);
      toast.success(`Model "${newModel.name}" added locally`, { id: toastId });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      // 1. Optimistically remove from local storage cache immediately
      const currentCacheStr = localStorage.getItem('model_pool_cache');
      let currentCache: Model[] = currentCacheStr ? JSON.parse(currentCacheStr) : [...modelPool];
      currentCache = currentCache.filter((m: any) => m.id !== id);
      localStorage.setItem('model_pool_cache', JSON.stringify(currentCache));
      
      // Update UI state immediately
      onModelsChange(currentCache);
      toast.success('Model removed');

      // 2. Try to delete in Supabase database in background
      const { error } = await supabase
        .from('models')
        .delete()
        .eq('id', id);
      
      if (error) {
        console.warn("Supabase delete failed (already deleted locally or permission issue):", error.message);
      }
    } catch (error: any) {
      console.warn("Delete database exception:", error.message);
    }
  };

  if (!supabaseUrl || !supabaseAnonKey) {
    return (
      <div className="max-w-2xl mx-auto p-4">
        <Card className="border-destructive/50 bg-destructive/5">
          <CardHeader>
            <CardTitle className="text-destructive flex items-center gap-2">
              <Info className="w-5 h-5" />
              Configuration Missing
            </CardTitle>
            <CardDescription>
              Supabase credentials are not set. Please add <strong>VITE_SUPABASE_URL</strong> and <strong>VITE_SUPABASE_ANON_KEY</strong> to your environment variables.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-full mx-auto pb-10">
      <Card className="shadow-sm overflow-hidden">
        <CardHeader>
          <CardTitle className="text-xl font-normal text-slate-900 tracking-tight flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-primary" />
            Add New Model
          </CardTitle>
          <CardDescription className="text-xs">Add a model to the pool for sample assignments.</CardDescription>
        </CardHeader>
        <CardContent className="pt-2">
          <form onSubmit={handleAddModel} className="space-y-6">
            <div className="space-y-4">
              <Label className="text-base font-normal text-slate-900">Model Name <span className="text-destructive">*</span></Label>
              <Input 
                placeholder="e.g. Name of Model" 
                value={newName} 
                onChange={(e) => setNewName(e.target.value)}
                className="border-0 border-b border-slate-200 rounded-none px-0 focus-visible:ring-0 focus-visible:border-primary transition-all bg-transparent h-10 text-base shadow-none"
                required
              />
            </div>
            <div className="space-y-4">
              <Label className="text-base font-normal text-slate-900">Email Address <span className="text-destructive">*</span></Label>
              <Input 
                type="email" 
                placeholder="model@example.com" 
                value={newEmail} 
                onChange={(e) => setNewEmail(e.target.value)}
                className="border-0 border-b border-slate-200 rounded-none px-0 focus-visible:ring-0 focus-visible:border-primary transition-all bg-transparent h-10 text-base shadow-none"
                required
              />
            </div>
            <div className="flex justify-end pt-2">
              <Button type="submit" className="px-8 h-10 font-medium" disabled={submitting}>
                {submitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <Plus className="w-4 h-4 mr-2" />
                    Add Model
                  </>
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <div className="space-y-2">
        <h3 className="px-1 text-sm font-bold uppercase tracking-widest text-slate-400">Current Pool ({modelPool.length})</h3>
        
        {loadingModels && modelPool.length === 0 ? (
          <div className="flex justify-center p-12 bg-white rounded-lg border shadow-sm">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-2">
            {modelPool.length === 0 ? (
              <Card className="shadow-sm">
                <CardContent className="py-12 text-center text-slate-400">
                  No models added yet. Start by adding one above.
                </CardContent>
              </Card>
            ) : (
              modelPool.map((model) => (
                <Card key={model.id} className="shadow-sm hover:shadow-md transition-shadow group">
                  <CardContent className="py-4 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                        {model.name.charAt(0)}
                      </div>
                      <div>
                        <p className="font-semibold text-slate-900">{model.name}</p>
                        <p className="text-sm text-primary font-medium">{model.email}</p>
                      </div>
                    </div>
                    {deleteConfirmId === model.id ? (
                      <div className="flex items-center gap-1.5 shrink-0 z-10">
                        <span className="text-xs text-destructive font-medium mr-1 hidden sm:inline">Delete?</span>
                        <Button 
                          variant="destructive" 
                          size="sm" 
                          className="h-8 text-xs px-2.5 shadow-sm"
                          onClick={() => {
                            handleDelete(model.id);
                            setDeleteConfirmId(null);
                          }}
                        >
                          Yes
                        </Button>
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="h-8 text-xs px-2.5 border-slate-200"
                          onClick={() => setDeleteConfirmId(null)}
                        >
                          No
                        </Button>
                      </div>
                    ) : (
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="text-slate-300 hover:text-destructive hover:bg-destructive/5 md:opacity-0 md:group-hover:opacity-100 opacity-100 transition-opacity"
                        onClick={() => setDeleteConfirmId(model.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
