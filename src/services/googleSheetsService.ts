/**
 * Service to handle Google Sheets integration & Apps Script email triggers.
 * Connects to Google Apps Script Web App to store fit request & feedback data.
 */

export const DEFAULT_SHEET_ID = "1ItCgnXRothgSUuZA4QdgLu8ElJYRg8ePpQXksvv0P_4";
export const DEFAULT_WEBHOOK_URL = "https://script.google.com/macros/s/AKfycbxmEJxC1zcPMO6SUVQGWXf4n_xOl_ImJmGxl_K7WS1ZWe_u7YikZOo_pDz1Kd-i_4DG/exec";

/**
 * Cleanly extracts a 44-character Google Sheet ID from any full URL or string.
 */
export function extractSheetId(input?: string): string {
  if (!input) return DEFAULT_SHEET_ID;
  const match = input.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (match && match[1]) {
    return match[1];
  }
  const clean = input.trim();
  if (/^[a-zA-Z0-9-_]{20,}$/.test(clean)) {
    return clean;
  }
  return DEFAULT_SHEET_ID;
}

export function getActiveWebhookUrl(): string {
  try {
    const saved = localStorage.getItem("custom_webhook_url");
    if (saved && saved.trim().startsWith("https://script.google.com/")) {
      return saved.trim();
    }
  } catch (_) {}

  const envWebhook = import.meta.env.VITE_GOOGLE_SHEETS_WEBHOOK_URL;
  if (envWebhook && envWebhook.trim().length > 15) {
    return envWebhook.trim();
  }
  return DEFAULT_WEBHOOK_URL;
}

export function setActiveWebhookUrl(url: string) {
  try {
    if (url) {
      localStorage.setItem("custom_webhook_url", url.trim());
    } else {
      localStorage.removeItem("custom_webhook_url");
    }
  } catch (_) {}
}

export function getActiveSheetId(): string {
  try {
    const saved = localStorage.getItem("custom_sheet_id");
    if (saved && saved.trim().length > 5) {
      return extractSheetId(saved.trim());
    }
  } catch (_) {}

  const envSheetId = import.meta.env.VITE_GOOGLE_SHEET_ID;
  if (envSheetId && envSheetId.trim().length > 5) {
    return extractSheetId(envSheetId.trim());
  }
  return DEFAULT_SHEET_ID;
}

export function setActiveSheetId(id: string) {
  try {
    if (id) {
      localStorage.setItem("custom_sheet_id", extractSheetId(id.trim()));
    } else {
      localStorage.removeItem("custom_sheet_id");
    }
  } catch (_) {}
}

export interface SaveResult {
  success: boolean;
  status?: number;
  error?: string;
  isUnauthorized?: boolean;
  result?: string;
}

/**
 * Saves or updates a row in Google Sheets and optionally sends an email via Google Apps Script.
 */
