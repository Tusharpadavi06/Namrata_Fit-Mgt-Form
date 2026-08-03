# Google Apps Script for Fit Comment System

This script facilitates synchronization between the React app and Google Sheets. It handles new submissions, round updates, and mailing links to models.

## Installation Instructions

1. Open your Google Sheet.
2. Go to **Extensions** > **Apps Script**.
3. Delete any existing code and paste the script provided below.
4. **Crucial**: Ensure you have added the Spreadsheet ID to your AI Studio **Settings** as `VITE_GOOGLE_SHEET_ID`. The ID is the long string in the Sheet's URL.
5. Click **Deploy** > **New Deployment**.
6. Select **Type**: **Web App**.
7. **Description**: "Fit Comment Sync".
8. **Execute as**: **Me**.
9. **Who has access**: **Anyone** (this is necessary for the React app to communicate with the script).
10. Click **Deploy**, authorize permissions, and copy the **Web App URL**.
11. Add this URL to your AI Studio **Settings** as `VITE_GOOGLE_SHEETS_WEBHOOK_URL`.

## The Script

```javascript
function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    // 1. Acquire lock for 30 seconds to prevent race conditions during parallel submissions
    lock.waitLock(30000);
    
    var contents = e.postData.contents;
    var data = JSON.parse(contents);
    
    // 2. Identify the Spreadsheet
    var ss;
    if (data.sheetId) {
      ss = SpreadsheetApp.openById(data.sheetId);
    } else {
      ss = SpreadsheetApp.getActiveSpreadsheet();
    }
    
    if (!ss) {
      throw new Error("Spreadsheet not found. Check ID or binding.");
    }
    
    // 3. Handle explicit EMAIL trigger
    if (data.type === 'SEND_MAIL') {
      return sendMail(data);
    }
    
    // 4. Identify the target sheet (Series based)
    var sheetName = data.tabName || "General";
    var sheet = getSheetWithHeaders(ss, sheetName);
    
    // 5. Find or create the row
    var assignmentId = data.assignmentId || data.id;
    var row = -1;
    
    // ALWAYS search for existing record if assignmentId is present
    if (assignmentId) {
       row = findRow(sheet, assignmentId);
    }
    
    if (row === -1) {
      // NEW SUBMISSION: Append a truly new row at the bottom
      row = sheet.getLastRow() + 1;
      
      // Ensure the sheet has enough columns
      if (sheet.getMaxColumns() < 60) {
        sheet.insertColumnsAfter(sheet.getMaxColumns(), 60 - sheet.getMaxColumns());
      }
      
      // Initialize basic identifying markers
      updateCell(sheet, row, "AX", assignmentId); // ID in column AX (50)
      updateCell(sheet, row, "A", data.timestamp || new Date());
    }
    
    // 6. UPDATE FIELDS (B-F are general)
    updateCell(sheet, row, "B", data.modelName || data.B);
    updateCell(sheet, row, "C", data.sampleType || data.typeOfSample || data.C);
    updateCell(sheet, row, "D", data.styleNo || data.D);
    updateCell(sheet, row, "E", data.description || data.Instructions || data.E);
    updateCell(sheet, row, "F", data.size || data.F);
    
    // 7. Update round-specific data (Revised to match user requested mapping)
    var round = String(data.round || "1");
    
    if (round === "1") {
      updateCell(sheet, row, "G", data.color || data.G);
      updateCell(sheet, row, "H", data.givenForFitDate || data.H);
      updateCell(sheet, row, "I", data.commentsDate || data.commentsReceivedDate || data.comments_received_date || data.I);
      updateCell(sheet, row, "J", data.receivedDate || data.received_date || data.J);
      updateCell(sheet, row, "K", data.beforeWash || data.before_wash || data.K);
      updateCell(sheet, row, "L", data.afterWash || data.after_wash || data.L);
      updateCell(sheet, row, "M", data.fabricComments || data.fabricTrims || data.fabric_trims || data.M);
      // Removed Link from N
    } 
    else if (round === "2") {
      updateCell(sheet, row, "O", data.color || data.O);
      updateCell(sheet, row, "P", data.givenForFitDate || data.P); 
      updateCell(sheet, row, "Q", data.commentsDate || data.commentsReceivedDate || data.comments_received_date || data.Q); 
      updateCell(sheet, row, "R", data.receivedDate || data.received_date || data.R);
      updateCell(sheet, row, "S", data.beforeWash || data.before_wash || data.S);
      updateCell(sheet, row, "T", data.afterWash || data.after_wash || data.T);
      updateCell(sheet, row, "U", data.fabricComments || data.fabricTrims || data.fabric_trims || data.U);
      // Removed Link from V
    } 
    else if (round === "3") {
      updateCell(sheet, row, "W", data.color || data.W); 
      updateCell(sheet, row, "X", data.givenForFitDate || data.X); 
      updateCell(sheet, row, "Y", data.commentsDate || data.commentsReceivedDate || data.comments_received_date || data.Y); 
      updateCell(sheet, row, "Z", data.receivedDate || data.received_date || data.Z);
      updateCell(sheet, row, "AA", data.beforeWash || data.before_wash || data.AA);
      updateCell(sheet, row, "AB", data.afterWash || data.after_wash || data.AB);
      updateCell(sheet, row, "AC", data.fabricComments || data.fabricTrims || data.fabric_trims || data.AC);
      // Removed Link from AD
    }
    else if (round === "4") {
      updateCell(sheet, row, "AE", data.color || data.AE); 
      updateCell(sheet, row, "AF", data.givenForFitDate || data.AF); 
      updateCell(sheet, row, "AG", data.commentsDate || data.commentsReceivedDate || data.comments_received_date || data.AG); 
      updateCell(sheet, row, "AH", data.receivedDate || data.received_date || data.AH);
      updateCell(sheet, row, "AI", data.beforeWash || data.before_wash || data.AI);
      updateCell(sheet, row, "AJ", data.afterWash || data.after_wash || data.AJ);
      updateCell(sheet, row, "AK", data.fabricComments || data.fabricTrims || data.fabric_trims || data.AK);
    }
    else if (round === "5") {
      updateCell(sheet, row, "AM", data.color || data.AM); 
      updateCell(sheet, row, "AN", data.givenForFitDate || data.AN); 
      updateCell(sheet, row, "AO", data.commentsDate || data.commentsReceivedDate || data.comments_received_date || data.AO); 
      updateCell(sheet, row, "AP", data.receivedDate || data.received_date || data.AP);
      updateCell(sheet, row, "AQ", data.beforeWash || data.before_wash || data.AQ);
      updateCell(sheet, row, "AR", data.afterWash || data.after_wash || data.AR);
      updateCell(sheet, row, "AS", data.fabricComments || data.fabricTrims || data.fabric_trims || data.AS);
    }
    
    // 8. Handle automatic email notification
    if (data.triggerEmail) {
      sendMail(data);
    }
    
    return ContentService.createTextOutput("Success").setMimeType(ContentService.MimeType.TEXT);
    
  } catch (err) {
    return ContentService.createTextOutput("Error: " + err.message).setMimeType(ContentService.MimeType.TEXT);
  } finally {
    // 9. Always release the lock
    lock.releaseLock();
  }
}

function getSheetWithHeaders(ss, sheetName) {
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    var headers = [
      "Timestamp", "Model Name", "Type of sample", "Style no", "Description", "Size", 
      "R1 Color", "R1 Fit Date", "R1 Comments Date", "R1 Received", "R1 Before Wash", "R1 After Wash", "R1 Fabric/Trims", "R1 Feedback",
      "R2 Color", "R2 Fit Date", "R2 Comments Date", "R2 Received", "R2 Before Wash", "R2 After Wash", "R2 Fabric/Trims", "R2 Feedback",
      "R3 Color", "R3 Fit Date", "R3 Comments Date", "R3 Received", "R3 Before Wash", "R3 After Wash", "R3 Fabric/Trims", "R3 Feedback",
      "R4 Color", "R4 Fit Date", "R4 Comments Date", "R4 Received", "R4 Before Wash", "R4 After Wash", "R4 Fabric/Trims", "R4 Feedback",
      "R5 Color", "R5 Fit Date", "R5 Comments Date", "R5 Received", "R5 Before Wash", "R5 After Wash", "R5 Fabric/Trims", "R5 Feedback"
    ];
    sheet.appendRow(headers);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, headers.length).setBackground("#f3f4f6").setFontWeight("bold");
  }
  return sheet;
}

function findRow(sheet, assignmentId) {
  if (!assignmentId) return -1;
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;
  
  var ids = sheet.getRange(1, 50, lastRow, 1).getValues();
  var targetId = String(assignmentId).trim().toLowerCase();
  
  for (var i = 1; i < ids.length; i++) {
    var sheetId = String(ids[i][0]).trim().toLowerCase();
    if (sheetId === targetId) return i + 1;
  }
  return -1;
}

function updateCell(sheet, row, colName, value) {
  if (value === undefined || value === null || value === "") return;
  var colMap = {
    "A": 1, "B": 2, "C": 3, "D": 4, "E": 5, "F": 6, "G": 7, "H": 8, "I": 9, "J": 10,
    "K": 11, "L": 12, "M": 13, "N": 14, "O": 15, "P": 16, "Q": 17, "R": 18, "S": 19, "T": 20,
    "U": 21, "V": 22, "W": 23, "X": 24, "Y": 25, "Z": 26, "AA": 27, "AB": 28, "AC": 29, "AD": 30,
    "AE": 31, "AF": 32, "AG": 33, "AH": 34, "AI": 35, "AJ": 36, "AK": 37, "AL": 38, "AM": 39, "AN": 40,
    "AO": 41, "AP": 42, "AQ": 43, "AR": 44, "AS": 45, "AX": 50
  };
  var colIndex = colMap[colName.toUpperCase()];
  if (colIndex) {
    sheet.getRange(row, colIndex).setValue(value);
  }
}

function sendMail(data) {
  var recipient = data.modelEmail || data.senderEmail;
  if (!recipient || (!data.link && !data.responseUrl)) return ContentService.createTextOutput("Email missing recipient or link").setMimeType(ContentService.MimeType.TEXT);
  
  var link = data.link || data.responseUrl;
  var round = data.round || "1";
  var subject = "Action Required: Fit Comments for Style " + (data.styleNo || "New") + " (Round " + round + ")";
  
  var htmlBody = 
    "<div style='font-family: sans-serif; max-width: 600px; margin: auto; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden;'>" +
      "<div style='background-color: #4f46e5; padding: 30px; text-align: center; color: white;'>" +
        "<h1 style='margin: 0; font-size: 24px;'>Fit Feedback Required</h1>" +
        "<p style='margin: 10px 0 0; opacity: 0.9;'>Round " + round + " Request</p>" +
      "</div>" +
      "<div style='padding: 30px; background-color: white;'>" +
        "<p>Hello <strong>" + (data.modelName || "Model") + "</strong>,</p>" +
        "<p>You have a new sample fit request that requires your feedback. Please click the button below to provide your comments:</p>" +
        "<div style='text-align: center; margin: 40px 0;'>" +
          "<a href='" + link + "' style='background-color: #4338ca; color: white; padding: 14px 35px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px; display: inline-block; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);'>Open Feedback Form</a>" +
        "</div>" +
        "<hr style='border: 0; border-top: 1px solid #e2e8f0; margin: 30px 0;'>" +
        "<p style='color: #4f46e5; font-size: 13px; word-break: break-all;'>" + link + "</p>" +
      "</div>" +
    "</div>";

  MailApp.sendEmail({
    to: recipient,
    subject: subject,
    htmlBody: htmlBody,
    replyTo: data.senderEmail,
    name: (data.senderName || "Fit Comment System")
  });
  
  return ContentService.createTextOutput("Email Sent").setMimeType(ContentService.MimeType.TEXT);
}
```
```

## Logic Explained

1. **Mapping Style to Series**: The script automatically detects the series (CB, FB, etc.) from the style number and puts it in the correct tab.
2. **Row Tracking**: It uses a hidden column (Column AX) to store the Assignment ID. This ensures that when you update a form for Round 2 or 3, it finds the *exact* same row and updates it instead of creating a new one.
3. **Column Logic**:
   - **B-F**: Basic information (Model, Type, Style, Description, Size).
   - **G-M**: Round 1 feedback.
   - **O-U**: Round 2 feedback.
   - **W-AC**: Round 3 feedback.
   - **AE-AK**: Round 4 feedback.
   - **AM-AS**: Round 5 feedback.
   - **N, V, AD, AL, AR**: Feedback columns without links.
4. **Email Automation**: When the app sends a `SEND_MAIL` instruction, this script uses Google's `MailApp` to send the link directly to the model's inbox.
