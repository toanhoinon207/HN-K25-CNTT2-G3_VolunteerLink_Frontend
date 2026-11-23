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

function formatCampaignDateTime(value) {
  const d = typeof parseApiDate === "function" ? parseApiDate(value) : new Date(value);
  if (!d || isNaN(d.getTime())) return "Đang cập nhật";
  return typeof formatDateTime === "function"
    ? formatDateTime(d)
    : d.toLocaleString("vi-VN");
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

  const deadlineDate = typeof parseApiDate === "function"
    ? parseApiDate(campaign.registration_deadline)
    : new Date(campaign.registration_deadline);
  const isExpired = deadlineDate && !isNaN(deadlineDate.getTime()) && deadlineDate < new Date();

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
    registerBtn.disabled = false;
    registerBtn.textContent = "Đăng ký vào danh sách chờ";
  } else {
    registerBtn.disabled = false;
    registerBtn.textContent = "Đăng ký tham gia";
  }
}

function renderOrganizerSidebar(campaign) {
  const card = document.querySelector(".registration-card");
  if (!card) return;

  const titleEl = card.querySelector("h3");
  if (titleEl) titleEl.textContent = "Quản lý chiến dịch";

  const registerBtn = document.getElementById("btn-register-campaign");
  if (registerBtn) registerBtn.style.display = "none";

  let actionsWrap = document.getElementById("org-detail-actions");
  if (!actionsWrap) {
    actionsWrap = document.createElement("div");
    actionsWrap.id = "org-detail-actions";
    actionsWrap.style.cssText = "display: flex; flex-direction: column; gap: 10px; margin-top: 14px;";
    card.appendChild(actionsWrap);
  }

  const id = campaign.id;
  const st = campaign.status;
  let html = "";

  if (st === "DRAFT") {
    html += `<button type="button" class="btn btn-primary btn-block" id="orgDetailSubmitBtn">Gửi duyệt Admin</button>`;
  }
  if (st === "PENDING") {
    html += `<div style="padding: 10px 12px; border-radius: 10px; background: #fffbeb; border: 1px solid #fde68a; color: #b45309; font-size: 0.85rem;">Chiến dịch đang chờ Quản trị viên phê duyệt.</div>`;
  }
  if (["OPEN", "CLOSED"].includes(st)) {
    html += `<a href="organizer-dashboard.html?tab=attendance&campaign_id=${id}" class="btn btn-primary btn-block" style="text-align:center;">Mở Trạm Điểm danh</a>`;
  }
  if (["OPEN", "CLOSED", "COMPLETED"].includes(st)) {
    html += `<a href="organizer-dashboard.html?tab=volunteers&campaign_id=${id}" class="btn btn-outline btn-block" style="text-align:center;">Xem &amp; Duyệt đơn TNV</a>`;
  }
  if (st === "COMPLETED") {
    html += `<a href="organizer-dashboard.html?tab=certificates" class="btn btn-outline btn-block" style="text-align:center;">Cấp chứng chỉ</a>`;
  }
  if (!["COMPLETED", "CANCELLED"].includes(st)) {
    html += `<button type="button" class="btn btn-outline btn-block" id="orgDetailCancelBtn" style="color: #b91c1c; border-color: #fecaca;">Hủy chiến dịch</button>`;
  }
  html += `<a href="organizer-dashboard.html?tab=campaigns" class="btn btn-outline btn-block" style="text-align:center;">← Quay lại Quản lý chiến dịch</a>`;

  actionsWrap.innerHTML = html;

  const submitBtn = document.getElementById("orgDetailSubmitBtn");
  if (submitBtn) {
    submitBtn.addEventListener("click", async () => {
      submitBtn.disabled = true;
      try {
        await api.post(`/campaigns/${id}/submit`);
        if (typeof showToast === "function") showToast("Đã gửi chiến dịch tới Quản trị viên phê duyệt!", "success");
        await loadCampaignDetail();
      } catch (err) {
        if (typeof showToast === "function") showToast(Layout.extractApiErrorMessage(err, "Không thể gửi duyệt."), "error");
        submitBtn.disabled = false;
      }
    });
  }

  const cancelBtn = document.getElementById("orgDetailCancelBtn");
  if (cancelBtn) {
    cancelBtn.addEventListener("click", () => {
      const reasonInput = document.getElementById("cancelCampaignReasonInput");
      if (reasonInput) {
        reasonInput.value = st === "DRAFT" ? "Hủy bản nháp" : "";
      }
      const confirmBtn = document.getElementById("confirmCancelCampaignDetailBtn");
      if (confirmBtn) {
        confirmBtn.disabled = false;
        confirmBtn.onclick = async () => {
          const trimmed = (reasonInput?.value || "").trim();
          if (!trimmed) {
            if (typeof showToast === "function") showToast("Vui lòng nhập lý do hủy chiến dịch.", "warning");
            reasonInput?.focus();
            return;
          }
          confirmBtn.disabled = true;
          try {
            await api.patch(`/campaigns/${id}/cancel`, { reason: trimmed });
            closeModal("cancelCampaignDetailModal");
            if (typeof showToast === "function") showToast("Đã hủy chiến dịch.", "success");
            await loadCampaignDetail();
          } catch (err) {
            if (typeof showToast === "function") showToast(Layout.extractApiErrorMessage(err, "Không thể hủy chiến dịch."), "error");
            confirmBtn.disabled = false;
          }
        };
      }
      openModal("cancelCampaignDetailModal");
    });
  }
}

