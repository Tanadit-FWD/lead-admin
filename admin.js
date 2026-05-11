const formatter = new Intl.NumberFormat("th-TH", { maximumFractionDigits: 0 });
const centralApiStorageKey = "fwd-central-api-url";
const defaultCentralApiUrl = "https://script.google.com/macros/s/AKfycbwtDcugQxU_7hqlwuaIGQq1nCsh_fo96fphUTP0HPIUx6MmdN2Sq6khyPg4Jhy_13Yrag/exec";
const leadStorageKey = "fwd-admin-leads";
const teamStorageKey = "fwd-admin-team";

const elements = {
  apiInput: document.querySelector("#central-api-url"),
  saveApi: document.querySelector("#save-api-url"),
  refresh: document.querySelector("#refresh-central"),
  sync: document.querySelector("#sync-sources"),
  status: document.querySelector("#sync-status"),
  metricTotal: document.querySelector("#metric-total"),
  metricNew: document.querySelector("#metric-new"),
  metricAssigned: document.querySelector("#metric-assigned"),
  metricTeam: document.querySelector("#metric-team"),
  search: document.querySelector("#search-input"),
  statusFilter: document.querySelector("#status-filter"),
  sourceFilter: document.querySelector("#source-filter"),
  ownerFilter: document.querySelector("#owner-filter"),
  clearFilters: document.querySelector("#clear-filters"),
  tableBody: document.querySelector("#lead-table-body"),
  leadSummary: document.querySelector("#lead-summary"),
  detail: document.querySelector("#lead-detail"),
  detailSubtitle: document.querySelector("#detail-subtitle"),
  teamForm: document.querySelector("#team-form"),
  manualForm: document.querySelector("#manual-lead-form"),
  teamList: document.querySelector("#team-list"),
};

let centralApiUrl = window.localStorage.getItem(centralApiStorageKey) || defaultCentralApiUrl;
let selectedLeadId = "";
let leads = loadState(leadStorageKey, [
  {
    id: createId(),
    name: "คุณน้ำฝน",
    phone: "0812345678",
    lineId: "Mai55",
    interest: "ประกันสุขภาพ",
    source: "Health WebApp Leads V2 Database",
    status: "New",
    assignedTo: "",
    createdAt: new Date().toISOString(),
    note: "ตัวอย่าง lead ใน local mode",
  },
  {
    id: createId(),
    name: "คุณอาร์ต",
    phone: "0898881919",
    lineId: "artline",
    interest: "Heritage Plus",
    source: "Leads Line for Duan Only",
    status: "Assigned",
    assignedTo: "คุณเมย์",
    createdAt: new Date(Date.now() - 3600000).toISOString(),
    note: "สนใจทุนสูง",
  },
]);

let teamMembers = loadState(teamStorageKey, [
  { id: "tm-may", name: "คุณเมย์", contact: "LINE: may.fwd" },
  { id: "tm-ton", name: "คุณต้น", contact: "โทร 082-111-2233" },
]);

function loadState(key, fallback) {
  try {
    const saved = window.localStorage.getItem(key);
    return saved ? JSON.parse(saved) : fallback;
  } catch (error) {
    return fallback;
  }
}

function saveLocalState() {
  window.localStorage.setItem(leadStorageKey, JSON.stringify(leads));
  window.localStorage.setItem(teamStorageKey, JSON.stringify(teamMembers));
}

