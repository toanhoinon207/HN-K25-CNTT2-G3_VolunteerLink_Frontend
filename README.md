# VolunteerLink — Frontend (HTML / CSS / Vanilla JS)

Giao diện người dùng đa vai trò cho nền tảng **VolunteerLink — Cổng Kết Nối Tình Nguyện Viên & Hoạt Động Xã Hội**, kết nối trực tiếp với Backend **FastAPI + MySQL**.

---

## 1. Kiến trúc phân quyền 3 vai trò

Hệ thống phân tách không gian làm việc theo trường `role` trả về từ `/api/auth/login` và `/api/auth/me`:

```text
                             ┌──────────────────────────┐
                             │      ĐĂNG NHẬP / ME      │
                             │   (POST /api/auth/login) │
                             └─────────────┬────────────┘
                                           │ Phân quyền role
               ┌───────────────────────────┼───────────────────────────┐
               ▼                           ▼                           ▼
     ┌───────────────────┐       ┌───────────────────┐       ┌───────────────────┐
     │  1. USER (TNV)    │       │ 2. ORGANIZER (TC) │       │   3. ADMIN (QTV)  │
     │ user-dashboard    │       │organizer-dashboard│       │  admin-dashboard  │
     └───────────────────┘       └───────────────────┘       └───────────────────┘
```

---

## 2. Chức năng chính theo từng khu vực

### Trang công khai & Xác thực
- **Trang chủ (`pages/home.html`)**: Giới thiệu nền tảng, chiến dịch nổi bật, điều hướng nhanh tới danh sách chiến dịch và cổng đăng nhập/đăng ký.
- **Danh sách & Chi tiết chiến dịch (`pages/campaign.html`, `pages/campaign_detail.html`)**: Tìm kiếm, lọc chiến dịch đang mở, xem chi tiết ca/yêu cầu, đăng ký tham gia hoặc tham gia hàng chờ (`Waitlist`).
- **Đăng nhập / Đăng ký / Quên mật khẩu (`pages/login.html`, `pages/register.html`, `pages/forgot-password.html`)**:
  - Đăng ký tài khoản mới (mặc định vai trò `USER`).
  - Hỗ trợ điền nhanh 3 tài khoản mẫu trên trang đăng nhập (`quickFillRole`).
  - Gửi yêu cầu đặt lại mật khẩu qua email và xác nhận token đặt lại mật khẩu.
- **Thông báo (`pages/notifications.html`) & In chứng chỉ (`pages/certificate-print.html`)**: Xem thông báo hệ thống, đánh dấu đã đọc và hiển thị/in chứng chỉ điện tử.

### Vai trò 1: `USER` (Tình nguyện viên) — `pages/user-dashboard.html`
- Thống kê cá nhân, theo dõi đơn đăng ký (`PENDING`, `APPROVED`, `REJECTED`) và danh sách chờ (`Waitlist`).
- Điểm danh **Check-in / Check-out** bằng mã điểm danh do Tổ chức cung cấp (`/api/attendances/check-in`, `/api/attendances/check-out`).
- Gửi **khiếu nại điểm danh** (`/api/attendance-appeals`) và **yêu cầu xác nhận giờ phát sinh** (`/api/hour-claims`).
- Xem & in chứng chỉ số đã được cấp.
- Cập nhật hồ sơ cá nhân, ảnh đại diện, kỹ năng, khu vực, đổi mật khẩu và nộp hồ sơ đăng ký trở thành Tổ chức.

### Vai trò 2: `ORGANIZER` (Nhà tổ chức) — `pages/organizer-dashboard.html`
- Quản lý hồ sơ tổ chức và theo dõi trạng thái kiểm duyệt (`PENDING`, `APPROVED`, `REJECTED`).
- Tạo, chỉnh sửa, tải ảnh và gửi duyệt chiến dịch (`/api/campaigns`).
- Duyệt/từ chối đơn đăng ký của tình nguyện viên và quản lý hàng chờ.
- Tạo mã điểm danh, theo dõi danh sách check-in/check-out, xử lý khiếu nại điểm danh và duyệt yêu cầu giờ phát sinh.
- Cấp chứng chỉ điện tử cho tình nguyện viên đủ điều kiện.

### Vai trò 3: `ADMIN` (Quản trị viên) — `pages/admin-dashboard.html`
- Thống kê tổng quan toàn hệ thống.
- Kiểm duyệt hồ sơ đăng ký tổ chức và kiểm duyệt chiến dịch trước khi mở tuyển.
- Quản lý người dùng, thay đổi vai trò, khóa/mở khóa tài khoản (`user-moderation`) và xem lịch sử kiểm duyệt.
- Xử lý khiếu nại điểm danh được leo thang lên Admin và giám sát/thu hồi chứng chỉ khi cần.

---

## 3. Tài khoản kiểm thử nhanh (khớp `sql/seed_all.sql` & `js/login.js`)

