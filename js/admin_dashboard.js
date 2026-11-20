/**
 * Trung tâm Điều hành Quản trị (Role: ADMIN)
 * Kết nối Backend FastAPI:
 *   - Health: GET /api/health
 *   - Organizations: GET /api/admin/organizations, PATCH /api/admin/organizations/{id}/review
 *   - Campaigns: GET /api/admin/campaigns/pending, GET /api/campaigns, PATCH /api/admin/campaigns/{id}/review
 *   - Users: GET /api/admin/users, PATCH /api/admin/users/{id}/status, PATCH /api/admin/users/{id}/role
 *   - Certificates: GET /api/admin/certificates, PATCH /api/admin/certificates/{id}/revoke
 *   - Notifications: Layout.initNotificationBell("ADMIN")
 */

let currentUser = null;
let allOrganizations = [];
let allCampaigns = [];
let allUsers = [];
let allCertificates = [];

const ORG_STATUS_MAP = {
  PENDING: { label: "Chờ duyệt", cls: "status-pending" },
  APPROVED: { label: "Đã duyệt", cls: "status-approved" },
  REJECTED: { label: "Bị từ chối", cls: "status-rejected" },
};

const CAMP_STATUS_MAP = {
  PENDING: { label: "Chờ duyệt", cls: "status-pending" },
  OPEN: { label: "Đang mở", cls: "status-approved" },
  CLOSED: { label: "Đã đóng", cls: "status-closed" },
  COMPLETED: { label: "Hoàn thành", cls: "status-approved" },
  REJECTED: { label: "Bị từ chối", cls: "status-rejected" },
  CANCELLED: { label: "Đã hủy", cls: "status-closed" },
};

function extractApiError(error, fallback = "Đã xảy ra lỗi khi kết nối máy chủ.") {
  const detail = error?.response?.data?.detail;
  if (typeof detail === "string" && detail.trim()) return detail;
  if (Array.isArray(detail) && detail.length > 0) {
    return detail.map((item) => item.msg || "Dữ liệu không hợp lệ").join("; ");
  }
  if (!error?.response) return "Không thể kết nối tới Backend.";
  return fallback;
}

function formatDateVN(value) {
  if (!value) return "--";
  const d = new Date(value);
  return isNaN(d.getTime()) ? "--" : d.toLocaleDateString("vi-VN");
}

function isSafeHttpUrl(url) {
  return /^https?:\/\//i.test(String(url || "").trim());
}

/* ==================== KHỞI TẠO ==================== */

document.addEventListener("DOMContentLoaded", async () => {
  currentUser = await Auth.requireAuth(["ADMIN"]);
  if (!currentUser) return;

  setupAdminHeader();
  setupTabs();
  setupUserMenu();
  if (typeof Layout !== "undefined" && typeof Layout.initNotificationBell === "function") {
    Layout.initNotificationBell("ADMIN");
  }

  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
      try {
        await api.post("/auth/logout");
      } catch {
        // Vẫn xóa session cục bộ nếu token đã hết hạn
      }
      Auth.logout();
    });
  }

  await refreshAllAdminData();
});

async function refreshAllAdminData() {
  await Promise.allSettled([
    checkBackendHealth(false),
    loadAdminOrganizations(),
    loadAdminCampaigns(),
    loadAdminUsers(),
    loadAdminCertificates(),
  ]);
  renderOverviewStats();
}

function setupAdminHeader() {
  const fullName = currentUser.full_name || currentUser.name || currentUser.email || "Quản trị viên";
  const nameEl = document.getElementById("headerUserName");
  if (nameEl) nameEl.textContent = fullName;
  if (typeof renderAvatarElement === "function") {
    renderAvatarElement(document.getElementById("headerAvatar"), currentUser.avatar_url, fullName);
  }
}

function setupTabs() {
  const navItems = Array.from(document.querySelectorAll(".dash-nav-item[data-tab]"));
  navItems.forEach((item, index) => {
    item.addEventListener("click", (e) => {
      e.preventDefault();
      switchAdminTab(item.getAttribute("data-tab"));
    });
    item.addEventListener("keydown", (e) => {
      let nextIndex = null;
      if (e.key === "ArrowDown" || e.key === "ArrowRight") nextIndex = (index + 1) % navItems.length;
      else if (e.key === "ArrowUp" || e.key === "ArrowLeft") nextIndex = (index - 1 + navItems.length) % navItems.length;
      else if (e.key === "Home") nextIndex = 0;
      else if (e.key === "End") nextIndex = navItems.length - 1;
      if (nextIndex !== null) {
        e.preventDefault();
        navItems[nextIndex].focus();
        switchAdminTab(navItems[nextIndex].getAttribute("data-tab"));
      }
    });
  });

  const initialTab = new URLSearchParams(window.location.search).get("tab");
  if (initialTab && document.getElementById("tab-" + initialTab)) {
    switchAdminTab(initialTab);
  }
}

