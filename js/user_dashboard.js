/**
 * Bảng điều khiển Tình nguyện viên (Role: USER)
 * Kết nối 100% Backend FastAPI (không dùng DataStore mẫu):
 *   - Auth: GET /api/auth/me, POST /api/auth/logout
 *   - Registrations: GET /api/registrations/me, PATCH /api/registrations/{id}/cancel
 *   - Attendances: GET /api/attendances/my-history, POST /api/attendances/check-in, check-out
 *   - Certificates & Hour Claims: GET /api/certificates/me, GET/POST /api/hour-claims
 *   - Profile: GET /api/profile/me, PATCH /api/profile/me, PATCH /api/profile/me/volunteer
 *   - Organizations: GET /api/organizations/me, POST /api/organizations/
 */

let currentUser = null;
let cachedRegistrations = [];
let cachedCertificates = [];
let certFilterInitialized = false;
let currentMyOrg = null;
let myWaitlistEntries = [];
let waitlistFilter = "ALL";
let waitlistPendingAction = false;
let profileTotalHours = null;
let attendanceTotalHours = 0;

function updateTotalHoursStat() {
  const statHoursEl = document.getElementById("statTotalHours");
  if (!statHoursEl) return;
  const resolved = profileTotalHours != null ? profileTotalHours : attendanceTotalHours;
  statHoursEl.textContent = Number(resolved || 0).toFixed(1);
}

const REG_STATUS_MAP = {
  PENDING: { label: "Đang chờ duyệt", cls: "status-pending" },
  APPROVED: { label: "Đã duyệt tham gia", cls: "status-approved" },
  REJECTED: { label: "Bị từ chối", cls: "status-rejected" },
  CANCELLED: { label: "Đã hủy", cls: "status-cancelled" },
  WAITLISTED: { label: "Trong danh sách chờ", cls: "status-pending" },
};

const ATT_STATUS_MAP = {
  PRESENT: { label: "Có mặt", cls: "status-approved" },
  LATE: { label: "Đi muộn", cls: "status-pending" },
  ABSENT: { label: "Vắng mặt", cls: "status-rejected" },
  EXCUSED: { label: "Có phép", cls: "status-closed" },
};

const CLAIM_STATUS_MAP = {
  PENDING: { label: "Đang đợi", cls: "status-pending" },
  VERIFIED: { label: "Đã xác nhận", cls: "status-approved" },
  REJECTED: { label: "Bị từ chối", cls: "status-rejected" },
};

/* ==================== KHỞI TẠO & ĐIỀU HƯỚNG ==================== */

document.addEventListener("DOMContentLoaded", async () => {
  currentUser = await Auth.requireAuth(["USER", "ORGANIZER"]);
  if (!currentUser) return;

  setupUserHeader();
  setupTabs();
  setupUserMenu();
  if (typeof Layout !== "undefined" && typeof Layout.initNotificationBell === "function") {
    Layout.initNotificationBell(currentUser.role || "USER");
  }
  setupAttendanceActions();
  setupAttendanceAppeals();
  setupProfilePreview();
  setupMyWaitlist();

  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
      if (await Auth.confirmLogout()) Auth.logout();
    });
  }

  await Promise.all([loadMyRegistrations(), loadMyWaitlist()]);
  await Promise.allSettled([
    loadMyAttendanceHistory(),
    loadMyAttendanceAppeals(),
    loadCertificates(),
    loadHourClaims(),
    loadProfile(),
    loadOrganizationStatus(),
  ]);
});

function setupUserHeader() {
  const fullName = currentUser.full_name || currentUser.name || currentUser.email || "Tình nguyện viên";
  const setText = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  };

  setText("headerUserName", fullName);
  setText("welcomeUserName", fullName);
  setText("profNameDisplay", fullName);
  renderAvatarElement(document.getElementById("headerAvatar"), currentUser.avatar_url, fullName);
  renderAvatarElement(document.getElementById("profileAvatarBig"), currentUser.avatar_url, fullName);
}

function setupTabs() {
  const navItems = Array.from(document.querySelectorAll(".dash-nav-item[data-tab]"));
  navItems.forEach((item, index) => {
    item.addEventListener("click", (e) => {
      e.preventDefault();
      switchUserTab(item.getAttribute("data-tab"));
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
        switchUserTab(target.getAttribute("data-tab"));
      }
    });
  });

  const rawTab = new URLSearchParams(window.location.search).get("tab");
  const tabAlias = { hours: "certificates" };
  const initialTab = tabAlias[rawTab] || rawTab;
  if (initialTab && document.getElementById("tab-" + initialTab)) {
    switchUserTab(initialTab);
  }
}

