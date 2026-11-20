/**
 * Logic điều khiển Bảng điều khiển Nhà tổ chức (Role: ORGANIZER)
 * Tích hợp Backend API: /auth/me, /campaigns, /campaigns/{id}/submit, /api/attendances/code, DataStore
 */

let currentUser = null;
let currentOrg = null;
let orgCampaigns = [];
let orgCampaignsLoaded = false;
let activeDetailCampaignId = null;
let campaignInitialSnapshot = null;
let isCampaignEditing = false;
let orgRegistrationsCache = [];
let selectedPendingRegIds = new Set();
let volunteerViewMode = "registrations";
let pendingRejectTarget = null;
let codeCountdownInterval = null;
let orgStatsCache = null;

document.addEventListener("DOMContentLoaded", async () => {
  // 1. Kiểm tra xác thực & vai trò ORGANIZER
  currentUser = await Auth.requireAuth(["ORGANIZER"]);
  if (!currentUser) return;

  // 2. Tìm thông tin tổ chức sở hữu (từ DB)
  await loadCurrentOrganization();
  await loadOrganizerCampaigns();

  // 3. Thiết lập thông tin Header
  setupOrganizerHeader();

  // 4. Khởi tạo Tabs, User Menu, Form Preview, Overview Filters & Mobile menu
  setupTabs();
  setupUserMenu();
  if (typeof Layout !== "undefined" && typeof Layout.initNotificationBell === "function") {
    Layout.initNotificationBell(currentUser.role || "ORGANIZER");
  }
  setupMobileMenu();

  // 5. Nạp dữ liệu các thành phần
  renderOverview();
  loadOrganizerStats();
  renderCampaignsTable();
  setupAttendanceGenerator();
  renderVolunteerApplicants();
  renderWaitlist();
  renderCertificatesAndClaims();
  setupOrgProfileForm();

  // 6. Đăng xuất
  document.getElementById("logoutBtn").addEventListener("click", () => {
    Auth.logout();
  });
});

async function loadOrganizerCampaigns() {
  try {
    const res = await api.get("/campaigns/mine");
    if (Array.isArray(res.data)) {
      orgCampaigns = res.data;
      orgCampaignsLoaded = true;
      return;
    }
  } catch (error) {
    console.warn("Không thể tải /campaigns/mine, dùng fallback DataStore:", error);
  }
  orgCampaigns = DataStore.getCampaigns().filter(
    (c) => c.organization_id === currentOrg?.id || c.organization_name === currentOrg?.name
  );
  orgCampaignsLoaded = false;
}

function getOrgCampaigns() {
  if (orgCampaignsLoaded) return orgCampaigns;
  return DataStore.getCampaigns().filter(
    (c) => c.organization_id === currentOrg?.id || c.organization_name === currentOrg?.name
  );
}

function upsertOrgCampaign(campaign) {
  if (!campaign) return;
  const idx = orgCampaigns.findIndex((c) => c.id === campaign.id);
  if (idx >= 0) {
    orgCampaigns[idx] = { ...orgCampaigns[idx], ...campaign };
  } else {
    orgCampaigns.unshift(campaign);
  }
  DataStore.saveCampaign({ ...campaign, organization_name: currentOrg?.name });
}

async function loadCurrentOrganization() {
  // Thử lấy từ Backend API trước
  try {
    const res = await api.get("/organizations/me");
    if (res.data && res.data.id) {
      currentOrg = res.data;
      // Đồng bộ lại vào DataStore để các hàm khác dùng
      const orgs = DataStore.getOrganizations();
      const idx = orgs.findIndex(o => o.id === currentOrg.id);
      if (idx !== -1) orgs[idx] = { ...orgs[idx], ...currentOrg };
      else orgs.push({ ...currentOrg, owner_id: currentUser.id, owner_email: currentUser.email });
      DataStore.set(DataStore.STORAGE_KEYS.ORGS, orgs);
    }
  } catch (err) {
    console.warn("Không thể tải tổ chức từ Backend, dùng DataStore:", err);
    const orgs = DataStore.getOrganizations();
    currentOrg = orgs.find(o => o.owner_id === currentUser.id || o.owner_email === currentUser.email);
  }

  if (!currentOrg) {
    // Tạo tổ chức mặc định nếu chưa có
    currentOrg = {
      id: Date.now(),
      name: "Tổ chức " + (currentUser.full_name || "Mới"),
      email: currentUser.email,
      phone: currentUser.phone || "0241234567",
      address: "Hà Nội",
      description: "Đơn vị tổ chức các hoạt động tình nguyện xã hội.",
      owner_id: currentUser.id,
      owner_email: currentUser.email,
      status: "APPROVED",
      document_url: "https://example.com/docs/gp.pdf",
      created_at: new Date().toISOString()
    };
    const orgs = DataStore.getOrganizations();
    orgs.push(currentOrg);
    DataStore.set(DataStore.STORAGE_KEYS.ORGS, orgs);
  }

  // Hiển thị trạng thái xác thực
  const badgeEl = document.getElementById("orgVerificationBadge");
  const alertEl = document.getElementById("orgStatusAlertBanner");

  if (currentOrg.status === "APPROVED") {
    badgeEl.className = "status-pill status-approved";
    badgeEl.innerHTML = `<span class="status-dot"></span> Đã Phê Duyệt`;
    alertEl.style.display = "none";
  } else if (currentOrg.status === "PENDING") {
    badgeEl.className = "status-pill status-pending";
    badgeEl.innerHTML = `<span class="status-dot"></span> Chờ Admin Duyệt`;
    alertEl.style.display = "block";
    alertEl.className = "dash-alert dash-alert-warning";
    alertEl.innerHTML = `<strong>Lưu ý:</strong> Hồ sơ tổ chức của bạn đang chờ Quản trị viên xét duyệt. Các chiến dịch tạo mới sẽ được lưu dưới dạng bản nháp (DRAFT).`;
  } else if (currentOrg.status === "REJECTED") {
    badgeEl.className = "status-pill status-rejected";
    badgeEl.innerHTML = `<span class="status-dot"></span> Bị Từ Chối`;
    alertEl.style.display = "block";
    alertEl.className = "dash-alert dash-alert-danger";
    alertEl.innerHTML = `<strong>Hồ sơ tổ chức bị từ chối:</strong> ${escapeHtml(currentOrg.rejection_reason || "Chưa đáp ứng tiêu chuẩn pháp lý.")} Vui lòng cập nhật lại hồ sơ ở tab Hồ Sơ.`;
  }
}

function setupOrganizerHeader() {
  const fullName = currentUser.full_name || currentUser.name || "Nhà tổ chức";

  document.getElementById("headerUserName").textContent = fullName;
  renderAvatarElement(document.getElementById("headerAvatar"), currentUser.avatar_url, fullName);
  renderAvatarElement(document.getElementById("orgAccountAvatarBig"), currentUser.avatar_url, fullName);
  const nameEl = document.getElementById("orgAccountNameDisplay");
  if (nameEl) nameEl.textContent = fullName;
  document.getElementById("headerOrgName").textContent = currentOrg.name;
  document.getElementById("overviewOrgTitle").textContent = currentOrg.name;
}

function setupTabs() {
  const navItems = Array.from(document.querySelectorAll(".dash-nav-item[data-tab]"));
  navItems.forEach((item, index) => {
    item.addEventListener("click", (e) => {
      e.preventDefault();
      switchOrgTab(item.getAttribute("data-tab"));
    });

    item.addEventListener("keydown", (e) => {
      let nextIndex = null;
      if (e.key === "ArrowDown" || e.key === "ArrowRight") nextIndex = (index + 1) % navItems.length;
      else if (e.key === "ArrowUp" || e.key === "ArrowLeft") nextIndex = (index - 1 + navItems.length) % navItems.length;
      else if (e.key === "Home") nextIndex = 0;
      else if (e.key === "End") nextIndex = navItems.length - 1;

      if (nextIndex !== null) {
        e.preventDefault();
        const target = navItems[nextIndex];
        target.focus();
        switchOrgTab(target.getAttribute("data-tab"));
      }
    });
  });

  const initialTab = new URLSearchParams(window.location.search).get("tab");
  if (initialTab && document.getElementById("tab-" + initialTab)) {
    switchOrgTab(initialTab);
  }
}

function switchOrgTab(tabId) {
  document.querySelectorAll(".dash-nav-item[data-tab]").forEach(nav => {
    const isSelected = nav.getAttribute("data-tab") === tabId;
    nav.classList.toggle("active", isSelected);
    nav.classList.toggle("active-organizer", isSelected);
    nav.setAttribute("aria-selected", String(isSelected));
  });

  document.querySelectorAll(".tab-panel").forEach(panel => {
    const isTarget = panel.id === "tab-" + tabId;
    panel.classList.toggle("active", isTarget);
    panel.hidden = !isTarget;
  });

  if (tabId && window.history?.replaceState) {
    const url = new URL(window.location.href);
    url.searchParams.set("tab", tabId);
    window.history.replaceState(null, "", url.toString());
  }

  const sidebar = document.getElementById("dashSidebar");
  if (sidebar) sidebar.classList.remove("open");

  if (tabId === "volunteers" && typeof refreshVolunteerSection === "function") {
    refreshVolunteerSection();
  }
}

function setupUserMenu() {
  const trigger = document.getElementById("userMenuBtn");
  const menu = document.getElementById("userDropdownMenu");
  const profileBtn = document.getElementById("menuProfileBtn");
  const container = document.getElementById("userMenuContainer");
  if (!trigger || !menu) return;

  const setOpen = (isOpen) => {
    trigger.setAttribute("aria-expanded", String(isOpen));
    menu.hidden = !isOpen;
  };

  trigger.addEventListener("click", (e) => {
    e.stopPropagation();
    setOpen(trigger.getAttribute("aria-expanded") !== "true");
  });

  if (profileBtn) {
    profileBtn.addEventListener("click", () => {
      setOpen(false);
      switchOrgTab("profile");
    });
  }

  document.addEventListener("click", (e) => {
    if (container && !container.contains(e.target)) setOpen(false);
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && trigger.getAttribute("aria-expanded") === "true") {
      setOpen(false);
      trigger.focus();
    }
  });
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

// ================= TAB 1: OVERVIEW =================
let overviewFilterStart = "";
let overviewFilterEnd = "";
let calDraftStart = "";
let calDraftEnd = "";
let calViewYear = new Date().getFullYear();
let calViewMonth = new Date().getMonth();

function toLocalDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatShortViDate(dateStr) {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-");
  return `${d}/${m}/${y}`;
}