function switchAdminTab(tabId) {
  document.querySelectorAll(".dash-nav-item[data-tab]").forEach((nav) => {
    const isSelected = nav.getAttribute("data-tab") === tabId;
    nav.classList.toggle("active", isSelected);
    nav.setAttribute("aria-selected", String(isSelected));
  });

  document.querySelectorAll(".tab-panel").forEach((panel) => {
    const isTarget = panel.id === "tab-" + tabId;
    panel.classList.toggle("active", isTarget);
    panel.hidden = !isTarget;
  });

  if (tabId && window.history?.replaceState) {
    const url = new URL(window.location.href);
    url.searchParams.set("tab", tabId);
    window.history.replaceState(null, "", url.toString());
  }
}

function setupUserMenu() {
  const trigger = document.getElementById("userMenuBtn");
  const menu = document.getElementById("userDropdownMenu");
  const container = document.getElementById("userMenuContainer");
  if (!trigger || !menu) return;

  const setOpen = (isOpen) => {
    trigger.setAttribute("aria-expanded", String(isOpen));
    menu.hidden = !isOpen;
  };

  trigger.addEventListener("click", (e) => {
    e.stopPropagation();
    setOpen(menu.hidden);
  });

  document.addEventListener("click", (e) => {
    if (container && !container.contains(e.target)) setOpen(false);
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") setOpen(false);
  });
}

/* ==================== TỔNG QUAN & HEALTH ==================== */

