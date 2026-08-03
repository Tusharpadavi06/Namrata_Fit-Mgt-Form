/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './components/ui/tabs';
import { Button } from './components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './components/ui/card';
import { LogIn, LogOut, User as UserIcon, FileText, Users } from 'lucide-react';
import { FormTab } from './components/FormTab';
import { ManageModelsTab } from './components/ManageModelsTab';
import { HistoryTab } from './components/HistoryTab';
import { ModelResponseView } from './components/ModelResponseView';
import { Toaster } from './components/ui/sonner';
import { supabase } from './lib/supabase';
import { fetchAllModels, getLocalModels, setLocalModels } from './lib/models-service';
import headerBannerImg from './assets/images/lingerie_survey_header_1785743995198.jpg';

export default function App() {
  const [activeTab, setActiveTab] = useState('form');
  const [modelPool, setModelPool] = useState<any[]>(() => getLocalModels());
  const [loadingModels, setLoadingModels] = useState(false);
  const [urlVersion, setUrlVersion] = useState(0);

  // Function to handle navigating to edit a submission
  const handleEditSubmission = (submissionId: string, round: string) => {
    // Update URL without full reload
    const url = new URL(window.location.href);
    url.searchParams.set('mode', 'edit');
    url.searchParams.set('submissionId', submissionId);
    url.searchParams.set('round', round);
    window.history.pushState({}, '', url);
    
    // Increment version to force remount of FormTab
    setUrlVersion(v => v + 1);
    
    // Switch to form tab
    setActiveTab('form');
  };

  // Fetch model pool once at app level with local cache sync
  const fetchModelPool = async (updatedData?: any[]) => {
    if (updatedData && Array.isArray(updatedData)) {
      setModelPool(updatedData);
      setLocalModels(updatedData);
      setLoadingModels(false);
      return;
    }

    try {
      const models = await fetchAllModels();
      setModelPool(models);
    } catch (error) {
      console.error("Error fetching models at App level:", error);
    } finally {
      setLoadingModels(false);
    }
  };

  useEffect(() => {
    fetchModelPool();
  }, []);

  // Check for parameters in URL
  const query = new URLSearchParams(window.location.search);
  const submissionId = query.get('submissionId');
  const assignmentId = query.get('assignmentId');
  const round = query.get('round');
  const mode = query.get('mode');

  // If viewing a model response link (submissionId + assignmentId, but NOT in edit mode)
  if (submissionId && assignmentId && mode !== 'edit') {
    return (
      <div className="min-h-screen bg-slate-50 p-4 md:p-8">
        <Toaster />
        <div className="max-w-3xl mx-auto">
          <ModelResponseView 
            submissionId={submissionId} 
            assignmentId={assignmentId} 
            round={round || '1'} 
          />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f0ebf8] font-sans selection:bg-[#d1c4e9]">
      <Toaster />
      <div className="w-full h-2.5 bg-primary rounded-t-lg hidden md:block"></div>
      
      <main className="max-w-2xl mx-auto mt-6 px-4 pb-20">
        <div className="mb-6 rounded-xl overflow-hidden bg-white shadow-sm border border-slate-200">
          <div className="block outline-none overflow-hidden">
            <img 
              src={headerBannerImg} 
              alt="Lingerie Survey Form Header" 
              className="w-full h-36 sm:h-44 md:h-48 object-cover object-center block bg-[#faf7f2] hover:opacity-95 transition-all duration-300"
              loading="eager"
              referrerPolicy="no-referrer"
            />
          </div>
          <div className="p-6 border-b">
            <h1 className="text-2xl font-normal text-slate-900 tracking-tight">Sample Fit Request</h1>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
              Assign samples to models for fitting comments. Feedback is synced automatically.
            </p>
          </div>
          
          <Tabs value={activeTab} onValueChange={setActiveTab} className="bg-white">
            <div className="flex justify-center py-4 border-b bg-slate-50/30">
              <TabsList className="bg-white border shadow-sm p-1 h-auto gap-2">
                <TabsTrigger 
                  value="form" 
                  className="px-10 py-2.5 rounded-md data-[state=active]:bg-primary data-[state=active]:text-white data-[state=active]:shadow-md transition-all font-medium"
                >
                  Form
                </TabsTrigger>
                <TabsTrigger 
                  value="history" 
                  className="px-10 py-2.5 rounded-md data-[state=active]:bg-primary data-[state=active]:text-white data-[state=active]:shadow-md transition-all font-medium"
                >
                  History
                </TabsTrigger>
                <TabsTrigger 
                  value="models" 
                  className="px-10 py-2.5 rounded-md data-[state=active]:bg-primary data-[state=active]:text-white data-[state=active]:shadow-md transition-all font-medium"
                >
                  Models
                </TabsTrigger>
              </TabsList>
            </div>

            <div className="p-6 bg-[#f0ebf8]">
              <TabsContent value="form" className="outline-none mt-0">
                {/* Use a key based on URL params and version to force re-mounting when we click from history */}
                <FormTab 
                  key={`${window.location.search}-${urlVersion}`}
                  modelPool={modelPool} 
                  loadingModels={loadingModels} 
                  refreshModels={fetchModelPool} 
                />
              </TabsContent>

              <TabsContent value="history" className="outline-none mt-0">
                <HistoryTab onEdit={handleEditSubmission} />
              </TabsContent>

              <TabsContent value="models" className="outline-none mt-0">
                <ManageModelsTab 
                  modelPool={modelPool} 
                  loadingModels={loadingModels} 
                  onModelsChange={fetchModelPool} 
                />
              </TabsContent>
            </div>
          </Tabs>
        </div>
      </main>

      <footer className="fixed bottom-0 left-0 right-0 bg-white border-t py-2 px-4 text-center text-[10px] text-slate-400 font-medium md:hidden shadow-lg">
        Fit Comment System
      </footer>
    </div>
  );
}
