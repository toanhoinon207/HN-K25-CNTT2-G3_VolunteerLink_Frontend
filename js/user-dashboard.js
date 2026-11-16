/**
 * Logic điều khiển Bảng điều khiển Tình nguyện viên (Role: USER)
 * Tích hợp Backend API: /auth/me, /api/attendances/check-in, /api/attendances/check-out, DataStore
 */

let currentUser = null;

document.addEventListener("DOMContentLoaded", async () => {
  // 1. Kiểm tra xác thực & vai trò USER
  currentUser = await Auth.requireAuth(["USER", "ORGANIZER"]);
  if (!currentUser) return;

  // 2. Thiết lập thông tin cá nhân trên giao diện
  setupUserHeader();

  // 3. Khởi tạo các Tab và Lắng nghe sự kiện
  setupTabs();
  setupMobileMenu();

  // 4. Nạp dữ liệu các thành phần
  renderDashboardOverview();
  renderMyRegistrations();
  setupAttendanceModule();
  renderCampaignsList();
  renderCertificatesAndClaims();
  setupProfileForm();
  renderOrganizerApplicationStatus();

  // 5. Đăng xuất
  document.getElementById("logoutBtn").addEventListener("click", () => {
    Auth.logout();
  });
});

function setupUserHeader() {
  const fullName = currentUser.full_name || currentUser.name || "Tình nguyện viên";
  const firstLetter = fullName.trim().charAt(0).toUpperCase();

  document.getElementById("headerUserName").textContent = fullName;
  document.getElementById("headerAvatar").textContent = firstLetter;
  document.getElementById("welcomeUserName").textContent = fullName;

  if (document.getElementById("profileAvatarBig")) {
    document.getElementById("profileAvatarBig").textContent = firstLetter;
    document.getElementById("profNameDisplay").textContent = fullName;
  }
}

function setupTabs() {
  const navItems = document.querySelectorAll(".dash-nav-item[data-tab]");
  navItems.forEach(item => {
    item.addEventListener("click", (e) => {
      e.preventDefault();
      const tabId = item.getAttribute("data-tab");
      switchUserTab(tabId);
    });
  });
}