function renderOverviewStats() {
  const pendingOrgs = allOrganizations.filter((o) => o.status === "PENDING");
  const approvedOrgs = allOrganizations.filter((o) => o.status === "APPROVED");
  const pendingCamps = allCampaigns.filter((c) => c.status === "PENDING");
  const openCamps = allCampaigns.filter((c) => c.status === "OPEN");

  const setText = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = String(val);
  };

  setText("statPendingOrgs", pendingOrgs.length);
  setText("statPendingCamps", pendingCamps.length);
  setText("statApprovedOrgs", approvedOrgs.length);
  setText("statOpenCamps", openCamps.length);
  setText("pendingOrgsBadge", pendingOrgs.length);
  setText("pendingCampsBadge", pendingCamps.length);

  const quickOrgsTbody = document.getElementById("quickPendingOrgsTbody");
  if (quickOrgsTbody) {
    if (pendingOrgs.length === 0) {
      quickOrgsTbody.innerHTML = `<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:20px;">Không có hồ sơ tổ chức nào đang chờ duyệt.</td></tr>`;
    } else {
      quickOrgsTbody.innerHTML = pendingOrgs
        .slice(0, 5)
        .map(
          (org) => `
          <tr>
            <td><strong>${escapeHtml(org.name)}</strong></td>
            <td style="font-size:0.84rem;color:var(--text-muted);">${escapeHtml(org.email)}</td>
            <td><button type="button" class="btn btn-outline btn-sm" onclick="openOrgDetailModal(${Number(org.id)})">Xem</button></td>
            <td>
              <div style="display:inline-flex;gap:6px;">
                <button type="button" class="btn btn-primary btn-sm" onclick="approveOrganization(${Number(org.id)})">Duyệt</button>
                <button type="button" class="btn btn-outline btn-sm" style="color:var(--danger);border-color:var(--danger);" onclick="openRejectOrgModal(${Number(org.id)})">Từ chối</button>
              </div>
            </td>
          </tr>
        `
        )
        .join("");
    }
  }

  const quickCampsTbody = document.getElementById("quickPendingCampsTbody");
  if (quickCampsTbody) {
    if (pendingCamps.length === 0) {
      quickCampsTbody.innerHTML = `<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:20px;">Không có chiến dịch nào đang chờ duyệt.</td></tr>`;
    } else {
      quickCampsTbody.innerHTML = pendingCamps
        .slice(0, 5)
        .map(
          (c) => `
          <tr>
            <td><strong>${escapeHtml(c.title)}</strong></td>
            <td style="font-size:0.84rem;color:var(--text-muted);">${escapeHtml(c.organization?.name || `Org #${c.organization_id}`)}</td>
            <td><a href="campaign_detail.html?id=${encodeURIComponent(c.id)}" class="btn btn-outline btn-sm">Chi tiết</a></td>
            <td>
              <div style="display:inline-flex;gap:6px;">
                <button type="button" class="btn btn-primary btn-sm" onclick="approveCampaign(${Number(c.id)})">Duyệt</button>
                <button type="button" class="btn btn-outline btn-sm" style="color:var(--danger);border-color:var(--danger);" onclick="openRejectCampModal(${Number(c.id)})">Từ chối</button>
              </div>
            </td>
          </tr>
        `
        )
        .join("");
    }
  }
}

async function checkBackendHealth(showNotification = false) {
  const pill = document.getElementById("overviewHealthPill");
  const msgEl = document.getElementById("healthCheckMessage");
  try {
    const res = await api.get("/health");
    const dbOk = res.data?.database === "connected" || res.status === 200;
    if (pill) {
      pill.className = `status-pill ${dbOk ? "status-approved" : "status-pending"}`;
      pill.textContent = dbOk ? "API & MySQL: Hoạt động bình thường" : "API: Đang phản hồi";
    }
    if (msgEl) {
      msgEl.textContent = `Trạng thái: ${res.data?.status || "ok"} | Database: ${res.data?.database || "connected"}`;
    }
    if (showNotification) showToast("Kết nối Backend & MySQL bình thường.", "success");
  } catch (error) {
    if (pill) {
      pill.className = "status-pill status-rejected";
      pill.textContent = "API: Mất kết nối";
    }
    if (msgEl) msgEl.textContent = extractApiError(error, "Không thể kết nối Backend.");
    if (showNotification) showToast(extractApiError(error, "Không thể kết nối Backend."), "error");
  }
}

/* ==================== TAB 2: TỔ CHỨC ==================== */

async function loadAdminOrganizations() {
  const tbody = document.getElementById("adminOrgsTbody");
  try {
    const res = await api.get("/admin/organizations");
    allOrganizations = Array.isArray(res.data) ? res.data : [];
    filterAdminOrgs();
  } catch (error) {
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--danger);padding:20px;">${escapeHtml(extractApiError(error, "Không thể tải danh sách tổ chức."))}</td></tr>`;
    }
  }
}