function renderOverviewCalendar() {
  const gridEl = document.getElementById("orgCalGrid");
  const monthLabelEl = document.getElementById("orgCalMonthLabel");
  const summaryEl = document.getElementById("orgCalSelectionText");
  if (!gridEl || !monthLabelEl) return;

  monthLabelEl.textContent = `Tháng ${calViewMonth + 1}, ${calViewYear}`;

  const firstOfMonth = new Date(calViewYear, calViewMonth, 1);
  const startOffset = (firstOfMonth.getDay() + 6) % 7; // Monday = 0
  const daysInMonth = new Date(calViewYear, calViewMonth + 1, 0).getDate();

  let html = "";
  for (let i = 0; i < startOffset; i++) {
    html += `<button type="button" class="org-cal-day org-cal-day--muted" disabled></button>`;
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${calViewYear}-${String(calViewMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const isStart = calDraftStart === dateStr;
    const isEnd = calDraftEnd === dateStr;
    const inRange = calDraftStart && calDraftEnd && dateStr > calDraftStart && dateStr < calDraftEnd;

    const classes = ["org-cal-day"];
    if (isStart) classes.push("org-cal-day--start");
    if (isEnd) classes.push("org-cal-day--end");
    if (inRange) classes.push("org-cal-day--in-range");

    html += `<button type="button" class="${classes.join(" ")}" data-date="${dateStr}">${day}</button>`;
  }

  gridEl.innerHTML = html;

  gridEl.querySelectorAll(".org-cal-day[data-date]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const picked = btn.dataset.date;
      if (!calDraftStart || (calDraftStart && calDraftEnd)) {
        calDraftStart = picked;
        calDraftEnd = "";
      } else if (picked < calDraftStart) {
        calDraftEnd = calDraftStart;
        calDraftStart = picked;
      } else {
        calDraftEnd = picked;
      }
      renderOverviewCalendar();
    });
  });

  if (summaryEl) {
    if (calDraftStart && calDraftEnd) {
      summaryEl.textContent = `${formatShortViDate(calDraftStart)} → ${formatShortViDate(calDraftEnd)}`;
    } else if (calDraftStart) {
      summaryEl.textContent = `Từ ${formatShortViDate(calDraftStart)} — Chọn ngày kết thúc`;
    } else {
      summaryEl.textContent = "Chọn ngày bắt đầu và kết thúc";
    }
  }
}

function setupOverviewFilters() {
  const wrapper = document.getElementById("overviewPeriodWrapper");
  const presetEl = document.getElementById("overviewPeriodPreset");
  const customTriggerBtn = document.getElementById("overviewCustomTriggerBtn");
  const customWrap = document.getElementById("overviewCustomDateWrap");
  const applyBtn = document.getElementById("overviewFilterApplyBtn");
  const cancelBtn = document.getElementById("overviewFilterCancelBtn");
  const prevBtn = document.getElementById("orgCalPrevBtn");
  const nextBtn = document.getElementById("orgCalNextBtn");

  const openCustomCalendar = () => {
    const now = new Date();
    calDraftStart = overviewFilterStart;
    calDraftEnd = overviewFilterEnd;
    if (overviewFilterStart) {
      const [y, m] = overviewFilterStart.split("-").map(Number);
      calViewYear = y || now.getFullYear();
      calViewMonth = (m ? m - 1 : now.getMonth());
    } else {
      calViewYear = now.getFullYear();
      calViewMonth = now.getMonth();
    }
    renderOverviewCalendar();
    if (customWrap) customWrap.hidden = false;
  };

  if (customTriggerBtn) {
    customTriggerBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (customWrap && !customWrap.hidden) {
        customWrap.hidden = true;
      } else {
        openCustomCalendar();
      }
    });
  }

  if (prevBtn) {
    prevBtn.addEventListener("click", () => {
      calViewMonth -= 1;
      if (calViewMonth < 0) {
        calViewMonth = 11;
        calViewYear -= 1;
      }
      renderOverviewCalendar();
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener("click", () => {
      calViewMonth += 1;
      if (calViewMonth > 11) {
        calViewMonth = 0;
        calViewYear += 1;
      }
      renderOverviewCalendar();
    });
  }

  if (presetEl) {
    presetEl.addEventListener("change", () => {
      const val = presetEl.value;
      const now = new Date();
      if (val === "custom") {
        openCustomCalendar();
        return;
      }
      if (customWrap) customWrap.hidden = true;
      if (customTriggerBtn) customTriggerBtn.hidden = true;
      if (val === "all") {
        overviewFilterStart = "";
        overviewFilterEnd = "";
      } else if (val === "this_month") {
        const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
        const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        overviewFilterStart = toLocalDateStr(firstDay);
        overviewFilterEnd = toLocalDateStr(lastDay);
      } else if (val === "last_30_days") {
        const past = new Date(now.getTime() - 29 * 86400000);
        overviewFilterStart = toLocalDateStr(past);
        overviewFilterEnd = toLocalDateStr(now);
      }
      loadOrganizerStats();
    });
  }

  if (applyBtn) {
    applyBtn.addEventListener("click", () => {
      if (!calDraftStart) {
        showToast("Vui lòng chọn ít nhất ngày bắt đầu trên lịch.", "warning");
        return;
      }
      overviewFilterStart = calDraftStart;
      overviewFilterEnd = calDraftEnd || calDraftStart;
      if (customTriggerBtn) {
        customTriggerBtn.textContent = `${formatShortViDate(overviewFilterStart)} – ${formatShortViDate(overviewFilterEnd)} ✎`;
        customTriggerBtn.hidden = false;
      }
      if (customWrap) customWrap.hidden = true;
      loadOrganizerStats();
    });
  }

  if (cancelBtn) {
    cancelBtn.addEventListener("click", () => {
      if (customWrap) customWrap.hidden = true;
    });
  }

  if (customWrap) {
    customWrap.addEventListener("click", (e) => {
      e.stopPropagation();
    });
  }

  document.addEventListener("click", (e) => {
    if (customWrap && !customWrap.hidden && wrapper && !wrapper.contains(e.target)) {
      customWrap.hidden = true;
    }
  });
}

async function loadOrganizerStats() {
  const startDate = overviewFilterStart;
  const endDate = overviewFilterEnd;
  const periodEl = document.getElementById("orgTopVolunteersPeriod");
  if (periodEl) {
    if (startDate || endDate) {
      periodEl.textContent = `${formatShortViDate(startDate) || "..."} → ${formatShortViDate(endDate) || "..."}`;
    } else {
      periodEl.textContent = "Toàn thời gian";
    }
  }

  try {
    const params = {};
    if (startDate) params.start_date = startDate;
    if (endDate) params.end_date = endDate;
    const res = await api.get("/organizations/stats", { params });
    const stats = res.data?.data;
    if (stats) {
      orgStatsCache = stats;
      applyOrganizerStatsToOverview(stats);
      return;
    }
  } catch (error) {
    console.warn("Không thể tải /organizations/stats, dùng dữ liệu cục bộ:", error);
  }

  renderTopVolunteers([]);
}

function applyOrganizerStatsToOverview(stats) {
  if (!stats) return;
  const kpiCampEl = document.getElementById("kpiOrgCampaigns");
  const kpiCampMetaEl = document.getElementById("kpiOrgCampaignsMeta");
  const kpiPendingEl = document.getElementById("kpiOrgPendingApplicants");
  const kpiRegMetaEl = document.getElementById("kpiOrgRegistrationsMeta");
  const kpiAttEl = document.getElementById("kpiOrgAttendanceRate");
  const kpiVolMetaEl = document.getElementById("kpiOrgVolunteersMeta");
  const kpiHoursEl = document.getElementById("kpiOrgTotalHours");

  if (kpiCampEl && typeof stats.total_campaigns === "number") {
    kpiCampEl.textContent = stats.total_campaigns;
  }
  if (kpiCampMetaEl && stats.campaigns_by_status) {
    const openCount = stats.campaigns_by_status.OPEN || 0;
    const draftCount = stats.campaigns_by_status.DRAFT || 0;
    kpiCampMetaEl.textContent = `${openCount} đang mở · ${draftCount} bản nháp`;
  }
  if (kpiPendingEl && typeof stats.pending_registrations === "number") {
    kpiPendingEl.textContent = stats.pending_registrations;
  }
  if (kpiRegMetaEl && typeof stats.total_registrations === "number") {
    kpiRegMetaEl.textContent = `Trên tổng ${stats.total_registrations} lượt đăng ký`;
  }
  if (kpiAttEl && typeof stats.attendance_rate === "number") {
    kpiAttEl.textContent = `${Number(stats.attendance_rate).toFixed(1)}%`;
  }
  if (kpiVolMetaEl && typeof stats.approved_registrations === "number") {
    kpiVolMetaEl.textContent = `${stats.approved_registrations} TNV đã duyệt`;
  }
  if (kpiHoursEl && typeof stats.total_verified_hours === "number") {
    kpiHoursEl.textContent = `${Number(stats.total_verified_hours).toFixed(1)}h`;
  }

  renderTopVolunteers(Array.isArray(stats.top_volunteers) ? stats.top_volunteers : []);
}

function renderTopVolunteers(volunteers) {
  const listEl = document.getElementById("orgTopVolunteersList");
  if (!listEl) return;

  if (!volunteers || volunteers.length === 0) {
    listEl.innerHTML = `<div class="org-empty-inline">Chưa có dữ liệu điểm danh được ghi nhận trong kỳ này.</div>`;
    return;
  }

  listEl.innerHTML = volunteers.slice(0, 5).map((v, idx) => {
    const name = v.full_name || v.email || `TNV #${v.user_id}`;
    const initials = name.trim().split(/\s+/).slice(-2).map(w => w.charAt(0).toUpperCase()).join("") || "TV";
    const hours = Number(v.total_hours || 0).toFixed(1);
    const sessions = v.total_sessions || 0;
    return `
      <div class="org-volunteer-rank-item">
        <span class="org-rank-badge ${idx < 3 ? "org-rank-badge--top" : ""}">${idx + 1}</span>
        <div class="org-rank-avatar" aria-hidden="true">${escapeHtml(initials)}</div>
        <div class="org-rank-info">
          <div class="org-rank-name">${escapeHtml(name)}</div>
          <div class="org-rank-sub">${sessions} buổi tham gia</div>
        </div>
        <div class="org-rank-hours">${hours} giờ</div>
      </div>
    `;
  }).join("");
}

function renderOverview() {
  const allCampaigns = getOrgCampaigns();
  const allApplicants = orgRegistrationsCache.length > 0 ? orgRegistrationsCache : DataStore.getRegistrations();
  const orgCampaignIds = allCampaigns.map(c => c.id);
  const myApplicants = allApplicants.filter(a => orgCampaignIds.includes(a.campaign_id));

  const pendingApps = myApplicants.filter(a => a.status === "PENDING");
  const approvedApps = myApplicants.filter(a => a.status === "APPROVED");

  let fallbackHours = 0;
  allCampaigns.forEach(c => {
    if (c.status === "OPEN" || c.status === "COMPLETED") {
      fallbackHours += (c.registered_count || 0) * (c.estimated_hours || 0);
    }
  });

  document.getElementById("kpiOrgCampaigns").textContent = orgStatsCache?.total_campaigns ?? allCampaigns.length;
  document.getElementById("kpiOrgPendingApplicants").textContent = pendingApps.length;
  const volMetaEl = document.getElementById("kpiOrgVolunteersMeta");
  if (volMetaEl) volMetaEl.textContent = `${approvedApps.length} TNV đã duyệt`;
  if (!orgStatsCache) {
    document.getElementById("kpiOrgTotalHours").textContent = fallbackHours.toFixed(1) + "h";
  }
  document.getElementById("orgCampaignsCount").textContent = allCampaigns.length;
  document.getElementById("pendingApplicantsBadge").textContent = pendingApps.length;

  // Active Campaign Highlight
  const bannerEl = document.getElementById("orgActiveCampaignBanner");
  const activeCamp = allCampaigns.find(c => c.status === "OPEN") || allCampaigns[0];

  if (!activeCamp) {
    bannerEl.innerHTML = `<div class="org-empty-inline">Chưa có chiến dịch nào. Hãy tạo chiến dịch mới!</div>`;
    return;
  }

  const registered = Number(activeCamp.registered_count || 0);
  const maxPart = Math.max(1, Number(activeCamp.max_participants || 1));
  const pct = Math.min(100, Math.round((registered / maxPart) * 100));
  const thumbHtml = activeCamp.image_url
    ? `<img class="org-spotlight-thumb" src="${escapeHtml(activeCamp.image_url)}" alt="${escapeHtml(activeCamp.title)}" onerror="this.style.display='none'">`
    : "";

  bannerEl.innerHTML = `
    <div class="org-spotlight-card">
      <div class="org-spotlight-top">
        ${thumbHtml}
        <div class="org-spotlight-info">
          <span class="status-pill status-${String(activeCamp.status || "OPEN").toLowerCase()}">${escapeHtml(activeCamp.status)}</span>
          <h3 class="org-spotlight-title">${escapeHtml(activeCamp.title)}</h3>
          <div class="org-spotlight-meta">
            <span class="org-spotlight-meta-item">
              <svg class="svg-icon" aria-hidden="true" viewBox="0 0 24 24"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
              ${escapeHtml(activeCamp.location || "Chưa cập nhật")}
            </span>
            <span class="org-spotlight-meta-item">
              <svg class="svg-icon" aria-hidden="true" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
              ${formatDateTime(activeCamp.start_time)}
            </span>
            <span class="org-spotlight-meta-item">
              <svg class="svg-icon" aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              ${activeCamp.estimated_hours || 0} giờ dự kiến
            </span>
          </div>
        </div>
      </div>

      <div class="org-spotlight-progress">
        <div class="org-spotlight-progress-head">
          <span>Tiến độ tiếp nhận tình nguyện viên</span>
          <strong>${registered} / ${maxPart} TNV (${pct}%)</strong>
        </div>
        <div class="org-progress-track">
          <div class="org-progress-fill" style="width: ${pct}%;"></div>
        </div>
      </div>

      <div class="org-spotlight-actions">
        <button type="button" class="btn btn-primary btn-sm" onclick="quickOpenAttendance(${activeCamp.id})">Phát mã điểm danh</button>
        <button type="button" class="btn btn-outline btn-sm" onclick="switchOrgTab('volunteers')">Duyệt đơn (${pendingApps.length})</button>
      </div>
    </div>
  `;
}

// ================= TAB 2: QUẢN LÝ CHIẾN DỊCH =================
function renderCampaignsTable() {
  const allCampaigns = getOrgCampaigns();
  const tbody = document.getElementById("orgCampaignsTbody");
  if (!tbody) return;

  if (allCampaigns.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 36px; color: #94a3b8;">Chưa có chiến dịch nào được tạo.</td></tr>`;
    return;
  }

  const statusMap = {
    DRAFT: { label: "Bản nháp", class: "status-draft" },
    PENDING: { label: "Chờ Admin duyệt", class: "status-pending" },
    OPEN: { label: "Đang mở tuyển", class: "status-open" },
    CLOSED: { label: "Đã đóng đơn", class: "status-closed" },
    COMPLETED: { label: "Đã hoàn thành", class: "status-completed" },
    CANCELLED: { label: "Đã hủy", class: "status-cancelled" }
  };

  tbody.innerHTML = allCampaigns.map(c => {
    const st = statusMap[c.status] || { label: c.status, class: "status-draft" };
    return `
      <tr data-status="${escapeHtml(c.status)}">
        <td>
          <div class="td-title">${escapeHtml(c.title)}</div>
          <div class="td-subtitle">Mã: CAMP-${c.id}</div>
        </td>
        <td>
          <div><strong style="color: #1d4ed8;">${escapeHtml(c.category)}</strong></div>
          <div class="td-subtitle">${escapeHtml(c.location)}</div>
        </td>
        <td>
          <div style="font-size: 13px;">Bắt đầu: ${formatDateTime(c.start_time)}</div>
          <div class="td-subtitle">Hạn ĐK: ${formatDateTime(c.registration_deadline)}</div>
        </td>
        <td>
          <strong>${c.registered_count || 0}</strong> / ${c.max_participants}
          <div class="td-subtitle">(${c.estimated_hours} giờ)</div>
        </td>
        <td>
          <span class="status-pill ${st.class}">
            <span class="status-dot"></span>
            ${st.label}
          </span>
          ${c.reason ? `<div style="font-size: 11px; color: #b91c1c; margin-top: 4px;">Góp ý: ${escapeHtml(c.reason)}</div>` : ""}
        </td>
        <td style="text-align: right;">
          <div class="btn-group-sm" style="justify-content: flex-end;">
            ${c.status === "DRAFT" ? `
              <button class="btn-action btn-action-blue" onclick="submitCampaignToAdmin(${c.id})">Gửi duyệt</button>
            ` : ""}
            ${c.status === "OPEN" ? `
              <button class="btn-action btn-action-primary" onclick="quickOpenAttendance(${c.id})">Điểm danh</button>
            ` : ""}
            <button class="btn-action" style="color: #64748b;" onclick="openCampaignDetailModal(${c.id})">Xem</button>
          </div>
        </td>
      </tr>
    `;
  }).join("");
}

function filterOrgCampaigns() {
  const query = (document.getElementById("orgCampaignSearch")?.value || "").trim().toLowerCase();
  const status = document.getElementById("orgCampaignStatusFilter")?.value || "ALL";
  const rows = document.querySelectorAll("#orgCampaignsTbody tr[data-status]");

  let visibleCount = 0;
  rows.forEach(row => {
    const text = row.textContent.toLowerCase();
    const rowStatus = row.dataset.status || "";
    const matchesQuery = !query || text.includes(query);
    const matchesStatus = status === "ALL" || !status || rowStatus === status;
    const isVisible = matchesQuery && matchesStatus;
    row.style.display = isVisible ? "" : "none";
    if (isVisible) visibleCount += 1;
  });

  const tbody = document.getElementById("orgCampaignsTbody");
  const existingEmpty = document.getElementById("orgCampaignFilterEmptyRow");
  if (existingEmpty) existingEmpty.remove();

  if (tbody && rows.length > 0 && visibleCount === 0) {
    const emptyRow = document.createElement("tr");
    emptyRow.id = "orgCampaignFilterEmptyRow";
    emptyRow.innerHTML = `<td colspan="6" style="text-align: center; padding: 32px; color: #94a3b8;">Không có chiến dịch nào phù hợp bộ lọc.</td>`;
    tbody.appendChild(emptyRow);
  }
}

const CAMPAIGN_FORM_IDS = [
  "newCampTitle",
  "newCampImageUrl",
  "newCampCategory",
  "newCampMaxPart",
  "newCampLocation",
  "newCampHours",
  "newCampStart",
  "newCampEnd",
  "newCampDeadline",
  "newCampDescription",
  "newCampRequirements",
];

const CAMPAIGN_STATUS_META = {
  DRAFT: { label: "Bản nháp", class: "status-draft" },
  PENDING: { label: "Chờ Admin duyệt", class: "status-pending" },
  OPEN: { label: "Đang mở tuyển", class: "status-open" },
  CLOSED: { label: "Đã đóng đơn", class: "status-closed" },
  COMPLETED: { label: "Đã hoàn thành", class: "status-completed" },
  CANCELLED: { label: "Đã hủy", class: "status-cancelled" },
};

function toDatetimeLocalValue(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function updateCampaignImagePreview(url) {
  const img = document.getElementById("newCampImagePreview");
  const placeholder = document.getElementById("newCampCoverPlaceholder");
  if (!img) return;
  const trimmed = (url || "").trim();
  if (!trimmed) {
    img.hidden = true;
    img.removeAttribute("src");
    if (placeholder) placeholder.hidden = false;
    return;
  }
  img.onload = () => {
    img.hidden = false;
    if (placeholder) placeholder.hidden = true;
  };
  img.onerror = () => {
    img.hidden = true;
    if (placeholder) placeholder.hidden = false;
  };
  img.src = trimmed;
}

function setupCampaignImagePreview() {
  const input = document.getElementById("newCampImageUrl");
  if (input) {
    input.addEventListener("input", () => updateCampaignImagePreview(input.value));
  }
  CAMPAIGN_FORM_IDS.forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener("input", syncCampaignUpdateButton);
    el.addEventListener("change", syncCampaignUpdateButton);
  });
  document.querySelectorAll(".dash-modal-backdrop").forEach((backdrop) => {
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) closeModal(backdrop.id);
    });
  });
}