export async function saveToGoogleSheets(data: any): Promise<SaveResult> {
  const webhookUrl = getActiveWebhookUrl();
  const cleanSheetId = getActiveSheetId();
  const fullSheetUrl = `https://docs.google.com/spreadsheets/d/${cleanSheetId}/edit`;

  const payload = {
    ...data,
    webhookUrl: webhookUrl,
    sheetId: cleanSheetId,
    spreadsheetId: cleanSheetId,
    sheet_id: cleanSheetId,
    sheetUrl: fullSheetUrl,
    spreadsheetUrl: fullSheetUrl,
    url: fullSheetUrl,
    timestamp: new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }),
  };

  console.log("[SheetsService] Sending payload to Webhook:", webhookUrl);
  console.log("[SheetsService] Sheet Target ID:", cleanSheetId);

  // 1. Try via Express server proxy FIRST (bypasses browser CORS & gives detailed diagnostics)
  try {
    const apiRes = await fetch("/api/google-sheets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const resJson = await apiRes.json().catch(() => null);

    if (apiRes.ok && resJson && resJson.success) {
      console.log("[SheetsService] Proxy sync successful:", resJson.result);
      return { success: true, status: 200, result: resJson.result };
    }

    if (apiRes.status === 401 || (resJson && resJson.status === 401)) {
      const errMsg = resJson?.error || "Google Apps Script 401 Unauthorized: 'Who has access' must be set to 'Anyone' in Manage Deployments.";
      console.warn("[SheetsService] Proxy returned 401 Unauthorized:", errMsg);
      return { success: false, status: 401, error: errMsg, isUnauthorized: true };
    }

    if (resJson && !resJson.success) {
      console.warn("[SheetsService] Proxy reported error:", resJson.error);
      return { success: false, status: apiRes.status, error: resJson.error };
    }
  } catch (proxyError: any) {
    console.warn("[SheetsService] Server proxy unavailable, falling back to direct browser fetch:", proxyError.message);
  }

  // 2. Direct client-side fetch fallback
  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain;charset=utf-8",
      },
      body: JSON.stringify(payload),
      redirect: "follow",
    });

    const responseText = await response.text();

    if (response.status === 401 || response.url.includes("accounts.google.com") || responseText.includes("ServiceLogin")) {
      return {
        success: false,
        status: 401,
        isUnauthorized: true,
        error: "Google Apps Script 401 Unauthorized: The Web App requires login. Please set 'Who has access' to 'Anyone' in Apps Script Deployments.",
      };
    }

    if (response.ok || responseText.includes("Success")) {
      return { success: true, status: response.status, result: responseText };
    }

    if (responseText.startsWith("Error:")) {
      return { success: false, status: response.status, error: responseText };
    }

    return {
      success: false,
      status: response.status,
      error: `Google Apps Script returned status ${response.status}: ${responseText.slice(0, 100)}`,
    };
  } catch (directError: any) {
    console.error("[SheetsService] Direct fetch error:", directError);
    // CORS errors usually happen when Google redirects to accounts.google.com (401)
    return {
      success: false,
      status: 401,
      isUnauthorized: true,
      error: "Google Apps Script connection blocked (CORS / 401). In Google Sheet > Extensions > Apps Script > Deploy > Manage Deployments > change 'Who has access' to 'Anyone'.",
    };
  }
}

/**
 * Tests the connection to the Google Apps Script Webhook.
 */
export async function testGoogleSheetsConnection(
  webhookUrlOverride?: string,
  sheetIdOverride?: string
): Promise<{
  success: boolean;
  status?: number;
  type?: string;
  error?: string;
  message?: string;
  instructions?: string[];
  responsePreview?: string;
}> {
  const webhookUrl = (webhookUrlOverride || getActiveWebhookUrl()).trim();
  const sheetId = (sheetIdOverride || getActiveSheetId()).trim();

  try {
    const res = await fetch("/api/test-sheets-connection", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ webhookUrl, sheetId }),
    });

    const data = await res.json();
    return data;
  } catch (err: any) {
    console.warn("API test endpoint failed, trying direct ping:", err);
    try {
      const direct = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ type: "PING_TEST", sheetId, test: true }),
      });
      const text = await direct.text();
      if (direct.url.includes("accounts.google.com") || text.includes("ServiceLogin")) {
        return {
          success: false,
          status: 401,
          type: "UNAUTHORIZED_DOMAIN",
          error: "Google Apps Script requires Google Login (401 Unauthorized)",
          message: "Under 'Who has access', the script must be set to 'Anyone'.",
          instructions: [
            "1. Open your Google Sheet > Extensions > Apps Script",
            "2. Click Deploy > Manage Deployments",
            "3. Click the Pencil (Edit) icon next to the active deployment",
            "4. Change 'Who has access' from 'Only myself' to 'Anyone'",
            "5. Click Deploy and authorize if prompted",
          ],
        };
      }
      return {
        success: direct.ok,
        status: direct.status,
        message: direct.ok ? "Connected to Google Apps Script successfully!" : text,
      };
    } catch (e: any) {
      return {
        success: false,
        error: e.message || "Failed to reach Google Apps Script Webhook URL.",
        message: "Network request blocked or URL unreachable. Make sure 'Who has access' is 'Anyone'.",
      };
    }
  }
}

/**
 * Syncs an entire submission (with all its assignments and rounds) from Supabase/Firestore to Google Sheets.
 */