function createId() {
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function showToast(message) {
  const current = document.querySelector(".toast");
  if (current) current.remove();
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  document.body.append(toast);
  window.setTimeout(() => toast.remove(), 3000);
}

function isCentralMode() {
  return Boolean(centralApiUrl);
}

function setSyncStatus(message, isLive = false) {
  elements.status.textContent = message;
  elements.status.classList.toggle("is-live", isLive);
}

function callCentralApi(action, params = {}) {
  if (!centralApiUrl) {
    return Promise.reject(new Error("ยังไม่ได้ตั้งค่า Apps Script Web App URL"));
  }

  return new Promise((resolve, reject) => {
    const callbackName = `leadAdminCallback_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const url = new URL(centralApiUrl);
    url.searchParams.set("action", action);
    url.searchParams.set("callback", callbackName);

    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.set(key, value ?? "");
    });

    const script = document.createElement("script");
    const timeout = window.setTimeout(() => {
      delete window[callbackName];
      script.remove();
      reject(new Error("เชื่อมต่อ Apps Script ไม่สำเร็จ"));
    }, 25000);

    window[callbackName] = (payload) => {
      window.clearTimeout(timeout);
      delete window[callbackName];
      script.remove();

      if (payload?.ok === false) {
        reject(new Error(payload.error || "Apps Script error"));
        return;
      }
      resolve(payload);
    };

    script.onerror = () => {
      window.clearTimeout(timeout);
      delete window[callbackName];
      script.remove();
      reject(new Error("โหลด endpoint ไม่สำเร็จ"));
    };

    script.src = url.toString();
    document.body.append(script);
  });
}

function normalizeLead(lead) {
  return {
    id: lead.id || createId(),
    name: lead.name || "ไม่ระบุชื่อ",
    phone: lead.phone || "",
    lineId: lead.lineId || "",
    email: lead.email || "",
    gender: lead.gender || "",
    age: lead.age || "",
    province: lead.province || "",
    interest: lead.interest || "ปรึกษาแผนประกัน",
    coverage: lead.coverage || "",
    budget: lead.budget || "",
    preferredTime: lead.preferredTime || "",
    note: lead.note || "",
    source: lead.source || "Admin Manual",
    status: lead.status || "New",
    assignedTo: lead.assignedTo || "",
    createdAt: lead.createdAt || new Date().toISOString(),
  };
}

function applyCentralData(payload) {
  leads = (payload.leads || []).map(normalizeLead);
  teamMembers = (payload.team || []).map((member) => ({
    id: member.id || createId(),
    name: member.name || "ไม่ระบุชื่อ",
    contact: member.contact || "",
    role: member.role || "Advisor",
  }));
  saveLocalState();
  render();
  setSyncStatus(`Live sheet · ${formatter.format(leads.length)} leads`, true);
}

async function refreshCentralData() {
  setSyncStatus("กำลังโหลด...");
  try {
    const payload = await callCentralApi("leads");
    applyCentralData(payload);
    showToast("โหลดข้อมูลจากชีตกลางแล้ว");
  } catch (error) {
    setSyncStatus("เชื่อมต่อไม่สำเร็จ");
    showToast(error.message);
  }
}

async function syncSources() {
  setSyncStatus("กำลัง sync 4 ชีต...");
  try {
    const payload = await callCentralApi("sync");
    applyCentralData(payload);
    showToast(`Sync สำเร็จ นำเข้าใหม่ ${formatter.format(payload.imported || 0)} leads`);
  } catch (error) {
    setSyncStatus("Sync ไม่สำเร็จ");
    showToast(error.message);
  }
}

function getMemberName(value) {
  const member = teamMembers.find((item) => item.id === value || item.name === value);
  return member?.name || value || "";
}

function getFilteredLeads() {
  const query = elements.search.value.trim().toLowerCase();
  const status = elements.statusFilter.value;
  const source = elements.sourceFilter.value;
  const owner = elements.ownerFilter.value;

  return leads.filter((lead) => {
    const searchable = [lead.name, lead.phone, lead.lineId, lead.email, lead.interest, lead.note, lead.source].join(" ").toLowerCase();
    const matchesQuery = !query || searchable.includes(query);
    const matchesStatus = status === "all" || lead.status === status;
    const matchesSource = source === "all" || lead.source === source;
    const matchesOwner =
      owner === "all" ||
      (owner === "unassigned" && !lead.assignedTo) ||
      lead.assignedTo === owner ||
      getMemberName(lead.assignedTo) === owner;

    return matchesQuery && matchesStatus && matchesSource && matchesOwner;
  });
}

function renderMetrics() {
  elements.metricTotal.textContent = formatter.format(leads.length);
  elements.metricNew.textContent = formatter.format(leads.filter((lead) => !lead.assignedTo && lead.status !== "Closed").length);
  elements.metricAssigned.textContent = formatter.format(leads.filter((lead) => lead.assignedTo).length);
  elements.metricTeam.textContent = formatter.format(teamMembers.length);
}

function renderFilterOptions() {
  const currentSource = elements.sourceFilter.value;
  const currentOwner = elements.ownerFilter.value;
  const sources = [...new Set(leads.map((lead) => lead.source).filter(Boolean))].sort();

  elements.sourceFilter.innerHTML = `<option value="all">ทุกแหล่ง</option>${sources
    .map((source) => `<option value="${escapeHtml(source)}">${escapeHtml(source)}</option>`)
    .join("")}`;
  elements.sourceFilter.value = sources.includes(currentSource) ? currentSource : "all";

  elements.ownerFilter.innerHTML = `
    <option value="all">ทุกคน</option>
    <option value="unassigned">ยังไม่แจก</option>
    ${teamMembers.map((member) => `<option value="${escapeHtml(member.name)}">${escapeHtml(member.name)}</option>`).join("")}
  `;
  elements.ownerFilter.value = currentOwner === "unassigned" || teamMembers.some((member) => member.name === currentOwner) ? currentOwner : "all";
}

function statusClass(status) {
  if (status === "New") return "status-new";
  if (status === "Assigned") return "status-assigned";
  if (status === "Closed") return "status-closed";
  return "";
}

function memberOptions(selectedValue = "") {
  return teamMembers
    .map((member) => {
      const selected = selectedValue === member.id || selectedValue === member.name ? "selected" : "";
      return `<option value="${escapeHtml(member.id)}" ${selected}>${escapeHtml(member.name)}</option>`;
    })
    .join("");
}

function renderLeadTable() {
  const filtered = getFilteredLeads();
  elements.leadSummary.textContent = `แสดง ${formatter.format(filtered.length)} จาก ${formatter.format(leads.length)} leads`;

  if (!filtered.length) {
    elements.tableBody.innerHTML = `<tr><td colspan="6"><div class="empty-state">ไม่พบ lead ตามตัวกรอง</div></td></tr>`;
    return;
  }

  elements.tableBody.innerHTML = filtered
    .map((lead) => {
      const selected = lead.id === selectedLeadId ? "is-selected" : "";
      const owner = getMemberName(lead.assignedTo) || "-";
      return `
        <tr class="${selected}" data-lead-row="${escapeHtml(lead.id)}">
          <td>
            <div class="lead-main">
              <span class="lead-name">${escapeHtml(lead.name)}</span>
              <span class="lead-muted">${escapeHtml(lead.phone || "-")} · LINE ${escapeHtml(lead.lineId || "-")}</span>
            </div>
          </td>
          <td>${escapeHtml(lead.source || "-")}<br /><span class="lead-muted">${formatDate(lead.createdAt)}</span></td>
          <td>${escapeHtml(lead.interest || "-")}<br /><span class="lead-muted">${escapeHtml(lead.budget || lead.coverage || "")}</span></td>
          <td><span class="status-pill ${statusClass(lead.status)}">${escapeHtml(lead.status || "New")}</span></td>
          <td>${escapeHtml(owner)}</td>
          <td>
            <div class="assign-controls">
              <select data-assign-select="${escapeHtml(lead.id)}">
                <option value="">เลือกคนรับ</option>
                ${memberOptions(lead.assignedTo)}
              </select>
              <button class="secondary-btn" type="button" data-assign="${escapeHtml(lead.id)}">แจก</button>
            </div>
          </td>
        </tr>
      `;
    })
    .join("");
}

function renderDetail() {
  const lead = leads.find((item) => item.id === selectedLeadId);
  if (!lead) {
    elements.detailSubtitle.textContent = "เลือก lead จากตาราง";
    elements.detail.innerHTML = `<div class="empty-state">ยังไม่ได้เลือก lead</div>`;
    return;
  }

  elements.detailSubtitle.textContent = `${lead.name} · ${lead.phone || "-"}`;
  elements.detail.innerHTML = `
    <div class="detail-card">
      ${detailRow("ชื่อ", lead.name)}
      ${detailRow("เบอร์", lead.phone)}
      ${detailRow("LINE", lead.lineId)}
      ${detailRow("อีเมล", lead.email)}
      ${detailRow("เพศ / อายุ", [lead.gender, lead.age].filter(Boolean).join(" / "))}
      ${detailRow("แผน", lead.interest)}
      ${detailRow("ทุน / งบ", [lead.coverage, lead.budget].filter(Boolean).join(" / "))}
      ${detailRow("เวลาสะดวก", lead.preferredTime)}
      ${detailRow("แหล่งที่มา", lead.source)}
      ${detailRow("สถานะ", lead.status)}
      ${detailRow("ผู้รับผิดชอบ", getMemberName(lead.assignedTo) || "ยังไม่แจก")}
      ${detailRow("หมายเหตุ", lead.note)}
      <button class="ghost-btn" type="button" data-return="${escapeHtml(lead.id)}">ดึงกลับเข้ากองกลาง</button>
    </div>
  `;
}

function detailRow(label, value) {
  return `
    <div class="detail-row">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value || "-")}</strong>
    </div>
  `;
}

function renderTeam() {
  if (!teamMembers.length) {
    elements.teamList.innerHTML = `<div class="empty-state">ยังไม่มีลูกทีม</div>`;
    return;
  }

  elements.teamList.innerHTML = teamMembers
    .map((member) => {
      const count = leads.filter((lead) => lead.assignedTo === member.id || lead.assignedTo === member.name).length;
      return `
        <article class="team-item">
          <div>
            <span class="team-name">${escapeHtml(member.name)}</span>
            <span class="team-contact">${escapeHtml(member.contact || "ยังไม่ระบุ")} · ${formatter.format(count)} leads</span>
          </div>
          <button class="danger-btn" type="button" data-remove-member="${escapeHtml(member.id)}">ปิดใช้งาน</button>
        </article>
      `;
    })
    .join("");
}

function render() {
  renderMetrics();
  renderFilterOptions();
  renderLeadTable();
  renderDetail();
  renderTeam();
}

async function assignLead(leadId) {
  const select = document.querySelector(`[data-assign-select="${CSS.escape(leadId)}"]`);
  const memberId = select?.value;
  const member = teamMembers.find((item) => item.id === memberId);
  if (!member) {
    showToast("เลือกลูกทีมก่อนแจก lead");
    return;
  }

  if (isCentralMode()) {
    try {
      const payload = await callCentralApi("assign", { leadId, member: member.name });
      applyCentralData(payload);
      selectedLeadId = leadId;
      render();
      showToast(`แจก lead ให้ ${member.name} แล้ว`);
      return;
    } catch (error) {
      showToast(error.message);
    }
  }

  leads = leads.map((lead) => (lead.id === leadId ? { ...lead, assignedTo: member.id, status: "Assigned" } : lead));
  saveLocalState();
  render();
  showToast(`แจก lead ให้ ${member.name} แล้ว`);
}

async function returnLead(leadId) {
  if (isCentralMode()) {
    try {
      const payload = await callCentralApi("return", { leadId });
      applyCentralData(payload);
      selectedLeadId = leadId;
      render();
      showToast("ดึง lead กลับเข้ากองกลางแล้ว");
      return;
    } catch (error) {
      showToast(error.message);
    }
  }

  leads = leads.map((lead) => (lead.id === leadId ? { ...lead, assignedTo: "", status: "New" } : lead));
  saveLocalState();
  render();
  showToast("ดึง lead กลับเข้ากองกลางแล้ว");
}

async function addMember(event) {
  event.preventDefault();
  const data = new FormData(elements.teamForm);
  const name = String(data.get("memberName") || "").trim();
  const contact = String(data.get("memberContact") || "").trim();
  if (!name) return;

  if (isCentralMode()) {
    try {
      const payload = await callCentralApi("addMember", { name, contact });
      elements.teamForm.reset();
      applyCentralData(payload);
      showToast(`เพิ่ม ${name} แล้ว`);
      return;
    } catch (error) {
      showToast(error.message);
    }
  }

  teamMembers.push({ id: createId(), name, contact });
  elements.teamForm.reset();
  saveLocalState();
  render();
}

async function removeMember(memberId) {
  const member = teamMembers.find((item) => item.id === memberId);
  if (isCentralMode()) {
    try {
      const payload = await callCentralApi("removeMember", { id: memberId });
      applyCentralData(payload);
      showToast(`ปิดใช้งาน ${member?.name || "ลูกทีม"} แล้ว`);
      return;
    } catch (error) {
      showToast(error.message);
    }
  }

  teamMembers = teamMembers.filter((item) => item.id !== memberId);
  leads = leads.map((lead) => (lead.assignedTo === memberId ? { ...lead, assignedTo: "", status: "New" } : lead));
  saveLocalState();
  render();
}

async function addManualLead(event) {
  event.preventDefault();
  const data = new FormData(elements.manualForm);
  const lead = {
    id: createId(),
    name: String(data.get("leadName") || "").trim(),
    phone: String(data.get("leadPhone") || "").trim(),
    lineId: String(data.get("leadLine") || "").trim(),
    interest: String(data.get("leadInterest") || "ปรึกษาแผนประกัน"),
    source: "Admin Manual",
    status: "New",
    assignedTo: "",
    createdAt: new Date().toISOString(),
    note: "เพิ่มจากหน้าแอดมิน",
  };

  if (!lead.name || !lead.phone) return;

  if (isCentralMode()) {
    try {
      const payload = await callCentralApi("addLead", {
        name: lead.name,
        phone: lead.phone,
        lineId: lead.lineId,
        interest: lead.interest,
        note: lead.note,
      });
      elements.manualForm.reset();
      applyCentralData(payload);
      showToast("เพิ่ม lead เข้า Google Sheet กลางแล้ว");
      return;
    } catch (error) {
      showToast(error.message);
    }
  }

  leads.unshift(lead);
  selectedLeadId = lead.id;
  elements.manualForm.reset();
  saveLocalState();
  render();
}

function saveApiUrl() {
  centralApiUrl = elements.apiInput.value.trim();
  window.localStorage.setItem(centralApiStorageKey, centralApiUrl);
  if (centralApiUrl) {
    setSyncStatus("URL saved · ready", true);
    refreshCentralData();
  } else {
    setSyncStatus("Local mode");
    render();
  }
}

function clearFilters() {
  elements.search.value = "";
  elements.statusFilter.value = "all";
  elements.sourceFilter.value = "all";
  elements.ownerFilter.value = "all";
  renderLeadTable();
}

function handleTableClick(event) {
  if (event.target.closest("select")) {
    return;
  }

  const assignId = event.target.dataset.assign;
  if (assignId) {
    assignLead(assignId);
    return;
  }

  const row = event.target.closest("[data-lead-row]");
  if (row) {
    selectedLeadId = row.dataset.leadRow;
    renderLeadTable();
    renderDetail();
  }
}

function handleDocumentClick(event) {
  const returnId = event.target.dataset.return;
  const removeMemberId = event.target.dataset.removeMember;
  if (returnId) returnLead(returnId);
  if (removeMemberId) removeMember(removeMemberId);
}

elements.apiInput.value = centralApiUrl;
setSyncStatus(centralApiUrl ? "URL saved · ready" : "Local mode", Boolean(centralApiUrl));
render();
if (centralApiUrl) refreshCentralData();

elements.saveApi.addEventListener("click", saveApiUrl);
elements.refresh.addEventListener("click", refreshCentralData);
elements.sync.addEventListener("click", syncSources);
elements.clearFilters.addEventListener("click", clearFilters);
elements.tableBody.addEventListener("click", handleTableClick);
elements.teamForm.addEventListener("submit", addMember);
elements.manualForm.addEventListener("submit", addManualLead);
document.addEventListener("click", handleDocumentClick);
elements.search.addEventListener("input", renderLeadTable);
elements.statusFilter.addEventListener("change", renderLeadTable);
elements.sourceFilter.addEventListener("change", renderLeadTable);
elements.ownerFilter.addEventListener("change", renderLeadTable);
