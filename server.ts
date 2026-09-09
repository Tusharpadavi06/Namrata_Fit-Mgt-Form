import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ extended: true, limit: "10mb" }));

  // API Route: Health Check
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // API Route: Test Google Sheets Webhook Connection
  app.post("/api/test-sheets-connection", async (req, res) => {
    try {
      const { webhookUrl, sheetId } = req.body;
      const targetUrl = (webhookUrl || process.env.VITE_GOOGLE_SHEETS_WEBHOOK_URL || "").trim();
      const targetSheetId = (sheetId || process.env.VITE_GOOGLE_SHEET_ID || "").trim();

      if (!targetUrl) {
        return res.status(400).json({
          success: false,
          error: "Webhook URL is missing. Please provide a valid Google Apps Script Web App URL."
        });
      }

      console.log(`[API] Testing Webhook: ${targetUrl} for Sheet: ${targetSheetId}`);

      // Attempt ping to Google Apps Script
      const testPayload = {
        type: "PING_TEST",
        sheetId: targetSheetId,
        timestamp: new Date().toISOString(),
        test: true
      };

      const response = await fetch(targetUrl, {
        method: "POST",
        headers: {
          "Content-Type": "text/plain;charset=utf-8",
        },
        body: JSON.stringify(testPayload),
        redirect: "follow",
      });

      const responseStatus = response.status;
      const responseText = await response.text();
      const finalUrl = response.url;

      console.log(`[API] Webhook test response: ${responseStatus} finalUrl: ${finalUrl} text snippet: ${responseText.slice(0, 150)}`);

      // Check if redirected to Google Accounts login (indicates "Who has access" is not "Anyone")
      if (responseStatus === 401 || finalUrl.includes("accounts.google.com") || responseText.includes("ServiceLogin") || responseText.includes("Sign in - Google Accounts")) {
        return res.json({
          success: false,
          status: 401,
          type: "UNAUTHORIZED_DOMAIN",
          error: "Google Apps Script returned 401 / Google Sign-In redirect.",
          message: "Your Google Apps Script Web App is NOT accessible without login. Under 'Who has access', it must be set to 'Anyone'.",
          instructions: [
            "1. Open your Google Sheet > Extensions > Apps Script",
            "2. Click 'Deploy' > 'Manage Deployments'",
            "3. Click the Pencil (Edit) icon next to your active deployment",
            "4. Change 'Who has access' from 'Only myself' to 'Anyone'",
            "5. Click 'Deploy' and authorize if prompted",
            "6. Copy the Web App URL and test again here!"
          ]
        });
      }

      if (responseStatus === 404 || responseText.includes("Sorry, unable to open the file")) {
        return res.json({
          success: false,
          status: 404,
          type: "NOT_FOUND",
          error: "Google Apps Script not found (404). Please verify your Web App URL.",
          message: "The URL might be invalid or the script deployment was deleted."
        });
      }

      if (response.ok || responseText.includes("Success") || responseText.includes("PING_OK") || responseStatus < 400) {
        return res.json({
          success: true,
          status: responseStatus,
          message: "Connection successful! Google Apps Script is responding.",
          responsePreview: responseText.slice(0, 200)
        });
      }

      return res.json({
        success: false,
        status: responseStatus,
        error: `Google Apps Script returned status ${responseStatus}: ${responseText.slice(0, 200)}`
      });

    } catch (err: any) {
      console.error("[API] Error testing sheets webhook:", err);
      return res.status(500).json({
        success: false,
        error: err.message || "Failed to reach Google Apps Script webhook"
      });
    }
  });

  // API Route: Proxy Google Sheets & Mail Data Submission
  app.post("/api/google-sheets", async (req, res) => {
    try {
      const payload = req.body;
      const targetUrl = (payload.webhookUrl || process.env.VITE_GOOGLE_SHEETS_WEBHOOK_URL || "").trim();

      if (!targetUrl) {
        return res.status(400).json({
          success: false,
          error: "Webhook URL is missing."
        });
      }

      console.log(`[API] Proxying to Google Apps Script: ${targetUrl} (Style: ${payload.styleNo || payload.style_number}, Assignment: ${payload.assignmentId})`);

      const response = await fetch(targetUrl, {
        method: "POST",
        headers: {
          "Content-Type": "text/plain;charset=utf-8",
        },
        body: JSON.stringify(payload),
        redirect: "follow",
      });

      const responseStatus = response.status;
      const responseText = await response.text();
      const finalUrl = response.url;

      console.log(`[API] Apps script response status: ${responseStatus}, text: ${responseText.slice(0, 150)}`);

      if (responseStatus === 401 || finalUrl.includes("accounts.google.com") || responseText.includes("ServiceLogin")) {
        return res.status(401).json({
          success: false,
          status: 401,
          error: "401 Unauthorized: Google Apps Script Web App requires 'Who has access' to be set to 'Anyone'."
        });
      }

      if (!response.ok && responseStatus >= 400) {
        return res.status(responseStatus).json({
          success: false,
          status: responseStatus,
          error: `Google Apps Script responded with ${responseStatus}: ${responseText.slice(0, 200)}`
        });
      }

      // Check if Apps Script returned an internal error message
      if (responseText.startsWith("Error:")) {
        return res.json({
          success: false,
          error: responseText
        });
      }

      return res.json({
        success: true,
        status: responseStatus,
        result: responseText.slice(0, 200)
      });

    } catch (err: any) {
      console.error("[API] Error in /api/google-sheets proxy:", err);
      return res.status(500).json({
        success: false,
        error: err.message || "Failed to communicate with Google Apps Script"
      });
    }
  });

  // Vite middleware setup
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
