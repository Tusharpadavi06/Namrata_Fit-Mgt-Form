# Google Apps Script for Fit Comment System & Email Delivery

This script synchronizes your React application with your Google Sheet and sends notification emails to models via `MailApp`.

---

## ⚠️ CRITICAL SETUP: WHY SYNC / MAIL FAILS WITH 401 ERROR

If data is saving in Supabase/App but **NOT** in Google Sheet or Email:
The #1 cause is that Google Apps Script was deployed with **"Who has access: Only myself"**.
When deployed this way, Google blocks the React app and returns **401 Unauthorized / Google Login redirect**.

### 🔧 1-Minute Fix:
1. Open your Google Sheet: `https://docs.google.com/spreadsheets/d/1ItCgnXRothgSUuZA4QdgLu8ElJYRg8ePpQXksvv0P_4/edit`
2. In the top menu, go to **Extensions** > **Apps Script**.
3. Replace all code in the editor with the script below.
4. Click the blue **Deploy** button (top right) > **Manage Deployments**.
5. Click the **Pencil (Edit)** icon next to your active deployment.
6. Under **Version**, select **New version**.
7. Under **Who has access**, select **Anyone** (Do NOT choose "Only myself").
8. Click **Deploy**.
9. If Google asks for authorization:
   - Click **Review permissions**
   - Choose your Google account (`tushpadavi1@gmail.com`)
   - Click **Advanced** > **Go to Fit Comment Sync (unsafe)**
   - Click **Allow**
10. Copy the Web App URL (ends in `/exec`) and paste it into the app's **Google Sheets & Mail Settings** dialog or AI Studio settings!

---

## The Complete Script Code

Copy and paste this into your Google Apps Script editor (`Code.gs`):