Trên trang `pages/login.html` có sẵn nút điền nhanh cho 3 vai trò:

| Vai trò | Email | Mật khẩu | Trang đích |
|---|---|---|---|
| **USER (TNV)** | `user@gmail.com` | `12345678` | `pages/user-dashboard.html` |
| **ORGANIZER (Tổ chức)** | `organizer@gmail.com` | `12345678` | `pages/organizer-dashboard.html` |
| **ADMIN (Quản trị)** | `admin@gmail.com` | `12345678` | `pages/admin-dashboard.html` |

---

## 4. Cấu trúc thư mục Frontend

```text
HN-K25-CNTT2-G3_VolunteerLink_Frontend/
├── index.html                     # Tự động chuyển hướng tới pages/home.html
├── assets/
│   └── images/logo.svg            # Logo VolunteerLink
├── pages/
│   ├── home.html                  # Trang chủ giới thiệu nền tảng
│   ├── campaign.html              # Danh sách & tìm kiếm chiến dịch
│   ├── campaign_detail.html       # Chi tiết chiến dịch & đăng ký / waitlist
│   ├── login.html                 # Đăng nhập (có nút điền nhanh 3 vai trò)
│   ├── register.html              # Đăng ký tài khoản mới
│   ├── forgot-password.html       # Quên & đặt lại mật khẩu
│   ├── user-dashboard.html        # Bảng điều khiển Tình nguyện viên (USER)
│   ├── organizer-dashboard.html   # Bảng điều khiển Nhà tổ chức (ORGANIZER)
│   ├── admin-dashboard.html       # Bảng điều khiển Quản trị viên (ADMIN)
│   ├── notifications.html         # Trung tâm thông báo
│   ├── certificate-print.html     # Giao diện xem & in chứng chỉ
│   └── 403.html                   # Trang thông báo không đủ quyền truy cập
├── css/
│   ├── tokens.css                 # Biến thiết kế (màu sắc, spacing, typography)
│   ├── style.css                  # Stylesheet nền tảng dùng chung
│   ├── components.css             # Style các thành phần UI dùng chung
│   ├── dashboard_common.css       # Layout & thành phần chung cho 3 dashboard
│   ├── home.css                   # Style trang chủ
│   ├── campaign.css               # Style trang danh sách chiến dịch
│   ├── campaign_detail.css        # Style trang chi tiết chiến dịch
│   ├── notifications.css          # Style trang thông báo
│   ├── user_dashboard.css         # Style riêng dashboard USER
│   ├── organizer_dashboard.css    # Style riêng dashboard ORGANIZER
│   └── responsive.css             # Responsive cho tablet / mobile
└── js/
    ├── config.js                  # Cấu hình API_BASE_URL
    ├── api.js                     # Axios client + interceptor gắn Bearer Token & xử lý FormData/401
    ├── auth.js                    # Quản lý phiên đăng nhập, kiểm tra role & điều hướng
    ├── layout.js                  # Header/Navigation dùng chung & trạng thái đăng nhập
    ├── utils.js                   # Hàm tiện ích (escapeHtml, formatDateTime, toast, ...)
    ├── home.js                    # Logic trang chủ
    ├── login.js                   # Logic đăng nhập & quickFillRole
    ├── register.js                # Logic đăng ký tài khoản
    ├── forgot_password.js         # Logic quên & đặt lại mật khẩu
    ├── campaign.js                # Logic danh sách & lọc chiến dịch
    ├── campaign_detail.js         # Logic chi tiết chiến dịch, đăng ký & waitlist
    ├── notifications.js           # Logic trang thông báo
    ├── user_dashboard.js          # Logic nghiệp vụ USER
    ├── organizer_dashboard.js     # Logic nghiệp vụ ORGANIZER
    └── admin_dashboard.js         # Logic nghiệp vụ ADMIN
```

---

## 5. Hướng dẫn cấu hình & chạy ứng dụng

1. **Khởi động Backend**: Đảm bảo server FastAPI đang chạy tại `http://127.0.0.1:8000` (xem `README.md` của repository Backend).
2. **Cấu hình API URL (nếu cần)**:
   - Mặc định `js/config.js` tự trỏ `API_BASE_URL` về `http://127.0.0.1:8000/api` khi chạy ở `localhost` hoặc `127.0.0.1`.
   - Có thể ghi đè trước khi nạp `config.js` qua biến `window.VOLUNTEERLINK_API_BASE_URL` hoặc chỉnh trực tiếp trong `js/config.js`.
3. **Chạy Frontend**:
   - Dùng **Live Server** trong VS Code: chuột phải `index.html` (hoặc `pages/home.html`) → chọn **Open with Live Server** (mặc định `http://127.0.0.1:5500`).
   - Hoặc dùng static server bất kỳ tại thư mục gốc Frontend, ví dụ:
     ```bash
     python -m http.server 5500
     ```
   - Truy cập `http://127.0.0.1:5500` trên trình duyệt để sử dụng.
