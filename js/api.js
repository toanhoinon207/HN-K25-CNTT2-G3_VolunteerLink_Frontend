
const api = axios.create({
    baseURL: CONFIG.API_BASE_URL,
    timeout: 10000,
    headers: {
        "Content-Type": "application/json"
    }
});

// 1. Request Interceptor: Tự động gắn Bearer Token vào header nếu đã đăng nhập
api.interceptors.request.use(
    (config) => {
        const token = localStorage.getItem("access_token");

        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }

        return config;
    },
    (error) => Promise.reject(error)
);

// 2. Response Interceptor: Bắt lỗi HTTP 401 (Hết hạn token / Chưa xác thực) -> Tự động đăng xuất
api.interceptors.response.use(
    (response) => response,

    (error) => {
        const status = error.response?.status;
        const url = error.config?.url || "";

        // Không tự chuyển trang nếu lỗi xảy ra từ chính API đăng nhập hoặc đăng ký
        const isAuthRequest =
            url.includes("/auth/login") ||
            url.includes("/auth/register");

        if (status === 401 && !isAuthRequest) {
            // Xóa sạch session trong localStorage
            localStorage.removeItem("access_token");
            localStorage.removeItem("refresh_token");
            localStorage.removeItem("auth_user");

            if (typeof showToast === "function") {
                showToast("Phiên đăng nhập đã hết hạn (401 Unauthorized). Đang đăng xuất...", "error");
            }

            // Chuyển hướng an toàn về login.html
            const inPages = window.location.pathname.includes("/pages/");
            const currentFile = window.location.pathname.split("/").pop();

            if (!currentFile.includes("login.html")) {
                const loginUrl = inPages ? "login.html" : "pages/login.html";
                setTimeout(() => {
                    window.location.replace(loginUrl);
                }, 600);
            }
        }

        return Promise.reject(error);
    }
);
