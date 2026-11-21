// Cấu hình chung của frontend.
// Đổi API_BASE_URL nếu backend chạy ở địa chỉ/cổng khác (hoặc khi deploy).
const CONFIG = {
  // Trước khi tải config.js có thể khai báo window.VOLUNTEERLINK_API_BASE_URL.
  // Mặc định dùng cùng origin nếu chạy qua server/proxy, còn file:// dùng localhost.
  API_BASE_URL: (window.VOLUNTEERLINK_API_BASE_URL ||
    (window.location.protocol === "file:" ||
     ["localhost", "127.0.0.1"].includes(window.location.hostname)
      ? "http://127.0.0.1:8000/api" : `${window.location.origin}/api`)),
  APP_NAME: "Volunteer Link",
};
