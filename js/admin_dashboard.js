/**
 * Logic điều khiển Bảng điều khiển Quản trị viên (Role: ADMIN)
 * Tích hợp Backend API: /auth/me, /api/health, DataStore
 */

let currentUser = null;
let organizations = [];
const reviewingOrganizations = new Set();

document.addEventListener("DOMContentLoaded", async () => {
  // 1. Kiểm tra xác thực & vai trò ADMIN
  currentUser = await Auth.requireAuth(["ADMIN"]);
  if (!currentUser) return;
  NotificationsUI.init();

  // 2. Thiết lập Header
  setupAdminHeader();

  // 3. Khởi tạo Tabs & Mobile menu
  setupTabs();
  setupMobileMenu();

  const requestedTab = new URLSearchParams(location.search).get("tab");
  if (requestedTab && document.getElementById("tab-" + requestedTab)) {
    switchAdminTab(requestedTab);
  }

  await loadOrganizations();

  // 4. Nạp dữ liệu các module
  renderSystemOverview();
  renderOrganizationsTable();
  renderCampaignsTable();
  renderUsersTable();
  renderCertificatesTable();

  // 5. Đăng xuất
  document.getElementById("logoutBtn").addEventListener("click", () => {
    Auth.logout();
  });
});

function setupAdminHeader() {
  const fullName = currentUser.full_name || currentUser.name || "Quản trị viên";
  const firstLetter = fullName.trim().charAt(0).toUpperCase();

  document.getElementById("headerUserName").textContent = fullName;
  document.getElementById("headerAvatar").textContent = firstLetter;
}

function setupTabs() {
  const navItems = document.querySelectorAll(".dash-nav-item[data-tab]");
  navItems.forEach(item => {
    item.addEventListener("click", (e) => {
      e.preventDefault();
      const tabId = item.getAttribute("data-tab");
      switchAdminTab(tabId);
    });
  });
}

function switchAdminTab(tabId) {
  document.querySelectorAll(".dash-nav-item[data-tab]").forEach(nav => {
    if (nav.getAttribute("data-tab") === tabId) {
      nav.classList.add("active", "active-admin");
    } else {
      nav.classList.remove("active", "active-admin");
    }
  });

  document.querySelectorAll(".tab-panel").forEach(panel => {
    panel.classList.remove("active");
  });
  const targetPanel = document.getElementById("tab-" + tabId);
  if (targetPanel) {
    targetPanel.classList.add("active");
  }

  const sidebar = document.getElementById("dashSidebar");
  if (sidebar) sidebar.classList.remove("open");
}

function setupMobileMenu() {
  const btn = document.getElementById("mobileMenuBtn");
  const sidebar = document.getElementById("dashSidebar");
  if (btn && sidebar) {
    btn.addEventListener("click", () => {
      sidebar.classList.toggle("open");
    });
  }
}

// ================= TAB 1: SYSTEM OVERVIEW =================
function renderSystemOverview() {
  const users = DataStore.getUsers();
  const orgs = organizations;
  const camps = DataStore.getCampaigns();

  const pendingOrgs = orgs.filter(o => o.status === "PENDING");
  const pendingCamps = camps.filter(c => c.status === "PENDING");
  const openCamps = camps.filter(c => c.status === "OPEN");

  document.getElementById("adminKpiUsers").textContent = users.length;
  document.getElementById("adminKpiOrgs").textContent = orgs.length;
  document.getElementById("adminKpiOrgsMeta").textContent = `${pendingOrgs.length} tổ chức đang chờ xét duyệt`;
  document.getElementById("adminKpiCampaigns").textContent = openCamps.length;
  document.getElementById("adminKpiPendingAll").textContent = pendingOrgs.length + pendingCamps.length;

  document.getElementById("pendingOrgsBadge").textContent = pendingOrgs.length;
  document.getElementById("pendingCampsBadge").textContent = pendingCamps.length;
  document.getElementById("totalUsersBadge").textContent = users.length;

  // Render quick pending queues
  const quickOrgsTbody = document.getElementById("adminQuickPendingOrgsTbody");
  if (quickOrgsTbody) {
    if (pendingOrgs.length === 0) {
      quickOrgsTbody.innerHTML = `<tr><td colspan="3" style="text-align: center; color: #94a3b8; padding: 18px;">Không có tổ chức nào chờ duyệt</td></tr>`;
    } else {
      quickOrgsTbody.innerHTML = pendingOrgs.slice(0, 3).map(o => `
        <tr>
          <td>
            <div class="td-title">${escapeHtml(o.name)}</div>
            <div class="td-subtitle">${escapeHtml(o.email)}</div>
          </td>
          <td style="font-size: 13px;">${formatDateTime(o.created_at)}</td>
          <td style="text-align: right;">
            <button class="btn-action btn-action-primary" onclick="approveOrganization(${o.id})">Duyệt</button>
            <button class="btn-action btn-action-danger" onclick="openRejectOrgModal(${o.id})">Từ chối</button>
          </td>
        </tr>
      `).join("");
    }
  }

  const quickCampsTbody = document.getElementById("adminQuickPendingCampsTbody");
  if (quickCampsTbody) {
    if (pendingCamps.length === 0) {
      quickCampsTbody.innerHTML = `<tr><td colspan="3" style="text-align: center; color: #94a3b8; padding: 18px;">Không có chiến dịch nào chờ duyệt</td></tr>`;
    } else {
      quickCampsTbody.innerHTML = pendingCamps.slice(0, 3).map(c => `
        <tr>
          <td>
            <div class="td-title">${escapeHtml(c.title)}</div>
            <div class="td-subtitle">${escapeHtml(c.organization_name || "Tổ chức")}</div>
          </td>
          <td><span class="status-pill status-open">${escapeHtml(c.category)}</span></td>
          <td style="text-align: right;">
            <button class="btn-action btn-action-primary" onclick="approveCampaign(${c.id})">Duyệt</button>
            <button class="btn-action btn-action-danger" onclick="openRejectCampModal(${c.id})">Từ chối</button>
          </td>
        </tr>
      `).join("");
    }
  }
}