function getCampaignFormSnapshot() {
  return JSON.stringify(
    CAMPAIGN_FORM_IDS.map((id) => document.getElementById(id)?.value ?? "")
  );
}

function syncCampaignUpdateButton() {
  if (!activeDetailCampaignId || !isCampaignEditing) return;
  const btn = document.getElementById("updateCampaignBtn");
  if (!btn) return;
  const isDirty = getCampaignFormSnapshot() !== campaignInitialSnapshot;
  btn.textContent = isDirty ? "Lưu" : "Cập nhật";
  btn.className = isDirty ? "btn btn-primary" : "btn btn-outline";
}

function setCampaignFormReadOnly(isReadOnly) {
  CAMPAIGN_FORM_IDS.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.disabled = isReadOnly;
  });
}

function campaignRequiresCancelReason(camp) {
  return Boolean(camp && (camp.status === "OPEN" || camp.status === "CLOSED"));
}

function toggleCancelCampaignBox(show) {
  const box = document.getElementById("campaignCancelReasonBox");
  const reasonLabel = document.getElementById("cancelCampaignReasonLabel");
  const reasonEl = document.getElementById("cancelCampaignReason");
  const noReasonHint = document.getElementById("cancelCampaignNoReasonHint");
  if (!box) return;
  box.hidden = !show;
  if (!show) return;

  const camp = getOrgCampaigns().find((c) => c.id === activeDetailCampaignId);
  const needsReason = campaignRequiresCancelReason(camp);
  if (reasonLabel) reasonLabel.hidden = !needsReason;
  if (reasonEl) {
    reasonEl.hidden = !needsReason;
    reasonEl.value = "";
  }
  if (noReasonHint) noReasonHint.hidden = needsReason;
  box.scrollIntoView({ behavior: "smooth", block: "nearest" });
  if (needsReason && reasonEl) reasonEl.focus();
}

