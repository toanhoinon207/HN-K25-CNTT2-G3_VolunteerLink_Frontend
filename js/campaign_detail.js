/**
 * Trang Chi tiết Chiến dịch (pages/campaign_detail.html)
 * Kết nối trực tiếp Backend FastAPI:
 *   - Endpoint chi tiết: GET /api/campaigns/{campaign_id} -> CampaignDetailResponse
 *   - Endpoint đăng ký: POST /api/registrations/ -> RegistrationResponse (Role: USER)
 */

let currentCampaign = null;
let hasRegisteredInSession = false;

function getCampaignIdFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get("id");
}

function safeFormatDateTime(value) {
  if (!value) return "Đang cập nhật";
  const date = new Date(value);
  if (isNaN(date.getTime())) return "Đang cập nhật";
  return typeof formatDateTime === "function"
    ? formatDateTime(value)
    : date.toLocaleString("vi-VN");
}

function showDetailLoading() {
  const statusBox = document.getElementById("detail-status-box");
  const detailContent = document.getElementById("detail-content");

  if (detailContent) detailContent.style.display = "none";
  if (statusBox) {
    statusBox.style.display = "block";
    statusBox.className = "home-state-box home-state-box--loading";
    statusBox.textContent = "Đang tải thông tin chiến dịch...";
  }
}

function showDetailError(message) {
  const statusBox = document.getElementById("detail-status-box");
  const detailContent = document.getElementById("detail-content");

  if (detailContent) detailContent.style.display = "none";
  if (statusBox) {
    statusBox.style.display = "block";
    statusBox.className = "empty-state";
    statusBox.innerHTML = `
      <h3 class="detail-error-title">${escapeHtml(message)}</h3>
      <a href="campaign.html" class="btn btn-outline btn-sm">Quay lại danh sách chiến dịch</a>
    `;
  }
}

function updateRegisterButtonState(campaign, remainingSlots) {
  const registerBtn = document.getElementById("btn-register-campaign");
  if (!registerBtn) return;

  const deadlineDate = new Date(campaign.registration_deadline);
  const isExpired = !isNaN(deadlineDate.getTime()) && deadlineDate < new Date();

  if (hasRegisteredInSession) {
    registerBtn.disabled = true;
    registerBtn.textContent = "Đã gửi đăng ký";
  } else if (campaign.status !== "OPEN") {
    registerBtn.disabled = true;
    registerBtn.textContent =
      campaign.status === "COMPLETED" ? "Chiến dịch đã hoàn thành" : "Chiến dịch đã đóng";
  } else if (isExpired) {
    registerBtn.disabled = true;
    registerBtn.textContent = "Đã hết hạn đăng ký";
  } else if (remainingSlots <= 0) {
    registerBtn.disabled = true;
    registerBtn.textContent = "Đã đủ số lượng";
  } else {
    registerBtn.disabled = false;
    registerBtn.textContent = "Đăng ký tham gia";
  }
}

