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
    toast.style.transform = "translateY(8px)";
    toast.style.transition = "all 0.25s cubic-bezier(0.16, 1, 0.3, 1)";
    setTimeout(() => toast.remove(), 250);
  }, 3500);
}