function openCreateCampaignModal() {
  activeDetailCampaignId = null;
  campaignInitialSnapshot = null;
  isCampaignEditing = false;
  const now = new Date();
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  document.getElementById("createCampaignTitle").textContent = "Tạo chiến dịch mới";
  const codeBadge = document.getElementById("campaignModalCodeBadge");
  const pill = document.getElementById("campaignModalStatusPill");
  if (codeBadge) codeBadge.hidden = true;
  if (pill) pill.hidden = true;

  const readWrap = document.getElementById("campaignReadViewWrap");
  const editWrap = document.getElementById("campaignEditFormWrap");
  if (readWrap) readWrap.hidden = true;
  if (editWrap) editWrap.hidden = false;

  document.getElementById("campaignModalStatusBanner").style.display = "none";
  toggleCancelCampaignBox(false);
  setCampaignFormReadOnly(false);

  document.getElementById("newCampTitle").value = "";
  document.getElementById("newCampImageUrl").value = "";
  updateCampaignImagePreview("");
  document.getElementById("newCampCategory").value = "";
  document.getElementById("newCampLocation").value = "";
  document.getElementById("newCampMaxPart").value = 30;
  document.getElementById("newCampHours").value = 4;
  document.getElementById("newCampStart").value = toDatetimeLocalValue(tomorrow);
  document.getElementById("newCampEnd").value = toDatetimeLocalValue(new Date(tomorrow.getTime() + 4 * 3600000));
  document.getElementById("newCampDeadline").value = toDatetimeLocalValue(now);
  document.getElementById("newCampDescription").value = "";
  document.getElementById("newCampRequirements").value = "";

  const closeBtn = document.getElementById("createCampaignCloseBtn");
  closeBtn.hidden = false;
  closeBtn.textContent = "Hủy";
  document.getElementById("createCampaignSubmitBtn").hidden = false;
  document.getElementById("submitDetailCampaignBtn").hidden = true;
  document.getElementById("updateCampaignBtn").hidden = true;
  document.getElementById("deleteCampaignBtn").hidden = true;

  openModal("createCampaignModal");
}

function populateCampaignReadView(camp) {
  const registered = Number(camp.registered_count || 0);
  const maxPart = Math.max(1, Number(camp.max_participants || 1));
  const pct = Math.min(100, Math.round((registered / maxPart) * 100));

  const coverImg = document.getElementById("campReadCoverImg");
  if (coverImg) {
    if (camp.image_url) {
      coverImg.src = camp.image_url;
      coverImg.alt = camp.title || "Ảnh chiến dịch";
      coverImg.hidden = false;
      coverImg.onerror = () => { coverImg.hidden = true; };
    } else {
      coverImg.hidden = true;
      coverImg.removeAttribute("src");
    }
  }

  const catTag = document.getElementById("campReadCategoryTag");
  const locTag = document.getElementById("campReadLocationTag");
  if (catTag) catTag.textContent = camp.category || "Tình nguyện";
  if (locTag) locTag.textContent = camp.location || "Chưa cập nhật";

  document.getElementById("campReadQuotaText").textContent = `${registered} / ${maxPart} TNV`;
  document.getElementById("campReadQuotaPct").textContent = `${pct}%`;
  document.getElementById("campReadQuotaBar").style.width = `${pct}%`;
  document.getElementById("campReadHoursText").textContent = `${camp.estimated_hours || 0} giờ`;
  document.getElementById("campReadDeadlineText").textContent = formatDateTime(camp.registration_deadline);

  document.getElementById("campReadStartText").textContent = formatDateTime(camp.start_time);
  document.getElementById("campReadEndText").textContent = formatDateTime(camp.end_time);
  document.getElementById("campReadLocationText").textContent = camp.location || "Chưa cập nhật";

  const noteCard = document.getElementById("campReadStatusNoteCard");
  const noteText = document.getElementById("campReadStatusNoteText");
  if (noteCard && noteText) {
    noteCard.classList.remove("org-camp-info-card--danger", "org-camp-info-card--tint");
    if (camp.reason) {
      noteCard.classList.add("org-camp-info-card--danger");
      noteText.textContent = `Góp ý / Lý do: ${camp.reason}`;
    } else if (camp.status === "DRAFT") {
      noteCard.classList.add("org-camp-info-card--tint");
      noteText.textContent = "Chiến dịch đang ở trạng thái Bản nháp (DRAFT). Kiểm tra kỹ thông tin rồi nhấn 'Gửi duyệt Admin' để công khai tiếp nhận TNV.";
    } else if (camp.status === "PENDING") {
      noteText.textContent = "Chiến dịch đã gửi lên Quản trị viên và đang chờ xét duyệt.";
    } else if (camp.status === "OPEN") {
      noteCard.classList.add("org-camp-info-card--tint");
      noteText.textContent = "Chiến dịch đang mở tiếp nhận đăng ký tình nguyện viên công khai.";
    } else {
      noteText.textContent = "Chỉ chiến dịch ở trạng thái Bản nháp (DRAFT) mới được phép chỉnh sửa thông tin.";
    }
  }

  document.getElementById("campReadDescText").textContent = camp.description || "Chưa có mô tả chi tiết.";
  document.getElementById("campReadReqText").textContent = camp.requirements || "Không có yêu cầu đặc biệt.";
}

function openCampaignDetailModal(campaignId) {
  const camp = getOrgCampaigns().find((c) => c.id === campaignId);
  if (!camp) {
    showToast("Không tìm thấy thông tin chiến dịch.", "error");
    return;
  }

  activeDetailCampaignId = camp.id;
  isCampaignEditing = false;
  const st = CAMPAIGN_STATUS_META[camp.status] || { label: camp.status, class: "status-draft" };
  const isDraft = camp.status === "DRAFT";
  const canCancel = camp.status !== "COMPLETED" && camp.status !== "CANCELLED";

  document.getElementById("createCampaignTitle").textContent = camp.title || `Chiến dịch #${camp.id}`;
  const codeBadge = document.getElementById("campaignModalCodeBadge");
  const pill = document.getElementById("campaignModalStatusPill");
  if (codeBadge) {
    codeBadge.textContent = `#CAMP-${camp.id}`;
    codeBadge.hidden = false;
  }
  if (pill) {
    pill.className = `status-pill ${st.class}`;
    pill.innerHTML = `<span class="status-dot"></span> ${st.label}`;
    pill.hidden = false;
  }

  // Populate Read View & Edit Form
  populateCampaignReadView(camp);
  const readWrap = document.getElementById("campaignReadViewWrap");
  const editWrap = document.getElementById("campaignEditFormWrap");
  if (readWrap) readWrap.hidden = false;
  if (editWrap) editWrap.hidden = true;

  const banner = document.getElementById("campaignModalStatusBanner");
  const reasonText = document.getElementById("campaignModalReasonText");
  if (banner) banner.style.display = camp.reason ? "flex" : "none";
  if (reasonText) reasonText.textContent = camp.reason ? `Góp ý / Lý do: ${camp.reason}` : "";

  document.getElementById("newCampTitle").value = camp.title || "";
  document.getElementById("newCampImageUrl").value = camp.image_url || "";
  updateCampaignImagePreview(camp.image_url || "");
  document.getElementById("newCampCategory").value = camp.category || "";
  document.getElementById("newCampMaxPart").value = camp.max_participants || 1;
  document.getElementById("newCampLocation").value = camp.location || "";
  document.getElementById("newCampHours").value = camp.estimated_hours || 1;
  document.getElementById("newCampStart").value = toDatetimeLocalValue(camp.start_time);
  document.getElementById("newCampEnd").value = toDatetimeLocalValue(camp.end_time);
  document.getElementById("newCampDeadline").value = toDatetimeLocalValue(camp.registration_deadline);
  document.getElementById("newCampDescription").value = camp.description || "";
  document.getElementById("newCampRequirements").value = camp.requirements || "";

  campaignInitialSnapshot = getCampaignFormSnapshot();
  setCampaignFormReadOnly(false);
  toggleCancelCampaignBox(false);

  document.getElementById("createCampaignCloseBtn").hidden = true;
  document.getElementById("createCampaignSubmitBtn").hidden = true;
  document.getElementById("submitDetailCampaignBtn").hidden = !isDraft;

  const updateBtn = document.getElementById("updateCampaignBtn");
  updateBtn.hidden = !isDraft;
  updateBtn.textContent = "Chỉnh sửa thông tin";
  updateBtn.className = "btn btn-outline";
  updateBtn.disabled = false;

  const deleteBtn = document.getElementById("deleteCampaignBtn");
  deleteBtn.hidden = !canCancel;
  deleteBtn.textContent = campaignRequiresCancelReason(camp) ? "Hủy chiến dịch" : "Xóa chiến dịch";

  openModal("createCampaignModal");
}

function handleCampaignModalSecondaryCancel() {
  if (activeDetailCampaignId && isCampaignEditing) {
    // Quay lại chế độ xem chi tiết
    openCampaignDetailModal(activeDetailCampaignId);
    return;
  }
  closeModal("createCampaignModal");
}

function submitCampaignFromDetailModal() {
  if (!activeDetailCampaignId) return;
  const targetId = activeDetailCampaignId;
  closeModal("createCampaignModal");
  submitCampaignToAdmin(targetId);
}

function handleUpdateOrSaveCampaign() {
  if (!activeDetailCampaignId) return;
  if (!isCampaignEditing) {
    isCampaignEditing = true;
    const readWrap = document.getElementById("campaignReadViewWrap");
    const editWrap = document.getElementById("campaignEditFormWrap");
    if (readWrap) readWrap.hidden = true;
    if (editWrap) editWrap.hidden = false;
    setCampaignFormReadOnly(false);

    const closeBtn = document.getElementById("createCampaignCloseBtn");
    if (closeBtn) {
      closeBtn.hidden = false;
      closeBtn.textContent = "Quay lại xem";
    }
    const updateBtn = document.getElementById("updateCampaignBtn");
    if (updateBtn) {
      updateBtn.textContent = "Lưu thay đổi";
      updateBtn.className = "btn btn-primary";
    }
    document.getElementById("submitDetailCampaignBtn").hidden = true;
    document.getElementById("newCampTitle")?.focus();
    return;
  }
  if (getCampaignFormSnapshot() === campaignInitialSnapshot) {
    showToast("Chưa có thông tin nào thay đổi.", "info");
    return;
  }
  submitUpdateCampaign();
}

function readCampaignFormPayload() {
  const title = document.getElementById("newCampTitle").value.trim();
  const imageUrl = document.getElementById("newCampImageUrl").value.trim();
  const category = document.getElementById("newCampCategory").value.trim();
  const location = document.getElementById("newCampLocation").value.trim();
  const startTime = document.getElementById("newCampStart").value;
  const endTime = document.getElementById("newCampEnd").value;
  const deadline = document.getElementById("newCampDeadline").value;
  const maxPart = parseInt(document.getElementById("newCampMaxPart").value, 10);
  const hours = parseFloat(document.getElementById("newCampHours").value);
  const requirements = document.getElementById("newCampRequirements").value.trim();
  const description = document.getElementById("newCampDescription").value.trim();

  if (!title || !category || !location || !startTime || !endTime || !deadline || !description) {
    showToast("Vui lòng điền đầy đủ các thông tin bắt buộc (*)", "error");
    return null;
  }

  if (!Number.isFinite(maxPart) || maxPart <= 0 || !Number.isFinite(hours) || hours <= 0) {
    showToast("Số lượng TNV và số giờ dự kiến phải lớn hơn 0!", "error");
    return null;
  }

  if (new Date(endTime) <= new Date(startTime)) {
    showToast("Thời gian kết thúc phải sau thời gian bắt đầu!", "error");
    return null;
  }

  if (new Date(deadline) >= new Date(startTime)) {
    showToast("Hạn đăng ký phải trước thời gian bắt đầu!", "error");
    return null;
  }

  return {
    title,
    image_url: imageUrl || null,
    category,
    location,
    start_time: new Date(startTime).toISOString(),
    end_time: new Date(endTime).toISOString(),
    registration_deadline: new Date(deadline).toISOString(),
    max_participants: maxPart,
    estimated_hours: hours,
    requirements: requirements || null,
    description,
  };
}

