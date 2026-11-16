# VolunteerLink - Cổng Kết Nối Tình Nguyện Viên & Hoạt Động Xã Hội

Hệ thống giao diện người dùng đa vai trò được thiết kế tương thích 100% với Backend **FastAPI + MySQL** của dự án VolunteerLink.

---

## 1. Kiến trúc phân quyền 3 Vai Trò (Dựa trên Database Schema)

Hệ thống phân tách không gian làm việc và nghiệp vụ theo cột `users.role` (`Enum("USER", "ORGANIZER", "ADMIN")`):

```
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

## 2. Chi tiết 3 Vai Trò & Nghiệp Vụ Tương Ứng

### 👤 Vai trò 1: USER (Tình nguyện viên) — `pages/user-dashboard.html`
- **Đăng ký tài khoản ban đầu**: Mọi người dùng mới đều đăng ký với vai trò mặc định là `USER`.
- **Tổng quan & Ca của tôi**: Thống kê số ca đã đăng ký, tổng giờ cống hiến, chứng chỉ đạt được. Theo dõi trạng thái đơn đăng ký (`PENDING`, `APPROVED`, `REJECTED`).
- **Trạm điểm danh trực tuyến**: Nhập mã điểm danh 6 ký tự do Ban Tổ Chức cấp để **Check-in** (bắt đầu) và **Check-out** (kết thúc ca) qua API:
  - `POST /api/attendances/check-in`
  - `POST /api/attendances/check-out`
- **Khám phá chiến dịch**: Lọc theo danh mục (Môi trường, Giáo dục, Y tế, Cộng đồng), nộp đơn đăng ký kèm lời nhắn cá nhân.
- **Chứng chỉ & Khiếu nại**: Xem chứng nhận số (`CertificateModel`) và gửi yêu cầu xác nhận giờ phát sinh (`HourClaimModel`).
- **Hồ sơ & Kỹ năng**: Quản lý thông tin cá nhân, cập nhật kỹ năng (Sơ cứu, Ngoại ngữ, Hoạt náo...) và khu vực ưu tiên tham gia.
- **Đăng ký trở thành Tổ chức (Upgrade lên ORGANIZER)**: Tình nguyện viên điền form đề án tổ chức, nộp đường dẫn tài liệu pháp lý (`document_url`). Hồ sơ chuyển sang trạng thái `PENDING` chờ Admin duyệt. Khi được duyệt, tài khoản được tự động nâng cấp thành `ORGANIZER`.

### 🏢 Vai trò 2: ORGANIZER (Nhà tổ chức / Đơn vị tổ chức) — `pages/organizer-dashboard.html`
- **Quy trình cấp quyền**: Không mở chọn vai trò này khi đăng ký tài khoản mới. Người dùng bắt buộc phải nộp hồ sơ đề án tổ chức và được Quản trị viên (ADMIN) thẩm định, phê duyệt thì mới được cấp quyền truy cập vào cổng này.
- **Tổng quan tổ chức**: Kiểm tra trạng thái phê duyệt pháp lý (`OrganizationModel.status`: `APPROVED`, `PENDING`, `REJECTED`). Hiển thị cảnh báo nếu chưa được duyệt.
- **Quản lý chiến dịch**:
  - Tạo mới chiến dịch (FastAPI Schema `CampaignCreate` -> status `DRAFT` qua `POST /campaigns`).
  - Gửi Admin kiểm duyệt (`POST /campaigns/{id}/submit` -> chuyển thành `PENDING`).
  - Theo dõi danh sách theo trạng thái: Bản nháp, Chờ duyệt, Đang mở, Hoàn thành.
- **Trạm điểm danh & Phát mã (Attendance Station)**:
  - Sinh mã điểm danh 6 ký tự kèm thời hạn hiệu lực qua `POST /api/attendances/code`.
  - Màn hình hiển thị mã khổ lớn (Live Projector Display) kèm đồng hồ đếm ngược hết hạn để chiếu cho TNV.
  - Theo dõi danh sách TNV đã check-in / check-out theo thời gian thực.
- **Duyệt đơn đăng ký**: Phê duyệt (`APPROVED`) hoặc từ chối (`REJECTED` kèm lý do) các đơn của TNV.
- **Cấp chứng chỉ & Duyệt giờ**: Phê duyệt khiếu nại giờ (`VERIFIED` / `REJECTED`) và phát hành chứng chỉ điện tử.
- **Hồ sơ tổ chức**: Quản lý thông tin tổ chức, địa chỉ, tài liệu minh chứng (`document_url`).

### 🛡️ Vai trò 3: ADMIN (Quản trị viên hệ thống) — `pages/admin-dashboard.html`
- **Trung tâm giám sát**: Thống kê vĩ mô toàn hệ thống (Tổng người dùng, Tổ chức, Chiến dịch, Hàng đợi duyệt khẩn cấp).
- **Kiểm duyệt tổ chức**: Xác thực giấy phép, hồ sơ pháp lý (`document_url`), duyệt tư cách pháp nhân (`APPROVED`) hoặc từ chối (`REJECTED` kèm lý do `rejection_reason`).
- **Kiểm duyệt chiến dịch**: Phê duyệt mở tuyển công khai (`OPEN`) cho các chiến dịch do tổ chức gửi lên hoặc yêu cầu sửa đổi (`reason`).
- **Quản lý người dùng & Phân quyền**: Danh sách người dùng hệ thống (`users`), khóa tài khoản vi phạm (`LOCKED`), mở khóa (`ACTIVE`), thay đổi vai trò (USER, ORGANIZER, ADMIN).
- **Giám sát chứng chỉ & Báo cáo**: Tra cứu mã chứng chỉ (`certificate_code`), quyền thu hồi chứng chỉ (`REVOKED` kèm `revoked_reason`) nếu phát hiện gian lận. Xuất báo cáo hoạt động tổng hợp.

---

## 3. Tài khoản kiểm thử nhanh (Seed Data)

Trên trang `pages/login.html`, hệ thống đã trang bị sẵn **Thanh chọn nhanh 3 vai trò** (1 click là tự động điền):

| Vai trò | Email đăng nhập | Mật khẩu mẫu | Trang đích |
|---|---|---|---|
| **USER (TNV)** | `user@gmail.com` | `User@123456` | `pages/user-dashboard.html` |
| **ORGANIZER (Tổ chức)** | `organizer@gmail.com` | `Organizer@123456` | `pages/organizer-dashboard.html` |
| **ADMIN (Quản trị)** | `admin@gmail.com` | `Admin@123456` | `pages/admin-dashboard.html` |

---

## 4. Cấu trúc thư mục Frontend

```
HN-K25-CNTT2-G3_VolunteerLink_Frontend/
├── index.html                   # Chuyển hướng gốc tới pages/index.html
├── pages/
│   ├── index.html               # Trang chủ giới thiệu nền tảng & 3 cổng vai trò
│   ├── login.html               # Đăng nhập với nút chọn nhanh 3 vai trò
│   ├── register.html            # Đăng ký chọn vai trò USER hoặc ORGANIZER
│   ├── user-dashboard.html      # Bảng điều khiển Tình nguyện viên (USER)
│   ├── organizer-dashboard.html # Bảng điều khiển Nhà tổ chức (ORGANIZER)
│   ├── admin-dashboard.html     # Bảng điều khiển Quản trị viên (ADMIN)
│   ├── 403.html                 # Trang cảnh báo không đủ quyền hạn
│   └── forgot-password.html     # Quên mật khẩu
├── css/
│   ├── style.css                # Base stylesheet, design tokens, typography
│   ├── dashboard.css            # Stylesheet chuyên dụng cho 3 dashboard vai trò
│   └── responsive.css           # Responsive mobile / tablet
└── js/
    ├── config.js                # API_BASE_URL (http://127.0.0.1:8000/api)
    ├── api.js                   # Axios client + Interceptor tự động gắn Bearer Token
    ├── auth.js                  # Quản lý phiên đăng nhập & điều hướng Role-based
    ├── data_store.js            # Lưu trữ & đồng bộ dữ liệu mẫu theo Database Backend
    ├── utils.js                 # XSS escapeHtml, formatDateTime, showToast
    ├── login.js                 # Xử lý form đăng nhập & fallback demo
    ├── register.js              # Xử lý form đăng ký
    ├── user_dashboard.js        # Logic nghiệp vụ Tình nguyện viên
    ├── organizer_dashboard.js   # Logic nghiệp vụ Nhà tổ chức
    └── admin_dashboard.js       # Logic nghiệp vụ Quản trị viên
```

---

## 5. Hướng dẫn chạy ứng dụng

1. **Khởi động Backend FastAPI** (trong thư mục backend):
   ```bash
   uvicorn app.main:app --reload
   ```
2. **Khởi động Frontend**:
   - Sử dụng **Live Server** trong VS Code: Chuột phải `index.html` hoặc `pages/index.html` chọn **Open with Live Server**.
   - Hoặc mở trực tiếp file `index.html` trên trình duyệt.
   - Trải nghiệm đăng nhập bằng 3 nút chọn vai trò mẫu để kiểm tra từng luồng nghiệp vụ tương ứng!
