export const FULL_GOOGLE_APPS_SCRIPT_CODE = `// ==============================================================================
// FIT COMMENT SYSTEM - COMPLETE GOOGLE APPS SCRIPT WEB APP CODE
// ==============================================================================
// Instructions:
// 1. In your Google Sheet, click Extensions > Apps Script.
// 2. Select all code in Code.gs, delete it, and paste this entire code.
// 3. Click the Save icon (floppy disk).
// 4. In the toolbar function dropdown, select "testAndAuthorizeDrive" and click "Run".
//    Google will prompt to Authorize -> Click Review permissions -> Select account -> Allow.
//    (This grants Drive permission so photos are saved to Drive & displayed in Google Sheets!)
// 5. Click "Deploy" > "Manage Deployments":
//    - Click the Pencil (Edit) icon next to active deployment
//    - Version: "New version"  <--- CRITICAL! Always select New version when updating
//    - Who has access: "Anyone" <--- CRITICAL! Must be "Anyone"
// 6. Click "Deploy". Done!
// ==============================================================================

/**
 * ⚡ ONE-CLICK AUTHORIZATION & DIAGNOSTIC FUNCTION
 * Run this function ONCE in the Apps Script Editor toolbar (Select "testAndAuthorizeDrive" and click "Run").
 * Google will prompt: "Review permissions" -> Choose your Google Account -> "Allow".
 * This permanently grants DriveApp permissions to save and display style photos in Google Sheets!
 */
function testAndAuthorizeDrive() {
  try {
    var folderName = "Style_Fit_Photos";
    var folders = DriveApp.getFoldersByName(folderName);
    var folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(folderName);
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
 * ⚡ ONE-CLICK REPAIR & CLEANUP UTILITY:
 * Run this function in the Apps Script toolbar ("fixAndCleanAllPhotoColumns" -> "Run") to immediately:
 * 1. Move any misplaced photos from AY, AZ, or BH directly into correct columns BI (1st R. Product Image) & BJ (1st R.Model Fit Img Issues)!
 * 2. Clear AY and BH, and restore AZ for "Reminder Mail Status"!
 * 3. Set row height to 80px and photo column widths to 100px so photos display cleanly!
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
      var ayCell = sheet.getRange(r, colLetterToIndex("AY"));
      var ayVal = String(ayCell.getValue() || "");
      if (ayVal && (ayVal.indexOf("=IMAGE") > -1 || ayVal.indexOf("http") === 0)) {
        var biCell = sheet.getRange(r, colLetterToIndex("BI"));
        if (!biCell.getValue()) {
          var pAy = formatPhotoFormulaHelper(ayVal, "Sample_Ref");
          if (pAy && pAy.formula) updateCell(sheet, r, "BI", pAy.formula);
        }
        ayCell.clearContent();
        totalCleaned++;
      }
      
      // 2. Check AZ (Col 52 - Reminder 1st)
      var azCell = sheet.getRange(r, colLetterToIndex("AZ"));
      var azVal = String(azCell.getValue() || "");
      if (azVal && (azVal.indexOf("=IMAGE") > -1 || (azVal.indexOf("http") === 0 && (azVal.indexOf("drive.google") > -1 || azVal.indexOf(".jpg") > -1 || azVal.indexOf(".png") > -1)))) {
        var bjCell = sheet.getRange(r, colLetterToIndex("BJ"));
        if (!bjCell.getValue()) {
          var pAz = formatPhotoFormulaHelper(azVal, "Fit_R1");
          if (pAz && pAz.formula) updateCell(sheet, r, "BJ", pAz.formula);
        }
        azCell.clearContent();
        totalCleaned++;
      }
      
      // 3. Check BH (Col 60)
      var bhCell = sheet.getRange(r, colLetterToIndex("BH"));
      var bhVal = String(bhCell.getValue() || "");
      if (bhVal && (bhVal.indexOf("=IMAGE") > -1 || bhVal.indexOf("http") === 0)) {
        var biCell2 = sheet.getRange(r, colLetterToIndex("BI"));
        if (!biCell2.getValue()) {
          var pBh = formatPhotoFormulaHelper(bhVal, "Sample_Ref");
          if (pBh && pBh.formula) updateCell(sheet, r, "BI", pBh.formula);
        }
        bhCell.clearContent();
        totalCleaned++;
      }
      
      sheet.setRowHeight(r, 80);
    }
    setPhotoColumnWidths(sheet);
  }
  
  Logger.log("✅ Successfully cleaned and migrated " + totalCleaned + " photo cells to BI and BJ!");
  return "SUCCESS: Migrated all misplaced photos to BI/BJ and restored AY, AZ, BH!";
}

function formatPhotoFormulaHelper(photoStr, filePrefix) {
  if (!photoStr) return null;
  photoStr = String(photoStr).trim();
  if (photoStr.indexOf("=") === 0) return { formula: photoStr };
  if (photoStr.indexOf("http") === 0) {
    var match = photoStr.match(/https?:\\/\\/[^\\s"\\)]+/);
    var cleanUrl = match ? match[0] : photoStr;
    var directUrl = cleanUrl;
    var viewUrl = cleanUrl;
    var driveMatch = cleanUrl.match(/\\/file\\/d\\/([a-zA-Z0-9_-]+)/) || cleanUrl.match(/[?&]id=([a-zA-Z0-9_-]+)/) || cleanUrl.match(/\\/d\\/([a-zA-Z0-9_-]+)/);
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

function doGet(e) {
  return ContentService.createTextOutput("Fit Comment Google Apps Script Web App is active and ready.")
    .setMimeType(ContentService.MimeType.TEXT);
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    // 1. Lock for 30 seconds to prevent race conditions during concurrent submissions
    lock.waitLock(30000);
    
    // Safety check for manual "Run" button clicks inside Apps Script Editor
    if (!e || !e.postData || !e.postData.contents) {
      return ContentService.createTextOutput("Web App is ready. Please test by submitting data from the application.")
        .setMimeType(ContentService.MimeType.TEXT);
    }
    
    var data = JSON.parse(e.postData.contents);
    
    // 2. Identify Spreadsheet
    var ss;
    if (data.sheetId || data.spreadsheetId) {
      ss = SpreadsheetApp.openById(data.sheetId || data.spreadsheetId);
    } else {
      ss = SpreadsheetApp.getActiveSpreadsheet();
    }
    
    if (!ss) {
      throw new Error("Spreadsheet not found. Please verify sheetId.");
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
    
    // 5. Identify Target Sheet / Tab Name
    var sheetName = data.tabName || "General";
    var sheet = getSheetWithHeaders(ss, sheetName);
    
    // Ensure sheet has at least 75 columns
    if (sheet.getMaxColumns() < 75) {
      sheet.insertColumnsAfter(sheet.getMaxColumns(), 75 - sheet.getMaxColumns());
    }

    // 6. Find existing row by AX (Column 50) Assignment ID
    var assignmentId = data.AX || data.assignmentId || data.id;
    var row = -1;
    
    if (assignmentId) {
       row = findRow(sheet, assignmentId);
    }
    
    if (row === -1) {
      // NEW SUBMISSION: Append a new row at the bottom
      row = sheet.getLastRow() + 1;
      
      // Save ID marker in Column AX (Column index 50) and Timestamp in A
      updateCell(sheet, row, "AX", assignmentId);
      updateCell(sheet, row, "A", data.timestamp || new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }));
    }
    
    // 7. Update Base Assignment Fields (Columns B-F)
    updateCell(sheet, row, "B", data.modelName || data.model_name || data.B);
    updateCell(sheet, row, "C", data.sampleType || data.typeOfSample || data.type_of_sample || data.C);
    updateCell(sheet, row, "D", data.styleNo || data.style_number || data.D);
    updateCell(sheet, row, "E", data.description || data.Instructions || data.E);
    updateCell(sheet, row, "F", data.size || data.F);
    
    // 8. Update Round-Specific Data (Supports 5 rounds, all dates & feedbacks)
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

    // 9. Handle Photos & Attachments (Google Drive upload + Sheet IMAGE() preview)
    // NOTE: Photos ONLY map to BI - BR columns. Never map to AY, AZ, or BH.
    var samplePhoto = data.samplePhoto || data.samplePhotoUrl || data.sample_photo_url || data.BI;
    var fitPhoto = data.fitPhoto || data.fitPhotoUrl || data.fit_photo_url || data.fitPhotoBase64;

    // Cache to prevent duplicate Drive uploads for same photo within one submission
    var photoFormulaCache = {};

    function formatPhotoFormula(photoData, filePrefix) {
      if (!photoData) return null;
      var photoStr = String(photoData).trim();
      if (!photoStr) return null;

      // If it is already a complete formula, return as is
      if (photoStr.indexOf("=") === 0) {
        return { formula: photoStr, zoomUrl: "", directUrl: "" };
      }

      var cacheKey = photoStr.length > 200 ? photoStr.slice(0, 100) + "_" + photoStr.length : photoStr;
      if (photoFormulaCache[cacheKey]) {
        return photoFormulaCache[cacheKey];
      }

      // If base64 dataUrl: Save to Google Drive Style_Fit_Photos folder
      if (photoStr.indexOf("data:image") === 0 || (photoStr.length > 500 && photoStr.indexOf("http") === -1)) {
        try {
          var saved = saveImageToDrive(photoStr, filePrefix + "_" + Date.now() + ".jpg");
          if (saved && saved.fileId) {
            var resObj = {
              formula: '=HYPERLINK("' + saved.viewUrl + '", IMAGE("' + saved.directUrl + '", 1))',
              zoomUrl: saved.viewUrl,
              directUrl: saved.directUrl
            };
            photoFormulaCache[cacheKey] = resObj;
            return resObj;
          } else if (saved && saved.needsAuth) {
            return {
              formula: '⚠️ Authorize Drive in Apps Script (Click Run on testAndAuthorizeDrive)',
              zoomUrl: "",
              directUrl: ""
            };
          }
        } catch (dErr) {
          Logger.log("formatPhotoFormula error: " + dErr.toString());
        }
        return null;
      }

      // If HTTP URL: use directly with formula
      if (photoStr.indexOf("http") === 0) {
        var match = photoStr.match(/https?:\\/\\/[^\\s"\\)]+/);
        var cleanUrl = match ? match[0] : photoStr;
        var directUrl = cleanUrl;
        var viewUrl = cleanUrl;
        
        // If Google Drive URL, use lh3 endpoint for direct 200 OK rendering in Google Sheets
        var driveMatch = cleanUrl.match(/\\/file\\/d\\/([a-zA-Z0-9_-]+)/) || cleanUrl.match(/[?&]id=([a-zA-Z0-9_-]+)/) || cleanUrl.match(/\\/d\\/([a-zA-Z0-9_-]+)/);
        if (driveMatch && driveMatch[1]) {
          var fId = driveMatch[1];
          directUrl = "https://lh3.googleusercontent.com/d/" + fId;
          viewUrl = "https://drive.google.com/file/d/" + fId + "/view";
        }

        var httpRes = {
          formula: '=HYPERLINK("' + viewUrl + '", IMAGE("' + directUrl + '", 1))',
          zoomUrl: viewUrl,
          directUrl: directUrl
        };
        photoFormulaCache[cacheKey] = httpRes;
        return httpRes;
      }

      return null;
    }

    // Save Designer Sample Photo:
    // Round 1 -> Column BI (Col 61: 1st R. Product Image in user's sheet)
    // Round 2 -> Column BK (Col 63: 2nd R. Product Image)
    // Round 3 -> Column BM (Col 65: 3rd R. Product Image)
    // Round 4 -> Column BO (Col 67: 4th R. Product Image)
    // Round 5 -> Column BQ (Col 69: 5th R. Product Image)
    if (samplePhoto) {
      var sampleResult = formatPhotoFormula(samplePhoto, (data.styleNo || "Sample") + "_Ref");
      if (sampleResult && sampleResult.formula) {
        if (round === "1") updateCell(sheet, row, "BI", sampleResult.formula);
        else if (round === "2") updateCell(sheet, row, "BK", sampleResult.formula);
        else if (round === "3") updateCell(sheet, row, "BM", sampleResult.formula);
        else if (round === "4") updateCell(sheet, row, "BO", sampleResult.formula);
        else if (round === "5") updateCell(sheet, row, "BQ", sampleResult.formula);
        else updateCell(sheet, row, "BI", sampleResult.formula);

        sheet.setRowHeight(row, 80);
        setPhotoColumnWidths(sheet);
        if (sampleResult.directUrl) {
          data.samplePhotoUrl = sampleResult.directUrl;
        }
      }
    }

    // Save Model Fit Photo to Round Columns ONLY:
    // Round 1 -> Column BJ (Col 62: 1st R.Model Fit Img Issues)
    // Round 2 -> Column BL (Col 64: 2nd R.Model Fit Img Issues)
    // Round 3 -> Column BN (Col 66: 3rd R.Model Fit Img Issues)
    // Round 4 -> Column BP (Col 68: 4th R.Model Fit Img Issues)
    // Round 5 -> Column BR (Col 70: 5th R.Model Fit Img Issues)
    if (fitPhoto) {
      var fitResult = formatPhotoFormula(fitPhoto, (data.styleNo || "Fit") + "_R" + round);
      if (fitResult && fitResult.formula) {
        if (round === "1") {
          updateCell(sheet, row, "BJ", fitResult.formula);
        } else if (round === "2") {
          updateCell(sheet, row, "BL", fitResult.formula);
        } else if (round === "3") {
          updateCell(sheet, row, "BN", fitResult.formula);
        } else if (round === "4") {
          updateCell(sheet, row, "BP", fitResult.formula);
        } else if (round === "5") {
          updateCell(sheet, row, "BR", fitResult.formula);
        }
        sheet.setRowHeight(row, 80);
        setPhotoColumnWidths(sheet);
      }
    }

    // Automatic migration & cleanup of legacy misplaced columns (AY, AZ, BH)
    try {
      var ayCell = sheet.getRange(row, colLetterToIndex("AY"));
      var ayVal = String(ayCell.getValue() || "");
      if (ayVal && (ayVal.indexOf("=IMAGE") > -1 || ayVal.indexOf("http") === 0)) {
        var biCell = sheet.getRange(row, colLetterToIndex("BI"));
        if (!biCell.getValue()) {
          var pAy = formatPhotoFormula(ayVal, (data.styleNo || "Sample") + "_Ref");
          if (pAy && pAy.formula) updateCell(sheet, row, "BI", pAy.formula);
        }
        ayCell.clearContent();
      }

      var azCell = sheet.getRange(row, colLetterToIndex("AZ"));
      var azVal = String(azCell.getValue() || "");
      if (azVal && (azVal.indexOf("=IMAGE") > -1 || (azVal.indexOf("http") === 0 && (azVal.indexOf("drive.google") > -1 || azVal.indexOf(".jpg") > -1 || azVal.indexOf(".png") > -1)))) {
        var bjCell = sheet.getRange(row, colLetterToIndex("BJ"));
        if (!bjCell.getValue()) {
          var pAz = formatPhotoFormula(azVal, (data.styleNo || "Fit") + "_R1");
          if (pAz && pAz.formula) updateCell(sheet, row, "BJ", pAz.formula);
        }
        azCell.clearContent();
      }

      var bhCell = sheet.getRange(row, colLetterToIndex("BH"));
      var bhVal = String(bhCell.getValue() || "");
      if (bhVal && (bhVal.indexOf("=IMAGE") > -1 || bhVal.indexOf("http") === 0)) {
        var biCell2 = sheet.getRange(row, colLetterToIndex("BI"));
        if (!biCell2.getValue()) {
          var pBh = formatPhotoFormula(bhVal, (data.styleNo || "Sample") + "_Ref");
          if (pBh && pBh.formula) updateCell(sheet, row, "BI", pBh.formula);
        }
        bhCell.clearContent();
      }
    } catch (_) {}

    // 10. Direct Column Mapping fallback (Only update photo formulas for photo columns BI-BR)
    var directCols = ["A","B","C","D","E","F","G","H","I","J","K","L","M","N","O","P","Q","R","S","T","U","V","W","X","Y","Z","AA","AB","AC","AD","AE","AF","AG","AH","AI","AJ","AK","AL","AM","AN","AO","AP","AQ","AR","AS","AT","AX","BI","BJ","BK","BL","BM","BN","BO","BP","BQ","BR"];
    for (var c = 0; c < directCols.length; c++) {
      var colKey = directCols[c];
      if (data[colKey] !== undefined && data[colKey] !== null && data[colKey] !== "") {
        var val = data[colKey];
        var isPhotoCol = (colKey === "BI" || colKey === "BJ" || colKey === "BK" || colKey === "BL" || colKey === "BM" || colKey === "BN" || colKey === "BO" || colKey === "BP" || colKey === "BQ" || colKey === "BR");
        if (isPhotoCol) {
          var pRes = formatPhotoFormula(val, (data.styleNo || "Photo") + "_" + colKey);
          if (pRes && pRes.formula) {
            updateCell(sheet, row, colKey, pRes.formula);
            sheet.setRowHeight(row, 80);
          }
          // Do not write raw base64 string to prevent Google Sheets 50,000 char error
        } else {
          updateCell(sheet, row, colKey, val);
        }
      }
    }
    
    // 11. Send email if requested
    if (data.triggerEmail) {
      sendMail(data);
    }
    
    return ContentService.createTextOutput("Success").setMimeType(ContentService.MimeType.TEXT);
    
  } catch (err) {
    return ContentService.createTextOutput("Error: " + err.message).setMimeType(ContentService.MimeType.TEXT);
  } finally {
    lock.releaseLock();
  }
}

function setPhotoColumnWidths(sheet) {
  try {
    var photoCols = ["BI", "BJ", "BK", "BL", "BM", "BN", "BO", "BP", "BQ", "BR"];
    for (var i = 0; i < photoCols.length; i++) {
      var colIdx = colLetterToIndex(photoCols[i]);
      if (sheet.getMaxColumns() >= colIdx) {
        if (sheet.getColumnWidth(colIdx) < 95) {
          sheet.setColumnWidth(colIdx, 100);
        }
      }
    }
  } catch (_) {}
}

function getSheetWithHeaders(ss, sheetName) {
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  }
  // Ensure the sheet has at least 75 columns
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
      "Reminder Mail Status Reminder 1st", // AZ (52) - Reminder 1st
      "Reminder 2nd", // BA (53)
      "Reminder 3rd", // BB (54)
      "Reminder 4th", // BC (55)
      "Reminder 5th", // BD (56)
      "", "", "", "", // BE(57), BF(58), BG(59), BH(60) - Blank
      "1st R. Product Image", // BI (61) - Designer Sample Photo R1
      "1st R.Model Fit Img Issues", // BJ (62) - Model Fit Issues Photo R1
      "2nd R. Product Image", // BK (63) - Designer Sample Photo R2
      "2nd R.Model Fit Img Issues", // BL (64) - Model Fit Issues Photo R2
      "3rd R. Product Image", // BM (65) - Designer Sample Photo R3
      "3rd R.Model Fit Img Issues", // BN (66) - Model Fit Issues Photo R3
      "4th R. Product Image", // BO (67) - Designer Sample Photo R4
      "4th R.Model Fit Img Issues", // BP (68) - Model Fit Issues Photo R4
      "5th R. Product Image", // BQ (69) - Designer Sample Photo R5
      "5th R.Model Fit Img Issues"  // BR (70) - Model Fit Issues Photo R5
    ];
    sheet.appendRow(headers);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, headers.length).setBackground("#f3f4f6").setFontWeight("bold");
  }
  return sheet;
}

function findRow(sheet, assignmentId) {
  if (!assignmentId) return -1;
  // Ensure sheet has at least 50 columns before accessing column 50 (AX)
  if (sheet.getMaxColumns() < 50) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), 75 - sheet.getMaxColumns());
  }
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

function colLetterToIndex(col) {
  col = String(col).toUpperCase().trim();
  var result = 0;
  for (var i = 0; i < col.length; i++) {
    result = result * 26 + (col.charCodeAt(i) - 64);
  }
  return result;
}

function updateCell(sheet, row, colName, value) {
  if (value === undefined || value === null || value === "") return;
  var colIndex = colLetterToIndex(colName);
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
          var semiFormula = strVal.replace(/,\\s*(IMAGE|1)/g, "; $1");
          range.setFormula(semiFormula);
        } catch (_) {
          var urlMatch = strVal.match(/https?:\\/\\/[^\\s"\\)]+/);
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

function saveImageToDrive(base64Data, fileName) {
  try {
    if (!base64Data) return null;
    var contentType = "image/jpeg";
    var cleanBase64 = String(base64Data).trim();
    
    // Check if it has data URL prefix like data:image/png;base64,...
    var commaIdx = cleanBase64.indexOf(",");
    if (cleanBase64.indexOf("data:") === 0 && commaIdx > -1) {
      var header = cleanBase64.substring(5, commaIdx);
      var semiIdx = header.indexOf(";");
      if (semiIdx > -1) {
        contentType = header.substring(0, semiIdx).trim() || "image/jpeg";
      }
      cleanBase64 = cleanBase64.substring(commaIdx + 1);
    }
    
    // Strip all whitespaces, newlines, and carriage returns that break base64 decoding
    cleanBase64 = cleanBase64.replace(/\\s+/g, "");
    // Convert URL-safe base64 characters (- and _) to standard (+ and /)
    cleanBase64 = cleanBase64.replace(/-/g, "+").replace(/_/g, "/");
    while (cleanBase64.length % 4 !== 0) {
      cleanBase64 += "=";
    }
    
    var decoded = Utilities.base64Decode(cleanBase64);
    var blob = Utilities.newBlob(decoded, contentType, fileName);

    var folderName = "Style_Fit_Photos";
    var folders = DriveApp.getFoldersByName(folderName);
    var folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(folderName);

    var file = folder.createFile(blob);

    // Safely attempt public link sharing, with fallback for restricted Google Workspace domains
    try {
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    } catch (shareErr1) {
      try {
        file.setSharing(DriveApp.Access.DOMAIN_WITH_LINK, DriveApp.Permission.VIEW);
      } catch (shareErr2) {
        Logger.log("Drive sharing note: " + shareErr2.toString());
      }
    }

    var fileId = file.getId();
    // Use official direct Google CDN endpoint for instant 200 OK =IMAGE() rendering in Google Sheets
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

function sendMail(data) {
  var recipient = data.modelEmail || data.senderEmail;
  if (!recipient) {
    return ContentService.createTextOutput("Email missing recipient").setMimeType(ContentService.MimeType.TEXT);
  }
  
  var link = data.link || data.responseUrl || "";
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
      "<div style='padding: 25px; background-color: white; color: #334155; font-size: 14px; line-height: 1.6;'>" +
        "<p>Hello <strong>" + (data.modelName || "Model") + "</strong>,</p>" +
        "<p>You have a new sample fit request that requires your comments and observations:</p>" +
        photoHtml +
        "<ul style='background: #f8fafc; padding: 15px 20px 15px 35px; border-radius: 8px; margin: 15px 0;'>" +
          "<li><strong>Sample Type:</strong> " + (data.sampleType || data.typeOfSample || "Fitting") + "</li>" +
          "<li><strong>Style No:</strong> " + styleName + "</li>" +
          "<li><strong>Size:</strong> " + (data.size || "N/A") + "</li>" +
          "<li><strong>Color:</strong> " + (data.color || "N/A") + "</li>" +
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
      name: (data.senderName || "Fit Comment System")
    });
    return ContentService.createTextOutput("Email Sent").setMimeType(ContentService.MimeType.TEXT);
  } catch (mErr) {
    return ContentService.createTextOutput("Mail Error: " + mErr.message).setMimeType(ContentService.MimeType.TEXT);
  }
}
`;
