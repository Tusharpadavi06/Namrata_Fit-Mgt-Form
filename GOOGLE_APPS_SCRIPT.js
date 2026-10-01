// =========================================================================================
// SOIE SAMPLE FIT - UNIFIED GOOGLE APPS SCRIPT (Code.gs)
// =========================================================================================
// 
// 📑 STANDARD CATEGORY TABS & STYLES:
//  - Active Wear: Styles AT-100 to AT-999 (Active Wear / AT Series)
//  - LW: Styles LW-100 to LW-999 (Lounge Wear / LW Series)
//  - SW: Styles SW-100 to SW-999 (Sleep Wear / SW & NT Series)
//  - General: Default fallback for any other styles
//  (NOTE: Legacy tabs like Shapewear, Panty, Bra, CB/CP series are completely removed)
//
// 📌 STATUS & REMINDER COLUMNS (AZ to BD - NEVER FOR PHOTOS):
//  - Column AZ (52): 1st Round Reminder Status
//  - Column BA (53): 2nd Round Reminder Status
//  - Column BB (54): 3rd Round Reminder Status
//  - Column BC (55): 4th Round Reminder Status
//  - Column BD (56): 5th Round Reminder Status
//  - Column AY (51): UNUSED (Blank / Never stores anything)
//
// 📸 ATTACHMENT COLUMNS SERIES (Columns BI to BR ONLY):
//  - Round 1: Col BI (61) = 1st R. Product Image     | Col BJ (62) = 1st R.Model Fit Img Issues | Col N = Feedback
//  - Round 2: Col BK (63) = 2nd R. Product Image     | Col BL (64) = 2nd R.Model Fit Img Issues | Col V = Feedback
//  - Round 3: Col BM (65) = 3rd R. Product Image     | Col BN (66) = 3rd R.Model Fit Img Issues | Col AD = Feedback
//  - Round 4: Col BO (67) = 4th R. Product Image     | Col BP (68) = 4th R.Model Fit Img Issues | Col AL = Feedback
//  - Round 5: Col BQ (69) = 5th R. Product Image     | Col BR (70) = 5th R.Model Fit Img Issues | Col AT = Feedback
//  - Assignment ID: Column AX (50)
//  - Blank Columns: AY (51), BE-BH (57-60)
// 
// ✨ COMPLETE FEATURES INCLUDED:
//  1. Cross-Sheet Auto Merge: Finds existing rows across any category/series tab to prevent duplicates.
//  2. Sample Garment Photo Upload to Drive & Formula (=IMAGE + =HYPERLINK) in Columns BI, BK, BM, BO, BQ.
//  3. Model Fit Photos (1-10 photos) Upload & High-Res Zoom in Columns BJ, BL, BN, BP, BR.
//  4. In-Sheet Lightbox Zoom Dialog & Sidebar Zoom Inspector.
//  5. Interactive Web Zoom Viewer on doGet(e).
//  6. 1-Click Standard Category Tabs Creator (Active wear, LW, SW, General).
//  7. 1-Click Authorization & Permission Check (testAndAuthorizeDrive).
//  8. 1-Click Cleanup & Migration of misplaced photos (fixAndCleanAllPhotoColumns).
// =========================================================================================

/**
 * ⚡ ONE-CLICK AUTHORIZATION & DIAGNOSTIC FUNCTION
 * Run this function ONCE in the Apps Script Editor toolbar (Select "testAndAuthorizeDrive" and click "Run").
 * Google will prompt: "Review permissions" -> Choose your Google Account -> "Allow".
 * This permanently grants DriveApp permissions to save and display style photos in Google Sheets!
 */
function testAndAuthorizeDrive() {
  try {
    var folderName = "SOIE_Fit_Attachments";
    var folders = DriveApp.getFoldersByName(folderName);
    var folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(folderName);
    try {
      folder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    } catch (_) {}
    Logger.log("✅ Google Drive access authorized! Folder: " + folder.getName() + " (ID: " + folder.getId() + ")");
    
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    Logger.log("✅ Google Sheet access authorized! Sheet: " + ss.getName());
    
    return "SUCCESS: All Drive & Spreadsheet permissions are fully authorized! Photos will now display in Google Sheet.";
  } catch (err) {
    Logger.log("❌ Authorization Error: " + err.toString());
    throw err;
  }
}

/**
 * Main Web App POST entry point (calls unified processor)
 */
function doPost(e) {
  return doPost_original(e);
}

/**
 * Core Submission Processor with LockService & Cross-Sheet Matching
 */
