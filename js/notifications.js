
/**
 * VolunteerLink - Notifications UI
 * Dùng chung cho USER, ORGANIZER, ADMIN
 *
 * API:
 * GET   /notifications
 * GET   /notifications/unread-count
 * PATCH /notifications/{id}/read
 * PATCH /notifications/read-all
 */

const NotificationsUI = (() => {
    let notifications = [];
    let unreadCount = 0;
    let isOpen = false;
    let initialized = false;
    let refreshTimer = null;
    let loadVersion = 0;

    const REFRESH_INTERVAL = 30000;
    const DROPDOWN_LIMIT = 5;
    const PAGE_LIMIT = 20;
    let pageOffset = 0;
    let hasNextPage = false;

    function isInbox() {
        return Boolean(getElement("notificationInbox"));
    }
    const ALL_PAGE = "notifications.html";

    // ================= UTILITIES =================

    function escapeText(value) {
        return String(value ?? "").replace(/[&<>"']/g, char => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        }[char]));
    }

    function formatTime(value) {
        if (!value) return "";

        const normalized = /(?:Z|[+-]\d{2}:\d{2})$/i.test(value)
            ? value
            : `${value}+07:00`;

        const date = new Date(normalized);

        if (Number.isNaN(date.getTime())) return "";

        return date.toLocaleString("vi-VN");
    }

    function getApi() {
        if (typeof api === "undefined") {
            console.error("Notifications: Chưa tải api.js");
            return null;
        }

        return api;
    }

    function getElement(id) {
        return document.getElementById(id);
    }

    function getNotificationLink(link) {
        if (!link || typeof link !== "string") return null;

        try {
            const campaignPath = link.match(/^\/(?:api\/)?campaigns\/(\d+)\/?$/);
            if (campaignPath) {
                link = "user-dashboard.html?tab=overview&campaign_id=" + campaignPath[1];
            }
            const target = new URL(link, window.location.href);

            if (
                target.origin !== window.location.origin ||
                !["http:", "https:"].includes(target.protocol)
            ) {
                return null;
            }

            return target.href;
        } catch (error) {
            console.warn("Notifications: Link không hợp lệ", error);
            return null;
        }
    }

    // ================= HTML =================

    function renderShell() {
        const existingBell = getElement("notificationBell");

        // Nếu HTML đã có chuông thì không tạo trùng
        if (existingBell) {
            return true;
        }

        const header =
            document.querySelector(".dash-header-actions") ||
            document.querySelector(".admin-header-actions") ||
            document.querySelector("header");

        if (!header) {
            console.error("Notifications: Không tìm thấy Header");
            return false;
        }

        const wrapper = document.createElement("div");

        wrapper.className = "vl-notification-wrapper";
        wrapper.id = "notificationWrapper";

        wrapper.innerHTML = `
            <button
                type="button"
                class="vl-notification-bell"
                id="notificationBell"
                aria-label="Thông báo"
                aria-expanded="false"
                aria-controls="notificationDropdown"
            >
                🔔
                <span
                    class="vl-notification-badge"
                    id="notificationBadge"
                    hidden
                >0</span>
            </button>

            <div
                class="vl-notification-dropdown"
                id="notificationDropdown"
                hidden
            >
                <div class="vl-notification-heading">
                    <strong>Thông báo</strong>

                    <button
                        type="button"
                        id="notificationReadAll"
                        class="vl-notification-read-all"
                    >
                        Đọc tất cả
                    </button>
                </div>

                <div
                    class="vl-notification-list"
                    id="notificationList"
                    aria-live="polite"
                >
                    <div class="vl-notification-empty">
                        Đang tải thông báo...
                    </div>
                </div>

                <div class="vl-notification-footer">
                    <a
                        href="${ALL_PAGE}"
                        id="notificationViewAll"
                        class="vl-notification-view-all"
                    >
                        Xem tất cả thông báo
                    </a>

                    <button
                        type="button"
                        id="notificationRefresh"
                    >
                        Làm mới
                    </button>
                </div>
            </div>
        `;

        header.prepend(wrapper);

        return true;
    }

    function ensureShellElements() {
        const bell = getElement("notificationBell");
        const dropdown = getElement("notificationDropdown");

        if (!bell || !dropdown) return false;

        let wrapper = getElement("notificationWrapper");

        if (!wrapper) {
            wrapper = document.createElement("div");
            wrapper.id = "notificationWrapper";
            wrapper.className = "vl-notification-wrapper";

            bell.parentNode.insertBefore(wrapper, bell);
            wrapper.appendChild(bell);
            wrapper.appendChild(dropdown);
        } else if (!wrapper.contains(dropdown)) {
            wrapper.appendChild(dropdown);
        }

        // Bổ sung các thành phần nếu HTML cũ chưa có
        if (!getElement("notificationBadge")) {
            const badge = document.createElement("span");
            badge.id = "notificationBadge";
            badge.className = "vl-notification-badge";
            badge.hidden = true;
            badge.textContent = "0";
            bell.appendChild(badge);
        }

        let heading = dropdown.querySelector(".vl-notification-heading");

        if (!heading) {
            heading = document.createElement("div");
            heading.className = "vl-notification-heading";
            heading.innerHTML = `
                <strong>Thông báo</strong>
                <button
                    type="button"
                    id="notificationReadAll"
                    class="vl-notification-read-all"
                >
                    Đọc tất cả
                </button>
            `;
            dropdown.prepend(heading);
        }

        if (!getElement("notificationReadAll")) {
            const button = document.createElement("button");
            button.type = "button";
            button.id = "notificationReadAll";
            button.className = "vl-notification-read-all";
            button.textContent = "Đọc tất cả";
            heading.appendChild(button);
        }

        if (!getElement("notificationList")) {
            const list = document.createElement("div");
            list.id = "notificationList";
            list.className = "vl-notification-list";
            dropdown.appendChild(list);
        }

        let footer = dropdown.querySelector(".vl-notification-footer");

        if (!footer) {
            footer = document.createElement("div");
            footer.className = "vl-notification-footer";
            dropdown.appendChild(footer);
        }

        if (!getElement("notificationViewAll")) {
            const link = document.createElement("a");
            link.id = "notificationViewAll";
            link.className = "vl-notification-view-all";
            link.href = ALL_PAGE;
            link.textContent = "Xem tất cả thông báo";
            footer.appendChild(link);
        }

        if (!getElement("notificationRefresh")) {
            const button = document.createElement("button");
            button.type = "button";
            button.id = "notificationRefresh";
            button.textContent = "Làm mới";
            footer.appendChild(button);
        }

        return true;
    }

    // ================= RENDER =================

    function renderBadge() {
        const badge = getElement("notificationBadge");
        if (!badge) {
            getElement("notificationUnreadCount").textContent = unreadCount + " chưa đọc";
            return;
        }

        const count = Math.max(0, Number(unreadCount) || 0);

        badge.textContent = count > 99 ? "99+" : String(count);
        badge.hidden = count === 0;
    }

    function renderList() {
        const container = getElement("notificationList");
        if (!container) return;

        if (isInbox()) {
            getElement("notificationPrevious").disabled = pageOffset === 0;
            getElement("notificationNext").disabled = !hasNextPage;
        }

        if (!notifications.length) {
            container.innerHTML = `
                <div class="vl-notification-empty">
                    Bạn chưa có thông báo nào.
                </div>
            `;
            return;
        }

        const latest = [...notifications]
            .sort((a, b) => {
                return new Date(b.created_at).getTime() -
                    new Date(a.created_at).getTime();
            })
            .slice(0, isInbox() ? PAGE_LIMIT : DROPDOWN_LIMIT);

        container.innerHTML = latest.map(item => `
            <button
                type="button"
                class="vl-notification-item ${item.is_read ? "" : "unread"}"
                data-notification-id="${Number(item.id)}"
            >
                <span class="vl-notification-item-title">
                    ${escapeText(item.title)}
                    ${item.is_read
                        ? ""
                        : '<span class="vl-unread-dot"></span>'}
                </span>

                <span class="vl-notification-message">
                    ${escapeText(item.message)}
                </span>

                <span class="vl-notification-time">
                    ${escapeText(formatTime(item.created_at))}
                </span>
            </button>
        `).join("");
    }

    function renderError() {
        const container = getElement("notificationList");

        if (!container) return;

        container.innerHTML = `
            <div class="vl-notification-empty">
                Không thể tải thông báo. Hãy thử lại.
            </div>
        `;
    }

    // ================= API =================

    async function load(offset = pageOffset) {
        const client = getApi();

        if (!client) {
            renderError();
            return;
        }

        const currentVersion = ++loadVersion;

        try {
            const [listResponse, countResponse] = await Promise.all([
                client.get("/notifications", {
                    params: {
                        skip: isInbox() ? offset : 0,
                        limit: isInbox() ? PAGE_LIMIT + 1 : DROPDOWN_LIMIT
                    }
                }),

                client.get("/notifications/unread-count")
            ]);

            // Bỏ qua kết quả cũ nếu có request mới hơn
            if (currentVersion !== loadVersion) return;

            const data = listResponse.data;

            notifications = Array.isArray(data)
                ? data
                : Array.isArray(data?.items)
                    ? data.items
                    : [];

            pageOffset = offset;
            hasNextPage = isInbox() && notifications.length > PAGE_LIMIT;
            unreadCount = Number(
                countResponse.data?.unread_count ?? 0
            );

            renderBadge();
            renderList();
            return true;

        } catch (error) {
            if (currentVersion !== loadVersion) return;

            console.error(
                "Notifications: Không thể tải thông báo",
                error
            );

            if (!notifications.length) renderError();
            return false;
        }
    }

    async function markRead(id) {
        const client = getApi();
        if (!client) return false;

        const item = notifications.find(
            n => Number(n.id) === Number(id)
        );

        if (!item) return false;
        if (item.is_read) return true;

        try {
            await client.patch(`/notifications/${id}/read`);

            // Vô hiệu hóa các request load cũ
            loadVersion++;

            item.is_read = true;

            unreadCount = Math.max(0, unreadCount - 1);

            renderBadge();
            renderList();

            return true;

        } catch (error) {
            console.error(
                "Notifications: Lỗi đánh dấu đã đọc",
                error
            );

            return false;
        }
    }

    async function markAllRead() {
        const client = getApi();
        if (!client) return;

        try {
            await client.patch("/notifications/read-all");

            loadVersion++;

            notifications.forEach(item => {
                item.is_read = true;
            });

            unreadCount = 0;

            renderBadge();
            renderList();
            return true;

        } catch (error) {
            console.error(
                "Notifications: Lỗi đọc tất cả",
                error
            );
        }
    }

    // ================= DROPDOWN =================

    function toggle(forceValue) {
        const dropdown = getElement("notificationDropdown");
        const bell = getElement("notificationBell");

        if (!dropdown || !bell) return;

        isOpen = typeof forceValue === "boolean"
            ? forceValue
            : !isOpen;

        // Hiển thị ngay, không đợi Backend
        dropdown.hidden = !isOpen;

        bell.setAttribute(
            "aria-expanded",
            String(isOpen)
        );

        if (isOpen) {
            load();
        }
    }

    // ================= NAVIGATION =================

    async function openNotification(id) {
        const item = notifications.find(
            n => Number(n.id) === Number(id)
        );

        if (!item) return;

        const target = getNotificationLink(item.link);

        if (!item.is_read) {
            await markRead(id);
        }

        if (target) {
            window.location.assign(target);
        } else {
            console.info(
                "Notifications: Thông báo chưa có đường dẫn",
                item
            );
        }
    }

    // ================= EVENTS =================

    function bindEvents() {
        const bell = getElement("notificationBell");
        const dropdown = getElement("notificationDropdown");
        const readAll = getElement("notificationReadAll");
        const refresh = getElement("notificationRefresh");
        const list = getElement("notificationList");

        if (!readAll || !refresh || !list || (!isInbox() && (!bell || !dropdown))) {
            console.error(
                "Notifications: Thiếu phần tử HTML"
            );
            return false;
        }

        bell?.addEventListener("click", event => {
            event.preventDefault();
            event.stopPropagation();

            toggle();
        });

        readAll.addEventListener("click", event => {
            event.preventDefault();
            markAllRead();
        });

        refresh.addEventListener("click", event => {
            event.preventDefault();
            load();
        });

        list.addEventListener("click", event => {
            const element = event.target.closest(
                "[data-notification-id]"
            );

            if (!element) return;

            const id = Number(element.dataset.notificationId);

            if (Number.isInteger(id)) {
                openNotification(id);
            }
        });

        if (isInbox()) {
            const previous = getElement("notificationPrevious");
            const next = getElement("notificationNext");
            const changePage = async direction => {
                previous.disabled = next.disabled = refresh.disabled = readAll.disabled = true;
                if (!(await load(pageOffset + direction * PAGE_LIMIT))) {
                    previous.disabled = pageOffset === 0;
                    next.disabled = !hasNextPage;
                }
                refresh.disabled = readAll.disabled = false;
                list.focus();
            };
            previous.addEventListener("click", () => changePage(-1));
            next.addEventListener("click", () => changePage(1));
            return true;
        }

        document.addEventListener("click", event => {
            const wrapper = getElement("notificationWrapper");

            if (
                isOpen &&
                wrapper &&
                !wrapper.contains(event.target)
            ) {
                toggle(false);
            }
        });

        document.addEventListener("keydown", event => {
            if (event.key === "Escape" && isOpen) {
                toggle(false);
            }
        });

        return true;
    }

    // ================= AUTO REFRESH =================

    function startAutoRefresh() {
        if (refreshTimer) return;

        refreshTimer = setInterval(() => {
            if (!document.hidden) {
                load();
            }
        }, REFRESH_INTERVAL);
    }

    function stopAutoRefresh() {
        if (refreshTimer) {
            clearInterval(refreshTimer);
            refreshTimer = null;
        }
    }

    // ================= INIT =================

    document.addEventListener("DOMContentLoaded", async () => {
        if (!isInbox()) return;
        const user = await Auth.requireAuth();
        if (!user) return;
        getElement("notificationDashboard").href = Auth.getDashboard(user.role);
        init();
    });

    function init() {
        if (initialized) return;

        if (!isInbox() && !renderShell()) {
            console.error(
                "Notifications: Không thể tạo chuông"
            );
            return;
        }

        if (!isInbox() && !ensureShellElements()) {
            console.error(
                "Notifications: Không thể tạo dropdown"
            );
            return;
        }

        if (!bindEvents()) {
            console.error(
                "Notifications: Không thể gắn sự kiện"
            );
            return;
        }

        initialized = true;

        console.log(
            "NotificationsUI: Khởi tạo thành công"
        );

        // Dropdown hoạt động độc lập với API
        load();

        if (!isInbox()) startAutoRefresh();
    }

    // ================= PUBLIC METHODS =================

    return {
        init,
        load,
        toggle,
        markRead,
        markAllRead,
        openNotification,
        startAutoRefresh,
        stopAutoRefresh
    };
})();