function switchUserTab(tabId) {
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

  if (tabId === "waitlist") loadMyWaitlist();

  if (tabId && window.history?.replaceState) {
    const url = new URL(window.location.href);
    url.searchParams.set("tab", tabId);
    window.history.replaceState(null, "", url.toString());
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
      switchUserTab("profile");
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


/* ==================== DANH SÁCH CHỜ THỰC TẾ ==================== */
const WL_STATUS = {
  WAITING: ["Đang chờ", "status-closed"],
  INVITED: ["Cần phản hồi", "status-pending"],
  ACCEPTED: ["Đã chấp nhận", "status-approved"],
  DECLINED: ["Đã từ chối", "status-rejected"],
  EXPIRED: ["Hết hạn", "status-rejected"],
};

function waitlistDeadlineMs(value) {
  if (!value) return NaN;
  const d = typeof parseApiDate === "function" ? parseApiDate(value) : null;
  if (d) return d.getTime();
  const normalized = String(value).replace(" ", "T");
  return new Date(/[Zz]|[+-]\d{2}:\d{2}$/.test(normalized) ? normalized : normalized + "+07:00").getTime();
}

function waitlistRemaining(entry) {
  const ms = waitlistDeadlineMs(entry.response_deadline) - Date.now();
  if (!Number.isFinite(ms) || ms <= 0) return "Đã hết hạn";
  const t = Math.ceil(ms / 1000);
  return `${String(Math.floor(t / 3600)).padStart(2, "0")}:${String(Math.floor(t % 3600 / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

function isActiveWaitlistInvite(e) {
  return e.status === "INVITED" && waitlistDeadlineMs(e.response_deadline) > Date.now();
}

function setupMyWaitlist() {
  document.getElementById("refreshMyWaitlistBtn")?.addEventListener("click", () => loadMyWaitlist(true));
  document.querySelectorAll("[data-wl-filter]").forEach((btn) => btn.addEventListener("click", () => {
    waitlistFilter = btn.dataset.wlFilter;
    document.querySelectorAll("[data-wl-filter]").forEach((b) => b.classList.toggle("active", b === btn));
    renderMyWaitlist();
  }));
  document.getElementById("tab-waitlist")?.addEventListener("click", (event) => {
    const leave = event.target.closest("[data-wl-leave]");
    if (leave) { leaveMyWaitlist(leave.dataset.wlLeave); return; }
    const button = event.target.closest("[data-wl-response]");
    if (!button) return;
    respondMyWaitlist(button.dataset.wlEntry, button.dataset.wlResponse);
  });
  setInterval(() => {
    document.querySelectorAll("[data-wl-countdown]").forEach((el) => {
      const item = myWaitlistEntries.find((e) => String(e.id) === el.dataset.wlCountdown);
      if (item) el.textContent = waitlistRemaining(item);
    });
    // Disable expired buttons even before the next refresh.
    document.querySelectorAll("[data-wl-response]").forEach((btn) => {
      const item = myWaitlistEntries.find((e) => String(e.id) === btn.dataset.wlEntry);
      btn.disabled = waitlistPendingAction || !item || !isActiveWaitlistInvite(item);
    });
  }, 1000);
}

async function loadMyWaitlist(manual = false, triggerBtn = null) {
  const tbody = document.getElementById("myWaitlistTbody");
  const refreshBtn = triggerBtn || document.getElementById("refreshMyWaitlistBtn");
  const tableRefreshBtn = document.getElementById("refreshWaitlistTableBtn");
  const hasRows = tbody && tbody.children.length > 0 && !tbody.querySelector("td[colspan]");
  const startedAt = Date.now();
  if (tbody && hasRows) tbody.classList.add("is-refreshing");
  if (refreshBtn) setRefreshSpin(refreshBtn, true);
  if (tableRefreshBtn && tableRefreshBtn !== refreshBtn) setRefreshSpin(tableRefreshBtn, true);
  try {
    const response = await api.get("/waitlist/mine");
    if (manual) {
      await waitMinSpin(startedAt);
    }
    myWaitlistEntries = Array.isArray(response.data) ? response.data : [];
    renderMyWaitlist();
    if (manual && typeof showToast === "function") {
      showToast("Đã cập nhật danh sách chờ.", "success");
    }
  } catch (error) {
    myWaitlistEntries = [];
    renderMyWaitlist();
    if (tbody) tbody.innerHTML = `<tr><td colspan="5">${escapeHtml(extractApiError(error, "Không tải được danh sách chờ."))}</td></tr>`;
  } finally {
    if (tbody) tbody.classList.remove("is-refreshing");
    if (refreshBtn) setRefreshSpin(refreshBtn, false);
    if (tableRefreshBtn) setRefreshSpin(tableRefreshBtn, false);
  }
}

function renderMyWaitlist() {
  const active = myWaitlistEntries.filter(isActiveWaitlistInvite);
  const waiting = myWaitlistEntries.filter((e) => e.status === "WAITING");
  const accepted = myWaitlistEntries.filter((e) => e.status === "ACCEPTED");
  const set = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = String(value); };
  set("wlStatInvited", active.length);
  set("wlStatWaiting", waiting.length);
  set("wlStatAccepted", accepted.length);
  set("myWaitlistCountBadge", active.length + waiting.length);
  const title = (e) => escapeHtml(e.campaign_title || `Chiến dịch #${e.campaign_id}`);
  const actions = (e) => `<div style="display:inline-flex;align-items:center;gap:8px;justify-content:flex-end;"><button type="button" class="btn btn-primary btn-sm" data-wl-entry="${e.id}" data-wl-response="ACCEPTED" ${isActiveWaitlistInvite(e) && !waitlistPendingAction ? "" : "disabled"}>Chấp nhận</button><button type="button" class="btn btn-danger btn-sm" data-wl-entry="${e.id}" data-wl-response="DECLINED" ${isActiveWaitlistInvite(e) && !waitlistPendingAction ? "" : "disabled"}>Từ chối</button></div>`;
  const invites = document.getElementById("userWaitlistInviteSection");
  if (invites) invites.innerHTML = active.length ? active.map((e) => `
    <article class="ud-card wl-invite-card">
      <div class="wl-invite-card-head"><span class="status-pill status-pending">Bạn được mời tham gia</span>
      <div class="wl-countdown-pill">Còn lại: <strong data-wl-countdown="${e.id}">${waitlistRemaining(e)}</strong></div></div>
      <div class="wl-invite-card-body"><div class="wl-invite-info">
      <h2 class="wl-invite-title">${title(e)}</h2>
      <p class="wl-invite-hint">Hạn phản hồi: ${escapeHtml(safeFormatDateTime(e.response_deadline))}. Nếu hết hạn, suất sẽ được chuyển cho người tiếp theo.</p></div>
      <div class="wl-invite-actions">${actions(e)}</div></div>
    </article>`).join("") : "";
  let shown = myWaitlistEntries;
  if (waitlistFilter === "HISTORY") shown = shown.filter((e) => !["WAITING", "INVITED"].includes(e.status));
  else if (waitlistFilter !== "ALL") shown = shown.filter((e) => e.status === waitlistFilter);
  const tbody = document.getElementById("myWaitlistTbody");
  if (!tbody) return;
  tbody.innerHTML = shown.length ? shown.map((e) => {
    const [label, cls] = WL_STATUS[e.status] || [e.status, "status-closed"];
    const position = e.status === "WAITING" ? `#${e.queue_position ?? e.position}` : (e.status === "INVITED" ? "Đến lượt" : "—");
    const deadline = e.status === "INVITED"
      ? `<strong data-wl-countdown="${e.id}">${waitlistRemaining(e)}</strong><div class="td-subtitle">${escapeHtml(safeFormatDateTime(e.response_deadline))}</div>`
      : (e.status === "WAITING" ? "Chờ đến lượt" : escapeHtml(safeFormatDateTime(e.responded_at)));
    const rowActionHtml = e.status === "INVITED"
      ? actions(e)
      : e.status === "WAITING"
        ? `<button type="button" class="btn btn-neutral btn-sm" data-wl-leave="${e.campaign_id}">Rời hàng chờ</button>`
        : "—";
    return `<tr><td><span class="wl-position-badge">${escapeHtml(position)}</span></td>
      <td><div class="td-title">${title(e)}</div><div class="td-subtitle">Vào hàng chờ: ${escapeHtml(safeFormatDateTime(e.created_at))}</div></td>
      <td><span class="status-pill ${cls}">${escapeHtml(e.status === "INVITED" && !isActiveWaitlistInvite(e) ? "Đã quá hạn" : label)}</span></td>
      <td>${deadline}</td><td>${rowActionHtml}</td></tr>`;
  }).join("") : `<tr><td colspan="5" style="text-align:center;padding:28px;">Không có mục nào phù hợp.</td></tr>`;
}

async function leaveMyWaitlist(campaignId) {
  let registration = cachedRegistrations.find(r => String(r.campaign_id) === String(campaignId) && r.status === "WAITLISTED");
  if (!registration) {
    await loadMyRegistrations();
    registration = cachedRegistrations.find(r => String(r.campaign_id) === String(campaignId) && r.status === "WAITLISTED");
  }
  if (!registration) { showToast("Không tìm thấy đơn đang chờ. Hãy tải lại trang.", "error"); return; }
  const ok = await VLModal.confirm({
    title: "Rời danh sách chờ",
    message: "Bạn muốn rời danh sách chờ của chiến dịch này?",
    confirmText: "Rời hàng chờ",
    danger: true,
  });
  if (!ok) return;
  await cancelMyRegistration(registration.id);
}

async function respondMyWaitlist(entryId, response) {
  if (waitlistPendingAction) return;
  const entry = myWaitlistEntries.find((e) => String(e.id) === String(entryId));
  if (!entry || !isActiveWaitlistInvite(entry)) return;
  if (response === "DECLINED") {
    const ok = await VLModal.confirm({
      title: "Từ chối suất tham gia",
      message: "Bạn có chắc muốn từ chối suất tham gia này? Suất sẽ được chuyển cho người tiếp theo.",
      confirmText: "Từ chối suất",
      danger: true,
    });
    if (!ok) return;
  }
  waitlistPendingAction = true;
  renderMyWaitlist();
  try {
    const result = await api.patch(`/waitlist/${entryId}/respond`, { response });
    showToast(result.data?.status === "EXPIRED" ? "Lời mời đã hết hạn, suất đã chuyển cho người kế tiếp." : (response === "ACCEPTED" ? "Đã chấp nhận suất tham gia." : "Đã từ chối suất tham gia."), result.data?.status === "EXPIRED" ? "warning" : "success");
    await Promise.all([loadMyWaitlist(), loadMyRegistrations()]);
  } catch (error) {
    showToast(extractApiError(error, "Không thể phản hồi lời mời."), "error");
    await loadMyWaitlist();
  } finally {
    waitlistPendingAction = false;
    renderMyWaitlist();
  }
}

/* ==================== TAB 1: TỔNG QUAN & ĐƠN ĐĂNG KÝ ==================== */

async function loadMyRegistrations(manual = false) {
  const tbody = document.getElementById("myRegistrationsTbody");
  if (!tbody) return;
  const refreshBtn = document.getElementById("refreshMyRegsBtn");
  const hasRows = tbody.children.length > 0 && !tbody.querySelector("td[colspan]");
  const startedAt = Date.now();

  if (hasRows) {
    tbody.classList.add("is-refreshing");
  } else {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:24px;color:var(--text-muted);">Đang tải danh sách đăng ký...</td></tr>`;
  }
  if (refreshBtn) {
    refreshBtn.classList.add("is-spinning");
    refreshBtn.disabled = true;
  }

  try {
    const res = await api.get("/registrations/me");
    if (manual) {
      const waitMs = Math.max(0, 450 - (Date.now() - startedAt));
      if (waitMs > 0) await new Promise((r) => setTimeout(r, waitMs));
    }
    cachedRegistrations = Array.isArray(res.data) ? res.data : [];

    const countEl = document.getElementById("myRegsCountBadge");
    const statEl = document.getElementById("statRegistered");
    const approvedEl = document.getElementById("statApprovedRegs");
    if (countEl) countEl.textContent = String(cachedRegistrations.length);
    if (statEl) statEl.textContent = String(cachedRegistrations.length);
    if (approvedEl) {
      approvedEl.textContent = String(cachedRegistrations.filter((r) => r.status === "APPROVED").length);
    }

    populateCampaignSelects(cachedRegistrations);

    if (cachedRegistrations.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:24px;color:var(--text-muted);">Bạn chưa đăng ký chiến dịch nào.</td></tr>`;
      return;
    }

    tbody.innerHTML = cachedRegistrations
      .map((reg) => {
        const st = REG_STATUS_MAP[reg.status] || { label: reg.status, cls: "status-closed" };
        let actionHtml = `<a href="campaign_detail.html?id=${encodeURIComponent(reg.campaign_id)}" class="btn-action">Chi tiết</a>`;
        if (reg.status === "APPROVED") {
          actionHtml = `<button type="button" class="btn-action btn-action-primary" onclick="goToAttendance(${Number(reg.campaign_id)})">Điểm danh</button>`;
        } else if (reg.status === "WAITLISTED") {
          actionHtml = `<button type="button" class="btn-action btn-action-neutral" onclick="cancelMyRegistration(${Number(reg.id)})">Rời hàng chờ</button>`;
        } else if (reg.status === "PENDING") {
          actionHtml = `<button type="button" class="btn-action btn-action-danger" onclick="cancelMyRegistration(${Number(reg.id)})">Hủy đơn</button>`;
        }

        return `
          <tr>
            <td>
              <div class="td-title">${escapeHtml(reg.campaign_title || `Chiến dịch #${reg.campaign_id}`)}</div>
              <div style="font-size:0.78rem;color:var(--text-muted);">Mã đơn: REG-${reg.id}</div>
            </td>
            <td>${escapeHtml(safeFormatDateTime(reg.created_at))}</td>
            <td><span class="status-pill ${st.cls}">${escapeHtml(st.label)}</span></td>
            <td style="max-width:260px;color:var(--text-muted);">${escapeHtml(reg.message || reg.rejection_reason || "—")}</td>
            <td>${actionHtml}</td>
          </tr>
        `;
      })
      .join("");
    if (manual && typeof showToast === "function") {
      showToast("Đã cập nhật danh sách ca đăng ký.", "success");
    }
  } catch (error) {
    const msg = extractApiError(error, "Không thể tải danh sách đăng ký.");
    if (!hasRows) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:24px;color:var(--danger);">${escapeHtml(msg)}</td></tr>`;
    } else if (typeof showToast === "function") {
      showToast(msg, "error");
    }
  } finally {
    tbody.classList.remove("is-refreshing");
    if (refreshBtn) {
      refreshBtn.classList.remove("is-spinning");
      refreshBtn.disabled = false;
    }
  }
}

function renderMyRegistrations(manual = false) {
  return loadMyRegistrations(manual);
}

async function cancelMyRegistration(registrationId) {
  try {
    await api.patch(`/registrations/${registrationId}/cancel`);
    showToast("Đã hủy đơn đăng ký thành công.", "success");
    await Promise.all([loadMyRegistrations(), loadMyWaitlist()]);
  } catch (error) {
    showToast(extractApiError(error, "Không thể hủy đơn đăng ký."), "error");
  }
}

function populateCampaignSelects(registrations) {
  const approvedRegs = registrations.filter((r) => r.status === "APPROVED");

  const checkinSelect = document.getElementById("checkinCampaignSelect");
  if (checkinSelect) {
    if (approvedRegs.length === 0) {
      checkinSelect.innerHTML = `<option value="">Chưa có chiến dịch nào được duyệt</option>`;
    } else {
      checkinSelect.innerHTML = approvedRegs
        .map((r) => `<option value="${r.campaign_id}">${escapeHtml(r.campaign_title)}</option>`)
        .join("");
    }
  }

  const appealSelect = document.getElementById("attendanceAppealCampaign");
  if (appealSelect) {
    appealSelect.innerHTML = approvedRegs.length ? approvedRegs.map(r =>
      `<option value="${Number(r.id)}">${escapeHtml(r.campaign_title || `Chiến dịch #${r.campaign_id}`)}</option>`
    ).join("") : `<option value="">Chưa có đơn tham gia đã duyệt</option>`;
  }

  const claimSelect = document.getElementById("claimCampaignSelect");
  if (claimSelect) {
    if (approvedRegs.length === 0) {
      claimSelect.innerHTML = `<option value="">Chưa có đơn tham gia nào được duyệt</option>`;
    } else {
      claimSelect.innerHTML = approvedRegs
        .map((r) => `<option value="${r.id}">${escapeHtml(r.campaign_title)} (REG-${r.id})</option>`)
        .join("");
    }
  }
}

function goToAttendance(campaignId) {
  switchUserTab("attendance");
  const select = document.getElementById("checkinCampaignSelect");
  if (select) select.value = String(campaignId);
}

/* ==================== TAB 2: ĐIỂM DANH ==================== */

function setupAttendanceActions() {
  const btnIn = document.getElementById("btnCheckIn");
  const btnOut = document.getElementById("btnCheckOut");
  if (btnIn) btnIn.addEventListener("click", () => submitAttendance("check-in"));
  if (btnOut) btnOut.addEventListener("click", () => submitAttendance("check-out"));
}

async function submitAttendance(action) {
  const campaignId = document.getElementById("checkinCampaignSelect")?.value;
  const codeInput = document.getElementById("checkinCodeInput");
  const code = codeInput?.value.trim().toUpperCase() || "";
  const alertBox = document.getElementById("attendanceResultAlert");

  if (!campaignId) {
    showToast("Bạn chưa có chiến dịch được duyệt để điểm danh.", "warning");
    return;
  }
  if (code.length !== 6) {
    showToast("Mã điểm danh phải gồm đúng 6 ký tự.", "warning");
    codeInput?.focus();
    return;
  }

  const btn = document.getElementById(action === "check-in" ? "btnCheckIn" : "btnCheckOut");
  if (btn) btn.disabled = true;

  try {
    const res = await api.post(`/attendances/${action}`, {
      campaign_id: Number(campaignId),
      code,
    });
    const att = res.data || {};
    const msg =
      action === "check-in"
        ? `Check-in thành công lúc ${safeFormatDateTime(att.check_in_at)}.`
        : `Check-out thành công (${att.total_minutes || 0} phút).`;

    if (alertBox) {
      alertBox.style.display = "block";
      alertBox.className = "status-pill status-approved";
      alertBox.textContent = msg;
    }
    showToast(msg, "success");
    if (codeInput) codeInput.value = "";
    await loadMyAttendanceHistory();
  } catch (error) {
    const errMsg = extractApiError(error, "Điểm danh thất bại.");
    if (alertBox) {
      alertBox.style.display = "block";
      alertBox.className = "status-pill status-rejected";
      alertBox.textContent = errMsg;
    }
    showToast(errMsg, "error");
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function loadMyAttendanceHistory(manual = false) {
  const tbody = document.getElementById("attendanceHistoryTbody");
  if (!tbody) return;
  const refreshBtn = document.getElementById("refreshAttendanceHistoryBtn");
  const hasRows = tbody.children.length > 0 && !tbody.querySelector("td[colspan]");
  const startedAt = Date.now();

  if (hasRows) {
    tbody.classList.add("is-refreshing");
  } else {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;padding:20px;color:var(--text-muted);">Đang tải lịch sử điểm danh...</td></tr>`;
  }
  setRefreshSpin(refreshBtn, true);

  try {
    const res = await api.get("/attendances/my-history");
    if (manual) await waitMinSpin(startedAt);
    const items = Array.isArray(res.data) ? res.data : [];

    const totalMinutes = items.reduce((sum, item) => sum + Number(item.total_minutes || 0), 0);
    attendanceTotalHours = totalMinutes / 60;
    updateTotalHoursStat();

    if (items.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;padding:20px;color:var(--text-muted);">Chưa có lịch sử điểm danh.</td></tr>`;
      if (manual) showToast("Đã cập nhật lịch sử điểm danh.", "success");
      return;
    }

    tbody.innerHTML = items
      .map((att) => {
        const st = ATT_STATUS_MAP[att.status] || { label: att.status, cls: "status-closed" };
        const hours = (Number(att.total_minutes || 0) / 60).toFixed(1);
        return `
          <tr>
            <td class="td-title">${escapeHtml(att.campaign_title || `Chiến dịch #${att.campaign_id}`)}</td>
            <td>
              <div>Vào: ${escapeHtml(safeFormatDateTime(att.check_in_at))}</div>
              <div style="font-size:0.78rem;color:var(--text-muted);">Ra: ${escapeHtml(safeFormatDateTime(att.check_out_at))}</div>
            </td>
            <td><strong>${hours}h</strong></td>
            <td><span class="status-pill ${st.cls}">${escapeHtml(st.label)}</span></td>
          </tr>
        `;
      })
      .join("");
    if (manual) showToast("Đã cập nhật lịch sử điểm danh.", "success");
  } catch (error) {
    const msg = extractApiError(error, "Không thể tải lịch sử điểm danh.");
    if (!hasRows) {
      tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;padding:20px;color:var(--danger);">${escapeHtml(msg)}</td></tr>`;
    } else if (typeof showToast === "function") {
      showToast(msg, "error");
    }
  } finally {
    tbody.classList.remove("is-refreshing");
    setRefreshSpin(refreshBtn, false);
  }
}

/* ==================== TAB 3: CHỨNG CHỈ & KHIẾU NẠI GIỜ ==================== */

function formatCertHours(hours) {
  const num = Number(hours || 0);
  if (!Number.isFinite(num)) return "0";
  return Number.isInteger(num) ? String(num) : num.toFixed(2).replace(/\.?0+$/, "");
}

function setupCertificateFilters() {
  if (certFilterInitialized) return;
  const searchInput = document.getElementById("certSearchInput");
  const statusSelect = document.getElementById("certStatusFilter");
  const sortSelect = document.getElementById("certSortSelect");
  if (searchInput) {
    searchInput.addEventListener("input", renderCertificates);
  }
  if (statusSelect) {
    statusSelect.addEventListener("change", renderCertificates);
  }
  if (sortSelect) {
    sortSelect.addEventListener("change", renderCertificates);
  }
  certFilterInitialized = true;
}

function renderCertificates() {
  const container = document.getElementById("certificatesContainer");
  if (!container) return;

  const query = (document.getElementById("certSearchInput")?.value || "").trim().toLowerCase();
  const statusFilter = document.getElementById("certStatusFilter")?.value || "ALL";
  const sortBy = document.getElementById("certSortSelect")?.value || "NEWEST";

  const filtered = cachedCertificates.filter((c) => {
    if (statusFilter !== "ALL" && c.status !== statusFilter) return false;
    if (!query) return true;
    const haystack = [
      c.campaign_title || "",
      c.organization_name || "",
      c.certificate_code || "",
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(query);
  });

  filtered.sort((a, b) => {
    if (sortBy === "MOST_HOURS") {
      return Number(b.total_hours || 0) - Number(a.total_hours || 0);
    }
    const timeA = (typeof parseApiDate === "function" ? parseApiDate(a.issued_at) : new Date(a.issued_at || 0))?.getTime() || 0;
    const timeB = (typeof parseApiDate === "function" ? parseApiDate(b.issued_at) : new Date(b.issued_at || 0))?.getTime() || 0;
    return sortBy === "OLDEST" ? timeA - timeB : timeB - timeA;
  });

  if (cachedCertificates.length === 0) {
    container.innerHTML = `<div class="cert-card" style="grid-column:1/-1;color:var(--text-muted);">Bạn chưa có chứng nhận điện tử nào.</div>`;
    return;
  }

  if (filtered.length === 0) {
    container.innerHTML = `<div class="cert-card" style="grid-column:1/-1;color:var(--text-muted);">Không tìm thấy chứng nhận phù hợp với bộ lọc hiện tại.</div>`;
    return;
  }

  container.innerHTML = filtered
    .map((c) => {
      const isRevoked = c.status === "REVOKED";
      const printUrl = `certificate-print.html?code=${encodeURIComponent(c.certificate_code)}`;
      const orgName = c.organization_name || "Đơn vị tổ chức chiến dịch";
      return `
        <article class="cert-card">
          <div class="cert-card-top">
            <span class="cert-code">${escapeHtml(c.certificate_code)}</span>
            <span class="status-pill ${isRevoked ? "status-rejected" : "status-approved"}">
              ${isRevoked ? "Đã thu hồi" : "Hợp lệ"}
            </span>
          </div>
          <div class="cert-title">${escapeHtml(c.campaign_title || `Chiến dịch #${c.campaign_id}`)}</div>
          <div class="cert-org">Đơn vị cấp: <strong>${escapeHtml(orgName)}</strong></div>
          <div class="cert-meta-grid">
            <div class="cert-meta-item">
              <span class="cert-meta-label">Số giờ</span>
              <span class="cert-meta-val cert-meta-val--hours">${escapeHtml(formatCertHours(c.total_hours))} giờ</span>
            </div>
            <div class="cert-meta-item">
              <span class="cert-meta-label">Ngày cấp</span>
              <span class="cert-meta-val">${escapeHtml(safeFormatDateTime(c.issued_at))}</span>
            </div>
          </div>
          ${
            isRevoked && c.revoked_reason
              ? `<div class="cert-meta" style="color:var(--danger);">Lý do thu hồi: ${escapeHtml(c.revoked_reason)}</div>`
              : ""
          }
          <div class="cert-actions">
            ${
              isRevoked
                ? `<button type="button" class="btn btn-outline btn-sm" disabled>Không thể in (Đã thu hồi)</button>`
                : `<a class="btn btn-primary btn-sm" href="${printUrl}">Xem &amp; In chứng nhận</a>`
            }
          </div>
        </article>
      `;
    })
    .join("");
}

async function loadCertificates() {
  const container = document.getElementById("certificatesContainer");
  const statCertEl = document.getElementById("statCertificates");
  const totalHoursEl = document.getElementById("certTotalHoursValue");
  const activeCountEl = document.getElementById("certActiveCountValue");
  if (!container) return;

  setupCertificateFilters();
  container.innerHTML = `<div class="cert-card" style="grid-column:1/-1;color:var(--text-muted);">Đang tải chứng nhận...</div>`;

  try {
    const res = await api.get("/certificates/me");
    const certs = Array.isArray(res.data) ? res.data : [];
    cachedCertificates = certs;

    const activeCerts = certs.filter((c) => c.status === "ACTIVE");
    const totalActiveHours = activeCerts.reduce((sum, c) => sum + Number(c.total_hours || 0), 0);

    if (statCertEl) statCertEl.textContent = String(activeCerts.length);
    if (activeCountEl) activeCountEl.textContent = `${activeCerts.length} chứng nhận`;
    if (totalHoursEl) totalHoursEl.textContent = `${formatCertHours(totalActiveHours)} giờ`;

    renderCertificates();
  } catch (error) {
    cachedCertificates = [];
    if (activeCountEl) activeCountEl.textContent = "--";
    if (totalHoursEl) totalHoursEl.textContent = "--";
    container.innerHTML = `<div class="cert-card" style="grid-column:1/-1;color:var(--danger);">${escapeHtml(extractApiError(error, "Không thể tải chứng nhận."))}</div>`;
  }
}

async function loadHourClaims(manual = false) {
  const tbody = document.getElementById("claimsTbody");
  if (!tbody) return;
  const refreshBtn = document.getElementById("refreshHourClaimsBtn");
  const hasRows = tbody.children.length > 0 && !tbody.querySelector("td[colspan]");
  const startedAt = Date.now();

  if (hasRows) {
    tbody.classList.add("is-refreshing");
  } else {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:20px;color:var(--text-muted);">Đang tải lịch sử khiếu nại...</td></tr>`;
  }
  if (refreshBtn) {
    refreshBtn.classList.add("is-spinning");
    refreshBtn.disabled = true;
  }

  const appealStatusMap = {
    PENDING: { label: "Chờ Admin xử lý (≤ 48h)", cls: "status-pending" },
    ACCEPTED: { label: "Admin đã chấp nhận", cls: "status-approved" },
    APPROVED: { label: "Admin đã chấp nhận", cls: "status-approved" },
    REJECTED: { label: "Admin từ chối", cls: "status-rejected" },
  };

  try {
    const res = await api.get("/hour-claims");
    if (manual) {
      const waitMs = Math.max(0, 450 - (Date.now() - startedAt));
      if (waitMs > 0) await new Promise((r) => setTimeout(r, waitMs));
    }
    const claims = Array.isArray(res.data) ? res.data : [];

    if (claims.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:20px;color:var(--text-muted);">Chưa có yêu cầu khiếu nại giờ nào.</td></tr>`;
      return;
    }

    const regTitleMap = new Map(
      cachedRegistrations.map((r) => [r.id, r.campaign_title || `Đơn #${r.id}`])
    );

    tbody.innerHTML = claims
      .map((cl) => {
        const st = cl.appeal_status
          ? appealStatusMap[cl.appeal_status] || { label: cl.appeal_status, cls: "status-closed" }
          : CLAIM_STATUS_MAP[cl.status] || { label: cl.status, cls: "status-closed" };
        const title = regTitleMap.get(cl.registration_id) || `Đơn đăng ký #${cl.registration_id}`;
        const canAppealToAdmin =
          !cl.appeal_status &&
          (cl.status === "REJECTED" ||
            (cl.status === "VERIFIED" && Number(cl.approved_hours || 0) < Number(cl.claimed_hours || 0)));
        const actionHtml = canAppealToAdmin
          ? `<button type="button" class="btn-action btn-action-primary" onclick="appealHourClaim(${Number(cl.id)})">Khiếu nại lên Admin</button>`
          : `<span style="color:var(--text-muted);">—</span>`;

        return `
          <tr>
            <td class="td-title">${escapeHtml(title)}</td>
            <td><strong>+${Number(cl.claimed_hours || 0)}h</strong></td>
            <td style="color:var(--text-muted);">${escapeHtml(cl.note || cl.rejection_reason || "—")}</td>
            <td><span class="status-pill ${st.cls}">${escapeHtml(st.label)}</span></td>
            <td>${actionHtml}</td>
          </tr>
        `;
      })
      .join("");
    if (manual && typeof showToast === "function") {
      showToast("Đã cập nhật lịch sử khiếu nại giờ.", "success");
    }
  } catch (error) {
    const msg = extractApiError(error, "Không thể tải khiếu nại giờ.");
    if (!hasRows) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:20px;color:var(--danger);">${escapeHtml(msg)}</td></tr>`;
    } else if (typeof showToast === "function") {
      showToast(msg, "error");
    }
  } finally {
    tbody.classList.remove("is-refreshing");
    if (refreshBtn) {
      refreshBtn.classList.remove("is-spinning");
      refreshBtn.disabled = false;
    }
  }
}

function appealHourClaim(claimId) {
  const idInput = document.getElementById("hourAppealClaimId");
  const reasonInput = document.getElementById("hourAppealReasonInput");
  if (idInput) idInput.value = String(claimId);
  if (reasonInput) reasonInput.value = "";
  openModal("hourAppealModal");
}

async function submitHourClaimAppeal() {
  const claimId = Number(document.getElementById("hourAppealClaimId")?.value);
  const reason = (document.getElementById("hourAppealReasonInput")?.value || "").trim();
  const btn = document.getElementById("confirmHourAppealBtn");
  if (!claimId || !reason) {
    showToast("Vui lòng nhập lý do khiếu nại.", "warning");
    document.getElementById("hourAppealReasonInput")?.focus();
    return;
  }
  if (btn) btn.disabled = true;
  try {
    await api.post(`/hour-claims/${claimId}/appeals`, { appeal_reason: reason });
    closeModal("hourAppealModal");
    showToast("Đã gửi khiếu nại đến Quản trị viên (xử lý trong vòng 48 giờ).", "success");
    await loadHourClaims();
  } catch (error) {
    showToast(extractApiError(error, "Không thể gửi khiếu nại."), "error");
  } finally {
    if (btn) btn.disabled = false;
  }
}

function openClaimModal() {
  openModal("claimModal");
}

async function submitHourClaim() {
  const regId = document.getElementById("claimCampaignSelect")?.value;
  const hours = Number(document.getElementById("claimHoursInput")?.value || 0);
  const evidenceUrl = document.getElementById("claimEvidenceInput")?.value.trim() || null;
  const note = document.getElementById("claimNoteInput")?.value.trim() || null;

  if (!regId) {
    showToast("Bạn chưa có đơn tham gia được duyệt để khiếu nại.", "warning");
    return;
  }
  if (hours <= 0) {
    showToast("Số giờ đề nghị phải lớn hơn 0.", "warning");
    return;
  }

  try {
    await api.post("/hour-claims", {
      registration_id: Number(regId),
      claimed_hours: hours,
      note,
      evidence_url: evidenceUrl,
    });
    showToast("Đã gửi yêu cầu xác nhận giờ.", "success");
    closeModal("claimModal");
    await loadHourClaims();
  } catch (error) {
    showToast(extractApiError(error, "Gửi khiếu nại giờ thất bại."), "error");
  }
}

/* ==================== TAB 4: HỒ SƠ & KỸ NĂNG ==================== */

function setupProfilePreview() {
  const skillsInput = document.getElementById("profSkills");
  if (skillsInput) {
    skillsInput.addEventListener("input", () => renderSkillTagsPreview(skillsInput.value));
  }

  const avatarEl = document.getElementById("profileAvatarBig");
  if (avatarEl) {
    const openPreview = () => openAvatarPreviewModal(currentUser?.avatar_url, currentUser?.full_name);
    avatarEl.addEventListener("click", openPreview);
    avatarEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openPreview();
      }
    });
  }

  const avatarInput = document.getElementById("userAvatarFileInput");
  if (avatarInput) {
    avatarInput.addEventListener("change", async () => {
      const file = avatarInput.files?.[0];
      if (!file) return;
      try {
        const updated = await uploadAvatarFile(file);
        if (updated) {
          currentUser.avatar_url = updated.avatar_url || null;
          localStorage.setItem("auth_user", JSON.stringify(currentUser));
          setupUserHeader();
          showToast("Đã cập nhật ảnh đại diện.", "success");
        }
      } catch (error) {
        const msg = error?.response ? extractApiError(error, "Tải ảnh đại diện thất bại.") : (error?.message || "Tải ảnh đại diện thất bại.");
        showToast(msg, "error");
      } finally {
        avatarInput.value = "";
      }
    });
  }
}

function renderSkillTagsPreview(skillsStr) {
  const preview = document.getElementById("profSkillTagsPreview");
  if (!preview) return;
  const tags = String(skillsStr || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  preview.innerHTML = tags.map((t) => `<span class="ud-skill-tag">${escapeHtml(t)}</span>`).join("");
}

async function loadProfile() {
  try {
    const res = await api.get("/profile/me");
    const p = res.data || {};

    const setVal = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.value = val || "";
    };

    setVal("profFullName", p.full_name || currentUser.full_name);
    setVal("profEmail", p.email || currentUser.email);
    setVal("profPhone", p.phone || "");
    setVal("profSkills", p.skills || "");
    setVal("profPreferredArea", p.area || "");
    renderSkillTagsPreview(p.skills || "");

    if (p.avatar_url !== undefined) {
      currentUser.avatar_url = p.avatar_url;
      localStorage.setItem("auth_user", JSON.stringify(currentUser));
      setupUserHeader();
    }

    if (p.total_hours != null && Number.isFinite(Number(p.total_hours))) {
      profileTotalHours = Number(p.total_hours);
      updateTotalHoursStat();
    }
  } catch {
    const emailEl = document.getElementById("profEmail");
    const nameEl = document.getElementById("profFullName");
    if (emailEl) emailEl.value = currentUser.email || "";
    if (nameEl) nameEl.value = currentUser.full_name || "";
  }
}

async function saveUserProfile() {
  const fullName = document.getElementById("profFullName")?.value.trim();
  const phone = document.getElementById("profPhone")?.value.trim() || null;

  if (!fullName) {
    showToast("Vui lòng nhập họ và tên.", "warning");
    return;
  }
  if (phone && !/^0\d{9,10}$/.test(phone)) {
    showToast("Số điện thoại phải gồm 10–11 chữ số và bắt đầu bằng số 0.", "warning");
    return;
  }

  try {
    const res = await api.patch("/profile/me", { full_name: fullName, phone });
    currentUser.full_name = res.data?.full_name || fullName;
    localStorage.setItem("auth_user", JSON.stringify(currentUser));
    setupUserHeader();
    showToast("Đã cập nhật thông tin tài khoản.", "success");
  } catch (error) {
    showToast(extractApiError(error, "Không thể cập nhật thông tin."), "error");
  }
}

async function saveVolunteerSkills() {
  const skills = document.getElementById("profSkills")?.value.trim() || null;
  const area = document.getElementById("profPreferredArea")?.value.trim() || null;

  try {
    await api.patch("/profile/me/volunteer", { skills, area });
    renderSkillTagsPreview(skills || "");
    showToast("Đã lưu kỹ năng và khu vực ưu tiên.", "success");
  } catch (error) {
    showToast(extractApiError(error, "Không thể cập nhật kỹ năng."), "error");
  }
}

async function submitUserChangePassword() {
  const oldPassword = document.getElementById("profOldPassword")?.value || "";
  const newPassword = document.getElementById("profNewPassword")?.value || "";
  const confirmPassword = document.getElementById("profConfirmPassword")?.value || "";
  const btn = document.getElementById("btnChangeUserPassword");

  if (!oldPassword || !newPassword || !confirmPassword) {
    showToast("Vui lòng nhập đầy đủ mật khẩu hiện tại và mật khẩu mới.", "warning");
    return;
  }
  if (newPassword.length < 8) {
    showToast("Mật khẩu mới phải có ít nhất 8 ký tự.", "warning");
    document.getElementById("profNewPassword")?.focus();
    return;
  }
  if (newPassword === oldPassword) {
    showToast("Mật khẩu mới phải khác mật khẩu hiện tại.", "warning");
    document.getElementById("profNewPassword")?.focus();
    return;
  }
  if (newPassword !== confirmPassword) {
    showToast("Xác nhận mật khẩu mới không khớp.", "warning");
    document.getElementById("profConfirmPassword")?.focus();
    return;
  }

  if (btn) btn.disabled = true;
  try {
    await api.post("/profile/change-password", {
      old_password: oldPassword,
      new_password: newPassword,
    });
    showToast("Đổi mật khẩu thành công! Vui lòng đăng nhập lại với mật khẩu mới.", "success");
    document.getElementById("profOldPassword").value = "";
    document.getElementById("profNewPassword").value = "";
    document.getElementById("profConfirmPassword").value = "";
    setTimeout(() => {
      Auth.clearSession();
      window.location.replace("login.html");
    }, 1200);
  } catch (error) {
    showToast(extractApiError(error, "Không thể đổi mật khẩu."), "error");
    if (btn) btn.disabled = false;
  }
}

/* ==================== TAB 5: ĐĂNG KÝ LÀM TỔ CHỨC ==================== */

async function loadOrganizationStatus() {
  const statusContainer = document.getElementById("orgAppStatusContainer");
  const formCard = document.getElementById("orgAppFormCard");
  const navBadge = document.getElementById("orgUpgradeNavBadge");
  const submitBtn = document.getElementById("btnSubmitOrgApplication");
  if (!statusContainer) return;

  try {
    const res = await api.get("/organizations/me");
    const org = res.data;
    if (!org) return;
    currentMyOrg = org;

    if (formCard) formCard.style.display = org.status === "REJECTED" ? "" : "none";

    if (org.status === "APPROVED") {
      if (navBadge) navBadge.textContent = "Đã duyệt";
      statusContainer.innerHTML = `
        <div class="ud-card"><div class="ud-card-body">
          <span class="status-pill status-approved">Tổ chức đã được phê duyệt</span>
          <h3 style="margin:10px 0 6px;">${escapeHtml(org.name)}</h3>
          <p style="color:var(--text-muted);margin-bottom:14px;">Bạn đã đủ điều kiện tạo chiến dịch và quản lý tình nguyện viên.</p>
          <a href="organizer-dashboard.html" class="btn btn-primary">Mở Cổng Nhà Tổ Chức</a>
        </div></div>`;
    } else if (org.status === "PENDING") {
      if (navBadge) navBadge.textContent = "Chờ duyệt";
      statusContainer.innerHTML = `
        <div class="ud-card"><div class="ud-card-body">
          <span class="status-pill status-pending">Đang chờ Admin xét duyệt</span>
          <h3 style="margin:10px 0 6px;">${escapeHtml(org.name)}</h3>
          <p style="color:var(--text-muted);margin:0;">Hồ sơ tổ chức của bạn đã được tiếp nhận và đang chờ quản trị viên kiểm duyệt.</p>
        </div></div>`;
    } else if (org.status === "REJECTED") {
      if (navBadge) navBadge.textContent = "Bị từ chối";
      if (submitBtn) submitBtn.textContent = "Gửi lại hồ sơ xét duyệt";
      const setVal = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.value = val || "";
      };
      setVal("appOrgName", org.name);
      setVal("appOrgEmail", org.email);
      setVal("appOrgPhone", org.phone);
      setVal("appOrgAddress", org.address);
      setVal("appOrgDocUrl", org.document_url);
      setVal("appOrgDesc", org.description);

      statusContainer.innerHTML = `
        <div class="ud-card"><div class="ud-card-body">
          <span class="status-pill status-rejected">Hồ sơ chưa được duyệt</span>
          <h3 style="margin:10px 0 6px;">${escapeHtml(org.name)}</h3>
          <p style="color:var(--danger);margin:0;">Lý do: ${escapeHtml(org.rejection_reason || "Chưa đạt yêu cầu xác minh.")}</p>
        </div></div>`;
    }
  } catch (error) {
    if (error?.response?.status === 404) {
      currentMyOrg = null;
      statusContainer.innerHTML = "";
      if (formCard) formCard.style.display = "";
      if (submitBtn) submitBtn.textContent = "Gửi hồ sơ xét duyệt";
      return;
    }
    statusContainer.innerHTML = `<div class="ud-card"><div class="ud-card-body" style="color:var(--danger);">${escapeHtml(extractApiError(error, "Không thể kiểm tra hồ sơ tổ chức."))}</div></div>`;
  }
}

async function submitOrganizerApplication() {
  const name = document.getElementById("appOrgName")?.value.trim();
  const email = document.getElementById("appOrgEmail")?.value.trim();
  const phone = document.getElementById("appOrgPhone")?.value.trim();
  const address = document.getElementById("appOrgAddress")?.value.trim();
  const document_url = document.getElementById("appOrgDocUrl")?.value.trim() || null;
  const description = document.getElementById("appOrgDesc")?.value.trim() || null;

  if (!name || !email || !phone || !address) {
    showToast("Vui lòng điền đầy đủ Tên tổ chức, Email, Số điện thoại và Địa chỉ.", "warning");
    return;
  }

  const isResubmit = currentMyOrg?.status === "REJECTED";
  const btn = document.getElementById("btnSubmitOrgApplication");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Đang gửi...";
  }

  try {
    const payload = {
      name,
      email,
      phone,
      address,
      document_url,
      description,
    };
    if (isResubmit) {
      await api.put("/organizations/me", payload);
      showToast("Đã cập nhật và gửi lại hồ sơ tổ chức thành công!", "success");
    } else {
      await api.post("/organizations/", payload);
      showToast("Đã gửi hồ sơ đăng ký tổ chức thành công!", "success");
    }
    await loadOrganizationStatus();
  } catch (error) {
    showToast(extractApiError(error, "Gửi hồ sơ tổ chức thất bại."), "error");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = currentMyOrg?.status === "REJECTED" ? "Gửi lại hồ sơ xét duyệt" : "Gửi hồ sơ xét duyệt";
    }
  }
}

/* ==================== KHIẾU NẠI ĐIỂM DANH ==================== */
function setupAttendanceAppeals() {
  const form = document.getElementById("attendanceAppealForm");
  if (!form) return;
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const registrationId = Number(document.getElementById("attendanceAppealCampaign")?.value);
    const reason = document.getElementById("attendanceAppealReason")?.value.trim() || "";
    const evidence = document.getElementById("attendanceAppealEvidence")?.value.trim() || "";
    if (!registrationId || reason.length < 10) { showToast("Chọn đơn và nhập lý do tối thiểu 10 ký tự.", "warning"); return; }
    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    try {
      await api.post("/attendance-appeals", {registration_id: registrationId, reason, evidence_url: evidence || null});
      showToast("Đã gửi khiếu nại điểm danh.", "success");
      form.reset();
      await loadMyAttendanceAppeals();
    } catch (error) {
      showToast(extractApiError(error, "Không gửi được khiếu nại điểm danh."), "error");
    } finally { btn.disabled = false; }
  });
}