function filterAdminOrgs() {
  const q = (document.getElementById("orgSearchInput")?.value || "").trim().toLowerCase();
  const statusVal = document.getElementById("orgStatusFilter")?.value || "ALL";
  const tbody = document.getElementById("adminOrgsTbody");
  if (!tbody) return;

  const filtered = allOrganizations.filter((org) => {
    const matchStatus = statusVal === "ALL" || org.status === statusVal;
    const matchText =
      !q ||
      (org.name || "").toLowerCase().includes(q) ||
      (org.email || "").toLowerCase().includes(q);
    return matchStatus && matchText;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:24px;">Không có tổ chức nào phù hợp.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered
    .map((org) => {
      const st = ORG_STATUS_MAP[org.status] || { label: org.status, cls: "status-closed" };
      const docCell = isSafeHttpUrl(org.document_url)
        ? `<a href="${escapeHtml(org.document_url)}" target="_blank" rel="noopener noreferrer" class="btn btn-outline btn-sm">Mở tài liệu</a>`
        : `<span style="color:var(--text-muted);font-size:0.84rem;">Chưa có URL</span>`;

      const reviewCell =
        org.status === "PENDING"
          ? `<div style="display:inline-flex;gap:6px;">
              <button type="button" class="btn btn-primary btn-sm" onclick="approveOrganization(${Number(org.id)})">Duyệt</button>
              <button type="button" class="btn btn-outline btn-sm" style="color:var(--danger);border-color:var(--danger);" onclick="openRejectOrgModal(${Number(org.id)})">Từ chối</button>
            </div>`
          : `<span style="color:var(--text-muted);font-size:0.82rem;">Đã xử lý</span>`;

      return `
        <tr>
          <td>
            <strong>${escapeHtml(org.name)}</strong>
            <div style="font-size:0.8rem;color:var(--text-muted);">${escapeHtml(org.address || "")}</div>
          </td>
          <td>
            <div>${escapeHtml(org.email)}</div>
            <div style="font-size:0.8rem;color:var(--text-muted);">${escapeHtml(org.phone || "")}</div>
          </td>
          <td>${docCell}</td>
          <td>
            <span class="status-pill ${st.cls}">${escapeHtml(st.label)}</span>
            ${org.status === "REJECTED" && org.rejection_reason ? `<div style="font-size:0.78rem;color:var(--danger);margin-top:4px;">${escapeHtml(org.rejection_reason)}</div>` : ""}
          </td>
          <td>
            <button type="button" class="btn btn-outline btn-sm" onclick="openOrgDetailModal(${Number(org.id)})">Xem</button>
          </td>
          <td>${reviewCell}</td>
        </tr>
      `;
    })
    .join("");
}

function openOrgDetailModal(orgId) {
  const org = allOrganizations.find((o) => o.id === orgId);
  if (!org) return;
  const body = document.getElementById("orgDetailBody");
  if (!body) return;
  const docHtml = isSafeHttpUrl(org.document_url)
    ? `<a href="${escapeHtml(org.document_url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(org.document_url)}</a>`
    : "Không có";

  body.innerHTML = `
    <div style="display:grid;gap:10px;font-size:0.92rem;">
      <div><strong>Tên tổ chức:</strong> ${escapeHtml(org.name)}</div>
      <div><strong>Email:</strong> ${escapeHtml(org.email)}</div>
      <div><strong>Số điện thoại:</strong> ${escapeHtml(org.phone || "--")}</div>
      <div><strong>Địa chỉ:</strong> ${escapeHtml(org.address || "--")}</div>
      <div><strong>Tài liệu minh chứng:</strong> ${docHtml}</div>
      <div><strong>Mô tả:</strong> ${escapeHtml(org.description || "Chưa có mô tả")}</div>
      ${org.rejection_reason ? `<div style="color:var(--danger);"><strong>Lý do từ chối gần nhất:</strong> ${escapeHtml(org.rejection_reason)}</div>` : ""}
    </div>
  `;
  openModal("orgDetailModal");
}

async function approveOrganization(orgId) {
  try {
    await api.patch(`/admin/organizations/${orgId}/review`, null, {
      params: { action: "APPROVE" },
    });
    showToast("Đã phê duyệt hồ sơ tổ chức.", "success");
    await loadAdminOrganizations();
    renderOverviewStats();
  } catch (error) {
    showToast(extractApiError(error, "Phê duyệt tổ chức thất bại."), "error");
  }
}

function openRejectOrgModal(orgId) {
  document.getElementById("rejectOrgId").value = String(orgId);
  document.getElementById("rejectOrgReasonInput").value = "";
  openModal("rejectOrgModal");
}

async function submitRejectOrg() {
  const orgId = Number(document.getElementById("rejectOrgId")?.value || 0);
  const reason = document.getElementById("rejectOrgReasonInput")?.value.trim();
  if (!reason) {
    showToast("Vui lòng nhập lý do từ chối.", "warning");
    return;
  }
  try {
    await api.patch(`/admin/organizations/${orgId}/review`, null, {
      params: { action: "REJECT", reason },
    });
    closeModal("rejectOrgModal");
    showToast("Đã từ chối hồ sơ tổ chức.", "info");
    await loadAdminOrganizations();
    renderOverviewStats();
  } catch (error) {
    showToast(extractApiError(error, "Từ chối tổ chức thất bại."), "error");
  }
}

/* ==================== TAB 3: CHIẾN DỊCH ==================== */

async function loadAdminCampaigns() {
  const tbody = document.getElementById("adminCampsTbody");
  try {
    const [pendingRes, publicRes] = await Promise.all([
      api.get("/admin/campaigns/pending"),
      api.get("/campaigns", { params: { page: 1, page_size: 100 } }),
    ]);
    const pendingItems = Array.isArray(pendingRes.data) ? pendingRes.data : [];
    const publicItems = Array.isArray(publicRes.data?.items) ? publicRes.data.items : [];

    const mergedMap = new Map();
    pendingItems.forEach((c) => mergedMap.set(c.id, c));
    publicItems.forEach((c) => {
      if (!mergedMap.has(c.id)) mergedMap.set(c.id, c);
    });
    allCampaigns = Array.from(mergedMap.values()).sort((a, b) => b.id - a.id);
    filterAdminCamps();
  } catch (error) {
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--danger);padding:20px;">${escapeHtml(extractApiError(error, "Không thể tải danh sách chiến dịch."))}</td></tr>`;
    }
  }
}

