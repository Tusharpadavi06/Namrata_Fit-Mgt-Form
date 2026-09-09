import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Badge } from "./ui/badge";
import { Card, CardContent } from "./ui/card";
import {
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  ExternalLink,
  Copy,
  Check,
  Settings,
  ShieldAlert,
  Send,
} from "lucide-react";
import {
  getActiveWebhookUrl,
  getActiveSheetId,
  setActiveWebhookUrl,
  setActiveSheetId,
  testGoogleSheetsConnection,
} from "../services/googleSheetsService";
import { FULL_GOOGLE_APPS_SCRIPT_CODE } from "../constants/googleAppsScriptCode";
import { toast } from "sonner";

interface GoogleSheetsModalProps {
  trigger?: React.ReactNode;
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function GoogleSheetsModal({
  trigger,
  isOpen: controlledOpen,
  onOpenChange: setControlledOpen,
}: GoogleSheetsModalProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const isOpen = isControlled ? controlledOpen : internalOpen;
  const setIsOpen = isControlled ? setControlledOpen! : setInternalOpen;

  const [webhookUrl, setWebhookUrl] = useState(getActiveWebhookUrl());
  const [sheetId, setSheetId] = useState(getActiveSheetId());
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    tested: boolean;
    success: boolean;
    status?: number;
    error?: string;
    message?: string;
    instructions?: string[];
  } | null>(null);

  const [copiedScript, setCopiedScript] = useState(false);
  const [activeTab, setActiveTab] = useState<"status" | "config" | "code">("status");

  const runTest = async (overrideUrl?: string, overrideSheet?: string) => {
    setTesting(true);
    try {
      const res = await testGoogleSheetsConnection(
        overrideUrl || webhookUrl,
        overrideSheet || sheetId
      );
      setTestResult({
        tested: true,
        success: res.success,
        status: res.status,
        error: res.error,
        message: res.message,
        instructions: res.instructions,
      });

      if (res.success) {
        toast.success("Google Sheets & Mail webhook connected successfully!");
      } else if (res.status === 401) {
        toast.error("401 Unauthorized: Please change 'Who has access' to 'Anyone' in Apps Script.");
      } else {
        toast.error(res.error || "Connection test failed.");
      }
    } catch (e: any) {
      setTestResult({
        tested: true,
        success: false,
        error: e.message || "Failed to reach Google Apps Script.",
      });
      toast.error("Connection failed");
    } finally {
      setTesting(false);
    }
  };

  // Run test on first open if not tested yet
  useEffect(() => {
    if (isOpen && (!testResult || !testResult.tested)) {
      runTest();
    }
  }, [isOpen]);

  const handleSaveConfig = () => {
    setActiveWebhookUrl(webhookUrl);
    setActiveSheetId(sheetId);
    toast.success("Settings saved to local storage!");
    runTest(webhookUrl, sheetId);
  };

