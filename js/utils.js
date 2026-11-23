// Các hàm tiện ích dùng chung cho nhiều trang.

// Chống XSS: luôn dùng hàm này khi chèn dữ liệu người dùng nhập vào innerHTML
function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = value ?? "";
  return div.innerHTML;
}

// 45000 -> "45.000 ₫"
function formatMoney(value) {
  return Number(value).toLocaleString("vi-VN") + " ₫";
}

// Chuẩn hóa chuỗi ngày giờ từ API (mặc định +07:00 nếu thiếu múi giờ)
function parseApiDate(value) {
  if (!value) return null;
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
  const str = String(value).trim().replace(" ", "T");
  if (!str) return null;
  const normalized = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(str) ? str : `${str}+07:00`;
  const d = new Date(normalized);
  return isNaN(d.getTime()) ? null : d;
}

// "2026-11-04T09:30:00" -> "09:30 AM 4/11/2026"
function formatDateTime(value) {
  const d = parseApiDate(value);
  if (!d) return "--";
  return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true }) + " " +
    d.toLocaleDateString("vi-VN");
}

function safeFormatDateTime(value, fallback = "--") {
  const d = parseApiDate(value);
  if (!d) return fallback;
  return formatDateTime(d);
}

function isSafeHttpUrl(url) {
  const raw = String(url || "").trim();
  if (!raw) return false;
  try {
    const parsed = new URL(raw, window.location.origin);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function extractApiError(error, fallback = "Đã xảy ra lỗi khi kết nối máy chủ.") {
  const detail = error?.response?.data?.detail;
  if (typeof detail === "string" && detail.trim()) return detail;
  if (Array.isArray(detail) && detail.length > 0) {
    return detail.map((item) => item.msg || "Dữ liệu không hợp lệ").join("; ");
  }
  if (error?.code === "ECONNABORTED") {
    return "Quá thời gian kết nối tới máy chủ Backend.";
  }
  if (!error?.response) {
    return "Không thể kết nối tới Backend. Vui lòng kiểm tra server đã bật chưa.";
  }
  return fallback || `Lỗi máy chủ (HTTP ${error.response.status}).`;
}

// Hiện thông báo Toast nổi ở góc màn hình. type: "success" | "error" | "warning" | "info"
function showToast(message, type = "success") {
  let container = document.querySelector(".toast-container");
  if (!container) {
    container = document.createElement("div");
    container.className = "toast-container";
    document.body.appendChild(container);
  }

  const toast = document.createElement("div");
  const normalizedType = type === "danger" ? "error" : type;
  toast.className = `toast toast-${normalizedType}`;

  let iconSvg = "";
  if (normalizedType === "success") {
    iconSvg = '<svg class="svg-icon svg-icon-sm" style="color:var(--success);flex-shrink:0;width:18px;height:18px;" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>';
  } else if (normalizedType === "error") {
    iconSvg = '<svg class="svg-icon svg-icon-sm" style="color:var(--danger);flex-shrink:0;width:18px;height:18px;" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>';
  } else if (normalizedType === "warning") {
    iconSvg = '<svg class="svg-icon svg-icon-sm" style="color:var(--warning);flex-shrink:0;width:18px;height:18px;" viewBox="0 0 24 24"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
  } else {
    iconSvg = '<svg class="svg-icon svg-icon-sm" style="color:var(--info);flex-shrink:0;width:18px;height:18px;" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>';
  }

  toast.innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;flex:1;">
      ${iconSvg}
      <span style="font-weight:500;">${escapeHtml(message)}</span>
    </div>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(-8px)";
    toast.style.transition = "all 0.25s cubic-bezier(0.16, 1, 0.3, 1)";
    setTimeout(() => toast.remove(), 250);
  }, 3500);
}

function resolveBackendAssetUrl(url) {
  const raw = String(url || "").trim();
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith("/uploads/")) {
    const base = (typeof CONFIG !== "undefined" && CONFIG.API_BASE_URL ? CONFIG.API_BASE_URL : "")
      .replace(/\/api\/?$/, "");
    return base + raw;
  }
  return null;
}

