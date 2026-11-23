document.addEventListener("DOMContentLoaded", () => {
  const params = new URLSearchParams(window.location.search);
  const resetToken = (params.get("token") || "").trim();

  const titleEl = document.getElementById("forgotPageTitle");
  const subtitleEl = document.getElementById("forgotPageSubtitle");
  const statusBox = document.getElementById("forgotStatusBox");
  const forgotForm = document.getElementById("forgotEmailForm");
  const resetForm = document.getElementById("resetPasswordForm");

  function showStatus(message, type = "info") {
    if (statusBox) {
      statusBox.style.display = "flex";
      statusBox.className = `alert alert-${type}`;
      statusBox.textContent = message;
    }
    if (typeof showToast === "function") {
      const toastType = type === "danger" ? "error" : type;
      showToast(message, toastType);
    }
  }

  if (resetToken) {
    if (titleEl) titleEl.textContent = "Đặt Lại Mật Khẩu";
    if (subtitleEl) subtitleEl.textContent = "Nhập mật khẩu mới cho tài khoản VolunteerLink của bạn";
    if (forgotForm) forgotForm.style.display = "none";
    if (resetForm) resetForm.style.display = "flex";
  }

  if (forgotForm) {
    forgotForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const email = (document.getElementById("forgotEmailInput")?.value || "").trim();
      const btn = document.getElementById("forgotSubmitBtn");
      if (!email) {
        showStatus("Vui lòng nhập địa chỉ email.", "warning");
        return;
      }
      const origText = btn ? btn.textContent : "";
      if (btn) {
        btn.disabled = true;
        btn.textContent = "Đang gửi liên kết...";
      }
      try {
        const res = await api.post("/auth/forgot-password", { email });
        showStatus(
          res.data?.message || "Nếu email tồn tại, liên kết đặt lại mật khẩu đã được gửi.",
          "success"
        );
        forgotForm.reset();
      } catch (err) {
        showStatus(extractApiError(err, "Không thể gửi yêu cầu đặt lại mật khẩu."), "danger");
      } finally {
        if (btn) {
          btn.disabled = false;
          btn.textContent = origText || "Gửi liên kết đặt lại mật khẩu";
        }
      }
    });
  }

  if (resetForm) {
    resetForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const newPassword = document.getElementById("resetNewPasswordInput")?.value || "";
      const confirmPassword = document.getElementById("resetConfirmPasswordInput")?.value || "";
      const btn = document.getElementById("resetSubmitBtn");

      if (newPassword.length < 8) {
        showStatus("Mật khẩu mới phải có ít nhất 8 ký tự.", "warning");
        return;
      }
      if (newPassword !== confirmPassword) {
        showStatus("Mật khẩu xác nhận không khớp.", "warning");
        return;
      }

      const origText = btn ? btn.textContent : "";
      if (btn) {
        btn.disabled = true;
        btn.textContent = "Đang cập nhật...";
      }
      try {
        const res = await api.post("/auth/reset-password", {
          token: resetToken,
          new_password: newPassword,
        });
        showStatus(
          res.data?.message || "Đặt lại mật khẩu thành công. Đang chuyển về trang đăng nhập...",
          "success"
        );
        resetForm.reset();
        setTimeout(() => {
          window.location.replace("login.html");
        }, 1800);
      } catch (err) {
        showStatus(extractApiError(err, "Đặt lại mật khẩu thất bại."), "danger");
        if (btn) {
          btn.disabled = false;
          btn.textContent = origText || "Cập nhật mật khẩu mới";
        }
      }
    });
  }
});