function filterAdminCamps() {
  const q = (document.getElementById("campSearchInput")?.value || "").trim().toLowerCase();
  const statusVal = document.getElementById("campStatusFilter")?.value || "ALL";
  const tbody = document.getElementById("adminCampsTbody");
  if (!tbody) return;

  const filtered = allCampaigns.filter((c) => {
    const matchStatus = statusVal === "ALL" || c.status === statusVal;
    const matchText =
      !q ||
      (c.title || "").toLowerCase().includes(q) ||
      (c.location || "").toLowerCase().includes(q) ||
      (c.organization?.name || "").toLowerCase().includes(q);
    return matchStatus && matchText;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:24px;">Không có chiến dịch nào phù hợp.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered
    .map((c) => {
      const st = CAMP_STATUS_MAP[c.status] || { label: c.status, cls: "status-closed" };
      const orgName = c.organization?.name || c.organization_name || `Tổ chức #${c.organization_id}`;
      const reviewCell =
        c.status === "PENDING"
          ? `<div style="display:inline-flex;gap:6px;">
              <button type="button" class="btn btn-primary btn-sm" onclick="approveCampaign(${Number(c.id)})">Duyệt</button>
              <button type="button" class="btn btn-outline btn-sm" style="color:var(--danger);border-color:var(--danger);" onclick="openRejectCampModal(${Number(c.id)})">Từ chối</button>
            </div>`
          : `<span style="color:var(--text-muted);font-size:0.82rem;">Đã xử lý</span>`;

      const dateRange =
        c.start_date || c.end_date
          ? `<div>${formatDateVN(c.start_date)} - ${formatDateVN(c.end_date)}</div>`
          : `<div>${escapeHtml(c.category || "Chiến dịch cộng đồng")}</div>`;
      const quotaLine =
        c.max_volunteers != null
          ? `<div style="font-size:0.8rem;color:var(--text-muted);">Chỉ tiêu: ${Number(c.max_volunteers)} TNV</div>`
          : `<div style="font-size:0.8rem;color:var(--text-muted);">Xem chi tiết để biết lịch</div>`;

      return `
        <tr>
          <td>
            <strong>${escapeHtml(c.title)}</strong>
            <div style="font-size:0.8rem;color:var(--text-muted);">${escapeHtml(c.location || "")}</div>
          </td>
          <td>${escapeHtml(orgName)}</td>
          <td>
            ${dateRange}
            ${quotaLine}
          </td>
          <td><span class="status-pill ${st.cls}">${escapeHtml(st.label)}</span></td>
          <td>
            <a href="campaign_detail.html?id=${encodeURIComponent(c.id)}" class="btn btn-outline btn-sm">Chi tiết</a>
          </td>
          <td>${reviewCell}</td>
        </tr>
      `;
    })
    .join("");
}

async function approveCampaign(campId) {
  try {
    await api.patch(`/admin/campaigns/${campId}/review`, { action: "APPROVE" });
    showToast("Đã phê duyệt chiến dịch.", "success");
    await loadAdminCampaigns();
    renderOverviewStats();
  } catch (error) {
    showToast(extractApiError(error, "Phê duyệt chiến dịch thất bại."), "error");
  }
}

function openRejectCampModal(campId) {
  document.getElementById("rejectCampId").value = String(campId);
  document.getElementById("rejectCampReasonInput").value = "";
  openModal("rejectCampModal");
}

async function submitRejectCamp() {
  const campId = Number(document.getElementById("rejectCampId")?.value || 0);
  const reason = document.getElementById("rejectCampReasonInput")?.value.trim();
  if (!reason) {
    showToast("Vui lòng nhập lý do từ chối chiến dịch.", "warning");
    return;
  }
  try {
    await api.patch(`/admin/campaigns/${campId}/review`, { action: "REJECT", reason });
    closeModal("rejectCampModal");
    showToast("Đã từ chối chiến dịch.", "info");
    await loadAdminCampaigns();
    renderOverviewStats();
  } catch (error) {
    showToast(extractApiError(error, "Từ chối chiến dịch thất bại."), "error");
  }
}

/* ==================== TAB 4: NGƯỜI DÙNG ==================== */

async function loadAdminUsers() {
  const tbody = document.getElementById("adminUsersTbody");
  try {
    const res = await api.get("/admin/users");
    allUsers = Array.isArray(res.data) ? res.data : [];
    filterAdminUsers();
  } catch (error) {
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--danger);padding:20px;">${escapeHtml(extractApiError(error, "Không thể tải danh sách người dùng."))}</td></tr>`;
    }
  }
}

