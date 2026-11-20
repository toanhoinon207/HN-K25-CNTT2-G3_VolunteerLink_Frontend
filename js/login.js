
const loginForm = document.getElementById("loginForm");
const loginAlert = document.getElementById("loginAlert");
const loginAlertText = document.getElementById("loginAlertText");
const emailInput = document.getElementById("loginEmail");
const passInput = document.getElementById("loginPassword");
const emailGroup = document.getElementById("emailGroup");
const passwordGroup = document.getElementById("passwordGroup");
const emailError = document.getElementById("emailError");
const passwordError = document.getElementById("passwordError");

// Hàm hiển thị thông báo lỗi trên card đăng nhập và Toast
function showLoginError(message) {
    if (loginAlert && loginAlertText) {
        loginAlertText.textContent = message;
        loginAlert.style.display = "flex";
    }
    if (typeof showToast === "function") {
        showToast(message, "error");
    }
}

// Hàm ẩn thông báo lỗi
function hideLoginError() {
    if (loginAlert) {
        loginAlert.style.display = "none";
    }
    if (emailGroup) emailGroup.classList.remove("has-error");
    if (passwordGroup) passwordGroup.classList.remove("has-error");
}

// Xóa lỗi ngay khi người dùng bắt đầu nhập lại
if (emailInput) {
    emailInput.addEventListener("input", () => {
        if (emailGroup) emailGroup.classList.remove("has-error");
        if (loginAlert) loginAlert.style.display = "none";
    });
}
if (passInput) {
    passInput.addEventListener("input", () => {
        if (passwordGroup) passwordGroup.classList.remove("has-error");
        if (loginAlert) loginAlert.style.display = "none";
    });
}

// Hàm hỗ trợ điền nhanh tài khoản theo vai trò (từ seed_user.py)
window.quickFillRole = function (role) {
    hideLoginError();

    if (role === "USER") {
        emailInput.value = "user@gmail.com";
        passInput.value = "User@123456";
    } else if (role === "ORGANIZER") {
        emailInput.value = "organizer@gmail.com";
        passInput.value = "Organizer@123456";
    } else if (role === "ADMIN") {
        emailInput.value = "admin@gmail.com";
        passInput.value = "Admin@123456";
    }

    if (typeof showToast === "function") {
        showToast(`Đã điền tài khoản mẫu: ${role}`, "info");
    }
};

// Đọc query param preset nếu có từ URL (?preset=USER / ORGANIZER / ADMIN)
document.addEventListener("DOMContentLoaded", () => {
    const params = new URLSearchParams(window.location.search);
    const preset = params.get("preset");
    if (preset && typeof window.quickFillRole === "function") {
        window.quickFillRole(preset.toUpperCase());
    }
});

loginForm.addEventListener("submit", async function (event) {
    event.preventDefault();

    // 1. Lấy dữ liệu từ form
    const email = emailInput ? emailInput.value.trim() : "";
    const password = passInput ? passInput.value : "";
    const submitBtn = loginForm.querySelector('button[type="submit"]');

    // 2. Xóa lỗi cũ
    hideLoginError();

    let isValid = true;

    // 3. Validate email (không để trống, đúng định dạng)
    if (!email) {
        emailGroup.classList.add("has-error");
        if (emailError) emailError.textContent = "Vui lòng nhập địa chỉ email.";
        isValid = false;
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        emailGroup.classList.add("has-error");
        if (emailError) emailError.textContent = "Email không đúng định dạng.";
        isValid = false;
    }

    // 4. Validate mật khẩu (không để trống, tối thiểu 8 ký tự theo Backend)
    if (!password) {
        passwordGroup.classList.add("has-error");
        if (passwordError) passwordError.textContent = "Vui lòng nhập mật khẩu.";
        isValid = false;
    } else if (password.length < 8) {
        passwordGroup.classList.add("has-error");
        if (passwordError) passwordError.textContent = "Mật khẩu tối thiểu 8 ký tự.";
        isValid = false;
    }

    if (!isValid) {
        showLoginError("Vui lòng kiểm tra lại thông tin đăng nhập!");
        return;
    }

    // 5. Khóa nút khi đang xử lý
    submitBtn.disabled = true;
    submitBtn.textContent = "Đang đăng nhập...";

    try {
        // 6. Gọi Backend thông qua Auth.login (POST /api/auth/login + GET /api/auth/me)
        const user = await Auth.login(email, password);

        console.log("Đăng nhập thành công từ Backend:", user);
        showToast(`Đăng nhập thành công! Xin chào ${user.full_name}`, "success");

        // 7. Chuyển trang theo URL redirect nội bộ an toàn hoặc Bảng điều khiển theo Role
        const urlParams = new URLSearchParams(window.location.search);
        const redirectPage = urlParams.get("redirect");
        const isSafeRedirect =
            redirectPage &&
            !redirectPage.startsWith("//") &&
            !/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(redirectPage) &&
            !redirectPage.includes("\\");
        const targetPage = isSafeRedirect ? redirectPage : Auth.getDashboard(user.role);

        setTimeout(() => {
            window.location.href = targetPage;
        }, 800);

    } catch (error) {
        console.warn("Lỗi đăng nhập Backend:", error);

        let errorMessage = "Đăng nhập thất bại. Vui lòng kiểm tra lại thông tin!";

        if (error.response) {
            const status = error.response.status;
            const data = error.response.data;
            const detail = data?.detail;

            if (status === 401) {
                // Backend trả về HTTP 401 khi email không tồn tại hoặc sai mật khẩu
                errorMessage = typeof detail === "string" ? detail : "Email hoặc mật khẩu không chính xác!";
                emailGroup.classList.add("has-error");
                passwordGroup.classList.add("has-error");
            } else if (status === 403) {
                // Backend trả về HTTP 403 khi tài khoản bị khóa (status != ACTIVE)
                errorMessage = typeof detail === "string" ? detail : "Tài khoản đã bị khóa hoặc vô hiệu hóa!";
                emailGroup.classList.add("has-error");
            } else if (status === 422) {
                // Backend trả về HTTP 422 khi dữ liệu không đạt validation Pydantic
                if (Array.isArray(detail) && detail.length > 0) {
                    errorMessage = detail[0].msg || "Dữ liệu đăng nhập không hợp lệ!";
                } else if (typeof detail === "string") {
                    errorMessage = detail;
                } else {
                    errorMessage = "Dữ liệu đăng nhập không đúng định dạng!";
                }
            } else if (typeof detail === "string") {
                errorMessage = detail;
            } else {
                errorMessage = `Máy chủ phản hồi lỗi (${status}). Vui lòng thử lại!`;
            }
        } else if (error.code === "ECONNABORTED") {
            errorMessage = "Quá thời gian kết nối tới máy chủ (Timeout). Vui lòng thử lại!";
        } else if (!error.response || error.code === "ERR_NETWORK" || error.message?.includes("Network Error")) {
            errorMessage = "Không thể kết nối đến máy chủ Backend (http://127.0.0.1:8000). Vui lòng kiểm tra server Backend đã được bật!";
        }

        // Hiển thị thông báo lỗi rõ ràng trên cả form và toast
        showLoginError(errorMessage);

    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = "Đăng Nhập";
    }
});
