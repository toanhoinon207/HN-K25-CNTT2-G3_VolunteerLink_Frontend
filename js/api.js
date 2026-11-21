
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

// Giữ một tác vụ refresh duy nhất khi nhiều API cùng bị 401.
let refreshInFlight = null;

function clearExpiredSession() {
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    localStorage.removeItem("auth_user");
    const inPages = window.location.pathname.includes("/pages/");
    const currentFile = window.location.pathname.split("/").pop();
    if (currentFile !== "login.html") {
        const loginUrl = inPages ? "login.html" : "pages/login.html";
        window.location.replace(loginUrl);
    }
}

// Chỉ retry request gốc một lần; không refresh các endpoint xác thực.
api.interceptors.response.use(
    response => response,
    async error => {
        const original = error.config;
        const url = original?.url || "";
        const excluded = ["/auth/login", "/auth/register", "/auth/refresh", "/auth/logout"]
            .some(path => url.includes(path));
        if (error.response?.status !== 401 || !original || original._retry || excluded) {
            return Promise.reject(error);
        }
        const refreshToken = localStorage.getItem("refresh_token");
        if (!refreshToken) {
            clearExpiredSession();
            return Promise.reject(error);
        }
        original._retry = true;
        const latestAccess = localStorage.getItem("access_token");
        const sentAccess = original.headers?.Authorization?.replace(/^Bearer\s+/i, "");
        if (latestAccess && sentAccess && latestAccess !== sentAccess) {
            original.headers.Authorization = `Bearer ${latestAccess}`;
            return api(original);
        }
        if (!refreshInFlight) {
            // axios gốc không sử dụng interceptor của instance api.
            refreshInFlight = axios.post(`${CONFIG.API_BASE_URL}/auth/refresh`, {
                refresh_token: refreshToken,
            }).then(({ data }) => {
                localStorage.setItem("access_token", data.access_token);
                localStorage.setItem("refresh_token", data.refresh_token);
                return data.access_token;
            }).finally(() => { refreshInFlight = null; });
        }
        try {
            const newToken = await refreshInFlight;
            original.headers.Authorization = `Bearer ${newToken}`;
            return api(original);
        } catch (refreshError) {
            clearExpiredSession();
            return Promise.reject(refreshError);
        }
    }
);