function doPost_original(e) {
  var lock = LockService.getScriptLock();
  try {
    // 1. Acquire lock for 30 seconds to prevent race conditions during parallel submissions
    lock.waitLock(30000);
    
    if (!e || !e.postData || !e.postData.contents) {
      return ContentService.createTextOutput("Web App is ready. Please submit data from the application.")
        .setMimeType(ContentService.MimeType.TEXT);
    }

    var contents = e.postData.contents;
    var data = JSON.parse(contents);
    
    // 2. Identify Spreadsheet
    var ss;
    if (data.sheetId || data.spreadsheetId) {
      ss = SpreadsheetApp.openById(data.sheetId || data.spreadsheetId);
    } else {
      ss = SpreadsheetApp.getActiveSpreadsheet();
    }
    
    if (!ss) {
      throw new Error("Spreadsheet not found. Check ID or binding.");
    }

    // 3. Handle connection health check ping
    if (data.type === "PING_TEST") {
      return ContentService.createTextOutput("Success").setMimeType(ContentService.MimeType.TEXT);
    }
    
    // 4. Handle explicit EMAIL trigger
    if (data.type === "SEND_MAIL") {
      return sendMail(data);
    }

    // 4b. Handle explicit IMAGE UPLOAD to Google Drive
    if (data.type === "UPLOAD_IMAGE") {
      var filePrefix = data.prefix || data.styleNo || "photo";
      var saved = saveImageToDrive(data.base64, filePrefix + "_" + Date.now() + ".jpg");
      if (saved && saved.fileId) {
        return ContentService.createTextOutput(JSON.stringify({
          success: true,
          url: saved.directUrl,
          directUrl: saved.directUrl,
          viewUrl: saved.viewUrl,
          fileId: saved.fileId
        })).setMimeType(ContentService.MimeType.JSON);
      } else {
        return ContentService.createTextOutput(JSON.stringify({
          success: false,
          error: (saved && saved.error) || "Failed to save image to Google Drive"
        })).setMimeType(ContentService.MimeType.JSON);
      }
    }
    
    // 5. Identify the target sheet (Category / Series based: Active wear, LW, SW, General)
    var sheetName = data.tabName || data.series || "General";
    var sheet = findTargetSheet(ss, sheetName);
    var assignmentId = data.assignmentId || data.id || data.AX;
    var row = -1;

    // Search for existing assignment across the spreadsheet if assignmentId is present (Column AX = 50)
    if (assignmentId) {
      if (sheet) {
        row = findRow(sheet, assignmentId);
      }
      // If not found in designated tab, search ALL tabs in the spreadsheet to prevent duplicate rows
      if (row === -1) {
        var allSheets = ss.getSheets();
        for (var s = 0; s < allSheets.length; s++) {
          var candidateSheet = allSheets[s];
          var candidateRow = findRow(candidateSheet, assignmentId);
          if (candidateRow !== -1) {
            sheet = candidateSheet;
            row = candidateRow;
            break;
          }
        }
      }
    }
    
    // Fallback: search by Style No (Col D) and Model Name (Col B) across all sheets
    if (row === -1 && (data.styleNo || data.D)) {
      var targetStyle = data.styleNo || data.D;
      var targetModel = data.modelName || data.B;
      if (sheet) {
        row = findRowByStyle(sheet, targetStyle, targetModel);
      }
      if (row === -1) {
        var allSheets2 = ss.getSheets();
        for (var s2 = 0; s2 < allSheets2.length; s2++) {
          var candidateSheet2 = allSheets2[s2];
          var candidateRow2 = findRowByStyle(candidateSheet2, targetStyle, targetModel);
          if (candidateRow2 !== -1) {
            sheet = candidateSheet2;
            row = candidateRow2;
            break;
          }
        }
      }
    }

    // If still no sheet found, ensure the target sheet exists with headers
    if (!sheet) {
      sheet = findTargetSheet(ss, sheetName);
    }
    
    // Ensure sheet has enough columns (BR is column 70, reserve 75+)
    if (sheet.getMaxColumns() < 75) {
      sheet.insertColumnsAfter(sheet.getMaxColumns(), 75 - sheet.getMaxColumns());
    }

    if (row === -1) {
      // NEW SUBMISSION: Append a new row at the bottom
      row = sheet.getLastRow() + 1;
      
      // Initialize basic identifying markers
      updateCell(sheet, row, "AX", assignmentId); // ID in column AX (50)
      updateCell(sheet, row, "A", data.timestamp || new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }));
    } else {
      if (assignmentId) {
        updateCell(sheet, row, "AX", assignmentId);
      }
    }
    
    // 6. UPDATE GENERAL FIELDS (B-F)
    updateCell(sheet, row, "B", data.modelName || data.model_name || data.B);
    updateCell(sheet, row, "C", data.sampleType || data.typeOfSample || data.type_of_sample || data.C);
    updateCell(sheet, row, "D", data.styleNo || data.style_number || data.D);
    updateCell(sheet, row, "E", data.description || data.Instructions || data.E);
    updateCell(sheet, row, "F", data.size || data.F);
    
    // 7. Update round-specific data (Rounds 1 to 5)
    var round = String(data.round || "1");
    
    if (round === "1") {
      updateCell(sheet, row, "G", data.color || data.G);
      updateCell(sheet, row, "H", data.givenForFitDate || data.given_for_fit_date || data.H);
      updateCell(sheet, row, "I", data.receivedDate || data.received_date || data.I);
      updateCell(sheet, row, "J", data.commentsDate || data.commentsReceivedDate || data.comments_received_date || data.J);
      updateCell(sheet, row, "K", data.beforeWash || data.before_wash || data.K);
      updateCell(sheet, row, "L", data.afterWash || data.after_wash || data.L);
      updateCell(sheet, row, "M", data.fabricComments || data.fabricTrims || data.fabric_trims || data.M);
      updateCell(sheet, row, "N", data.feedback || data.comments || data.N);
    } 
    else if (round === "2") {
      updateCell(sheet, row, "O", data.color || data.O);
      updateCell(sheet, row, "P", data.givenForFitDate || data.given_for_fit_date || data.P); 
      updateCell(sheet, row, "Q", data.receivedDate || data.received_date || data.Q);
      updateCell(sheet, row, "R", data.commentsDate || data.commentsReceivedDate || data.comments_received_date || data.R);
      updateCell(sheet, row, "S", data.beforeWash || data.before_wash || data.S);
      updateCell(sheet, row, "T", data.afterWash || data.after_wash || data.T);
      updateCell(sheet, row, "U", data.fabricComments || data.fabricTrims || data.fabric_trims || data.U);
      updateCell(sheet, row, "V", data.feedback || data.comments || data.V);
    } 
    else if (round === "3") {
      updateCell(sheet, row, "W", data.color || data.W); 
      updateCell(sheet, row, "X", data.givenForFitDate || data.given_for_fit_date || data.X); 
      updateCell(sheet, row, "Y", data.receivedDate || data.received_date || data.Y);
      updateCell(sheet, row, "Z", data.commentsDate || data.commentsReceivedDate || data.comments_received_date || data.Z); 
      updateCell(sheet, row, "AA", data.beforeWash || data.before_wash || data.AA);
      updateCell(sheet, row, "AB", data.afterWash || data.after_wash || data.AB);
      updateCell(sheet, row, "AC", data.fabricComments || data.fabricTrims || data.fabric_trims || data.AC);
      updateCell(sheet, row, "AD", data.feedback || data.comments || data.AD);
    }
    else if (round === "4") {
      updateCell(sheet, row, "AE", data.color || data.AE); 
      updateCell(sheet, row, "AF", data.givenForFitDate || data.given_for_fit_date || data.AF); 
      updateCell(sheet, row, "AG", data.receivedDate || data.received_date || data.AG);
      updateCell(sheet, row, "AH", data.commentsDate || data.commentsReceivedDate || data.comments_received_date || data.AH); 
      updateCell(sheet, row, "AI", data.beforeWash || data.before_wash || data.AI);
      updateCell(sheet, row, "AJ", data.afterWash || data.after_wash || data.AJ);
      updateCell(sheet, row, "AK", data.fabricComments || data.fabricTrims || data.fabric_trims || data.AK);
      updateCell(sheet, row, "AL", data.feedback || data.comments || data.AL);
    }
    else if (round === "5") {
      updateCell(sheet, row, "AM", data.color || data.AM); 
      updateCell(sheet, row, "AN", data.givenForFitDate || data.given_for_fit_date || data.AN); 
      updateCell(sheet, row, "AO", data.receivedDate || data.received_date || data.AO);
      updateCell(sheet, row, "AP", data.commentsDate || data.commentsReceivedDate || data.comments_received_date || data.AP); 
      updateCell(sheet, row, "AQ", data.beforeWash || data.before_wash || data.AQ);
      updateCell(sheet, row, "AR", data.afterWash || data.after_wash || data.AR);
      updateCell(sheet, row, "AS", data.fabricComments || data.fabricTrims || data.fabric_trims || data.AS);
      updateCell(sheet, row, "AT", data.feedback || data.comments || data.AT);
    }
    
    // 8. Handle Sample Garment Photo (Columns BI, BK, BM, BO, BQ)
    if (data.samplePhoto || data.samplePhotoUrl || data.sample_photo_url || data.sample_photo || data.BI || data.BK || data.BM || data.BO || data.BQ) {
      try {
        handleSamplePhotoAttachment(data, sheet, row);
      } catch (sampleErr) {
        Logger.log("Sample photo handle error: " + sampleErr.message);
      }
    }

    // 8b. Handle Model Feedback Fit Photos / Attachments (Columns BJ, BL, BN, BP, BR)
    if (data.fitPhoto || data.fitPhotoUrl || data.fit_photo_url || data.fitPhotos || data.attachments || data.collageAttachment || data.allImages || data.images || data.attachment || data.photos || data.BJ || data.BL || data.BN || data.BP || data.BR) {
      try {
        handleAttachments(data, sheet, row);
      } catch (photoErr) {
        Logger.log("Attachment photo handle error: " + photoErr.message);
      }
    }

    // 8c. Automatic cleanup of legacy misplaced columns (AY, AZ, BH)
    try {
      var ayCell = sheet.getRange(row, colNameToIndex("AY"));
      var ayVal = String(ayCell.getValue() || "");
      if (ayVal && (ayVal.indexOf("=IMAGE") > -1 || ayVal.indexOf("http") === 0)) {
        var biCell = sheet.getRange(row, colNameToIndex("BI"));
        if (!biCell.getValue()) {
          var pAy = formatPhotoFormulaHelper(ayVal, (data.styleNo || "Sample") + "_Ref");
          if (pAy && pAy.formula) updateCell(sheet, row, "BI", pAy.formula);
        }
        ayCell.clearContent();
      }

      var azCell = sheet.getRange(row, colNameToIndex("AZ"));
      var azVal = String(azCell.getValue() || "");
      if (azVal && (azVal.indexOf("=IMAGE") > -1 || (azVal.indexOf("http") === 0 && (azVal.indexOf("drive.google") > -1 || azVal.indexOf(".jpg") > -1 || azVal.indexOf(".png") > -1)))) {
        var bjCell = sheet.getRange(row, colNameToIndex("BJ"));
        if (!bjCell.getValue()) {
          var pAz = formatPhotoFormulaHelper(azVal, (data.styleNo || "Fit") + "_R1");
          if (pAz && pAz.formula) updateCell(sheet, row, "BJ", pAz.formula);
        }
        azCell.clearContent();
      }

      var bhCell = sheet.getRange(row, colNameToIndex("BH"));
      var bhVal = String(bhCell.getValue() || "");
      if (bhVal && (bhVal.indexOf("=IMAGE") > -1 || bhVal.indexOf("http") === 0)) {
        var biCell2 = sheet.getRange(row, colNameToIndex("BI"));
        if (!biCell2.getValue()) {
          var pBh = formatPhotoFormulaHelper(bhVal, (data.styleNo || "Sample") + "_Ref");
          if (pBh && pBh.formula) updateCell(sheet, row, "BI", pBh.formula);
        }
        bhCell.clearContent();
      }
    } catch (_) {}

    // 9. Direct Column Mapping fallback (General & Round 1-5 feedback)
    var directCols = ["A","B","C","D","E","F","G","H","I","J","K","L","M","N","O","P","Q","R","S","T","U","V","W","X","Y","Z","AA","AB","AC","AD","AE","AF","AG","AH","AI","AJ","AK","AL","AM","AN","AO","AP","AQ","AR","AS","AT","AX"];
    for (var c = 0; c < directCols.length; c++) {
      var colKey = directCols[c];
      if (data[colKey] !== undefined && data[colKey] !== null && data[colKey] !== "") {
        updateCell(sheet, row, colKey, data[colKey]);
      }
    }

    // 9b. Handle Round 1st to 5th Reminder Status Updates (Columns AZ to BD)
    // - AZ (Col 52): 1st Round Reminder Mail Status
    // - BA (Col 53): 2nd Round Reminder Mail Status
    // - BB (Col 54): 3rd Round Reminder Mail Status
    // - BC (Col 55): 4th Round Reminder Mail Status
    // - BD (Col 56): 5th Round Reminder Mail Status
    // NOTE: Column AY (51) is completely unused and never stores anything.
    // NOTE: Photos must NEVER be stored in AZ-BD (photos go strictly to BI-BR).
    var isStatusValue = function(val) {
      if (val === undefined || val === null || val === "") return false;
      var str = String(val).trim();
      return str.indexOf("=IMAGE") === -1 && str.indexOf("http://") !== 0 && str.indexOf("https://") !== 0 && str.indexOf("data:image") !== 0;
    };

    if (isStatusValue(data.AZ)) updateCell(sheet, row, "AZ", data.AZ);
    if (isStatusValue(data.reminder1Status || data.reminderStatusR1 || data.r1ReminderStatus)) {
      updateCell(sheet, row, "AZ", data.reminder1Status || data.reminderStatusR1 || data.r1ReminderStatus);
    }

    if (isStatusValue(data.BA)) updateCell(sheet, row, "BA", data.BA);
    if (isStatusValue(data.reminder2Status || data.reminderStatusR2 || data.r2ReminderStatus)) {
      updateCell(sheet, row, "BA", data.reminder2Status || data.reminderStatusR2 || data.r2ReminderStatus);
    }

    if (isStatusValue(data.BB)) updateCell(sheet, row, "BB", data.BB);
    if (isStatusValue(data.reminder3Status || data.reminderStatusR3 || data.r3ReminderStatus)) {
      updateCell(sheet, row, "BB", data.reminder3Status || data.reminderStatusR3 || data.r3ReminderStatus);
    }

    if (isStatusValue(data.BC)) updateCell(sheet, row, "BC", data.BC);
    if (isStatusValue(data.reminder4Status || data.reminderStatusR4 || data.r4ReminderStatus)) {
      updateCell(sheet, row, "BC", data.reminder4Status || data.reminderStatusR4 || data.r4ReminderStatus);
    }

    if (isStatusValue(data.BD)) updateCell(sheet, row, "BD", data.BD);
    if (isStatusValue(data.reminder5Status || data.reminderStatusR5 || data.r5ReminderStatus)) {
      updateCell(sheet, row, "BD", data.reminder5Status || data.reminderStatusR5 || data.r5ReminderStatus);
    }

    // 10. Handle automatic email notification
    if (data.triggerEmail) {
      sendMail(data);
    }
    
    return ContentService.createTextOutput("Success").setMimeType(ContentService.MimeType.TEXT);
    
  } catch (err) {
    Logger.log("doPost Error: " + err.message);
    return ContentService.createTextOutput("Error: " + err.message).setMimeType(ContentService.MimeType.TEXT);
  } finally {
    // Always release the lock
    lock.releaseLock();
  }
}

