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
let allHourAppeals = [];
let allAttendanceAppeals = [];

function renderAdminPaginatedRows(tbody, items, _pageKey, colspan, emptyText, mapRow) {
  if (!tbody) return;
  const tableWrapper = tbody.closest(".table-wrapper");
  const pager = tableWrapper?.parentElement?.querySelector(".vl-table-pagination");
  if (pager) pager.remove();

  if (!items.length) {
    tbody.innerHTML = `<tr><td colspan="${colspan}" style="text-align:center;color:var(--text-muted);padding:24px;">${escapeHtml(emptyText)}</td></tr>`;
    return;
  }

  tbody.innerHTML = items.map(mapRow).join("");
}

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

function formatDateVN(value) {
  const d = typeof parseApiDate === "function" ? parseApiDate(value) : new Date(value);
  return !d || isNaN(d.getTime()) ? "--" : d.toLocaleDateString("vi-VN");
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
      if (await Auth.confirmLogout()) Auth.logout();
    });
  }

  await refreshAllAdminData();
});

async function refreshAllAdminData(manual = false) {
  const refreshBtn = document.getElementById("refreshAdminOverviewBtn");
  const startedAt = Date.now();
  if (manual) setRefreshSpin(refreshBtn, true);
  try {
    const results = await Promise.allSettled([
      checkBackendHealth(false),
      loadAdminOrganizations(),
      loadAdminCampaigns(),
      loadAdminUsers(),
      loadAdminCertificates(),
      loadAdminAppeals(),
    ]);
    renderOverviewStats();
    if (manual) {
      await waitMinSpin(startedAt);
      const hasFailure = results.some((r) => r.status === "rejected");
      if (hasFailure) {
        showToast("Một số dữ liệu quản trị chưa thể làm mới.", "warning");
      } else {
        showToast("Đã cập nhật dữ liệu hệ thống.", "success");
      }
    }
  } finally {
    if (manual) setRefreshSpin(refreshBtn, false);
  }
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

  const rawTab = new URLSearchParams(window.location.search).get("tab");
  const tabAlias = { "hour-appeals": "appeals", "attendance-appeals": "appeals" };
  const initialTab = tabAlias[rawTab] || rawTab;
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
                <button type="button" class="btn btn-danger btn-sm" onclick="openRejectOrgModal(${Number(org.id)})">Từ chối</button>
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
                <button type="button" class="btn btn-danger btn-sm" onclick="openRejectCampModal(${Number(c.id)})">Từ chối</button>
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

async function loadAdminOrganizations(manual = false, triggerBtn = null) {
  const tbody = document.getElementById("adminOrgsTbody");
  const quickTbody = document.getElementById("quickPendingOrgsTbody");
  const startedAt = Date.now();
  if (manual) {
    setRefreshSpin(triggerBtn, true);
    if (tbody) tbody.classList.add("is-refreshing");
    if (quickTbody) quickTbody.classList.add("is-refreshing");
  }
  try {
    const res = await api.get("/admin/organizations");
    if (manual) await waitMinSpin(startedAt);
    allOrganizations = Array.isArray(res.data) ? res.data : [];
    filterAdminOrgs();
    renderOverviewStats();
    if (manual) showToast("Đã cập nhật danh sách tổ chức.", "success");
  } catch (error) {
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--danger);padding:20px;">${escapeHtml(extractApiError(error, "Không thể tải danh sách tổ chức."))}</td></tr>`;
    }
    if (manual) showToast(extractApiError(error, "Không thể tải danh sách tổ chức."), "error");
  } finally {
    if (tbody) tbody.classList.remove("is-refreshing");
    if (quickTbody) quickTbody.classList.remove("is-refreshing");
    if (manual) setRefreshSpin(triggerBtn, false);
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

  renderAdminPaginatedRows(tbody, filtered, "orgs", 6, "Không có tổ chức nào phù hợp.", (org) => {
      const st = ORG_STATUS_MAP[org.status] || { label: org.status, cls: "status-closed" };
      const docCell = isSafeHttpUrl(org.document_url)
        ? `<a href="${escapeHtml(org.document_url)}" target="_blank" rel="noopener noreferrer" class="btn btn-outline btn-sm">Mở tài liệu</a>`
        : `<span style="color:var(--text-muted);font-size:0.84rem;">Chưa có URL</span>`;

      const reviewCell =
        org.status === "PENDING"
          ? `<div style="display:inline-flex;gap:6px;">
              <button type="button" class="btn btn-primary btn-sm" onclick="approveOrganization(${Number(org.id)})">Duyệt</button>
              <button type="button" class="btn btn-danger btn-sm" onclick="openRejectOrgModal(${Number(org.id)})">Từ chối</button>
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
    });
}

function openOrgDetailModal(orgId) {
  const org = allOrganizations.find((o) => o.id === orgId);
  if (!org) return;
  const body = document.getElementById("orgDetailBody");
  const footer = document.getElementById("orgDetailFooter");
  if (!body) return;

  const statusMap = {
    PENDING: { label: "Chờ duyệt", cls: "status-pending" },
    APPROVED: { label: "Đã duyệt", cls: "status-approved" },
    REJECTED: { label: "Từ chối", cls: "status-rejected" },
  };
  const st = statusMap[org.status] || { label: org.status || "—", cls: "status-pending" };
  const initialChar = escapeHtml((org.name || "O").trim().charAt(0).toUpperCase());
  const logoHtml = isSafeHttpUrl(org.logo_url)
    ? `<img src="${escapeHtml(org.logo_url)}" alt="${escapeHtml(org.name)}" style="width:48px;height:48px;border-radius:12px;object-fit:cover;border:1px solid var(--border);flex-shrink:0;">`
    : `<div style="width:48px;height:48px;border-radius:12px;background:var(--primary-light,#eff6ff);color:var(--primary,#1d4ed8);display:grid;place-items:center;font-weight:700;font-size:1.15rem;flex-shrink:0;">${initialChar}</div>`;

  const docHtml = isSafeHttpUrl(org.document_url)
    ? `<a href="${escapeHtml(org.document_url)}" target="_blank" rel="noopener noreferrer" class="btn btn-outline btn-sm" style="display:inline-flex;align-items:center;gap:6px;">Xem tài liệu pháp lý ↗</a>`
    : `<span style="color:#b45309;font-weight:600;">Chưa cung cấp tài liệu minh chứng</span>`;

  const ownerStatusBadge = org.owner_status
    ? `<span style="font-size:0.75rem;padding:2px 8px;border-radius:999px;background:${org.owner_status === "ACTIVE" ? "#ecfdf5" : "#fef2f2"};color:${org.owner_status === "ACTIVE" ? "#047857" : "#b91c1c"};font-weight:600;">${escapeHtml(org.owner_status)}</span>`
    : "";

  const formatTime = (val) => (typeof formatDateTime === "function" && val ? formatDateTime(val) : (val || "--"));

  body.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:16px;">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding-bottom:14px;border-bottom:1px solid var(--border);">
        <div style="display:flex;align-items:center;gap:12px;min-width:0;">
          ${logoHtml}
          <div style="min-width:0;">
            <div style="font-size:1.05rem;font-weight:700;color:var(--text-main);">${escapeHtml(org.name)}</div>
            <div style="font-size:0.8rem;color:var(--text-muted);">Mã hồ sơ: #ORG-${Number(org.id)} · Nộp lúc: ${escapeHtml(formatTime(org.created_at))}</div>
          </div>
        </div>
        <span class="status-pill ${st.cls}"><span class="status-dot"></span> ${st.label}</span>
      </div>

      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;">
        <div style="padding:12px 14px;border-radius:12px;background:var(--surface-alt,#f8fafc);border:1px solid var(--border);">
          <div style="font-size:0.75rem;font-weight:700;text-transform:uppercase;color:var(--text-muted);margin-bottom:8px;">Người đại diện tài khoản</div>
          <div style="display:grid;gap:6px;font-size:0.86rem;">
            <div><strong>Họ tên:</strong> ${escapeHtml(org.owner_name || `User #${org.owner_id || "--"}`)} ${ownerStatusBadge}</div>
            <div><strong>Email TK:</strong> ${escapeHtml(org.owner_email || "--")}</div>
            <div><strong>SĐT TK:</strong> ${escapeHtml(org.owner_phone || "--")}</div>
          </div>
        </div>

        <div style="padding:12px 14px;border-radius:12px;background:var(--surface-alt,#f8fafc);border:1px solid var(--border);">
          <div style="font-size:0.75rem;font-weight:700;text-transform:uppercase;color:var(--text-muted);margin-bottom:8px;">Thông tin liên hệ tổ chức</div>
          <div style="display:grid;gap:6px;font-size:0.86rem;">
            <div><strong>Email TC:</strong> ${escapeHtml(org.email || "--")}</div>
            <div><strong>SĐT TC:</strong> ${escapeHtml(org.phone || "--")}</div>
            <div><strong>Địa chỉ:</strong> ${escapeHtml(org.address || "--")}</div>
            <div><strong>Cập nhật:</strong> ${escapeHtml(formatTime(org.updated_at))}</div>
          </div>
        </div>
      </div>

      <div style="padding:12px 14px;border-radius:12px;background:#ffffff;border:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;">
        <div style="font-size:0.86rem;">
          <strong>Tài liệu pháp lý / Minh chứng:</strong>
          <div style="font-size:0.78rem;color:var(--text-muted);word-break:break-all;">${isSafeHttpUrl(org.document_url) ? escapeHtml(org.document_url) : "Tổ chức chưa đính kèm đường dẫn hồ sơ."}</div>
        </div>
        <div>${docHtml}</div>
      </div>

      <div style="font-size:0.88rem;">
        <strong style="display:block;margin-bottom:6px;">Giới thiệu &amp; Mục tiêu hoạt động:</strong>
        <div style="padding:10px 12px;border-radius:10px;background:var(--surface-alt,#f8fafc);border:1px solid var(--border);line-height:1.55;white-space:pre-line;">${escapeHtml(org.description || "Chưa có mô tả")}</div>
      </div>

      ${org.rejection_reason ? `
        <div style="padding:10px 12px;border-radius:10px;background:#fef2f2;border:1px solid #fecaca;color:#b91c1c;font-size:0.86rem;">
          <strong>Lý do từ chối gần nhất:</strong> ${escapeHtml(org.rejection_reason)}
        </div>
      ` : ""}
    </div>
  `;

  if (footer) {
    footer.innerHTML = org.status === "PENDING"
      ? `
        <button type="button" class="btn btn-outline" onclick="closeModal('orgDetailModal')">Đóng</button>
        <button type="button" class="btn btn-danger" onclick="closeModal('orgDetailModal'); openRejectOrgModal(${Number(org.id)})">Từ chối</button>
        <button type="button" class="btn btn-primary" onclick="approveOrganization(${Number(org.id)}).then(() => closeModal('orgDetailModal'))">✓ Phê duyệt</button>
      `
      : `<button type="button" class="btn btn-outline" onclick="closeModal('orgDetailModal')">Đóng</button>`;
  }

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

async function loadAdminCampaigns(manual = false, triggerBtn = null) {
  const tbody = document.getElementById("adminCampsTbody");
  const quickTbody = document.getElementById("quickPendingCampsTbody");
  const startedAt = Date.now();
  if (manual) {
    setRefreshSpin(triggerBtn, true);
    if (tbody) tbody.classList.add("is-refreshing");
    if (quickTbody) quickTbody.classList.add("is-refreshing");
  }
  try {
    const [pendingRes, publicRes] = await Promise.all([
      api.get("/admin/campaigns/pending"),
      api.get("/campaigns", { params: { page: 1, page_size: 100 } }),
    ]);
    if (manual) await waitMinSpin(startedAt);
    const pendingItems = Array.isArray(pendingRes.data) ? pendingRes.data : [];
    const publicItems = Array.isArray(publicRes.data?.items) ? publicRes.data.items : [];

    const mergedMap = new Map();
    pendingItems.forEach((c) => mergedMap.set(c.id, c));
    publicItems.forEach((c) => {
      if (!mergedMap.has(c.id)) mergedMap.set(c.id, c);
    });
    allCampaigns = Array.from(mergedMap.values()).sort((a, b) => b.id - a.id);
    filterAdminCamps();
    renderOverviewStats();
    if (manual) showToast("Đã cập nhật danh sách chiến dịch.", "success");
  } catch (error) {
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--danger);padding:20px;">${escapeHtml(extractApiError(error, "Không thể tải danh sách chiến dịch."))}</td></tr>`;
    }
    if (manual) showToast(extractApiError(error, "Không thể tải danh sách chiến dịch."), "error");
  } finally {
    if (tbody) tbody.classList.remove("is-refreshing");
    if (quickTbody) quickTbody.classList.remove("is-refreshing");
    if (manual) setRefreshSpin(triggerBtn, false);
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

  renderAdminPaginatedRows(tbody, filtered, "camps", 6, "Không có chiến dịch nào phù hợp.", (c) => {
      const displayStatus = Layout.getCampaignDisplayStatus(c);
      const st = ({
        IN_PROGRESS: {label: "Đang diễn ra", cls: "status-approved"},
        REGISTRATION_CLOSED: {label: "Đã đóng đăng ký", cls: "status-closed"},
        REGISTRATION_OPEN: {label: "Đang mở đăng ký", cls: "status-approved"},
      })[displayStatus] || CAMP_STATUS_MAP[displayStatus] || {label: displayStatus, cls: "status-closed"};
      const orgName = c.organization?.name || c.organization_name || `Tổ chức #${c.organization_id}`;
      const reviewCell =
        c.status === "PENDING"
          ? `<div style="display:inline-flex;gap:6px;">
              <button type="button" class="btn btn-primary btn-sm" onclick="approveCampaign(${Number(c.id)})">Duyệt</button>
              <button type="button" class="btn btn-danger btn-sm" onclick="openRejectCampModal(${Number(c.id)})">Từ chối</button>
            </div>`
          : `<span style="color:var(--text-muted);font-size:0.82rem;">Đã xử lý</span>`;

      const startVal = c.start_time || c.start_date;
      const endVal = c.end_time || c.end_date;
      const maxPartVal = c.max_participants ?? c.max_volunteers;
      const dateRange =
        startVal || endVal
          ? `<div>${formatDateVN(startVal)} - ${formatDateVN(endVal)}</div>`
          : `<div>${escapeHtml(c.category || "Chiến dịch cộng đồng")}</div>`;
      const quotaLine =
        maxPartVal != null
          ? `<div style="font-size:0.8rem;color:var(--text-muted);">Chỉ tiêu: ${Number(maxPartVal)} TNV</div>`
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
    });
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

async function loadAdminUsers(manual = false, triggerBtn = null) {
  const tbody = document.getElementById("adminUsersTbody");
  const startedAt = Date.now();
  if (manual) {
    setRefreshSpin(triggerBtn, true);
    if (tbody) tbody.classList.add("is-refreshing");
  }
  try {
    const res = await api.get("/admin/users");
    if (manual) await waitMinSpin(startedAt);
    allUsers = Array.isArray(res.data) ? res.data : [];
    filterAdminUsers();
    if (manual) showToast("Đã cập nhật danh sách người dùng.", "success");
  } catch (error) {
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--danger);padding:20px;">${escapeHtml(extractApiError(error, "Không thể tải danh sách người dùng."))}</td></tr>`;
    }
    if (manual) showToast(extractApiError(error, "Không thể tải danh sách người dùng."), "error");
  } finally {
    if (tbody) tbody.classList.remove("is-refreshing");
    if (manual) setRefreshSpin(triggerBtn, false);
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

  renderAdminPaginatedRows(tbody, filtered, "users", 5, "Không có tài khoản nào phù hợp.", (u) => {
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
                    <button type="button" class="btn ${isActive ? "btn-danger" : "btn-primary"} btn-sm" onclick="toggleUserStatus(${Number(u.id)}, '${nextStatus}')">${lockLabel}</button>
                  </div>`
            }
          </td>
        </tr>
      `;
    });
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

async function loadAdminCertificates(manual = false, triggerBtn = null) {
  const tbody = document.getElementById("adminCertsTbody");
  const startedAt = Date.now();
  if (manual) {
    setRefreshSpin(triggerBtn, true);
    if (tbody) tbody.classList.add("is-refreshing");
  }
  try {
    const res = await api.get("/admin/certificates");
    if (manual) await waitMinSpin(startedAt);
    allCertificates = Array.isArray(res.data) ? res.data : [];
    filterAdminCerts();
    if (manual) showToast("Đã cập nhật danh sách chứng chỉ.", "success");
  } catch (error) {
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--danger);padding:20px;">${escapeHtml(extractApiError(error, "Không thể tải danh sách chứng chỉ."))}</td></tr>`;
    }
    if (manual) showToast(extractApiError(error, "Không thể tải danh sách chứng chỉ."), "error");
  } finally {
    if (tbody) tbody.classList.remove("is-refreshing");
    if (manual) setRefreshSpin(triggerBtn, false);
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

  renderAdminPaginatedRows(tbody, filtered, "certs", 6, "Không có chứng chỉ nào phù hợp.", (cert) => {
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
            <span class="status-pill ${isActive ? "status-approved" : "status-rejected"}">${isActive ? "Hợp lệ" : "Đã thu hồi"}</span>
            ${!isActive && cert.revoked_reason ? `<div style="font-size:0.78rem;color:var(--danger);margin-top:4px;">${escapeHtml(cert.revoked_reason)}</div>` : ""}
          </td>
          <td>
            ${
              isActive
                ? `<button type="button" class="btn btn-danger btn-sm" onclick="openRevokeCertModal(${Number(cert.id)})">Thu hồi</button>`
                : `<span style="font-size:0.8rem;color:var(--text-muted);">Đã thu hồi</span>`
            }
          </td>
        </tr>
      `;
    });
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

/* ==================== TAB 5.5: KHIẾU NẠI HỆ THỐNG ==================== */

function toAdminDatetimeLocal(value) {
  const d = typeof parseApiDate === "function" ? parseApiDate(value) : new Date(value);
  if (!d || isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatAppealSlaBadge(slaDeadline, isPending, resolvedAt) {
  const deadlineDate = typeof parseApiDate === "function" ? parseApiDate(slaDeadline) : (slaDeadline ? new Date(slaDeadline) : null);
  if (!deadlineDate || isNaN(deadlineDate.getTime())) {
    return `<span class="td-subtitle">Trong vòng 48 giờ</span>`;
  }
  const deadlineStr = typeof formatDateTime === "function" ? formatDateTime(deadlineDate) : deadlineDate.toLocaleString("vi-VN");
  if (!isPending) {
    const resolvedDate = resolvedAt ? (typeof parseApiDate === "function" ? parseApiDate(resolvedAt) : new Date(resolvedAt)) : null;
    const onTime = !resolvedDate || resolvedDate.getTime() <= deadlineDate.getTime();
    return `
      <div><span class="status-pill ${onTime ? "status-approved" : "status-closed"}" style="font-size:0.75rem;">${onTime ? "Đã xử lý (Đúng hạn 48h)" : "Đã xử lý"}</span></div>
      <div class="td-subtitle">Hạn: ${escapeHtml(deadlineStr)}</div>
    `;
  }
  const diffMs = deadlineDate.getTime() - Date.now();
  if (diffMs <= 0) {
    return `
      <div><span class="status-pill status-rejected" style="font-size:0.75rem;">Quá hạn 48h</span></div>
      <div class="td-subtitle">Hạn: ${escapeHtml(deadlineStr)}</div>
    `;
  }
  const hoursLeft = Math.max(1, Math.ceil(diffMs / 3600000));
  return `
    <div><span class="status-pill status-pending" style="font-size:0.75rem;">Còn ~${hoursLeft}h / 48h</span></div>
    <div class="td-subtitle">Hạn: ${escapeHtml(deadlineStr)}</div>
  `;
}

async function loadAdminAppeals(manual = false, triggerBtn = null) {
  const hourTbody = document.getElementById("adminHourAppealsTbody");
  const attTbody = document.getElementById("adminAttendanceAppealsTbody");
  const badge = document.getElementById("pendingAppealsBadge");
  const startedAt = Date.now();

  if (manual) {
    setRefreshSpin(triggerBtn, true);
    if (hourTbody) hourTbody.classList.add("is-refreshing");
    if (attTbody) attTbody.classList.add("is-refreshing");
  }

  try {
    const [hourRes, attRes] = await Promise.all([
      api.get("/hour-claims"),
      api.get("/attendance-appeals/admin"),
    ]);
    if (manual) await waitMinSpin(startedAt);

    const hourClaims = (Array.isArray(hourRes.data) ? hourRes.data : []).filter((c) => Boolean(c.appeal_status));
    const attAppeals = Array.isArray(attRes.data) ? attRes.data : [];
    allHourAppeals = hourClaims;
    allAttendanceAppeals = attAppeals;

    const pendingCount =
      hourClaims.filter((c) => c.appeal_status === "PENDING").length +
      attAppeals.filter((a) => a.status === "ADMIN_PENDING").length;
    if (badge) badge.textContent = String(pendingCount);

    if (hourTbody) {
      if (!hourClaims.length) {
        hourTbody.innerHTML = `<tr><td colspan="6" class="ud-empty">Chưa có khiếu nại giờ nào.</td></tr>`;
      } else {
        hourTbody.innerHTML = hourClaims.map((c) => {
          const isPending = c.appeal_status === "PENDING";
          const pillCls = isPending ? "status-pending" : c.appeal_status === "ACCEPTED" ? "status-approved" : "status-rejected";
          const statusLabel = isPending ? "Chờ Admin" : c.appeal_status === "ACCEPTED" ? "Đã chấp nhận" : "Đã từ chối";
          const slaHtml = formatAppealSlaBadge(c.sla_deadline, isPending, c.resolved_at);
          const actions = isPending
            ? `<div style="display:inline-flex;gap:6px;flex-wrap:wrap;">
                 <button type="button" class="btn btn-outline btn-sm" onclick="openAdminHourAppealModal(${Number(c.id)}, 'DETAIL')">Chi tiết</button>
                 <button type="button" class="btn btn-primary btn-sm" onclick="openAdminHourAppealModal(${Number(c.id)}, 'ACCEPTED')">Chấp nhận</button>
                 <button type="button" class="btn btn-danger btn-sm" onclick="openAdminHourAppealModal(${Number(c.id)}, 'REJECTED')">Từ chối</button>
               </div>`
            : `<div style="display:inline-flex;gap:6px;align-items:center;flex-wrap:wrap;">
                 <button type="button" class="btn btn-outline btn-sm" onclick="openAdminHourAppealModal(${Number(c.id)}, 'DETAIL')">Chi tiết</button>
                 <span style="color:var(--text-muted);font-size:0.82rem;">${escapeHtml(c.admin_note || "Đã xử lý")}</span>
               </div>`;
          return `
            <tr>
              <td>
                <div class="td-title">${escapeHtml(c.user_name || `User #${c.user_id}`)}</div>
                <div class="td-subtitle">${escapeHtml(c.campaign_title || `Đơn #${c.registration_id}`)}</div>
              </td>
              <td>
                <div>Đề nghị: <strong>${Number(c.claimed_hours || 0)}h</strong></div>
                <div class="td-subtitle">Điểm danh: ${Number(c.actual_hours || 0)}h · Org duyệt: ${c.approved_hours != null ? `${Number(c.approved_hours)}h` : "0h"}</div>
              </td>
              <td style="max-width:240px;">${escapeHtml(c.appeal_reason || "—")}</td>
              <td>${slaHtml}</td>
              <td><span class="status-pill ${pillCls}">${escapeHtml(statusLabel)}</span></td>
              <td style="white-space:nowrap;">${actions}</td>
            </tr>
          `;
        }).join("");
      }
    }

    if (attTbody) {
      if (!attAppeals.length) {
        attTbody.innerHTML = `<tr><td colspan="6" class="ud-empty">Chưa có khiếu nại điểm danh nào chuyển lên Admin.</td></tr>`;
      } else {
        attTbody.innerHTML = attAppeals.map((a) => {
          const isPending = a.status === "ADMIN_PENDING";
          const pillCls = isPending ? "status-pending" : a.status === "ADMIN_ACCEPTED" ? "status-approved" : "status-rejected";
          const statusLabel = isPending ? "Chờ Admin" : a.status === "ADMIN_ACCEPTED" ? "Đã chấp nhận" : "Đã từ chối";
          const slaHtml = formatAppealSlaBadge(a.sla_deadline, isPending, a.admin_resolved_at);
          const actions = isPending
            ? `<div style="display:inline-flex;gap:6px;flex-wrap:wrap;">
                 <button type="button" class="btn btn-outline btn-sm" onclick="openAdminAttendanceAppealModal(${Number(a.id)}, 'DETAIL')">Chi tiết</button>
                 <button type="button" class="btn btn-primary btn-sm" onclick="openAdminAttendanceAppealModal(${Number(a.id)}, 'ACCEPTED')">Chấp nhận</button>
                 <button type="button" class="btn btn-danger btn-sm" onclick="openAdminAttendanceAppealModal(${Number(a.id)}, 'REJECTED')">Từ chối</button>
               </div>`
            : `<div style="display:inline-flex;gap:6px;align-items:center;flex-wrap:wrap;">
                 <button type="button" class="btn btn-outline btn-sm" onclick="openAdminAttendanceAppealModal(${Number(a.id)}, 'DETAIL')">Chi tiết</button>
                 <span style="color:var(--text-muted);font-size:0.82rem;">${escapeHtml(a.admin_note || "Đã xử lý")}</span>
               </div>`;
          return `
            <tr>
              <td>
                <div class="td-title">${escapeHtml(a.user_name || `User #${a.user_id}`)}</div>
                <div class="td-subtitle">${escapeHtml(a.campaign_title || `Đơn #${a.registration_id}`)}</div>
              </td>
              <td style="max-width:210px;">${escapeHtml(a.reason || "—")}</td>
              <td style="max-width:210px;">${escapeHtml(a.escalation_reason || "—")}</td>
              <td>${slaHtml}</td>
              <td><span class="status-pill ${pillCls}">${escapeHtml(statusLabel)}</span></td>
              <td style="white-space:nowrap;">${actions}</td>
            </tr>
          `;
        }).join("");
      }
    }
    if (manual) showToast("Đã cập nhật danh sách khiếu nại.", "success");
  } catch (err) {
    if (hourTbody) hourTbody.innerHTML = `<tr><td colspan="6" class="ud-empty" style="color:#ef4444;">${escapeHtml(extractApiError(err, "Không tải được khiếu nại giờ."))}</td></tr>`;
    if (attTbody) attTbody.innerHTML = `<tr><td colspan="6" class="ud-empty" style="color:#ef4444;">${escapeHtml(extractApiError(err, "Không tải được khiếu nại điểm danh."))}</td></tr>`;
    if (manual) showToast(extractApiError(err, "Không thể cập nhật danh sách khiếu nại."), "error");
  } finally {
    if (hourTbody) hourTbody.classList.remove("is-refreshing");
    if (attTbody) attTbody.classList.remove("is-refreshing");
    if (manual) setRefreshSpin(triggerBtn, false);
  }
}

function openAdminHourAppealModal(claimId, mode = "DETAIL") {
  const claim = allHourAppeals.find((c) => Number(c.id) === Number(claimId));
  if (!claim) {
    showToast("Không tìm thấy dữ liệu khiếu nại giờ.", "error");
    return;
  }

  const isPending = claim.appeal_status === "PENDING";
  const effectiveMode = isPending ? (mode === "REJECTED" ? "REJECTED" : "ACCEPTED") : "DETAIL";

  document.getElementById("adminHourAppealId").value = String(claim.id);
  document.getElementById("adminHourAppealMode").value = effectiveMode;

  const titleEl = document.getElementById("adminHourAppealModalTitle");
  if (titleEl) {
    titleEl.textContent = !isPending
      ? `Chi tiết khiếu nại giờ #${claim.id}`
      : effectiveMode === "REJECTED"
        ? `Từ chối khiếu nại giờ #${claim.id}`
        : `Đối chiếu & Xử lý khiếu nại giờ #${claim.id}`;
  }

  const detailBody = document.getElementById("adminHourAppealDetailBody");
  const actualHours = Number(claim.actual_hours || 0);
  const claimedHours = Number(claim.claimed_hours || 0);
  const approvedHours = claim.approved_hours != null ? Number(claim.approved_hours) : null;
  const estHours = claim.campaign_estimated_hours != null ? Number(claim.campaign_estimated_hours) : null;
  const evidenceUrl = claim.appeal_evidence_url || claim.evidence_url;
  const evidenceHtml = isSafeHttpUrl(evidenceUrl)
    ? `<a href="${escapeHtml(evidenceUrl)}" target="_blank" rel="noopener noreferrer" class="btn btn-outline btn-sm">Mở minh chứng ↗</a>`
    : `<span style="color:var(--text-muted);">Không đính kèm link minh chứng</span>`;

  if (detailBody) {
    detailBody.innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px;">
        <div style="padding:12px 14px;border-radius:12px;background:var(--surface-alt,#f8fafc);border:1px solid var(--border);">
          <div style="font-size:0.75rem;font-weight:700;text-transform:uppercase;color:var(--text-muted);margin-bottom:8px;">1. Hồ sơ &amp; Dữ liệu điểm danh thực tế</div>
          <div style="display:grid;gap:6px;font-size:0.86rem;">
            <div><strong>Tình nguyện viên:</strong> ${escapeHtml(claim.user_name || `User #${claim.user_id}`)} ${claim.user_email ? `(${escapeHtml(claim.user_email)})` : ""}</div>
            <div><strong>Chiến dịch:</strong> ${escapeHtml(claim.campaign_title || `Đơn #${claim.registration_id}`)}</div>
            <div><strong>Tổ chức:</strong> ${escapeHtml(claim.organization_name || "—")}</div>
            <div><strong>Khung giờ chiến dịch:</strong> ${escapeHtml(safeFormatDateTime(claim.campaign_start_time))} → ${escapeHtml(safeFormatDateTime(claim.campaign_end_time))} ${estHours != null ? `(${estHours}h dự kiến)` : ""}</div>
            <div><strong>Check-in / Check-out:</strong> ${escapeHtml(safeFormatDateTime(claim.attendance_check_in_at))} → ${escapeHtml(safeFormatDateTime(claim.attendance_check_out_at))} (${claim.attendance_total_minutes ?? 0} phút)</div>
            <div><strong>Giờ điểm danh hợp lệ (tối đa):</strong> <span style="color:var(--primary);font-weight:700;">${actualHours} giờ</span></div>
            <div><strong>Kết quả Organizer xử lý:</strong> ${approvedHours != null ? `Đã duyệt ${approvedHours} giờ` : "Từ chối (0 giờ)"}</div>
            ${claim.rejection_reason ? `<div style="color:#b91c1c;"><strong>Lý do Organizer từ chối:</strong> ${escapeHtml(claim.rejection_reason)}</div>` : ""}
          </div>
        </div>

        <div style="padding:12px 14px;border-radius:12px;background:#ffffff;border:1px solid var(--border);">
          <div style="font-size:0.75rem;font-weight:700;text-transform:uppercase;color:var(--text-muted);margin-bottom:8px;">2. Nội dung khiếu nại &amp; SLA 48 giờ</div>
          <div style="display:grid;gap:8px;font-size:0.86rem;">
            <div><strong>Số giờ TNV đề nghị:</strong> <span style="font-weight:700;">${claimedHours} giờ</span></div>
            <div><strong>Ghi chú ban đầu của TNV:</strong> ${escapeHtml(claim.note || "—")}</div>
            <div><strong>Lý do khiếu nại lên Admin:</strong>
              <div style="margin-top:4px;padding:8px 10px;border-radius:8px;background:var(--surface-alt,#f8fafc);border:1px solid var(--border);white-space:pre-line;">${escapeHtml(claim.appeal_reason || "—")}</div>
            </div>
            <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;">
              <strong>Minh chứng:</strong> ${evidenceHtml}
            </div>
            <div><strong>Hạn xử lý (SLA 48h):</strong> ${escapeHtml(safeFormatDateTime(claim.sla_deadline))}</div>
            ${!isPending ? `<div><strong>Phản hồi của Admin:</strong> ${escapeHtml(claim.admin_note || "Đã xử lý")} (lúc ${escapeHtml(safeFormatDateTime(claim.resolved_at))})</div>` : ""}
          </div>
        </div>
      </div>
    `;
  }

  const formSection = document.getElementById("adminHourAppealFormSection");
  const hoursField = document.getElementById("adminHourAppealHoursField");
  const hoursInput = document.getElementById("adminHourAppealApprovedInput");
  const maxHint = document.getElementById("adminHourAppealMaxHint");
  const noteInput = document.getElementById("adminHourAppealNoteInput");
  const footer = document.getElementById("adminHourAppealModalFooter");

  if (formSection) formSection.hidden = !isPending;
  if (isPending) {
    const suggestedHours = actualHours > 0 ? Math.min(claimedHours, actualHours) : claimedHours;
    if (hoursField) hoursField.hidden = effectiveMode === "REJECTED";
    if (hoursInput) {
      hoursInput.max = actualHours > 0 ? String(actualHours) : "";
      hoursInput.value = String(suggestedHours > 0 ? suggestedHours : "");
    }
    if (maxHint) {
      maxHint.textContent = `Giới hạn tối đa theo điểm danh hợp lệ: ${actualHours} giờ (TNV đề nghị: ${claimedHours} giờ).`;
    }
    if (noteInput) {
      noteInput.value = effectiveMode === "REJECTED"
        ? "Admin đã đối chiếu dữ liệu điểm danh và giữ nguyên kết quả của Nhà tổ chức."
        : "Admin đã đối chiếu dữ liệu điểm danh và chấp nhận điều chỉnh số giờ công nhận.";
    }
  }

  if (footer) {
    if (!isPending) {
      footer.innerHTML = `<button type="button" class="btn btn-outline" onclick="closeModal('adminHourAppealModal')">Đóng</button>`;
    } else {
      footer.innerHTML = `
        <button type="button" class="btn btn-outline" onclick="closeModal('adminHourAppealModal')">Hủy</button>
        <button type="button" class="btn btn-danger" onclick="submitAdminHourAppeal('REJECTED')">Từ chối khiếu nại</button>
        <button type="button" class="btn btn-primary" onclick="submitAdminHourAppeal('ACCEPTED')">✓ Chấp nhận &amp; Công nhận giờ</button>
      `;
    }
  }

  openModal("adminHourAppealModal");
}

function adminReviewHourAppeal(claimId, appealStatus) {
  openAdminHourAppealModal(claimId, appealStatus);
}

async function submitAdminHourAppeal(decisionOverride) {
  const claimId = Number(document.getElementById("adminHourAppealId")?.value || 0);
  const claim = allHourAppeals.find((c) => Number(c.id) === claimId);
  const appealStatus = decisionOverride || document.getElementById("adminHourAppealMode")?.value || "ACCEPTED";
  const hoursInput = document.getElementById("adminHourAppealApprovedInput");
  const hoursField = document.getElementById("adminHourAppealHoursField");
  const noteInput = document.getElementById("adminHourAppealNoteInput");

  if (!claimId) return;

  let approvedHours = null;
  if (appealStatus === "ACCEPTED") {
    if (hoursField && hoursField.hidden) {
      hoursField.hidden = false;
      hoursInput?.focus();
      return;
    }
    const parsed = Number(hoursInput?.value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      showToast("Số giờ Admin công nhận phải lớn hơn 0.", "warning");
      hoursInput?.focus();
      return;
    }
    const actualMax = Number(claim?.actual_hours || 0);
    if (actualMax > 0 && parsed > actualMax) {
      showToast(`Số giờ công nhận không được vượt quá giờ điểm danh thực tế (${actualMax}h).`, "warning");
      hoursInput?.focus();
      return;
    }
    approvedHours = parsed;
  }

  const note = (noteInput?.value || "").trim();
  if (!note) {
    showToast("Vui lòng nhập ghi chú quyết định của Admin.", "warning");
    noteInput?.focus();
    return;
  }

  try {
    await api.patch(`/hour-claims/${claimId}/appeal-review`, {
      appeal_status: appealStatus,
      approved_hours: approvedHours,
      admin_note: note,
    });
    closeModal("adminHourAppealModal");
    showToast("Đã xử lý khiếu nại giờ thành công.", "success");
    await loadAdminAppeals();
  } catch (err) {
    showToast(extractApiError(err, "Không thể xử lý khiếu nại giờ."), "error");
  }
}

function openAdminAttendanceAppealModal(appealId, mode = "DETAIL") {
  const appeal = allAttendanceAppeals.find((a) => Number(a.id) === Number(appealId));
  if (!appeal) {
    showToast("Không tìm thấy dữ liệu khiếu nại điểm danh.", "error");
    return;
  }

  const isPending = appeal.status === "ADMIN_PENDING";
  const effectiveMode = isPending ? (mode === "REJECTED" ? "REJECTED" : "ACCEPTED") : "DETAIL";

  document.getElementById("adminAttAppealId").value = String(appeal.id);
  document.getElementById("adminAttAppealMode").value = effectiveMode;

  const titleEl = document.getElementById("adminAttendanceAppealModalTitle");
  if (titleEl) {
    titleEl.textContent = !isPending
      ? `Chi tiết khiếu nại điểm danh #${appeal.id}`
      : effectiveMode === "REJECTED"
        ? `Từ chối khiếu nại điểm danh #${appeal.id}`
        : `Đối chiếu & Xử lý khiếu nại điểm danh #${appeal.id}`;
  }

  const detailBody = document.getElementById("adminAttAppealDetailBody");
  const evidenceHtml = isSafeHttpUrl(appeal.evidence_url)
    ? `<a href="${escapeHtml(appeal.evidence_url)}" target="_blank" rel="noopener noreferrer" class="btn btn-outline btn-sm">Mở minh chứng ↗</a>`
    : `<span style="color:var(--text-muted);">Không đính kèm link minh chứng</span>`;

  if (detailBody) {
    detailBody.innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px;">
        <div style="padding:12px 14px;border-radius:12px;background:var(--surface-alt,#f8fafc);border:1px solid var(--border);">
          <div style="font-size:0.75rem;font-weight:700;text-transform:uppercase;color:var(--text-muted);margin-bottom:8px;">1. Hồ sơ &amp; Dữ liệu điểm danh hiện tại</div>
          <div style="display:grid;gap:6px;font-size:0.86rem;">
            <div><strong>Tình nguyện viên:</strong> ${escapeHtml(appeal.user_name || `User #${appeal.user_id}`)} ${appeal.user_email ? `(${escapeHtml(appeal.user_email)})` : ""}</div>
            <div><strong>Đơn đăng ký:</strong> #REG-${Number(appeal.registration_id)}</div>
            <div><strong>Chiến dịch:</strong> ${escapeHtml(appeal.campaign_title || `Chiến dịch #${appeal.campaign_id || "—"}`)}</div>
            <div><strong>Tổ chức:</strong> ${escapeHtml(appeal.organization_name || "—")}</div>
            <div><strong>Thời gian chiến dịch:</strong> ${escapeHtml(safeFormatDateTime(appeal.campaign_start_time))} → ${escapeHtml(safeFormatDateTime(appeal.campaign_end_time))}</div>
            <div><strong>Trạng thái điểm danh hiện tại:</strong> ${escapeHtml(appeal.current_attendance_status || "Chưa có bản ghi điểm danh")}</div>
            <div><strong>Check-in đã ghi nhận:</strong> ${escapeHtml(safeFormatDateTime(appeal.current_check_in_at, "Chưa có"))}</div>
            <div><strong>Check-out đã ghi nhận:</strong> ${escapeHtml(safeFormatDateTime(appeal.current_check_out_at, "Chưa có"))}</div>
            ${appeal.review_note ? `<div style="color:#b91c1c;"><strong>Phản hồi của Organizer:</strong> ${escapeHtml(appeal.review_note)}</div>` : ""}
          </div>
        </div>

        <div style="padding:12px 14px;border-radius:12px;background:#ffffff;border:1px solid var(--border);">
          <div style="font-size:0.75rem;font-weight:700;text-transform:uppercase;color:var(--text-muted);margin-bottom:8px;">2. Nội dung khiếu nại &amp; SLA 48 giờ</div>
          <div style="display:grid;gap:8px;font-size:0.86rem;">
            <div><strong>Lý do khiếu nại gốc:</strong>
              <div style="margin-top:4px;padding:8px 10px;border-radius:8px;background:var(--surface-alt,#f8fafc);border:1px solid var(--border);white-space:pre-line;">${escapeHtml(appeal.reason || "—")}</div>
            </div>
            <div><strong>Lý do khiếu nại lên Admin:</strong>
              <div style="margin-top:4px;padding:8px 10px;border-radius:8px;background:var(--surface-alt,#f8fafc);border:1px solid var(--border);white-space:pre-line;">${escapeHtml(appeal.escalation_reason || "—")}</div>
            </div>
            <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;">
              <strong>Minh chứng:</strong> ${evidenceHtml}
            </div>
            <div><strong>Chuyển lên Admin lúc:</strong> ${escapeHtml(safeFormatDateTime(appeal.escalated_at))}</div>
            <div><strong>Hạn xử lý (SLA 48h):</strong> ${escapeHtml(safeFormatDateTime(appeal.sla_deadline))}</div>
            ${!isPending ? `<div><strong>Phản hồi của Admin:</strong> ${escapeHtml(appeal.admin_note || "Đã xử lý")} (lúc ${escapeHtml(safeFormatDateTime(appeal.admin_resolved_at))})</div>` : ""}
          </div>
        </div>
      </div>
    `;
  }

  const formSection = document.getElementById("adminAttAppealFormSection");
  const timeFields = document.getElementById("adminAttAppealTimeFields");
  const timeHint = document.getElementById("adminAttAppealTimeHint");
  const inInput = document.getElementById("adminAttAppealCheckInInput");
  const outInput = document.getElementById("adminAttAppealCheckOutInput");
  const noteInput = document.getElementById("adminAttAppealNoteInput");
  const footer = document.getElementById("adminAttAppealModalFooter");

  if (formSection) formSection.hidden = !isPending;
  if (isPending) {
    const showTimes = effectiveMode !== "REJECTED";
    if (timeFields) timeFields.style.display = showTimes ? "grid" : "none";
    if (timeHint) {
      timeHint.hidden = !showTimes;
      timeHint.textContent = `Lưu ý: Giờ Check-in/Check-out phải nằm trong khung thời gian diễn ra chiến dịch (${safeFormatDateTime(appeal.campaign_start_time)} – ${safeFormatDateTime(appeal.campaign_end_time)}). Các mốc đã ghi nhận qua mã hợp lệ được điền sẵn và khóa để bảo toàn dữ liệu.`;
    }
    if (inInput) {
      inInput.value = toAdminDatetimeLocal(appeal.current_check_in_at || appeal.campaign_start_time);
      inInput.disabled = Boolean(appeal.current_check_in_at);
    }
    if (outInput) {
      outInput.value = toAdminDatetimeLocal(appeal.current_check_out_at || appeal.campaign_end_time);
      outInput.disabled = Boolean(appeal.current_check_out_at);
    }
    if (noteInput) {
      noteInput.value = effectiveMode === "REJECTED"
        ? "Admin đã đối chiếu minh chứng và từ chối khiếu nại điểm danh."
        : "Admin đã đối chiếu minh chứng và chấp nhận bổ sung thời gian điểm danh.";
    }
  }

  if (footer) {
    if (!isPending) {
      footer.innerHTML = `<button type="button" class="btn btn-outline" onclick="closeModal('adminAttendanceAppealModal')">Đóng</button>`;
    } else {
      footer.innerHTML = `
        <button type="button" class="btn btn-outline" onclick="closeModal('adminAttendanceAppealModal')">Hủy</button>
        <button type="button" class="btn btn-danger" onclick="submitAdminAttendanceAppeal('REJECTED')">Từ chối khiếu nại</button>
        <button type="button" class="btn btn-primary" onclick="submitAdminAttendanceAppeal('ACCEPTED')">✓ Chấp nhận &amp; Cập nhật điểm danh</button>
      `;
    }
  }

  openModal("adminAttendanceAppealModal");
}

function adminReviewAttendanceAppeal(appealId, decision) {
  openAdminAttendanceAppealModal(appealId, decision);
}

async function submitAdminAttendanceAppeal(decisionOverride) {
  const appealId = Number(document.getElementById("adminAttAppealId")?.value || 0);
  const appeal = allAttendanceAppeals.find((a) => Number(a.id) === appealId);
  const decision = decisionOverride || document.getElementById("adminAttAppealMode")?.value || "ACCEPTED";
  const timeFields = document.getElementById("adminAttAppealTimeFields");
  const timeHint = document.getElementById("adminAttAppealTimeHint");
  const inInput = document.getElementById("adminAttAppealCheckInInput");
  const outInput = document.getElementById("adminAttAppealCheckOutInput");
  const noteInput = document.getElementById("adminAttAppealNoteInput");

  if (!appealId) return;

  let checkIn = null;
  let checkOut = null;
  if (decision === "ACCEPTED") {
    if (timeFields && timeFields.style.display === "none") {
      timeFields.style.display = "grid";
      if (timeHint) timeHint.hidden = false;
      inInput?.focus();
      return;
    }
    const inVal = (inInput?.value || "").trim();
    const outVal = (outInput?.value || "").trim();
    if (!appeal?.current_check_in_at && inVal) {
      checkIn = inVal.length === 16 ? `${inVal}:00` : inVal;
    }
    if (!appeal?.current_check_out_at && outVal) {
      checkOut = outVal.length === 16 ? `${outVal}:00` : outVal;
    }
    if (!appeal?.current_check_in_at && !checkIn) {
      showToast("Vui lòng nhập giờ Check-in còn thiếu.", "warning");
      inInput?.focus();
      return;
    }
    if (!appeal?.current_check_out_at && !checkOut) {
      showToast("Vui lòng nhập giờ Check-out còn thiếu.", "warning");
      outInput?.focus();
      return;
    }
  }

  const note = (noteInput?.value || "").trim();
  if (note.length < 3) {
    showToast("Ghi chú Admin cần tối thiểu 3 ký tự.", "warning");
    noteInput?.focus();
    return;
  }

  try {
    await api.patch(`/attendance-appeals/${appealId}/admin-review`, {
      decision,
      admin_note: note,
      check_in_at: checkIn,
      check_out_at: checkOut,
    });
    closeModal("adminAttendanceAppealModal");
    showToast("Đã xử lý khiếu nại điểm danh thành công.", "success");
    await loadAdminAppeals();
  } catch (err) {
    showToast(extractApiError(err, "Không thể xử lý khiếu nại điểm danh."), "error");
  }
}

// Modal helpers dùng chung từ js/utils.js (VLModal / openModal / closeModal).