export async function syncFullSubmissionToGoogleSheets(
  submission: any,
  round: string = "1",
  triggerEmail: boolean = false
): Promise<{ success: boolean; syncedCount: number; errors: string[] }> {
  if (!submission || !submission.assignments || submission.assignments.length === 0) {
    return { success: false, syncedCount: 0, errors: ["No assignments found for this style."] };
  }

  let syncedCount = 0;
  const errors: string[] = [];
  const assignments = submission.assignments;

  for (const a of assignments) {
    const r1 = a.round1 || {};
    const r2 = a.round2 || {};
    const r3 = a.round3 || {};
    const r4 = a.round4 || {};
    const r5 = a.round5 || {};

    let appBaseUrl = window.location.origin;
    const envAppUrl = import.meta.env.VITE_APP_URL;
    if (envAppUrl && envAppUrl !== "undefined" && envAppUrl.length > 5) {
      appBaseUrl = envAppUrl.replace(/\/$/, "");
    }

    const currentLink = `${appBaseUrl}/?submissionId=${submission.id}&assignmentId=${a.id}&round=${round}`;

    const payload = {
      type: "SYNC_RECORD",
      assignmentId: a.id,
      submissionId: submission.id,
      modelName: a.model_name || a.modelName,
      modelEmail: a.model_email || a.modelEmail,
      email: a.model_email || a.modelEmail,
      recipientEmail: a.model_email || a.modelEmail,
      sampleType: submission.type_of_sample || submission.sampleType,
      styleNo: submission.style_number || submission.styleNo,
      description: submission.description,
      size: a.size,
      color: a.color,
      round: String(round),
      "B": a.model_name || a.modelName || "",
      "C": submission.type_of_sample || submission.sampleType || "",
      "D": submission.style_number || submission.styleNo || "",
      "E": submission.description || "",
      "F": a.size || "",
      // Round 1
      "G": r1.color || a.color || "",
      "H": r1.given_for_fit_date || a.given_for_fit_date || "",
      "I": r1.comments_received_date || "",
      "J": r1.fit_date || r1.received_date || "",
      "K": r1.before_wash || "",
      "L": r1.after_wash || "",
      "M": r1.fabric_trims || "",
      // Round 2
      "O": r2.color || "",
      "P": r2.given_for_fit_date || "",
      "Q": r2.comments_received_date || "",
      "R": r2.fit_date || r2.received_date || "",
      "S": r2.before_wash || "",
      "T": r2.after_wash || "",
      "U": r2.fabric_trims || "",
      // Round 3
      "W": r3.color || "",
      "X": r3.given_for_fit_date || "",
      "Y": r3.comments_received_date || "",
      "Z": r3.fit_date || r3.received_date || "",
      "AA": r3.before_wash || "",
      "AB": r3.after_wash || "",
      "AC": r3.fabric_trims || "",
      // Round 4
      "AE": r4.color || "",
      "AF": r4.given_for_fit_date || "",
      "AG": r4.comments_received_date || "",
      "AH": r4.fit_date || r4.received_date || "",
      "AI": r4.before_wash || "",
      "AJ": r4.after_wash || "",
      "AK": r4.fabric_trims || "",
      // Round 5
      "AM": r5.color || "",
      "AN": r5.given_for_fit_date || "",
      "AO": r5.comments_received_date || "",
      "AP": r5.fit_date || r5.received_date || "",
      "AQ": r5.before_wash || "",
      "AR": r5.after_wash || "",
      "AS": r5.fabric_trims || "",
      link: currentLink,
      responseUrl: currentLink,
      tabName: submission.series || "General",
      triggerEmail: triggerEmail,
      senderEmail: submission.submitted_by || "Admin",
      senderName: "Fit Comment System",
      timestamp: new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }),
      "AX": a.id,
    };

    const res = await saveToGoogleSheets(payload);
    if (res.success) {
      syncedCount++;
    } else {
      errors.push(`${a.model_name || a.modelEmail}: ${res.error || "Sync failed"}`);
    }
  }

  return {
    success: errors.length === 0,
    syncedCount,
    errors,
  };
}
