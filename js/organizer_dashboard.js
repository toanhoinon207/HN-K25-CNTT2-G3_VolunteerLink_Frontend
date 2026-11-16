/**
 * Logic điều khiển Bảng điều khiển Nhà tổ chức (Role: ORGANIZER)
 * Tích hợp Backend API: /auth/me, /campaigns, /campaigns/{id}/submit, /api/attendances/code, DataStore
 */

let currentUser = null;
let currentOrg = null;
let codeCountdownInterval = null;

document.addEventListener("DOMContentLoaded", async () => {
  // 1. Kiểm tra xác thực & vai trò ORGANIZER
  currentUser = await Auth.requireAuth(["ORGANIZER"]);
  if (!currentUser) return;

  // 2. Tìm thông tin tổ chức sở hữu (từ DB)
  await loadCurrentOrganization();

  // 3. Thiết lập thông tin Header
  setupOrganizerHeader();

  // 4. Khởi tạo Tabs & Mobile menu
  setupTabs();
  setupMobileMenu();

  // 5. Nạp dữ liệu các thành phần
  renderOverview();
  renderCampaignsTable();
  setupAttendanceGenerator();
  renderVolunteerApplicants();
  renderCertificatesAndClaims();
  setupOrgProfileForm();

  // 6. Đăng xuất
  document.getElementById("logoutBtn").addEventListener("click", () => {
    Auth.logout();
  });
});

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
  const firstLetter = fullName.trim().charAt(0).toUpperCase();

  document.getElementById("headerUserName").textContent = fullName;
  document.getElementById("headerAvatar").textContent = firstLetter;
  document.getElementById("headerOrgName").textContent = currentOrg.name;
  document.getElementById("overviewOrgTitle").textContent = currentOrg.name;
}

function setupTabs() {
  const navItems = document.querySelectorAll(".dash-nav-item[data-tab]");
  navItems.forEach(item => {
    item.addEventListener("click", (e) => {
      e.preventDefault();
      const tabId = item.getAttribute("data-tab");
      switchOrgTab(tabId);
    });
  });
}