// Uploads sample garment photo to Google Drive and embeds into Columns BI, BK, BM, BO, BQ
function handleSamplePhotoAttachment(data, sheet, rowIndex) {
  if (!data || !sheet || !rowIndex) return;

  var round = String(data.round || "1");
  var sampleColMap = { "1": "BI", "2": "BK", "3": "BM", "4": "BO", "5": "BQ" };
  var targetCol = sampleColMap[round] || "BI";
  var colIdx = colNameToIndex(targetCol);
  if (colIdx <= 0) return;

  if (sheet.getMaxColumns() < colIdx) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), colIdx - sheet.getMaxColumns() + 2);
  }

  var cell = sheet.getRange(rowIndex, colIdx);

  var rawInput = data.samplePhoto || data.samplePhotoUrl || data.sample_photo_url || data.sample_photo || data[targetCol] || data.BI;
  if (!rawInput) return;

  var photoStr = "";
  if (typeof rawInput === "string") {
    photoStr = rawInput.trim();
  } else if (typeof rawInput === "object") {
    photoStr = String(rawInput.data || rawInput.dataUrl || rawInput.base64 || rawInput.url || "").trim();
  }

  if (!photoStr) return;

  // Already a complete formula
  if (photoStr.indexOf("=") === 0) {
    cell.setFormula(photoStr);
    sheet.setRowHeight(rowIndex, 85);
    sheet.setColumnWidth(colIdx, 115);
    cell.setHorizontalAlignment("center").setVerticalAlignment("middle");
    return;
  }

  var cleanStyle = String(data.styleNo || data.D || "Sample").replace(/[^a-zA-Z0-9_-]/g, "_");

  // HTTP URL (e.g. Supabase Storage URL or Google Drive URL)
  if (photoStr.indexOf("http") === 0) {
    var match = photoStr.match(/https?:\/\/[^\s"\)]+/);
    var cleanUrl = match ? match[0] : photoStr;
    var directUrl = cleanUrl;
    var viewUrl = cleanUrl;

    var driveMatch = cleanUrl.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) || cleanUrl.match(/[?&]id=([a-zA-Z0-9_-]+)/) || cleanUrl.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (driveMatch && driveMatch[1]) {
      var fId = driveMatch[1];
      directUrl = "https://lh3.googleusercontent.com/d/" + fId;
      viewUrl = "https://drive.google.com/file/d/" + fId + "/view";
    }

    cell.setFormula('=HYPERLINK("' + viewUrl + '", IMAGE("' + directUrl + '", 1))');
    sheet.setRowHeight(rowIndex, 85);
    sheet.setColumnWidth(colIdx, 115);
    cell.setHorizontalAlignment("center").setVerticalAlignment("middle");
    cell.setNote("📸 Sample Garment Photo (Round " + round + "):\n" + viewUrl);
    return;
  }

  // Base64 Data - Upload to Drive
  try {
    var folder = getOrCreatePhotoFolder(data.folderId);
    var subFolderName = cleanStyle + "_Samples";
    var targetFolder = folder;

    try {
      var subIter = folder.getFoldersByName(subFolderName);
      if (subIter.hasNext()) {
        targetFolder = subIter.next();
      } else {
        targetFolder = folder.createFolder(subFolderName);
        try { targetFolder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (e) {}
      }
    } catch (_) {
      targetFolder = folder;
    }

    var saved = saveImageToDrive(photoStr, cleanStyle + "_R" + round + "_Sample.jpg", targetFolder);
    if (saved && saved.fileId) {
      cell.setFormula('=HYPERLINK("' + saved.viewUrl + '", IMAGE("' + saved.directUrl + '", 1))');
      sheet.setRowHeight(rowIndex, 85);
      sheet.setColumnWidth(colIdx, 115);
      cell.setHorizontalAlignment("center").setVerticalAlignment("middle");
      cell.setNote("📸 Sample Garment Photo (Round " + round + "):\n👉 Click to view Full HD photo:\n" + saved.viewUrl);
    }
  } catch (sampleErr) {
    Logger.log("Error in handleSamplePhotoAttachment: " + sampleErr.message);
  }
}

// Uploads photos to Google Drive and embeds snapshot directly into the cell (Columns BJ, BL, BN, BP, BR)
function handleAttachments(data, sheet, rowIndex) {
  if (!data || !sheet || !rowIndex) return;

  var round = String(data.round || "1");
  var colMap = { "1": "BJ", "2": "BL", "3": "BN", "4": "BP", "5": "BR" };
  var targetCol = colMap[round] || "BJ";
  var colIdx = colNameToIndex(targetCol);
  if (colIdx <= 0) return;

  if (sheet.getMaxColumns() < colIdx) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), colIdx - sheet.getMaxColumns() + 2);
  }

  var folder = getOrCreatePhotoFolder(data.folderId);
  var cleanStyle = String(data.styleNo || data.D || "Sample").replace(/[^a-zA-Z0-9_-]/g, "_");
  var cleanModel = String(data.modelName || data.B || "Model").replace(/[^a-zA-Z0-9_-]/g, "_");
  var subFolderName = cleanStyle + "_R" + round + "_" + cleanModel;
  var targetFolder = folder;

  try {
    var subIter = folder.getFoldersByName(subFolderName);
    if (subIter.hasNext()) {
      targetFolder = subIter.next();
    } else {
      targetFolder = folder.createFolder(subFolderName);
      try { targetFolder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (e) {}
    }
  } catch (_) {
    targetFolder = folder;
  }

  var imageToEmbedUrl = null;
  var primaryViewUrl = null;
  var photoViewLinks = [];

  // 1. Check Collage / Grid Snapshot if present
  if (data.collageAttachment && (data.collageAttachment.data || typeof data.collageAttachment === "string")) {
    try {
      var cData = data.collageAttachment.data || data.collageAttachment;
      var cSaved = saveImageToDrive(cData, cleanStyle + "_R" + round + "_Grid_Thumbnail.jpg", targetFolder);
      if (cSaved && cSaved.fileId) {
        imageToEmbedUrl = cSaved.directUrl;
        primaryViewUrl = cSaved.viewUrl;
      }
    } catch (cErr) {
      Logger.log("Collage creation error: " + cErr.message);
    }
  }

  // 2. Gather list of photos
  var list = [];
  if (data.allImages && data.allImages.length > 0) list = data.allImages;
  else if (data.attachments && data.attachments.length > 0) list = data.attachments;
  else if (data.images && data.images.length > 0) list = data.images;
  else if (data.fitPhotos && data.fitPhotos.length > 0) list = data.fitPhotos;
  else if (data.fitPhoto || data.fitPhotoUrl || data.fit_photo_url || data[targetCol]) {
    list = [data.fitPhoto || data.fitPhotoUrl || data.fit_photo_url || data[targetCol]];
  }

  var photoFileIds = [];

  for (var i = 0; i < list.length; i++) {
    try {
      var att = list[i];
      if (!att) continue;

      var rawData = "";
      if (typeof att === "string") {
        rawData = att.trim();
      } else if (typeof att === "object") {
        rawData = String(att.data || att.dataUrl || att.base64 || att.url || "").trim();
      }

      if (!rawData) continue;

      // If it's an HTTP URL (Supabase or Drive)
      if (rawData.indexOf("http") === 0) {
        var match = rawData.match(/https?:\/\/[^\s"\)]+/);
        var cleanUrl = match ? match[0] : rawData;
        var directUrl = cleanUrl;
        var viewUrl = cleanUrl;
        var driveMatch = cleanUrl.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) || cleanUrl.match(/[?&]id=([a-zA-Z0-9_-]+)/) || cleanUrl.match(/\/d\/([a-zA-Z0-9_-]+)/);
        if (driveMatch && driveMatch[1]) {
          var fId = driveMatch[1];
          directUrl = "https://lh3.googleusercontent.com/d/" + fId;
          viewUrl = "https://drive.google.com/file/d/" + fId + "/view";
          photoFileIds.push(fId);
        }
        photoViewLinks.push({ id: fId || ("photo_" + i), zoomUrl: viewUrl, name: "Photo " + (i + 1) });
        if (!imageToEmbedUrl) {
          imageToEmbedUrl = directUrl;
          primaryViewUrl = viewUrl;
        }
        continue;
      }

      // If Base64
      var fName = cleanStyle + "_R" + round + "_Photo_" + (i + 1) + ".jpg";
      var savedPhoto = saveImageToDrive(rawData, fName, targetFolder);
      if (savedPhoto && savedPhoto.fileId) {
        photoFileIds.push(savedPhoto.fileId);
        photoViewLinks.push({ id: savedPhoto.fileId, zoomUrl: savedPhoto.viewUrl, name: fName });
        if (!imageToEmbedUrl) {
          imageToEmbedUrl = savedPhoto.directUrl;
          primaryViewUrl = savedPhoto.viewUrl;
        }
      }
    } catch (attErr) {
      Logger.log("File " + i + " upload error: " + attErr.message);
    }
  }

  // 3. Embed Image Formula in Target Cell
  var cell = sheet.getRange(rowIndex, colIdx);
  if (imageToEmbedUrl) {
    try {
      var scriptUrl = "";
      try { scriptUrl = ScriptApp.getService().getUrl(); } catch (_) {}

      var primaryId = photoFileIds.length > 0 ? photoFileIds[0] : "";
      var directCdnZoomUrl = primaryId ? ("https://lh3.googleusercontent.com/d/" + primaryId + "=s0") : (primaryViewUrl || imageToEmbedUrl);
      
      var zoomDestinationUrl = (scriptUrl && scriptUrl.indexOf("http") === 0)
        ? (scriptUrl + "?zoom=" + primaryId + "&folder=" + targetFolder.getId() + "&style=" + encodeURIComponent(cleanStyle) + "&round=" + round)
        : directCdnZoomUrl;

      cell.setFormula('=HYPERLINK("' + zoomDestinationUrl + '", IMAGE("' + imageToEmbedUrl + '", 1))');
      
      sheet.setRowHeight(rowIndex, 85);
      sheet.setColumnWidth(colIdx, 115);
      cell.setHorizontalAlignment("center").setVerticalAlignment("middle");

      var totalPhotos = photoViewLinks.length || (data.attachmentsCount || 1);
      var note = "📸 Fit Photos (" + totalPhotos + " Photos Attached):\n";
      note += "👉 CLICK CELL TO ZOOM PHOTO DIRECTLY!\n\n";
      for (var k = 0; k < photoViewLinks.length; k++) {
        note += "• Photo " + (k + 1) + " (Zoom): " + photoViewLinks[k].zoomUrl + "\n";
      }
      note += "\n• Interactive Gallery: " + zoomDestinationUrl;
      cell.setNote(note);

    } catch (imgErr) {
      Logger.log("Error setting image cell formula: " + imgErr.message);
      if (primaryViewUrl) {
        cell.setValue(primaryViewUrl);
      }
    }
  } else if (data.attachmentsCount && data.attachmentsCount > 0) {
    cell.setValue(data.attachmentsCount + " photos attached");
  }
}

// Converts column letters like A, Z, AX, BI, BJ to 1-based numeric column indices
function colNameToIndex(colName) {
  if (!colName) return 0;
  var col = String(colName).trim().toUpperCase();
  var num = 0;
  for (var i = 0; i < col.length; i++) {
    num = num * 26 + (col.charCodeAt(i) - 64);
  }
  return num;
}

function colLetterToIndex(col) {
  return colNameToIndex(col);
}

function getOrCreatePhotoFolder(folderId) {
  if (folderId) {
    try {
      var f = DriveApp.getFolderById(folderId);
      if (f) return f;
    } catch (_) {}
  }
  try {
    var folders = DriveApp.getFoldersByName("SOIE_Fit_Attachments");
    if (folders.hasNext()) {
      return folders.next();
    }
    var created = DriveApp.createFolder("SOIE_Fit_Attachments");
    try {
      created.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    } catch (_) {}
    return created;
  } catch (err) {
    Logger.log("Folder creation error: " + err.message);
    return DriveApp.getRootFolder();
  }
}

function saveImageToDrive(base64Data, fileName, targetFolder) {
  try {
    if (!base64Data) return null;
    var contentType = "image/jpeg";
    var cleanBase64 = String(base64Data).trim();
    
    var commaIdx = cleanBase64.indexOf(",");
    if (cleanBase64.indexOf("data:") === 0 && commaIdx > -1) {
      var header = cleanBase64.substring(5, commaIdx);
      var semiIdx = header.indexOf(";");
      if (semiIdx > -1) {
        contentType = header.substring(0, semiIdx).trim() || "image/jpeg";
      }
      cleanBase64 = cleanBase64.substring(commaIdx + 1);
    }
    
    cleanBase64 = cleanBase64.replace(/\s+/g, "");
    cleanBase64 = cleanBase64.replace(/-/g, "+").replace(/_/g, "/");
    while (cleanBase64.length % 4 !== 0) {
      cleanBase64 += "=";
    }
    
    var decoded = Utilities.base64Decode(cleanBase64);
    var blob = Utilities.newBlob(decoded, contentType, fileName);

    var destFolder = targetFolder || getOrCreatePhotoFolder();
    var file = destFolder.createFile(blob);

    try {
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    } catch (_) {
      try {
        file.setSharing(DriveApp.Access.DOMAIN_WITH_LINK, DriveApp.Permission.VIEW);
      } catch (_) {}
    }

    var fileId = file.getId();
    var directUrl = "https://lh3.googleusercontent.com/d/" + fileId;
    var viewUrl = "https://drive.google.com/file/d/" + fileId + "/view";

    return { directUrl: directUrl, viewUrl: viewUrl, fileId: fileId };
  } catch (err) {
    Logger.log("saveImageToDrive error: " + err.toString());
    var errMsg = err.toString();
    var isAuth = errMsg.indexOf("permission") > -1 || errMsg.indexOf("not allowed") > -1;
    return { error: errMsg, needsAuth: isAuth };
  }
}

/**
 * Smart Sheet Finder: Supports aliases & case-insensitivity:
 *  - "Active wear" <-> "Active Wear" <-> "Active" <-> "AT"
 *  - "LW" <-> "Lounge Wear" <-> "Loungewear" <-> "Lounge"
 *  - "SW" <-> "Sleep Wear" <-> "Sleepwear" <-> "Night Wear" <-> "NT"
 *  - "General"
 */
function findTargetSheet(ss, sheetName) {
  if (!ss) ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!sheetName) sheetName = "General";
  var raw = String(sheetName).trim();
  
  // 1. Direct exact match
  var sheet = ss.getSheetByName(raw);
  if (sheet) return sheet;
  
  // 2. Case-insensitive exact match
  var allSheets = ss.getSheets();
  var lower = raw.toLowerCase();
  for (var i = 0; i < allSheets.length; i++) {
    if (allSheets[i].getName().trim().toLowerCase() === lower) {
      return allSheets[i];
    }
  }
  
  // 3. Known Aliases mapping (Active wear, LW, SW, General)
  var aliasMap = {
    "active wear": ["active wear", "activewear", "active", "at"],
    "activewear": ["active wear", "activewear", "active", "at"],
    "active": ["active wear", "activewear", "active", "at"],
    "at": ["active wear", "activewear", "active", "at"],
    "lw": ["lw", "lounge wear", "loungewear", "lounge"],
    "lounge wear": ["lw", "lounge wear", "loungewear", "lounge"],
    "loungewear": ["lw", "lounge wear", "loungewear", "lounge"],
    "lounge": ["lw", "lounge wear", "loungewear", "lounge"],
    "sw": ["sw", "sleep wear", "sleepwear", "night wear", "nightwear", "nt"],
    "sleep wear": ["sw", "sleep wear", "sleepwear", "night wear", "nightwear", "nt"],
    "sleepwear": ["sw", "sleep wear", "sleepwear", "night wear", "nightwear", "nt"],
    "night wear": ["sw", "sleep wear", "sleepwear", "night wear", "nightwear", "nt"],
    "nt": ["sw", "sleep wear", "sleepwear", "night wear", "nightwear", "nt"],
    "general": ["general", "sheet1"]
  };
  
  var targetAliases = aliasMap[lower];
  if (targetAliases) {
    for (var j = 0; j < allSheets.length; j++) {
      var sName = allSheets[j].getName().trim().toLowerCase();
      if (targetAliases.indexOf(sName) !== -1) {
        return allSheets[j];
      }
    }
  }
  
  // 4. Substring / contains match
  for (var k = 0; k < allSheets.length; k++) {
    var candidate = allSheets[k].getName().trim().toLowerCase();
    if (candidate.indexOf(lower) !== -1 || lower.indexOf(candidate) !== -1) {
      return allSheets[k];
    }
  }
  
  // 5. Not found in existing sheets -> create sheet with headers
  return getSheetWithHeaders(ss, raw);
}