// ================= TAB 2: KIỂM DUYỆT TỔ CHỨC =================
function renderOrganizationsTable() {
  const orgs = organizations;
  const tbody = document.getElementById("adminOrgsTbody");
  if (!tbody) return;

  const statusMap = {
    APPROVED: { label: "Đã phê duyệt", class: "status-approved" },
    PENDING: { label: "Chờ phê duyệt", class: "status-pending" },
    REJECTED: { label: "Bị từ chối", class: "status-rejected" }
  };

  tbody.innerHTML = orgs.map(o => {
    const st = statusMap[o.status] || { label: o.status, class: "status-draft" };
    return `
      <tr>
        <td>
          <div class="td-title">${escapeHtml(o.name)}</div>
          <div class="td-subtitle">Mã: ORG-${o.id} · Đại diện: ${escapeHtml(o.owner_email || "—")}</div>
        </td>
        <td>
          <div>${escapeHtml(o.email)}</div>
          <div class="td-subtitle">${escapeHtml(o.phone)} · ${escapeHtml(o.address || "Hà Nội")}</div>
        </td>
        <td>
          ${o.document_url ? `
            <a href="${escapeHtml(o.document_url)}" target="_blank" style="color: #2563eb; font-weight: 600; font-size: 13px;">
              📄 Giấy phép pháp lý ↗
            </a>
          ` : `<span style="color: #94a3b8; font-size: 13px;">Chưa nộp file</span>`}
        </td>
        <td>
          <span class="status-pill ${st.class}">
            <span class="status-dot"></span>
            ${st.label}
          </span>
        </td>
        <td style="max-width: 220px; font-size: 12.5px; color: #b91c1c;">
          ${escapeHtml(o.rejection_reason || "—")}
        </td>
        <td style="text-align: right;">
          <div class="btn-group-sm" style="justify-content: flex-end;">
            ${o.status === "PENDING" ? `
              <button class="btn-action btn-action-primary" onclick="approveOrganization(${o.id})">✓ Phê duyệt</button>
            ` : ""}
            ${o.status === "PENDING" ? `
              <button class="btn-action btn-action-danger" onclick="openRejectOrgModal(${o.id})">✕ Từ chối</button>
            ` : ""}
          </div>
        </td>
      </tr>
    `;
  }).join("");
}

function filterAdminOrgs() {
  const query = document.getElementById("adminOrgSearch").value.toLowerCase();
  const status = document.getElementById("adminOrgStatusFilter").value;
  const rows = document.querySelectorAll("#adminOrgsTbody tr");

  rows.forEach(row => {
    const text = row.textContent.toLowerCase();
    const matchesQuery = !query || text.includes(query);
    const matchesStatus = !status || text.includes(status.toLowerCase());
    row.style.display = matchesQuery && matchesStatus ? "" : "none";
  });
}

async function loadOrganizations() {
  try {
    const { data } = await api.get("/admin/organizations");
    organizations = data;
  } catch (error) {
    showToast("Không thể tải danh sách tổ chức.", "error");
  }
}