function switchUserTab(tabId) {
  // Update nav item active state
  document.querySelectorAll(".dash-nav-item[data-tab]").forEach(nav => {
    if (nav.getAttribute("data-tab") === tabId) {
      nav.classList.add("active");
    } else {
      nav.classList.remove("active");
    }
  });

  // Switch tab panels
  document.querySelectorAll(".tab-panel").forEach(panel => {
    panel.classList.remove("active");
  });
  const targetPanel = document.getElementById("tab-" + tabId);
  if (targetPanel) {
    targetPanel.classList.add("active");
  }

  // Close mobile sidebar if open
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

// ================= TAB 1: OVERVIEW & MY REGISTRATIONS =================
let cachedMyRegistrations = null;
let cachedMyAttendances = null;
let cachedPublicCampaigns = null;

// Lấy danh sách đơn đăng ký trực tiếp từ Database
async function fetchMyRegistrationsFromDB(forceRefresh = false) {
  if (cachedMyRegistrations && !forceRefresh) {
    return cachedMyRegistrations;
  }
  try {
    const res = await api.get("/registrations/me");
    if (Array.isArray(res.data)) {
      cachedMyRegistrations = res.data;
      return cachedMyRegistrations;
    }
  } catch (err) {
    console.warn("Không thể tải đơn đăng ký từ Backend, dùng dữ liệu lưu trữ:", err);
  }
  return getMyRegistrationsData();
}

// Lấy lịch sử điểm danh mới nhất trực tiếp từ Database
async function fetchMyAttendanceHistoryFromDB(forceRefresh = false) {
  if (cachedMyAttendances && !forceRefresh) {
    return cachedMyAttendances;
  }
  try {
    const res = await api.get("/attendances/my-history");
    if (Array.isArray(res.data)) {
      cachedMyAttendances = res.data;
      return cachedMyAttendances;
    }
  } catch (err) {
    console.warn("Không thể tải lịch sử điểm danh từ Backend, dùng dữ liệu lưu trữ:", err);
  }
  const attendances = DataStore.get(DataStore.STORAGE_KEYS.ATTENDANCES) || [];
  return attendances.filter(a => a.user_id === currentUser.id);
}

// Lấy danh sách chiến dịch mở tuyển mới nhất trực tiếp từ Database
async function fetchPublicCampaignsFromDB() {
  if (cachedPublicCampaigns) {
    return cachedPublicCampaigns;
  }
  try {
    const res = await api.get("/campaigns?page=1&page_size=50");
    if (res.data && Array.isArray(res.data.items)) {
      cachedPublicCampaigns = res.data.items;
      return cachedPublicCampaigns;
    }
  } catch (err) {
    console.warn("Không thể tải chiến dịch từ Backend, dùng dữ liệu lưu trữ:", err);
  }
  return DataStore.getCampaigns().filter(c => c.status === "OPEN");
}

async function renderDashboardOverview() {
  const myRegs = await fetchMyRegistrationsFromDB();
  const certs = DataStore.getCertificates().filter(c => c.user_id === currentUser.id);

  let totalHours = 0;
  certs.forEach(c => {
    if (c.status === "ACTIVE") totalHours += Number(c.total_hours || 0);
  });

  const statReg = document.getElementById("statRegistered");
  if (statReg) statReg.textContent = myRegs.length;
  const statHours = document.getElementById("statTotalHours");
  if (statHours) statHours.textContent = totalHours.toFixed(1) + "h";
  const statCerts = document.getElementById("statCertificates");
  if (statCerts) statCerts.textContent = certs.length;
  const myRegsBadge = document.getElementById("myRegsCountBadge");
  if (myRegsBadge) myRegsBadge.textContent = myRegs.length;
}

function getMyRegistrationsData() {
  const allRegs = DataStore.getRegistrations();
  return allRegs.filter(r => r.user_id === currentUser.id || r.user_email === currentUser.email);
}

async function renderMyRegistrations(forceRefresh = false) {
  const tbody = document.getElementById("myRegistrationsTbody");
  if (!tbody) return;

  const myRegs = await fetchMyRegistrationsFromDB(forceRefresh);

  const myRegsBadge = document.getElementById("myRegsCountBadge");
  if (myRegsBadge) myRegsBadge.textContent = myRegs.length;
  const statReg = document.getElementById("statRegistered");
  if (statReg) statReg.textContent = myRegs.length;

  if (myRegs.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" style="text-align: center; padding: 36px; color: #94a3b8;">
          Bạn chưa đăng ký tham gia chiến dịch nào trong cơ sở dữ liệu. Hãy khám phá và đăng ký ngay!
        </td>
      </tr>
    `;
    return;
  }

  const statusMap = {
    APPROVED: { label: "Đã duyệt tham gia", class: "status-approved" },
    PENDING: { label: "Đang chờ duyệt", class: "status-pending" },
    REJECTED: { label: "Bị từ chối", class: "status-rejected" },
    CANCELLED: { label: "Đã hủy", class: "status-draft" }
  };

  tbody.innerHTML = myRegs.map(reg => {
    const st = statusMap[reg.status] || { label: reg.status, class: "status-draft" };
    return `
      <tr>
        <td>
          <div class="td-title">${escapeHtml(reg.campaign_title || `Chiến dịch #${reg.campaign_id}`)}</div>
          <div class="td-subtitle">Mã đơn: REG-${reg.id}</div>
        </td>
        <td>
          <div style="font-weight: 500;">Ngày nộp: ${reg.created_at ? formatDateTime(reg.created_at) : "Mới đây"}</div>
        </td>
        <td>
          <span class="status-pill ${st.class}">
            <span class="status-dot"></span>
            ${st.label}
          </span>
          ${reg.rejection_reason ? `<div style="font-size: 11px; color: #b91c1c; margin-top: 4px;">Lý do: ${escapeHtml(reg.rejection_reason)}</div>` : ""}
        </td>
        <td>
          <div style="max-width: 260px; font-size: 13px; color: #475569;">${escapeHtml(reg.message || "—")}</div>
        </td>
        <td style="text-align: right;">
          ${reg.status === "APPROVED" 
            ? `<button class="btn-action btn-action-primary" onclick="goToAttendance(${reg.campaign_id})">Điểm danh</button>`
            : `<button class="btn-action" style="color: #64748b;" onclick="showToast('Đang chờ ban tổ chức duyệt', 'info')">Chi tiết</button>`
          }
        </td>
      </tr>
    `;
  }).join("");
}

function goToAttendance(campaignId) {
  switchUserTab("attendance");
  const select = document.getElementById("checkinCampaignSelect");
  if (select) select.value = campaignId;
}

// ================= TAB 2: ATTENDANCE MODULE =================
async function setupAttendanceModule(forceRefresh = false) {
  const select = document.getElementById("checkinCampaignSelect");
  if (!select) return;

  const myRegs = await fetchMyRegistrationsFromDB(forceRefresh);
  const myApproved = myRegs.filter(r => r.status === "APPROVED");

  if (myApproved.length === 0) {
    select.innerHTML = `<option value="">(Chưa có chiến dịch nào được duyệt để điểm danh trong DB)</option>`;
  } else {
    select.innerHTML = myApproved.map(reg => 
      `<option value="${reg.campaign_id}">${escapeHtml(reg.campaign_title || `Chiến dịch #${reg.campaign_id}`)}</option>`
    ).join("");
  }

  // Gắn sự kiện Check-in
  const btnCheckIn = document.getElementById("btnCheckIn");
  const btnCheckOut = document.getElementById("btnCheckOut");
  if (btnCheckIn && !btnCheckIn.dataset.bound) {
    btnCheckIn.dataset.bound = "true";
    btnCheckIn.addEventListener("click", () => handleAttendanceAction("check-in"));
  }
  if (btnCheckOut && !btnCheckOut.dataset.bound) {
    btnCheckOut.dataset.bound = "true";
    btnCheckOut.addEventListener("click", () => handleAttendanceAction("check-out"));
  }

  await renderAttendanceHistory(forceRefresh);
}

async function handleAttendanceAction(actionType) {
  const select = document.getElementById("checkinCampaignSelect");
  const codeInput = document.getElementById("checkinCodeInput");
  const alertEl = document.getElementById("attendanceResultAlert");

  const campaignId = parseInt(select.value);
  const code = codeInput.value.trim().toUpperCase();

  if (!campaignId) {
    showToast("Vui lòng chọn chiến dịch cần điểm danh!", "error");
    return;
  }

  if (code.length !== 6) {
    showToast("Mã điểm danh phải đủ 6 ký tự!", "error");
    codeInput.focus();
    return;
  }

  alertEl.style.display = "block";
  alertEl.className = "dash-alert dash-alert-info";
  alertEl.innerHTML = `Đang kết nối FastAPI backend gửi yêu cầu ${actionType}...`;

  try {
    // 1. Gửi request tới FastAPI Backend: POST /api/attendances/check-in hoặc check-out
    const endpoint = actionType === "check-in" ? "/attendances/check-in" : "/attendances/check-out";
    const response = await api.post(endpoint, {
      campaign_id: campaignId,
      code: code
    });

    const data = response.data;
    const recordedTime = actionType === "check-out" ? (data.check_out_at || new Date()) : (data.check_in_at || new Date());
    alertEl.className = "dash-alert dash-alert-success";
    alertEl.innerHTML = `<strong>Thành công!</strong> Đã ghi nhận ${actionType.toUpperCase()} lúc ${formatDateTime(recordedTime)}.`;
    showToast(`${actionType.toUpperCase()} thành công!`, "success");

    codeInput.value = "";
    recordLocalAttendance(campaignId, actionType, data);

  } catch (error) {
    console.warn("Lỗi điểm danh Backend:", error);

    let errorMsg = "Điểm danh thất bại. Vui lòng thử lại!";

    if (error.response) {
      const detail = error.response.data?.detail;
      if (typeof detail === "string") {
        errorMsg = detail;
      } else if (Array.isArray(detail) && detail.length > 0) {
        errorMsg = detail[0].msg || "Dữ liệu gửi lên không hợp lệ!";
      } else {
        errorMsg = `Máy chủ báo lỗi (${error.response.status}).`;
      }
    } else if (error.code === "ECONNABORTED") {
      errorMsg = "Quá thời gian kết nối (Timeout). Vui lòng thử lại!";
    } else if (!error.response || error.code === "ERR_NETWORK" || error.message?.includes("Network Error")) {
      errorMsg = "Không thể kết nối đến Backend (http://127.0.0.1:8000). Vui lòng kiểm tra server Backend!";
    }

    alertEl.className = "dash-alert dash-alert-danger";
    alertEl.innerHTML = `<strong>Thất bại:</strong> ${escapeHtml(errorMsg)}`;
    showToast(errorMsg, "error");
  }
}

function recordLocalAttendance(campaignId, type, serverData = null) {
  const attendances = DataStore.get(DataStore.STORAGE_KEYS.ATTENDANCES);
  const now = new Date().toISOString();

  let existing = attendances.find(a => a.campaign_id === campaignId && a.user_id === currentUser.id);
  if (!existing) {
    existing = {
      id: serverData?.id || Date.now(),
      registration_id: serverData?.registration_id || 1,
      user_id: currentUser.id,
      campaign_id: campaignId,
      check_in_at: serverData?.check_in_at || (type === "check-in" ? now : null),
      check_out_at: serverData?.check_out_at || (type === "check-out" ? now : null),
      total_minutes: serverData?.total_minutes || 0
    };
    attendances.unshift(existing);
  } else {
    if (type === "check-in") {
      existing.check_in_at = serverData?.check_in_at || now;
    }
    if (type === "check-out") {
      existing.check_out_at = serverData?.check_out_at || now;
      if (serverData && typeof serverData.total_minutes === "number") {
        existing.total_minutes = serverData.total_minutes;
      } else if (existing.check_in_at) {
        const diffMs = new Date(existing.check_out_at) - new Date(existing.check_in_at);
        existing.total_minutes = Math.max(0, Math.round(diffMs / 60000));
      } else {
        existing.total_minutes = 0;
      }
    }
  }
  DataStore.set(DataStore.STORAGE_KEYS.ATTENDANCES, attendances);
  renderAttendanceHistory();
}

function renderAttendanceHistory() {
  const attendances = DataStore.get(DataStore.STORAGE_KEYS.ATTENDANCES);
  const myAtt = attendances.filter(a => a.user_id === currentUser.id);
  const tbody = document.getElementById("attendanceHistoryTbody");
  if (!tbody) return;

  if (myAtt.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: #94a3b8; padding: 18px;">Chưa có bản ghi điểm danh nào</td></tr>`;
    return;
  }

  const campaigns = DataStore.getCampaigns();
  tbody.innerHTML = myAtt.map(a => {
    const camp = campaigns.find(c => c.id === a.campaign_id) || { title: `Chiến dịch #${a.campaign_id}` };
    return `
      <tr>
        <td class="td-title">${escapeHtml(camp.title)}</td>
        <td>${a.check_in_at ? formatDateTime(a.check_in_at) : "—"}</td>
        <td>${a.check_out_at ? formatDateTime(a.check_out_at) : "—"}</td>
        <td><strong style="color: #15803d;">${a.total_minutes || 0} phút</strong></td>
      </tr>
    `;
  }).join("");
}

// ================= TAB 3: CAMPAIGNS EXPLORATION =================
function renderCampaignsList() {
  const container = document.getElementById("campaignsGridContainer");
  if (!container) return;

  const campaigns = DataStore.getCampaigns().filter(c => c.status === "OPEN");
  const myRegCampaignIds = getMyRegistrationsData().map(r => r.campaign_id);

  if (campaigns.length === 0) {
    container.innerHTML = `<div style="grid-column: 1 / -1; text-align: center; padding: 48px; color: #94a3b8;">Hiện chưa có chiến dịch nào mở tuyển.</div>`;
    return;
  }

  container.innerHTML = campaigns.map(c => {
    const isRegistered = myRegCampaignIds.includes(c.id);
    return `
      <div class="dash-card" style="margin-bottom: 0;">
        <div style="height: 120px; background: linear-gradient(135deg, #1e7e55 0%, #10b981 100%); padding: 18px; color: #fff; position: relative;">
          <span style="font-size: 11px; font-weight: 700; background: rgba(0,0,0,0.25); padding: 4px 10px; border-radius: 9999px;">
            ${escapeHtml(c.category)}
          </span>
          <div style="font-size: 11px; opacity: 0.9; margin-top: 8px;">Tổ chức: ${escapeHtml(c.organization_name || "VolunteerLink")}</div>
        </div>
        <div class="dash-card-body">
          <h3 style="font-size: 16px; margin-bottom: 8px; line-height: 1.3;">${escapeHtml(c.title)}</h3>
          <p style="font-size: 13px; color: #64748b; margin-bottom: 14px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">
            ${escapeHtml(c.description)}
          </p>
          <div style="font-size: 12px; color: #475569; margin-bottom: 12px; line-height: 1.6;">
            <div>📍 <strong>Địa điểm:</strong> ${escapeHtml(c.location)}</div>
            <div>⏱️ <strong>Giờ công nhận:</strong> ${c.estimated_hours}h</div>
            <div>👥 <strong>Đã đăng ký:</strong> ${c.registered_count || 0}/${c.max_participants}</div>
          </div>
          ${isRegistered 
            ? `<button class="btn btn-outline btn-block" disabled style="opacity: 0.7;">✓ Đã gửi đơn đăng ký</button>`
            : `<button class="btn btn-primary btn-block" onclick="openRegisterModal(${c.id})">Đăng ký tham gia</button>`
          }
        </div>
      </div>
    `;
  }).join("");
}

function filterCampaigns() {
  const query = document.getElementById("campaignSearchInput").value.toLowerCase();
  const cat = document.getElementById("campaignCategorySelect").value;
  const cards = document.querySelectorAll("#campaignsGridContainer > .dash-card");

  cards.forEach(card => {
    const text = card.textContent.toLowerCase();
    const matchesQuery = !query || text.includes(query);
    const matchesCat = !cat || text.includes(cat.toLowerCase());
    card.style.display = matchesQuery && matchesCat ? "block" : "none";
  });
}

function openRegisterModal(campaignId) {
  const camp = DataStore.getCampaigns().find(c => c.id === campaignId);
  if (!camp) return;

  document.getElementById("modalCampaignId").value = camp.id;
  document.getElementById("modalCampaignTitle").textContent = `Đăng Ký: ${camp.title}`;
  document.getElementById("modalCampaignDetails").innerHTML = `
    <div><strong>Lĩnh vực:</strong> ${escapeHtml(camp.category)}</div>
    <div><strong>Địa điểm:</strong> ${escapeHtml(camp.location)}</div>
    <div><strong>Thời gian:</strong> ${formatDateTime(camp.start_time)} đến ${formatDateTime(camp.end_time)}</div>
    <div><strong>Yêu cầu:</strong> ${escapeHtml(camp.requirements || "Không yêu cầu đặc biệt")}</div>
  `;
  document.getElementById("modalRegMessage").value = "";
  openModal("registerCampaignModal");
}

function submitCampaignRegistration() {
  const campaignId = parseInt(document.getElementById("modalCampaignId").value);
  const message = document.getElementById("modalRegMessage").value.trim();

  const camp = DataStore.getCampaigns().find(c => c.id === campaignId);
  if (!camp) return;

  const newReg = {
    user_id: currentUser.id,
    user_name: currentUser.full_name || currentUser.name,
    user_email: currentUser.email,
    user_phone: currentUser.phone,
    campaign_id: camp.id,
    campaign_title: camp.title,
    message: message
  };

  DataStore.addRegistration(newReg);

  camp.registered_count = (camp.registered_count || 0) + 1;
  DataStore.saveCampaign(camp);

  closeModal("registerCampaignModal");
  showToast("Đã nộp đơn đăng ký thành công! Đang chờ tổ chức duyệt.", "success");

  renderDashboardOverview();
  renderMyRegistrations();
  renderCampaignsList();
  setupAttendanceModule();
}

// ================= TAB 4: CERTIFICATES & CLAIMS =================
function renderCertificatesAndClaims() {
  const certsContainer = document.getElementById("certificatesContainer");
  const claimsTbody = document.getElementById("claimsTbody");

  // Render Certificates
  const certs = DataStore.getCertificates().filter(c => c.user_id === currentUser.id);
  if (certsContainer) {
    if (certs.length === 0) {
      certsContainer.innerHTML = `<div style="text-align: center; color: #94a3b8; padding: 24px;">Chưa có chứng chỉ nào được cấp. Hãy hoàn thành các ca tình nguyện để tích lũy!</div>`;
    } else {
      certsContainer.innerHTML = certs.map(c => `
        <div class="cert-card">
          <span class="cert-code">${escapeHtml(c.certificate_code)}</span>
          <h4 style="margin: 6px 0; font-size: 15px;">${escapeHtml(c.campaign_title)}</h4>
          <div style="font-size: 13px; color: #64748b; margin-bottom: 10px;">
            Số giờ ghi nhận: <strong style="color: #10b981;">${c.total_hours} giờ</strong> · Cấp ngày: ${formatDateTime(c.issued_at)}
          </div>
          <span class="status-pill status-${c.status.toLowerCase()}">
            <span class="status-dot"></span>
            ${c.status === "ACTIVE" ? "Chứng chỉ có hiệu lực" : "Đã thu hồi"}
          </span>
        </div>
      `).join("");
    }
  }

  // Render Claims
  const claims = DataStore.get(DataStore.STORAGE_KEYS.CLAIMS).filter(cl => cl.user_id === currentUser.id);
  if (claimsTbody) {
    if (claims.length === 0) {
      claimsTbody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: #94a3b8; padding: 20px;">Chưa có khiếu nại nào</td></tr>`;
    } else {
      claimsTbody.innerHTML = claims.map(cl => `
        <tr>
          <td class="td-title">${escapeHtml(cl.campaign_title)}</td>
          <td><strong>+${cl.claimed_hours}h</strong></td>
          <td><span class="status-pill status-${cl.status.toLowerCase()}">${cl.status}</span></td>
          <td style="font-size: 12px; color: #64748b;">${escapeHtml(cl.note || "—")}</td>
        </tr>
      `).join("");
    }
  }
}

function openClaimModal() {
  const select = document.getElementById("claimCampaignSelect");
  const myRegs = getMyRegistrationsData();
  if (select) {
    select.innerHTML = myRegs.map(r => `<option value="${r.campaign_id}">${escapeHtml(r.campaign_title)}</option>`).join("");
  }
  openModal("claimModal");
}

function submitHourClaim() {
  const select = document.getElementById("claimCampaignSelect");
  const hours = parseFloat(document.getElementById("claimHoursInput").value);
  const evidence = document.getElementById("claimEvidenceInput").value.trim();
  const note = document.getElementById("claimNoteInput").value.trim();

  if (!hours || hours <= 0) {
    showToast("Vui lòng nhập số giờ hợp lệ!", "error");
    return;
  }

  const claims = DataStore.get(DataStore.STORAGE_KEYS.CLAIMS);
  claims.unshift({
    id: Date.now(),
    registration_id: 1,
    user_id: currentUser.id,
    user_name: currentUser.full_name,
    campaign_title: select.options[select.selectedIndex]?.text || "Chiến dịch",
    claimed_hours: hours,
    evidence_url: evidence,
    status: "PENDING",
    note: note,
    verified_by: null
  });

  DataStore.set(DataStore.STORAGE_KEYS.CLAIMS, claims);
  closeModal("claimModal");
  showToast("Đã gửi yêu cầu khiếu nại thành công!", "success");
  renderCertificatesAndClaims();
}


 // ================= TAB 5: PROFILE =================

function profileError(error, fallback = "Có lỗi xảy ra!") {
  const detail = error.response?.data?.detail;

  if (typeof detail === "string") return detail;

  if (Array.isArray(detail)) {
    return detail.map(item => item.msg).join(", ");
  }

  if (error.code === "ECONNABORTED") {
    return "Máy chủ phản hồi quá chậm. Vui lòng thử lại.";
  }

  return fallback;
}


// Khởi tạo form hồ sơ
function setupProfileForm() {
  loadUserProfile();

  const passwordForm = document.getElementById(
    "changePasswordForm"
  );

  if (passwordForm) {
    passwordForm.addEventListener(
      "submit",
      changeUserPassword
    );
  }
}


// 1. Lấy hồ sơ từ Backend
async function loadUserProfile() {
  try {
    const response = await api.get("/profile/me");
    const profile = response.data;

    const setValue = (id, value) => {
      const element = document.getElementById(id);

      if (element) {
        element.value = value ?? "";
      }
    };

    setValue("profFullName", profile.full_name);
    setValue("profEmail", profile.email);
    setValue("profPhone", profile.phone);
    setValue("profAvatarUrl", profile.avatar_url);
    setValue("profSkills", profile.skills);
    setValue("profArea", profile.area);
    setValue("profDateOfBirth", profile.date_of_birth);

    const hoursElement = document.getElementById(
      "profileTotalHours"
    );

    if (hoursElement) {
      hoursElement.textContent =
        `${profile.total_hours ?? 0} giờ`;
    }

    const publicLink = document.getElementById(
      "publicProfileLink"
    );

    if (publicLink) {
      publicLink.href =
        `public-profile.html?id=${encodeURIComponent(profile.id)}`;
    }

    const nameDisplay = document.getElementById(
      "profNameDisplay"
    );

    if (nameDisplay) {
      nameDisplay.textContent = profile.full_name;
    }

    // Đồng bộ thông tin tài khoản đang đăng nhập
    currentUser = {
      ...currentUser,
      full_name: profile.full_name,
      phone: profile.phone,
      avatar_url: profile.avatar_url
    };

    localStorage.setItem(
      "auth_user",
      JSON.stringify(currentUser)
    );

    setupUserHeader();
    updateProfileAvatar(profile.avatar_url);

  } catch (error) {
    console.error("Lỗi tải hồ sơ:", error);

    showToast(
      profileError(error, "Không thể tải hồ sơ!"),
      "error"
    );
  }
}


// Hiển thị avatar
function updateProfileAvatar(avatarUrl) {
  const avatar = document.getElementById(
    "profileAvatarBig"
  );

  if (!avatar) return;

  // Chỉ nhận URL ảnh HTTP/HTTPS
  let safeUrl = "";

  try {
    const parsed = new URL(avatarUrl);

    if (
      parsed.protocol === "http:" ||
      parsed.protocol === "https:"
    ) {
      safeUrl = parsed.href;
    }
  } catch {
    // URL không hợp lệ: dùng chữ cái đại diện
  }

  if (!safeUrl) {
    avatar.style.backgroundImage = "";
    avatar.style.backgroundSize = "";
    avatar.textContent =
      (currentUser?.full_name || "U").charAt(0).toUpperCase();
    return;
  }

  avatar.textContent = "";
  avatar.style.backgroundImage = `url("${safeUrl.replace(/"/g, "%22")}")`;
  avatar.style.backgroundSize = "cover";
  avatar.style.backgroundPosition = "center";
}


// 2. Cập nhật thông tin tài khoản
async function saveUserProfile() {
  const fullName = document.getElementById(
    "profFullName"
  ).value.trim();

  const phone = document.getElementById(
    "profPhone"
  ).value.trim();

  const avatarUrl = document.getElementById(
    "profAvatarUrl"
  ).value.trim();

  if (!fullName) {
    showToast("Họ tên không được để trống!", "error");
    return;
  }

  if (avatarUrl) {
    try {
      const url = new URL(avatarUrl);

      if (!["http:", "https:"].includes(url.protocol)) {
        throw new Error("Invalid protocol");
      }
    } catch {
      showToast("URL ảnh đại diện không hợp lệ!", "error");
      return;
    }
  }

  try {
    await api.patch("/profile/me", {
      full_name: fullName,
      phone: phone || null,
      avatar_url: avatarUrl || null
    });

    showToast(
      "Cập nhật thông tin cá nhân thành công!",
      "success"
    );

    await loadUserProfile();

  } catch (error) {
    console.error("Lỗi cập nhật hồ sơ:", error);

    showToast(
      profileError(error, "Không thể cập nhật hồ sơ!"),
      "error"
    );
  }
}


// 3. Cập nhật kỹ năng, khu vực, ngày sinh
async function saveVolunteerProfile() {
  const skills = document.getElementById(
    "profSkills"
  ).value.trim();

  const area = document.getElementById(
    "profArea"
  ).value.trim();

  const dateOfBirth = document.getElementById(
    "profDateOfBirth"
  ).value;

  if (dateOfBirth && dateOfBirth > new Date().toLocaleDateString("en-CA")) {
    showToast("Ngày sinh không được ở tương lai!", "error");
    return;
  }

  try {
    await api.patch("/profile/me/volunteer", {
      skills: skills || null,
      area: area || null,
      date_of_birth: dateOfBirth || null
    });

    showToast(
      "Cập nhật kỹ năng và khu vực thành công!",
      "success"
    );

    await loadUserProfile();

  } catch (error) {
    console.error("Lỗi cập nhật kỹ năng:", error);

    showToast(
      profileError(error, "Không thể cập nhật kỹ năng!"),
      "error"
    );
  }
}


// 4. Đổi mật khẩu
async function changeUserPassword(event) {
  event.preventDefault();

  const oldPassword = document.getElementById(
    "oldPassword"
  ).value;

  const newPassword = document.getElementById(
    "newPassword"
  ).value;

  const confirmPassword = document.getElementById(
    "confirmPassword"
  ).value;

  if (!oldPassword || !newPassword || !confirmPassword) {
    showToast("Vui lòng nhập đầy đủ mật khẩu!", "error");
    return;
  }

  if (newPassword.length < 8) {
    showToast(
      "Mật khẩu mới phải có ít nhất 8 ký tự!",
      "error"
    );
    return;
  }

  if (newPassword !== confirmPassword) {
    showToast(
      "Xác nhận mật khẩu không khớp!",
      "error"
    );
    return;
  }

  if (oldPassword === newPassword) {
    showToast(
      "Mật khẩu mới phải khác mật khẩu cũ!",
      "error"
    );
    return;
  }

  const submitButton = event.currentTarget.querySelector(
    'button[type="submit"]'
  );

  if (submitButton) {
    submitButton.disabled = true;
  }

  try {
    await api.post("/profile/change-password", {
      old_password: oldPassword,
      new_password: newPassword
    });

    showToast(
      "Đổi mật khẩu thành công! Vui lòng đăng nhập lại.",
      "success"
    );

    event.currentTarget.reset();

    // Backend đã thu hồi các phiên đăng nhập
    Auth.clearSession();

    setTimeout(() => {
      window.location.replace("login.html");
    }, 1200);

  } catch (error) {
    console.error("Lỗi đổi mật khẩu:", error);

    showToast(
      profileError(error, "Không thể đổi mật khẩu!"),
      "error"
    );

    if (submitButton) {
      submitButton.disabled = false;
    }
  }
}

// ================= TAB 6: ĐĂNG KÝ TRỞ THÀNH TỔ CHỨC (UPGRADE TO ORGANIZER) =================
function renderOrganizerApplicationStatus() {
  const container = document.getElementById("orgAppStatusContainer");
  const formCard = document.getElementById("orgAppFormCard");
  const navBadge = document.getElementById("orgUpgradeNavBadge");
  if (!container) return;

  const orgs = DataStore.getOrganizations();
  const myOrg = orgs.find(o => o.owner_id === currentUser.id || o.owner_email === currentUser.email);

  // Điền sẵn thông tin liên hệ của user vào form
  if (document.getElementById("appOrgEmail")) {
    document.getElementById("appOrgEmail").value = currentUser.email || "";
    document.getElementById("appOrgPhone").value = currentUser.phone || "";
  }

  if (!myOrg) {
    container.innerHTML = "";
    if (formCard) formCard.style.display = "block";
    if (navBadge) {
      navBadge.textContent = "Nâng cấp";
      navBadge.style.background = "#eff6ff";
      navBadge.style.color = "#1d4ed8";
    }
    return;
  }

  if (myOrg.status === "PENDING") {
    container.innerHTML = `
      <div class="dash-alert dash-alert-warning" style="display: block;">
        <div style="font-size: 15px; font-weight: 700; margin-bottom: 6px;">
          ⏳ Hồ sơ tổ chức "${escapeHtml(myOrg.name)}" đang chờ Admin thẩm định!
        </div>
        <p style="margin: 0 0 10px; font-size: 13.5px;">
          Đề án thành lập và tài liệu pháp lý của bạn đã được gửi lên Ban Quản Trị Hệ Thống.
          Sau khi Quản trị viên duyệt, tài khoản của bạn sẽ tự động nâng cấp thành vai trò <strong>ORGANIZER</strong>.
        </p>
        <div style="font-size: 12.5px; opacity: 0.9;">
          • Ngày gửi hồ sơ: ${formatDateTime(myOrg.created_at)}<br>
          • Trụ sở đăng ký: ${escapeHtml(myOrg.address || "Chưa có")}<br>
          • Tài liệu đính kèm: <a href="${escapeHtml(myOrg.document_url || "#")}" target="_blank" style="color: #b45309; text-decoration: underline;">Xem file đề án ↗</a>
        </div>
      </div>
    `;
    if (formCard) formCard.style.display = "none";
    if (navBadge) {
      navBadge.textContent = "Chờ duyệt";
      navBadge.style.background = "#fffbeb";
      navBadge.style.color = "#b45309";
    }

  } else if (myOrg.status === "APPROVED") {
    // Nếu Admin đã duyệt, đồng bộ role thành ORGANIZER
    if (currentUser.role !== "ORGANIZER") {
      currentUser.role = "ORGANIZER";
      localStorage.setItem("auth_user", JSON.stringify(currentUser));
    }

    container.innerHTML = `
      <div class="dash-alert dash-alert-success" style="display: block;">
        <div style="font-size: 16px; font-weight: 800; margin-bottom: 8px;">
          🎉 Chúc mừng! Tổ chức "${escapeHtml(myOrg.name)}" đã được Admin phê duyệt!
        </div>
        <p style="margin: 0 0 14px; font-size: 14px;">
          Tài khoản của bạn đã được nâng cấp chính thức lên vai trò <strong>Nhà tổ chức (ORGANIZER)</strong>.
          Bạn hiện đã có toàn quyền đăng chiến dịch, phát mã điểm danh thực địa và tuyển tình nguyện viên.
        </p>
        <a href="organizer-dashboard.html" class="btn btn-primary" style="display: inline-flex; align-items: center; gap: 6px;">
          <span>🏢 Chuyển Sang Bảng Điều Khiển Nhà Tổ Chức Ngay</span>
        </a>
      </div>
    `;
    if (formCard) formCard.style.display = "none";
    if (navBadge) {
      navBadge.textContent = "Đã duyệt";
      navBadge.style.background = "#ecfdf5";
      navBadge.style.color = "#065f46";
    }

  } else if (myOrg.status === "REJECTED") {
    container.innerHTML = `
      <div class="dash-alert dash-alert-danger" style="display: block;">
        <div style="font-size: 15px; font-weight: 700; margin-bottom: 6px;">
          ❌ Hồ sơ đăng ký tổ chức "${escapeHtml(myOrg.name)}" đã bị từ chối
        </div>
        <p style="margin: 0 0 8px; font-size: 13.5px;">
          <strong>Lý do từ chối của Admin:</strong> ${escapeHtml(myOrg.rejection_reason || "Chưa đạt yêu cầu pháp lý.")}
        </p>
        <p style="margin: 0; font-size: 13px;">
          Vui lòng kiểm tra lại giấy tờ, cập nhật thông tin chính xác theo mẫu bên dưới và nộp lại hồ sơ để Admin thẩm định lại.
        </p>
      </div>
    `;
    if (formCard) {
      formCard.style.display = "block";
      document.getElementById("appOrgName").value = myOrg.name || "";
      document.getElementById("appOrgEmail").value = myOrg.email || "";
      document.getElementById("appOrgPhone").value = myOrg.phone || "";
      document.getElementById("appOrgAddress").value = myOrg.address || "";
      document.getElementById("appOrgDocUrl").value = myOrg.document_url || "";
      document.getElementById("appOrgDesc").value = myOrg.description || "";
      document.getElementById("btnSubmitOrgApplication").textContent = "🔄 Cập Nhật & Nộp Lại Hồ Sơ Xét Duyệt";
    }
  }
}

function submitOrganizerApplication() {
  const name = document.getElementById("appOrgName").value.trim();
  const email = document.getElementById("appOrgEmail").value.trim();
  const phone = document.getElementById("appOrgPhone").value.trim();
  const address = document.getElementById("appOrgAddress").value.trim();
  const docUrl = document.getElementById("appOrgDocUrl").value.trim();
  const desc = document.getElementById("appOrgDesc").value.trim();

  if (!name || !email || !phone || !address || !docUrl || !desc) {
    showToast("Vui lòng điền đầy đủ các trường thông tin và đường dẫn đề án (*)", "error");
    return;
  }

  const orgs = DataStore.getOrganizations();
  let existing = orgs.find(o => o.owner_id === currentUser.id || o.owner_email === currentUser.email);

  if (existing) {
    existing.name = name;
    existing.email = email;
    existing.phone = phone;
    existing.address = address;
    existing.document_url = docUrl;
    existing.description = desc;
    existing.status = "PENDING";
    existing.rejection_reason = null;
    existing.updated_at = new Date().toISOString();
  } else {
    existing = {
      id: Date.now(),
      name: name,
      email: email,
      phone: phone,
      address: address,
      description: desc,
      document_url: docUrl,
      owner_id: currentUser.id,
      owner_email: currentUser.email,
      status: "PENDING",
      rejection_reason: null,
      created_at: new Date().toISOString()
    };
    orgs.unshift(existing);
  }

  DataStore.set(DataStore.STORAGE_KEYS.ORGS, orgs);
  showToast("Đã gửi hồ sơ thành lập tổ chức lên Quản trị viên (Admin) thành công!", "success");
  renderOrganizerApplicationStatus();
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