function filterAdminUsers() {
  const q = (document.getElementById("userSearchInput")?.value || "").trim().toLowerCase();
  const roleVal = document.getElementById("userRoleFilter")?.value || "ALL";
  const statusVal = document.getElementById("userStatusFilter")?.value || "ALL";
  const tbody = document.getElementById("adminUsersTbody");
  if (!tbody) return;

  const filtered = allUsers.filter((u) => {
    const matchRole = roleVal === "ALL" || u.role === roleVal;
    const matchStatus = statusVal === "ALL" || u.status === statusVal;
    const matchText =
      !q ||
      (u.full_name || "").toLowerCase().includes(q) ||
      (u.email || "").toLowerCase().includes(q);
    return matchRole && matchStatus && matchText;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:24px;">Không có tài khoản nào phù hợp.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered
    .map((u) => {
      const isSelf = u.id === currentUser.id;
      const isActive = u.status === "ACTIVE";
      const nextStatus = isActive ? "LOCKED" : "ACTIVE";
      const lockLabel = isActive ? "Khóa" : "Mở khóa";
      const statusCls = isActive ? "status-approved" : "status-rejected";
      const statusText = isActive ? "Hoạt động" : "Đã khóa";

      return `
        <tr>
          <td>
            <strong>${escapeHtml(u.full_name)}</strong>
            <div style="font-size:0.8rem;color:var(--text-muted);">${escapeHtml(u.email)}</div>
          </td>
          <td><span class="badge badge-info">${escapeHtml(u.role)}</span></td>
          <td><span class="status-pill ${statusCls}">${statusText}</span></td>
          <td>${formatDateVN(u.created_at)}</td>
          <td>
            ${
              isSelf
                ? `<span style="font-size:0.8rem;color:var(--text-muted);">Tài khoản hiện tại</span>`
                : `<div style="display:flex;gap:6px;flex-wrap:wrap;">
                    <button type="button" class="btn btn-outline btn-sm" onclick="openChangeRoleModal(${Number(u.id)})">Đổi vai trò</button>
                    <button type="button" class="btn btn-outline btn-sm" style="color:${isActive ? "var(--danger)" : "var(--primary)"};" onclick="toggleUserStatus(${Number(u.id)}, '${nextStatus}')">${lockLabel}</button>
                  </div>`
            }
          </td>
        </tr>
      `;
    })
    .join("");
}

async function toggleUserStatus(userId, newStatus) {
  try {
    await api.patch(`/admin/users/${userId}/status`, { status: newStatus });
    showToast(newStatus === "LOCKED" ? "Đã khóa tài khoản." : "Đã mở khóa tài khoản.", "success");
    await loadAdminUsers();
  } catch (error) {
    showToast(extractApiError(error, "Cập nhật trạng thái tài khoản thất bại."), "error");
  }
}

function openChangeRoleModal(userId) {
  const user = allUsers.find((u) => u.id === userId);
  if (!user) return;
  document.getElementById("changeRoleUserId").value = String(userId);
  document.getElementById("changeRoleUserLabel").textContent = `${user.full_name} (${user.email})`;
  document.getElementById("changeRoleSelect").value = user.role;
  openModal("changeRoleModal");
}

async function submitChangeUserRole() {
  const userId = Number(document.getElementById("changeRoleUserId")?.value || 0);
  const role = document.getElementById("changeRoleSelect")?.value;
  if (!role) return;
  try {
    await api.patch(`/admin/users/${userId}/role`, { role });
    closeModal("changeRoleModal");
    showToast(`Đã cập nhật vai trò thành ${role}.`, "success");
    await loadAdminUsers();
  } catch (error) {
    showToast(extractApiError(error, "Đổi vai trò thất bại."), "error");
  }
}

/* ==================== TAB 5: CHỨNG CHỈ ==================== */

async function loadAdminCertificates() {
  const tbody = document.getElementById("adminCertsTbody");
  try {
    const res = await api.get("/admin/certificates");
    allCertificates = Array.isArray(res.data) ? res.data : [];
    filterAdminCerts();
  } catch (error) {
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--danger);padding:20px;">${escapeHtml(extractApiError(error, "Không thể tải danh sách chứng chỉ."))}</td></tr>`;
    }
  }
}