function renderCampaignDetail(campaign) {
  currentCampaign = campaign;

  const statusBox = document.getElementById("detail-status-box");
  const detailContent = document.getElementById("detail-content");

  if (statusBox) statusBox.style.display = "none";
  if (detailContent) detailContent.style.display = "";

  const statusInfo = Layout.CAMPAIGN_DETAIL_STATUS_MAP[campaign.status] || {
    label: campaign.status || "Đang cập nhật",
    cls: "badge-primary",
  };

  document.title = `${campaign.title || "Chi tiết chiến dịch"} - VolunteerLink`;

  const setText = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  };

  setText("breadcrumb-title", campaign.title || "Chi tiết chiến dịch");
  setText("detail-title", campaign.title || "Chiến dịch tình nguyện");
  setText("detail-category", campaign.category || "Cộng đồng");
  setText("detail-organization", campaign.organization?.name || "Tổ chức xã hội");
  setText("detail-location", campaign.location || "Đang cập nhật");
  setText("sidebar-location", campaign.location || "Đang cập nhật");
  setText("detail-start-time", safeFormatDateTime(campaign.start_time));
  setText("detail-end-time", safeFormatDateTime(campaign.end_time));
  setText("detail-deadline", safeFormatDateTime(campaign.registration_deadline));
  setText("sidebar-deadline", safeFormatDateTime(campaign.registration_deadline));
  setText(
    "detail-hours",
    campaign.estimated_hours != null ? `${Number(campaign.estimated_hours)} giờ` : "Đang cập nhật"
  );
  setText("detail-description", campaign.description || "Chưa có mô tả chi tiết.");
  setText("detail-requirements", campaign.requirements || "Không có yêu cầu đặc biệt.");

  const detailBanner = document.getElementById("detail-banner");
  if (detailBanner) {
    detailBanner.src = campaign.image_url || Layout.DEFAULT_CAMPAIGN_IMAGE;
    detailBanner.alt = campaign.title || "Ảnh chiến dịch tình nguyện";
    Layout.applyFallbackImage(detailBanner);
  }

  const detailStatus = document.getElementById("detail-status");
  if (detailStatus) {
    detailStatus.className = `badge ${statusInfo.cls}`;
    detailStatus.textContent = statusInfo.label;
  }

  const maxParticipants = Number(campaign.max_participants || 0);
  const approvedCount = Number(campaign.approved_count || 0);
  const remainingSlots = Number(campaign.remaining_slots ?? 0);

  setText("detail-remaining-slots", String(remainingSlots));
  setText("detail-approved-ratio", `Đã duyệt: ${approvedCount}/${maxParticipants}`);

  const percent =
    maxParticipants > 0
      ? Math.min(100, Math.round((approvedCount / maxParticipants) * 100))
      : 0;
  const detailProgressFill = document.getElementById("detail-progress-fill");
  if (detailProgressFill) {
    detailProgressFill.style.width = `${percent}%`;
  }

  updateRegisterButtonState(campaign, remainingSlots);
}

async function loadCampaignDetail() {
  const campaignId = getCampaignIdFromUrl();
  if (!campaignId) {
    showDetailError("Không tìm thấy mã chiến dịch trên đường dẫn.");
    return;
  }

  showDetailLoading();

  try {
    const response = await api.get(`/campaigns/${encodeURIComponent(campaignId)}`);
    renderCampaignDetail(response.data);
  } catch (error) {
    const message = Layout.extractApiErrorMessage(
      error,
      "Không thể tải thông tin chiến dịch."
    );
    showDetailError(message);
    if (typeof showToast === "function") {
      showToast(message, "error");
    }
  }
}

async function handleRegisterCampaign() {
  if (!currentCampaign) return;

  if (typeof window.registerCampaign === "function") {
    window.registerCampaign(currentCampaign.id);
    return;
  }

  if (typeof Auth === "undefined" || !Auth.isLoggedIn()) {
    if (typeof showToast === "function") {
      showToast("Vui lòng đăng nhập với vai trò Tình nguyện viên để đăng ký!", "info");
    }
    const redirectTarget = `campaign_detail.html?id=${encodeURIComponent(currentCampaign.id)}`;
    setTimeout(() => {
      window.location.href = `login.html?redirect=${encodeURIComponent(redirectTarget)}`;
    }, 500);
    return;
  }

  let user = Auth.getUser();
  if (!user) {
    try {
      user = await Auth.getMe();
    } catch {
      return;
    }
  }

  if (user.role !== "USER") {
    if (typeof showToast === "function") {
      showToast(
        "Chỉ tài khoản Tình nguyện viên (USER) mới có thể đăng ký tham gia chiến dịch.",
        "warning"
      );
    }
    return;
  }

  const registerBtn = document.getElementById("btn-register-campaign");
  if (!registerBtn) return;

  registerBtn.disabled = true;
  const originalText = registerBtn.textContent;
  registerBtn.textContent = "Đang gửi đăng ký...";

  try {
    await api.post("/registrations/", {
      campaign_id: Number(currentCampaign.id),
      message: null,
    });
    hasRegisteredInSession = true;
    if (typeof showToast === "function") {
      showToast("Đăng ký tham gia chiến dịch thành công!", "success");
    }
    registerBtn.textContent = "Đã gửi đăng ký";
    await loadCampaignDetail();
  } catch (error) {
    const message = Layout.extractApiErrorMessage(error, "Đăng ký tham gia thất bại.");
    if (typeof showToast === "function") {
      showToast(message, "error");
    }
    registerBtn.disabled = false;
    registerBtn.textContent = originalText;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  Layout.renderPublicShell("btnDetailLogout");

  const registerBtn = document.getElementById("btn-register-campaign");
  if (registerBtn) {
    registerBtn.addEventListener("click", handleRegisterCampaign);
  }

  loadCampaignDetail();
});
