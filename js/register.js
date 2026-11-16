
const registerForm = document.getElementById("registerForm");

registerForm.addEventListener("submit", async function (event) {
    event.preventDefault();

    const name = document.getElementById("regName").value.trim();
    const email = document.getElementById("regEmail").value.trim();
    const phone = document.getElementById("regPhone").value.trim();
    const password = document.getElementById("regPass").value;
    const confirmPassword = document.getElementById("regConfirmPass").value;
    const terms = document.getElementById("regTerms").checked;

    // Vai trò mặc định khi đăng ký luôn là USER
    // Nếu muốn trở thành ORGANIZER, người dùng sẽ gửi form thông tin tổ chức và chờ Admin duyệt
    const role = "USER";

    // Xóa trạng thái lỗi cũ
    document.querySelectorAll(".form-group").forEach(group => {
        group.classList.remove("has-error");
    });

    let isValid = true;

    function showError(groupId) {
        document.getElementById(groupId).classList.add("has-error");
        isValid = false;
    }

    // Validate họ tên
    if (!name) {
        showError("nameGroup");
    }

    // Validate email
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        showError("emailGroup");
    }

    // Validate số điện thoại
    if (!/^0\d{9}$/.test(phone)) {
        showError("phoneGroup");
    }

    // Validate mật khẩu (Backend quy định tối thiểu 8 ký tự)
    if (password.length < 8) {
        showError("passGroup");
    }

    // Xác nhận mật khẩu
    if (password !== confirmPassword) {
        showError("confirmPassGroup");
    }

    // Điều khoản
    if (!terms) {
        isValid = false;
        const termsError = document.getElementById("termsError");
        if (termsError) {
            termsError.style.display = "block";
        }
    } else {
        const termsError = document.getElementById("termsError");
        if (termsError) {
            termsError.style.display = "none";
        }
    }

    if (!isValid) {
        showToast("Vui lòng kiểm tra lại thông tin!", "error");
        return;
    }

    const submitBtn = registerForm.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = "Đang xử lý...";

    try {
        const response = await api.post("/auth/register", {
            full_name: name,
            email: email,
            phone: phone,
            password: password,
            role: role
        });

        console.log("Đăng ký thành công từ Backend:", response.data);
        showToast("Đăng ký tài khoản Tình nguyện viên thành công!", "success");

        setTimeout(() => {
            window.location.href = "login.html";
        }, 1200);

    } catch (error) {
        console.warn("Lỗi đăng ký Backend, kiểm tra fallback:", error);

        // Fallback khi server chưa bật: lưu tài khoản vào DataStore
        if (!error.response || error.code === "ERR_NETWORK" || error.message.includes("Network Error")) {
            const users = DataStore.getUsers();
            if (users.some(u => u.email.toLowerCase() === email.toLowerCase())) {
                showToast("Email này đã được sử dụng!", "error");
            } else {
                const newUser = {
                    id: Date.now(),
                    full_name: name,
                    email: email,
                    phone: phone,
                    role: role,
                    status: "ACTIVE",
                    created_at: new Date().toISOString()
                };
                users.push(newUser);
                DataStore.set(DataStore.STORAGE_KEYS.USERS, users);
                showToast("Đăng ký tài khoản thành công! Vui lòng đăng nhập.", "success");
                setTimeout(() => {
                    window.location.href = "login.html";
                }, 1000);
                return;
            }
        } else {
            const detail = error.response?.data?.detail;

            if (error.response?.status === 422) {
                showToast("Dữ liệu không hợp lệ! Mật khẩu hoặc email chưa đúng quy cách.", "error");
            } else {
                showToast(
                    typeof detail === "string"
                        ? detail
                        : "Đăng ký thất bại. Vui lòng thử lại!",
                    "error"
                );
            }
        }
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = "Hoàn tất Đăng Ký";
    }
});