function renderAvatarElement(containerEl, avatarUrl, fallbackText = "U") {
  if (!containerEl) return;
  const letter = String(fallbackText || "U").trim().charAt(0).toUpperCase() || "U";
  const resolved = resolveBackendAssetUrl(avatarUrl);
  containerEl.textContent = "";
  if (!resolved) {
    containerEl.textContent = letter;
    return;
  }
  const img = document.createElement("img");
  img.src = resolved;
  img.alt = "";
  img.addEventListener("error", () => {
    containerEl.textContent = letter;
  });
  containerEl.appendChild(img);
}

async function uploadAvatarFile(file) {
  const allowed = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
  if (!file) return null;
  const mime = (file.type || "").toLowerCase();
  const hasAllowedExt = /\.(jpe?g|png|webp)$/i.test(file.name || "");
  if (!allowed.includes(mime) && !hasAllowedExt) {
    throw new Error("Chỉ hỗ trợ ảnh định dạng JPG, PNG hoặc WEBP.");
  }
  if (file.size > 2 * 1024 * 1024) {
    throw new Error("Kích thước ảnh tối đa là 2MB.");
  }
  const formData = new FormData();
  formData.append("file", file);
  const res = await api.post("/profile/avatar", formData);
  return res.data;
}

function openAvatarPreviewModal(avatarUrl, displayName = "Ảnh đại diện") {
  const resolved = resolveBackendAssetUrl(avatarUrl);
  if (!resolved) {
    if (typeof showToast === "function") {
      showToast("Bạn chưa có ảnh đại diện.", "info");
    }
    return;
  }

  let modal = document.getElementById("avatarPreviewModal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "avatarPreviewModal";
    modal.className = "dash-modal-backdrop";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-labelledby", "avatarPreviewModalTitle");
    modal.innerHTML = `
      <div class="dash-modal" style="max-width: 440px;">
        <div class="dash-modal-header">
          <h3 id="avatarPreviewModalTitle">Ảnh đại diện</h3>
          <button type="button" class="dash-modal-close" aria-label="Đóng hộp thoại">&times;</button>
        </div>
        <div class="dash-modal-body" style="padding: 16px;">
          <img id="avatarPreviewModalImg" class="ud-avatar-lightbox-img" alt="Ảnh đại diện">
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    const close = () => modal.classList.remove("open");
    modal.querySelector(".dash-modal-close")?.addEventListener("click", close);
    modal.addEventListener("click", (e) => {
      if (e.target === modal) close();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && modal.classList.contains("open")) close();
    });
  }

  const titleEl = modal.querySelector("#avatarPreviewModalTitle");
  const imgEl = modal.querySelector("#avatarPreviewModalImg");
  if (titleEl) titleEl.textContent = displayName ? `Ảnh đại diện — ${displayName}` : "Ảnh đại diện";
  if (imgEl) imgEl.src = resolved;
  modal.classList.add("open");
}

/* ---------- Unified Modal Helper (dùng chung cho mọi trang & dashboard) ---------- */
const VLModal = (() => {
  const openerMap = new Map();
  const closeHooks = new Map();
  let initialized = false;

  function ensureListeners() {
    if (initialized) return;
    initialized = true;

    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      const openModals = document.querySelectorAll(".dash-modal-backdrop.open");
      const topModal = openModals[openModals.length - 1];
      if (topModal && topModal.id) {
        close(topModal.id);
      }
    });

    document.addEventListener("click", (e) => {
      const target = e.target;
      if (target && target.classList?.contains("dash-modal-backdrop") && target.classList.contains("open") && target.id) {
        close(target.id);
      }
    });
  }

  function open(modalId) {
    ensureListeners();
    const modal = document.getElementById(modalId);
    if (!modal) return;
    const active = document.activeElement;
    if (active && active instanceof HTMLElement && !modal.contains(active)) {
      openerMap.set(modalId, active);
    }
    modal.classList.add("open");
    const focusable = modal.querySelector(
      "input:not([type='hidden']):not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex='-1'])"
    );
    if (focusable && typeof focusable.focus === "function") {
      requestAnimationFrame(() => focusable.focus());
    }
  }

  function close(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    modal.classList.remove("open");

    const hook = closeHooks.get(modalId);
    if (typeof hook === "function") hook(modalId);

    const opener = openerMap.get(modalId);
    openerMap.delete(modalId);
    if (opener && document.contains(opener) && typeof opener.focus === "function") {
      opener.focus();
    }
  }

  function onClose(modalId, handler) {
    if (modalId && typeof handler === "function") {
      closeHooks.set(modalId, handler);
    }
  }

  function confirm({ title = "Xác nhận thao tác", message = "Bạn có chắc chắn muốn thực hiện?", confirmText = "Xác nhận", cancelText = "Hủy", danger = false } = {}) {
    return new Promise((resolve) => {
      let modal = document.getElementById("vlConfirmModal");
      if (!modal) {
        modal = document.createElement("div");
        modal.id = "vlConfirmModal";
        modal.className = "dash-modal-backdrop";
        modal.setAttribute("role", "dialog");
        modal.setAttribute("aria-modal", "true");
        modal.setAttribute("aria-labelledby", "vlConfirmModalTitle");
        modal.innerHTML = `
          <div class="dash-modal" style="max-width: 440px;">
            <div class="dash-modal-header">
              <h3 id="vlConfirmModalTitle"></h3>
              <button type="button" class="dash-modal-close" id="vlConfirmCloseBtn" aria-label="Đóng hộp thoại">&times;</button>
            </div>
            <div class="dash-modal-body">
              <p id="vlConfirmModalMessage" style="margin: 0;"></p>
            </div>
            <div class="dash-modal-footer">
              <button type="button" class="btn btn-outline" id="vlConfirmCancelBtn"></button>
              <button type="button" class="btn" id="vlConfirmOkBtn"></button>
            </div>
          </div>
        `;
        document.body.appendChild(modal);
      }

      const titleEl = modal.querySelector("#vlConfirmModalTitle");
      const msgEl = modal.querySelector("#vlConfirmModalMessage");
      const cancelBtn = modal.querySelector("#vlConfirmCancelBtn");
      const okBtn = modal.querySelector("#vlConfirmOkBtn");
      const closeBtn = modal.querySelector("#vlConfirmCloseBtn");

      if (titleEl) titleEl.textContent = title;
      if (msgEl) msgEl.textContent = message;
      if (cancelBtn) cancelBtn.textContent = cancelText;
      if (okBtn) {
        okBtn.textContent = confirmText;
        okBtn.className = danger ? "btn btn-danger" : "btn btn-primary";
      }

      let settled = false;
      const finish = (result) => {
        if (settled) return;
        settled = true;
        closeHooks.delete("vlConfirmModal");
        close("vlConfirmModal");
        resolve(result);
      };

      onClose("vlConfirmModal", () => {
        if (!settled) {
          settled = true;
          closeHooks.delete("vlConfirmModal");
          resolve(false);
        }
      });

      if (okBtn) okBtn.onclick = () => finish(true);
      if (cancelBtn) cancelBtn.onclick = () => finish(false);
      if (closeBtn) closeBtn.onclick = () => finish(false);

      open("vlConfirmModal");
    });
  }

  return { open, close, onClose, confirm };
})();

window.VLModal = VLModal;
window.openModal = (modalId) => VLModal.open(modalId);
window.closeModal = (modalId) => VLModal.close(modalId);

function setRefreshSpin(btn, spinning) {
  if (!btn) return;
  btn.classList.toggle("is-spinning", Boolean(spinning));
  btn.disabled = Boolean(spinning);
}

async function waitMinSpin(startedAt, minMs = 450) {
  const waitMs = Math.max(0, minMs - (Date.now() - startedAt));
  if (waitMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }
}