function refreshCampaignViews() {
  renderOverview();
  renderCampaignsTable();
  setupAttendanceGenerator();
}

async function submitCreateCampaign() {
  const payload = readCampaignFormPayload();
  if (!payload) return;

  try {
    const response = await api.post("/campaigns", payload);
    const createdCamp = response.data;
    upsertOrgCampaign({ registered_count: 0, ...createdCamp });
    showToast("Tạo chiến dịch thành công (DRAFT) trên Backend!", "success");
  } catch (error) {
    console.warn("Backend /campaigns chưa kết nối hoặc lỗi, lưu vào Local DataStore:", error);
    const localCamp = {
      id: Date.now(),
      organization_id: currentOrg.id,
      organization_name: currentOrg.name,
      ...payload,
      registered_count: 0,
      status: "DRAFT",
    };
    upsertOrgCampaign(localCamp);
    showToast("Đã lưu bản nháp chiến dịch thành công!", "success");
  }

  closeModal("createCampaignModal");
  refreshCampaignViews();
}

async function submitUpdateCampaign() {
  if (!activeDetailCampaignId) return;
  const payload = readCampaignFormPayload();
  if (!payload) return;

  const btn = document.getElementById("updateCampaignBtn");
  const prevText = btn ? btn.textContent : "Lưu";
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Đang lưu...";
  }

  try {
    const response = await api.patch(`/campaigns/${activeDetailCampaignId}`, payload);
    upsertOrgCampaign(response.data);
    showToast("Đã cập nhật chiến dịch thành công!", "success");
    closeModal("createCampaignModal");
    refreshCampaignViews();
  } catch (error) {
    if (!error.response) {
      const existing = getOrgCampaigns().find((c) => c.id === activeDetailCampaignId);
      if (existing) {
        upsertOrgCampaign({ ...existing, ...payload });
        showToast("Đã lưu cập nhật chiến dịch (cục bộ).", "success");
        closeModal("createCampaignModal");
        refreshCampaignViews();
        return;
      }
    }
    const msg = Layout.extractApiErrorMessage(error, "Không thể cập nhật chiến dịch.");
    showToast(msg, "error");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = prevText;
    }
  }
}

async function submitCancelCampaign() {
  if (!activeDetailCampaignId) return;
  const camp = getOrgCampaigns().find((c) => c.id === activeDetailCampaignId);
  const needsReason = campaignRequiresCancelReason(camp);
  const rawReason = (document.getElementById("cancelCampaignReason")?.value || "").trim();
  if (needsReason && !rawReason) {
    showToast("Vui lòng nhập lý do hủy chiến dịch đã duyệt!", "error");
    return;
  }
  const reason = needsReason ? rawReason : "Hủy chiến dịch trước khi được duyệt";

  try {
    const response = await api.patch(`/campaigns/${activeDetailCampaignId}/cancel`, { reason });
    upsertOrgCampaign(response.data);
    showToast(needsReason ? "Đã hủy chiến dịch thành công!" : "Đã xóa chiến dịch!", "success");
    closeModal("createCampaignModal");
    refreshCampaignViews();
  } catch (error) {
    if (!error.response && camp) {
      upsertOrgCampaign({ ...camp, status: "CANCELLED", reason: needsReason ? reason : null });
      showToast(needsReason ? "Đã hủy chiến dịch (cục bộ)." : "Đã xóa chiến dịch (cục bộ).", "success");
      closeModal("createCampaignModal");
      refreshCampaignViews();
      return;
    }
    const msg = Layout.extractApiErrorMessage(error, "Không thể xóa/hủy chiến dịch.");
    showToast(msg, "error");
  }
}

async function submitCampaignToAdmin(campaignId) {
  try {
    const response = await api.post(`/campaigns/${campaignId}/submit`);
    upsertOrgCampaign(response.data);
    showToast("Đã gửi chiến dịch tới Quản trị viên để phê duyệt!", "success");
    refreshCampaignViews();
  } catch (error) {
    console.warn("Backend submit fallback:", error);
    const camp = getOrgCampaigns().find((c) => c.id === campaignId);
    if (camp) {
      upsertOrgCampaign({ ...camp, status: "PENDING", reason: null });
      showToast("Chiến dịch đã chuyển sang trạng thái CHỜ ADMIN DUYỆT (PENDING)", "success");
      refreshCampaignViews();
    }
  }
}

// ================= TAB 3: ATTENDANCE STATION =================
function setupAttendanceGenerator() {
  const select = document.getElementById("codeGenCampaignSelect");
  const genBtn = document.getElementById("btnGenerateAttendanceCode");
  if (!select) return;

  const allCampaigns = DataStore.getCampaigns().filter(c => c.organization_id === currentOrg.id || c.organization_name === currentOrg.name);
  select.innerHTML = allCampaigns.map(c => 
    `<option value="${c.id}">${escapeHtml(c.title)} (${c.status})</option>`
  ).join("");

  // Khi đổi chiến dịch → reload danh sách điểm danh từ DB
  select.addEventListener("change", () => renderLiveAttendanceList());

  if (genBtn) genBtn.addEventListener("click", generateAttendanceCode);
  renderLiveAttendanceList();
}

function quickOpenAttendance(campaignId) {
  switchOrgTab("attendance");
  const select = document.getElementById("codeGenCampaignSelect");
  if (select) select.value = campaignId;
}

async function generateAttendanceCode() {
  const select = document.getElementById("codeGenCampaignSelect");
  const expiresSelect = document.getElementById("codeGenExpiresSelect");
  const campaignId = parseInt(select.value);
  const expiresMinutes = parseInt(expiresSelect.value);

  if (!campaignId) {
    showToast("Chưa có chiến dịch đang mở để phát mã!", "error");
    return;
  }

  const camp = getOrgCampaigns().find(c => c.id === campaignId && c.status === "OPEN");
  if (!camp) {
    showToast("Chỉ có thể phát mã cho chiến dịch đã duyệt và đang mở (OPEN).", "warning");
    return;
  }

  let generatedCode = null;
  let expiresAt = null;

  try {
    // 1. Gọi trực tiếp FastAPI Backend: POST /api/attendances/code
    const response = await api.post("/attendances/code", {
      campaign_id: campaignId,
      expires_minutes: expiresMinutes
    });

    generatedCode = response.data.code;
    expiresAt = response.data.expires_at;
  } catch (error) {
    console.warn("Lỗi sinh mã Backend, tạo mã bảo mật cục bộ:", error);

    // Fallback sinh mã 6 ký tự ngẫu nhiên
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    generatedCode = "";
    for (let i = 0; i < 6; i++) {
      generatedCode += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    expiresAt = new Date(Date.now() + expiresMinutes * 60000).toISOString();
  }

  // Cập nhật chiến dịch
  camp.attendance_code = generatedCode;
  camp.attendance_code_expires_at = expiresAt;
  DataStore.saveCampaign(camp);

  // Hiển thị trên Projector Card & mở Kiosk Modal (Hướng 2)
  displayLiveCode(generatedCode, new Date(expiresAt), camp.title);
  openModal("attendanceCodeModal");
}

function displayLiveCode(code, expiresDate, campaignTitle) {
  const projectorCard = document.getElementById("projectorCard");
  const codeEl = document.getElementById("liveDisplayCode");
  const timerEl = document.getElementById("liveDisplayTimer");
  const kioskCodeEl = document.getElementById("kioskDisplayCode");
  const kioskTimerEl = document.getElementById("kioskDisplayTimer");
  const kioskCampEl = document.getElementById("kioskCampaignTitle");

  if (projectorCard) projectorCard.style.display = "block";
  if (codeEl) codeEl.textContent = code;
  if (kioskCodeEl) kioskCodeEl.textContent = code;
  if (kioskCampEl && campaignTitle) kioskCampEl.textContent = campaignTitle;

  if (codeCountdownInterval) clearInterval(codeCountdownInterval);

  const renderTimer = () => {
    const diff = expiresDate.getTime() - Date.now();
    const html = diff <= 0
      ? `<span style="color: #ef4444;">Mã đã hết hạn lúc ${formatDateTime(expiresDate)}</span>`
      : `<span>Còn lại: <strong>${Math.floor(diff / 60000)}m ${Math.floor((diff % 60000) / 1000)}s</strong> (Hết hạn: ${formatDateTime(expiresDate)})</span>`;
    if (timerEl) timerEl.innerHTML = html;
    if (kioskTimerEl) kioskTimerEl.innerHTML = html;
    if (diff <= 0) clearInterval(codeCountdownInterval);
  };

  renderTimer();
  codeCountdownInterval = setInterval(renderTimer, 1000);
}

function copyLiveCode() {
  const code = document.getElementById("liveDisplayCode").textContent;
  if (code && code !== "------") {
    navigator.clipboard.writeText(code);
    showToast(`Đã sao chép mã: ${code}`, "success");
  }
}

async function renderLiveAttendanceList() {
  const select = document.getElementById("codeGenCampaignSelect");
  const campaignId = parseInt(select?.value) || 0;
  const tbody = document.getElementById("liveAttendanceTbody");
  if (!tbody) return;

  if (!campaignId) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: #94a3b8; padding: 20px;">Vui lòng chọn chiến dịch</td></tr>`;
    return;
  }

  const refreshBtn = document.querySelector('#tab-attendance .org-icon-btn');
  if (!tbody.children.length || tbody.querySelector("td[colspan]")) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:16px;color:#94a3b8;">Đang tải dữ liệu điểm danh thực từ DB...</td></tr>`;
  } else {
    tbody.classList.add("is-refreshing");
  }
  if (refreshBtn) refreshBtn.classList.add("is-spinning");

  try {
    const res = await api.get(`/attendances/campaigns/${campaignId}`);
    const attendances = Array.isArray(res.data) ? res.data : [];

    if (attendances.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: #94a3b8; padding: 20px;">Chưa có TNV nào check-in cho ca này</td></tr>`;
      return;
    }

    tbody.innerHTML = attendances.map(a => {
      const volName = a.volunteer_name || a.user_name || a.full_name || "Tình nguyện viên";
      const mins = Number(a.total_minutes || 0);
      const hoursStr = (mins / 60).toFixed(1);
      let statusHtml = `<span class="status-pill status-pending"><span class="status-dot"></span> Chưa điểm danh</span>`;
      if (a.status === "PRESENT") {
        statusHtml = a.check_in_at && !a.check_out_at
          ? `<span class="status-pill status-open"><span class="status-dot"></span> Đang trong ca</span>`
          : `<span class="status-pill status-approved"><span class="status-dot"></span> Có mặt</span>`;
      } else if (a.status === "ABSENT") {
        statusHtml = `<span class="status-pill status-rejected"><span class="status-dot"></span> Vắng mặt</span>`;
      }

      return `
        <tr>
          <td class="td-title">${escapeHtml(volName)}</td>
          <td>
            <div style="font-size: 13px;">Vào: ${a.check_in_at ? formatDateTime(a.check_in_at) : "—"}</div>
            <div class="td-subtitle">Ra: ${a.check_out_at ? formatDateTime(a.check_out_at) : "—"}</div>
          </td>
          <td>
            <strong>${hoursStr}h</strong>
            <div class="td-subtitle">${mins} phút</div>
          </td>
          <td>${statusHtml}</td>
          <td style="text-align: right; color: var(--text-muted); font-size: 12.5px;">—</td>
        </tr>
      `;
    }).join("");
  } catch (err) {
    console.warn("Không thể tải điểm danh từ Backend, dùng DataStore:", err);
    // Fallback về DataStore
    const attendances = DataStore.get(DataStore.STORAGE_KEYS.ATTENDANCES).filter(a => a.campaign_id === campaignId);
    const users = DataStore.getUsers();

    if (attendances.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: #94a3b8; padding: 20px;">Chưa có TNV nào check-in cho ca này</td></tr>`;
      return;
    }

    tbody.innerHTML = attendances.map(a => {
      const user = users.find(u => u.id === a.user_id) || { full_name: "Tình nguyện viên" };
      const mins = Number(a.total_minutes || 0);
      return `
        <tr>
          <td class="td-title">${escapeHtml(user.full_name)}</td>
          <td>
            <div style="font-size: 13px;">Vào: ${a.check_in_at ? formatDateTime(a.check_in_at) : "—"}</div>
            <div class="td-subtitle">Ra: ${a.check_out_at ? formatDateTime(a.check_out_at) : "—"}</div>
          </td>
          <td>
            <strong>${(mins / 60).toFixed(1)}h</strong>
            <div class="td-subtitle">${mins} phút</div>
          </td>
          <td><span class="status-pill status-approved"><span class="status-dot"></span> Có mặt</span></td>
          <td style="text-align: right; color: var(--text-muted); font-size: 12.5px;">—</td>
        </tr>
      `;
    }).join("");
  } finally {
    tbody.classList.remove("is-refreshing");
    if (refreshBtn) refreshBtn.classList.remove("is-spinning");
  }
}

