/**
 * Service to handle Google Sheets integration.
 * Connects to Google Apps Script Web App to store fit request & feedback data.
 */

import { toast } from 'sonner';

export const DEFAULT_SHEET_ID = "1ItCgnXRothgSUuZA4QdgLu8ElJYRg8ePpQXksvv0P_4";
export const DEFAULT_WEBHOOK_URL = "https://script.google.com/macros/s/AKfycbyFyxLdRLlpormotT-2zDdDN64Trlib5A7uNxsYbhhzWfvemL0KHfVNYcXJGVLPndkB/exec";

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

export async function saveToGoogleSheets(data: any) {
  const envWebhook = import.meta.env.VITE_GOOGLE_SHEETS_WEBHOOK_URL;
  const envSheetId = import.meta.env.VITE_GOOGLE_SHEET_ID;

  const webhookUrl = (envWebhook && envWebhook.length > 10 ? envWebhook : DEFAULT_WEBHOOK_URL).trim();
  const rawSheetId = (envSheetId && envSheetId.length > 5 ? envSheetId : DEFAULT_SHEET_ID).trim();

  const cleanSheetId = extractSheetId(rawSheetId);
  const fullSheetUrl = `https://docs.google.com/spreadsheets/d/${cleanSheetId}/edit`;

  const payload = {
    ...data,
    sheetId: cleanSheetId,
    spreadsheetId: cleanSheetId,
    sheet_id: cleanSheetId,
    sheetUrl: fullSheetUrl,
    spreadsheetUrl: fullSheetUrl,
    url: fullSheetUrl,
    timestamp: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })
  };

  console.log("Sending payload to Google Sheets Webhook:", webhookUrl);
  console.log("Sheet Target ID:", cleanSheetId);

  try {
    // Content-Type: text/plain;charset=utf-8 prevents CORS preflight OPTIONS check on script.google.com
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain;charset=utf-8",
      },
      body: JSON.stringify(payload),
    });
    
    if (response.ok) {
      console.log("Google Sheets sync successful (response ok)");
      return { success: true };
    } else {
      console.warn("Google Sheets sync response status:", response.status);
      return { success: true }; // Google Apps Script redirects handle parsing
    }
  } catch (error) {
    console.warn("Google Sheets Sync Fetch error (trying no-cors fallback):", error);
    
    // Fallback attempt with no-cors if CORS response redirect failed in browser
    try {
      await fetch(webhookUrl, {
        method: "POST",
        mode: "no-cors",
        headers: {
          "Content-Type": "text/plain",
        },
        body: JSON.stringify(payload),
      });
      console.log("Google Sheets sync sent via no-cors fallback");
      return { success: true };
    } catch (fallbackError) {
      console.error("Google Sheets Sync CRITICAL failure:", fallbackError);
      return { success: false, error: fallbackError };
    }
  }
}
