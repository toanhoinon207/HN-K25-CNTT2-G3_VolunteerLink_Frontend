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
let currentMyOrg = null;

const REG_STATUS_MAP = {
  PENDING: { label: "Đang chờ duyệt", cls: "status-pending" },
  APPROVED: { label: "Đã duyệt tham gia", cls: "status-approved" },
  REJECTED: { label: "Bị từ chối", cls: "status-rejected" },
  CANCELLED: { label: "Đã hủy", cls: "status-closed" },
};

const ATT_STATUS_MAP = {
  PRESENT: { label: "Có mặt", cls: "status-approved" },
  LATE: { label: "Đi muộn", cls: "status-pending" },
  ABSENT: { label: "Vắng mặt", cls: "status-rejected" },
  EXCUSED: { label: "Có phép", cls: "status-closed" },
};

const CLAIM_STATUS_MAP = {
  PENDING: { label: "Chờ duyệt", cls: "status-pending" },
  VERIFIED: { label: "Đã xác nhận", cls: "status-approved" },
  REJECTED: { label: "Bị từ chối", cls: "status-rejected" },
};

function extractApiError(error, fallback = "Đã xảy ra lỗi khi kết nối máy chủ.") {
  const detail = error?.response?.data?.detail;
  if (typeof detail === "string" && detail.trim()) return detail;
  if (Array.isArray(detail) && detail.length > 0) {
    return detail.map((item) => item.msg || "Dữ liệu không hợp lệ").join("; ");
  }
  if (error?.code === "ECONNABORTED") return "Quá thời gian kết nối tới máy chủ.";
  if (!error?.response) return "Không thể kết nối tới Backend. Vui lòng kiểm tra server đã bật chưa.";
  return fallback;
}

function safeFormatDateTime(value) {
  if (!value) return "--";
  const d = new Date(value);
  if (isNaN(d.getTime())) return "--";
  return typeof formatDateTime === "function" ? formatDateTime(value) : d.toLocaleString("vi-VN");
}

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

  await loadMyRegistrations();
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

  const initialTab = new URLSearchParams(window.location.search).get("tab");
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

/* ==================== TAB 1: TỔNG QUAN & ĐƠN ĐĂNG KÝ ==================== */

async function loadMyRegistrations() {
  const tbody = document.getElementById("myRegistrationsTbody");
  if (!tbody) return;

  tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:24px;color:var(--text-muted);">Đang tải danh sách đăng ký...</td></tr>`;

  try {
    const res = await api.get("/registrations/me");
    cachedRegistrations = Array.isArray(res.data) ? res.data : [];

    const countEl = document.getElementById("myRegsCountBadge");
    const statEl = document.getElementById("statRegistered");
    if (countEl) countEl.textContent = String(cachedRegistrations.length);
    if (statEl) statEl.textContent = String(cachedRegistrations.length);

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
        } else if (reg.status === "PENDING") {
          actionHtml = `<button type="button" class="btn-action" onclick="cancelMyRegistration(${Number(reg.id)})">Hủy đơn</button>`;
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
  } catch (error) {
    const msg = extractApiError(error, "Không thể tải danh sách đăng ký.");
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:24px;color:var(--danger);">${escapeHtml(msg)}</td></tr>`;
  }
}

function renderMyRegistrations() {
  return loadMyRegistrations();
}