function switchOrgTab(tabId) {
  document.querySelectorAll(".dash-nav-item[data-tab]").forEach(nav => {
    if (nav.getAttribute("data-tab") === tabId) {
      nav.classList.add("active", "active-organizer");
    } else {
      nav.classList.remove("active", "active-organizer");
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

// ================= TAB 1: OVERVIEW =================
function renderOverview() {
  const allCampaigns = DataStore.getCampaigns().filter(c => c.organization_id === currentOrg.id || c.organization_name === currentOrg.name);
  const allApplicants = DataStore.getRegistrations();
  const orgCampaignIds = allCampaigns.map(c => c.id);
  const myApplicants = allApplicants.filter(a => orgCampaignIds.includes(a.campaign_id));

  const pendingApps = myApplicants.filter(a => a.status === "PENDING");
  const approvedApps = myApplicants.filter(a => a.status === "APPROVED");

  let totalHours = 0;
  allCampaigns.forEach(c => {
    if (c.status === "OPEN" || c.status === "COMPLETED") {
      totalHours += (c.registered_count || 0) * (c.estimated_hours || 0);
    }
  });

  document.getElementById("kpiOrgCampaigns").textContent = allCampaigns.length;
  document.getElementById("kpiOrgVolunteers").textContent = approvedApps.length;
  document.getElementById("kpiOrgPendingApplicants").textContent = pendingApps.length;
  document.getElementById("kpiOrgTotalHours").textContent = totalHours.toFixed(1) + "h";
  document.getElementById("orgCampaignsCount").textContent = allCampaigns.length;
  document.getElementById("pendingApplicantsBadge").textContent = pendingApps.length;

  // Active Campaign Highlight
  const bannerEl = document.getElementById("orgActiveCampaignBanner");
  const activeCamp = allCampaigns.find(c => c.status === "OPEN") || allCampaigns[0];

  if (!activeCamp) {
    bannerEl.innerHTML = `<div style="text-align: center; color: #94a3b8; padding: 20px;">Chưa có chiến dịch nào. Hãy tạo chiến dịch mới!</div>`;
  } else {
    bannerEl.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 16px;">
        <div>
          <span class="status-pill status-${activeCamp.status.toLowerCase()}">${activeCamp.status}</span>
          <h3 style="margin: 8px 0 4px; font-size: 18px;">${escapeHtml(activeCamp.title)}</h3>
          <div style="font-size: 13.5px; color: #64748b;">
            📍 ${escapeHtml(activeCamp.location)} · 👥 Sĩ số: <strong>${activeCamp.registered_count || 0}/${activeCamp.max_participants}</strong> · ⏱️ ${activeCamp.estimated_hours}h
          </div>
        </div>
        <div style="display: flex; gap: 10px;">
          <button class="btn btn-primary btn-sm" onclick="quickOpenAttendance(${activeCamp.id})">Phát mã điểm danh</button>
          <button class="btn btn-outline btn-sm" onclick="switchOrgTab('volunteers')">Duyệt hồ sơ (${pendingApps.length})</button>
        </div>
      </div>
    `;
  }
}

// ================= TAB 2: QUẢN LÝ CHIẾN DỊCH =================
function renderCampaignsTable() {
  const allCampaigns = DataStore.getCampaigns().filter(c => c.organization_id === currentOrg.id || c.organization_name === currentOrg.name);
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
      <tr>
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
            <button class="btn-action" style="color: #64748b;" onclick="showToast('Chi tiết chiến dịch #${c.id}', 'info')">Xem</button>
          </div>
        </td>
      </tr>
    `;
  }).join("");
}

function filterOrgCampaigns() {
  const query = document.getElementById("orgCampaignSearch").value.toLowerCase();
  const status = document.getElementById("orgCampaignStatusFilter").value;
  const rows = document.querySelectorAll("#orgCampaignsTbody tr");

  rows.forEach(row => {
    const text = row.textContent.toLowerCase();
    const matchesQuery = !query || text.includes(query);
    const matchesStatus = !status || text.includes(status.toLowerCase());
    row.style.display = matchesQuery && matchesStatus ? "" : "none";
  });
}

function openCreateCampaignModal() {
  const now = new Date();
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  // Set default datetimes format YYYY-MM-DDTHH:mm
  document.getElementById("newCampStart").value = tomorrow.toISOString().slice(0, 16);
  document.getElementById("newCampEnd").value = new Date(tomorrow.getTime() + 4 * 3600000).toISOString().slice(0, 16);
  document.getElementById("newCampDeadline").value = now.toISOString().slice(0, 16);

  openModal("createCampaignModal");
}

async function submitCreateCampaign() {
  const title = document.getElementById("newCampTitle").value.trim();
  const category = document.getElementById("newCampCategory").value;
  const location = document.getElementById("newCampLocation").value.trim();
  const startTime = document.getElementById("newCampStart").value;
  const endTime = document.getElementById("newCampEnd").value;
  const deadline = document.getElementById("newCampDeadline").value;
  const maxPart = parseInt(document.getElementById("newCampMaxPart").value);
  const hours = parseFloat(document.getElementById("newCampHours").value);
  const requirements = document.getElementById("newCampRequirements").value.trim();
  const description = document.getElementById("newCampDescription").value.trim();

  if (!title || !location || !startTime || !endTime || !deadline || !description) {
    showToast("Vui lòng điền đầy đủ các thông tin bắt buộc (*)", "error");
    return;
  }

  if (new Date(endTime) <= new Date(startTime)) {
    showToast("Thời gian kết thúc phải sau thời gian bắt đầu!", "error");
    return;
  }

  if (new Date(deadline) >= new Date(startTime)) {
    showToast("Hạn đăng ký phải trước thời gian bắt đầu!", "error");
    return;
  }

  const payload = {
    title: title,
    category: category,
    location: location,
    start_time: new Date(startTime).toISOString(),
    end_time: new Date(endTime).toISOString(),
    registration_deadline: new Date(deadline).toISOString(),
    max_participants: maxPart,
    estimated_hours: hours,
    requirements: requirements,
    description: description
  };

  try {
    // 1. Gọi trực tiếp FastAPI Backend: POST /campaigns
    const response = await api.post("/campaigns", payload);
    const createdCamp = response.data;
    console.log("Chiến dịch đã tạo từ FastAPI:", createdCamp);

    showToast("Tạo chiến dịch thành công (DRAFT) trên Backend!", "success");
    DataStore.saveCampaign({ ...createdCamp, organization_name: currentOrg.name });

  } catch (error) {
    console.warn("Backend /campaigns chưa kết nối hoặc lỗi, lưu vào Local DataStore:", error);

    const localCamp = {
      organization_id: currentOrg.id,
      organization_name: currentOrg.name,
      ...payload,
      status: "DRAFT"
    };
    DataStore.saveCampaign(localCamp);
    showToast("Đã lưu bản nháp chiến dịch thành công!", "success");
  }

  closeModal("createCampaignModal");
  renderOverview();
  renderCampaignsTable();
  setupAttendanceGenerator();
}

async function submitCampaignToAdmin(campaignId) {
  try {
    // Gọi FastAPI backend: POST /campaigns/{campaign_id}/submit
    await api.post(`/campaigns/${campaignId}/submit`);
    showToast("Đã gửi chiến dịch tới Quản trị viên để phê duyệt!", "success");
  } catch (error) {
    console.warn("Backend submit fallback:", error);
  }

  const camp = DataStore.getCampaigns().find(c => c.id === campaignId);
  if (camp) {
    camp.status = "PENDING";
    camp.reason = null;
    DataStore.saveCampaign(camp);
    showToast("Chiến dịch đã chuyển sang trạng thái CHỜ ADMIN DUYỆT (PENDING)", "success");
    renderOverview();
    renderCampaignsTable();
  }
}

// ================= TAB 3: ATTENDANCE STATION =================
function setupAttendanceGenerator() {
  const select = document.getElementById("codeGenCampaignSelect");
  if (!select) return;

  const allCampaigns = DataStore.getCampaigns().filter(c => c.organization_id === currentOrg.id || c.organization_name === currentOrg.name);
  select.innerHTML = allCampaigns.map(c => 
    `<option value="${c.id}">${escapeHtml(c.title)} (${c.status})</option>`
  ).join("");

  // Khi đổi chiến dịch → reload danh sách điểm danh từ DB
  select.addEventListener("change", () => renderLiveAttendanceList());

  document.getElementById("btnGenerateAttendanceCode").addEventListener("click", generateAttendanceCode);
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
    showToast("Vui lòng chọn chiến dịch!", "error");
    return;
  }

  const camp = DataStore.getCampaigns().find(c => c.id === campaignId);
  if (!camp) return;

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
    showToast(`Đã tạo mã điểm danh qua Backend: ${generatedCode}`, "success");

  } catch (error) {
    console.warn("Lỗi sinh mã Backend, tạo mã bảo mật cục bộ:", error);

    // Fallback sinh mã 6 ký tự ngẫu nhiên
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    generatedCode = "";
    for (let i = 0; i < 6; i++) {
      generatedCode += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    expiresAt = new Date(Date.now() + expiresMinutes * 60000).toISOString();
    showToast(`Đã kích hoạt mã điểm danh mới: ${generatedCode}`, "success");
  }

  // Cập nhật chiến dịch
  camp.attendance_code = generatedCode;
  camp.attendance_code_expires_at = expiresAt;
  DataStore.saveCampaign(camp);

  // Hiển thị lên màn hình
  displayLiveCode(generatedCode, new Date(expiresAt));
}

function displayLiveCode(code, expiresDate) {
  const codeEl = document.getElementById("liveDisplayCode");
  const timerEl = document.getElementById("liveDisplayTimer");

  codeEl.textContent = code;

  if (codeCountdownInterval) clearInterval(codeCountdownInterval);

  codeCountdownInterval = setInterval(() => {
    const diff = expiresDate.getTime() - Date.now();
    if (diff <= 0) {
      clearInterval(codeCountdownInterval);
      timerEl.innerHTML = `<span style="color: #ef4444;">⚠️ Mã đã hết hạn lúc ${formatDateTime(expiresDate)}</span>`;
    } else {
      const minutes = Math.floor(diff / 60000);
      const seconds = Math.floor((diff % 60000) / 1000);
      timerEl.innerHTML = `<span>⏳ Còn lại: <strong>${minutes}m ${seconds}s</strong> (Hết hạn: ${formatDateTime(expiresDate)})</span>`;
    }
  }, 1000);
}

function copyLiveCode() {
  const code = document.getElementById("liveDisplayCode").textContent;
  if (code && code !== "------") {
    navigator.clipboard.writeText(code);
    showToast(`Đã sao chép mã: ${code}`, "success");
  }
}

function toggleFullScreenProjector() {
  const card = document.getElementById("projectorCard");
  if (!document.fullscreenElement) {
    card.requestFullscreen().catch(err => alert(`Lỗi toàn màn hình: ${err.message}`));
  } else {
    document.exitFullscreen();
  }
}

async function renderLiveAttendanceList() {
  const select = document.getElementById("codeGenCampaignSelect");
  const campaignId = parseInt(select?.value) || 0;
  const tbody = document.getElementById("liveAttendanceTbody");
  if (!tbody) return;

  if (!campaignId) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: #94a3b8; padding: 20px;">Vui lòng chọn chiến dịch</td></tr>`;
    return;
  }

  tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;padding:16px;color:#94a3b8;">Đang tải dữ liệu điểm danh thực từ DB...</td></tr>`;

  try {
    const res = await api.get(`/attendances/campaigns/${campaignId}`);
    const attendances = Array.isArray(res.data) ? res.data : [];

    if (attendances.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: #94a3b8; padding: 20px;">Chưa có TNV nào check-in cho ca này</td></tr>`;
      return;
    }

    tbody.innerHTML = attendances.map(a => `
      <tr>
        <td class="td-title">${escapeHtml(a.user_name || a.full_name || "Tình nguyện viên")}</td>
        <td>${a.check_in_at ? formatDateTime(a.check_in_at) : "—"}</td>
        <td>${a.check_out_at ? formatDateTime(a.check_out_at) : `<span class="status-pill status-open">Đang trong ca</span>`}</td>
        <td><strong style="color: #10b981;">${a.total_minutes || 0} phút</strong></td>
      </tr>
    `).join("");
  } catch (err) {
    console.warn("Không thể tải điểm danh từ Backend, dùng DataStore:", err);
    // Fallback về DataStore
    const attendances = DataStore.get(DataStore.STORAGE_KEYS.ATTENDANCES).filter(a => a.campaign_id === campaignId);
    const users = DataStore.getUsers();

    if (attendances.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: #94a3b8; padding: 20px;">Chưa có TNV nào check-in cho ca này</td></tr>`;
      return;
    }

    tbody.innerHTML = attendances.map(a => {
      const user = users.find(u => u.id === a.user_id) || { full_name: "Tình nguyện viên" };
      return `
        <tr>
          <td class="td-title">${escapeHtml(user.full_name)}</td>
          <td>${a.check_in_at ? formatDateTime(a.check_in_at) : "—"}</td>
          <td>${a.check_out_at ? formatDateTime(a.check_out_at) : `<span class="status-pill status-open">Đang trong ca</span>`}</td>
          <td><strong style="color: #10b981;">${a.total_minutes || 0} phút</strong></td>
        </tr>
      `;
    }).join("");
  }
}

// ================= TAB 4: DUYỆT ĐƠN ĐĂNG KÝ TNV =================
async function renderVolunteerApplicants(forceRefresh = false) {
  const tbody = document.getElementById("orgApplicantsTbody");
  if (!tbody) return;

  tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:24px;color:#94a3b8;">Đang tải danh sách đơn đăng ký từ cơ sở dữ liệu...</td></tr>`;

  // Lấy danh sách campaign của tổ chức này từ DB
  let orgCampaignIds = [];
  let allRegs = [];

  try {
    // Lấy campaigns của organizer: dùng DataStore đã sync hoặc gọi thẳng
    const allCampaigns = DataStore.getCampaigns().filter(c =>
      c.organization_id === currentOrg?.id || c.organization_name === currentOrg?.name
    );
    orgCampaignIds = allCampaigns.map(c => c.id);

    // Nếu có campaign, lấy registrations từ DB cho từng campaign
    if (orgCampaignIds.length > 0) {
      // Gọi API cho campaign đầu tiên hoặc tất cả (tùy backend hỗ trợ)
      const fetchPromises = orgCampaignIds.map(id =>
        api.get(`/registrations/campaign/${id}`).then(r => r.data).catch(() => [])
      );
      const results = await Promise.all(fetchPromises);
      allRegs = results.flat();
    }
  } catch (err) {
    console.warn("Không thể tải đơn đăng ký từ Backend:", err);
    // Fallback về DataStore
    const allCampaigns = DataStore.getCampaigns().filter(c =>
      c.organization_id === currentOrg?.id || c.organization_name === currentOrg?.name
    );
    orgCampaignIds = allCampaigns.map(c => c.id);
    allRegs = DataStore.getRegistrations().filter(r => orgCampaignIds.includes(r.campaign_id));
  }

  if (allRegs.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: #94a3b8; padding: 36px;">Chưa có đơn đăng ký tham gia nào.</td></tr>`;
    return;
  }

  tbody.innerHTML = allRegs.map(r => `
    <tr>
      <td>
        <div class="td-title">${escapeHtml(r.user_name || r.full_name || "TNV")}</div>
        <div class="td-subtitle">${escapeHtml(r.user_email || r.email || "")} · ${escapeHtml(r.user_phone || r.phone || "")}</div>
      </td>
      <td>
        <div style="font-weight: 600;">${escapeHtml(r.campaign_title || `Chiến dịch #${r.campaign_id}`)}</div>
      </td>
      <td style="font-size: 13px;">${formatDateTime(r.created_at)}</td>
      <td style="max-width: 240px; font-size: 13px; color: #475569;">
        ${escapeHtml(r.message || "Không có ghi chú")}
      </td>
      <td>
        <span class="status-pill status-${(r.status || "pending").toLowerCase()}">
          <span class="status-dot"></span>
          ${r.status === "APPROVED" ? "Đã duyệt" : (r.status === "PENDING" ? "Chờ duyệt" : (r.status === "REJECTED" ? "Từ chối" : r.status))}
        </span>
      </td>
      <td style="text-align: right;">
        <div class="btn-group-sm" style="justify-content: flex-end;">
          ${r.status === "PENDING" ? `
            <button class="btn-action btn-action-primary" onclick="approveVolunteerRegistration(${r.id}, ${r.campaign_id})">✓ Duyệt</button>
            <button class="btn-action btn-action-danger" onclick="rejectVolunteerRegistration(${r.id}, ${r.campaign_id})">✕ Từ chối</button>
          ` : `
            <button class="btn-action" style="color: #64748b;" onclick="showToast('Đơn đã được xử lý', 'info')">Chi tiết</button>
          `}
        </div>
      </td>
    </tr>
  `).join("");
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
  await renderVolunteerApplicants(true);
  renderOverview();
}

async function rejectVolunteerRegistration(regId, campaignId) {
  const reason = prompt("Nhập lý do từ chối:", "Số lượng tình nguyện viên cho đợt này đã đủ.");
  if (reason === null) return;
  try {
    await api.patch(`/registrations/${regId}/reject?campaign_id=${campaignId}`, { reason });
    showToast("Đã từ chối đơn đăng ký.", "warning");
  } catch (err) {
    console.warn("Backend reject fallback:", err);
    DataStore.updateRegistrationStatus(regId, "REJECTED", reason);
    showToast("Đã từ chối (lưu cục bộ).", "warning");
  }
  await renderVolunteerApplicants(true);
  renderOverview();
}

// ================= TAB 5: CẤP CHỨNG CHỈ & KHIẾU NẠI GIỜ =================
function renderCertificatesAndClaims() {
  const orgClaimsTbody = document.getElementById("orgClaimsTbody");
  const orgIssuedCertsTbody = document.getElementById("orgIssuedCertsTbody");

  // Render Claims
  const claims = DataStore.get(DataStore.STORAGE_KEYS.CLAIMS);
  if (orgClaimsTbody) {
    if (claims.length === 0) {
      orgClaimsTbody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: #94a3b8; padding: 20px;">Không có khiếu nại nào cần duyệt</td></tr>`;
    } else {
      orgClaimsTbody.innerHTML = claims.map(cl => `
        <tr>
          <td>
            <div class="td-title">${escapeHtml(cl.user_name || "TNV")}</div>
            <div class="td-subtitle">${escapeHtml(cl.campaign_title)}</div>
          </td>
          <td><strong>+${cl.claimed_hours} giờ</strong></td>
          <td>
            ${cl.evidence_url ? `<a href="${escapeHtml(cl.evidence_url)}" target="_blank" style="color: #1d4ed8; font-size: 12px;">Xem ảnh minh chứng ↗</a>` : "—"}
          </td>
          <td style="text-align: right;">
            ${cl.status === "PENDING" ? `
              <button class="btn-action btn-action-primary" onclick="verifyHourClaim(${cl.id})">Xác nhận</button>
              <button class="btn-action btn-action-danger" onclick="rejectHourClaim(${cl.id})">Từ chối</button>
            ` : `<span class="status-pill status-${cl.status.toLowerCase()}">${cl.status}</span>`}
          </td>
        </tr>
      `).join("");
    }
  }

  // Render Certificates
  const certs = DataStore.getCertificates();
  if (orgIssuedCertsTbody) {
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

function verifyHourClaim(claimId) {
  const claims = DataStore.get(DataStore.STORAGE_KEYS.CLAIMS);
  const cl = claims.find(c => c.id === claimId);
  if (cl) {
    cl.status = "VERIFIED";
    cl.verified_by = currentUser.id;
    DataStore.set(DataStore.STORAGE_KEYS.CLAIMS, claims);
    showToast("Đã xác nhận cộng giờ cống hiến cho tình nguyện viên!", "success");
    renderCertificatesAndClaims();
  }
}

function rejectHourClaim(claimId) {
  const claims = DataStore.get(DataStore.STORAGE_KEYS.CLAIMS);
  const cl = claims.find(c => c.id === claimId);
  if (cl) {
    cl.status = "REJECTED";
    DataStore.set(DataStore.STORAGE_KEYS.CLAIMS, claims);
    showToast("Đã từ chối khiếu nại giờ.", "warning");
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
}

