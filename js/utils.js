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

// "2026-11-04T09:30:00" -> "09:30 4/11/2026"
function formatDateTime(value) {
  const d = new Date(value);
  return d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }) + " " +
    d.toLocaleDateString("vi-VN");
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
  const allowed = ["image/jpeg", "image/png", "image/webp"];
  if (!file) return null;
  if (!allowed.includes((file.type || "").toLowerCase())) {
    throw new Error("Chỉ hỗ trợ ảnh định dạng JPG, PNG hoặc WEBP.");
  }
  if (file.size > 2 * 1024 * 1024) {
    throw new Error("Kích thước ảnh tối đa là 2MB.");
  }
  const formData = new FormData();
  formData.append("file", file);
  const res = await api.post("/profile/avatar", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
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