async function cancelMyRegistration(registrationId) {
  try {
    await api.patch(`/registrations/${registrationId}/cancel`);
    showToast("Đã hủy đơn đăng ký thành công.", "success");
    await loadMyRegistrations();
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

async function loadMyAttendanceHistory() {
  const tbody = document.getElementById("attendanceHistoryTbody");
  if (!tbody) return;

  tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;padding:20px;color:var(--text-muted);">Đang tải lịch sử điểm danh...</td></tr>`;

  try {
    const res = await api.get("/attendances/my-history");
    const items = Array.isArray(res.data) ? res.data : [];

    const totalMinutes = items.reduce((sum, item) => sum + Number(item.total_minutes || 0), 0);
    const statHoursEl = document.getElementById("statTotalHours");
    if (statHoursEl) statHoursEl.textContent = (totalMinutes / 60).toFixed(1);

    if (items.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;padding:20px;color:var(--text-muted);">Chưa có lịch sử điểm danh.</td></tr>`;
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
  } catch (error) {
    const msg = extractApiError(error, "Không thể tải lịch sử điểm danh.");
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;padding:20px;color:var(--danger);">${escapeHtml(msg)}</td></tr>`;
  }
}

/* ==================== TAB 3: CHỨNG CHỈ & KHIẾU NẠI GIỜ ==================== */

async function loadCertificates() {
  const container = document.getElementById("certificatesContainer");
  const statCertEl = document.getElementById("statCertificates");
  if (!container) return;

  container.innerHTML = `<div class="cert-card" style="grid-column:1/-1;color:var(--text-muted);">Đang tải chứng chỉ...</div>`;

  try {
    const res = await api.get("/certificates/me");
    const certs = Array.isArray(res.data) ? res.data : [];

    const activeCount = certs.filter((c) => c.status === "ACTIVE").length;
    if (statCertEl) statCertEl.textContent = String(activeCount);

    if (certs.length === 0) {
      container.innerHTML = `<div class="cert-card" style="grid-column:1/-1;color:var(--text-muted);">Bạn chưa có chứng chỉ điện tử nào.</div>`;
      return;
    }

    container.innerHTML = certs
      .map((c) => {
        const isRevoked = c.status === "REVOKED";
        return `
          <article class="cert-card">
            <span class="cert-code">${escapeHtml(c.certificate_code)}</span>
            <div class="cert-title">${escapeHtml(c.campaign_title || `Chiến dịch #${c.campaign_id}`)}</div>
            <div class="cert-meta">Số giờ ghi nhận: <strong>${Number(c.total_hours || 0)} giờ</strong></div>
            <div class="cert-meta">Ngày cấp: ${escapeHtml(safeFormatDateTime(c.issued_at))}</div>
            <div>
              <span class="status-pill ${isRevoked ? "status-rejected" : "status-approved"}">
                ${isRevoked ? "Đã thu hồi" : "Hợp lệ"}
              </span>
            </div>
          </article>
        `;
      })
      .join("");
  } catch (error) {
    container.innerHTML = `<div class="cert-card" style="grid-column:1/-1;color:var(--danger);">${escapeHtml(extractApiError(error, "Không thể tải chứng chỉ."))}</div>`;
  }
}

async function loadHourClaims() {
  const tbody = document.getElementById("claimsTbody");
  if (!tbody) return;

  tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;padding:20px;color:var(--text-muted);">Đang tải lịch sử khiếu nại...</td></tr>`;

  try {
    const res = await api.get("/hour-claims");
    const claims = Array.isArray(res.data) ? res.data : [];

    if (claims.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;padding:20px;color:var(--text-muted);">Chưa có yêu cầu khiếu nại giờ nào.</td></tr>`;
      return;
    }

    const regTitleMap = new Map(
      cachedRegistrations.map((r) => [r.id, r.campaign_title || `Đơn #${r.id}`])
    );

    tbody.innerHTML = claims
      .map((cl) => {
        const st = CLAIM_STATUS_MAP[cl.status] || { label: cl.status, cls: "status-closed" };
        const title = regTitleMap.get(cl.registration_id) || `Đơn đăng ký #${cl.registration_id}`;
        return `
          <tr>
            <td class="td-title">${escapeHtml(title)}</td>
            <td><strong>+${Number(cl.claimed_hours || 0)}h</strong></td>
            <td style="color:var(--text-muted);">${escapeHtml(cl.note || cl.rejection_reason || "—")}</td>
            <td><span class="status-pill ${st.cls}">${escapeHtml(st.label)}</span></td>
          </tr>
        `;
      })
      .join("");
  } catch (error) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;padding:20px;color:var(--danger);">${escapeHtml(extractApiError(error, "Không thể tải khiếu nại giờ."))}</td></tr>`;
  }
}

function openClaimModal() {
  document.getElementById("claimModal")?.classList.add("open");
}

function closeModal(modalId) {
  document.getElementById(modalId)?.classList.remove("open");
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

    const statHoursEl = document.getElementById("statTotalHours");
    if (statHoursEl && p.total_hours != null && Number(p.total_hours) > 0) {
      statHoursEl.textContent = Number(p.total_hours).toFixed(1);
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
    panel.innerHTML = rows.length ? `<strong>Khiếu nại điểm danh đã gửi</strong><ul>${rows.map(a =>
      `<li>Đơn #${Number(a.registration_id)} — ${escapeHtml(a.status)}${a.review_note ? ` — ${escapeHtml(a.review_note)}` : ""}</li>`
    ).join("")}</ul>` : "Chưa có khiếu nại điểm danh.";
  } catch (error) {
    panel.textContent = extractApiError(error, "Không tải được khiếu nại điểm danh.");
  }
}
