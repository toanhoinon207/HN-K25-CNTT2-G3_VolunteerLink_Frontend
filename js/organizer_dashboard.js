/**
 * Logic điều khiển Bảng điều khiển Nhà tổ chức (Role: ORGANIZER)
 * Tích hợp Backend API: /auth/me, /campaigns, /campaigns/{id}/submit, /api/attendances/code
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
  setupCampaignImagePreview();
  setupOverviewFilters();
  if (typeof Layout !== "undefined" && typeof Layout.initNotificationBell === "function") {
    Layout.initNotificationBell(currentUser.role || "ORGANIZER");
  }
  setupMobileMenu();

  // Gắn sự kiện đăng xuất sớm để luôn hoạt động kể cả khi dữ liệu tab chưa tải xong
  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
      if (await Auth.confirmLogout()) Auth.logout();
    });
  }

  // 5. Nạp dữ liệu các thành phần
  renderOverview();
  loadOrganizerStats();
  renderCampaignsTable();
  setupAttendanceGenerator();
  renderVolunteerApplicants();
  loadCampaignWaitlist();
  renderCertificatesAndClaims();
  setupOrgProfileForm();

  // Áp dụng ?campaign_id= nếu điều hướng từ trang chi tiết chiến dịch
  const urlCampaignId = new URLSearchParams(window.location.search).get("campaign_id");
  if (urlCampaignId) {
    const volFilter = document.getElementById("volCampaignFilter");
    if (volFilter && Array.from(volFilter.options).some((o) => o.value === urlCampaignId)) {
      volFilter.value = urlCampaignId;
      onVolunteerCampaignChange();
    }
    const attSelect = document.getElementById("codeGenCampaignSelect");
    if (attSelect && Array.from(attSelect.options).some((o) => o.value === urlCampaignId)) {
      attSelect.value = urlCampaignId;
      renderLiveAttendanceList();
    }
  }
});

async function loadOrganizerCampaigns() {
  try {
    const res = await api.get("/campaigns/mine");
    if (Array.isArray(res.data)) {
      orgCampaigns = res.data;
      orgCampaignsLoaded = true;
      return;
    }
    orgCampaigns = [];
    orgCampaignsLoaded = false;
  } catch (error) {
    orgCampaigns = [];
    orgCampaignsLoaded = false;
    showToast(Layout.extractApiErrorMessage(error, "Không thể tải danh sách chiến dịch."), "error");
  }
}

function getOrgCampaigns() {
  return orgCampaigns;
}

function upsertOrgCampaign(campaign) {
  if (!campaign) return;
  const idx = orgCampaigns.findIndex((c) => c.id === campaign.id);
  if (idx >= 0) {
    orgCampaigns[idx] = { ...orgCampaigns[idx], ...campaign };
  } else {
    orgCampaigns.unshift(campaign);
  }
}

async function loadCurrentOrganization() {
  try {
    const res = await api.get("/organizations/me");
    currentOrg = res.data && res.data.id ? res.data : null;
  } catch (err) {
    currentOrg = null;
    if (err.response?.status !== 404) {
      showToast(Layout.extractApiErrorMessage(err, "Không thể tải thông tin tổ chức."), "error");
    }
  }

  renderOrgStatusBanner();
}

function renderOrgStatusBanner() {
  if (!currentOrg) return;
  const badgeEl = document.getElementById("orgVerificationBadge");
  const alertEl = document.getElementById("orgStatusAlertBanner");
  if (!badgeEl || !alertEl) return;

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
  const orgName = currentOrg?.name || "Chưa có hồ sơ tổ chức";

  const userNameEl = document.getElementById("headerUserName");
  if (userNameEl) userNameEl.textContent = fullName;
  renderAvatarElement(document.getElementById("headerAvatar"), currentUser.avatar_url, fullName);
  renderAvatarElement(document.getElementById("orgAccountAvatarBig"), currentUser.avatar_url, fullName);
  const nameEl = document.getElementById("orgAccountNameDisplay");
  if (nameEl) nameEl.textContent = fullName;
  const headerOrgEl = document.getElementById("headerOrgName");
  if (headerOrgEl) headerOrgEl.textContent = orgName;
  const overviewOrgEl = document.getElementById("overviewOrgTitle");
  if (overviewOrgEl) overviewOrgEl.textContent = orgName;
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

  const rawTab = new URLSearchParams(window.location.search).get("tab");
  const tabAlias = { registrations: "volunteers", hours: "certificates" };
  const initialTab = tabAlias[rawTab] || rawTab;
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
  const allApplicants = orgRegistrationsCache;
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
  const activeCamp = allCampaigns.find(c => Layout.getCampaignDisplayStatus(c) === "IN_PROGRESS") ||
    allCampaigns.find(c => Layout.getCampaignDisplayStatus(c) === "REGISTRATION_OPEN") || allCampaigns[0];

  if (!activeCamp) {
    bannerEl.innerHTML = `<div class="org-empty-inline">Chưa có chiến dịch nào. Hãy tạo chiến dịch mới!</div>`;
    return;
  }

  const registered = Number(activeCamp.registered_count || 0);
  const maxPart = Math.max(1, Number(activeCamp.max_participants || 1));
  const pct = Math.min(100, Math.round((registered / maxPart) * 100));
  const resolvedThumb = typeof resolveBackendAssetUrl === "function"
    ? resolveBackendAssetUrl(activeCamp.image_url)
    : (isSafeHttpUrl(activeCamp.image_url) ? activeCamp.image_url : null);
  const thumbHtml = resolvedThumb
    ? `<img class="org-spotlight-thumb" src="${escapeHtml(resolvedThumb)}" alt="${escapeHtml(activeCamp.title)}" onerror="this.style.display='none'">`
    : "";

  bannerEl.innerHTML = `
    <div class="org-spotlight-card">
      <div class="org-spotlight-top">
        ${thumbHtml}
        <div class="org-spotlight-info">
          <span class="status-pill status-${String(activeCamp.status || "OPEN").toLowerCase()}">${escapeHtml(Layout.getCampaignStatusInfo(activeCamp).label)}</span>
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
  const grid = document.getElementById("orgCampaignsGrid");
  const template = document.getElementById("org-campaign-card-template");
  const emptyEl = document.getElementById("orgCampaignsEmptyState");
  if (!grid || !template) return;

  grid.innerHTML = "";

  if (allCampaigns.length === 0) {
    if (emptyEl) {
      emptyEl.style.display = "block";
      emptyEl.textContent = "Chưa có chiến dịch nào được tạo.";
    }
    return;
  }
  if (emptyEl) emptyEl.style.display = "none";

  const fragment = document.createDocumentFragment();
  allCampaigns.forEach((c) => {
    const campForCard = {
      ...c,
      organization: c.organization || { name: currentOrg?.name || currentUser?.full_name || "Tổ chức của bạn" },
    };
    const cardFrag = Layout.createCampaignCard(campForCard, template);
    const cardEl = cardFrag.querySelector(".campaign-card");
    if (!cardEl) return;

    cardEl.dataset.status = c.status || "";
    const slotsEl = cardEl.querySelector(".card-slots");
    if (slotsEl) {
      slotsEl.textContent = `${c.registered_count || 0} / ${c.max_participants} TNV (${c.estimated_hours || 0} giờ)`;
    }
    const startEl = cardEl.querySelector(".card-start-time");
    if (startEl) {
      startEl.textContent = formatDateTime(c.start_time);
    }

    const reasonEl = cardEl.querySelector(".org-card-reason");
    if (reasonEl && c.reason) {
      reasonEl.textContent = `Góp ý: ${c.reason}`;
      reasonEl.hidden = false;
    }

    const openDetailHandler = (e) => {
      e.preventDefault();
      openCampaignDetailModal(c.id);
    };
    const titleLinkEl = cardEl.querySelector(".card-title-link");
    if (titleLinkEl) titleLinkEl.addEventListener("click", openDetailHandler);
    const detailBtnEl = cardEl.querySelector(".card-detail-btn");
    if (detailBtnEl) detailBtnEl.addEventListener("click", openDetailHandler);

    fragment.appendChild(cardFrag);
  });

  grid.appendChild(fragment);
  filterOrgCampaigns();
}

function filterOrgCampaigns() {
  const query = (document.getElementById("orgCampaignSearch")?.value || "").trim().toLowerCase();
  const status = document.getElementById("orgCampaignStatusFilter")?.value || "ALL";
  const cards = document.querySelectorAll("#orgCampaignsGrid .campaign-card[data-status]");

  let visibleCount = 0;
  cards.forEach((card) => {
    const text = card.textContent.toLowerCase();
    const cardStatus = card.dataset.status || "";
    const matchesQuery = !query || text.includes(query);
    const matchesStatus = status === "ALL" || !status || cardStatus === status;
    const isVisible = matchesQuery && matchesStatus;
    card.style.display = isVisible ? "" : "none";
    if (isVisible) visibleCount += 1;
  });

  const emptyEl = document.getElementById("orgCampaignsEmptyState");
  if (emptyEl && cards.length > 0) {
    if (visibleCount === 0) {
      emptyEl.style.display = "block";
      emptyEl.textContent = "Không có chiến dịch nào phù hợp bộ lọc.";
    } else {
      emptyEl.style.display = "none";
    }
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
  const d = typeof parseApiDate === "function" ? parseApiDate(value) : new Date(value);
  if (!d || Number.isNaN(d.getTime())) return "";
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
  const dayAfterTomorrow = new Date(now.getTime() + 48 * 60 * 60 * 1000);

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
  document.getElementById("newCampStart").value = toDatetimeLocalValue(dayAfterTomorrow);
  document.getElementById("newCampEnd").value = toDatetimeLocalValue(new Date(dayAfterTomorrow.getTime() + 4 * 3600000));
  document.getElementById("newCampDeadline").value = toDatetimeLocalValue(tomorrow);
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
  const displayStatus = Layout.getCampaignDisplayStatus(camp);
  const st = ({
    IN_PROGRESS: { label: "Đang diễn ra", class: "status-open" },
    REGISTRATION_CLOSED: { label: "Đã đóng đăng ký", class: "status-closed" },
    REGISTRATION_OPEN: { label: "Đang mở đăng ký", class: "status-open" },
  })[displayStatus] || CAMPAIGN_STATUS_META[displayStatus] || { label: displayStatus, class: "status-draft" };
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

  const normalizeLocalInput = (val) => {
    const raw = String(val || "").trim();
    if (!raw) return raw;
    if (/(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw)) return raw;
    return (raw.length === 16 ? `${raw}:00` : raw) + "+07:00";
  };

  return {
    title,
    image_url: imageUrl || null,
    category,
    location,
    start_time: normalizeLocalInput(startTime),
    end_time: normalizeLocalInput(endTime),
    registration_deadline: normalizeLocalInput(deadline),
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
    const msg = Layout.extractApiErrorMessage(error, "Không thể tạo chiến dịch.");
    showToast(msg, "error");
    return;
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
    const msg = Layout.extractApiErrorMessage(error, "Không thể gửi duyệt chiến dịch.");
    showToast(msg, "error");
  }
}

// ================= TAB 3: ATTENDANCE STATION =================
function setupAttendanceGenerator() {
  const select = document.getElementById("codeGenCampaignSelect");
  const genBtn = document.getElementById("btnGenerateAttendanceCode");
  if (!select) return;

  const allCampaigns = getOrgCampaigns();
  select.innerHTML = allCampaigns.filter(c => ["OPEN", "CLOSED"].includes(c.status)).map(c => 
    `<option value="${c.id}">${escapeHtml(c.title)} (${escapeHtml(Layout.getCampaignStatusInfo(c).label)})</option>`
  ).join("");

  // Khi đổi chiến dịch → reload danh sách điểm danh từ DB
  if (!select.dataset.bound) {
    select.dataset.bound = "1";
    select.addEventListener("change", () => {
      renderLiveAttendanceList();
      restoreAttendanceCode();
    });
  }

  if (genBtn && !genBtn.dataset.bound) {
    genBtn.dataset.bound = "1";
    genBtn.addEventListener("click", generateAttendanceCode);
  }
  renderLiveAttendanceList();
  restoreAttendanceCode();
}

function quickOpenAttendance(campaignId) {
  switchOrgTab("attendance");
  const select = document.getElementById("codeGenCampaignSelect");
  if (select) select.value = campaignId;
  restoreAttendanceCode();
}

async function generateAttendanceCode() {
  const select = document.getElementById("codeGenCampaignSelect");
  const expiresSelect = document.getElementById("codeGenExpiresSelect");
  const codeType = document.getElementById("codeGenTypeSelect")?.value || "CHECK_IN";
  const campaignId = parseInt(select.value);
  const expiresMinutes = parseInt(expiresSelect.value);

  if (!campaignId) {
    showToast("Chưa có chiến dịch đang mở để phát mã!", "error");
    return;
  }

  const camp = getOrgCampaigns().find(c => c.id === campaignId && ["OPEN", "CLOSED"].includes(c.status));
  if (!camp) {
    showToast("Chỉ có thể phát mã cho chiến dịch đang hoạt động (OPEN/CLOSED).", "warning");
    return;
  }

  let generatedCode = null;
  let expiresAt = null;

  try {
    // 1. Gọi trực tiếp FastAPI Backend: POST /api/attendances/code
    const response = await api.post("/attendances/code", {
      campaign_id: campaignId,
      expires_minutes: expiresMinutes,
      code_type: codeType
    });

    generatedCode = response.data.code;
    expiresAt = response.data.expires_at;
  } catch (error) {
    const msg = Layout.extractApiErrorMessage(error, "Không thể tạo mã điểm danh từ máy chủ.");
    showToast(msg, "error");
    return;
  }

  // Cập nhật chiến dịch
  camp.attendance_code = generatedCode;
  camp.attendance_code_expires_at = expiresAt;
  camp.attendance_code_type = codeType;

  // Hiển thị trên Projector Card & mở Kiosk Modal (Hướng 2)
  // BE lưu datetime theo giờ Việt Nam nhưng response không kèm timezone.
  const expiryWithTimezone = /(?:Z|[+-]\d{2}:\d{2})$/.test(expiresAt)
    ? expiresAt : `${expiresAt}+07:00`;
  displayLiveCode(generatedCode, new Date(expiryWithTimezone), `${camp.title} — ${codeType}`, codeType);
  openModal("attendanceCodeModal");
  await restoreAttendanceCode();
}

async function restoreAttendanceCode() {
  const campaignId = Number(document.getElementById("codeGenCampaignSelect")?.value);
  const projector = document.getElementById("projectorCard");
  if (!projector) return;
  if (codeCountdownInterval) clearInterval(codeCountdownInterval);
  projector.style.display = "none";
  const codeEl = document.getElementById("liveDisplayCode");
  if (codeEl) codeEl.textContent = "------";
  let history = document.getElementById("attendanceCodeAuditHistory");
  if (!history) {
    history = document.createElement("div");
    history.id = "attendanceCodeAuditHistory";
    history.style.cssText = "margin: 12px 0; padding: 12px; border:1px solid #cbd5e1; border-radius:8px";
    projector.parentElement.appendChild(history);
  }
  if (!campaignId) { history.textContent = "Hãy chọn chiến dịch để xem lịch sử mã."; return; }
  // Prevent a slower response from overwriting a newly selected campaign.
  const requestId = String(campaignId);
  history.textContent = "Đang tải mã điểm danh từ máy chủ...";
  try {
    const [current, historyResponse] = await Promise.all([
      api.get(`/attendances/campaigns/${campaignId}/code/current`),
      api.get(`/attendances/campaigns/${campaignId}/code/history`),
    ]);
    if (String(document.getElementById("codeGenCampaignSelect")?.value) !== requestId) return;
    const code = current.data;
    const rows = Array.isArray(historyResponse.data) ? historyResponse.data : [];
    if (code?.code) {
      const when = String(code.expires_at);
      const expiry = new Date(/(?:Z|[+-]\d{2}:?\d{2})$/.test(when) ? when : `${when}+07:00`);
      const title = getOrgCampaigns().find(c => c.id === campaignId)?.title || `Chiến dịch #${campaignId}`;
      displayLiveCode(code.code, expiry, `${title} — ${code.code_type}`, code.code_type);
    }
    history.innerHTML = "";
    const heading = document.createElement("strong");
    heading.textContent = `Lịch sử cấp mã (${rows.length} lần gần nhất)`;
    history.appendChild(heading);
    if (!rows.length) {
      const empty = document.createElement("p");
      empty.textContent = "Chưa từng phát mã điểm danh.";
      history.appendChild(empty);
    }
    for (const item of rows) {
      const line = document.createElement("p");
      line.style.cssText = "margin: 8px 0; font-size: 13px; overflow-wrap:anywhere";
      line.textContent = `#${item.id} | ${item.code_type} | ${item.code} | Cấp: ${item.issued_at} | Hết hạn: ${item.expires_at} | ${item.is_active ? "ĐANG HIỆU LỰC" : item.is_current ? "ĐÃ HẾT HẠN" : "MÃ CŨ"} | Người cấp ID: ${item.issued_by}`;
      history.appendChild(line);
    }
  } catch (error) {
    history.textContent = Layout.extractApiErrorMessage(error, "Không thể tải mã/lịch sử điểm danh từ Backend.");
  }
}

function displayLiveCode(code, expiresDate, campaignTitle, codeType) {
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
    if (diff <= 0) {
      clearInterval(codeCountdownInterval);
      if (codeType === "CHECK_OUT") {
        // Tác vụ BE chạy định kỳ (30s); tải lại trạng thái từ API sau một chu kỳ.
        setTimeout(async () => {
          await loadOrganizerCampaigns();
          refreshCampaignViews();
        }, 35000);
      }
    }
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

async function renderLiveAttendanceList(manual = false) {
  const select = document.getElementById("codeGenCampaignSelect");
  const campaignId = parseInt(select?.value) || 0;
  const tbody = document.getElementById("liveAttendanceTbody");
  if (!tbody) return;

  if (!campaignId) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: #94a3b8; padding: 20px;">Vui lòng chọn chiến dịch</td></tr>`;
    return;
  }

  const refreshBtn = document.querySelector('#tab-attendance .org-icon-btn');
  const startedAt = Date.now();
  if (!tbody.children.length || tbody.querySelector("td[colspan]")) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:16px;color:#94a3b8;">Đang tải dữ liệu điểm danh thực từ DB...</td></tr>`;
  } else {
    tbody.classList.add("is-refreshing");
  }
  setRefreshSpin(refreshBtn, true);

  try {
    const res = await api.get(`/attendances/campaigns/${campaignId}`);
    if (manual) await waitMinSpin(startedAt);
    const attendances = Array.isArray(res.data) ? res.data : [];

    if (attendances.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: #94a3b8; padding: 20px;">Chưa có TNV nào check-in cho ca này</td></tr>`;
      if (manual) showToast("Đã cập nhật danh sách điểm danh.", "success");
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

      const actionsHtml = !a.attendance_id
        ? `<button type="button" class="btn btn-primary btn-sm" onclick="manualMarkAttendance(${campaignId}, ${Number(a.registration_id)}, 'PRESENT')">Có mặt</button>
           <button type="button" class="btn btn-outline btn-sm" style="color:#b91c1c;border-color:#fecaca;" onclick="manualMarkAttendance(${campaignId}, ${Number(a.registration_id)}, 'ABSENT')">Vắng</button>`
        : `<button type="button" class="btn btn-outline btn-sm" onclick="promptEditAttendanceTime(${Number(a.attendance_id)})">Sửa giờ</button>
           <button type="button" class="btn btn-outline btn-sm" onclick="toggleAttendanceStatus(${Number(a.attendance_id)}, '${a.status === "PRESENT" ? "ABSENT" : "PRESENT"}')">${a.status === "PRESENT" ? "Đánh vắng" : "Đánh có mặt"}</button>`;

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
          <td style="text-align: right; white-space: nowrap;">${actionsHtml}</td>
        </tr>
      `;
    }).join("");
    if (manual) showToast("Đã cập nhật danh sách điểm danh.", "success");
  } catch (err) {
    const msg = Layout.extractApiErrorMessage(err, "Không thể tải danh sách điểm danh.");
    tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: #ef4444; padding: 20px;">${escapeHtml(msg)}</td></tr>`;
    if (manual) showToast(msg, "error");
  } finally {
    tbody.classList.remove("is-refreshing");
    setRefreshSpin(refreshBtn, false);
  }
}

async function manualMarkAttendance(campaignId, registrationId, status) {
  try {
    await api.post(`/attendances/campaigns/${campaignId}/manual`, {
      registration_id: registrationId,
      status,
    });
    showToast(`Đã ghi nhận ${status === "PRESENT" ? "Có mặt" : "Vắng mặt"}.`, "success");
    await renderLiveAttendanceList();
  } catch (err) {
    showToast(Layout.extractApiErrorMessage(err, "Không thể điểm danh thủ công."), "error");
  }
}

async function toggleAttendanceStatus(attendanceId, nextStatus) {
  const reason = window.prompt(`Nhập lý do chuyển sang ${nextStatus === "PRESENT" ? "Có mặt" : "Vắng mặt"}:`, "Organizer cập nhật thủ công");
  if (reason === null) return;
  if (!reason.trim()) {
    showToast("Vui lòng nhập lý do.", "warning");
    return;
  }
  try {
    await api.patch(`/attendances/${attendanceId}/status`, {
      status: nextStatus,
      reason: reason.trim(),
    });
    showToast("Đã cập nhật trạng thái điểm danh.", "success");
    await renderLiveAttendanceList();
  } catch (err) {
    showToast(Layout.extractApiErrorMessage(err, "Không thể cập nhật trạng thái."), "error");
  }
}

async function promptEditAttendanceTime(attendanceId) {
  const checkInStr = window.prompt("Nhập giờ Check-in (YYYY-MM-DD HH:MM, bỏ trống để giữ nguyên):");
  if (checkInStr === null) return;
  const checkOutStr = window.prompt("Nhập giờ Check-out (YYYY-MM-DD HH:MM, bỏ trống để giữ nguyên):");
  if (checkOutStr === null) return;
  const reason = window.prompt("Nhập lý do điều chỉnh giờ:", "Organizer bổ sung giờ check-in/check-out");
  if (reason === null || !reason.trim()) return;

  const payload = { reason: reason.trim() };
  if (checkInStr.trim()) payload.check_in_at = checkInStr.trim().replace(" ", "T");
  if (checkOutStr.trim()) payload.check_out_at = checkOutStr.trim().replace(" ", "T");
  try {
    await api.patch(`/attendances/${attendanceId}/time`, payload);
    showToast("Đã cập nhật thời gian điểm danh.", "success");
    await renderLiveAttendanceList();
  } catch (err) {
    showToast(Layout.extractApiErrorMessage(err, "Không thể cập nhật thời gian điểm danh."), "error");
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const fileBtn = document.getElementById("newCampImageFileBtn");
  const fileInput = document.getElementById("newCampImageFile");
  const urlInput = document.getElementById("newCampImageUrl");
  if (fileBtn && fileInput) {
    fileBtn.addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", async () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      fileBtn.disabled = true;
      fileBtn.textContent = "Đang tải...";
      try {
        const formData = new FormData();
        formData.append("file", file);
        const res = await api.post("/campaigns/upload-image", formData, {
          headers: { "Content-Type": "multipart/form-data" },
        });
        const uploadedUrl = res.data?.image_url || "";
        if (urlInput) urlInput.value = uploadedUrl;
        if (typeof updateCampaignImagePreview === "function") {
          updateCampaignImagePreview(uploadedUrl);
        }
        showToast("Đã tải ảnh chiến dịch lên thành công!", "success");
      } catch (err) {
        showToast(Layout.extractApiErrorMessage(err, "Tải ảnh chiến dịch thất bại."), "error");
      } finally {
        fileBtn.disabled = false;
        fileBtn.textContent = "Chọn ảnh";
        fileInput.value = "";
      }
    });
  }
});

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

function refreshVolunteerSection(manual = false) {
  if (volunteerViewMode === "waitlist") {
    loadCampaignWaitlist(manual);
  } else {
    renderVolunteerApplicants(true, manual);
  }
}

async function renderVolunteerApplicants(forceRefresh = false, manual = false) {
  const tbody = document.getElementById("orgApplicantsTbody");
  if (!tbody) return;

  populateVolunteerCampaignFilter();
  const refreshBtn = document.querySelector("#volRegistrationsWrap .org-icon-btn");
  const startedAt = Date.now();
  if (!tbody.children.length || tbody.querySelector("td[colspan]")) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:24px;color:#94a3b8;">Đang tải danh sách đơn đăng ký từ cơ sở dữ liệu...</td></tr>`;
  } else {
    tbody.classList.add("is-refreshing");
  }
  setRefreshSpin(refreshBtn, true);

  let allRegs = [];
  const allCampaigns = getOrgCampaigns();
  const campMap = new Map(allCampaigns.map((c) => [c.id, c]));
  const orgCampaignIds = allCampaigns.map((c) => c.id);

  try {
    if (orgCampaignIds.length > 0) {
      const fetchPromises = orgCampaignIds.map((id) =>
        api.get(`/registrations/campaign/${id}`).then((r) => r.data).catch((error) => { throw error; })
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
    if (manual) {
      await waitMinSpin(startedAt);
      showToast("Đã cập nhật danh sách đơn đăng ký.", "success");
    }
  } catch (err) {
    showToast(Layout.extractApiErrorMessage(err, "Không thể tải danh sách đơn đăng ký."), "error");
  } finally {
    tbody.classList.remove("is-refreshing");
    setRefreshSpin(refreshBtn, false);
  }

  const regularRegs = allRegs.filter((r) => r.status !== "WAITLISTED");
  orgRegistrationsCache = regularRegs;
  selectedPendingRegIds.clear();
  updateVolunteerStatChips(regularRegs);
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
            <button type="button" class="btn-action" style="color: #64748b;" onclick="openRegistrationDetailModal(${r.id})">Chi tiết</button>
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
    showToast(Layout.extractApiErrorMessage(err, "Không thể duyệt đơn đăng ký."), "error");
    return;
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
    const firstErr = results.find((res) => res.status === "rejected")?.reason;
    showToast(Layout.extractApiErrorMessage(firstErr, "Không thể từ chối đơn đăng ký."), "error");
    return;
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

function formatWaitlistStatusPill(status) {
  const s = String(status || "WAITING").toUpperCase();
  const map = {
    INVITED: { cls: "status-pending", label: "Đang mời" },
    WAITING: { cls: "status-closed", label: "Đang chờ" },
    ACCEPTED: { cls: "status-approved", label: "Đã chấp nhận" },
    DECLINED: { cls: "status-rejected", label: "Đã từ chối" },
    EXPIRED: { cls: "status-rejected", label: "Hết hạn" },
  };
  const cfg = map[s] || { cls: "status-closed", label: s };
  return `<span class="status-pill ${cfg.cls}">${escapeHtml(cfg.label)}</span>`;
}

function formatWaitlistDeadlineCell(entry) {
  const status = String(entry.status || "").toUpperCase();
  if (status === "INVITED" && entry.response_deadline) {
    const parsedDeadline = typeof parseApiDate === "function"
      ? parseApiDate(entry.response_deadline)
      : new Date(entry.response_deadline);
    const deadlineMs = parsedDeadline ? parsedDeadline.getTime() : NaN;
    const diffMs = deadlineMs - Date.now();
    let countdownText = "Đã quá hạn";
    if (!Number.isNaN(diffMs) && diffMs > 0) {
      const totalSec = Math.floor(diffMs / 1000);
      const hrs = String(Math.floor(totalSec / 3600)).padStart(2, "0");
      const mins = String(Math.floor((totalSec % 3600) / 60)).padStart(2, "0");
      const secs = String(totalSec % 60).padStart(2, "0");
      countdownText = `Còn ${hrs}:${mins}:${secs}`;
    }
    return `
      <span class="org-wl-countdown">${escapeHtml(countdownText)}</span>
      <div class="td-subtitle">Hạn: ${escapeHtml(formatDateTime(entry.response_deadline))}</div>
    `;
  }
  if (status === "WAITING") {
    return `<span class="td-subtitle">Chờ đến lượt</span>`;
  }
  if (entry.responded_at) {
    return `<span class="td-subtitle">${escapeHtml(formatDateTime(entry.responded_at))}</span>`;
  }
  return `<span class="td-subtitle">—</span>`;
}

function updateWaitlistSummaryCounts(entries) {
  let invited = 0;
  let waiting = 0;
  let done = 0;
  entries.forEach((e) => {
    const s = String(e.status || "").toUpperCase();
    if (s === "INVITED") invited += 1;
    else if (s === "WAITING") waiting += 1;
    else done += 1;
  });
  const elInv = document.getElementById("orgWlInvitedCount");
  const elWait = document.getElementById("orgWlWaitingCount");
  const elDone = document.getElementById("orgWlDoneCount");
  if (elInv) elInv.textContent = String(invited);
  if (elWait) elWait.textContent = String(waiting);
  if (elDone) elDone.textContent = String(done);
}

async function loadCampaignWaitlist(manual = false) {
  const tbody = document.getElementById("orgWaitlistTbody");
  if (!tbody) return;
  if (!orgCampaignsLoaded) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:28px;">Không thể xác minh danh sách chiến dịch từ Backend. Vui lòng tải lại trang.</td></tr>`;
    return;
  }
  const campId = document.getElementById("volCampaignFilter")?.value || "";
  const searchQuery = (document.getElementById("volSearchInput")?.value || "").trim().toLowerCase();
  const allCampaigns = getOrgCampaigns();
  const campMap = new Map(allCampaigns.map((c) => [String(c.id), c]));
  const targetIds = campId ? [campId] : allCampaigns.map((c) => c.id);

  if (targetIds.length === 0) {
    updateWaitlistSummaryCounts([]);
    tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: #94a3b8; padding: 32px;">Chưa có chiến dịch nào để xem danh sách chờ.</td></tr>`;
    return;
  }

  const refreshBtn = document.querySelector("#volWaitlistWrap .org-icon-btn");
  const startedAt = Date.now();
  if (!tbody.children.length || tbody.querySelector("td[colspan]")) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: #94a3b8; padding: 28px;">Đang tải danh sách chờ...</td></tr>`;
  } else {
    tbody.classList.add("is-refreshing");
  }
  setRefreshSpin(refreshBtn, true);

  try {
    const results = await Promise.all(
      targetIds.map((id) =>
        api.get(`/waitlist/campaign/${id}`)
          .then((res) => (Array.isArray(res.data) ? res.data : []).map((e) => ({ ...e, _campaign_id: e.campaign_id || id })))
          .catch((error) => { throw error; })
      )
    );
    if (manual) await waitMinSpin(startedAt);
    const entries = results.flat();
    updateWaitlistSummaryCounts(entries);

    const filtered = searchQuery
      ? entries.filter((e) => {
          const cid = String(e._campaign_id || campId);
          const campTitle = (campMap.get(cid)?.title || "").toLowerCase();
          const userText = `tnv #${e.user_id} ${e.user_name || ""} ${e.full_name || ""}`.toLowerCase();
          return campTitle.includes(searchQuery) || userText.includes(searchQuery);
        })
      : entries;

    if (filtered.length === 0) {
      const emptyMsg = entries.length === 0
        ? "Chưa có tình nguyện viên nào trong danh sách chờ."
        : "Không tìm thấy tình nguyện viên phù hợp với từ khóa.";
      tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: #94a3b8; padding: 32px;">${emptyMsg}</td></tr>`;
      if (manual) showToast("Đã cập nhật danh sách chờ.", "success");
      return;
    }
    tbody.innerHTML = filtered.map((e, idx) => {
      const cid = String(e._campaign_id || campId);
      const camp = campMap.get(cid);
      const pos = e.queue_position ?? e.position ?? idx + 1;
      const userSub = escapeHtml(e.user_name || e.full_name || "");
      return `
        <tr>
          <td>
            <div class="td-title"><span class="org-wl-position">#${escapeHtml(String(pos))}</span>TNV #${escapeHtml(String(e.user_id))}</div>
            ${userSub ? `<div class="td-subtitle">${userSub}</div>` : ""}
          </td>
          <td>${escapeHtml(camp?.title || `Chiến dịch #${cid}`)}</td>
          <td>${formatWaitlistStatusPill(e.status)}</td>
          <td>${formatWaitlistDeadlineCell(e)}</td>
          <td style="font-size: 13px;">${e.created_at ? escapeHtml(formatDateTime(e.created_at)) : "—"}</td>
        </tr>
      `;
    }).join("");
    if (manual) showToast("Đã cập nhật danh sách chờ.", "success");
  } catch (err) {
    const msg = Layout.extractApiErrorMessage(err, "Không thể tải danh sách chờ.");
    tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: #b91c1c; padding: 32px;">${escapeHtml(msg)}</td></tr>`;
    if (manual) showToast(msg, "error");
  } finally {
    tbody.classList.remove("is-refreshing");
    setRefreshSpin(refreshBtn, false);
  }
}

// ================= TAB 5: CẤP CHỨNG CHỈ & KHIẾU NẠI GIỜ =================
async function renderCertificatesAndClaims() {
  const orgClaimsTbody = document.getElementById("orgClaimsTbody");
  const orgIssuedCertsTbody = document.getElementById("orgIssuedCertsTbody");

  // Hour claims always come from the server; local fallbacks must not fake approvals.
  let claims = [];
  try {
    const res = await api.get("/hour-claims");
    if (Array.isArray(res.data)) claims = res.data;
  } catch (err) {
    if (orgClaimsTbody) {
      orgClaimsTbody.innerHTML = `<tr><td colspan="4">${escapeHtml(Layout.extractApiErrorMessage(err, "Không thể tải yêu cầu giờ."))}</td></tr>`;
    }
    return;
  }

  if (orgClaimsTbody) {
    if (claims.length === 0) {
      orgClaimsTbody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: #94a3b8; padding: 20px;">Không có yêu cầu khiếu nại giờ nào</td></tr>`;
    } else {
      orgClaimsTbody.innerHTML = claims.map(cl => {
        const volLabel = cl.user_name || `TNV #${cl.user_id || cl.registration_id}`;
        const campLabel = cl.campaign_title || `Đơn ĐK #${cl.registration_id}`;
        const hoursVal = cl.claimed_hours ?? 0;
        const actualHours = Number(cl.actual_hours ?? 0);
        const displayHours = cl.status === "VERIFIED" ? (cl.approved_hours ?? 0) : hoursVal;
        const noteText = cl.note ? `<div class="td-subtitle">${escapeHtml(cl.note)}</div>` : "";
        return `
          <tr>
            <td>
              <div class="td-title">${escapeHtml(volLabel)}</div>
              <div class="td-subtitle">${escapeHtml(campLabel)}</div>
              ${noteText}
            </td>
            <td><strong>${escapeHtml(String(displayHours))} giờ</strong><div class="td-subtitle">Điểm danh: ${actualHours}h · Đề nghị: ${escapeHtml(String(hoursVal))}h</div></td>
            <td>
              ${isSafeHttpUrl(cl.evidence_url) ? `<a href="${escapeHtml(cl.evidence_url)}" target="_blank" rel="noopener noreferrer" style="color: var(--primary); font-size: 12px; font-weight: 600;">Xem minh chứng ↗</a>` : (cl.evidence_url ? `<span style="color: var(--text-muted); font-size: 12px;">URL không hợp lệ</span>` : "—")}
            </td>
            <td style="text-align: right;">
              ${cl.status === "PENDING" ? `
                <div class="btn-group-sm" style="justify-content: flex-end;">
                  <button type="button" class="btn-action btn-action-primary" ${actualHours <= 0 ? 'disabled title="TNV chưa có giờ điểm danh hợp lệ"' : ""} onclick="verifyHourClaim(${cl.id}, ${Math.min(Number(hoursVal), actualHours)})">Xác nhận</button>
                  <button type="button" class="btn-action btn-action-danger" onclick="rejectHourClaim(${cl.id})">Từ chối</button>
                </div>
              ` : `<span class="status-pill status-${String(cl.status).toLowerCase()}">${escapeHtml(cl.status === "VERIFIED" ? "Đã xác nhận" : cl.status === "REJECTED" ? "Bị từ chối" : cl.status === "PENDING" ? "Đang đợi" : cl.status)}</span>`}
            </td>
          </tr>
        `;
      }).join("");
    }
  }

  // Render Certificates
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
    if (!(approvedHours > 0)) {
      showToast("Không có số giờ điểm danh hợp lệ để xác minh.", "error");
      return;
    }
    await api.patch(`/hour-claims/${claimId}/review`, {
      status: "VERIFIED", approved_hours: approvedHours
    });
    showToast("Đã xác minh giờ tình nguyện.", "success");
    await renderCertificatesAndClaims();
    loadOrganizerStats();
  } catch (err) {
    showToast(Layout.extractApiErrorMessage(err, "Không thể xác minh giờ."), "error");
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
  const reason = (input?.value || "").trim();
  if (!reason) {
    showToast("Cần nhập lý do từ chối.", "warning");
    return;
  }
  const btn = document.getElementById("confirmRejectClaimBtn");
  if (btn) btn.disabled = true;
  try {
    await api.patch(`/hour-claims/${claimId}/review`, {
      status: "REJECTED", rejection_reason: reason
    });
    closeModal("rejectClaimModal");
    pendingRejectClaimId = null;
    showToast("Đã từ chối yêu cầu xác minh giờ.", "warning");
    await renderCertificatesAndClaims();
  } catch (err) {
    showToast(Layout.extractApiErrorMessage(err, "Không thể từ chối yêu cầu."), "error");
  } finally {
    if (btn) btn.disabled = false;
  }
}

let eligibleCertRecipients = [];

function renderCertVolunteerOptions(campaignId) {
  const volSelect = document.getElementById("certVolunteerSelect");
  const hoursInput = document.getElementById("certHoursInput");
  if (!volSelect) return;
  const matches = eligibleCertRecipients.filter((r) => String(r.campaign_id) === String(campaignId));
  if (matches.length === 0) {
    volSelect.innerHTML = `<option value="">Không có TNV đủ điều kiện</option>`;
    if (hoursInput) hoursInput.value = "";
    return;
  }
  volSelect.innerHTML = matches
    .map((u) => `<option value="${u.user_id}">${escapeHtml(u.user_name || `TNV #${u.user_id}`)} — ${Number(u.approved_hours).toFixed(2)} giờ</option>`)
    .join("");
  syncCertificateApprovedHours();
}

function syncCertificateApprovedHours() {
  const campaignId = document.getElementById("certCampaignSelect")?.value;
  const userId = document.getElementById("certVolunteerSelect")?.value;
  const hoursInput = document.getElementById("certHoursInput");
  const selected = eligibleCertRecipients.find((r) =>
    String(r.campaign_id) === String(campaignId) && String(r.user_id) === String(userId));
  if (hoursInput) hoursInput.value = selected ? Number(selected.approved_hours).toFixed(2) : "";
}

async function openIssueCertModal() {
  const campSelect = document.getElementById("certCampaignSelect");
  const volSelect = document.getElementById("certVolunteerSelect");
  const submitBtn = document.querySelector("#issueCertModal .btn-primary");
  if (!campSelect || !volSelect) return;

  campSelect.innerHTML = `<option value="">Đang tải dữ liệu...</option>`;
  volSelect.innerHTML = `<option value="">Đang tải dữ liệu...</option>`;
  if (submitBtn) submitBtn.disabled = true;
  openModal("issueCertModal");

  try {
    const res = await api.get("/certificates/eligible");
    eligibleCertRecipients = Array.isArray(res.data) ? res.data : [];
  } catch (err) {
    eligibleCertRecipients = [];
    campSelect.innerHTML = `<option value="">Không thể tải danh sách</option>`;
    volSelect.innerHTML = `<option value="">Không có dữ liệu</option>`;
    showToast(Layout.extractApiErrorMessage(err, "Không thể tải danh sách TNV đủ điều kiện."), "error");
    return;
  }

  if (eligibleCertRecipients.length === 0) {
    campSelect.innerHTML = `<option value="">Chưa có chiến dịch/TNV đủ điều kiện</option>`;
    volSelect.innerHTML = `<option value="">Tất cả TNV đã được cấp chứng chỉ hoặc chưa có TNV được duyệt</option>`;
    return;
  }

  const campaignMap = new Map();
  eligibleCertRecipients.forEach((item) => {
    if (!campaignMap.has(item.campaign_id)) {
      campaignMap.set(item.campaign_id, item.campaign_title || `Chiến dịch #${item.campaign_id}`);
    }
  });

  campSelect.innerHTML = Array.from(campaignMap.entries())
    .map(([id, title]) => `<option value="${id}">${escapeHtml(title)}</option>`)
    .join("");

  if (!campSelect.dataset.bound) {
    campSelect.dataset.bound = "1";
    campSelect.addEventListener("change", () => renderCertVolunteerOptions(campSelect.value));
  }

  if (!volSelect.dataset.bound) {
    volSelect.dataset.bound = "1";
    volSelect.addEventListener("change", syncCertificateApprovedHours);
  }
  renderCertVolunteerOptions(campSelect.value);
  if (submitBtn) submitBtn.disabled = false;
}

async function submitIssueCertificate() {
  const campSelect = document.getElementById("certCampaignSelect");
  const volSelect = document.getElementById("certVolunteerSelect");
  const hoursInput = document.getElementById("certHoursInput");
  const submitBtn = document.querySelector("#issueCertModal .btn-primary");

  const campaignId = parseInt(campSelect?.value, 10);
  const userId = parseInt(volSelect?.value, 10);
  const eligible = eligibleCertRecipients.find((r) =>
    String(r.campaign_id) === String(campaignId) && String(r.user_id) === String(userId));
  const hours = eligible ? Number(eligible.approved_hours) : NaN;

  if (!campaignId || !userId) {
    showToast("Vui lòng chọn chiến dịch và tình nguyện viên hợp lệ.", "error");
    return;
  }
  if (!eligible || !Number.isFinite(hours) || hours <= 0) {
    showToast("Tổng số giờ công nhận phải lớn hơn 0.", "error");
    return;
  }

  if (submitBtn) submitBtn.disabled = true;
  try {
    const res = await api.post("/certificates", {
      campaign_id: campaignId,
      user_id: userId,
      total_hours: hours,
    });
    const issued = res.data;
    closeModal("issueCertModal");
    showToast(`Đã phát hành chứng chỉ: ${issued.certificate_code}`, "success");
    await renderCertificatesAndClaims();
  } catch (err) {
    showToast(Layout.extractApiErrorMessage(err, "Không thể phát hành chứng chỉ."), "error");
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
}

// ================= TAB 6: HỒ SƠ TỔ CHỨC =================
function setupOrgProfileForm() {
  document.getElementById("orgFormName").value = currentOrg?.name || "";
  document.getElementById("orgFormEmail").value = currentOrg?.email || "";
  document.getElementById("orgFormPhone").value = currentOrg?.phone || "";
  document.getElementById("orgFormAddress").value = currentOrg?.address || "";
  document.getElementById("orgFormDocUrl").value = currentOrg?.document_url || "";
  document.getElementById("orgFormDesc").value = currentOrg?.description || "";

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

async function saveOrgProfile() {
  const name = document.getElementById("orgFormName").value.trim();
  const email = document.getElementById("orgFormEmail").value.trim();
  const phone = document.getElementById("orgFormPhone").value.trim();
  const address = document.getElementById("orgFormAddress").value.trim();
  const documentUrl = document.getElementById("orgFormDocUrl").value.trim();
  const description = document.getElementById("orgFormDesc").value.trim();

  if (!name || !email || !phone) {
    showToast("Vui lòng nhập đầy đủ Tên, Email và Số điện thoại tổ chức.", "error");
    return;
  }
  if (!/^0\d{9,10}$/.test(phone)) {
    showToast("Số điện thoại tổ chức phải gồm 10–11 chữ số và bắt đầu bằng số 0.", "warning");
    return;
  }

  const payload = {
    name,
    email,
    phone,
    address: address || null,
    document_url: documentUrl || null,
    description: description || null,
  };

  try {
    const res = await api.put("/organizations/me", payload);
    if (res.data) {
      currentOrg = { ...currentOrg, ...res.data };
    }
  } catch (err) {
    showToast(Layout.extractApiErrorMessage(err, "Không thể cập nhật hồ sơ tổ chức."), "error");
    return;
  }

  renderOrgStatusBanner();
  setupOrganizerHeader();
  showToast("Đã lưu thông tin hồ sơ tổ chức!", "success");
}

// Modal helpers (kế thừa VLModal từ js/utils.js, giữ hook reset cho createCampaignModal)
if (typeof VLModal !== "undefined") {
  VLModal.onClose("createCampaignModal", () => {
    activeDetailCampaignId = null;
    campaignInitialSnapshot = null;
    isCampaignEditing = false;
    toggleCancelCampaignBox(false);
  });
}


/* Khiếu nại điểm danh: API thật, không fallback dữ liệu mẫu. */
async function loadOrganizerAttendanceAppeals(manual = false) {
  const panel = document.getElementById("organizerAttendanceAppeals");
  if (!panel) return;
  const refreshBtn = document.getElementById("refreshAttendanceAppeals");
  const startedAt = Date.now();
  setRefreshSpin(refreshBtn, true);
  if (!manual || !panel.querySelector(".vl-appeal-list")) {
    panel.textContent = "Đang tải khiếu nại điểm danh...";
  }
  const statusMap = {
    PENDING: { label: "Chờ xử lý", cls: "status-pending" },
    ACCEPTED: { label: "Đã chấp nhận", cls: "status-approved" },
    REJECTED: { label: "Đã từ chối", cls: "status-rejected" },
  };
  try {
    const res = await api.get("/attendance-appeals/organizer");
    if (manual) await waitMinSpin(startedAt);
    const appeals = Array.isArray(res.data) ? res.data : [];
    if (!appeals.length) {
      panel.innerHTML = `<div class="vl-appeal-meta">Không có khiếu nại điểm danh nào.</div>`;
      if (manual) showToast("Đã cập nhật khiếu nại điểm danh.", "success");
      return;
    }
    panel.innerHTML = `<div class="vl-appeal-list">${appeals.map((a) => {
      const st = statusMap[a.status] || { label: a.status, cls: "status-closed" };
      const safeUrl = /^https?:\/\//i.test(String(a.evidence_url || "").trim()) ? a.evidence_url.trim() : "";
      return `
        <div class="vl-appeal-item">
          <div class="vl-appeal-head">
            <strong>Đơn #${Number(a.registration_id)}</strong>
            <span class="status-pill ${st.cls}">${escapeHtml(st.label)}</span>
          </div>
          <div class="vl-appeal-reason">${escapeHtml(a.reason)}</div>
          ${safeUrl ? `<div class="vl-appeal-meta">Bằng chứng: <a href="${escapeHtml(safeUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(safeUrl)}</a></div>` : ""}
          ${a.review_note ? `<div class="vl-appeal-meta">Phản hồi: ${escapeHtml(a.review_note)}</div>` : ""}
          ${a.status === "PENDING" ? `
            <div style="display: flex; gap: 8px; flex-wrap: wrap; margin-top: 6px;">
              <button type="button" class="btn btn-primary btn-sm" onclick="reviewAttendanceAppeal(${Number(a.id)}, 'ACCEPTED')">Chấp nhận</button>
              <button type="button" class="btn btn-outline btn-sm" onclick="reviewAttendanceAppeal(${Number(a.id)}, 'REJECTED')">Từ chối</button>
            </div>` : ""}
        </div>`;
    }).join("")}</div>`;
    if (manual) showToast("Đã cập nhật khiếu nại điểm danh.", "success");
  } catch (err) {
    const msg = Layout.extractApiErrorMessage(err, "Không thể tải khiếu nại điểm danh.");
    panel.textContent = msg;
    if (manual) showToast(msg, "error");
  } finally {
    setRefreshSpin(refreshBtn, false);
  }
}

