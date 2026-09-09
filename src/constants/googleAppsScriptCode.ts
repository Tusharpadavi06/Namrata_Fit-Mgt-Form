export const FULL_GOOGLE_APPS_SCRIPT_CODE = `// ==============================================================================
// FIT COMMENT SYSTEM - COMPLETE GOOGLE APPS SCRIPT WEB APP CODE
// ==============================================================================
// 1. In Google Sheet, go to Extensions > Apps Script.
// 2. Delete existing code and paste this ENTIRE code block.
// 3. Click the Save icon (floppy disk).
// 4. Click 'Deploy' > 'Manage Deployments' (or 'New deployment' if first time).
// 5. Click the Pencil (Edit) icon:
//    - Execute as: Me (your Google account)
//    - Who has access: Anyone  <--- CRITICAL! Must be 'Anyone'
//    - Version: 'New version'  <--- CRITICAL! Always select New version when updating code
// 6. Click 'Deploy' and authorize access.
// ==============================================================================

function doGet(e) {
  return ContentService.createTextOutput("Fit Comment Google Apps Script Web App is active and ready.")
    .setMimeType(ContentService.MimeType.TEXT);
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    // 1. Lock for 30 seconds to prevent race conditions during concurrent submissions
    lock.waitLock(30000);
    
    // Safety check for manual 'Run' button clicks inside Apps Script Editor
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
    if (data.type === 'PING_TEST') {
      return ContentService.createTextOutput("Success").setMimeType(ContentService.MimeType.TEXT);
    }

    // 4. Handle explicit EMAIL trigger
    if (data.type === 'SEND_MAIL') {
      return sendMail(data);
    }
    
    // 5. Identify Target Sheet / Tab Name
    var sheetName = data.tabName || "General";
    var sheet = getSheetWithHeaders(ss, sheetName);
    
    // Ensure sheet has at least 60 columns before querying column 50
    if (sheet.getMaxColumns() < 60) {
      sheet.insertColumnsAfter(sheet.getMaxColumns(), 60 - sheet.getMaxColumns());
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
      updateCell(sheet, row, "A", data.timestamp || new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }));
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

    // 9. Also allow direct column keys if sent in payload (e.g. data["G"], data["H"], etc.)
    var directCols = ["A","B","C","D","E","F","G","H","I","J","K","L","M","N","O","P","Q","R","S","T","U","V","W","X","Y","Z","AA","AB","AC","AD","AE","AF","AG","AH","AI","AJ","AK","AL","AM","AN","AO","AP","AQ","AR","AS","AT","AX"];
    for (var c = 0; c < directCols.length; c++) {
      var colKey = directCols[c];
      if (data[colKey] !== undefined && data[colKey] !== null && data[colKey] !== "") {
        updateCell(sheet, row, colKey, data[colKey]);
      }
    }
    
    // 10. Send email if requested
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

function getSheetWithHeaders(ss, sheetName) {
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  }
  // Ensure the sheet has at least 60 columns
  if (sheet.getMaxColumns() < 60) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), 60 - sheet.getMaxColumns());
  }
  if (sheet.getLastRow() === 0) {
    var headers = [
      "Timestamp", "Model Name", "Type of sample", "Style no", "Description", "Size", 
      "R1 Color", "R1 Fit Date", "R1 Received", "R1 Comments Date", "R1 Before Wash", "R1 After Wash", "R1 Fabric/Trims", "R1 Feedback",
      "R2 Color", "R2 Fit Date", "R2 Received", "R2 Comments Date", "R2 Before Wash", "R2 After Wash", "R2 Fabric/Trims", "R2 Feedback",
      "R3 Color", "R3 Fit Date", "R3 Received", "R3 Comments Date", "R3 Before Wash", "R3 After Wash", "R3 Fabric/Trims", "R3 Feedback",
      "R4 Color", "R4 Fit Date", "R4 Received", "R4 Comments Date", "R4 Before Wash", "R4 After Wash", "R4 Fabric/Trims", "R4 Feedback",
      "R5 Color", "R5 Fit Date", "R5 Received", "R5 Comments Date", "R5 Before Wash", "R5 After Wash", "R5 Fabric/Trims", "R5 Feedback"
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
    sheet.insertColumnsAfter(sheet.getMaxColumns(), 60 - sheet.getMaxColumns());
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

function updateCell(sheet, row, colName, value) {
  if (value === undefined || value === null || value === "") return;
  var colMap = {
    "A": 1, "B": 2, "C": 3, "D": 4, "E": 5, "F": 6, "G": 7, "H": 8, "I": 9, "J": 10,
    "K": 11, "L": 12, "M": 13, "N": 14, "O": 15, "P": 16, "Q": 17, "R": 18, "S": 19, "T": 20,
    "U": 21, "V": 22, "W": 23, "X": 24, "Y": 25, "Z": 26, "AA": 27, "AB": 28, "AC": 29, "AD": 30,
    "AE": 31, "AF": 32, "AG": 33, "AH": 34, "AI": 35, "AJ": 36, "AK": 37, "AL": 38, "AM": 39, "AN": 40,
    "AO": 41, "AP": 42, "AQ": 43, "AR": 44, "AS": 45, "AT": 46, "AX": 50
  };
  var colIndex = colMap[colName.toUpperCase()];
  if (colIndex) {
    // Ensure column exists
    if (sheet.getMaxColumns() < colIndex) {
      sheet.insertColumnsAfter(sheet.getMaxColumns(), colIndex - sheet.getMaxColumns() + 5);
    }
    sheet.getRange(row, colIndex).setValue(value);
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
  
  var buttonHtml = link ? 
    ("<div style='text-align: center; margin: 30px 0;'>" +
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
        "<ul style='background: #f8fafc; padding: 15px 20px 15px 35px; border-radius: 8px; margin: 15px 0;'>" +
          "<li><strong>Sample Type:</strong> " + (data.sampleType || data.typeOfSample || "Fitting") + "</li>" +
          "<li><strong>Style No:</strong> " + styleName + "</li>" +
          "<li><strong>Size:</strong> " + (data.size || "N/A") + "</li>" +
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