function renderReasonAlert(campaign) {
  let box = document.getElementById("detail-reason-box");
  if (!campaign.reason) {
    if (box) box.remove();
    return;
  }
  if (!box) {
    box = document.createElement("div");
    box.id = "detail-reason-box";
    box.style.cssText = "margin: 16px 0; padding: 12px 16px; border-radius: 10px; background: #fef2f2; border: 1px solid #fecaca; color: #991b1b; font-size: 0.92rem;";
    const grid = document.querySelector(".detail-info-grid");
    if (grid && grid.parentNode) {
      grid.parentNode.insertBefore(box, grid.nextSibling);
    }
  }
  box.innerHTML = `<strong>${campaign.status === "CANCELLED" ? "Lý do hủy:" : "Góp ý / Lý do từ chối:"}</strong> ${escapeHtml(campaign.reason)}`;
}

function renderReadOnlySidebar(campaign) {
  const card = document.querySelector(".registration-card");
  if (!card) return;

  const titleEl = card.querySelector("h3");
  if (titleEl) titleEl.textContent = "Thông tin chiến dịch";

  const registerBtn = document.getElementById("btn-register-campaign");
  if (registerBtn) registerBtn.style.display = "none";

  let actionsWrap = document.getElementById("org-detail-actions");
  if (!actionsWrap) {
    actionsWrap = document.createElement("div");
    actionsWrap.id = "org-detail-actions";
    actionsWrap.style.cssText = "margin-top: 14px;";
    card.appendChild(actionsWrap);
  }

  const statusInfo = Layout.getCampaignStatusInfo(campaign, true) || {
    label: campaign?.status || "Đang cập nhật",
    cls: "badge-primary",
  };

  actionsWrap.innerHTML = `
    <div style="display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 10px 14px; border-radius: 10px; background: #f8fafc; border: 1px solid #e2e8f0;">
      <span style="font-size: 0.86rem; color: #64748b; font-weight: 500;">Trạng thái</span>
      <span class="badge ${escapeHtml(statusInfo.cls)}">${escapeHtml(statusInfo.label)}</span>
    </div>
  `;
}

function renderCampaignDetail(campaign, options = {}) {
  currentCampaign = campaign;

  const statusBox = document.getElementById("detail-status-box");
  const detailContent = document.getElementById("detail-content");

  if (statusBox) statusBox.style.display = "none";
  if (detailContent) detailContent.style.display = "";

  const statusInfo = Layout.getCampaignStatusInfo(campaign, true) || {
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
  setText("detail-start-time", formatCampaignDateTime(campaign.start_time));
  setText("detail-end-time", formatCampaignDateTime(campaign.end_time));
  setText("detail-deadline", formatCampaignDateTime(campaign.registration_deadline));
  setText("sidebar-deadline", formatCampaignDateTime(campaign.registration_deadline));
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

  renderReasonAlert(campaign);

  const viewerRole = typeof Auth !== "undefined" ? Auth.getUser()?.role : null;
  if (options.isOwnedOrganizer) {
    renderOrganizerSidebar(campaign);
  } else if (viewerRole === "ORGANIZER" || viewerRole === "ADMIN") {
    renderReadOnlySidebar(campaign);
  } else {
    const actionsWrap = document.getElementById("org-detail-actions");
    if (actionsWrap) actionsWrap.remove();
    const titleEl = document.querySelector(".registration-card h3");
    if (titleEl) titleEl.textContent = "Tham Gia Chiến Dịch";
    const registerBtn = document.getElementById("btn-register-campaign");
    if (registerBtn) registerBtn.style.display = "";
    updateRegisterButtonState(campaign, remainingSlots);
  }
}

async function loadCampaignDetail() {
  const campaignId = getCampaignIdFromUrl();
  if (!campaignId) {
    showDetailError("Không tìm thấy mã chiến dịch trên đường dẫn.");
    return;
  }

  showDetailLoading();

  const currentUser = typeof Auth !== "undefined" ? Auth.getUser() : null;
  if (currentUser?.role === "ADMIN") {
    try {
      const adminRes = await api.get(`/admin/campaigns/${encodeURIComponent(campaignId)}`);
      renderCampaignDetail(adminRes.data);
      return;
    } catch {
      // Fallback sang endpoint công khai nếu lỗi
    }
  }
  if (currentUser?.role === "ORGANIZER") {
    try {
      const [mineRes, orgRes] = await Promise.all([
        api.get("/campaigns/mine"),
        api.get("/organizations/me").catch(() => null),
      ]);
      const mineList = Array.isArray(mineRes.data) ? mineRes.data : [];
      const found = mineList.find((c) => String(c.id) === String(campaignId));
      if (found) {
        const approved = Number(found.registered_count || 0);
        const maxPart = Number(found.max_participants || 0);
        const normalized = {
          ...found,
          approved_count: approved,
          remaining_slots: Math.max(maxPart - approved, 0),
          organization: orgRes?.data || { name: currentUser.full_name || "Tổ chức của bạn" },
        };
        renderCampaignDetail(normalized, { isOwnedOrganizer: true });
        return;
      }
    } catch {
      // Fallback sang endpoint công khai nếu /campaigns/mine lỗi
    }
  }

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
    const result = await api.post("/registrations/", {
      campaign_id: Number(currentCampaign.id),
      message: null,
    });
    hasRegisteredInSession = true;
    if (typeof showToast === "function") {
      const status = result.data?.status;
      const message = status === "WAITLISTED"
        ? "Đã vào danh sách chờ. Bạn sẽ nhận lời mời khi đến lượt."
        : status === "PENDING"
          ? "Đã gửi yêu cầu. Đang chờ tổ chức xét duyệt."
          : status === "APPROVED"
            ? "Đăng ký đã được duyệt."
            : "Yêu cầu đã được ghi nhận.";
      showToast(message, "success");
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