async function reviewOrganization(orgId, action, reason) {
  if (reviewingOrganizations.has(orgId)) return false;
  reviewingOrganizations.add(orgId);
  try {
    const { data } = await api.patch("/admin/organizations/" + orgId + "/review", null, {
      params: { action, reason }
    });
    const organization = organizations.find(item => item.id === orgId);
    if (organization) Object.assign(organization, {status: data.status, rejection_reason: reason || null});
    showToast(data.message, "success");
    renderSystemOverview();
    renderOrganizationsTable();
    return true;
  } catch (error) {
    showToast(error.response?.data?.detail || "Không thể xử lý hồ sơ.", "error");
    return false;
  } finally {
    reviewingOrganizations.delete(orgId);
  }
}

function approveOrganization(orgId) {
  return reviewOrganization(orgId, "APPROVE");
}

function openRejectOrgModal(orgId) {
  document.getElementById("rejectOrgId").value = orgId;
  document.getElementById("rejectOrgReasonInput").value = "";
  openModal("rejectOrgModal");
}

async function submitRejectOrg() {
  const orgId = parseInt(document.getElementById("rejectOrgId").value);
  const reason = document.getElementById("rejectOrgReasonInput").value.trim();

  if (!reason) {
    showToast("Vui lòng nhập lý do từ chối để phản hồi cho tổ chức!", "error");
    return;
  }

  if (await reviewOrganization(orgId, "REJECT", reason)) closeModal("rejectOrgModal");
}

