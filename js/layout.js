/**
 * Layout & Helper dùng chung cho các trang công khai (home.html, campaign.html, campaign_detail.html)
 * Tự động render Header/Footer vào #app-header & #app-footer, quản lý Auth Nav,
 * render thẻ chiến dịch, ảnh fallback và chuẩn hóa thông báo lỗi API.
 */

const Layout = {
  DEFAULT_CAMPAIGN_IMAGE: "../assets/images/logo.svg",

  CAMPAIGN_STATUS_MAP: {
    DRAFT: { label: "Bản nháp", cls: "badge-info" },
    PENDING: { label: "Chờ duyệt", cls: "badge-warning" },
    OPEN: { label: "Đang mở", cls: "badge-success" },
    CLOSED: { label: "Đã đóng", cls: "badge-warning" },
    COMPLETED: { label: "Hoàn thành", cls: "badge-info" },
    CANCELLED: { label: "Đã hủy", cls: "badge-danger" },
  },

  CAMPAIGN_DETAIL_STATUS_MAP: {
    DRAFT: { label: "Bản nháp", cls: "badge-info" },
    PENDING: { label: "Chờ Admin duyệt", cls: "badge-warning" },
    OPEN: { label: "Đang mở đăng ký", cls: "badge-success" },
    CLOSED: { label: "Đã đóng tuyển", cls: "badge-warning" },
    COMPLETED: { label: "Đã hoàn thành", cls: "badge-info" },
    CANCELLED: { label: "Đã hủy", cls: "badge-danger" },
  },

  // Presentation-only status. Raw DB status remains the source for permissions.
  getCampaignDisplayStatus(campaign) {
    if (!campaign) return "DRAFT";
    if (["DRAFT", "PENDING", "CANCELLED", "COMPLETED"].includes(campaign.status)) return campaign.status;
    const toVnDate = (value) => {
      if (!value) return null;
      const str = String(value).replace(" ", "T");
      return new Date(/(?:Z|[+-]\d{2}:?\d{2})$/.test(str) ? str : `${str}+07:00`);
    };
    // Recompute on the client so a page left open also changes label at the boundary.
    const now = Date.now();
    const end = toVnDate(campaign.end_time);
    const start = toVnDate(campaign.start_time);
    const deadline = toVnDate(campaign.registration_deadline);
    if (end && now >= end.getTime()) return "COMPLETED";
    if (start && now >= start.getTime()) return "IN_PROGRESS";
    if (campaign.status === "CLOSED" || (deadline && now >= deadline.getTime())) return "REGISTRATION_CLOSED";
    return "REGISTRATION_OPEN";
  },

  getCampaignStatusInfo(campaign, detail = false) {
    const key = this.getCampaignDisplayStatus(campaign);
    const derived = {
      IN_PROGRESS: { label: "Đang diễn ra", cls: "badge-success" },
      REGISTRATION_CLOSED: { label: "Đã đóng đăng ký", cls: "badge-warning" },
      REGISTRATION_OPEN: { label: "Đang mở đăng ký", cls: "badge-success" },
    };
    return derived[key] || (detail ? this.CAMPAIGN_DETAIL_STATUS_MAP : this.CAMPAIGN_STATUS_MAP)[key] ||
      { label: key, cls: "badge-info" };
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
            <div class="brand-logo-icon" aria-hidden="true">
              <svg class="svg-icon" viewBox="0 0 24 24">
                <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 3.5 1 9.2-1.3 7.3-6.5 8.8-9 8.8Z"/>
                <path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/>
              </svg>
            </div>
            <span>Volunteer<span class="brand-accent">Link</span></span>
          </a>
          <nav id="headerAuthNav" class="header-nav" aria-label="Tài khoản"></nav>
        </div>
      `;
    }

    const footerEl = document.getElementById("app-footer");
    if (footerEl) {
      footerEl.classList.add("khung-a-footer--full");
      footerEl.innerHTML = `
        <div class="footer-inner footer-grid">
          <div class="footer-brand-col">
            <a href="home.html" class="brand-logo footer-brand-logo">
              <div class="brand-logo-icon" aria-hidden="true">
                <svg class="svg-icon" viewBox="0 0 24 24">
                  <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 3.5 1 9.2-1.3 7.3-6.5 8.8-9 8.8Z"/>
                  <path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/>
                </svg>
              </div>
              <span>Volunteer<span class="brand-accent">Link</span></span>
            </a>
            <p class="footer-tagline">Nền tảng kết nối tình nguyện viên với các tổ chức xã hội minh bạch, xác thực giờ đóng góp và chứng nhận điện tử.</p>
          </div>
          <div class="footer-links-col">
            <h3 class="footer-col-title">Khám phá</h3>
            <ul class="footer-links-list">
              <li><a href="home.html">Trang chủ</a></li>
              <li><a href="campaign.html">Tìm kiếm chiến dịch</a></li>
              <li><a href="campaign.html?status=OPEN">Chiến dịch đang mở</a></li>
            </ul>
          </div>
          <div class="footer-links-col">
            <h3 class="footer-col-title">Tham gia</h3>
            <ul class="footer-links-list">
              <li><a href="login.html">Đăng nhập</a></li>
              <li><a href="register.html">Đăng ký tình nguyện viên</a></li>
              <li><a href="register.html">Đăng ký tổ chức điều phối</a></li>
            </ul>
          </div>
        </div>
        <div class="footer-bottom">
          <span><strong>VolunteerLink</strong> &copy; 2026 - Nền tảng kết nối tình nguyện cộng đồng</span>
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
        if (!(await Auth.confirmLogout())) return;
        Auth.logout();
      });
    }
  },

  formatNotificationTime(value) {
    const d = typeof parseApiDate === "function" ? parseApiDate(value) : new Date(value);
    if (!d || isNaN(d.getTime())) return "";
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
    try {
      const target = new URL(raw, window.location.href);
      return (
        target.origin === window.location.origin &&
        ["http:", "https:"].includes(target.protocol)
      );
    } catch {
      return false;
    }
  },

  resolveNotificationLink(link, userRole) {
    const raw = String(link || "").trim();
    if (!raw) return null;
    if (!this.isSafeInternalLink(raw)) return null;

    const campaignMatch = raw.match(/^\/(?:api\/)?campaigns\/(\d+)\/?$/);
    let mapped = raw;
    if (campaignMatch) {
      const campId = campaignMatch[1];
      mapped = `campaign_detail.html?id=${campId}`;
    } else if (/^\/?pages\/my-registrations\.html/i.test(mapped)) {
      mapped = "user-dashboard.html?tab=overview";
    } else if (/^\/?pages\/certificates\.html/i.test(mapped)) {
      mapped = "user-dashboard.html?tab=certificates";
    } else if (/^\/?pages\//i.test(mapped)) {
      mapped = mapped.replace(/^\/?pages\//i, "");
    } else if (/^\/index\.html/i.test(mapped)) {
      mapped = mapped.replace(/^\//, "");
    }
    mapped = mapped
      .replace(/([?&])tab=registrations\b/i, "$1tab=volunteers")
      .replace(/([?&])tab=hours\b/i, "$1tab=certificates")
      .replace(/([?&])tab=(?:hour-appeals|attendance-appeals)\b/i, "$1tab=appeals");

    const inPages = window.location.pathname.includes("/pages/");
    if (!/^https?:\/\//i.test(mapped) && !mapped.startsWith("/")) {
      if (/^index\.html/i.test(mapped)) {
        mapped = inPages ? `../${mapped}` : mapped;
      } else if (!inPages && !mapped.startsWith("../")) {
        mapped = `pages/${mapped}`;
      }
    }

    if (!this.isSafeInternalLink(mapped)) return null;
    return mapped;
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
                <div class="vl-notif-item-msg">${escapeHtml(n.content || n.message || "")}</div>
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
          if (!target) return;

          setOpen(false);
          const allModal = document.getElementById("vlNotifAllModal");
          if (allModal) allModal.classList.remove("open");

          const wasUnread = !target.is_read;
          this.openNotificationDetailModal(target, userRole);

          if (wasUnread) {
            target.is_read = true;
            itemBtn.classList.remove("is-unread");
            updateUnreadUI(currentUnread - 1);
            try {
              await api.patch(`/notifications/${id}/read`);
              this.updateNotificationDetailStatus(true);
            } catch {
              // Bỏ qua lỗi phụ khi đánh dấu đã đọc
            }
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
    // One timer per header; avoids requiring manual refresh to receive notifications.
    if (this.notificationPollTimer) clearInterval(this.notificationPollTimer);
    this.notificationPollTimer = setInterval(() => {
      if (document.visibilityState === "visible" && Auth.getToken()) fetchUnreadCount();
    }, 30000);
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

  getNotificationLinkLabel(link) {
    if (!link || typeof link !== "string") return "Trang liên quan";
    if (link.includes("campaigns") || link.includes("tab=campaigns")) return "Quản lý chiến dịch";
    if (link.includes("tab=volunteers") || link.includes("registrations")) return "Duyệt đơn đăng ký";
    if (link.includes("tab=certificates") || link.includes("certificate")) return "Chứng nhận & Giờ đóng góp";
    if (link.includes("tab=profile") || link.includes("tab=upgrade")) return "Hồ sơ tổ chức / Nâng cấp";
    if (link.includes("admin-dashboard")) return "Bảng điều khiển Quản trị";
    if (link.includes("user-dashboard")) return "Bảng điều khiển Tình nguyện viên";
    if (link.includes("organizer-dashboard")) return "Bảng điều khiển Nhà tổ chức";
    return "Trang liên quan";
  },

  updateNotificationDetailStatus(isRead) {
    const pill = document.getElementById("vlNotifDetailStatusPill");
    if (!pill) return;
    pill.className = `vl-notif-detail-status ${isRead ? "is-read" : "is-unread"}`;
    pill.textContent = isRead ? "Đã đọc" : "Chưa đọc";
  },

  openNotificationDetailModal(item, userRole) {
    if (!item) return;
    let backdrop = document.getElementById("vlNotifDetailModal");
    if (!backdrop) {
      backdrop = document.createElement("div");
      backdrop.id = "vlNotifDetailModal";
      backdrop.className = "vl-notif-detail-backdrop";
      backdrop.hidden = true;
      backdrop.setAttribute("role", "dialog");
      backdrop.setAttribute("aria-modal", "true");
      backdrop.setAttribute("aria-labelledby", "vlNotifDetailTitle");
      backdrop.innerHTML = `
        <div class="vl-notif-detail-modal">
          <div class="vl-notif-detail-header">
            <div class="vl-notif-detail-head-left">
              <div class="vl-notif-detail-icon" aria-hidden="true">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
              </div>
              <div class="vl-notif-detail-badges">
                <span class="vl-notif-detail-cat" id="vlNotifDetailCategory">Thông báo hệ thống</span>
                <span class="vl-notif-detail-status" id="vlNotifDetailStatusPill">Đã đọc</span>
              </div>
            </div>
            <button type="button" class="vl-notif-detail-close" id="vlNotifDetailCloseBtn" aria-label="Đóng hộp thoại">&times;</button>
          </div>
          <div class="vl-notif-detail-body">
            <h3 class="vl-notif-detail-title" id="vlNotifDetailTitle"></h3>
            <div class="vl-notif-detail-meta">
              <span id="vlNotifDetailTime"></span>
            </div>
            <div class="vl-notif-detail-content" id="vlNotifDetailContent"></div>
            <div class="vl-notif-detail-dest" id="vlNotifDetailDest" hidden>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
              <span id="vlNotifDetailDestText"></span>
            </div>
          </div>
          <div class="vl-notif-detail-footer">
            <button type="button" class="vl-notif-detail-btn-sec" id="vlNotifDetailDismissBtn">Đóng</button>
            <button type="button" class="vl-notif-detail-btn-pri" id="vlNotifDetailActionBtn" hidden>Đi tới trang liên quan ↗</button>
          </div>
        </div>
      `;
      document.body.appendChild(backdrop);

      const close = () => {
        backdrop.hidden = true;
        backdrop.dataset.targetLink = "";
      };
      backdrop.addEventListener("click", (e) => {
        if (e.target === backdrop) close();
      });
      document.getElementById("vlNotifDetailCloseBtn")?.addEventListener("click", close);
      document.getElementById("vlNotifDetailDismissBtn")?.addEventListener("click", close);
      document.getElementById("vlNotifDetailActionBtn")?.addEventListener("click", () => {
        const targetLink = backdrop.dataset.targetLink;
        close();
        if (targetLink && this.isSafeInternalLink(targetLink)) {
          window.location.href = targetLink;
        }
      });
      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && !backdrop.hidden) close();
      });
    }

    const roleLabel = this.ROLE_LABELS[userRole] || "Thông báo hệ thống";
    const catEl = document.getElementById("vlNotifDetailCategory");
    const titleEl = document.getElementById("vlNotifDetailTitle");
    const timeEl = document.getElementById("vlNotifDetailTime");
    const contentEl = document.getElementById("vlNotifDetailContent");
    const destEl = document.getElementById("vlNotifDetailDest");
    const destTextEl = document.getElementById("vlNotifDetailDestText");
    const actionBtn = document.getElementById("vlNotifDetailActionBtn");

    if (catEl) catEl.textContent = roleLabel;
    if (titleEl) titleEl.textContent = item.title || "Thông báo";
    if (timeEl) {
      const timeStr = this.formatNotificationTime(item.created_at);
      timeEl.textContent = timeStr ? `Thời gian: ${timeStr}` : "Vừa xong";
    }
    if (contentEl) {
      const text = (item.message || item.content || "").trim();
      contentEl.textContent = text || "Không có nội dung chi tiết bổ sung.";
    }

    this.updateNotificationDetailStatus(Boolean(item.is_read));

    const resolvedLink = this.resolveNotificationLink(item.link, userRole);
    backdrop.dataset.targetLink = resolvedLink || "";
    if (resolvedLink) {
      if (destTextEl) destTextEl.textContent = `Trang đích: ${this.getNotificationLinkLabel(resolvedLink)}`;
      if (destEl) destEl.hidden = false;
      if (actionBtn) actionBtn.hidden = false;
    } else {
      if (destEl) destEl.hidden = true;
      if (actionBtn) actionBtn.hidden = true;
    }

    backdrop.hidden = false;
    document.getElementById("vlNotifDetailCloseBtn")?.focus();
  },

  getCategoryVisual(category) {
    const raw = String(category || "").toLowerCase();
    if (/(môi trường|sinh thái|rừng|xanh|biển)/.test(raw)) {
      return {
        theme: "env",
        svg: '<svg class="svg-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 3.5 1 9.2-1.3 7.3-6.5 8.8-9 8.8Z"/><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/></svg>',
      };
    }
    if (/(giáo dục|trẻ em|dạy học|học bổng|thư viện)/.test(raw)) {
      return {
        theme: "edu",
        svg: '<svg class="svg-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>',
      };
    }
    if (/(y tế|sức khỏe|hiến máu|bệnh viện)/.test(raw)) {
      return {
        theme: "health",
        svg: '<svg class="svg-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>',
      };
    }
    if (/(cứu trợ|khẩn cấp|thiên tai|bão lũ)/.test(raw)) {
      return {
        theme: "relief",
        svg: '<svg class="svg-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
      };
    }
    return {
      theme: "community",
      svg: '<svg class="svg-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
    };
  },

  applyCategoryCover(mediaWrap, imgEl, category) {
    if (!mediaWrap) return;
    const visual = this.getCategoryVisual(category);
    mediaWrap.classList.add("is-placeholder", `is-theme-${visual.theme}`);
    if (imgEl) imgEl.hidden = true;
    let cover = mediaWrap.querySelector(".campaign-card-cover");
    if (!cover) {
      cover = document.createElement("div");
      cover.className = "campaign-card-cover";
      cover.setAttribute("aria-hidden", "true");
      mediaWrap.appendChild(cover);
    }
    cover.innerHTML = `
      <div class="campaign-card-cover-icon">${visual.svg}</div>
      <span class="campaign-card-cover-label">${escapeHtml(category || "Cộng đồng")}</span>
    `;
  },

  applyFallbackImage(imgEl, category = "") {
    if (!imgEl) return;
    const mediaWrap = imgEl.closest(".campaign-card-media");
    const rawSrc = imgEl.getAttribute("src") || "";
    if (!rawSrc || rawSrc.endsWith("logo.svg")) {
      if (mediaWrap) {
        this.applyCategoryCover(mediaWrap, imgEl, category);
      } else {
        imgEl.classList.add("is-fallback");
      }
      return;
    }
    imgEl.classList.remove("is-fallback");
    imgEl.hidden = false;
    imgEl.onerror = () => {
      if (mediaWrap) {
        this.applyCategoryCover(mediaWrap, imgEl, category);
      } else {
        imgEl.classList.add("is-fallback");
        if (!imgEl.src.endsWith("logo.svg")) {
          imgEl.src = this.DEFAULT_CAMPAIGN_IMAGE;
        }
      }
    };
  },

  createCampaignCard(campaign, templateEl) {
    const fragment = templateEl.content.cloneNode(true);
    const detailUrl = `campaign_detail.html?id=${encodeURIComponent(campaign.id)}`;
    const statusInfo = this.getCampaignStatusInfo(campaign) || {
      label: campaign.status || "Đang cập nhật",
      cls: "badge-primary",
    };

    const imgEl = fragment.querySelector(".campaign-card-img");
    if (imgEl) {
      const resolvedImgUrl =
        typeof resolveBackendAssetUrl === "function"
          ? resolveBackendAssetUrl(campaign.image_url) || campaign.image_url
          : campaign.image_url;
      if (resolvedImgUrl) {
        imgEl.src = resolvedImgUrl;
        imgEl.alt = campaign.title || "Ảnh chiến dịch tình nguyện";
      } else {
        imgEl.removeAttribute("src");
        imgEl.alt = "";
      }
      this.applyFallbackImage(imgEl, campaign.category);
    }

    const categoryEl = fragment.querySelector(".card-category");
    if (categoryEl) categoryEl.textContent = campaign.category || "Cộng đồng";

    const statusEl = fragment.querySelector(".card-status");
    if (statusEl) {
      statusEl.className = `badge ${statusInfo.cls} card-status`;
      statusEl.textContent = statusInfo.label;
    }

    const titleLinkEl = fragment.querySelector(".card-title-link");
    if (titleLinkEl) {
      titleLinkEl.href = detailUrl;
      titleLinkEl.textContent = campaign.title || "Chiến dịch tình nguyện";
    }

    const descEl = fragment.querySelector(".campaign-card-desc");
    if (descEl) descEl.textContent = campaign.description || "Chưa có mô tả chi tiết.";

    const locationEl = fragment.querySelector(".card-location");
    if (locationEl) locationEl.textContent = campaign.location || "Đang cập nhật";

    const orgEl = fragment.querySelector(".card-org");
    if (orgEl) orgEl.textContent = campaign.organization?.name || "Tổ chức xã hội";

    // Hiển thị thanh tiến độ chỉ tiêu nếu payload API có max_participants hoặc max_volunteers > 0
    const slotWrap = fragment.querySelector(".card-slot-wrap");
    const maxVol = Number(campaign.max_participants ?? campaign.max_volunteers);
    if (slotWrap && maxVol > 0 && (campaign.approved_count != null || campaign.remaining_slots != null)) {
      const approved = Math.max(0, Number(campaign.approved_count ?? 0));
      const remaining = Math.max(0, Number(campaign.remaining_slots ?? (maxVol - approved)));
      const slotText = slotWrap.querySelector(".card-slot-text");
      const slotProg = slotWrap.querySelector(".campaign-slot-progress");
      if (slotText) slotText.textContent = `Còn ${remaining}/${maxVol} chỗ`;
      if (slotProg) {
        slotProg.max = maxVol;
        slotProg.value = Math.min(approved, maxVol);
      }
      slotWrap.hidden = false;
    }

    const detailBtnEl = fragment.querySelector(".card-detail-btn");
    if (detailBtnEl) detailBtnEl.href = detailUrl;

    return fragment;
  },

  renderSkeletonCards(container, count = 3) {
    if (!container) return;
    container.innerHTML = Array.from({ length: count })
      .map(
        () => `
        <div class="campaign-card campaign-card-skeleton" aria-hidden="true">
          <div class="skeleton-block skeleton-media"></div>
          <div class="campaign-card-body">
            <div class="skeleton-row">
              <span class="skeleton-block skeleton-pill"></span>
              <span class="skeleton-block skeleton-pill"></span>
            </div>
            <div class="skeleton-block skeleton-title"></div>
            <div class="skeleton-block skeleton-line"></div>
            <div class="skeleton-block skeleton-line skeleton-line--short"></div>
            <div class="skeleton-block skeleton-btn"></div>
          </div>
        </div>`
      )
      .join("");
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