  const copyScriptCode = () => {
    navigator.clipboard.writeText(FULL_GOOGLE_APPS_SCRIPT_CODE);
    setCopiedScript(true);
    toast.success("Complete detailed Apps Script copied to clipboard!");
    setTimeout(() => setCopiedScript(false), 2000);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      {trigger && <DialogTrigger render={<div>{trigger}</div>} />}

      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto p-6 bg-white rounded-xl shadow-xl border border-slate-200">
        <DialogHeader className="border-b pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-100">
                <FileSpreadsheet className="w-5 h-5" />
              </div>
              <div>
                <DialogTitle className="text-lg font-bold text-slate-900">
                  Google Sheets & Mail Integration
                </DialogTitle>
                <DialogDescription className="text-xs text-slate-500">
                  Manage live Google Spreadsheet syncing and automatic model email notifications.
                </DialogDescription>
              </div>
            </div>

            {testResult?.tested && (
              <Badge
                variant={testResult.success ? "default" : "destructive"}
                className={`text-xs px-2.5 py-0.5 font-medium ${
                  testResult.success
                    ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-100"
                    : "bg-rose-100 text-rose-800 hover:bg-rose-100"
                }`}
              >
                {testResult.success ? "Connected" : "Sync Error (401)"}
              </Badge>
            )}
          </div>
        </DialogHeader>

        {/* TAB BUTTONS */}
        <div className="flex border-b border-slate-200 mt-2 gap-4">
          <button
            type="button"
            onClick={() => setActiveTab("status")}
            className={`pb-2 text-xs font-semibold border-b-2 transition-colors ${
              activeTab === "status"
                ? "border-primary text-primary"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            Connection Status
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("config")}
            className={`pb-2 text-xs font-semibold border-b-2 transition-colors ${
              activeTab === "config"
                ? "border-primary text-primary"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            Webhook & Sheet Settings
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("code")}
            className={`pb-2 text-xs font-semibold border-b-2 transition-colors ${
              activeTab === "code"
                ? "border-primary text-primary"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            Apps Script Code
          </button>
        </div>

        {/* TAB 1: STATUS & DIAGNOSTICS */}
        {activeTab === "status" && (
          <div className="space-y-4 py-2">
            {/* 401 ALERT CARD */}
            {testResult?.status === 401 && (
              <div className="rounded-lg border border-amber-300 bg-amber-50/80 p-4 text-amber-950">
                <div className="flex items-start gap-3">
                  <ShieldAlert className="w-6 h-6 text-amber-600 shrink-0 mt-0.5" />
                  <div className="space-y-2">
                    <h4 className="font-bold text-sm text-amber-900">
                      Google Apps Script Error 401: Unauthorized (Kisko Access Hai)
                    </h4>
                    <p className="text-xs text-amber-800 leading-relaxed">
                      Aapka data Google Sheet me save nahi hua aur email nahi gaya kyunki Google Apps Script Web App me <strong>&apos;Who has access&apos;</strong> ko <strong>&apos;Only myself&apos;</strong> chuna gaya hai. Is wajah se Google public access block kar raha hai.
                    </p>
                    <div className="bg-white/90 border border-amber-200 rounded p-3 text-xs space-y-1 text-slate-700">
                      <p className="font-semibold text-amber-900 mb-1">
                        Isko 2 minute me kaise theek karein:
                      </p>
                      <ol className="list-decimal pl-4 space-y-1">
                        <li>
                          Apne Google Sheet me jaayein aur menu me <strong>Extensions &gt; Apps Script</strong> kholein.
                        </li>
                        <li>
                          Upar daayein kone me <strong>Deploy &gt; Manage Deployments</strong> par click karein.
                        </li>
                        <li>
                          Active deployment ke aage bane <strong>Pencil (Edit) icon</strong> par click karein.
                        </li>
                        <li>
                          <strong>Who has access</strong> dropdown me <strong>Anyone</strong> (sabke liye) select karein.
                        </li>
                        <li>
                          <strong>Deploy</strong> button dabayein aur authorization permission allow karein.
                        </li>
                        <li>
                          Yahan wapas aakar neeche <strong>&apos;Test Connection&apos;</strong> button dabayein!
                        </li>
                      </ol>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* SUCCESS CARD */}
            {testResult?.success && (
              <div className="rounded-lg border border-emerald-300 bg-emerald-50/80 p-4 text-emerald-950">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                  <div>
                    <h4 className="font-bold text-sm text-emerald-900">
                      Connection Active &amp; Verified!
                    </h4>
                    <p className="text-xs text-emerald-700 mt-0.5">
                      Google Apps Script Web App responding properly. Data will automatically write to Google Sheets and emails will be sent.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* GENERAL ERROR CARD */}
            {testResult && !testResult.success && testResult.status !== 401 && (
              <div className="rounded-lg border border-rose-300 bg-rose-50/80 p-4 text-rose-950">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-bold text-sm text-rose-900">
                      Connection Failed ({testResult.status || "Network Error"})
                    </h4>
                    <p className="text-xs text-rose-800 mt-0.5">
                      {testResult.error || "Unable to reach the Webhook URL. Please verify the URL in the Settings tab."}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* INFO SUMMARY */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="p-3 bg-slate-50 border rounded-lg">
                <span className="text-slate-400 block font-medium">Active Sheet ID:</span>
                <span className="font-mono text-slate-800 truncate block mt-0.5" title={sheetId}>
                  {sheetId}
                </span>
                <a
                  href={`https://docs.google.com/spreadsheets/d/${sheetId}/edit`}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-flex items-center gap-1 text-[11px] text-primary hover:underline font-medium"
                >
                  Open Google Sheet <ExternalLink className="w-3 h-3" />
                </a>
              </div>

              <div className="p-3 bg-slate-50 border rounded-lg">
                <span className="text-slate-400 block font-medium">Dual-Write Status:</span>
                <span className="text-slate-700 block mt-0.5">
                  1. <strong>Supabase / Local</strong>: Working &amp; Saved
                </span>
                <span className="text-slate-700 block">
                  2. <strong>Google Sheet &amp; Mail</strong>:{" "}
                  {testResult?.success ? (
                    <span className="text-emerald-600 font-bold">Ready</span>
                  ) : (
                    <span className="text-amber-600 font-bold">Pending Permission Fix</span>
                  )}
                </span>
              </div>
            </div>

            {/* ACTION BUTTONS */}
            <div className="flex items-center justify-between pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => runTest()}
                disabled={testing}
                className="gap-2 text-xs"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${testing ? "animate-spin" : ""}`} />
                {testing ? "Testing Connection..." : "Test Connection Now"}
              </Button>

              <Button
                variant="default"
                size="sm"
                onClick={() => setIsOpen(false)}
                className="text-xs"
              >
                Close
              </Button>
            </div>
          </div>
        )}

        {/* TAB 2: CONFIGURATION */}
        {activeTab === "config" && (
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-700">Google Apps Script Web App URL</Label>
              <Input
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                placeholder="https://script.google.com/macros/s/.../exec"
                className="font-mono text-xs"
              />
              <p className="text-[11px] text-slate-400">
                This URL is obtained from Google Apps Script after clicking <strong>Deploy &gt; Manage Deployments</strong>.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-700">Google Sheet ID or Full URL</Label>
              <Input
                value={sheetId}
                onChange={(e) => setSheetId(e.target.value)}
                placeholder="1ItCgnXRothgSUuZA4QdgLu8ElJYRg8ePpQXksvv0P_4"
                className="font-mono text-xs"
              />
              <p className="text-[11px] text-slate-400">
                The spreadsheet where rows will be created and updated.
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setWebhookUrl(getActiveWebhookUrl());
                  setSheetId(getActiveSheetId());
                }}
                className="text-xs"
              >
                Reset
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={handleSaveConfig}
                className="text-xs gap-1.5"
              >
                Save &amp; Test
              </Button>
            </div>
          </div>
        )}

        {/* TAB 3: SCRIPT CODE */}
        {activeTab === "code" && (
          <div className="space-y-3 py-2">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <p className="text-xs font-semibold text-slate-800">
                  Full Detailed Google Apps Script (All 5 Rounds, Columns A-AX, Emails &amp; Sync)
                </p>
                <p className="text-[11px] text-slate-500">
                  Copy this code into your Google Sheet &gt; Extensions &gt; Apps Script editor.
                </p>
              </div>
              <Button
                variant="default"
                size="sm"
                onClick={copyScriptCode}
                className="text-xs gap-1.5 h-8 shrink-0 bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {copiedScript ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copiedScript ? "Copied Full Script!" : "Copy Entire Script (1-Click)"}
              </Button>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5 text-[11px] text-amber-900 space-y-1">
              <p className="font-semibold text-amber-950">⚠️ Important Deployment Steps in Google Apps Script:</p>
              <ol className="list-decimal pl-4 space-y-0.5 text-slate-700">
                <li>Paste this code into <strong>Extensions &gt; Apps Script</strong> and click <strong>Save</strong>.</li>
                <li>Click <strong>Deploy &gt; Manage Deployments</strong>.</li>
                <li>Click the <strong>Pencil (Edit) icon</strong>.</li>
                <li>Under <strong>Version</strong>: select <strong>&apos;New version&apos;</strong> (Very Important! Otherwise old code remains active).</li>
                <li>Under <strong>Who has access</strong>: select <strong>&apos;Anyone&apos;</strong> (otherwise requests get blocked with 401 error).</li>
                <li>Click <strong>Deploy</strong> and approve permissions.</li>
              </ol>
            </div>

            <div className="bg-slate-900 text-slate-100 rounded-lg p-3 font-mono text-[11px] max-h-64 overflow-y-auto whitespace-pre leading-relaxed border border-slate-800">
              {FULL_GOOGLE_APPS_SCRIPT_CODE}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * Clean status button for the top header
 */
export function GoogleSheetsStatusButton() {
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setModalOpen(true)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition-colors shadow-xs"
        title="View Google Sheets & Email Sync Status"
      >
        <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
        <span className="hidden sm:inline">Google Sheet &amp; Mail</span>
        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
      </button>

      <GoogleSheetsModal isOpen={modalOpen} onOpenChange={setModalOpen} />
    </>
  );
}