async function loadMyAttendanceAppeals() {
  const panel = document.getElementById("attendanceAppealsMine");
  if (!panel) return;
  try {
    const response = await api.get("/attendance-appeals/me");
    const rows = Array.isArray(response.data) ? response.data : [];
    const statusMap = {
      PENDING: { label: "Chờ Organizer", cls: "status-pending" },
      ACCEPTED: { label: "Organizer chấp nhận", cls: "status-approved" },
      REJECTED: { label: "Organizer từ chối", cls: "status-rejected" },
      ADMIN_PENDING: { label: "Chờ Admin xử lý (≤ 48h)", cls: "status-pending" },
      ADMIN_ACCEPTED: { label: "Admin chấp nhận", cls: "status-approved" },
      ADMIN_REJECTED: { label: "Admin từ chối", cls: "status-rejected" },
    };
    if (!rows.length) {
      panel.innerHTML = `<div class="vl-appeal-meta">Chưa có khiếu nại điểm danh nào.</div>`;
      return;
    }
    panel.innerHTML = `
      <div style="font-weight: 700; margin-bottom: 10px; color: var(--text-main);">Khiếu nại điểm danh đã gửi (${rows.length})</div>
      <div class="vl-appeal-list">
        ${rows.map((a) => {
          const st = statusMap[a.status] || { label: a.status, cls: "status-closed" };
          return `
            <div class="vl-appeal-item">
              <div class="vl-appeal-head">
                <strong>${escapeHtml(a.campaign_title || `Đơn #${Number(a.registration_id)}`)}</strong>
                <span class="status-pill ${st.cls}">${escapeHtml(st.label)}</span>
              </div>
              ${a.reason ? `<div class="vl-appeal-reason">${escapeHtml(a.reason)}</div>` : ""}
              ${a.review_note ? `<div class="vl-appeal-meta">Phản hồi Organizer: ${escapeHtml(a.review_note)}</div>` : ""}
              ${a.escalation_reason ? `<div class="vl-appeal-meta">Lý do lên Admin: ${escapeHtml(a.escalation_reason)}</div>` : ""}
              ${a.status === "ADMIN_PENDING" && a.sla_deadline ? `<div class="vl-appeal-meta">Cam kết xử lý trong 48 giờ (Hạn: ${escapeHtml(safeFormatDateTime(a.sla_deadline))})</div>` : ""}
              ${a.admin_note ? `<div class="vl-appeal-meta">Phản hồi Admin: ${escapeHtml(a.admin_note)}</div>` : ""}
              ${a.status === "REJECTED" ? `<div style="margin-top:8px;"><button type="button" class="btn-action btn-action-primary" onclick="escalateAttendanceAppeal(${Number(a.id)})">Khiếu nại lên Admin</button></div>` : ""}
            </div>
          `;
        }).join("")}
      </div>
    `;
  } catch (error) {
    panel.textContent = extractApiError(error, "Không tải được khiếu nại điểm danh.");
  }
}