function getSheetWithHeaders(ss, sheetName) {
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  }
  
  if (sheet.getMaxColumns() < 75) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), 75 - sheet.getMaxColumns());
  }

  if (sheet.getLastRow() === 0) {
    var headers = [
      "Timestamp", "Model Name", "Type of sample", "Style no", "Description", "Size", 
      "R1 Color", "R1 Fit Date", "R1 Received", "R1 Comments Date", "R1 Before Wash", "R1 After Wash", "R1 Fabric/Trims", "R1 Feedback",
      "R2 Color", "R2 Fit Date", "R2 Received", "R2 Comments Date", "R2 Before Wash", "R2 After Wash", "R2 Fabric/Trims", "R2 Feedback",
      "R3 Color", "R3 Fit Date", "R3 Received", "R3 Comments Date", "R3 Before Wash", "R3 After Wash", "R3 Fabric/Trims", "R3 Feedback",
      "R4 Color", "R4 Fit Date", "R4 Received", "R4 Comments Date", "R4 Before Wash", "R4 After Wash", "R4 Fabric/Trims", "R4 Feedback",
      "R5 Color", "R5 Fit Date", "R5 Received", "R5 Comments Date", "R5 Before Wash", "R5 After Wash", "R5 Fabric/Trims", "R5 Feedback",
      "", "", "", "", // AU(47), AV(48), AW(49)
      "Record ID", // AX (50)
      "", // AY (51) - Blank
      "Reminder Mail Status Reminder 1st", // AZ (52)
      "Reminder 2nd", // BA (53)
      "Reminder 3rd", // BB (54)
      "Reminder 4th", // BC (55)
      "Reminder 5th", // BD (56)
      "", "", "", "", // BE(57), BF(58), BG(59), BH(60) - Blank
      "1st R. Product Image", // BI (61)
      "1st R.Model Fit Img Issues", // BJ (62)
      "2nd R. Product Image", // BK (63)
      "2nd R.Model Fit Img Issues", // BL (64)
      "3rd R. Product Image", // BM (65)
      "3rd R.Model Fit Img Issues", // BN (66)
      "4th R. Product Image", // BO (67)
      "4th R.Model Fit Img Issues", // BP (68)
      "5th R. Product Image", // BQ (69)
      "5th R.Model Fit Img Issues"  // BR (70)
    ];
    sheet.appendRow(headers);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, headers.length).setBackground("#f3f4f6").setFontWeight("bold");
  }

  // Ensure AX header exists
  try {
    var axCell = sheet.getRange(1, 50);
    if (!axCell.getValue()) {
      axCell.setValue("Record ID").setBackground("#e2e8f0").setFontWeight("bold");
    }
  } catch (_) {}

  return sheet;
}

