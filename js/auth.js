
const Auth = {
    // 1. Lấy Access Token từ localStorage
    getToken() {
        return localStorage.getItem("access_token");
    },

    // 2. Lấy thông tin user đã lưu trong localStorage
    getUser() {
        const user = localStorage.getItem("auth_user");

        if (!user) {
            return null;
        }

        try {
            return JSON.parse(user);
        } catch {
            return null;
        }
    },

    // 3. Lưu token & thông tin người dùng vào localStorage sau khi đăng nhập
    saveTokens(data) {
        if (data.access_token) {
            localStorage.setItem("access_token", data.access_token);
        }

        if (data.refresh_token) {
            localStorage.setItem("refresh_token", data.refresh_token);
        }
    },

    // 4. Gọi API lấy thông tin người dùng hiện tại (/auth/me)
    async getMe() {
        const response = await api.get("/auth/me");
        const user = response.data;
        localStorage.setItem("auth_user", JSON.stringify(user));
        return user;
    },

    // 5. Đăng nhập với Backend FastAPI
    async login(email, password) {
        const response = await api.post("/auth/login", {
            email: email,
            password: password
        });

        this.saveTokens(response.data);

        try {
            return await this.getMe();
        } catch (error) {
            this.clearSession();
            throw error;
        }
    },

    // 6. Xóa phiên đăng nhập (Xóa token khỏi localStorage)
    clearSession() {
        localStorage.removeItem("access_token");
        localStorage.removeItem("refresh_token");
        localStorage.removeItem("auth_user");
    },

    // 7. Hộp thoại xác nhận & đăng xuất dùng chung
    async confirmLogout() {
        const confirmed = typeof VLModal !== "undefined" && typeof VLModal.confirm === "function"
            ? await VLModal.confirm({
                title: "Xác nhận đăng xuất",
                message: "Bạn có chắc chắn muốn đăng xuất khỏi tài khoản VolunteerLink?",
                confirmText: "Đăng xuất",
                cancelText: "Hủy",
                danger: true
            })
            : window.confirm("Bạn có chắc chắn muốn đăng xuất khỏi tài khoản VolunteerLink?");
        if (!confirmed) return false;

        try {
            if (typeof api !== "undefined") await api.post("/auth/logout");
        } catch {
            // Vẫn xóa session cục bộ nếu token đã hết hạn hoặc mất kết nối
        }
        return true;
    },

    // 7b. Xóa phiên cục bộ và chuyển hướng mặc định về trang chủ (replace để chặn quay lại)
    logout() {
        this.clearSession();
        const inPages = window.location.pathname.includes("/pages/");
        window.location.replace(inPages ? "home.html" : "pages/home.html");
    },

    // 8. Kiểm tra xem người dùng đã đăng nhập hay chưa (Có token không)
    isLoggedIn() {
        return Boolean(this.getToken());
    },

    // 9. Xác định đường dẫn Bảng điều khiển theo Role
    getDashboard(role) {
        const inPages = window.location.pathname.includes("/pages/");
        const prefix = inPages ? "" : "pages/";

        switch (role) {
            case "USER":
                return prefix + "user-dashboard.html";

            case "ORGANIZER":
                return prefix + "organizer-dashboard.html";

            case "ADMIN":
                return prefix + "admin-dashboard.html";

            default:
                return inPages ? "home.html" : "pages/home.html";
        }
    },

    // 10. Chặn trang cần đăng nhập & kiểm tra phân quyền (Route Guard)
    async requireAuth(allowedRoles = []) {
        window.__vlAuthRequired = true;
        const inPages = window.location.pathname.includes("/pages/");
        const currentFile = window.location.pathname.split("/").pop();

        // CHẶN 1: Chưa đăng nhập -> Chuyển về login.html kèm redirect
        if (!this.isLoggedIn()) {
            const loginUrl = inPages 
                ? `login.html?redirect=${encodeURIComponent(currentFile)}`
                : `pages/login.html?redirect=${encodeURIComponent(currentFile)}`;
            window.location.replace(loginUrl);
            return null;
        }

        try {
            const user = await this.getMe();

            // CHẶN 2: Đã đăng nhập nhưng không đủ quyền (Role không khớp) -> Chuyển sang 403.html
            if (
                allowedRoles.length > 0 &&
                !allowedRoles.includes(user.role)
            ) {
                const forbiddenUrl = inPages ? "403.html" : "pages/403.html";
                window.location.replace(forbiddenUrl);
                return null;
            }

            return user;

        } catch (error) {
            this.clearSession();
            const loginUrl = inPages ? "login.html" : "pages/login.html";
            window.location.replace(loginUrl);
            return null;
        }
    }
};

window.addEventListener("pageshow", (event) => {
    if ((event.persisted || window.__vlAuthRequired) && window.__vlAuthRequired && !Auth.isLoggedIn()) {
        const inPages = window.location.pathname.includes("/pages/");
        window.location.replace(inPages ? "login.html" : "pages/login.html");
    }
});