function reviewAttendanceAppeal(id, decision) {
  const idInput = document.getElementById("reviewAppealId");
  const decisionInput = document.getElementById("reviewAppealDecision");
  const noteInput = document.getElementById("reviewAppealNoteInput");
  const inInput = document.getElementById("reviewAppealCheckInInput");
  const outInput = document.getElementById("reviewAppealCheckOutInput");
  const timeWrap = document.getElementById("reviewAppealTimeFields");
  const titleEl = document.getElementById("reviewAttendanceAppealTitle");
  const confirmBtn = document.getElementById("confirmReviewAppealBtn");

  if (idInput) idInput.value = String(id);
  if (decisionInput) decisionInput.value = decision;
  if (noteInput) noteInput.value = "";
  if (inInput) inInput.value = "";
  if (outInput) outInput.value = "";
  if (timeWrap) timeWrap.hidden = decision !== "ACCEPTED";
  if (titleEl) titleEl.textContent = decision === "ACCEPTED" ? "Chấp nhận khiếu nại điểm danh" : "Từ chối khiếu nại điểm danh";
  if (confirmBtn) {
    confirmBtn.textContent = decision === "ACCEPTED" ? "Xác nhận chấp nhận" : "Xác nhận từ chối";
    confirmBtn.className = decision === "ACCEPTED" ? "btn btn-primary" : "btn btn-danger";
    confirmBtn.disabled = false;
  }
  openModal("reviewAttendanceAppealModal");
}