function findRow(sheet, assignmentId) {
  if (!assignmentId) return -1;
  if (sheet.getMaxColumns() < 50) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), 75 - sheet.getMaxColumns());
  }
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;
  var ids = sheet.getRange(1, 50, lastRow, 1).getValues();
  var targetId = String(assignmentId).trim().toLowerCase();
  for (var i = 1; i < ids.length; i++) {
    if (String(ids[i][0]).trim().toLowerCase() === targetId) return i + 1;
  }
  return -1;
}

function findRowByStyle(sheet, styleNo, modelName) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;
  var targetStyle = String(styleNo).trim().toLowerCase();
  var targetModel = modelName ? String(modelName).trim().toLowerCase() : "";
  var data = sheet.getRange(2, 2, lastRow - 1, 3).getValues();
  for (var i = 0; i < data.length; i++) {
    var mName = String(data[i][0]).trim().toLowerCase();
    var sNo = String(data[i][2]).trim().toLowerCase();
    if (sNo === targetStyle && (!targetModel || mName === targetModel)) {
      return i + 2;
    }
  }
  return -1;
}

function updateCell(sheet, row, colName, value) {
  if (value === undefined || value === null || value === "") return;
  var colIndex = colNameToIndex(colName);
  if (colIndex > 0) {
    if (sheet.getMaxColumns() < colIndex) {
      sheet.insertColumnsAfter(sheet.getMaxColumns(), colIndex - sheet.getMaxColumns() + 5);
    }
    var range = sheet.getRange(row, colIndex);
    var strVal = String(value).trim();
    if (strVal.charAt(0) === "=") {
      try {
        range.setFormula(strVal);
      } catch (fErr) {
        Logger.log("Formula error on " + colName + row + ": " + fErr.toString());
        try {
          var semiFormula = strVal.replace(/,\s*(IMAGE|1)/g, "; $1");
          range.setFormula(semiFormula);
        } catch (_) {
          var urlMatch = strVal.match(/https?:\/\/[^\s"\)]+/);
          if (urlMatch) {
            range.setValue(urlMatch[0]);
          } else {
            range.setValue(strVal);
          }
        }
      }
    } else {
      if (strVal.length > 49000) {
        strVal = strVal.substring(0, 49000);
      }
      range.setValue(strVal);
    }
  }
}

function formatPhotoFormulaHelper(photoStr, filePrefix) {
  if (!photoStr) return null;
  photoStr = String(photoStr).trim();
  if (photoStr.indexOf("=") === 0) return { formula: photoStr };
  if (photoStr.indexOf("http") === 0) {
    var match = photoStr.match(/https?:\/\/[^\s"\)]+/);
    var cleanUrl = match ? match[0] : photoStr;
    var directUrl = cleanUrl;
    var viewUrl = cleanUrl;
    var driveMatch = cleanUrl.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) || cleanUrl.match(/[?&]id=([a-zA-Z0-9_-]+)/) || cleanUrl.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (driveMatch && driveMatch[1]) {
      var fId = driveMatch[1];
      directUrl = "https://lh3.googleusercontent.com/d/" + fId;
      viewUrl = "https://drive.google.com/file/d/" + fId + "/view";
    }
    return {
      formula: '=HYPERLINK("' + viewUrl + '", IMAGE("' + directUrl + '", 1))',
      directUrl: directUrl,
      viewUrl: viewUrl
    };
  }
  return null;
}

/**
 * ⚡ ONE-CLICK REPAIR & CLEANUP UTILITY:
 * Run this function in the toolbar ("fixAndCleanAllPhotoColumns" -> "Run") to immediately:
 * 1. Move any misplaced photos from AY, AZ, or BH directly into correct columns BI (1st R. Product Image) & BJ (1st R.Model Fit Img Issues)!
 * 2. Clear AY and BH, and restore AZ for "Reminder Mail Status"!
 * 3. Set row height to 85px and photo column widths to 115px so photos display cleanly!
 */
function fixAndCleanAllPhotoColumns() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheets = ss.getSheets();
  var totalCleaned = 0;
  
  for (var s = 0; s < sheets.length; s++) {
    var sheet = sheets[s];
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) continue;
    
    if (sheet.getMaxColumns() < 75) {
      sheet.insertColumnsAfter(sheet.getMaxColumns(), 75 - sheet.getMaxColumns());
    }
    
    for (var r = 2; r <= lastRow; r++) {
      // 1. Check AY (Col 51)
      var ayCell = sheet.getRange(r, colNameToIndex("AY"));
      var ayVal = String(ayCell.getValue() || "");
      if (ayVal && (ayVal.indexOf("=IMAGE") > -1 || ayVal.indexOf("http") === 0)) {
        var biCell = sheet.getRange(r, colNameToIndex("BI"));
        if (!biCell.getValue()) {
          var pAy = formatPhotoFormulaHelper(ayVal, "Sample_Ref");
          if (pAy && pAy.formula) updateCell(sheet, r, "BI", pAy.formula);
        }
        ayCell.clearContent();
        totalCleaned++;
      }
      
      // 2. Check AZ (Col 52 - Reminder 1st)
      var azCell = sheet.getRange(r, colNameToIndex("AZ"));
      var azVal = String(azCell.getValue() || "");
      if (azVal && (azVal.indexOf("=IMAGE") > -1 || (azVal.indexOf("http") === 0 && (azVal.indexOf("drive.google") > -1 || azVal.indexOf(".jpg") > -1 || azVal.indexOf(".png") > -1)))) {
        var bjCell = sheet.getRange(r, colNameToIndex("BJ"));
        if (!bjCell.getValue()) {
          var pAz = formatPhotoFormulaHelper(azVal, "Fit_R1");
          if (pAz && pAz.formula) updateCell(sheet, r, "BJ", pAz.formula);
        }
        azCell.clearContent();
        totalCleaned++;
      }
      
      // 3. Check BH (Col 60)
      var bhCell = sheet.getRange(r, colNameToIndex("BH"));
      var bhVal = String(bhCell.getValue() || "");
      if (bhVal && (bhVal.indexOf("=IMAGE") > -1 || bhVal.indexOf("http") === 0)) {
        var biCell2 = sheet.getRange(r, colNameToIndex("BI"));
        if (!biCell2.getValue()) {
          var pBh = formatPhotoFormulaHelper(bhVal, "Sample_Ref");
          if (pBh && pBh.formula) updateCell(sheet, r, "BI", pBh.formula);
        }
        bhCell.clearContent();
        totalCleaned++;
      }
      
      sheet.setRowHeight(r, 85);
    }
    formatPhotoColumns(sheet);
  }
  
  Logger.log("✅ Successfully cleaned and migrated " + totalCleaned + " photo cells to BI and BJ!");
  return "SUCCESS: Migrated all misplaced photos to BI/BJ and restored AY, AZ, BH!";
}

function sendMail(data) {
  var recipient = data.modelEmail || data.senderEmail;
  if (!recipient || (!data.link && !data.responseUrl)) {
    return ContentService.createTextOutput("Email missing recipient or link").setMimeType(ContentService.MimeType.TEXT);
  }
  
  var link = data.link || data.responseUrl;
  var round = data.round || "1";
  var styleName = data.styleNo || data.style_number || "New Sample";
  var subject = "Action Required: Fit Comments for Style " + styleName + " (Round " + round + ")";
  
  var photoHtml = "";
  var photoUrl = data.samplePhotoUrl || data.samplePhoto || data.BI || "";
  if (photoUrl && photoUrl.indexOf("http") === 0) {
    photoHtml = 
      "<div style='text-align: center; margin: 20px 0; padding: 12px; background-color: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0;'>" +
        "<p style='margin: 0 0 10px; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #64748b; font-weight: bold;'>Garment Sample Reference Photo</p>" +
        "<a href='" + photoUrl + "' target='_blank'>" +
          "<img src='" + photoUrl + "' alt='Garment Sample' style='max-width: 100%; max-height: 280px; border-radius: 6px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); object-fit: contain;' />" +
        "</a>" +
        "<p style='margin: 8px 0 0; font-size: 11px; color: #4f46e5;'>Tap photo to view in high resolution</p>" +
      "</div>";
  }

  var buttonHtml = link ? 
    ("<div style='text-align: center; margin: 25px 0;'>" +
      "<a href='" + link + "' style='background-color: #4338ca; color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 15px; display: inline-block; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);'>Open Feedback Form</a>" +
    "</div>" +
    "<hr style='border: 0; border-top: 1px solid #e2e8f0; margin: 25px 0;'>" +
    "<p style='color: #4f46e5; font-size: 12px; word-break: break-all;'>" + link + "</p>") :
    ("<p style='color: #64748b; font-size: 13px;'>Sample has been assigned. Please coordinate with the fit technician.</p>");

  var htmlBody = 
    "<div style='font-family: sans-serif; max-width: 600px; margin: auto; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden;'>" +
      "<div style='background-color: #4f46e5; padding: 25px; text-align: center; color: white;'>" +
        "<h1 style='margin: 0; font-size: 22px; font-weight: 700;'>Fit Feedback Required</h1>" +
        "<p style='margin: 8px 0 0; opacity: 0.9; font-size: 14px;'>Style: " + styleName + " | Round " + round + "</p>" +
      "</div>" +
      "<div style='padding: 25px; background-color: white; color: #334155; font-size: 14px; line-height: 1.6;'>\" +" +
        "<p>Hello <strong>" + (data.modelName || "Model") + "</strong>,</p>" +
        "<p>You have a new sample fit request that requires your comments and observations:</p>" +
        photoHtml +
        "<ul style='background: #f8fafc; padding: 15px 20px 15px 35px; border-radius: 8px; margin: 15px 0;'>" +
          "<li><strong>Sample Type:</strong> " + (data.sampleType || data.typeOfSample || "Fitting") + "</li>\" +" +
          "<li><strong>Style No:</strong> " + styleName + "</li>\" +" +
          "<li><strong>Size:</strong> " + (data.size || "N/A") + "</li>\" +" +
          "<li><strong>Color:</strong> " + (data.color || "N/A") + "</li>\" +" +
          (data.description ? "<li><strong>Instructions:</strong> " + data.description + "</li>" : "") +
        "</ul>" +
        buttonHtml +
      "</div>" +
    "</div>";

  try {
    MailApp.sendEmail({
      to: recipient,
      subject: subject,
      htmlBody: htmlBody,
      replyTo: data.senderEmail || undefined,
      name: (data.senderName || "SOIE Fit System")
    });
    return ContentService.createTextOutput("Mail sent successfully").setMimeType(ContentService.MimeType.TEXT);
  } catch (mErr) {
    Logger.log("sendMail error: " + mErr.message);
    return ContentService.createTextOutput("Error sending mail: " + mErr.message).setMimeType(ContentService.MimeType.TEXT);
  }
}

// 1. Adds Menu in Google Sheets
function onOpen() {
  try {
    SpreadsheetApp.getUi()
      .createMenu("📸 Fit Photos")
      .addItem("🔍 Zoom Selected Photo (In-Sheet Dialog)", "showPhotoZoomDialog")
      .addItem("🖼️ Open Live Photo Zoom Sidebar", "showPhotoZoomSidebar")
      .addSeparator()
      .addItem("📑 Verify / Create Category Tabs (Active wear, LW, SW, General)", "createStandardCategoryTabs")
      .addItem("⚡ Format Photo Columns (BI to BR)", "formatPhotoColumns")
      .addItem("🧹 Fix & Clean Misplaced Photos (AY/AZ -> BI/BJ)", "fixAndCleanAllPhotoColumns")
      .addItem("🌐 Open Web Zoom Viewer (New Tab)", "openPhotoZoomInNewTab")
      .addItem("ℹ️ How to Use Photo Zoom", "showPhotoHelpDialog")
      .addToUi();
  } catch (_) {}
}

// Automatically creates or verifies the standard tabs: Active wear, LW, SW, General
function createStandardCategoryTabs() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var tabs = ["Active wear", "LW", "SW", "General"];
  var confirmed = [];
  for (var i = 0; i < tabs.length; i++) {
    var sh = findTargetSheet(ss, tabs[i]);
    confirmed.push(sh.getName());
  }
  SpreadsheetApp.getUi().alert("✅ Success! Standard category tabs verified & ready:\n\n" + confirmed.join(", "));
}