// ================= TAB 4: DUYỆT ĐƠN ĐĂNG KÝ TNV =================
function populateVolunteerCampaignFilter() {
  const select = document.getElementById("volCampaignFilter");
  if (!select) return;
  const prev = select.value;
  const campaigns = getOrgCampaigns();
  select.innerHTML = [
    '<option value="">Tất cả chiến dịch</option>',
    ...campaigns.map(
      (c) => `<option value="${c.id}">${escapeHtml(c.title)} (${c.registered_count || 0}/${c.max_participants} TNV)</option>`
    ),
  ].join("");
  if (prev && campaigns.some((c) => String(c.id) === String(prev))) {
    select.value = prev;
  }
}

function updateVolunteerStatChips(allRegs) {
  const counts = { all: allRegs.length, PENDING: 0, APPROVED: 0, REJECTED: 0 };
  allRegs.forEach((r) => {
    if (counts[r.status] !== undefined) counts[r.status] += 1;
  });
  const map = {
    volCountAll: counts.all,
    volCountPending: counts.PENDING,
    volCountApproved: counts.APPROVED,
    volCountRejected: counts.REJECTED,
  };
  Object.entries(map).forEach(([id, val]) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  });
}

function setVolunteerStatusFilter(status) {
  const select = document.getElementById("volStatusFilter");
  if (select) select.value = status;
  document.querySelectorAll("#volStatChips .org-stat-chip").forEach((chip) => {
    chip.classList.toggle("active", (chip.dataset.volStatus || "") === status);
  });
  clearVolunteerSelection();
  applyVolunteerFilters();
}

function switchVolunteerViewMode(mode) {
  volunteerViewMode = mode === "waitlist" ? "waitlist" : "registrations";
  const isWaitlist = volunteerViewMode === "waitlist";

  document.getElementById("volModeRegistrationsBtn")?.classList.toggle("active", !isWaitlist);
  document.getElementById("volModeWaitlistBtn")?.classList.toggle("active", isWaitlist);

  document.getElementById("volStatChips").hidden = isWaitlist;
  document.getElementById("volStatusFilter").hidden = isWaitlist;
  document.getElementById("volRegistrationsWrap").hidden = isWaitlist;
  document.getElementById("volWaitlistWrap").hidden = !isWaitlist;
  if (isWaitlist) {
    clearVolunteerSelection();
    loadCampaignWaitlist();
  } else {
    applyVolunteerFilters();
  }
}

function onVolunteerCampaignChange() {
  clearVolunteerSelection();
  if (volunteerViewMode === "waitlist") {
    loadCampaignWaitlist();
  } else {
    applyVolunteerFilters();
  }
}

function refreshVolunteerSection() {
  if (volunteerViewMode === "waitlist") {
    loadCampaignWaitlist();
  } else {
    renderVolunteerApplicants(true);
  }
}

async function renderVolunteerApplicants(forceRefresh = false) {
  const tbody = document.getElementById("orgApplicantsTbody");
  if (!tbody) return;

  populateVolunteerCampaignFilter();
  const refreshBtn = document.querySelector("#volRegistrationsWrap .org-icon-btn");
  if (!tbody.children.length || tbody.querySelector("td[colspan]")) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:24px;color:#94a3b8;">Đang tải danh sách đơn đăng ký từ cơ sở dữ liệu...</td></tr>`;
  } else {
    tbody.classList.add("is-refreshing");
  }
  if (refreshBtn) refreshBtn.classList.add("is-spinning");

  let allRegs = [];
  const allCampaigns = getOrgCampaigns();
  const campMap = new Map(allCampaigns.map((c) => [c.id, c]));
  const orgCampaignIds = allCampaigns.map((c) => c.id);

  try {
    if (orgCampaignIds.length > 0) {
      const fetchPromises = orgCampaignIds.map((id) =>
        api.get(`/registrations/campaign/${id}`).then((r) => r.data).catch(() => [])
      );
      const results = await Promise.all(fetchPromises);
      allRegs = results.flat().map((r) => {
        const camp = campMap.get(r.campaign_id);
        return {
          ...r,
          campaign_title: r.campaign_title || camp?.title || `Chiến dịch #${r.campaign_id}`,
        };
      });
    }
  } catch (err) {
    console.warn("Không thể tải đơn đăng ký từ Backend:", err);
    allRegs = DataStore.getRegistrations().filter((r) => orgCampaignIds.includes(r.campaign_id));
  } finally {
    tbody.classList.remove("is-refreshing");
    if (refreshBtn) refreshBtn.classList.remove("is-spinning");
  }

  orgRegistrationsCache = allRegs;
  selectedPendingRegIds.clear();
  updateVolunteerStatChips(allRegs);
  applyVolunteerFilters();
}

