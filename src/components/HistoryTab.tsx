import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { db } from '../lib/firebase';
import { collection, query, where, getDocs, orderBy, limit } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Button } from './ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Loader2, Search, ExternalLink, RefreshCw, Calendar, User, Tag, Plus } from 'lucide-react';
import { Input } from './ui/input';
import { Badge } from './ui/badge';
import { toast } from 'sonner';

interface Submission {
  id: string;
  style_number: string;
  type_of_sample: string;
  description: string;
  series: string;
  created_at: string;
  submitted_by: string;
  assignments?: { 
    id: string;
    model_name: string;
    model_email: string;
    color: string;
    size: string;
    round1?: any;
    round2?: any;
    round3?: any;
    round4?: any;
    round5?: any;
  }[];
}

interface HistoryTabProps {
  onEdit: (submissionId: string, round: string) => void;
}

export function HistoryTab({ onEdit }: HistoryTabProps) {
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [supabaseFailed, setSupabaseFailed] = useState(false);

  const getRoundDate = (assignment: any, round: string) => {
    const rData = assignment[`round${round}`];
    if (rData && rData.given_for_fit_date) return rData.given_for_fit_date;
    return '-';
  };

  const getRoundColor = (assignment: any, round: string) => {
    const rData = assignment[`round${round}`];
    if (rData && rData.color) return rData.color;
    // Fallback to base color for round 1 if round1 object doesn't have it
    if (round === '1') return assignment.color || '-';
    return '-';
  };

  const fetchSubmissions = async () => {
    setLoading(true);
    setSupabaseFailed(false);
    try {
      // Try Supabase first with join for assignments
      const { data, error } = await supabase
        .from('submissions')
        .select(`
          *,
          assignments(id, model_name, model_email, color, size, round1, round2, round3, round4, round5)
        `)
        .order('created_at', { ascending: false });

      if (error) {
        console.warn("Supabase fetch in history failed, falling back to Firestore:", error.message);
        setSupabaseFailed(true);
        throw error;
      }

      if (data) {
        setSubmissions(data as any);
        setSupabaseFailed(false);
      }
    } catch (err) {
      setSupabaseFailed(true);
      // Defer-loaded, resilient chunked Firestore fallback
      try {
        let querySnapshot;
        try {
          const q = query(
            collection(db, 'submissions'),
            orderBy('updatedAt', 'desc'),
            limit(100)
          );
          querySnapshot = await getDocs(q);
        } catch (orderErr) {
          console.warn("Firestore ordered history query failed, trying simple query:", orderErr);
          // Fallback to simpler query without orderBy to ensure results are retrieved even without indices
          const qSimple = query(
            collection(db, 'submissions'),
            limit(100)
          );
          querySnapshot = await getDocs(qSimple);
        }

        const submissionIds = querySnapshot.docs.map(docSnapshot => {
          const d = docSnapshot.data();
          return d.id || docSnapshot.id;
        });

        // 1. Fetch assignments in chunks of 30 using Firestore 'in' operator instead of doing N separate queries
        const allAssignments: any[] = [];
        const chunkSize = 30;
        
        for (let i = 0; i < submissionIds.length; i += chunkSize) {
          const chunk = submissionIds.slice(i, i + chunkSize);
          if (chunk.length === 0) continue;
          
          try {
            const assQ = query(
              collection(db, 'assignments'),
              where('submission_id', 'in', chunk)
            );
            const assSnap = await getDocs(assQ);
            assSnap.forEach(assDoc => {
              const ad = assDoc.data();
              allAssignments.push({
                id: assDoc.id || ad.id,
                submission_id: ad.submission_id || ad.submissionId || '',
                model_name: ad.model_name || ad.modelName || '',
                model_email: ad.model_email || ad.modelEmail || '',
                color: ad.color || '',
                size: ad.size || '',
                round1: ad.round1 || ad.round1Data || null,
                round2: ad.round2 || ad.round2Data || null,
                round3: ad.round3 || ad.round3Data || null,
                round4: ad.round4 || ad.round4Data || null,
                round5: ad.round5 || ad.round5Data || null
              });
            });
          } catch (chunkErr) {
            console.error("Failed to fetch assignment chunk:", chunkErr);
          }
        }

        // 2. Correlate submissions with their loaded assignments in memory
        const docs: Submission[] = querySnapshot.docs.map((docSnapshot) => {
          const d = docSnapshot.data();
          const subId = d.id || docSnapshot.id;
          
          // Match pre-fetched assignments for this submission
          const assList = allAssignments.filter(a => a.submission_id === subId);

          let formattedCreatedAt = new Date().toISOString();
          if (d.updatedAt) {
            try {
              formattedCreatedAt = d.updatedAt.toDate().toISOString();
            } catch (_) {
              if (d.updatedAt.seconds) {
                formattedCreatedAt = new Date(d.updatedAt.seconds * 1000).toISOString();
              } else {
                formattedCreatedAt = new Date(d.updatedAt).toISOString();
              }
            }
          } else if (d.createdAt) {
            try {
              formattedCreatedAt = d.createdAt.toDate().toISOString();
            } catch (_) {
              if (d.createdAt.seconds) {
                formattedCreatedAt = new Date(d.createdAt.seconds * 1000).toISOString();
              } else {
                formattedCreatedAt = new Date(d.createdAt).toISOString();
              }
            }
          }

          return {
            id: subId,
            style_number: d.style_number || d.styleNo || '',
            type_of_sample: d.type_of_sample || '',
            description: d.description || '',
            series: d.series || '',
            created_at: formattedCreatedAt,
            submitted_by: d.submitted_by || 'Unknown',
            assignments: assList
          };
        });

        // Sort in-memory to preserve chrono order if ordered query fell back
        docs.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

        setSubmissions(docs);
      } catch (fErr) {
        console.error("Firestore history fallback also failed:", fErr);
        toast.error("Failed to load submission history");
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchSubmissions();
  }, []);

  const filteredSubmissions = submissions.filter(s => 
    s.style_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.series?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleRefresh = () => {
    setRefreshing(true);
    fetchSubmissions();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Submission History</h2>
          <p className="text-sm text-slate-500">View and manage previous sample fit requests</p>
        </div>
        <div className="flex w-full md:w-auto gap-2">
          <div className="relative flex-1 md:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input 
              placeholder="Search style or series..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          <Button variant="outline" size="icon" onClick={handleRefresh} disabled={refreshing}>
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {supabaseFailed && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-sm space-y-2 shadow-sm">
          <div className="flex items-center gap-2 font-semibold text-amber-900">
            <span className="text-base">⚠️</span>
            <span>Primary Supabase Server Offline / डेटाबेस ऑफलाइन है</span>
          </div>
          <p className="leading-relaxed text-amber-800">
            Your primary database connection (Supabase) is currently unreachable. This usually means your free-tier Supabase project has been <strong>automatically paused</strong> due to a period of inactivity.
          </p>
          <div className="text-xs bg-white/60 p-2.5 rounded border border-amber-200/60 leading-relaxed text-amber-900">
            <strong className="block text-amber-950 mb-1">How to fix / इसे कैसे ठीक करें:</strong>
            <ol className="list-decimal pl-4 space-y-1">
              <li>Log in to your <a href="https://supabase.com/dashboard" target="_blank" rel="noopener noreferrer" className="underline font-semibold hover:text-amber-700">Supabase Dashboard ↗</a>.</li>
              <li>Find the project <code className="bg-amber-100/80 px-1 py-0.5 rounded font-mono text-[11px] border border-amber-200">xbksjtiqcwokbhuplcep</code>.</li>
              <li>Click the <strong>"Restore Project"</strong> button to bring your database back online. Once restored, please refresh this app.</li>
            </ol>
          </div>
          <p className="text-[11px] text-amber-700/80 italic pt-1">
            Note: The application has automatically switched to your backup Firestore database, but old submissions will remain hidden until you unpause Supabase.
          </p>
        </div>
      )}

      <Card className="border-0 shadow-sm overflow-hidden">
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center p-12">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : filteredSubmissions.length === 0 ? (
            <div className="p-12 text-center">
              <p className="text-slate-400 italic">No submissions found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-slate-50">
                  <TableRow>
                    <TableHead className="font-bold py-4">Style No</TableHead>
                    <TableHead className="font-bold">Models</TableHead>
                    <TableHead className="font-bold">Details</TableHead>
                    <TableHead className="font-bold">Created</TableHead>
                    <TableHead className="font-bold">Series</TableHead>
                    <TableHead className="text-right font-bold pr-6">Manage</TableHead>
                  </TableRow>
                </TableHeader>
                  <TableBody>
                    {filteredSubmissions.map((sub) => (
                      <React.Fragment key={sub.id}>
                        <TableRow className="hover:bg-slate-50/50 cursor-pointer" onClick={() => setExpandedId(expandedId === sub.id ? null : sub.id)}>
                          <TableCell className="font-mono font-medium py-4">
                            <div className="flex items-center gap-2">
                              <Button variant="ghost" size="icon" className="h-6 w-6 p-0">
                                <Plus className={`w-3 h-3 transition-transform ${expandedId === sub.id ? 'rotate-45' : ''}`} />
                              </Button>
                              {sub.style_number}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1 max-w-[200px]">
                              {sub.assignments && sub.assignments.length > 0 ? (
                                sub.assignments.map((a, idx) => (
                                  <Badge key={idx} variant="outline" className="text-[9px] px-1 py-0 bg-indigo-50 border-indigo-100 text-indigo-700">
                                    {a.model_name}
                                  </Badge>
                                ))
                              ) : (
                                <span className="text-[10px] text-slate-400">No models</span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col">
                              <span className="text-sm text-slate-900 font-medium">{sub.type_of_sample}</span>
                              <span className="text-xs text-slate-500 line-clamp-1">{sub.description}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1.5 text-xs text-slate-500">
                              <Calendar className="w-3 h-3" />
                              {new Date(sub.created_at).toLocaleDateString('en-GB')}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary" className="text-[10px] uppercase font-bold px-2 py-0">
                              {sub.series}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right pr-6">
                            <div className="flex justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                              <Button 
                                variant="outline" 
                                size="sm" 
                                className="h-8 text-[11px] border-amber-200 text-amber-700 hover:bg-amber-50 hover:text-amber-800"
                                onClick={() => onEdit(sub.id, '2')}
                              >
                                Round 2
                              </Button>
                              <Button 
                                variant="outline" 
                                size="sm" 
                                className="h-8 text-[11px] border-indigo-200 text-indigo-700 hover:bg-indigo-50 hover:text-indigo-800"
                                onClick={() => onEdit(sub.id, '3')}
                              >
                                Round 3
                              </Button>
                              <Button 
                                variant="outline" 
                                size="sm" 
                                className="h-8 text-[11px] border-purple-200 text-purple-700 hover:bg-purple-50 hover:text-purple-800"
                                onClick={() => onEdit(sub.id, '4')}
                              >
                                Round 4
                              </Button>
                              <Button 
                                variant="outline" 
                                size="sm" 
                                className="h-8 text-[11px] border-rose-200 text-rose-700 hover:bg-rose-50 hover:text-rose-800"
                                onClick={() => onEdit(sub.id, '5')}
                              >
                                Round 5
                              </Button>
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                className="h-8 w-8 text-slate-400"
                                onClick={() => onEdit(sub.id, '1')}
                              >
                                <ExternalLink className="w-4 h-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>

                        {/* EXPANDABLE DETAILS BOX */}
                        {expandedId === sub.id && (
                          <TableRow className="bg-slate-50/30 border-b-2 border-indigo-50">
                            <TableCell colSpan={6} className="p-4">
                              <Card className="border shadow-none bg-white overflow-hidden">
                                <CardHeader className="py-2 px-4 bg-slate-50/50 border-b">
                                  <CardTitle className="text-[10px] uppercase tracking-wider text-slate-500 font-bold flex items-center gap-2">
                                    <Tag className="w-3 h-3" />
                                    Model Assignment Details (Table Format)
                                  </CardTitle>
                                </CardHeader>
                                <CardContent className="p-0">
                                    <Table className="w-full">
                                      <TableHeader className="bg-slate-50">
                                        <TableRow className="hover:bg-transparent border-b">
                                          <TableHead className="text-[10px] font-bold h-8 border-r min-w-[120px]">Model Name</TableHead>
                                          <TableHead className="text-[10px] font-bold h-8 border-r min-w-[100px]">Email</TableHead>
                                          <TableHead className="text-[10px] font-bold h-8 text-center bg-slate-100/50 border-r min-w-[60px]">Size</TableHead>
                                          <TableHead className="text-[10px] font-bold h-8 text-center text-indigo-700 bg-indigo-50/50 border-r min-w-[90px]">R1 Date</TableHead>
                                          <TableHead className="text-[10px] font-bold h-8 text-center text-indigo-700 bg-indigo-50/50 border-r min-w-[80px]">R1 Color</TableHead>
                                          <TableHead className="text-[10px] font-bold h-8 text-center text-amber-700 bg-amber-50/50 border-r min-w-[90px]">R2 Date</TableHead>
                                          <TableHead className="text-[10px] font-bold h-8 text-center text-amber-700 bg-amber-50/50 border-r min-w-[80px]">R2 Color</TableHead>
                                          <TableHead className="text-[10px] font-bold h-8 text-center text-emerald-700 bg-emerald-50/50 border-r min-w-[90px]">R3 Date</TableHead>
                                          <TableHead className="text-[10px] font-bold h-8 text-center text-emerald-700 bg-emerald-50/50 border-r min-w-[80px]">R3 Color</TableHead>
                                          <TableHead className="text-[10px] font-bold h-8 text-center text-purple-700 bg-purple-50/50 border-r min-w-[90px]">R4 Date</TableHead>
                                          <TableHead className="text-[10px] font-bold h-8 text-center text-purple-700 bg-purple-50/50 border-r min-w-[80px]">R4 Color</TableHead>
                                          <TableHead className="text-[10px] font-bold h-8 text-center text-rose-700 bg-rose-50/50 border-r min-w-[90px]">R5 Date</TableHead>
                                          <TableHead className="text-[10px] font-bold h-8 text-center text-rose-700 bg-rose-50/50 min-w-[80px]">R5 Color</TableHead>
                                        </TableRow>
                                      </TableHeader>
                                      <TableBody>
                                        {sub.assignments?.map((a) => (
                                          <TableRow key={a.id} className="hover:bg-slate-50/50 h-10 border-b last:border-0">
                                            <TableCell className="text-xs py-1.5 font-bold text-slate-900 border-r truncate max-w-[120px]">{a.model_name}</TableCell>
                                            <TableCell className="text-[9px] py-1.5 text-slate-400 border-r truncate max-w-[100px]" title={a.model_email}>{a.model_email}</TableCell>
                                            <TableCell className="text-xs py-1.5 text-center font-bold text-slate-700 bg-slate-50/20 border-r">{a.size}</TableCell>
                                            
                                            {/* ROUND 1 */}
                                            <TableCell className="text-[10px] py-1.5 text-center font-mono bg-indigo-50/5 border-r whitespace-nowrap">{getRoundDate(a, '1')}</TableCell>
                                            <TableCell className="text-[10px] py-1.5 text-center bg-indigo-50/5 border-r truncate max-w-[80px]" title={getRoundColor(a, '1')}>{getRoundColor(a, '1')}</TableCell>
                                            
                                            {/* ROUND 2 */}
                                            <TableCell className="text-[10px] py-1.5 text-center font-mono bg-amber-50/5 border-r whitespace-nowrap">{getRoundDate(a, '2')}</TableCell>
                                            <TableCell className="text-[10px] py-1.5 text-center bg-amber-50/5 border-r truncate max-w-[80px]" title={getRoundColor(a, '2')}>{getRoundColor(a, '2')}</TableCell>
                                            
                                            {/* ROUND 3 */}
                                            <TableCell className="text-[10px] py-1.5 text-center font-mono bg-emerald-50/5 border-r whitespace-nowrap">{getRoundDate(a, '3')}</TableCell>
                                            <TableCell className="text-[10px] py-1.5 text-center bg-emerald-50/5 border-r truncate max-w-[80px]" title={getRoundColor(a, '3')}>{getRoundColor(a, '3')}</TableCell>

                                            {/* ROUND 4 */}
                                            <TableCell className="text-[10px] py-1.5 text-center font-mono bg-purple-50/5 border-r whitespace-nowrap">{getRoundDate(a, '4')}</TableCell>
                                            <TableCell className="text-[10px] py-1.5 text-center bg-purple-50/5 border-r truncate max-w-[80px]" title={getRoundColor(a, '4')}>{getRoundColor(a, '4')}</TableCell>

                                            {/* ROUND 5 */}
                                            <TableCell className="text-[10px] py-1.5 text-center font-mono bg-rose-50/5 border-r whitespace-nowrap">{getRoundDate(a, '5')}</TableCell>
                                            <TableCell className="text-[10px] py-1.5 text-center bg-rose-50/5 truncate max-w-[80px]" title={getRoundColor(a, '5')}>{getRoundColor(a, '5')}</TableCell>
                                          </TableRow>
                                        ))}
                                      </TableBody>
                                    </Table>
                                </CardContent>
                              </Card>
                            </TableCell>
                          </TableRow>
                        )}
                      </React.Fragment>
                    ))}
                  </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