// Backward compatibility alias
function createAllSeriesTabs() {
  createStandardCategoryTabs();
}

// 2. Web App entry point: Serves Interactive Zoom Viewer on GET
function doGet(e) {
  if (e && e.parameter && (e.parameter.zoom || e.parameter.folder || e.parameter.fileId)) {
    return renderPhotoZoomViewer(e.parameter);
  }

  return ContentService.createTextOutput(JSON.stringify({
    status: "ok",
    file: "Code.gs",
    message: "SOIE Fit Comments & Photo Zoom Webhook is Active!",
    timestamp: new Date().toISOString()
  })).setMimeType(ContentService.MimeType.JSON);
}

// 3. In-Sheet Zoom Dialog
function showPhotoZoomDialog() {
  var sheet = SpreadsheetApp.getActiveSheet();
  var cell = sheet.getActiveCell();
  var formula = cell.getFormula() || "";
  var note = cell.getNote() || "";
  var fileId = extractFileId(formula) || extractFileId(note);
  var folderId = extractFolderId(formula) || extractFolderId(note);
  
  if (!fileId && !folderId) {
    SpreadsheetApp.getUi().alert("No fit photo found in this cell.\n\nPlease select a cell in Columns BI to BR that contains a photo thumbnail.");
    return;
  }
  
  var photos = getPhotosFromFolderOrId(folderId, fileId);
  var html = buildZoomViewerHtml(photos, "Fit Photo Zoom", "", fileId);
  var htmlOutput = HtmlService.createHtmlOutput(html).setWidth(950).setHeight(680);
  SpreadsheetApp.getUi().showModalDialog(htmlOutput, "📸 Fit Photo Zoom Viewer");
}

// 4. In-Sheet Zoom Sidebar
function showPhotoZoomSidebar() {
  var html = buildSidebarHtml();
  var htmlOutput = HtmlService.createHtmlOutput(html).setTitle("📸 Photo Inspector");
  SpreadsheetApp.getUi().showSidebar(htmlOutput);
}

function getActiveCellPhotoData() {
  var sheet = SpreadsheetApp.getActiveSheet();
  var cell = sheet.getActiveCell();
  var formula = cell.getFormula() || "";
  var note = cell.getNote() || "";
  var row = cell.getRow();
  var colLetter = cell.getA1Notation().replace(/[0-9]/g, '');

  var fileId = extractFileId(formula) || extractFileId(note);
  var folderId = extractFolderId(formula) || extractFolderId(note);

  if (!fileId && !folderId) {
    var checkCols = ["BI", "BJ", "BK", "BL", "BM", "BN", "BO", "BP", "BQ", "BR"];
    for (var c = 0; c < checkCols.length; c++) {
      var checkCell = sheet.getRange(row, colNameToIndex(checkCols[c]));
      var cF = checkCell.getFormula() || "";
      var cN = checkCell.getNote() || "";
      fileId = extractFileId(cF) || extractFileId(cN);
      folderId = extractFolderId(cF) || extractFolderId(cN);
      if (fileId || folderId) {
        colLetter = checkCols[c];
        break;
      }
    }
  }

  if (!fileId && !folderId) {
    return { hasPhoto: false, message: "Select a photo cell in Columns BI-BR" };
  }

  var photos = getPhotosFromFolderOrId(folderId, fileId);
  var style = sheet.getRange(row, 4).getValue() || "Sample";
  var model = sheet.getRange(row, 2).getValue() || "";

  return {
    hasPhoto: true,
    cell: colLetter + row,
    style: style,
    model: model,
    photos: photos,
    activeFileId: fileId
  };
}

function formatPhotoColumns(sheetOpt) {
  var sheet = sheetOpt || SpreadsheetApp.getActiveSheet();
  var photoCols = ["BI", "BJ", "BK", "BL", "BM", "BN", "BO", "BP", "BQ", "BR"];
  for (var i = 0; i < photoCols.length; i++) {
    var colIdx = colNameToIndex(photoCols[i]);
    if (colIdx > 0 && colIdx <= sheet.getMaxColumns()) {
      sheet.setColumnWidth(colIdx, 115);
      var lastRow = sheet.getLastRow();
      if (lastRow > 1) {
        var range = sheet.getRange(2, colIdx, lastRow - 1, 1);
        range.setHorizontalAlignment("center").setVerticalAlignment("middle");
      }
    }
  }
}

function showPhotoHelpDialog() {
  var msg = "📸 HOW TO ZOOM PHOTOS IN GOOGLE SHEETS:\n\n" +
    "1. DIRECT CLICK ZOOM:\n" +
    "   Click on any photo cell in Columns BI to BR.\n" +
    "   Click the blue link preview that pops up to open the Full HD Zoom Viewer!\n\n" +
    "2. IN-SHEET POPUP DIALOG:\n" +
    "   Select any photo cell and click:\n" +
    "   Menu '📸 Fit Photos' -> '🔍 Zoom Selected Photo'\n\n" +
    "3. SIDEBAR INSPECTOR:\n" +
    "   Click Menu '📸 Fit Photos' -> '🖼️ Open Live Photo Zoom Sidebar' to inspect photos side-by-side!";
  SpreadsheetApp.getUi().alert(msg);
}

function openPhotoZoomInNewTab() {
  var sheet = SpreadsheetApp.getActiveSheet();
  var cell = sheet.getActiveCell();
  var formula = cell.getFormula() || "";
  var note = cell.getNote() || "";
  var url = extractHyperlinkUrl(formula) || extractHyperlinkUrl(note);
               
  if (url) {
    var html = "<script>window.open('" + url + "', '_blank'); google.script.host.close();<" + "/script>" +
               "<div style='font-family:sans-serif;padding:20px;text-align:center;'>Opening Photo Zoom Viewer...</div>";
    var htmlOutput = HtmlService.createHtmlOutput(html).setWidth(300).setHeight(100);
    SpreadsheetApp.getUi().showModalDialog(htmlOutput, "Opening Zoom...");
  } else {
    SpreadsheetApp.getUi().alert("Please select a photo cell in Columns BI-BR.");
  }
}