function getFilteredVolunteerRegistrations() {
  const query = (document.getElementById("volSearchInput")?.value || "").trim().toLowerCase();
  const campId = document.getElementById("volCampaignFilter")?.value || "";
  const status = document.getElementById("volStatusFilter")?.value || "";

  document.querySelectorAll("#volStatChips .org-stat-chip").forEach((chip) => {
    chip.classList.toggle("active", (chip.dataset.volStatus || "") === status);
  });

  return orgRegistrationsCache.filter((r) => {
    if (campId && String(r.campaign_id) !== String(campId)) return false;
    if (status && r.status !== status) return false;
    if (query) {
      const haystack = [r.user_name, r.full_name, r.user_email, r.email, r.user_phone, r.phone, r.campaign_title]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    return true;
  });
}

function applyVolunteerFilters() {
  const tbody = document.getElementById("orgApplicantsTbody");
  if (!tbody) return;

  const filtered = getFilteredVolunteerRegistrations();
  const campMap = new Map(getOrgCampaigns().map((c) => [c.id, c]));

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: #94a3b8; padding: 36px;">Không có đơn đăng ký nào phù hợp bộ lọc.</td></tr>`;
    updateBulkVolunteerBar();
    return;
  }

  const statusLabel = {
    PENDING: "Chờ duyệt",
    APPROVED: "Đã duyệt",
    REJECTED: "Từ chối",
    CANCELLED: "Đã hủy",
  };

  tbody.innerHTML = filtered.map((r) => {
    const camp = campMap.get(r.campaign_id);
    const slotInfo = camp ? `${camp.registered_count || 0}/${camp.max_participants} TNV` : "--";
    const isPending = r.status === "PENDING";
    const checked = selectedPendingRegIds.has(r.id) ? "checked" : "";

    return `
      <tr>
        <td>
          ${isPending ? `<input type="checkbox" ${checked} aria-label="Chọn đơn #${r.id}" onchange="toggleVolunteerSelection(${r.id}, this.checked)">` : ""}
        </td>
        <td>
          <div class="td-title">${escapeHtml(r.user_name || r.full_name || "TNV")}</div>
          <div class="td-subtitle">${escapeHtml(r.user_email || r.email || "")}${r.user_phone || r.phone ? ` · ${escapeHtml(r.user_phone || r.phone)}` : ""}</div>
        </td>
        <td>
          <div style="font-weight: 600;">${escapeHtml(r.campaign_title || `Chiến dịch #${r.campaign_id}`)}</div>
          <div class="td-subtitle">Chỉ tiêu: ${slotInfo}</div>
        </td>
        <td style="font-size: 13px;">${formatDateTime(r.created_at)}</td>
        <td style="max-width: 220px; font-size: 13px; color: #475569;">
          ${escapeHtml(r.message || "Không có ghi chú")}
        </td>
        <td>
          <span class="status-pill status-${(r.status || "pending").toLowerCase()}">
            <span class="status-dot"></span>
            ${statusLabel[r.status] || escapeHtml(r.status || "")}
          </span>
        </td>
        <td style="text-align: right;">
          <div class="btn-group-sm" style="justify-content: flex-end;">
            ${isPending ? `
              <button class="btn-action btn-action-primary" onclick="approveVolunteerRegistration(${r.id}, ${r.campaign_id})">✓ Duyệt</button>
              <button class="btn-action btn-action-danger" onclick="openRejectRegistrationModal(${r.id}, ${r.campaign_id})">✕ Từ chối</button>
            ` : ""}
            <button class="btn-action" style="color: #64748b;" onclick="openRegistrationDetailModal(${r.id})">Chi tiết</button>
          </div>
        </td>
      </tr>
    `;
  }).join("");

  updateBulkVolunteerBar();
}

function toggleVolunteerSelection(regId, isChecked) {
  if (isChecked) selectedPendingRegIds.add(regId);
  else selectedPendingRegIds.delete(regId);
  updateBulkVolunteerBar();
}

function toggleSelectAllPendingVolunteers(isChecked) {
  const visiblePending = getFilteredVolunteerRegistrations().filter((r) => r.status === "PENDING");
  visiblePending.forEach((r) => {
    if (isChecked) selectedPendingRegIds.add(r.id);
    else selectedPendingRegIds.delete(r.id);
  });
  applyVolunteerFilters();
}

function clearVolunteerSelection() {
  selectedPendingRegIds.clear();
  const selectAll = document.getElementById("volSelectAllFooterCheckbox");
  if (selectAll) {
    selectAll.checked = false;
    selectAll.indeterminate = false;
  }
  updateBulkVolunteerBar();
  document.querySelectorAll('#orgApplicantsTbody input[type="checkbox"]').forEach((cb) => {
    cb.checked = false;
  });
}

function updateBulkVolunteerBar() {
  const bar = document.getElementById("volBulkBar");
  const text = document.getElementById("volBulkCountText");
  const selectAll = document.getElementById("volSelectAllFooterCheckbox");
  const visiblePending = getFilteredVolunteerRegistrations().filter((r) => r.status === "PENDING");
  const selectedVisibleCount = visiblePending.filter((r) => selectedPendingRegIds.has(r.id)).length;

  if (selectAll) {
    selectAll.disabled = visiblePending.length === 0;
    selectAll.checked = visiblePending.length > 0 && selectedVisibleCount === visiblePending.length;
    selectAll.indeterminate = selectedVisibleCount > 0 && selectedVisibleCount < visiblePending.length;
  }

  if (!bar) return;
  if (selectedPendingRegIds.size === 0) {
    bar.hidden = true;
  } else {
    bar.hidden = false;
    if (text) text.textContent = `(Đã chọn ${selectedPendingRegIds.size} đơn)`;
  }
}

function openBulkRejectModal() {
  const targets = orgRegistrationsCache.filter((r) => selectedPendingRegIds.has(r.id) && r.status === "PENDING");
  if (targets.length === 0) return;

  pendingRejectTarget = targets.map((r) => ({ id: r.id, campaign_id: r.campaign_id }));
  const subtitle = document.getElementById("rejectRegSubtitle");
  const input = document.getElementById("rejectRegReasonInput");
  if (subtitle) {
    subtitle.textContent = `Từ chối hàng loạt ${targets.length} đơn đăng ký đã chọn.`;
  }
  if (input) input.value = "";
  openModal("rejectRegistrationModal");
}

async function bulkApproveVolunteers() {
  const targets = orgRegistrationsCache.filter((r) => selectedPendingRegIds.has(r.id) && r.status === "PENDING");
  if (targets.length === 0) return;

  const results = await Promise.allSettled(
    targets.map((r) => api.patch(`/registrations/${r.id}/approve?campaign_id=${r.campaign_id}`))
  );
  const okCount = results.filter((res) => res.status === "fulfilled").length;
  if (okCount > 0) {
    showToast(`Đã duyệt ${okCount}/${targets.length} đơn đăng ký!`, "success");
  } else {
    showToast("Không thể duyệt hàng loạt. Vui lòng kiểm tra kết nối hoặc chỉ tiêu chiến dịch.", "error");
  }
  await loadOrganizerCampaigns();
  await renderVolunteerApplicants(true);
  renderOverview();
  renderCampaignsTable();
}

async function approveVolunteerRegistration(regId, campaignId) {
  try {
    await api.patch(`/registrations/${regId}/approve?campaign_id=${campaignId}`);
    showToast("Đã duyệt tình nguyện viên tham gia chiến dịch!", "success");
  } catch (err) {
    console.warn("Backend approve fallback:", err);
    DataStore.updateRegistrationStatus(regId, "APPROVED");
    showToast("Đã duyệt (lưu cục bộ).", "success");
  }
  closeModal("registrationDetailModal");
  await loadOrganizerCampaigns();
  await renderVolunteerApplicants(true);
  renderOverview();
  renderCampaignsTable();
}

function openRejectRegistrationModal(regId, campaignId) {
  const reg = orgRegistrationsCache.find((r) => r.id === regId);
  pendingRejectTarget = { id: regId, campaign_id: campaignId };
  const subtitle = document.getElementById("rejectRegSubtitle");
  const input = document.getElementById("rejectRegReasonInput");
  if (subtitle) {
    subtitle.textContent = reg
      ? `Tình nguyện viên: ${reg.user_name || reg.full_name || "TNV"} — ${reg.campaign_title || ""}`
      : `Đơn đăng ký #${regId}`;
  }
  if (input) input.value = "";
  closeModal("registrationDetailModal");
  openModal("rejectRegistrationModal");
}

function pickRejectReason(text) {
  const input = document.getElementById("rejectRegReasonInput");
  if (input) input.value = text;
}

async function confirmRejectVolunteerRegistration() {
  if (!pendingRejectTarget) return;
  const reason = (document.getElementById("rejectRegReasonInput")?.value || "").trim();
  if (!reason) {
    showToast("Vui lòng nhập hoặc chọn lý do từ chối!", "error");
    return;
  }

  const targets = Array.isArray(pendingRejectTarget) ? pendingRejectTarget : [pendingRejectTarget];
  const results = await Promise.allSettled(
    targets.map(({ id: regId, campaign_id: campaignId }) =>
      api.patch(`/registrations/${regId}/reject?campaign_id=${campaignId}`, { reason })
    )
  );
  const okCount = results.filter((res) => res.status === "fulfilled").length;

  if (okCount === 0) {
    targets.forEach(({ id: regId }) => DataStore.updateRegistrationStatus(regId, "REJECTED", reason));
    showToast(`Đã từ chối ${targets.length} đơn (lưu cục bộ).`, "warning");
  } else if (targets.length === 1) {
    showToast("Đã từ chối đơn đăng ký.", "warning");
  } else {
    showToast(`Đã từ chối ${okCount}/${targets.length} đơn đăng ký.`, "warning");
  }

  pendingRejectTarget = null;
  closeModal("rejectRegistrationModal");
  await renderVolunteerApplicants(true);
  renderOverview();
}

function openRegistrationDetailModal(regId) {
  const reg = orgRegistrationsCache.find((r) => r.id === regId);
  if (!reg) {
    showToast("Không tìm thấy thông tin đơn đăng ký.", "error");
    return;
  }

  const camp = getOrgCampaigns().find((c) => c.id === reg.campaign_id);
  const body = document.getElementById("regDetailBody");
  const footer = document.getElementById("regDetailFooter");
  const statusLabel = {
    PENDING: "Chờ duyệt",
    APPROVED: "Đã duyệt",
    REJECTED: "Từ chối",
    CANCELLED: "Đã hủy",
  };

  if (body) {
    body.innerHTML = `
      <div class="org-detail-grid">
        <div class="org-detail-item"><label>Tình nguyện viên</label><div>${escapeHtml(reg.user_name || reg.full_name || "TNV")}</div></div>
        <div class="org-detail-item"><label>Trạng thái</label><div><span class="status-pill status-${(reg.status || "pending").toLowerCase()}">${statusLabel[reg.status] || escapeHtml(reg.status || "")}</span></div></div>
        <div class="org-detail-item"><label>Email</label><div>${escapeHtml(reg.user_email || reg.email || "Chưa cập nhật")}</div></div>
        <div class="org-detail-item"><label>Số điện thoại</label><div>${escapeHtml(reg.user_phone || reg.phone || "Chưa cập nhật")}</div></div>
        <div class="org-detail-item"><label>Chiến dịch</label><div>${escapeHtml(reg.campaign_title || `Chiến dịch #${reg.campaign_id}`)}</div></div>
        <div class="org-detail-item"><label>Chỉ tiêu chiến dịch</label><div>${camp ? `${camp.registered_count || 0} / ${camp.max_participants} TNV` : "--"}</div></div>
        <div class="org-detail-item"><label>Thời gian nộp</label><div>${formatDateTime(reg.created_at)}</div></div>
        <div class="org-detail-item"><label>Mã đơn</label><div>REG-${reg.id}</div></div>
      </div>
      <div class="ud-field">
        <label>Lời nhắn từ tình nguyện viên</label>
        <div style="padding: 10px 12px; border-radius: 10px; background: var(--surface-alt); border: 1px solid var(--border); font-size: 0.9rem;">${escapeHtml(reg.message || "Không có ghi chú")}</div>
      </div>
      ${reg.rejection_reason || reg.reason ? `
        <div class="ud-field" style="margin-block-end: 0;">
          <label style="color: #b91c1c;">Lý do từ chối</label>
          <div style="padding: 10px 12px; border-radius: 10px; background: #fef2f2; border: 1px solid #fecaca; color: #991b1b; font-size: 0.9rem;">${escapeHtml(reg.rejection_reason || reg.reason)}</div>
        </div>
      ` : ""}
    `;
  }

  if (footer) {
    footer.innerHTML = reg.status === "PENDING"
      ? `
        <button type="button" class="btn btn-outline" onclick="closeModal('registrationDetailModal')">Đóng</button>
        <button type="button" class="btn" style="background: #fee2e2; color: #b91c1c; border: 1px solid #fecaca;" onclick="openRejectRegistrationModal(${reg.id}, ${reg.campaign_id})">Từ chối</button>
        <button type="button" class="btn btn-primary" onclick="approveVolunteerRegistration(${reg.id}, ${reg.campaign_id})">✓ Duyệt đơn</button>
      `
      : `<button type="button" class="btn btn-outline" onclick="closeModal('registrationDetailModal')">Đóng</button>`;
  }

  openModal("registrationDetailModal");
}

async function loadCampaignWaitlist() {
  const tbody = document.getElementById("orgWaitlistTbody");
  if (!tbody) return;
  const campId = document.getElementById("volCampaignFilter")?.value || "";
  if (!campId) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: #64748b; padding: 32px;">Hãy chọn một chiến dịch ở bộ lọc phía trên để xem Danh sách chờ.</td></tr>`;
    return;
  }

  tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: #94a3b8; padding: 28px;">Đang tải danh sách chờ...</td></tr>`;
  try {
    const res = await api.get(`/waitlist/campaign/${campId}`);
    const entries = Array.isArray(res.data) ? res.data : [];
    if (entries.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: #94a3b8; padding: 32px;">Chưa có tình nguyện viên nào trong danh sách chờ của chiến dịch này.</td></tr>`;
      return;
    }
    const camp = getOrgCampaigns().find((c) => String(c.id) === String(campId));
    tbody.innerHTML = entries.map((e, idx) => `
      <tr>
        <td>
          <div class="td-title">#${idx + 1} · TNV #${e.user_id}</div>
          <div class="td-subtitle">${escapeHtml(e.user_name || e.full_name || "")}</div>
        </td>
        <td>${escapeHtml(camp?.title || `Chiến dịch #${campId}`)}</td>
        <td><span class="status-pill status-pending">${escapeHtml(e.status || "WAITING")}</span></td>
        <td style="font-size: 13px;">${formatDateTime(e.created_at)}</td>
      </tr>
    `).join("");
  } catch (err) {
    const msg = Layout.extractApiErrorMessage(err, "Không thể tải danh sách chờ.");
    tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: #b91c1c; padding: 32px;">${escapeHtml(msg)}</td></tr>`;
  }
}

// ================= TAB 5: CẤP CHỨNG CHỈ & KHIẾU NẠI GIỜ =================
async function renderCertificatesAndClaims() {
  const orgClaimsTbody = document.getElementById("orgClaimsTbody");
  const orgIssuedCertsTbody = document.getElementById("orgIssuedCertsTbody");

  // 1. Nạp danh sách khiếu nại giờ từ Backend (fallback DataStore)
  let claims = [];
  try {
    const res = await api.get("/hour-claims");
    if (Array.isArray(res.data)) {
      claims = res.data;
    }
  } catch (err) {
    console.warn("Không thể tải /hour-claims, dùng DataStore:", err);
    claims = DataStore.get(DataStore.STORAGE_KEYS.CLAIMS) || [];
  }

  if (orgClaimsTbody) {
    if (claims.length === 0) {
      orgClaimsTbody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: #94a3b8; padding: 20px;">Không có yêu cầu khiếu nại giờ nào</td></tr>`;
    } else {
      orgClaimsTbody.innerHTML = claims.map(cl => {
        const volLabel = cl.user_name || `TNV #${cl.user_id || cl.registration_id}`;
        const campLabel = cl.campaign_title || `Đơn ĐK #${cl.registration_id}`;
        const hoursVal = cl.claimed_hours ?? cl.actual_hours ?? 0;
        const noteText = cl.note ? `<div class="td-subtitle">${escapeHtml(cl.note)}</div>` : "";
        return `
          <tr>
            <td>
              <div class="td-title">${escapeHtml(volLabel)}</div>
              <div class="td-subtitle">${escapeHtml(campLabel)}</div>
              ${noteText}
            </td>
            <td><strong>+${hoursVal} giờ</strong></td>
            <td>
              ${cl.evidence_url ? `<a href="${escapeHtml(cl.evidence_url)}" target="_blank" rel="noopener noreferrer" style="color: var(--primary); font-size: 12px; font-weight: 600;">Xem minh chứng ↗</a>` : "—"}
            </td>
            <td style="text-align: right;">
              ${cl.status === "PENDING" ? `
                <div class="btn-group-sm" style="justify-content: flex-end;">
                  <button type="button" class="btn-action btn-action-primary" onclick="verifyHourClaim(${cl.id}, ${Number(hoursVal)})">Xác nhận</button>
                  <button type="button" class="btn-action btn-action-danger" onclick="rejectHourClaim(${cl.id})">Từ chối</button>
                </div>
              ` : `<span class="status-pill status-${String(cl.status).toLowerCase()}">${escapeHtml(cl.status)}</span>`}
            </td>
          </tr>
        `;
      }).join("");
    }
  }

  // Render Certificates
  const certs = DataStore.getCertificates();
  if (orgIssuedCertsTbody) {
    let certs;
    try {
      certs = (await api.get("/certificates/issued")).data;
    } catch {
      orgIssuedCertsTbody.innerHTML = '<tr><td colspan="4">Không thể tải chứng nhận.</td></tr>';
      return;
    }
    if (certs.length === 0) {
      orgIssuedCertsTbody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: #94a3b8; padding: 20px;">Chưa phát hành chứng chỉ nào</td></tr>`;
    } else {
      orgIssuedCertsTbody.innerHTML = certs.map(c => `
        <tr>
          <td><span class="cert-code" style="margin: 0;">${escapeHtml(c.certificate_code)}</span></td>
          <td class="td-title">${escapeHtml(c.campaign_title)}</td>
          <td><strong>${c.total_hours}h</strong></td>
          <td>${formatDateTime(c.issued_at)}</td>
        </tr>
      `).join("");
    }
  }
}

async function verifyHourClaim(claimId, approvedHours) {
  try {
    const payload = { status: "VERIFIED" };
    if (approvedHours && approvedHours > 0) payload.approved_hours = approvedHours;
    await api.patch(`/hour-claims/${claimId}/review`, payload);
    showToast("Đã xác nhận cộng giờ cống hiến cho tình nguyện viên!", "success");
    await renderCertificatesAndClaims();
    loadOrganizerStats();
    return;
  } catch (err) {
    console.warn("Fallback DataStore cho verifyHourClaim:", err);
  }

  const claims = DataStore.get(DataStore.STORAGE_KEYS.CLAIMS) || [];
  const cl = claims.find(c => c.id === claimId);
  if (cl) {
    cl.status = "VERIFIED";
    cl.verified_by = currentUser.id;
    DataStore.set(DataStore.STORAGE_KEYS.CLAIMS, claims);
    showToast("Đã xác nhận cộng giờ cống hiến (cục bộ)!", "success");
    renderCertificatesAndClaims();
  }
}

let pendingRejectClaimId = null;

function rejectHourClaim(claimId) {
  pendingRejectClaimId = claimId;
  const input = document.getElementById("rejectClaimReasonInput");
  if (input) {
    input.value = "Minh chứng chưa đủ căn cứ.";
  }
  openModal("rejectClaimModal");
  if (input) input.focus();
}

async function confirmRejectHourClaim() {
  if (!pendingRejectClaimId) return;
  const claimId = pendingRejectClaimId;
  const input = document.getElementById("rejectClaimReasonInput");
  const reason = (input?.value || "").trim() || "Không đạt điều kiện xác nhận";
  const btn = document.getElementById("confirmRejectClaimBtn");
  if (btn) btn.disabled = true;

  try {
    await api.patch(`/hour-claims/${claimId}/review`, {
      status: "REJECTED",
      rejection_reason: reason
    });
    closeModal("rejectClaimModal");
    pendingRejectClaimId = null;
    showToast("Đã từ chối yêu cầu khiếu nại giờ.", "warning");
    await renderCertificatesAndClaims();
    return;
  } catch (err) {
    console.warn("Fallback DataStore cho rejectHourClaim:", err);
  } finally {
    if (btn) btn.disabled = false;
  }

  const claims = DataStore.get(DataStore.STORAGE_KEYS.CLAIMS) || [];
  const cl = claims.find(c => c.id === claimId);
  if (cl) {
    cl.status = "REJECTED";
    DataStore.set(DataStore.STORAGE_KEYS.CLAIMS, claims);
    closeModal("rejectClaimModal");
    pendingRejectClaimId = null;
    showToast("Đã từ chối khiếu nại giờ (cục bộ).", "warning");
    renderCertificatesAndClaims();
  }
}

function openIssueCertModal() {
  const campSelect = document.getElementById("certCampaignSelect");
  const volSelect = document.getElementById("certVolunteerSelect");

  const myCampaigns = DataStore.getCampaigns().filter(c => c.organization_id === currentOrg.id || c.organization_name === currentOrg.name);
  const myUsers = DataStore.getUsers().filter(u => u.role === "USER");

  campSelect.innerHTML = myCampaigns.map(c => `<option value="${c.id}">${escapeHtml(c.title)}</option>`).join("");
  volSelect.innerHTML = myUsers.map(u => `<option value="${u.id}">${escapeHtml(u.full_name)} (${u.email})</option>`).join("");

  openModal("issueCertModal");
}

function submitIssueCertificate() {
  const campSelect = document.getElementById("certCampaignSelect");
  const volSelect = document.getElementById("certVolunteerSelect");
  const hours = parseFloat(document.getElementById("certHoursInput").value);

  const campaignId = parseInt(campSelect.value);
  const userId = parseInt(volSelect.value);
  const camp = DataStore.getCampaigns().find(c => c.id === campaignId);

  const certs = DataStore.getCertificates();
  const certNumber = Math.floor(1000 + Math.random() * 9000);
  const newCert = {
    id: Date.now(),
    certificate_code: `VL-2026-CERT${certNumber}`,
    user_id: userId,
    campaign_id: campaignId,
    campaign_title: camp ? camp.title : "Chiến dịch tình nguyện",
    total_hours: hours,
    issued_at: new Date().toISOString(),
    status: "ACTIVE",
    revoked_reason: null
  };

  certs.unshift(newCert);
  DataStore.set(DataStore.STORAGE_KEYS.CERTIFICATES, certs);

  closeModal("issueCertModal");
  showToast(`Đã phát hành chứng chỉ: ${newCert.certificate_code}`, "success");
  renderCertificatesAndClaims();
}

// ================= TAB 6: HỒ SƠ TỔ CHỨC =================
function setupOrgProfileForm() {
  document.getElementById("orgFormName").value = currentOrg.name || "";
  document.getElementById("orgFormEmail").value = currentOrg.email || "";
  document.getElementById("orgFormPhone").value = currentOrg.phone || "";
  document.getElementById("orgFormAddress").value = currentOrg.address || "";
  document.getElementById("orgFormDocUrl").value = currentOrg.document_url || "";
  document.getElementById("orgFormDesc").value = currentOrg.description || "";

  const avatarEl = document.getElementById("orgAccountAvatarBig");
  if (avatarEl && !avatarEl.dataset.previewBound) {
    avatarEl.dataset.previewBound = "1";
    const openPreview = () => openAvatarPreviewModal(currentUser?.avatar_url, currentUser?.full_name);
    avatarEl.addEventListener("click", openPreview);
    avatarEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openPreview();
      }
    });
  }

  const avatarInput = document.getElementById("orgAvatarFileInput");
  if (avatarInput && !avatarInput.dataset.bound) {
    avatarInput.dataset.bound = "1";
    avatarInput.addEventListener("change", async () => {
      const file = avatarInput.files?.[0];
      if (!file) return;
      try {
        const updated = await uploadAvatarFile(file);
        if (updated) {
          currentUser.avatar_url = updated.avatar_url || null;
          localStorage.setItem("auth_user", JSON.stringify(currentUser));
          setupOrganizerHeader();
          showToast("Đã cập nhật ảnh đại diện.", "success");
        }
      } catch (error) {
        const detail = error?.response?.data?.detail;
        const msg = typeof detail === "string" ? detail : (error?.message || "Tải ảnh đại diện thất bại.");
        showToast(msg, "error");
      } finally {
        avatarInput.value = "";
      }
    });
  }
}

function saveOrgProfile() {
  currentOrg.name = document.getElementById("orgFormName").value.trim();
  currentOrg.phone = document.getElementById("orgFormPhone").value.trim();
  currentOrg.address = document.getElementById("orgFormAddress").value.trim();
  currentOrg.document_url = document.getElementById("orgFormDocUrl").value.trim();
  currentOrg.description = document.getElementById("orgFormDesc").value.trim();

  const orgs = DataStore.getOrganizations();
  const index = orgs.findIndex(o => o.id === currentOrg.id);
  if (index !== -1) {
    orgs[index] = { ...currentOrg, updated_at: new Date().toISOString() };
    DataStore.set(DataStore.STORAGE_KEYS.ORGS, orgs);
  }

  setupOrganizerHeader();
  showToast("Đã lưu thông tin hồ sơ tổ chức!", "success");
}

// Modal helpers
function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.add("open");
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.remove("open");
  if (modalId === "createCampaignModal") {
    activeDetailCampaignId = null;
    campaignInitialSnapshot = null;
    isCampaignEditing = false;
    toggleCancelCampaignBox(false);
  }
}