```javascript
/**
 * Fit Comment System - Google Apps Script Web App
 * Handles dual-write row insertion/updates and automated model email notifications.
 */

function doGet(e) {
  return ContentService.createTextOutput(JSON.stringify({
    status: "ok",
    message: "Fit Comment Google Apps Script is ACTIVE!",
    timestamp: new Date().toISOString()
  })).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    // 1. Acquire lock for up to 30 seconds to prevent race conditions during multiple parallel submissions
    lock.waitLock(30000);
    
    if (!e || !e.postData || !e.postData.contents) {
      return ContentService.createTextOutput("Error: No POST body provided").setMimeType(ContentService.MimeType.TEXT);
    }
    
    var contents = e.postData.contents;
    var data = JSON.parse(contents);
    
    // 2. Identify the target Spreadsheet
    var ss;
    var targetSheetId = data.sheetId || data.spreadsheetId || "1ItCgnXRothgSUuZA4QdgLu8ElJYRg8ePpQXksvv0P_4";
    try {
      ss = SpreadsheetApp.openById(targetSheetId);
    } catch (err) {
      ss = SpreadsheetApp.getActiveSpreadsheet();
    }
    
    if (!ss) {
      return ContentService.createTextOutput("Error: Spreadsheet not found. Check Spreadsheet ID.").setMimeType(ContentService.MimeType.TEXT);
    }
    
    // 3. Handle Health Ping test
    if (data.type === 'PING_TEST') {
      return ContentService.createTextOutput("Success: Google Apps Script & Sheet connected successfully!").setMimeType(ContentService.MimeType.TEXT);
    }
    
    // 4. Handle standalone EMAIL trigger
    if (data.type === 'SEND_MAIL') {
      return sendMail(data);
    }
    
    // 5. Identify the target sheet (Series based: General, A, B, etc.)
    var sheetName = data.tabName || "General";
    var sheet = getSheetWithHeaders(ss, sheetName);
    
    // 6. Find or create the row
    var assignmentId = data.assignmentId || data.id;
    var row = -1;
    
    if (assignmentId) {
      row = findRow(sheet, assignmentId);
    }
    
    if (row === -1) {
      // NEW SUBMISSION: Append a new row at the bottom
      row = sheet.getLastRow() + 1;
      
      // Ensure the sheet has at least 60 columns
      if (sheet.getMaxColumns() < 60) {
        sheet.insertColumnsAfter(sheet.getMaxColumns(), 60 - sheet.getMaxColumns());
      }
      
      // Unique tracking ID in Column AX (50) and Creation Timestamp in Column A
      updateCell(sheet, row, "AX", assignmentId);
      updateCell(sheet, row, "A", data.timestamp || new Date().toLocaleString());
    }
    
    // 7. Update General Sample Information (Columns B to F)
    updateCell(sheet, row, "B", data.modelName || data.B);
    updateCell(sheet, row, "C", data.sampleType || data.typeOfSample || data.C);
    updateCell(sheet, row, "D", data.styleNo || data.style_number || data.D);
    updateCell(sheet, row, "E", data.description || data.Instructions || data.E);
    updateCell(sheet, row, "F", data.size || data.F);
    
    // 8. Update Round-Specific Data
    var round = String(data.round || "1");
    
    if (round === "1") {
      updateCell(sheet, row, "G", data.color || data.G);
      updateCell(sheet, row, "H", data.givenForFitDate || data.given_for_fit_date || data.H);
      updateCell(sheet, row, "I", data.commentsDate || data.commentsReceivedDate || data.comments_received_date || data.I);
      updateCell(sheet, row, "J", data.receivedDate || data.received_date || data.fit_date || data.J);
      updateCell(sheet, row, "K", data.beforeWash || data.before_wash || data.K);
      updateCell(sheet, row, "L", data.afterWash || data.after_wash || data.L);
      updateCell(sheet, row, "M", data.fabricComments || data.fabricTrims || data.fabric_trims || data.M);
    } 
    else if (round === "2") {
      updateCell(sheet, row, "O", data.color || data.O);
      updateCell(sheet, row, "P", data.givenForFitDate || data.given_for_fit_date || data.P); 
      updateCell(sheet, row, "Q", data.commentsDate || data.commentsReceivedDate || data.comments_received_date || data.Q); 
      updateCell(sheet, row, "R", data.receivedDate || data.received_date || data.fit_date || data.R);
      updateCell(sheet, row, "S", data.beforeWash || data.before_wash || data.S);
      updateCell(sheet, row, "T", data.afterWash || data.after_wash || data.T);
      updateCell(sheet, row, "U", data.fabricComments || data.fabricTrims || data.fabric_trims || data.U);
    }
    else if (round === "3") {
      updateCell(sheet, row, "W", data.color || data.W);
      updateCell(sheet, row, "X", data.givenForFitDate || data.given_for_fit_date || data.X);
      updateCell(sheet, row, "Y", data.commentsDate || data.commentsReceivedDate || data.comments_received_date || data.Y);
      updateCell(sheet, row, "Z", data.receivedDate || data.received_date || data.fit_date || data.Z);
      updateCell(sheet, row, "AA", data.beforeWash || data.before_wash || data.AA);
      updateCell(sheet, row, "AB", data.afterWash || data.after_wash || data.AB);
      updateCell(sheet, row, "AC", data.fabricComments || data.fabricTrims || data.fabric_trims || data.AC);
    }
    else if (round === "4") {
      updateCell(sheet, row, "AE", data.color || data.AE);
      updateCell(sheet, row, "AF", data.givenForFitDate || data.given_for_fit_date || data.AF);
      updateCell(sheet, row, "AG", data.commentsDate || data.commentsReceivedDate || data.comments_received_date || data.AG);
      updateCell(sheet, row, "AH", data.receivedDate || data.received_date || data.fit_date || data.AH);
      updateCell(sheet, row, "AI", data.beforeWash || data.before_wash || data.AI);
      updateCell(sheet, row, "AJ", data.afterWash || data.after_wash || data.AJ);
      updateCell(sheet, row, "AK", data.fabricComments || data.fabricTrims || data.fabric_trims || data.AK);
    }
    else if (round === "5") {
      updateCell(sheet, row, "AM", data.color || data.AM);
      updateCell(sheet, row, "AN", data.givenForFitDate || data.given_for_fit_date || data.AN);
      updateCell(sheet, row, "AO", data.commentsDate || data.commentsReceivedDate || data.comments_received_date || data.AO);
      updateCell(sheet, row, "AP", data.receivedDate || data.received_date || data.fit_date || data.AP);
      updateCell(sheet, row, "AQ", data.beforeWash || data.before_wash || data.AQ);
      updateCell(sheet, row, "AR", data.afterWash || data.after_wash || data.AR);
      updateCell(sheet, row, "AS", data.fabricComments || data.fabricTrims || data.fabric_trims || data.AS);
    }
    
    // 9. Handle automatic email notification
    if (data.triggerEmail) {
      sendMail(data);
    }
    
    return ContentService.createTextOutput("Success").setMimeType(ContentService.MimeType.TEXT);
    
  } catch (err) {
    Logger.log("doPost Error: " + err.message);
    return ContentService.createTextOutput("Error: " + err.message).setMimeType(ContentService.MimeType.TEXT);
  } finally {
    lock.releaseLock();
  }
}

/**
 * Searches column AX (50) for the assignmentId
 */
function findRow(sheet, assignmentId) {
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return -1;
  
  var axColIndex = 50; // AX is column 50
  if (sheet.getMaxColumns() < axColIndex) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), axColIndex - sheet.getMaxColumns());
  }
  
  var range = sheet.getRange(2, axColIndex, lastRow - 1, 1);
  var values = range.getValues();
  
  for (var i = 0; i < values.length; i++) {
    if (String(values[i][0]).trim() === String(assignmentId).trim()) {
      return i + 2; // +2 for 1-based index and header row
    }
  }
  return -1;
}

/**
 * Sends a notification email to the model using MailApp
 */
function sendMail(data) {
  var recipient = data.modelEmail || data.model_email || data.email || data.recipientEmail || data.recipient;
  if (!recipient) {
    return ContentService.createTextOutput("Email skipped: No recipient email").setMimeType(ContentService.MimeType.TEXT);
  }
  
  var link = data.link || data.responseUrl || "";
  var round = data.round || "1";
  var style = data.styleNo || data.style_number || "Garment";
  var subject = "Action Required: Fit Comments for Style " + style + " (Round " + round + ")";
  
  var htmlBody = '<div style="font-family: -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica, Arial, sans-serif; padding: 24px; color: #1e293b; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">'
    + '<div style="border-bottom: 2px solid #6366f1; padding-bottom: 12px; margin-bottom: 16px;">'
    + '<h2 style="color: #4338ca; margin: 0; font-size: 20px;">Fit Feedback Request</h2>'
    + '<p style="color: #64748b; font-size: 13px; margin: 4px 0 0 0;">Namrata Fit Comment Management System</p>'
    + '</div>'
    + '<p style="font-size: 14px; line-height: 1.5;">Hello <strong>' + (data.modelName || "Model") + '</strong>,</p>'
    + '<p style="font-size: 14px; line-height: 1.5;">You have been assigned a garment sample for fit review. Please try on the sample and submit your feedback:</p>'
    + '<div style="background-color: #f8fafc; padding: 16px; border-radius: 8px; margin: 20px 0; border: 1px solid #e2e8f0;">'
    + '<table style="width: 100%; font-size: 13px; border-collapse: collapse;">'
    + '<tr><td style="padding: 4px 0; color: #64748b;">Style Number:</td><td style="font-weight: bold; color: #0f172a;">' + style + '</td></tr>'
    + '<tr><td style="padding: 4px 0; color: #64748b;">Sample Type:</td><td style="font-weight: bold; color: #0f172a;">' + (data.sampleType || "N/A") + '</td></tr>'
    + '<tr><td style="padding: 4px 0; color: #64748b;">Size:</td><td style="font-weight: bold; color: #0f172a;">' + (data.size || "N/A") + '</td></tr>'
    + '<tr><td style="padding: 4px 0; color: #64748b;">Round:</td><td style="font-weight: bold; color: #4338ca;">Round ' + round + '</td></tr>'
    + '</table>'
    + '</div>'
    + (link ? '<div style="text-align: center; margin: 28px 0;">'
    + '<a href="' + link + '" style="background-color: #4f46e5; color: #ffffff; padding: 12px 28px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block; font-size: 14px; box-shadow: 0 2px 4px rgba(79,70,229,0.2);">Open Fit Feedback Form</a>'
    + '</div>'
    + '<p style="font-size: 12px; color: #94a3b8; word-break: break-all;">Direct Link: <a href="' + link + '" style="color: #6366f1;">' + link + '</a></p>' : '')
    + '<hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0 12px 0;" />'
    + '<p style="font-size: 11px; color: #94a3b8; text-align: center; margin: 0;">Automated notification sent via Google Apps Script & MailApp</p>'
    + '</div>';
  
  try {
    MailApp.sendEmail({
      to: recipient,
      subject: subject,
      htmlBody: htmlBody,
      replyTo: data.senderEmail || undefined,
      name: (data.senderName || "Fit Comment System")
    });
    return ContentService.createTextOutput("Success: Email Sent to " + recipient).setMimeType(ContentService.MimeType.TEXT);
  } catch (err) {
    Logger.log("MailApp.sendEmail failed: " + err.message);
    return ContentService.createTextOutput("Mail Error: " + err.message).setMimeType(ContentService.MimeType.TEXT);
  }
}

/**
 * Updates a specific cell using A1 notation
 */
function updateCell(sheet, row, colLetter, val) {
  if (val === undefined || val === null) return;
  sheet.getRange(colLetter + row).setValue(val);
}

/**
 * Ensures standard headers exist on the sheet
 */
function getSheetWithHeaders(ss, sheetName) {
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  }
  
  if (sheet.getMaxColumns() < 60) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), 60 - sheet.getMaxColumns());
  }
  
  if (sheet.getLastRow() === 0) {
    var headers = [];
    headers[0] = "Timestamp";
    headers[1] = "Model Name";
    headers[2] = "Sample Type";
    headers[3] = "Style No";
    headers[4] = "Description";
    headers[5] = "Size";
    
    // Round 1 (G - M)
    headers[6] = "R1 Color";
    headers[7] = "R1 Given Date";
    headers[8] = "R1 Comments Date";
    headers[9] = "R1 Received Date";
    headers[10] = "R1 Before Wash";
    headers[11] = "R1 After Wash";
    headers[12] = "R1 Fabric/Trims";
    headers[13] = "R1 Link";
    
    // Round 2 (O - U)
    headers[14] = "R2 Color";
    headers[15] = "R2 Given Date";
    headers[16] = "R2 Comments Date";
    headers[17] = "R2 Received Date";
    headers[18] = "R2 Before Wash";
    headers[19] = "R2 After Wash";
    headers[20] = "R2 Fabric/Trims";
    headers[21] = "R2 Link";
    
    // Round 3 (W - AC)
    headers[22] = "R3 Color";
    headers[23] = "R3 Given Date";
    headers[24] = "R3 Comments Date";
    headers[25] = "R3 Received Date";
    headers[26] = "R3 Before Wash";
    headers[27] = "R3 After Wash";
    headers[28] = "R3 Fabric/Trims";
    headers[29] = "R3 Link";

    // Round 4 (AE - AK)
    headers[30] = "R4 Color";
    headers[31] = "R4 Given Date";
    headers[32] = "R4 Comments Date";
    headers[33] = "R4 Received Date";
    headers[34] = "R4 Before Wash";
    headers[35] = "R4 After Wash";
    headers[36] = "R4 Fabric/Trims";
    headers[37] = "R4 Link";

    // Round 5 (AM - AS)
    headers[38] = "R5 Color";
    headers[39] = "R5 Given Date";
    headers[40] = "R5 Comments Date";
    headers[41] = "R5 Received Date";
    headers[42] = "R5 Before Wash";
    headers[43] = "R5 After Wash";
    headers[44] = "R5 Fabric/Trims";
    headers[45] = "R5 Link";
    
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(1, 50).setValue("AssignmentId");
    sheet.getRange(1, 1, 1, 50).setFontWeight("bold").setBackground("#f1f5f9");
  }
  
  return sheet;
}
```