// ================= TAB 3: KIỂM DUYỆT CHIẾN DỊCH =================
function renderCampaignsTable() {
  const camps = DataStore.getCampaigns();
  const tbody = document.getElementById("adminCampaignsTbody");
  if (!tbody) return;

  const statusMap = {
    OPEN: { label: "Đang mở", class: "status-open" },
    PENDING: { label: "Chờ kiểm duyệt", class: "status-pending" },
    DRAFT: { label: "Bản nháp", class: "status-draft" },
    COMPLETED: { label: "Hoàn thành", class: "status-completed" },
    REJECTED: { label: "Từ chối", class: "status-rejected" }
  };

  tbody.innerHTML = camps.map(c => {
    const st = statusMap[c.status] || { label: c.status, class: "status-draft" };
    return `
      <tr>
        <td>
          <div class="td-title">${escapeHtml(c.title)}</div>
          <div class="td-subtitle">Lĩnh vực: <strong>${escapeHtml(c.category)}</strong></div>
        </td>
        <td>
          <div style="font-weight: 600;">${escapeHtml(c.organization_name || `Tổ chức #${c.organization_id}`)}</div>
        </td>
        <td>
          <div style="font-size: 13px;">${escapeHtml(c.location)}</div>
          <div class="td-subtitle">${formatDateTime(c.start_time)}</div>
        </td>
        <td>
          <strong>${c.registered_count || 0}</strong> / ${c.max_participants}
          <div class="td-subtitle">(${c.estimated_hours}h)</div>
        </td>
        <td>
          <span class="status-pill ${st.class}">
            <span class="status-dot"></span>
            ${st.label}
          </span>
          ${c.reason ? `<div style="font-size: 11px; color: #b91c1c; margin-top: 4px;">Lý do: ${escapeHtml(c.reason)}</div>` : ""}
        </td>
        <td style="text-align: right;">
          <div class="btn-group-sm" style="justify-content: flex-end;">
            ${c.status !== "OPEN" ? `
              <button class="btn-action btn-action-primary" onclick="approveCampaign(${c.id})">✓ Cho phép mở (OPEN)</button>
            ` : ""}
            ${c.status !== "REJECTED" ? `
              <button class="btn-action btn-action-danger" onclick="openRejectCampModal(${c.id})">✕ Từ chối</button>
            ` : ""}
          </div>
        </td>
      </tr>
    `;
  }).join("");
}

function filterAdminCamps() {
  const query = document.getElementById("adminCampSearch").value.toLowerCase();
  const status = document.getElementById("adminCampStatusFilter").value;
  const rows = document.querySelectorAll("#adminCampaignsTbody tr");

  rows.forEach(row => {
    const text = row.textContent.toLowerCase();
    const matchesQuery = !query || text.includes(query);
    const matchesStatus = !status || text.includes(status.toLowerCase());
    row.style.display = matchesQuery && matchesStatus ? "" : "none";
  });
}

function approveCampaign(campId) {
  const camp = DataStore.getCampaigns().find(c => c.id === campId);
  if (camp) {
    camp.status = "OPEN";
    camp.reason = null;
    DataStore.saveCampaign(camp);
    showToast(`Đã duyệt mở chiến dịch: "${camp.title}"!`, "success");
    renderSystemOverview();
    renderCampaignsTable();
  }
}

function openRejectCampModal(campId) {
  document.getElementById("rejectCampId").value = campId;
  document.getElementById("rejectCampReasonInput").value = "";
  openModal("rejectCampModal");
}

function submitRejectCamp() {
  const campId = parseInt(document.getElementById("rejectCampId").value);
  const reason = document.getElementById("rejectCampReasonInput").value.trim();

  if (!reason) {
    showToast("Vui lòng ghi rõ hướng dẫn điều chỉnh cho ban tổ chức!", "error");
    return;
  }

  const camp = DataStore.getCampaigns().find(c => c.id === campId);
  if (camp) {
    camp.status = "REJECTED";
    camp.reason = reason;
    DataStore.saveCampaign(camp);
    closeModal("rejectCampModal");
    showToast("Đã từ chối chiến dịch và gửi phản hồi.", "warning");
    renderSystemOverview();
    renderCampaignsTable();
  }
}

// ================= TAB 4: QUẢN LÝ NGƯỜI DÙNG & PHÂN QUYỀN =================
function renderUsersTable() {
  const users = DataStore.getUsers();
  const tbody = document.getElementById("adminUsersTbody");
  if (!tbody) return;

  tbody.innerHTML = users.map(u => {
    const isLocked = u.status === "LOCKED";
    const roleBadgeClass = u.role === "ADMIN" ? "dash-role-admin" : (u.role === "ORGANIZER" ? "dash-role-organizer" : "dash-role-user");

    return `
      <tr>
        <td>
          <div class="td-title">${escapeHtml(u.full_name)}</div>
          <div class="td-subtitle">ID: USR-${u.id}</div>
        </td>
        <td>
          <div>${escapeHtml(u.email)}</div>
          <div class="td-subtitle">${escapeHtml(u.phone || "Chưa cập nhật SĐT")}</div>
        </td>
        <td>
          <span class="dash-role-badge ${roleBadgeClass}">${u.role}</span>
        </td>
        <td>
          <span class="status-pill ${isLocked ? "status-locked" : "status-active"}">
            <span class="status-dot"></span>
            ${isLocked ? "Bị Khóa (LOCKED)" : "Hoạt động (ACTIVE)"}
          </span>
        </td>
        <td style="font-size: 13px;">${formatDateTime(u.created_at)}</td>
        <td style="text-align: right;">
          <div class="btn-group-sm" style="justify-content: flex-end;">
            ${isLocked ? `
              <button class="btn-action btn-action-primary" onclick="toggleUserLock(${u.id}, 'ACTIVE')">Mở khóa</button>
            ` : `
              <button class="btn-action btn-action-danger" onclick="toggleUserLock(${u.id}, 'LOCKED')">Khóa tài khoản</button>
            `}
            <button class="btn-action" style="color: #64748b;" onclick="changeUserRolePrompt(${u.id}, '${u.role}')">Đổi vai trò</button>
          </div>
        </td>
      </tr>
    `;
  }).join("");
}

function filterAdminUsers() {
  const query = document.getElementById("adminUserSearch").value.toLowerCase();
  const role = document.getElementById("adminUserRoleFilter").value;
  const status = document.getElementById("adminUserStatusFilter").value;
  const rows = document.querySelectorAll("#adminUsersTbody tr");

  rows.forEach(row => {
    const text = row.textContent.toLowerCase();
    const matchesQuery = !query || text.includes(query);
    const matchesRole = !role || text.includes(role.toLowerCase());
    const matchesStatus = !status || text.includes(status.toLowerCase());
    row.style.display = matchesQuery && matchesRole && matchesStatus ? "" : "none";
  });
}

function toggleUserLock(userId, newStatus) {
  if (userId === currentUser.id) {
    showToast("Không thể tự khóa tài khoản Admin đang đăng nhập!", "error");
    return;
  }

  DataStore.updateUserStatus(userId, newStatus);
  showToast(`Đã chuyển trạng thái tài khoản thành: ${newStatus}`, "info");
  renderSystemOverview();
  renderUsersTable();
}

function changeUserRolePrompt(userId, currentRole) {
  if (userId === currentUser.id) {
    showToast("Không thể tự đổi quyền của tài khoản Admin hiện tại!", "error");
    return;
  }

  const newRole = prompt("Nhập vai trò mới (USER / ORGANIZER / ADMIN):", currentRole);
  if (newRole && ["USER", "ORGANIZER", "ADMIN"].includes(newRole.toUpperCase())) {
    const users = DataStore.getUsers();
    const target = users.find(u => u.id === userId);
    if (target) {
      target.role = newRole.toUpperCase();
      DataStore.set(DataStore.STORAGE_KEYS.USERS, users);
      showToast(`Đã đổi vai trò thành ${target.role}!`, "success");
      renderUsersTable();
    }
  } else if (newRole) {
    showToast("Vai trò không hợp lệ! Chỉ chấp nhận: USER, ORGANIZER, ADMIN.", "error");
  }
}

// ================= TAB 5: GIÁM SÁT CHỨNG CHỈ =================
function renderCertificatesTable() {
  const certs = DataStore.getCertificates();
  const users = DataStore.getUsers();
  const tbody = document.getElementById("adminCertificatesTbody");
  if (!tbody) return;

  tbody.innerHTML = certs.map(c => {
    const user = users.find(u => u.id === c.user_id) || { full_name: "Tình nguyện viên" };
    const isRevoked = c.status === "REVOKED";

    return `
      <tr>
        <td><span class="cert-code" style="margin: 0;">${escapeHtml(c.certificate_code)}</span></td>
        <td>
          <div class="td-title">${escapeHtml(user.full_name)}</div>
          <div class="td-subtitle">ID: USR-${c.user_id}</div>
        </td>
        <td>
          <div style="font-weight: 600;">${escapeHtml(c.campaign_title)}</div>
        </td>
        <td><strong>${c.total_hours} giờ</strong></td>
        <td>
          <span class="status-pill ${isRevoked ? "status-revoked" : "status-approved"}">
            <span class="status-dot"></span>
            ${isRevoked ? "Đã Thu Hồi (REVOKED)" : "Có Hiệu Lực (ACTIVE)"}
          </span>
          ${c.revoked_reason ? `<div style="font-size: 11px; color: #b91c1c; margin-top: 4px;">Lý do: ${escapeHtml(c.revoked_reason)}</div>` : ""}
        </td>
        <td style="text-align: right;">
          ${!isRevoked ? `
            <button class="btn-action btn-action-danger" onclick="openRevokeCertModal(${c.id})">Thu hồi</button>
          ` : `<span style="font-size: 12px; color: #94a3b8;">Không khả dụng</span>`}
        </td>
      </tr>
    `;
  }).join("");
}

function openRevokeCertModal(certId) {
  document.getElementById("revokeCertId").value = certId;
  document.getElementById("revokeCertReasonInput").value = "";
  openModal("revokeCertModal");
}

function submitRevokeCert() {
  const certId = parseInt(document.getElementById("revokeCertId").value);
  const reason = document.getElementById("revokeCertReasonInput").value.trim();

  if (!reason) {
    showToast("Vui lòng nhập lý do thu hồi chứng chỉ!", "error");
    return;
  }

  DataStore.revokeCertificate(certId, reason);
  closeModal("revokeCertModal");
  showToast("Đã thu hồi chứng chỉ thành công!", "warning");
  renderCertificatesTable();
}

// Health check
async function checkBackendHealth() {
  try {
    const res = await api.get("/health");
    showToast(`Kết nối Backend OK! Database: ${res.data?.database || "Connected"}`, "success");
  } catch (err) {
    showToast("Không thể kết nối Backend FastAPI tại port 8000. Hãy kiểm tra server!", "error");
  }
}

function exportSystemReport() {
  const users = DataStore.getUsers();
  const orgs = organizations;
  const camps = DataStore.getCampaigns();
  const certs = DataStore.getCertificates();

  const reportData = `BÁO CÁO TỔNG HỢP VOLUNTEERLINK
Thời gian xuất: ${new Date().toLocaleString("vi-VN")}
========================================
- Tổng người dùng: ${users.length}
  * Tình nguyện viên (USER): ${users.filter(u => u.role === "USER").length}
  * Tổ chức (ORGANIZER): ${users.filter(u => u.role === "ORGANIZER").length}
  * Quản trị viên (ADMIN): ${users.filter(u => u.role === "ADMIN").length}
- Tổng tổ chức đăng ký: ${orgs.length} (Đã duyệt: ${orgs.filter(o => o.status === "APPROVED").length})
- Tổng chiến dịch: ${camps.length} (Đang mở: ${camps.filter(c => c.status === "OPEN").length})
- Tổng chứng chỉ đã phát hành: ${certs.length}
========================================`;

  const blob = new Blob([reportData], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Bao_Cao_VolunteerLink_${Date.now()}.txt`;
  a.click();
  showToast("Đã xuất báo cáo hệ thống thành công!", "success");
}

// Modal helpers
function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.add("open");
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.remove("open");
}