function renderPhotoZoomViewer(params) {
  var fileId = params.zoom || params.fileId || "";
  var folderId = params.folder || "";
  var style = params.style || "Fit Sample";
  var round = params.round || "1";
  
  var photos = getPhotosFromFolderOrId(folderId, fileId);
  var html = buildZoomViewerHtml(photos, style, round, fileId);
  return HtmlService.createHtmlOutput(html)
    .setTitle("Fit Photo Zoom - " + style + " (R" + round + ")")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag("viewport", "width=device-width, initial-scale=1.0, maximum-scale=5.0");
}

function getPhotosFromFolderOrId(folderId, fileId) {
  var photos = [];
  if (folderId) {
    try {
      var folder = DriveApp.getFolderById(folderId);
      var files = folder.getFiles();
      while (files.hasNext()) {
        var f = files.next();
        var fId = f.getId();
        var fName = f.getName();
        if (f.getMimeType().indexOf("image") > -1) {
          photos.push({
            id: fId,
            name: fName,
            url: "https://lh3.googleusercontent.com/d/" + fId + "=s0",
            thumb: "https://lh3.googleusercontent.com/d/" + fId + "=s200",
            isGrid: fName.indexOf("Grid") > -1
          });
        }
      }
    } catch (e) {
      Logger.log("Folder read error: " + e.message);
    }
  }
  
  if (photos.length === 0 && fileId) {
    photos.push({
      id: fileId,
      name: "Fit Photo",
      url: "https://lh3.googleusercontent.com/d/" + fileId + "=s0",
      thumb: "https://lh3.googleusercontent.com/d/" + fileId + "=s200",
      isGrid: false
    });
  }
  return photos;
}

function buildZoomViewerHtml(photos, style, round, initialFileId) {
  var photosJson = JSON.stringify(photos);
  var html = '<!DOCTYPE html>' +
    '<html><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0">' +
    '<title>' + escapeHtml(style) + ' Photo Zoom</title>' +
    '<style>' +
    '* { box-sizing: border-box; margin: 0; padding: 0; user-select: none; }' +
    'body { background: #070a11; color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; height: 100vh; display: flex; flex-direction: column; overflow: hidden; }' +
    'header { background: rgba(15, 23, 42, 0.95); border-bottom: 1px solid #1e293b; padding: 10px 16px; display: flex; align-items: center; justify-content: space-between; z-index: 10; }' +
    '.title-group { display: flex; align-items: center; gap: 10px; }' +
    '.badge { background: #4f46e5; color: #fff; font-size: 11px; font-weight: 700; padding: 3px 8px; border-radius: 6px; }' +
    '.title { font-size: 14px; font-weight: 600; color: #f8fafc; }' +
    '.subtitle { font-size: 11px; color: #94a3b8; }' +
    '.controls { display: flex; align-items: center; gap: 6px; }' +
    '.btn { background: #1e293b; color: #e2e8f0; border: 1px solid #334155; padding: 6px 12px; font-size: 12px; font-weight: 600; border-radius: 6px; cursor: pointer; display: inline-flex; align-items: center; gap: 4px; transition: all 0.15s; }' +
    '.btn:hover { background: #334155; color: #fff; border-color: #475569; }' +
    '.btn:active { transform: scale(0.96); }' +
    '.btn-primary { background: #4338ca; border-color: #4f46e5; color: #fff; }' +
    '.btn-primary:hover { background: #4f46e5; }' +
    '.zoom-pct { font-size: 12px; font-variant-numeric: tabular-nums; color: #a5b4fc; min-width: 44px; text-align: center; }' +
    '.stage-container { flex: 1; position: relative; overflow: hidden; display: flex; align-items: center; justify-content: center; background: #05070c; cursor: grab; }' +
    '.stage-container:active { cursor: grabbing; }' +
    '#viewer-img { max-width: 95%; max-height: 90%; transform-origin: center center; transition: transform 0.05s ease-out; box-shadow: 0 20px 50px rgba(0,0,0,0.8); pointer-events: none; border-radius: 4px; }' +
    '.hint-bar { position: absolute; top: 12px; left: 50%; transform: translateX(-50%); background: rgba(15, 23, 42, 0.85); backdrop-filter: blur(8px); border: 1px solid rgba(255,255,255,0.1); padding: 4px 14px; border-radius: 20px; font-size: 11px; color: #94a3b8; pointer-events: none; z-index: 5; white-space: nowrap; }' +
    'footer { background: rgba(15, 23, 42, 0.95); border-top: 1px solid #1e293b; padding: 8px 16px; display: flex; align-items: center; gap: 10px; overflow-x: auto; z-index: 10; }' +
    '.thumb { width: 56px; height: 56px; border-radius: 6px; overflow: hidden; border: 2px solid transparent; cursor: pointer; flex-shrink: 0; opacity: 0.65; transition: all 0.15s; background: #1e293b; }' +
    '.thumb:hover { opacity: 0.9; border-color: #64748b; }' +
    '.thumb.active { opacity: 1; border-color: #6366f1; box-shadow: 0 0 10px rgba(99, 102, 241, 0.5); }' +
    '.thumb img { width: 100%; height: 100%; object-fit: cover; }' +
    '</style></head>' +
    '<body>' +
    '<header>' +
    '  <div class="title-group">' +
    '    <span class="badge">' + (round ? 'Round ' + escapeHtml(round) : 'Fit Photos') + '</span>' +
    '    <div>' +
    '      <div class="title">' + escapeHtml(style) + '</div>' +
    '      <div class="subtitle" id="photo-counter">Loading photo...</div>' +
    '    </div>' +
    '  </div>' +
    '  <div class="controls">' +
    '    <button class="btn" onclick="zoomDelta(-0.25)" title="Zoom Out">🔍 -</button>' +
    '    <span class="zoom-pct" id="zoom-level">100%</span>' +
    '    <button class="btn" onclick="zoomDelta(0.25)" title="Zoom In">🔍 +</button>' +
    '    <button class="btn" onclick="resetZoom()" title="Fit to Screen">⤢ Fit</button>' +
    '    <button class="btn" onclick="setActualSize()" title="100% Actual Resolution">1:1 HD</button>' +
    '    <button class="btn" onclick="rotateImage()" title="Rotate 90°">⟳ Rotate</button>' +
    '    <button class="btn btn-primary" onclick="openOriginal()" title="Open Original Image">↗ Full Res</button>' +
    '  </div>' +
    '</header>' +
    '<div class="stage-container" id="stage">' +
    '  <div class="hint-bar">💡 Scroll to Zoom • Drag to Pan • Double-Click to Zoom In/Out</div>' +
    '  <img id="viewer-img" src="" alt="Fit Photo">' +
    '</div>' +
    '<footer id="thumbs-bar"></footer>' +
    '<script>' +
    'var photos = ' + photosJson + ';' +
    'var currentIndex = 0;' +
    'var scale = 1;' +
    'var posX = 0;' +
    'var posY = 0;' +
    'var rotation = 0;' +
    'var isDragging = false;' +
    'var startX = 0;' +
    'var startY = 0;' +
    'var stage = document.getElementById("stage");' +
    'var img = document.getElementById("viewer-img");' +
    'var zoomText = document.getElementById("zoom-level");' +
    'var counter = document.getElementById("photo-counter");' +
    'var thumbsBar = document.getElementById("thumbs-bar");' +
    'function init() {' +
    '  if (!photos || photos.length === 0) return;' +
    '  for (var i = 0; i < photos.length; i++) {' +
    '    if (photos[i].id === "' + initialFileId + '") { currentIndex = i; break; }' +
    '  }' +
    '  renderThumbs();' +
    '  loadPhoto(currentIndex);' +
    '  setupEvents();' +
    '}' +
    'function renderThumbs() {' +
    '  thumbsBar.innerHTML = "";' +
    '  if (photos.length <= 1) { thumbsBar.style.display = "none"; return; }' +
    '  photos.forEach(function(p, idx) {' +
    '    var d = document.createElement("div");' +
    '    d.className = "thumb" + (idx === currentIndex ? " active" : "");' +
    '    d.title = p.isGrid ? "Composite Grid" : "Photo " + (idx + 1);' +
    '    d.onclick = function() { loadPhoto(idx); };' +
    '    var im = document.createElement("img");' +
    '    im.src = p.thumb || p.url;' +
    '    d.appendChild(im);' +
    '    thumbsBar.appendChild(d);' +
    '  });' +
    '}' +
    'function loadPhoto(idx) {' +
    '  currentIndex = idx;' +
    '  var p = photos[idx];' +
    '  img.src = p.url;' +
    '  resetZoom();' +
    '  counter.textContent = (p.isGrid ? "Grid Overview" : "Photo " + (idx + 1) + " of " + photos.length) + " • " + (p.name || "");' +
    '  var thumbs = document.querySelectorAll(".thumb");' +
    '  thumbs.forEach(function(t, i) { t.className = "thumb" + (i === idx ? " active" : ""); });' +
    '}' +
    'function updateTransform() {' +
    '  img.style.transform = "translate(" + posX + "px, " + posY + "px) scale(" + scale + ") rotate(" + rotation + "deg)";' +
    '  zoomText.textContent = Math.round(scale * 100) + "%";' +
    '}' +
    'function zoomDelta(d) {' +
    '  scale = Math.min(Math.max(scale + d, 0.2), 6);' +
    '  updateTransform();' +
    '}' +
    'function resetZoom() {' +
    '  scale = 1;' +
    '  posX = 0;' +
    '  posY = 0;' +
    '  rotation = 0;' +
    '  updateTransform();' +
    '}' +
    'function setActualSize() {' +
    '  scale = (scale === 2) ? 1 : 2;' +
    '  posX = 0;' +
    '  posY = 0;' +
    '  updateTransform();' +
    '}' +
    'function rotateImage() {' +
    '  rotation = (rotation + 90) % 360;' +
    '  updateTransform();' +
    '}' +
    'function openOriginal() {' +
    '  if (photos[currentIndex]) window.open(photos[currentIndex].url, "_blank");' +
    '}' +
    'function setupEvents() {' +
    '  stage.addEventListener("wheel", function(e) {' +
    '    e.preventDefault();' +
    '    var delta = e.deltaY < 0 ? 0.2 : -0.2;' +
    '    zoomDelta(delta);' +
    '  }, { passive: false });' +
    '  stage.addEventListener("mousedown", function(e) {' +
    '    if (e.button !== 0) return;' +
    '    isDragging = true;' +
    '    startX = e.clientX - posX;' +
    '    startY = e.clientY - posY;' +
    '  });' +
    '  window.addEventListener("mousemove", function(e) {' +
    '    if (!isDragging) return;' +
    '    posX = e.clientX - startX;' +
    '    posY = e.clientY - startY;' +
    '    updateTransform();' +
    '  });' +
    '  window.addEventListener("mouseup", function() { isDragging = false; });' +
    '  stage.addEventListener("dblclick", function(e) {' +
    '    e.preventDefault();' +
    '    if (scale > 1.2) resetZoom(); else { scale = 2.5; updateTransform(); }' +
    '  });' +
    '  document.addEventListener("keydown", function(e) {' +
    '    if (e.key === "ArrowRight") loadPhoto((currentIndex + 1) % photos.length);' +
    '    else if (e.key === "ArrowLeft") loadPhoto((currentIndex - 1 + photos.length) % photos.length);' +
    '    else if (e.key === "+" || e.key === "=") zoomDelta(0.25);' +
    '    else if (e.key === "-" || e.key === "_") zoomDelta(-0.25);' +
    '    else if (e.key === "0") resetZoom();' +
    '  });' +
    '}' +
    'init();' +
    '<' + '/script></body></html>';
  return html;
}

