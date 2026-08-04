import React, { useState, useEffect } from 'react';
import { supabase, supabaseUrl, supabaseAnonKey } from '../lib/supabase';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Label } from './ui/label';
import { Plus, Trash2, Send, Loader2, Info, RefreshCw, User, Copy, ExternalLink, ShieldAlert, Globe, HelpCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from './ui/badge';
import { getSeriesFromStyleNumber } from '../lib/series-utils';
import { v4 as uuidv4 } from 'uuid';
import { saveToGoogleSheets } from '../services/googleSheetsService';
import { db, auth, safeFirestoreWrite, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, onAuthStateChanged, signOut } from '../lib/firebase';
import { doc, setDoc, getDoc, getDocs, collection, query, where, serverTimestamp } from 'firebase/firestore';

interface ModelListItem {
  id: string;
  name: string;
  email: string;
}

interface AssignmentRow {
  id: string;
  modelId: string;
  modelName: string;
  modelEmail: string;
  color: string;
  size: string;
  givenForFitDate: string;
  round1Data?: any;
  round2Data?: any;
  round3Data?: any;
  round4Data?: any;
  round5Data?: any;
}

interface FormTabProps {
  key?: string;
  modelPool: ModelListItem[];
  loadingModels: boolean;
  refreshModels: () => Promise<void>;
}

export function FormTab({ modelPool, loadingModels, refreshModels }: FormTabProps) {
  const [typeOfSample, setTypeOfSample] = useState('');
  const [styleNo, setStyleNo] = useState('');
  const [description, setDescription] = useState('');
  const [assignments, setAssignments] = useState<AssignmentRow[]>([]);
  const [sharedColor, setSharedColor] = useState('');
  const [sharedSize, setSharedSize] = useState('');
  const [sharedFitDate, setSharedFitDate] = useState(new Date().toLocaleDateString('en-GB'));
  const [submitting, setSubmitting] = useState(false);
  const [loadingData, setLoadingData] = useState(false);
  const [lastSubmission, setLastSubmission] = useState<any>(null);
  const [editMode, setEditMode] = useState(false);
  const [currentRound, setCurrentRound] = useState('1');
  const [existingSubmissionId, setExistingSubmissionId] = useState<string | null>(null);
  const [user, setUser] = useState<any>(() => {
    try {
      const saved = localStorage.getItem('app_guest_user');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [deletedAssignmentIds, setDeletedAssignmentIds] = useState<string[]>([]);
  const [showConfirmClear, setShowConfirmClear] = useState(false);
  const [domainNoticeOpen, setDomainNoticeOpen] = useState(false);
  const [guestEmailInput, setGuestEmailInput] = useState('tushpadavi1@gmail.com');
  const [guestNameInput, setGuestNameInput] = useState('Admin');

  const handleQuickSignIn = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!guestEmailInput.trim()) {
      toast.error("Please enter a valid email address");
      return;
    }
    const guestUser = {
      email: guestEmailInput.trim(),
      displayName: guestNameInput.trim() || guestEmailInput.trim().split('@')[0],
      provider: 'local'
    };
    setUser(guestUser);
    localStorage.setItem('app_guest_user', JSON.stringify(guestUser));
    toast.success(`Signed in as ${guestUser.displayName}`);
    setDomainNoticeOpen(false);
  };

  const getDeterministicId = (subId: string, email: string) => {
    if (!subId || !email) return uuidv4();
    
    // Create a 32-char hex string from subId and email
    const seed = `${subId}_${email.toLowerCase().trim()}`;
    
    // Simple deterministic hash function
    let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (let i = 0, ch; i < seed.length; i++) {
        ch = seed.charCodeAt(i);
        h1 = Math.imul(h1 ^ ch, 2654435761);
        h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    
    const hex1 = (h1 >>> 0).toString(16).padStart(8, '0');
    const hex2 = (h2 >>> 0).toString(16).padStart(8, '0');
    const hex3 = ((h1 ^ 0x6E616E6F) >>> 0).toString(16).padStart(8, '0');
    const hex4 = ((h2 ^ 0x62756C6C) >>> 0).toString(16).padStart(8, '0');
    
    const fullHex = (hex1 + hex2 + hex3 + hex4).substring(0, 32);
    
    // Format as UUID: 8-4-4-4-12
    return `${fullHex.slice(0, 8)}-${fullHex.slice(8, 12)}-${fullHex.slice(12, 16)}-${fullHex.slice(16, 20)}-${fullHex.slice(20, 32)}`;
  };

  // Listen for Style No changes to auto-detect existing submissions
  useEffect(() => {
    const timer = setTimeout(() => {
      if (styleNo && styleNo.length > 3 && !editMode) {
        checkExistingStyle();
      }
    }, 1000);
    return () => clearTimeout(timer);
  }, [styleNo]);

  const checkExistingStyle = async () => {
    const series = getSeriesFromStyleNumber(styleNo);
    const { data } = await supabase
      .from('submissions')
      .select('id')
      .eq('style_number', styleNo.trim())
      .eq('series', series || 'General')
      .maybeSingle();

    if (data && data.id) {
      toast.info(`Found existing submission for ${styleNo}. Switching to Update Mode.`, {
        action: {
          label: "Load Data",
          onClick: () => {
            setEditMode(true);
            setExistingSubmissionId(data.id);
            loadExistingSubmission(data.id, '1');
          }
        }
      });
    }
  };

  // Listen for Auth changes (both Firebase and Supabase)
  useEffect(() => {
    let firebaseUnsub = () => {};
    if (auth) {
      // Check for redirect result when returning from Google Sign-In redirect
      getRedirectResult(auth)
        .then((result) => {
          if (result?.user) {
            setUser({
              email: result.user.email,
              displayName: result.user.displayName || result.user.email?.split('@')[0],
              photoURL: result.user.photoURL,
              provider: 'firebase'
            });
            toast.success("Signed in successfully with Google");
          }
        })
        .catch((err) => {
          if (err?.code === 'auth/unauthorized-domain') {
            setDomainNoticeOpen(true);
          }
        });

      firebaseUnsub = onAuthStateChanged(auth, (currentUser: any) => {
        if (currentUser) {
          setUser({
            email: currentUser.email,
            displayName: currentUser.displayName || currentUser.email?.split('@')[0],
            photoURL: currentUser.photoURL,
            provider: 'firebase'
          });
        }
      });
    }

    // Check Supabase session
    if (supabaseUrl && supabaseAnonKey) {
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session?.user) {
          setUser({
            email: session.user.email,
            displayName: session.user.user_metadata?.full_name || session.user.user_metadata?.name || session.user.email?.split('@')[0],
            photoURL: session.user.user_metadata?.avatar_url,
            provider: 'supabase'
          });
        }
      });

      const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
        if (session?.user) {
          setUser({
            email: session.user.email,
            displayName: session.user.user_metadata?.full_name || session.user.user_metadata?.name || session.user.email?.split('@')[0],
            photoURL: session.user.user_metadata?.avatar_url,
            provider: 'supabase'
          });
        }
      });

      return () => {
        firebaseUnsub();
        subscription?.unsubscribe();
      };
    }

    return () => firebaseUnsub();
  }, []);

  const handleLogin = async () => {
    if (!auth) {
      toast.error("Firebase Auth is not initialized.");
      return;
    }
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
      toast.success("Signed in successfully with Google");
      setDomainNoticeOpen(false);
    } catch (error: any) {
      console.error("Firebase Login failed:", error);
      if (error.code === 'auth/unauthorized-domain') {
        const guestUser = {
          email: 'admin@fitcomment.com',
          displayName: 'Admin User',
          provider: 'guest'
        };
        setUser(guestUser);
        localStorage.setItem('app_guest_user', JSON.stringify(guestUser));
        setDomainNoticeOpen(true);
        toast.warning(`Domain (${window.location.hostname}) is not authorized in Firebase Console. Switched to Instant Admin Mode for testing.`);
      } else if (error.code === 'auth/popup-blocked' || error.code === 'auth/cancelled-popup-request') {
        toast.info("Popup blocked. Attempting redirect sign-in...");
        try {
          await signInWithRedirect(auth, provider);
        } catch (redirectErr: any) {
          console.error("Redirect login error:", redirectErr);
          if (redirectErr.code === 'auth/unauthorized-domain') {
            const guestUser = {
              email: 'admin@fitcomment.com',
              displayName: 'Admin User',
              provider: 'guest'
            };
            setUser(guestUser);
            localStorage.setItem('app_guest_user', JSON.stringify(guestUser));
            setDomainNoticeOpen(true);
            toast.warning(`Domain (${window.location.hostname}) is not authorized in Firebase Console. Switched to Instant Admin Mode for testing.`);
          }
        }
      } else {
        toast.error("Could not sign in with Google: " + (error.message || "Unknown error"));
      }
    }
  };

  const handleSupabaseLogin = async () => {
    if (!supabaseUrl || !supabaseAnonKey) {
      toast.error("Supabase URL and Anon Key are required for Supabase sign-in.");
      return;
    }
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin,
        }
      });
      if (error) throw error;
    } catch (err: any) {
      toast.error("Supabase Sign-In error: " + (err.message || "Unknown error"));
    }
  };

  const handleLogout = async () => {
    try {
      if (user?.provider === 'supabase') {
        await supabase.auth.signOut();
      } else if (user?.provider === 'firebase' && auth) {
        await signOut(auth);
      }
      localStorage.removeItem('app_guest_user');
      setUser(null);
      toast.success("Signed out");
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  // Fetch existing data if in edit mode
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const mode = params.get('mode');
    const submissionId = params.get('submissionId');
    const round = params.get('round') || '1';

    if (mode === 'edit' && submissionId) {
      setEditMode(true);
      setCurrentRound(round);
      setExistingSubmissionId(submissionId);
      loadExistingSubmission(submissionId, round);
    }
  }, [modelPool]);

  const loadExistingSubmission = async (id: string, round: string) => {
    setLoadingData(true);
    try {
      console.log(`Loading submission: ${id} for Round ${round}`);
      
      // 1. Try Supabase for Submission
      const { data: sub, error: subErr } = await supabase
        .from('submissions')
        .select('*') // Select all but handle missing gracefully
        .eq('id', id)
        .maybeSingle();
      
      // 2. Try Supabase for Assignments - Fetch all columns to preserve feedback during rounds
      const { data: ass, error: assErr } = await supabase
        .from('assignments')
        .select('*')
        .eq('submission_id', id);

      if (subErr) console.log("Supabase sub fetch error ignored:", subErr.message);
      if (assErr) console.log("Supabase ass fetch error ignored:", assErr.message);

      // Firestore Fallback if any Supabase fetch failed or returned nothing
      let finalSub: any = sub;
      let finalAss: any = ass;

      if (!finalSub) {
        console.log("Firestore fallback for submission...");
        const subDoc = await getDoc(doc(db, 'submissions', id));
        if (subDoc.exists()) {
          const d = subDoc.data();
          finalSub = {
            id: d.id,
            type_of_sample: d.type_of_sample,
            style_number: d.style_number,
            description: d.description,
            series: d.series,
            submitted_by: d.submitted_by
          };
        }
      }

      if (!finalAss || finalAss.length === 0) {
        console.log("Firestore fallback for assignments...");
        const q = query(collection(db, 'assignments'), where('submission_id', '==', id));
        const querySnapshot = await getDocs(q);
        const docs: any[] = [];
        querySnapshot.forEach((doc) => {
          const d = doc.data();
          docs.push({
            id: d.id,
            model_id: d.model_id,
            model_name: d.model_name,
            model_email: d.model_email,
            color: d.color,
            size: d.size,
            given_for_fit_date: d.given_for_fit_date,
            round1: d.round1,
            round2: d.round2,
            round3: d.round3,
            round4: d.round4,
            round5: d.round5
          });
        });
        finalAss = docs;
      }

      // Populate state
      if (finalSub) {
        setTypeOfSample(finalSub.type_of_sample || '');
        setStyleNo(finalSub.style_number || '');
        setDescription(finalSub.description || '');
      }

      if (finalAss && finalAss.length > 0) {
        console.log(`Found ${finalAss.length} assignments for this submission`);
        const mappedAssignments = finalAss.map((a: any) => {
          const r1 = a.round1 || {};
          const r2 = a.round2 || {};
          const r3 = a.round3 || {};
          const r4 = a.round4 || {};
          const r5 = a.round5 || {};
          
          // Use current round color if available, otherwise fallback to main color
          let currentColor = a.color || '';
          if (round === '1') currentColor = r1.color || a.color || '';
          if (round === '2') currentColor = r2.color || a.color || '';
          if (round === '3') currentColor = r3.color || a.color || '';
          if (round === '4') currentColor = r4.color || a.color || '';
          if (round === '5') currentColor = r5.color || a.color || '';

          // Use current round date if available
          let currentDate = a.given_for_fit_date || new Date().toLocaleDateString('en-GB');
          if (round === '1') currentDate = r1.given_for_fit_date || currentDate;
          if (round === '2') currentDate = r2.given_for_fit_date || currentDate;
          if (round === '3') currentDate = r3.given_for_fit_date || currentDate;
          if (round === '4') currentDate = r4.given_for_fit_date || currentDate;
          if (round === '5') currentDate = r5.given_for_fit_date || currentDate;

          // CRITICAL: Ensure model name and email are present. Fallback to modelPool lookup if db record is missing them.
          let mName = a.model_name || '';
          let mEmail = a.model_email || '';
          
          if ((!mName || !mEmail) && a.model_id && modelPool.length > 0) {
            const poolModel = modelPool.find(m => m.id === a.model_id);
            if (poolModel) {
              if (!mName) mName = poolModel.name;
              if (!mEmail) mEmail = poolModel.email;
            }
          }

          // If STILL no name (rare), use a placeholder
          if (!mName) mName = "Assigned Model";

          return {
            id: a.id,
            modelId: a.model_id,
            modelName: mName,
            modelEmail: mEmail,
            color: currentColor,
            size: a.size,
            givenForFitDate: currentDate,
            round1Data: r1,
            round2Data: r2,
            round3Data: r3,
            round4Data: r4,
            round5Data: r5
          };
        });
        
        if (mappedAssignments.length > 0) {
          setAssignments(mappedAssignments);
        }
      } else {
        console.warn("No assignments found for submission ID:", id);
      }
    } catch (err) {
      console.error("Critical error loading existing submission:", err);
      toast.error("Failed to load existing data");
    } finally {
      setLoadingData(false);
    }
  };

  const toggleModelSelection = (model: ModelListItem) => {
    const isSelected = assignments.some(a => a.modelId === model.id);
    if (isSelected) {
      // Find the assignment(s) for this model
      const modelAssignment = assignments.find(a => a.modelId === model.id);
      
      if (editMode && modelAssignment) {
        // Find if this assignment was likely from DB
        // We can check if it's already in the table and not newly added in this session
        // A better way is to check the deletedAssignmentIds tracking
        setDeletedAssignmentIds(prev => [...prev, modelAssignment.id]);
      }

      if (assignments.length > 1) {
        setAssignments(assignments.filter(a => a.modelId !== model.id));
      } else {
        setAssignments(assignments.map(a => 
          a.modelId === model.id ? { ...a, modelId: '', modelName: '', modelEmail: '', color: '', size: '' } : a
        ));
      }
    } else {
      // row.id mark logic: use deterministic ID if we have a submission ID, otherwise a temp uuid
      const aId = existingSubmissionId ? getDeterministicId(existingSubmissionId, model.email) : uuidv4();
      
      const newAssignment: AssignmentRow = { 
        id: aId, 
        modelId: model.id, 
        modelName: model.name, 
        modelEmail: model.email, 
        color: sharedColor, 
        size: sharedSize, 
        givenForFitDate: sharedFitDate,
        round1Data: {},
        round2Data: {},
        round3Data: {},
        round4Data: {},
        round5Data: {}
      };

      // If we are in edit mode, ensure the round data reflects current round
      if (editMode) {
        if (currentRound === '1') newAssignment.round1Data = { color: sharedColor, given_for_fit_date: sharedFitDate };
        if (currentRound === '2') newAssignment.round2Data = { color: sharedColor, given_for_fit_date: sharedFitDate };
        if (currentRound === '3') newAssignment.round3Data = { color: sharedColor, given_for_fit_date: sharedFitDate };
        if (currentRound === '4') newAssignment.round4Data = { color: sharedColor, given_for_fit_date: sharedFitDate };
        if (currentRound === '5') newAssignment.round5Data = { color: sharedColor, given_for_fit_date: sharedFitDate };
      }

      const emptyRowIndex = assignments.findIndex(a => !a.modelId);
      if (emptyRowIndex !== -1) {
        setAssignments(assignments.map((a, idx) => 
          idx === emptyRowIndex ? newAssignment : a
        ));
      } else {
        setAssignments([...assignments, newAssignment]);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Auto-fallback for user if not logged in
    const currentUser = user || {
      email: 'admin@fitcomment.com',
      displayName: 'Admin User',
      provider: 'guest'
    };
    if (!user) {
      setUser(currentUser);
      localStorage.setItem('app_guest_user', JSON.stringify(currentUser));
    }

    if (!typeOfSample || !styleNo || !description) {
      toast.error('Please fill in all basic fields');
      return;
    }

    const validAssignments = assignments.filter(a => a.modelId && a.color && a.size);
    if (validAssignments.length === 0) {
      toast.error('Please add at least one valid model assignment');
      return;
    }

    setSubmitting(true);
    
    const submissionPromise = (async () => {
      let submissionId = existingSubmissionId;
      const series = getSeriesFromStyleNumber(styleNo);

      // Final check for submissionId if we don't have one (e.g. user ignored the toast)
      if (!submissionId) {
        const { data: existingSub } = await supabase
          .from('submissions')
          .select('id')
          .eq('style_number', styleNo.trim())
          .eq('series', series || 'General')
          .maybeSingle();
        
        if (existingSub) {
          submissionId = existingSub.id;
        } else {
          submissionId = uuidv4();
        }
      }

      // Determine the base URL for links
      let appBaseUrl = window.location.origin;
      const envAppUrl = import.meta.env.VITE_APP_URL;
      
      console.log("FormTab: DEBUG - VITE_APP_URL:", envAppUrl);

      // Provide absolute preference to VITE_APP_URL if configured by user
      if (envAppUrl && envAppUrl !== 'undefined' && envAppUrl.length > 5) {
        console.log("FormTab: Using VITE_APP_URL priority:", envAppUrl);
        appBaseUrl = envAppUrl;
      }
      
      if (appBaseUrl.endsWith('/')) {
        appBaseUrl = appBaseUrl.slice(0, -1);
      }
      
      const modelFeedbackBaseUrl = appBaseUrl; 
        
      const userEmail = currentUser?.email || 'admin@fitcomment.com'; 
      const userName = currentUser?.displayName || userEmail;

      const assignmentsWithLinks = validAssignments.map(a => {
        // Ensure the ID is deterministic based on current submission and model email
        // This forces merging in the database and Google Sheets
        const finalAId = getDeterministicId(submissionId!, a.modelEmail);
        
        const r1Link = `${modelFeedbackBaseUrl}/?submissionId=${submissionId}&assignmentId=${finalAId}&round=1`;
        const r2Link = `${modelFeedbackBaseUrl}/?submissionId=${submissionId}&assignmentId=${finalAId}&round=2`;
        const r3Link = `${modelFeedbackBaseUrl}/?submissionId=${submissionId}&assignmentId=${finalAId}&round=3`;
        const r4Link = `${modelFeedbackBaseUrl}/?submissionId=${submissionId}&assignmentId=${finalAId}&round=4`;
        const r5Link = `${modelFeedbackBaseUrl}/?submissionId=${submissionId}&assignmentId=${finalAId}&round=5`;
        return { ...a, id: finalAId, r1Link, r2Link, r3Link, r4Link, r5Link };
      });

      // 0. Save assigned models to Supabase models table
      try {
        const uniqueModelsMap = new Map<string, { id: string; name: string; email: string }>();
        validAssignments.forEach(a => {
          const cleanEmail = a.modelEmail.trim().toLowerCase();
          if (cleanEmail && !uniqueModelsMap.has(cleanEmail)) {
            const genId = (typeof crypto !== 'undefined' && crypto.randomUUID) 
              ? crypto.randomUUID() 
              : 'mod_' + Math.random().toString(36).substring(2, 11);
            uniqueModelsMap.set(cleanEmail, { id: genId, name: a.modelName.trim(), email: cleanEmail });
          }
        });
        const uniqueModels = Array.from(uniqueModelsMap.values());
        if (uniqueModels.length > 0) {
          // Attempt upsert with ID, name, email
          const { error: mErr } = await supabase.from('models').upsert(uniqueModels, { onConflict: 'email' });
          if (mErr) {
            console.warn("Models upsert with ID failed:", mErr.message);
            for (const m of uniqueModels) {
              try {
                const res1 = await supabase.from('models').insert([{ id: m.id, name: m.name, email: m.email }]);
                if (res1.error) {
                  await supabase.from('models').insert([{ name: m.name, email: m.email }]);
                }
              } catch (_) {}
            }
          }
        }
      } catch (mEx) {
        console.warn("Models sync to Supabase skipped:", mEx);
      }

      // 1. Supabase Submission
      await supabase.from('submissions').upsert({
        id: submissionId,
        style_number: styleNo.trim(),
        type_of_sample: typeOfSample,
        description: description,
        series: series || 'General',
        submitted_by: userEmail
      });

      // 1b. Firestore Submission (Backup for ModelResponseView)
      safeFirestoreWrite(async () => {
        await setDoc(doc(db, 'submissions', submissionId), {
          id: submissionId,
          style_number: styleNo.trim(),
          type_of_sample: typeOfSample,
          description: description,
          series: series || 'General',
          submitted_by: userEmail,
          updatedAt: serverTimestamp()
        }, { merge: true });
      });

      // 2. Supabase Assignments
      const assPayload = assignmentsWithLinks.map(a => {
        // Dynamic assignment round specific updates during admin submission
        const r1 = currentRound === '1' ? { ...a.round1Data, color: a.color, given_for_fit_date: a.givenForFitDate } : a.round1Data;
        const r2 = currentRound === '2' ? { ...a.round2Data, color: a.color, given_for_fit_date: a.givenForFitDate } : a.round2Data;
        const r3 = currentRound === '3' ? { ...a.round3Data, color: a.color, given_for_fit_date: a.givenForFitDate } : a.round3Data;
        const r4 = currentRound === '4' ? { ...a.round4Data, color: a.color, given_for_fit_date: a.givenForFitDate } : a.round4Data;
        const r5 = currentRound === '5' ? { ...a.round5Data, color: a.color, given_for_fit_date: a.givenForFitDate } : a.round5Data;

        return {
          id: a.id,
          submission_id: submissionId,
          model_id: a.modelId,
          model_name: a.modelName,
          model_email: a.modelEmail,
          color: a.color,
          size: a.size,
          r1_link: a.r1Link,
          r2_link: a.r2Link,
          r3_link: a.r3Link,
          r4_link: a.r4Link,
          r5_link: a.r5Link,
          given_for_fit_date: a.givenForFitDate,
          // Preserve and update feedback data per round
          round1: r1 || null,
          round2: r2 || null,
          round3: r3 || null,
          round4: r4 || null,
          round5: r5 || null
        };
      });

      const { error: assError } = await supabase.from('assignments').upsert(assPayload);
      
      if (assError) {
        console.warn("Supabase Assignments batch failed, trying absolute minimal fallback:", assError);
        // Absolute minimal fallback - only core columns that likely exist
        const minimalAss = assignmentsWithLinks.map(a => ({
            id: a.id,
            submission_id: submissionId,
            model_name: a.modelName,
            model_email: a.modelEmail,
            color: a.color,
            size: a.size
        }));
        const { error: minErr } = await supabase.from('assignments').upsert(minimalAss);
        if (minErr) console.error("Critical: Minimal Supabase fallback also failed:", minErr);
      }

      // 2b. Firestore Assignments (Critical for ModelResponseView)
      safeFirestoreWrite(async () => {
        for (const a of assignmentsWithLinks) {
          const r1 = currentRound === '1' ? { ...a.round1Data, color: a.color, given_for_fit_date: a.givenForFitDate } : a.round1Data;
          const r2 = currentRound === '2' ? { ...a.round2Data, color: a.color, given_for_fit_date: a.givenForFitDate } : a.round2Data;
          const r3 = currentRound === '3' ? { ...a.round3Data, color: a.color, given_for_fit_date: a.givenForFitDate } : a.round3Data;
          const r4 = currentRound === '4' ? { ...a.round4Data, color: a.color, given_for_fit_date: a.givenForFitDate } : a.round4Data;
          const r5 = currentRound === '5' ? { ...a.round5Data, color: a.color, given_for_fit_date: a.givenForFitDate } : a.round5Data;

          await setDoc(doc(db, 'assignments', a.id), {
            id: a.id,
            submission_id: submissionId,
            model_id: a.modelId,
            model_name: a.modelName,
            model_email: a.modelEmail,
            color: a.color,
            size: a.size,
            given_for_fit_date: a.givenForFitDate,
            r1_link: a.r1Link,
            r2_link: a.r2Link,
            r3_link: a.r3Link,
            r4_link: a.r4Link,
            r5_link: a.r5Link,
            round1: r1 || null,
            round2: r2 || null,
            round3: r3 || null,
            round4: r4 || null,
            round5: r5 || null,
            last_updated: serverTimestamp()
          }, { merge: true });
        }
      });

      // 2c. Handle Deletions (Supabase & Firestore)
      if (editMode && deletedAssignmentIds.length > 0) {
        console.log("Deleting assignments:", deletedAssignmentIds);
        await supabase.from('assignments').delete().in('id', deletedAssignmentIds);
        // Firestore doesn't have a batch delete tool here but orphans are generally fine for this app
      }

      // 3. Google Sheets Sync
      console.log(`Syncing ${assignmentsWithLinks.length} items to Google Sheets...`);
      const results = await Promise.all(assignmentsWithLinks.map(async (a) => {
        const currentLink = currentRound === '2' ? a.r2Link : (currentRound === '3' ? a.r3Link : (currentRound === '4' ? a.r4Link : (currentRound === '5' ? a.r5Link : a.r1Link)));
        
        const payload = {
          type: editMode ? 'UPDATE_SUBMISSION' : 'NEW_SUBMISSION',
          assignmentId: a.id,
          submissionId: submissionId,
          modelName: a.modelName,
          modelEmail: a.modelEmail,
          email: a.modelEmail,
          recipientEmail: a.modelEmail,
          recipient_email: a.modelEmail,
          recipient: a.modelEmail,
          model_email: a.modelEmail,
          model_name: a.modelName,
          sampleType: typeOfSample,
          styleNo: styleNo.trim(),
          style_number: styleNo.trim(),
          description: description,
          size: a.size,
          color: a.color,
          round: currentRound,
          "B": a.modelName || "",
          "C": typeOfSample || "",
          "D": styleNo.trim() || "",
          "E": description || "",
          "F": a.size || "",
          ...(currentRound === '1' ? { "G": a.color || "", "H": a.givenForFitDate || "" } : {}),
          ...(currentRound === '2' ? { "O": a.color || "", "P": a.givenForFitDate || "" } : {}),
          ...(currentRound === '3' ? { "W": a.color || "", "X": a.givenForFitDate || "" } : {}),
          link: currentLink,
          responseUrl: currentLink,
          tabName: series || "General",
          triggerEmail: true,
          senderEmail: userEmail,
          senderName: userName,
          timestamp: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
          "AX": a.id
        };
        return saveToGoogleSheets(payload);
      }));

      const allSuccess = results.every(r => r.success);

      setLastSubmission({
        id: submissionId,
        assignments: assignmentsWithLinks,
        type: typeOfSample,
        style: styleNo,
        round: currentRound,
        isUpdate: editMode
      });

      if (!editMode) {
        setTypeOfSample('');
        setStyleNo('');
        setDescription('');
        setSharedColor('');
        setSharedSize('');
        setSharedFitDate(new Date().toLocaleDateString('en-GB'));
        setAssignments([]);
      }

      if (!allSuccess) {
        return editMode 
          ? `Round ${currentRound} Updated (But Google Sheets failed to sync - check settings)` 
          : "Form Submitted successfully! (But Google Sheets failed to sync - check settings)";
      }
      
      return editMode ? `Round ${currentRound} Updated!` : "Form Submitted successfully!";
    })();

    toast.promise(submissionPromise, {
      loading: editMode ? `Updating and notifying models for Round ${currentRound}...` : 'Submitting and sending emails...',
      success: (msg) => msg,
      error: (err) => `Error: ${err.message || 'Unknown failure'}`
    });

    try {
      await submissionPromise;
    } catch (e) {
      console.error("Submission failed:", e);
    } finally {
      setSubmitting(false);
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

  if (lastSubmission) {
    const isUpdate = lastSubmission.isUpdate;
    const round = lastSubmission.round;
    
    return (
      <div className="space-y-4 max-w-2xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
        <Card className="overflow-hidden border-t-0 shadow-sm">
          <div className={`h-2.5 ${isUpdate ? 'bg-amber-500' : 'bg-green-500'} w-full`}></div>
          <CardHeader className="pt-6 pb-4">
            <CardTitle className="text-3xl font-normal text-slate-900 tracking-tight">
              {isUpdate ? `Round ${round} Updated!` : 'Submission Successful!'}
            </CardTitle>
            <CardDescription className="text-sm text-slate-600 mt-2">
              {isUpdate 
                ? `The fit request has been updated for Round ${round}. Models have been notified with the new link.`
                : 'Your fit request has been recorded. The models listed below have been notified.'}
            </CardDescription>
          </CardHeader>
        </Card>

        <div className="space-y-4">
          <Card className="shadow-sm">
            <CardContent className="pt-6 space-y-4">
              <h3 className="font-medium text-slate-800 border-b pb-2">Assigned Model Links</h3>
              {lastSubmission.assignments.map((a: any) => (
                <div key={a.id} className="p-4 border rounded-lg bg-slate-50/50 space-y-4">
                  <div className="flex justify-between items-start">
                    <div className="space-y-1">
                      <span className="font-semibold text-slate-900 block">{a.modelName}</span>
                      <p className="text-[10px] text-slate-500">{a.modelEmail}</p>
                    </div>
                    <Badge variant="secondary" className="bg-white border text-[10px] font-bold uppercase">{a.color} • {a.size}</Badge>
                  </div>
                  
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-xs mb-4">
            <p className="font-bold flex items-center gap-1 mb-1">
              <Info className="w-3 h-3" /> Important: 403 Forbidden Error?
            </p>
            <p>If models see a 403 error, make sure you are using the <strong>Shared App URL</strong> (from the Share menu) and not the development URL.</p>
          </div>

          <div className="space-y-4 pt-2 border-t border-slate-200/50">
                    <div className="space-y-1.5">
                      <Label className="text-[10px] text-slate-400 font-bold uppercase">Round 1 (Main Response)</Label>
                      <div className="flex gap-2">
                        <Input readOnly value={a.r1Link} className="text-[10px] bg-white h-8" />
                        <Button size="sm" variant="outline" className="h-8 shrink-0 text-[10px]" onClick={() => window.open(a.r1Link, '_blank')}>Open</Button>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label className="text-[10px] text-slate-400 font-bold uppercase">Round 2 Link</Label>
                        <div className="flex gap-1">
                          <Input readOnly value={a.r2Link} className="text-[9px] bg-white h-7" />
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 shrink-0" onClick={() => { navigator.clipboard.writeText(a.r2Link); toast.success("Copied R2"); }}>📋</Button>
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-[10px] text-slate-400 font-bold uppercase">Round 3 Link</Label>
                        <div className="flex gap-1">
                          <Input readOnly value={a.r3Link} className="text-[9px] bg-white h-7" />
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 shrink-0" onClick={() => { navigator.clipboard.writeText(a.r3Link); toast.success("Copied R3"); }}>📋</Button>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label className="text-[10px] text-slate-400 font-bold uppercase">Round 4 Link</Label>
                        <div className="flex gap-1">
                          <Input readOnly value={a.r4Link} className="text-[9px] bg-white h-7" />
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 shrink-0" onClick={() => { navigator.clipboard.writeText(a.r4Link); toast.success("Copied R4"); }}>📋</Button>
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-[10px] text-slate-400 font-bold uppercase">Round 5 Link</Label>
                        <div className="flex gap-1">
                          <Input readOnly value={a.r5Link} className="text-[9px] bg-white h-7" />
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 shrink-0" onClick={() => { navigator.clipboard.writeText(a.r5Link); toast.success("Copied R5"); }}>📋</Button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <div className="flex justify-start gap-4">
            <Button variant="ghost" className="text-primary" onClick={() => setLastSubmission(null)}>
              Submit another response
            </Button>
            {Number(lastSubmission.round) < 5 && (
              <Button variant="outline" className="text-slate-600 border-slate-200" onClick={() => {
                const nextRound = String(Number(lastSubmission.round) + 1);
                window.location.search = `?mode=edit&submissionId=${lastSubmission.id}&round=${nextRound}`;
              }}>
                Initiate Round {Number(lastSubmission.round) + 1}
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-full mx-auto pb-10">
      {editMode && (
        <div className="space-y-4">
          <Card className="bg-primary/5 border-primary/20 shadow-sm overflow-hidden">
            <div className="h-1 bg-primary w-full"></div>
            <CardContent className="pt-6 pb-4">
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div>
                  <h3 className="text-lg font-semibold text-primary flex items-center gap-2">
                    <RefreshCw className="w-5 h-5" />
                    Round Selection
                  </h3>
                  <p className="text-xs text-slate-500">Initiating a new round will generate a fresh response link for the model.</p>
                </div>
                <div className="flex gap-2 bg-white p-1 rounded-lg border shadow-sm self-stretch md:self-auto overflow-x-auto">
                  {['1', '2', '3', '4', '5'].map((r) => (
                    <Button 
                      key={r}
                      type="button"
                      variant={currentRound === r ? 'default' : 'ghost'}
                      size="sm"
                      onClick={() => {
                        setCurrentRound(r);
                        // Update URL without reload to keep experience smooth, but FormTab's mount logic might not trigger
                        // since we use key={window.location.search} in App.tsx, we SHOULD update search params
                        const url = new URL(window.location.href);
                        url.searchParams.set('round', r);
                        window.history.pushState({}, '', url);
                        
                        // Manually trigger reload for the new round
                        if (existingSubmissionId) {
                          loadExistingSubmission(existingSubmissionId, r);
                        }
                      }}
                      className={`flex-1 md:w-20 rounded-md transition-all ${currentRound === r ? 'shadow-md' : ''}`}
                    >
                      Round {r}
                    </Button>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-amber-50 border-amber-200">
            <CardContent className="py-2 flex items-center justify-between">
              <p className="text-xs font-medium text-amber-800">
                <Badge variant="outline" className="mr-2 bg-amber-100 border-amber-300 uppercase">EDIT MODE</Badge>
                Updating Style <strong>{styleNo}</strong>. Submit to record data and notify models.
              </p>
              <Button variant="ghost" size="sm" onClick={() => {
                window.history.pushState({}, '', window.location.origin);
                setEditMode(false);
                setCurrentRound('1');
                setTypeOfSample('');
                setStyleNo('');
                setDescription('');
                setSharedColor('');
                setSharedSize('');
                setSharedFitDate(new Date().toLocaleDateString('en-GB'));
                setAssignments([]);
              }} className="text-amber-700 hover:bg-amber-100">Cancel</Button>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Auth Section */}
      <Card className="shadow-sm border-primary/20 bg-primary/5">
        <CardContent className="py-4 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {user ? (
              <>
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                  {user.displayName?.[0] || user.email?.[0] || 'U'}
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-900">Signed in as {user.displayName || 'Authorized Admin'}</p>
                  <p className="text-[10px] text-slate-500">Notifications will be sent using: {user.email}</p>
                </div>
              </>
            ) : (
              <>
                <div className="h-10 w-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
                  <Info className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-900">Admin Authentication</p>
                  <p className="text-[10px] text-slate-500">Sign in to send notifications from your name and track your submissions.</p>
                </div>
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            {!user && (
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => setDomainNoticeOpen(!domainNoticeOpen)} 
                className="h-8 text-xs text-slate-600 hover:bg-slate-200/50 gap-1"
                title="Domain Authorization Info"
              >
                <HelpCircle className="w-3.5 h-3.5" />
                <span>Domain Info</span>
              </Button>
            )}
            {user ? (
              <Button variant="outline" size="sm" onClick={handleLogout} className="h-8 text-[11px]">Sign Out</Button>
            ) : (
              <div className="flex items-center gap-2">
                <Button onClick={handleLogin} size="sm" className="h-9 px-3 font-medium text-xs">
                  Sign in with Google
                </Button>
                {supabaseUrl && supabaseAnonKey && (
                  <Button onClick={handleSupabaseLogin} variant="outline" size="sm" className="h-9 px-3 text-xs">
                    Via Supabase
                  </Button>
                )}
                <Button onClick={() => setDomainNoticeOpen(!domainNoticeOpen)} variant="secondary" size="sm" className="h-9 px-3 text-xs">
                  Quick Sign In
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Domain Authorization Guide & Quick Sign In */}
      {domainNoticeOpen && (
        <Card className="border-amber-300 bg-amber-50/90 text-amber-950 shadow-md transition-all animate-in fade-in slide-in-from-top-2">
          <CardHeader className="pb-2 pt-4 flex flex-row items-center justify-between">
            <div className="flex items-center gap-2 font-medium text-sm text-amber-900">
              <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0" />
              <span>Admin Sign In & Domain Authorization</span>
            </div>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => setDomainNoticeOpen(false)}
              className="h-6 w-6 p-0 text-amber-800 hover:bg-amber-200/60 rounded-full"
            >
              ✕
            </Button>
          </CardHeader>
          <CardContent className="space-y-4 text-xs text-slate-700">
            {/* Quick Email Sign-In Option */}
            <div className="bg-white p-3.5 rounded-lg border border-amber-200 shadow-2xs space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-900 text-xs flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-primary" /> Instant Admin Sign In (No Setup Required)
                </span>
                <span className="text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-medium">Recommended</span>
              </div>
              <p className="text-[11px] text-slate-600 leading-normal">
                Enter your admin email below to sign in instantly and start submitting fit comments without needing to whitelist this sandbox domain in Google Firebase Console.
              </p>
              <form onSubmit={handleQuickSignIn} className="flex flex-col sm:flex-row gap-2 pt-1">
                <Input
                  type="email"
                  placeholder="admin@example.com"
                  value={guestEmailInput}
                  onChange={(e) => setGuestEmailInput(e.target.value)}
                  className="h-8 text-xs bg-slate-50 border-slate-300 flex-1"
                  required
                />
                <Input
                  type="text"
                  placeholder="Display Name"
                  value={guestNameInput}
                  onChange={(e) => setGuestNameInput(e.target.value)}
                  className="h-8 text-xs bg-slate-50 border-slate-300 w-full sm:w-32"
                />
                <Button type="submit" size="sm" className="h-8 text-xs px-4 shrink-0 font-medium bg-emerald-600 hover:bg-emerald-700 text-white">
                  Continue as Admin
                </Button>
              </form>
            </div>

            <div className="border-t border-amber-200/80 pt-3 space-y-2">
              <p className="leading-relaxed text-[11px] font-medium text-amber-900">
                Or enable Google OAuth popup sign-in by adding this current app domain to authorized origins:
              </p>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2.5 bg-white border border-amber-200 rounded-lg shadow-2xs font-mono text-slate-800">
                <div className="flex items-center gap-2 min-w-0">
                  <Globe className="w-4 h-4 text-slate-500 shrink-0" />
                  <span className="truncate font-semibold text-xs">{typeof window !== 'undefined' ? window.location.hostname : ''}</span>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs gap-1.5 border-amber-300 bg-amber-50 hover:bg-amber-100 shrink-0"
                  onClick={() => {
                    if (typeof window !== 'undefined') {
                      navigator.clipboard.writeText(window.location.hostname);
                      toast.success("Domain copied: " + window.location.hostname);
                    }
                  }}
                >
                  <Copy className="w-3.5 h-3.5 text-amber-700" />
                  <span>Copy Domain</span>
                </Button>
              </div>
              <div className="grid sm:grid-cols-2 gap-3 text-[11px] text-slate-600 pt-1">
                <div className="bg-amber-100/50 p-2.5 rounded-md space-y-1">
                  <p className="font-semibold text-slate-800">Option 1: Firebase Console</p>
                  <ol className="list-decimal list-inside space-y-0.5">
                    <li>Open <a href="https://console.firebase.google.com/project/fit-comment-soie/authentication/settings" target="_blank" rel="noopener noreferrer" className="underline font-semibold text-primary hover:text-primary/80 inline-flex items-center gap-0.5">Firebase Console <ExternalLink className="w-3 h-3" /></a></li>
                    <li>Go to <strong>Authentication → Settings → Authorized Domains</strong></li>
                    <li>Click <strong>Add domain</strong> and paste <code>{typeof window !== 'undefined' ? window.location.hostname : ''}</code></li>
                  </ol>
                </div>
                <div className="bg-amber-100/50 p-2.5 rounded-md space-y-1">
                  <p className="font-semibold text-slate-800">Option 2: Supabase Auth</p>
                  <ol className="list-decimal list-inside space-y-0.5">
                    <li>Open your <a href="https://supabase.com/dashboard" target="_blank" rel="noopener noreferrer" className="underline font-semibold text-primary hover:text-primary/80 inline-flex items-center gap-0.5">Supabase Dashboard <ExternalLink className="w-3 h-3" /></a></li>
                    <li>Go to <strong>Authentication → URL Configuration</strong></li>
                    <li>Add <code>{typeof window !== 'undefined' ? window.location.origin : ''}</code> to <strong>Redirect URLs</strong></li>
                  </ol>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <form onSubmit={handleSubmit} className="space-y-4 relative">
        {loadingData && (
          <div className="absolute inset-0 z-50 bg-white/60 backdrop-blur-[1px] flex flex-col items-center justify-center rounded-xl min-h-[400px]">
            <Loader2 className="w-10 h-10 animate-spin text-primary mb-4" />
            <p className="text-slate-600 font-medium animate-pulse">Loading previous round data...</p>
          </div>
        )}
        {/* Sample Type Card - Hidden in Edit Mode for focus */}
        {!editMode && (
          <Card className="shadow-sm">
            <CardContent className="pt-6">
              <div className="space-y-4">
                <Label className="text-base font-normal text-slate-900">
                  Type of Sample <span className="text-destructive ml-0.5">*</span>
                </Label>
                <Input 
                  placeholder="e.g. Proto / Fit / PPS" 
                  value={typeOfSample} 
                  onChange={e => setTypeOfSample(e.target.value)}
                  className="border-0 border-b border-slate-200 rounded-none px-0 focus-visible:ring-0 focus-visible:border-primary transition-all bg-transparent h-10 text-base shadow-none"
                  required
                />
              </div>
            </CardContent>
          </Card>
        )}

        {/* Style No Card - Read only in Edit Mode */}
        <Card className="shadow-sm">
          <CardContent className="pt-6">
            <div className="space-y-4">
              <Label className="text-base font-normal text-slate-900">
                Style Number <span className="text-destructive ml-0.5">*</span>
              </Label>
              <Input 
                placeholder="e.g. AT-101, LW-101, NT-101" 
                value={styleNo} 
                onChange={e => setStyleNo(e.target.value)}
                readOnly={editMode}
                className={`border-0 border-b border-slate-200 rounded-none px-0 focus-visible:ring-0 focus-visible:border-primary transition-all bg-transparent h-10 text-base shadow-none ${editMode ? 'opacity-70 font-semibold' : ''}`}
                required
              />
              {styleNo && !editMode && (
                <p className="text-[10px] text-slate-400 italic mt-1">
                  Will be saved in Sheet Tab: <span className="text-primary font-medium">{getSeriesFromStyleNumber(styleNo) || "General"}</span>
                </p>
              )}
            </div>
          </CardContent>
        </Card>

      {/* Assignment Section - Show model selector always */}
      <div className="space-y-4 pt-2">
        <Card className="shadow-sm border-dashed border-2 bg-slate-50/30">
          <CardHeader className="py-4 px-6 pb-2">
            <CardTitle className="text-sm font-medium text-slate-700 flex items-center gap-2">
              <User className="w-4 h-4 text-primary" />
              {editMode ? `Add Models for Round ${currentRound}` : 'Select Models for Assignment'}
            </CardTitle>
            <CardDescription className="text-[10px]">
              {editMode 
                ? "Switch models on or off. Adding new models will create a fresh entry for them starting from this round."
                : "Click models to add or remove them from this request."}
            </CardDescription>
          </CardHeader>
          <CardContent className="px-6 pb-6 pt-2">
            {loadingModels ? (
              <div className="flex items-center gap-2 py-2">
                <Loader2 className="w-3 h-3 animate-spin text-slate-400" />
                <span className="text-[10px] text-slate-400 font-medium">Fetching model pool...</span>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {modelPool.map(model => {
                  const isSelected = assignments.some(a => a.modelId === model.id);
                  return (
                    <button
                      key={model.id}
                      type="button"
                      onClick={() => toggleModelSelection(model)}
                      className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all border flex items-center gap-1.5 ${
                        isSelected 
                          ? 'bg-indigo-600 text-white border-indigo-700 shadow-sm' 
                          : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-400 hover:text-indigo-600'
                      }`}
                    >
                      {model.name}
                      {isSelected && <Plus className="w-3 h-3 rotate-45" />}
                    </button>
                  );
                })}
                {modelPool.length === 0 && (
                  <p className="text-xs text-slate-400 italic">No models available. Add them in the Models Tab.</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

          <div className="flex items-center justify-between px-1">
            <h3 className="text-lg font-medium text-slate-800">
              {editMode ? `Round ${currentRound} Details` : 'Model Details & Assignments'}
            </h3>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="bg-indigo-50 text-indigo-700 border-indigo-200 font-bold">
                {assignments.filter(a => a.modelId).length} Models Assigned
              </Badge>
            </div>
          </div>

          {assignments.length > 0 && (
            <Card className="shadow-sm border-indigo-100 bg-indigo-50/20">
              <CardHeader className="py-4 px-6 border-b border-indigo-50 flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-sm font-semibold text-indigo-800 flex items-center gap-2">
                    <RefreshCw className="w-4 h-4" />
                    Default Details
                  </CardTitle>
                  <CardDescription className="text-[10px] text-indigo-600/70">Used as starting values for new rows. Use "Apply" to update existing ones.</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="px-6 py-6 pt-6">
                <div className="grid gap-6 md:grid-cols-3">
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <Label className="text-[10px] uppercase tracking-wider font-bold text-slate-500">Default Date</Label>
                      <button 
                        type="button" 
                        onClick={() => setAssignments(prev => prev.map(a => ({ ...a, givenForFitDate: sharedFitDate })))}
                        className="text-[9px] font-bold text-indigo-600 hover:underline"
                      >
                        Apply to All
                      </button>
                    </div>
                    <Input 
                      placeholder="DD/MM/YYYY" 
                      value={sharedFitDate} 
                      onChange={e => setSharedFitDate(e.target.value)}
                      className="border-0 border-b border-indigo-200 rounded-none px-0 focus-visible:ring-0 shadow-none focus-visible:border-indigo-600 transition-all h-10 bg-transparent text-base font-medium"
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <Label className="text-[10px] uppercase tracking-wider font-bold text-slate-500">Default Color</Label>
                      <button 
                        type="button" 
                        onClick={() => setAssignments(prev => prev.map(a => ({ ...a, color: sharedColor })))}
                        className="text-[9px] font-bold text-indigo-600 hover:underline"
                      >
                        Apply to All
                      </button>
                    </div>
                    <Input 
                      placeholder="e.g. Navy" 
                      value={sharedColor} 
                      onChange={e => setSharedColor(e.target.value)}
                      className="border-0 border-b border-indigo-200 rounded-none px-0 focus-visible:ring-0 shadow-none focus-visible:border-indigo-600 transition-all h-10 bg-transparent text-base font-medium"
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <Label className="text-[10px] uppercase tracking-wider font-bold text-slate-500">Default Size</Label>
                      <button 
                        type="button" 
                        onClick={() => setAssignments(prev => prev.map(a => ({ ...a, size: sharedSize })))}
                        className="text-[9px] font-bold text-indigo-600 hover:underline"
                      >
                        Apply to All
                      </button>
                    </div>
                    <Input 
                      placeholder="e.g. Medium" 
                      value={sharedSize} 
                      onChange={e => setSharedSize(e.target.value)}
                      className="border-0 border-b border-indigo-200 rounded-none px-0 focus-visible:ring-0 shadow-none focus-visible:border-indigo-600 transition-all h-10 bg-transparent text-base font-medium"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="space-y-3">
            {assignments.length > 0 ? (
              <Card className="shadow-sm border-slate-200 overflow-hidden">
                <Table>
                  <TableHeader className="bg-slate-50/50">
                    <TableRow>
                      <TableHead className="font-bold text-[10px] uppercase tracking-wider text-slate-500 py-3 pl-6">Model Info</TableHead>
                      <TableHead className="font-bold text-[10px] uppercase tracking-wider text-slate-500 py-3">
                        {editMode ? "Date Given" : "Date"}
                      </TableHead>
                      <TableHead className="font-bold text-[10px] uppercase tracking-wider text-slate-500 py-3">
                        {editMode ? `Round ${currentRound} Color` : "Color"}
                      </TableHead>
                      <TableHead className="font-bold text-[10px] uppercase tracking-wider text-slate-500 py-3">Size</TableHead>
                      {!editMode && <TableHead className="w-10 py-3"></TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {assignments.map((row) => (
                      <TableRow key={row.id} className={`${!row.modelId ? 'hidden' : ''} hover:bg-slate-50/30 transition-colors`}>
                        <TableCell className="py-4 pl-6">
                          <div className="flex flex-col">
                            <span className="font-bold text-slate-900">{row.modelName || 'Unknown Model'}</span>
                            <span className="text-[10px] text-slate-400">{row.modelEmail}</span>
                          </div>
                        </TableCell>
                        <TableCell className="py-4">
                          <Input 
                            value={row.givenForFitDate} 
                            onChange={e => {
                              const newAss = assignments.map(a => a.id === row.id ? { ...a, givenForFitDate: e.target.value } : a);
                              setAssignments(newAss);
                            }}
                            className="border-0 border-b border-slate-100 rounded-none px-0 focus-visible:ring-0 shadow-none focus-visible:border-indigo-500 h-8 bg-transparent text-sm w-32"
                          />
                        </TableCell>
                        <TableCell className="py-4">
                          <div className="space-y-1">
                            <Input 
                              value={row.color} 
                              onChange={e => {
                                const newAss = assignments.map(a => a.id === row.id ? { ...a, color: e.target.value } : a);
                                setAssignments(newAss);
                              }}
                              className="border-0 border-b border-indigo-200 rounded-none px-0 focus-visible:ring-0 shadow-none focus-visible:border-indigo-500 h-8 bg-transparent text-sm font-bold text-slate-900 w-32"
                            />
                            {editMode && currentRound !== '1' && row.round1Data?.color && (
                              <p className="text-[9px] text-slate-400 italic">R1: {row.round1Data.color}</p>
                            )}
                            {editMode && currentRound === '3' && row.round2Data?.color && (
                              <p className="text-[9px] text-slate-400 italic">R2: {row.round2Data.color}</p>
                            )}
                            {editMode && currentRound === '4' && row.round3Data?.color && (
                              <p className="text-[9px] text-slate-400 italic">R3: {row.round3Data.color}</p>
                            )}
                            {editMode && currentRound === '5' && row.round4Data?.color && (
                              <p className="text-[9px] text-slate-400 italic">R4: {row.round4Data.color}</p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="py-4">
                          <Input 
                            value={row.size} 
                            onChange={e => {
                              const newAss = assignments.map(a => a.id === row.id ? { ...a, size: e.target.value } : a);
                              setAssignments(newAss);
                            }}
                            className="border-0 border-b border-indigo-200 rounded-none px-0 focus-visible:ring-0 shadow-none focus-visible:border-indigo-500 h-8 bg-transparent text-sm font-bold text-slate-900 w-24"
                          />
                        </TableCell>
                      <TableCell className="py-4 pr-4 text-right">
                        <Button 
                          type="button" 
                          variant="ghost" 
                          size="icon"
                          onClick={() => {
                            const model = modelPool.find(m => m.id === row.modelId);
                            if (model) toggleModelSelection(model);
                          }}
                          className="h-8 w-8 text-slate-300 hover:text-destructive"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            ) : (
              <div className="text-center py-8 border-2 border-dashed rounded-xl bg-slate-50/50">
                <User className="w-8 h-8 text-slate-200 mx-auto mb-2" />
                <p className="text-xs text-slate-400">Please select models above to begin assignment.</p>
              </div>
            )}
          </div>
        </div>

        {/* Description Card */}
        <Card className={`shadow-sm ${editMode ? 'border-primary/20' : ''}`}>
          <CardContent className="pt-6">
            <div className="space-y-4">
              <Label className="text-base font-normal text-slate-900">
                Instructions / Description <span className="text-destructive ml-0.5">*</span>
              </Label>
              <textarea 
                rows={3}
                placeholder="Enter specific instructions or details..."
                className="w-full border-0 border-b border-slate-200 rounded-none px-0 focus-visible:outline-none focus-visible:border-primary transition-all bg-transparent text-base resize-none py-2"
                value={description}
                onChange={e => setDescription(e.target.value)}
                required
              />
            </div>
          </CardContent>
        </Card>

        {/* Action Buttons */}
        <div className="flex justify-between items-center pt-8 px-1 overflow-hidden">
          {!editMode ? (
            showConfirmClear ? (
              <div className="flex items-center gap-2">
                <Button 
                  type="button" 
                  variant="destructive" 
                  size="sm"
                  onClick={() => {
                    setTypeOfSample('');
                    setStyleNo('');
                    setDescription('');
                    setSharedColor('');
                    setSharedSize('');
                    setSharedFitDate(new Date().toLocaleDateString('en-GB'));
                    setAssignments([]);
                    setShowConfirmClear(false);
                  }}
                  className="h-9 px-3 text-xs"
                >
                  Confirm Clear
                </Button>
                <Button 
                  type="button" 
                  variant="ghost" 
                  size="sm"
                  onClick={() => setShowConfirmClear(false)}
                  className="h-9 px-3 text-xs text-slate-500 hover:text-slate-700"
                >
                  Cancel
                </Button>
              </div>
            ) : (
              <Button 
                type="button" 
                variant="ghost" 
                onClick={() => {
                  setShowConfirmClear(true);
                  // Auto reset after 4s
                  setTimeout(() => setShowConfirmClear(false), 4000);
                }}
                className="text-slate-500 hover:text-slate-700 hover:bg-slate-100/50"
              >
                Clear form
              </Button>
            )
          ) : <div />}

          <Button type="submit" size="lg" className="px-8 h-10 font-medium" disabled={submitting}>
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                {editMode ? 'Updating...' : 'Submitting...'}
              </>
            ) : (
              editMode ? `Submit Round ${currentRound} & Notify Model` : 'Submit'
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