async function submitReviewAttendanceAppeal() {
  const id = Number(document.getElementById("reviewAppealId")?.value);
  const decision = document.getElementById("reviewAppealDecision")?.value;
  const reviewNote = (document.getElementById("reviewAppealNoteInput")?.value || "").trim();
  const checkInVal = (document.getElementById("reviewAppealCheckInInput")?.value || "").trim();
  const checkOutVal = (document.getElementById("reviewAppealCheckOutInput")?.value || "").trim();
  const confirmBtn = document.getElementById("confirmReviewAppealBtn");

  if (!id || reviewNote.length < 3) {
    showToast("Vui lòng nhập ghi chú xử lý (tối thiểu 3 ký tự).", "warning");
    document.getElementById("reviewAppealNoteInput")?.focus();
    return;
  }

  const body = { decision, review_note: reviewNote };
  if (decision === "ACCEPTED") {
    if (checkInVal) body.check_in_at = checkInVal;
    if (checkOutVal) body.check_out_at = checkOutVal;
  }

  if (confirmBtn) confirmBtn.disabled = true;
  try {
    await api.patch(`/attendance-appeals/${id}/review`, body);
    closeModal("reviewAttendanceAppealModal");
    showToast("Đã xử lý khiếu nại điểm danh.", "success");
    await loadOrganizerAttendanceAppeals();
    if (typeof renderLiveAttendanceList === "function") await renderLiveAttendanceList();
  } catch (err) {
    showToast(Layout.extractApiErrorMessage(err, "Không xử lý được khiếu nại."), "error");
    if (confirmBtn) confirmBtn.disabled = false;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("refreshAttendanceAppeals")?.addEventListener("click", () => loadOrganizerAttendanceAppeals(true));
  loadOrganizerAttendanceAppeals();
});
