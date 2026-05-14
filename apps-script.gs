const CENTRAL_SPREADSHEET_ID = "1LzNAXK27a87ydnKd-WY3lDL8Pool29RR8zxAEy2vaPQ";
const HEALTH_SPREADSHEET_ID = "1ez6E481Lpf0uO5uyU_HGQUhGUl3Xr2ZgYWOXFpA0Le8";
const LINE_CHANNEL_ACCESS_TOKEN = "https://script.google.com/macros/s/AKfycbwswUWqS5ZvgAuPRiUjj3LrECRrw_7nq9Uahjx4IrVGGdYrzXy08Hqef14nfw0PvVYEtQ/exec";

function doGet(e) {
  const action = e.parameter.action || "bootstrap";
  if (action === "bootstrap") return jsonResponse(getBootstrapData());
  return jsonResponse({ ok: false, error: "Unknown action" });
}

function doPost(e) {
  const payload = JSON.parse(e.postData && e.postData.contents || "{}");
  const action = payload.action || "";
  if (action === "assignLead") return jsonResponse(assignLead(payload));
  if (action === "saveTeamMember") return jsonResponse(saveTeamMember(payload.member));
  if (action === "updateTeamStatus") return jsonResponse(updateTeamStatus(payload.memberId, payload.status));
  if (action === "sendLineFlex") return jsonResponse(sendLineFlex(payload));
  return jsonResponse({ ok: false, error: "Unknown action" });
}

function getBootstrapData() {
  const central = SpreadsheetApp.openById(CENTRAL_SPREADSHEET_ID);
  const health = SpreadsheetApp.openById(HEALTH_SPREADSHEET_ID);
  return {
    ok: true,
    leads: rowsToObjects_(central.getSheetByName("Leads Central")),
    teamMembers: rowsToObjects_(central.getSheetByName("Team Members")),
    activityLog: rowsToObjects_(central.getSheetByName("Activity Log")),
    health: rowsToObjects_(health.getSheetByName("Health WebApp Leads V2"))
  };
}

function assignLead(payload) {
  const sheet = SpreadsheetApp.openById(CENTRAL_SPREADSHEET_ID).getSheetByName("Leads Central");
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const leadIdCol = headers.indexOf("Lead ID");
  const statusCol = headers.indexOf("Status");
  const assignedToCol = headers.indexOf("Assigned To");
  const assignedAtCol = headers.indexOf("Assigned At");
  const updatedCol = headers.indexOf("Last Updated");
  const rowIndex = data.findIndex((row, index) => index > 0 && row[leadIdCol] === payload.leadId);
  if (rowIndex < 1) return { ok: false, error: "Lead not found" };
  const rowNumber = rowIndex + 1;
  sheet.getRange(rowNumber, statusCol + 1).setValue("Assigned");
  sheet.getRange(rowNumber, assignedToCol + 1).setValue(payload.assignedTo || "");
  sheet.getRange(rowNumber, assignedAtCol + 1).setValue(new Date());
  sheet.getRange(rowNumber, updatedCol + 1).setValue(new Date());
  appendActivity_("assignLead", payload.leadId, payload.assignedTo || "");
  return { ok: true };
}

function saveTeamMember(member) {
  const sheet = SpreadsheetApp.openById(CENTRAL_SPREADSHEET_ID).getSheetByName("Team Members");
  const id = member.memberId || `tm-${Utilities.getUuid()}`;
  const status = normalizeTeamStatus_(member.status || "Active");
  sheet.appendRow([id, member.name || "", member.contact || member.phone || "", member.role || "Advisor", status, member.activeLeadCount || 0, new Date(), member.note || ""]);
  appendActivity_("saveTeamMember", id, member.name || "");
  return { ok: true, memberId: id };
}

function updateTeamStatus(memberId, status) {
  const sheet = SpreadsheetApp.openById(CENTRAL_SPREADSHEET_ID).getSheetByName("Team Members");
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const idCol = headers.indexOf("Member ID");
  const statusCol = headers.indexOf("Status");
  const rowIndex = data.findIndex((row, index) => index > 0 && row[idCol] === memberId);
  if (rowIndex < 1) return { ok: false, error: "Member not found" };
  const nextStatus = normalizeTeamStatus_(status || "Active");
  sheet.getRange(rowIndex + 1, statusCol + 1).setValue(nextStatus);
  appendActivity_("updateTeamStatus", memberId, nextStatus);
  return { ok: true };
}

function normalizeTeamStatus_(status) {
  const text = String(status || "").toLowerCase();
  if (text.includes("paused") || text.includes("พัก")) return "Paused";
  if (text.includes("inactive") || text.includes("ปิด")) return "Inactive";
  return "Active";
}

function sendLineFlex(payload) {
  if (!LINE_CHANNEL_ACCESS_TOKEN || LINE_CHANNEL_ACCESS_TOKEN.includes("PUT_")) {
    return { ok: false, error: "LINE token is not configured" };
  }
  const to = payload.to;
  if (!to) return { ok: false, error: "Missing LINE user/group ID" };
  const flex = payload.flex || buildSimpleFlex_(payload.title || "FWD Lead", payload.lines || []);
  const response = UrlFetchApp.fetch("https://api.line.me/v2/bot/message/push", {
    method: "post",
    contentType: "application/json",
    headers: { Authorization: `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}` },
    payload: JSON.stringify({ to, messages: [{ type: "flex", altText: payload.title || "FWD Lead", contents: flex }] }),
    muteHttpExceptions: true
  });
  appendActivity_("sendLineFlex", to, response.getResponseCode());
  return { ok: response.getResponseCode() >= 200 && response.getResponseCode() < 300, status: response.getResponseCode(), body: response.getContentText() };
}

function rowsToObjects_(sheet) {
  if (!sheet) return [];
  const values = sheet.getDataRange().getDisplayValues();
  if (values.length < 2) return [];
  const headers = values[0].map(String);
  return values.slice(1).filter(row => row.some(cell => String(cell).trim())).map(row => {
    const item = {};
    headers.forEach((header, index) => item[header] = row[index] || "");
    return item;
  });
}

function appendActivity_(action, ref, note) {
  const sheet = SpreadsheetApp.openById(CENTRAL_SPREADSHEET_ID).getSheetByName("Activity Log");
  if (sheet) sheet.appendRow([new Date(), action, ref, note, Session.getActiveUser().getEmail(), "", ""]);
}

function buildSimpleFlex_(title, lines) {
  return {
    type: "bubble",
    body: {
      type: "box",
      layout: "vertical",
      contents: [
        { type: "text", text: title, weight: "bold", size: "lg", color: "#FF6500" },
        ...lines.map(line => ({ type: "text", text: String(line), wrap: true, size: "sm", margin: "sm" }))
      ]
    }
  };
}

function jsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}