function filterAdminCerts() {
  const q = (document.getElementById("certSearchInput")?.value || "").trim().toLowerCase();
  const statusVal = document.getElementById("certStatusFilter")?.value || "ALL";
  const tbody = document.getElementById("adminCertsTbody");
  if (!tbody) return;

  const filtered = allCertificates.filter((cert) => {
    const matchStatus = statusVal === "ALL" || cert.status === statusVal;
    const matchText =
      !q ||
      (cert.certificate_code || "").toLowerCase().includes(q) ||
      (cert.user_name || "").toLowerCase().includes(q) ||
      (cert.campaign_title || "").toLowerCase().includes(q);
    return matchStatus && matchText;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:24px;">Không có chứng chỉ nào phù hợp.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered
    .map((cert) => {
      const isActive = cert.status === "ACTIVE";
      return `
        <tr>
          <td><code>${escapeHtml(cert.certificate_code)}</code></td>
          <td>
            <strong>${escapeHtml(cert.user_name || `User #${cert.user_id}`)}</strong>
            <div style="font-size:0.78rem;color:var(--text-muted);">${escapeHtml(cert.user_email || "")}</div>
          </td>
          <td>${escapeHtml(cert.campaign_title || `Campaign #${cert.campaign_id}`)}</td>
          <td>${Number(cert.total_hours || 0).toFixed(1)} giờ</td>
          <td>
            <span class="status-pill ${isActive ? "status-approved" : "status-rejected"}">${escapeHtml(cert.status)}</span>
            ${!isActive && cert.revoked_reason ? `<div style="font-size:0.78rem;color:var(--danger);margin-top:4px;">${escapeHtml(cert.revoked_reason)}</div>` : ""}
          </td>
          <td>
            ${
              isActive
                ? `<button type="button" class="btn btn-outline btn-sm" style="color:var(--danger);border-color:var(--danger);" onclick="openRevokeCertModal(${Number(cert.id)})">Thu hồi</button>`
                : `<span style="font-size:0.8rem;color:var(--text-muted);">Đã thu hồi</span>`
            }
          </td>
        </tr>
      `;
    })
    .join("");
}

function openRevokeCertModal(certId) {
  document.getElementById("revokeCertId").value = String(certId);
  document.getElementById("revokeCertReasonInput").value = "";
  openModal("revokeCertModal");
}

async function submitRevokeCert() {
  const certId = Number(document.getElementById("revokeCertId")?.value || 0);
  const reason = document.getElementById("revokeCertReasonInput")?.value.trim();
  if (!reason) {
    showToast("Vui lòng nhập lý do thu hồi chứng chỉ.", "warning");
    return;
  }
  try {
    await api.patch(`/admin/certificates/${certId}/revoke`, { reason });
    closeModal("revokeCertModal");
    showToast("Đã thu hồi chứng chỉ.", "info");
    await loadAdminCertificates();
  } catch (error) {
    showToast(extractApiError(error, "Thu hồi chứng chỉ thất bại."), "error");
  }
}

/* ==================== TAB 6 & MODALS ==================== */

function exportSystemReport() {
  const rows = [
    ["Chi so", "Gia tri"],
    ["Tong to chuc", String(allOrganizations.length)],
    ["To chuc cho duyet", String(allOrganizations.filter((o) => o.status === "PENDING").length)],
    ["To chuc da duyet", String(allOrganizations.filter((o) => o.status === "APPROVED").length)],
    ["Chien dich cho duyet", String(allCampaigns.filter((c) => c.status === "PENDING").length)],
    ["Chien dich dang mo", String(allCampaigns.filter((c) => c.status === "OPEN").length)],
    ["Tong nguoi dung", String(allUsers.length)],
    ["Tong chung chi", String(allCertificates.length)],
  ];
  const csv = "\uFEFF" + rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `volunteerlink_admin_report_${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
  showToast("Đã xuất báo cáo CSV.", "success");
}

function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.add("open");
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.remove("open");
}
