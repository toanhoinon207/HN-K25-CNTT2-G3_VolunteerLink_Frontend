/**
 * Layout & Helper dùng chung cho các trang công khai (home.html, campaign.html, campaign_detail.html)
 * Tự động render Header/Footer vào #app-header & #app-footer, quản lý Auth Nav,
 * render thẻ chiến dịch, ảnh fallback và chuẩn hóa thông báo lỗi API.
 */

const Layout = {
  DEFAULT_CAMPAIGN_IMAGE: "../assets/images/logo.svg",

  CAMPAIGN_STATUS_MAP: {
    OPEN: { label: "Đang mở", cls: "badge-success" },
    CLOSED: { label: "Đã đóng", cls: "badge-warning" },
    COMPLETED: { label: "Hoàn thành", cls: "badge-info" },
  },

  CAMPAIGN_DETAIL_STATUS_MAP: {
    OPEN: { label: "Đang mở đăng ký", cls: "badge-success" },
    CLOSED: { label: "Đã đóng tuyển", cls: "badge-warning" },
    COMPLETED: { label: "Đã hoàn thành", cls: "badge-info" },
  },

  ROLE_LABELS: {
    USER: "Tình nguyện viên",
    ORGANIZER: "Nhà tổ chức",
    ADMIN: "Quản trị viên",
  },

  renderPublicShell(logoutBtnId = "btnPublicLogout") {
    const headerEl = document.getElementById("app-header");
    if (headerEl) {
      headerEl.innerHTML = `
        <div class="khung-a-header-inner">
          <a href="home.html" class="brand-logo">
            <div class="brand-logo-icon">
              <svg class="svg-icon" viewBox="0 0 24 24">
                <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 3.5 1 9.2-1.3 7.3-6.5 8.8-9 8.8Z"/>
                <path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/>
              </svg>
            </div>
            <span>Volunteer<span class="brand-accent">Link</span></span>
          </a>
          <nav id="headerAuthNav" class="header-nav"></nav>
        </div>
      `;
    }

    const footerEl = document.getElementById("app-footer");
    if (footerEl) {
      footerEl.innerHTML = `
        <div class="footer-inner">
          <div>
            <strong>VolunteerLink</strong> &copy; 2026 - Nền tảng kết nối tình nguyện cộng đồng
          </div>
        </div>
      `;
    }

    this.renderHeaderAuth(logoutBtnId);
  },

  renderHeaderAuth(logoutBtnId = "btnPublicLogout") {
    const nav = document.getElementById("headerAuthNav");
    if (!nav) return;

    const user = typeof Auth !== "undefined" ? Auth.getUser() : null;

    if (user && user.role) {
      const dashboardUrl = Auth.getDashboard(user.role);
      const fullName = user.full_name || user.name || user.email || "Người dùng";
      const displayName = escapeHtml(fullName);
      const roleLabel = escapeHtml(this.ROLE_LABELS[user.role] || user.role);

      const profileUrl =
        user.role === "USER" || user.role === "ORGANIZER"
          ? `${dashboardUrl}?tab=profile`
          : dashboardUrl;

      nav.innerHTML = `
        <a href="${dashboardUrl}" class="btn btn-primary btn-sm">Bảng điều khiển</a>

        <div class="vl-notif-wrap" id="vlNotifWrap">
          <button
            type="button"
            class="vl-notif-btn"
            id="vlNotifBtn"
            aria-label="Thông báo"
            aria-haspopup="true"
            aria-expanded="false"
            aria-controls="vlNotifPopover"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
              <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
            </svg>
            <span class="vl-notif-badge" id="vlNotifBadge" hidden>0</span>
          </button>

          <div class="vl-notif-popover" id="vlNotifPopover" role="region" aria-label="Thông báo" hidden>
            <div class="vl-notif-head">
              <span class="vl-notif-title">Thông báo</span>
              <div class="vl-notif-head-actions">
                <span class="vl-notif-new-pill" id="vlNotifNewPill">0 mới</span>
                <button type="button" class="vl-notif-readall-btn" id="vlNotifReadAllBtn">Đọc tất cả</button>
              </div>
            </div>
            <div class="vl-notif-list" id="vlNotifList">
              <div class="vl-notif-state">Đang tải thông báo...</div>
            </div>
            <div class="vl-notif-foot">
              <button type="button" class="vl-notif-viewall-btn" id="vlNotifViewAllBtn">Xem tất cả thông báo</button>
            </div>
          </div>
        </div>

        <div class="vl-user-menu" id="vlUserMenuWrap">
          <button
            type="button"
            class="vl-user-chip"
            id="vlUserMenuBtn"
            aria-haspopup="menu"
            aria-expanded="false"
            aria-controls="vlUserDropdown"
          >
            <div class="vl-user-avatar" id="vlHeaderAvatar" aria-hidden="true">U</div>
            <div class="vl-user-meta">
              <span class="vl-user-name">${displayName}</span>
              <span class="vl-user-role">${roleLabel}</span>
            </div>
            <svg class="vl-user-chevron" viewBox="0 0 24 24" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>
          </button>

          <div class="vl-user-dropdown" id="vlUserDropdown" role="menu" aria-labelledby="vlUserMenuBtn" hidden>
            <a href="${profileUrl}" class="vl-dropdown-item" role="menuitem">Hồ sơ cá nhân</a>
            <div class="vl-dropdown-divider" role="separator"></div>
            <button type="button" id="${logoutBtnId}" class="vl-dropdown-item vl-dropdown-item--danger" role="menuitem">Đăng xuất</button>
          </div>
        </div>
      `;

      if (typeof renderAvatarElement === "function") {
        renderAvatarElement(document.getElementById("vlHeaderAvatar"), user.avatar_url, fullName);
      } else {
        const av = document.getElementById("vlHeaderAvatar");
        if (av) av.textContent = fullName.trim().charAt(0).toUpperCase() || "U";
      }

      this.initHeaderUserMenu(logoutBtnId);
      this.initNotificationBell(user.role);
    } else {
      nav.innerHTML = `
        <a href="login.html" class="btn btn-outline btn-sm">Đăng nhập</a>
        <a href="register.html" class="btn btn-primary btn-sm">Đăng ký tham gia</a>
      `;
    }
  },

  initHeaderUserMenu(logoutBtnId) {
    const btn = document.getElementById("vlUserMenuBtn");
    const menu = document.getElementById("vlUserDropdown");
    const wrap = document.getElementById("vlUserMenuWrap");
    if (!btn || !menu || !wrap) return;

    const setOpen = (isOpen) => {
      btn.setAttribute("aria-expanded", String(isOpen));
      menu.hidden = !isOpen;
    };

    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const notifPop = document.getElementById("vlNotifPopover");
      const notifBtn = document.getElementById("vlNotifBtn");
      if (notifPop && !notifPop.hidden) {
        notifPop.hidden = true;
        if (notifBtn) notifBtn.setAttribute("aria-expanded", "false");
      }
      setOpen(menu.hidden);
    });

    document.addEventListener("click", (e) => {
      if (!wrap.contains(e.target)) setOpen(false);
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") setOpen(false);
    });

    const logoutBtn = document.getElementById(logoutBtnId);
    if (logoutBtn) {
      logoutBtn.addEventListener("click", async () => {
        try {
          if (typeof api !== "undefined") await api.post("/auth/logout");
        } catch {
          // Vẫn xóa session cục bộ nếu token đã hết hạn
        }
        Auth.clearSession();
        this.renderHeaderAuth(logoutBtnId);
        if (typeof showToast === "function") {
          showToast("Đã đăng xuất tài khoản!", "info");
        }
      });
    }
  },

  formatNotificationTime(value) {
    if (!value) return "";
    const d = new Date(value);
    if (isNaN(d.getTime())) return "";
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const mo = String(d.getMonth() + 1).padStart(2, "0");
    return `${hh}:${mm} ${dd}/${mo}`;
  },

  isSafeInternalLink(link) {
    const raw = String(link || "").trim();
    if (!raw) return false;
    if (/^(javascript|data|vbscript):/i.test(raw) || raw.startsWith("//")) return false;
    return true;
  },

  initNotificationBell(userRole) {
    const wrap = document.getElementById("vlNotifWrap");
    const btn = document.getElementById("vlNotifBtn");
    const pop = document.getElementById("vlNotifPopover");
    const badge = document.getElementById("vlNotifBadge");
    const newPill = document.getElementById("vlNotifNewPill");
    const listEl = document.getElementById("vlNotifList");
    const readAllBtn = document.getElementById("vlNotifReadAllBtn");
    const viewAllBtn = document.getElementById("vlNotifViewAllBtn");
    if (!wrap || !btn || !pop || typeof api === "undefined") return;

    let cachedItems = [];
    let currentUnread = 0;

    const updateUnreadUI = (count) => {
      currentUnread = Math.max(0, Number(count) || 0);
      if (badge) {
        badge.textContent = currentUnread > 9 ? "9+" : String(currentUnread);
        badge.hidden = currentUnread === 0;
      }
      if (newPill) {
        newPill.textContent = `${currentUnread} mới`;
      }
    };

    const fetchUnreadCount = async () => {
      try {
        const res = await api.get("/notifications/unread-count");
        updateUnreadUI(res.data?.unread_count ?? 0);
      } catch {
        // Giữ nguyên nút chuông kể cả khi lỗi mạng
      }
    };

    const renderList = (container, items) => {
      if (!container) return;
      if (!Array.isArray(items) || items.length === 0) {
        container.innerHTML = `<div class="vl-notif-state">Chưa có thông báo nào.</div>`;
        return;
      }
      const roleTag = this.ROLE_LABELS[userRole] || "Cá nhân";
      container.innerHTML = items
        .map((n) => {
          const unreadCls = n.is_read ? "" : "is-unread";
          const timeStr = escapeHtml(this.formatNotificationTime(n.created_at));
          return `
            <button type="button" class="vl-notif-item ${unreadCls}" data-notif-id="${escapeHtml(String(n.id))}">
              <span class="vl-notif-dot" aria-hidden="true"></span>
              <div class="vl-notif-content">
                <div class="vl-notif-item-top">
                  <span class="vl-notif-item-title">${escapeHtml(n.title || "Thông báo")}</span>
                  <span class="vl-notif-item-time">${timeStr}</span>
                </div>
                <div class="vl-notif-item-msg">${escapeHtml(n.message || "")}</div>
                <span class="vl-notif-tag">${escapeHtml(roleTag)}</span>
              </div>
            </button>
          `;
        })
        .join("");

      container.querySelectorAll(".vl-notif-item").forEach((itemBtn) => {
        itemBtn.addEventListener("click", async () => {
          const id = Number(itemBtn.getAttribute("data-notif-id"));
          const target = cachedItems.find((x) => x.id === id);
          if (target && !target.is_read) {
            target.is_read = true;
            itemBtn.classList.remove("is-unread");
            updateUnreadUI(currentUnread - 1);
            try {
              await api.patch(`/notifications/${id}/read`);
            } catch {
              // Bỏ qua lỗi phụ khi chuyển trang
            }
          }
          if (target && this.isSafeInternalLink(target.link)) {
            window.location.href = target.link;
          }
        });
      });
    };

    const loadNotifications = async (container = listEl, limit = 15) => {
      if (container) container.innerHTML = `<div class="vl-notif-state">Đang tải thông báo...</div>`;
      try {
        const res = await api.get("/notifications", { params: { skip: 0, limit } });
        cachedItems = Array.isArray(res.data) ? res.data : [];
        renderList(container, cachedItems);
      } catch (err) {
        if (container) {
          container.innerHTML = `<div class="vl-notif-state">${escapeHtml(this.extractApiErrorMessage(err, "Không thể tải thông báo."))}</div>`;
        }
      }
    };

    const setOpen = (isOpen) => {
      btn.setAttribute("aria-expanded", String(isOpen));
      pop.hidden = !isOpen;
      if (isOpen) {
        loadNotifications(listEl, 15);
      }
    };

    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const userMenu = document.getElementById("vlUserDropdown");
      const userBtn = document.getElementById("vlUserMenuBtn");
      if (userMenu && !userMenu.hidden) {
        userMenu.hidden = true;
        if (userBtn) userBtn.setAttribute("aria-expanded", "false");
      }
      setOpen(pop.hidden);
    });

    document.addEventListener("click", (e) => {
      if (!wrap.contains(e.target)) setOpen(false);
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") setOpen(false);
    });

    if (readAllBtn) {
      readAllBtn.addEventListener("click", async () => {
        try {
          await api.patch("/notifications/read-all");
          cachedItems.forEach((n) => { n.is_read = true; });
          updateUnreadUI(0);
          renderList(listEl, cachedItems);
        } catch (err) {
          if (typeof showToast === "function") {
            showToast(this.extractApiErrorMessage(err, "Không thể đánh dấu đã đọc."), "error");
          }
        }
      });
    }

    if (viewAllBtn) {
      viewAllBtn.addEventListener("click", () => {
        setOpen(false);
        this.openAllNotificationsModal(loadNotifications);
      });
    }

    fetchUnreadCount();
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible" && Auth.getToken()) {
        fetchUnreadCount();
      }
    });
  },

  openAllNotificationsModal(loadFn) {
    let modal = document.getElementById("vlNotifAllModal");
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "vlNotifAllModal";
      modal.className = "vl-notif-modal-backdrop";
      modal.setAttribute("role", "dialog");
      modal.setAttribute("aria-modal", "true");
      modal.setAttribute("aria-labelledby", "vlNotifAllModalTitle");
      modal.innerHTML = `
        <div class="vl-notif-modal">
          <div class="vl-notif-head">
            <span class="vl-notif-title" id="vlNotifAllModalTitle">Tất cả thông báo</span>
            <button type="button" class="vl-notif-readall-btn" id="vlNotifModalCloseBtn" aria-label="Đóng">Đóng</button>
          </div>
          <div class="vl-notif-modal-body" id="vlNotifModalBody"></div>
        </div>
      `;
      document.body.appendChild(modal);

      const close = () => modal.classList.remove("open");
      modal.querySelector("#vlNotifModalCloseBtn")?.addEventListener("click", close);
      modal.addEventListener("click", (e) => {
        if (e.target === modal) close();
      });
      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && modal.classList.contains("open")) close();
      });
    }

    modal.classList.add("open");
    loadFn(document.getElementById("vlNotifModalBody"), 50);
  },

  applyFallbackImage(imgEl) {
    if (!imgEl) return;
    imgEl.onerror = () => {
      if (!imgEl.src.endsWith("logo.svg")) {
        imgEl.src = this.DEFAULT_CAMPAIGN_IMAGE;
      }
    };
  },

  createCampaignCard(campaign, templateEl) {
    const fragment = templateEl.content.cloneNode(true);
    const detailUrl = `campaign_detail.html?id=${encodeURIComponent(campaign.id)}`;
    const statusInfo = this.CAMPAIGN_STATUS_MAP[campaign.status] || {
      label: campaign.status || "Đang cập nhật",
      cls: "badge-primary",
    };

    const imgEl = fragment.querySelector(".campaign-card-img");
    imgEl.src = campaign.image_url || this.DEFAULT_CAMPAIGN_IMAGE;
    imgEl.alt = campaign.title || "Ảnh chiến dịch tình nguyện";
    this.applyFallbackImage(imgEl);

    const categoryEl = fragment.querySelector(".card-category");
    categoryEl.textContent = campaign.category || "Cộng đồng";

    const statusEl = fragment.querySelector(".card-status");
    statusEl.className = `badge ${statusInfo.cls} card-status`;
    statusEl.textContent = statusInfo.label;

    const titleLinkEl = fragment.querySelector(".card-title-link");
    titleLinkEl.href = detailUrl;
    titleLinkEl.textContent = campaign.title || "Chiến dịch tình nguyện";

    const descEl = fragment.querySelector(".campaign-card-desc");
    descEl.textContent = campaign.description || "Chưa có mô tả chi tiết.";

    const locationEl = fragment.querySelector(".card-location");
    locationEl.textContent = campaign.location || "Đang cập nhật";

    const orgEl = fragment.querySelector(".card-org");
    orgEl.textContent = campaign.organization?.name || "Tổ chức xã hội";

    const detailBtnEl = fragment.querySelector(".card-detail-btn");
    detailBtnEl.href = detailUrl;

    return fragment;
  },

  renderStateBox(container, message, modifier = "") {
    if (!container) return;
    container.innerHTML = "";
    const box = document.createElement("div");
    box.className = `home-state-box ${modifier}`.trim();
    box.textContent = message;
    container.appendChild(box);
  },

  extractApiErrorMessage(error, fallbackMessage = "Đã xảy ra lỗi khi tải dữ liệu.") {
    const detail = error?.response?.data?.detail;
    if (typeof detail === "string" && detail.trim()) {
      return detail;
    }
    if (Array.isArray(detail) && detail.length > 0) {
      return detail.map((item) => item.msg || "Dữ liệu không hợp lệ").join("; ");
    }
    if (error?.code === "ECONNABORTED") {
      return "Quá thời gian kết nối tới máy chủ Backend.";
    }
    if (!error?.response) {
      return "Không kết nối được tới máy chủ Backend. Vui lòng kiểm tra server đã bật chưa.";
    }
    return fallbackMessage || `Lỗi máy chủ (HTTP ${error.response.status}).`;
  },
};