function buildSidebarHtml() {
  return '<!DOCTYPE html>' +
    '<html><head><meta charset="utf-8">' +
    '<style>' +
    '* { box-sizing: border-box; margin: 0; padding: 0; }' +
    'body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0f172a; color: #f8fafc; padding: 12px; }' +
    '.card { background: #1e293b; border: 1px solid #334155; border-radius: 8px; padding: 12px; margin-bottom: 12px; }' +
    '.title { font-size: 13px; font-weight: 600; color: #a5b4fc; }' +
    '.subtitle { font-size: 11px; color: #94a3b8; margin-top: 2px; }' +
    '.img-box { width: 100%; height: 260px; background: #090d16; border-radius: 6px; overflow: hidden; display: flex; align-items: center; justify-content: center; position: relative; margin: 10px 0; border: 1px solid #334155; }' +
    '#side-img { max-width: 100%; max-height: 100%; object-fit: contain; transition: transform 0.15s; }' +
    '.controls { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; margin-top: 8px; }' +
    'button { background: #334155; color: #f8fafc; border: 1px solid #475569; padding: 6px 8px; font-size: 11px; font-weight: 600; border-radius: 6px; cursor: pointer; }' +
    'button:hover { background: #475569; }' +
    'button.primary { background: #4f46e5; border-color: #6366f1; grid-column: span 4; padding: 8px; font-size: 12px; margin-top: 6px; }' +
    'button.primary:hover { background: #4338ca; }' +
    '#status-msg { font-size: 11px; color: #cbd5e1; text-align: center; margin-top: 6px; }' +
    '</style></head>' +
    '<body>' +
    '  <div class="card">' +
    '    <div class="title" id="info-title">📸 Photo Inspector</div>' +
    '    <div class="subtitle" id="info-sub">Select any cell in row or photo column</div>' +
    '    <div class="img-box">' +
    '      <img id="side-img" src="" alt="Fit Photo" style="display:none;">' +
    '      <span id="no-photo" style="font-size:12px;color:#64748b;">No photo in selected cell</span>' +
    '    </div>' +
    '    <div class="controls">' +
    '      <button onclick="sideZoom(-0.25)">🔍 -</button>' +
    '      <button onclick="sideZoom(0.25)">🔍 +</button>' +
    '      <button onclick="sideRotate()">⟳ 90°</button>' +
    '      <button onclick="sideReset()">⤢ Fit</button>' +
    '      <button class="primary" onclick="inspectSelectedCell()">🔄 Load Selected Cell Photo</button>' +
    '      <button class="primary" style="background:#0284c7;border-color:#38bdf8;" onclick="openDialogFromSide()">🔍 Open Fullscreen Zoom Dialog</button>' +
    '    </div>' +
    '    <div id="status-msg">Click any photo cell & press Load</div>' +
    '  </div>' +
    '  <script>' +
    '    var scale = 1, rotation = 0;' +
    '    function updateImg() {' +
    '      var img = document.getElementById("side-img");' +
    '      img.style.transform = "scale(" + scale + ") rotate(" + rotation + "deg)";' +
    '    }' +
    '    function sideZoom(d) { scale = Math.min(Math.max(scale + d, 0.4), 4); updateImg(); }' +
    '    function sideRotate() { rotation = (rotation + 90) % 360; updateImg(); }' +
    '    function sideReset() { scale = 1; rotation = 0; updateImg(); }' +
    '    function inspectSelectedCell() {' +
    '      document.getElementById("status-msg").textContent = "Checking active cell...";' +
    '      google.script.run' +
    '        .withSuccessHandler(function(res) {' +
    '          if (res && res.hasPhoto && res.photos.length > 0) {' +
    '            var p = res.photos[0];' +
    '            var img = document.getElementById("side-img");' +
    '            img.src = p.url;' +
    '            img.style.display = "block";' +
    '            document.getElementById("no-photo").style.display = "none";' +
    '            document.getElementById("info-title").textContent = (res.style || "Fit Photo") + " (" + res.cell + ")";' +
    '            document.getElementById("info-sub").textContent = (res.model ? "Model: " + res.model : "") + " • " + res.photos.length + " photo(s)";' +
    '            document.getElementById("status-msg").textContent = "Photo loaded!";' +
    '            sideReset();' +
    '          } else {' +
    '            document.getElementById("status-msg").textContent = res.message || "No photo found in this cell";' +
    '          }' +
    '        })' +
    '        .withFailureHandler(function(err) {' +
    '          document.getElementById("status-msg").textContent = "Error: " + err.message;' +
    '        })' +
    '        .getActiveCellPhotoData();' +
    '    }' +
    '    function openDialogFromSide() {' +
    '      google.script.run.showPhotoZoomDialog();' +
    '    }' +
    '    inspectSelectedCell();' +
    '  <' + '/script>' +
    '</body></html>';
}

function extractFileId(str) {
  if (!str) return "";
  var s = String(str);
  var part = "";
  var idx = s.indexOf("lh3.googleusercontent.com/d/");
  if (idx !== -1) {
    part = s.substring(idx + 28);
  } else {
    var zIdx = s.indexOf("zoom=");
    if (zIdx !== -1) {
      part = s.substring(zIdx + 5);
    } else {
      var fIdx = s.indexOf("fileId=");
      if (fIdx !== -1) {
        part = s.substring(fIdx + 7);
      } else {
        var drvIdx = s.indexOf("/file/d/");
        if (drvIdx !== -1) part = s.substring(drvIdx + 8);
      }
    }
  }
  if (!part) return "";
  for (var i = 0; i < part.length; i++) {
    var c = part.charAt(i);
    var isAlpha = (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z');
    var isNum = (c >= '0' && c <= '9');
    var isSpecial = (c === '_' || c === '-');
    if (!isAlpha && !isNum && !isSpecial) return part.substring(0, i);
  }
  return part;
}

function extractFolderId(str) {
  if (!str) return "";
  var s = String(str);
  var part = "";
  var fIdx = s.indexOf("folder=");
  if (fIdx !== -1) {
    part = s.substring(fIdx + 7);
  } else {
    var foldIdx = s.indexOf("/folders/");
    if (foldIdx !== -1) part = s.substring(foldIdx + 9);
  }
  if (!part) return "";
  for (var i = 0; i < part.length; i++) {
    var c = part.charAt(i);
    var isAlpha = (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z');
    var isNum = (c >= '0' && c <= '9');
    var isSpecial = (c === '_' || c === '-');
    if (!isAlpha && !isNum && !isSpecial) return part.substring(0, i);
  }
  return part;
}

function extractHyperlinkUrl(str) {
  if (!str) return "";
  var s = String(str);
  var start = s.indexOf('=HYPERLINK("');
  if (start !== -1) {
    var sub = s.substring(start + 12);
    var end = sub.indexOf('"');
    if (end !== -1) return sub.substring(0, end);
  }
  var httpIdx = s.indexOf("http://");
  if (httpIdx === -1) httpIdx = s.indexOf("https://");
  if (httpIdx !== -1) {
    var urlPart = s.substring(httpIdx);
    for (var i = 0; i < urlPart.length; i++) {
      var ch = urlPart.charAt(i);
      if (ch === '"' || ch === ')' || ch === ',' || ch === ' ' || ch === '\t' || ch === '\n') {
        return urlPart.substring(0, i);
      }
    }
    return urlPart;
  }
  return "";
}

function escapeHtml(str) {
  if (!str) return "";
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