function escalateAttendanceAppeal(appealId) {
  const idInput = document.getElementById("escalateAttAppealId");
  const reasonInput = document.getElementById("escalateAttAppealReasonInput");
  if (idInput) idInput.value = String(appealId);
  if (reasonInput) reasonInput.value = "";
  openModal("escalateAttendanceAppealModal");
}

async function submitEscalateAttendanceAppeal() {
  const appealId = Number(document.getElementById("escalateAttAppealId")?.value || 0);
  const reasonInput = document.getElementById("escalateAttAppealReasonInput");
  const btn = document.getElementById("confirmEscalateAttAppealBtn");
  const trimmed = (reasonInput?.value || "").trim();
  if (!appealId) return;
  if (trimmed.length < 10) {
    showToast("Lý do khiếu nại lên Admin phải có ít nhất 10 ký tự.", "warning");
    reasonInput?.focus();
    return;
  }
  if (btn) btn.disabled = true;
  try {
    await api.post(`/attendance-appeals/${appealId}/escalate`, { escalation_reason: trimmed });
    closeModal("escalateAttendanceAppealModal");
    showToast("Đã chuyển khiếu nại lên Quản trị viên (xử lý trong vòng 48 giờ).", "success");
    await loadMyAttendanceAppeals();
    if (typeof NotificationsUI !== "undefined") NotificationsUI.refresh();
  } catch (error) {
    showToast(extractApiError(error, "Không thể gửi khiếu nại lên Admin."), "error");
  } finally {
    if (btn) btn.disabled = false;
  }
}
