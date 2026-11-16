/**
 * DataStore - Quản lý và đồng bộ dữ liệu mẫu theo đúng Database Schema của Backend FastAPI & MySQL
 * Cung cấp dữ liệu khởi tạo từ seed_user.py, seed_organization.py, seed_campaign.sql
 */

const DataStore = {
  STORAGE_KEYS: {
    USERS: "vl_users_data",
    ORGS: "vl_orgs_data",
    CAMPAIGNS: "vl_campaigns_data",
    REGISTRATIONS: "vl_registrations_data",
    ATTENDANCES: "vl_attendances_data",
    CERTIFICATES: "vl_certificates_data",
    CLAIMS: "vl_claims_data"
  },

  init() {
    if (!localStorage.getItem(this.STORAGE_KEYS.USERS)) {
      this.seedInitialData();
    }
  },

  seedInitialData() {
    const users = [
      { id: 1, full_name: "Nguyễn Văn User", email: "user@gmail.com", phone: "0912345678", role: "USER", status: "ACTIVE", created_at: "2026-11-01T08:00:00" },
      { id: 2, full_name: "Nguyễn Văn Admin", email: "admin@gmail.com", phone: "0988776655", role: "ADMIN", status: "ACTIVE", created_at: "2026-11-01T08:00:00" },
      { id: 3, full_name: "Nguyễn Văn Organizer", email: "organizer@gmail.com", phone: "0901234567", role: "ORGANIZER", status: "ACTIVE", created_at: "2026-11-01T08:00:00" },
      { id: 4, full_name: "Trần Thị Mai (TNV)", email: "mai.tran@gmail.com", phone: "0934567890", role: "USER", status: "ACTIVE", created_at: "2026-11-02T09:30:00" },
      { id: 5, full_name: "Lê Hoàng Long (Tổ chức Xanh)", email: "organizer2@gmail.com", phone: "0945678901", role: "ORGANIZER", status: "ACTIVE", created_at: "2026-11-02T10:00:00" },
      { id: 6, full_name: "Vũ Đình Quyết (Ánh Sáng Tri Thức)", email: "organizer4@gmail.com", phone: "0956789012", role: "ORGANIZER", status: "ACTIVE", created_at: "2026-11-03T11:00:00" }
    ];

    const orgs = [
      {
        id: 1,
        name: "VolunteerLink Hà Nội",
        email: "contact@volunteerlink.vn",
        phone: "0241234567",
        address: "Hoàn Kiếm, Hà Nội",
        description: "Tổ chức hoạt động tình nguyện vì cộng đồng tại thủ đô Hà Nội, bảo vệ môi trường và hỗ trợ trẻ em khó khăn.",
        owner_id: 3,
        owner_email: "organizer@gmail.com",
        status: "APPROVED",
        document_url: "https://example.com/docs/gp-volunteerlink.pdf",
        created_at: "2026-11-01T08:30:00"
      },
      {
        id: 2,
        name: "Cộng đồng Xanh Việt Nam",
        email: "contact@congdongxanh.vn",
        phone: "0242345678",
        address: "Cầu Giấy, Hà Nội",
        description: "Tổ chức các hoạt động bảo vệ môi trường, thu gom rác thải và trồng cây xanh đô thị.",
        owner_id: 5,
        owner_email: "organizer2@gmail.com",
        status: "APPROVED",
        document_url: "https://example.com/docs/gp-xanhvn.pdf",
        created_at: "2026-11-02T09:00:00"
      },
      {
        id: 3,
        name: "Kết Nối Yêu Thương",
        email: "contact@ketnoiyeuthuong.vn",
        phone: "0243456789",
        address: "Đống Đa, Hà Nội",
        description: "Mạng lưới hỗ trợ bệnh nhân viện Huyết học, trẻ em cơ nhỡ và hiến máu nhân đạo định kỳ.",
        owner_id: 7,
        owner_email: "organizer3@gmail.com",
        status: "APPROVED",
        document_url: "https://example.com/docs/gp-knyt.pdf",
        created_at: "2026-11-02T14:00:00"
      },
      {
        id: 4,
        name: "Ánh Sáng Tri Thức",
        email: "contact@anhsangtrithuc.vn",
        phone: "0244567890",
        address: "Thanh Xuân, Hà Nội",
        description: "Dự án phát triển giáo dục cộng đồng, mở các lớp học phụ đạo tình nguyện cho học sinh ngoại thành.",
        owner_id: 6,
        owner_email: "organizer4@gmail.com",
        status: "PENDING",
        document_url: "https://example.com/docs/de-an-tri-thuc.pdf",
        rejection_reason: null,
        created_at: "2026-11-05T10:15:00"
      },
      {
        id: 5,
        name: "Nhịp Cầu Nhân Ái",
        email: "contact@nhipcaunhanai.vn",
        phone: "0245678901",
        address: "Long Biên, Hà Nội",
        description: "Tổ chức các chương trình thiện nguyện và hỗ trợ khẩn cấp vùng lũ lụt.",
        owner_id: 8,
        owner_email: "organizer5@gmail.com",
        status: "REJECTED",
        document_url: "https://example.com/docs/nhan-ai.pdf",
        rejection_reason: "Hồ sơ pháp lý chưa đầy đủ giấy phép thành lập theo Nghị định 93/2019/NĐ-CP.",
        created_at: "2026-11-06T11:20:00"
      }
    ];

    const campaigns = [
      {
        id: 1,
        organization_id: 1,
        organization_name: "VolunteerLink Hà Nội",
        title: "Chủ Nhật Xanh - Làm sạch Hồ Tây",
        category: "Môi trường",
        location: "Vườn hoa Lạc Long Quân, Hồ Tây, Hà Nội",
        start_time: "2026-11-15T07:00:00",
        end_time: "2026-11-15T11:30:00",
        registration_deadline: "2026-11-13T23:59:00",
        max_participants: 50,
        registered_count: 38,
        estimated_hours: 4.5,
        requirements: "Có sức khỏe tốt, mang giày thể thao và bình nước cá nhân. Ban tổ chức sẽ cấp găng tay, kẹp gắp rác.",
        description: "Hoạt động ra quân dọn rác, làm sạch ven hồ, phân loại rác tái chế và tuyên truyền du khách không xả rác bừa bãi.",
        status: "OPEN",
        reason: null,
        attendance_code: "HN9241",
        attendance_code_expires_at: "2026-11-15T12:00:00",
        created_at: "2026-11-01T08:00:00"
      },
      {
        id: 2,
        organization_id: 2,
        organization_name: "Cộng đồng Xanh Việt Nam",
        title: "Tiếp sức đến trường vùng cao Sa Pa",
        category: "Giáo dục",
        location: "Xã Tả Phìn, Sa Pa, Lào Cai",
        start_time: "2026-12-05T06:00:00",
        end_time: "2026-12-05T18:00:00",
        registration_deadline: "2026-12-01T23:59:00",
        max_participants: 30,
        registered_count: 22,
        estimated_hours: 8.0,
        requirements: "Có kinh nghiệm sinh hoạt cộng đồng, sức khỏe tốt chịu được rét vùng cao. Ưu tiên có kỹ năng dạy học/hoạt náo.",
        description: "Trao tặng 200 bộ đồng phục ấm, sách vở, sơn sửa điểm trường mầm non và tổ chức ngày hội trò chơi thiếu nhi.",
        status: "OPEN",
        reason: null,
        attendance_code: null,
        attendance_code_expires_at: null,
        created_at: "2026-11-02T09:00:00"
      },
      {
        id: 3,
        organization_id: 3,
        organization_name: "Kết Nối Yêu Thương",
        title: "Hiến máu nhân đạo - Giọt hồng sẻ chia",
        category: "Y tế",
        location: "Viện Huyết học - Truyền máu Trung ương, Cầu Giấy, Hà Nội",
        start_time: "2026-11-22T07:30:00",
        end_time: "2026-11-22T15:00:00",
        registration_deadline: "2026-11-19T23:59:00",
        max_participants: 40,
        registered_count: 40,
        estimated_hours: 7.0,
        requirements: "Tác phong nhanh nhẹn, giao tiếp nhã nhặn, hướng dẫn người hiến máu hoàn thành phiếu khám.",
        description: "Hỗ trợ tiếp đón người tham gia hiến máu, điều phối lượt khám, phát quà và hỗ trợ y bác sĩ chăm sóc người hiến máu.",
        status: "OPEN",
        reason: null,
        attendance_code: null,
        attendance_code_expires_at: null,
        created_at: "2026-11-03T10:00:00"
      },
      {
        id: 4,
        organization_id: 1,
        organization_name: "VolunteerLink Hà Nội",
        title: "Trồng 500 cây xanh tại Công viên Yên Sở",
        category: "Môi trường",
        location: "Khu đô thị Gamuda City, Hoàng Mai, Hà Nội",
        start_time: "2026-11-29T07:30:00",
        end_time: "2026-11-29T11:30:00",
        registration_deadline: "2026-11-26T23:59:00",
        max_participants: 60,
        registered_count: 0,
        estimated_hours: 4.0,
        requirements: "Yêu thích lao động ngoài trời, tuân thủ hướng dẫn kỹ thuật trồng cây của chuyên viên cây xanh.",
        description: "Dự án phủ xanh công viên đô thị, tạo bóng mát và không gian sinh thái cho người dân thủ đô.",
        status: "PENDING",
        reason: null,
        attendance_code: null,
        attendance_code_expires_at: null,
        created_at: "2026-11-04T11:00:00"
      },
      {
        id: 5,
        organization_id: 1,
        organization_name: "VolunteerLink Hà Nội",
        title: "Gia sư tình nguyện cho trẻ em Làng Trẻ SOS",
        category: "Giáo dục",
        location: "Làng trẻ SOS, Doãn Kế Thiện, Cầu Giấy, Hà Nội",
        start_time: "2026-12-10T14:00:00",
        end_time: "2026-12-10T17:30:00",
        registration_deadline: "2026-12-07T23:59:00",
        max_participants: 20,
        registered_count: 0,
        estimated_hours: 3.5,
        requirements: "Sinh viên các trường đại học, kiên nhẫn, có khả năng sư phạm môn Toán/Tiếng Anh cấp 1 & 2.",
        description: "Chương trình gia sư định kỳ hàng tuần giúp các em nhỏ cải thiện học lực và rèn luyện kỹ năng sống.",
        status: "DRAFT",
        reason: null,
        attendance_code: null,
        attendance_code_expires_at: null,
        created_at: "2026-11-08T15:00:00"
      }
    ];

    const registrations = [
      {
        id: 1,
        user_id: 1,
        user_name: "Nguyễn Văn User",
        user_email: "user@gmail.com",
        user_phone: "0912345678",
        campaign_id: 1,
        campaign_title: "Chủ Nhật Xanh - Làm sạch Hồ Tây",
        status: "APPROVED",
        message: "Em có kinh nghiệm tham gia nhiều chiến dịch dọn rác và phân loại phế liệu.",
        rejection_reason: null,
        created_at: "2026-11-05T14:20:00"
      },
      {
        id: 2,
        user_id: 1,
        user_name: "Nguyễn Văn User",
        user_email: "user@gmail.com",
        user_phone: "0912345678",
        campaign_id: 3,
        campaign_title: "Hiến máu nhân đạo - Giọt hồng sẻ chia",
        status: "PENDING",
        message: "Em đăng ký hỗ trợ bàn tiếp đón và điều phối hội trường.",
        rejection_reason: null,
        created_at: "2026-11-06T16:00:00"
      },
      {
        id: 3,
        user_id: 4,
        user_name: "Trần Thị Mai",
        user_email: "mai.tran@gmail.com",
        user_phone: "0934567890",
        campaign_id: 1,
        campaign_title: "Chủ Nhật Xanh - Làm sạch Hồ Tây",
        status: "PENDING",
        message: "Mong muốn đóng góp một phần nhỏ giữ gìn thủ đô xanh đẹp.",
        rejection_reason: null,
        created_at: "2026-11-07T10:10:00"
      }
    ];

    const attendances = [
      {
        id: 1,
        registration_id: 1,
        user_id: 1,
        campaign_id: 1,
        check_in_at: "2026-11-15T07:05:00",
        check_out_at: "2026-11-15T11:35:00",
        total_minutes: 270,
        recorded_by: 3
      }
    ];

    const certificates = [
      {
        id: 1,
        certificate_code: "VL-2026-HN0192",
        user_id: 1,
        campaign_id: 1,
        campaign_title: "Chủ Nhật Xanh - Làm sạch Hồ Tây",
        total_hours: 4.5,
        issued_at: "2026-11-15T14:00:00",
        status: "ACTIVE",
        revoked_reason: null
      }
    ];

    const claims = [
      {
        id: 1,
        registration_id: 1,
        user_id: 1,
        user_name: "Nguyễn Văn User",
        campaign_title: "Chủ Nhật Xanh - Làm sạch Hồ Tây",
        claimed_hours: 1.0,
        evidence_url: "https://photos.app.goo.gl/evidence-extra-work",
        status: "PENDING",
        note: "Em ở lại cùng ban tổ chức phân loại rác tái chế thêm 1 giờ sau ca.",
        verified_by: null
      }
    ];

    localStorage.setItem(this.STORAGE_KEYS.USERS, JSON.stringify(users));
    localStorage.setItem(this.STORAGE_KEYS.ORGS, JSON.stringify(orgs));
    localStorage.setItem(this.STORAGE_KEYS.CAMPAIGNS, JSON.stringify(campaigns));
    localStorage.setItem(this.STORAGE_KEYS.REGISTRATIONS, JSON.stringify(registrations));
    localStorage.setItem(this.STORAGE_KEYS.ATTENDANCES, JSON.stringify(attendances));
    localStorage.setItem(this.STORAGE_KEYS.CERTIFICATES, JSON.stringify(certificates));
    localStorage.setItem(this.STORAGE_KEYS.CLAIMS, JSON.stringify(claims));
  },

  get(key) {
    this.init();
    try {
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  },

  set(key, data) {
    localStorage.setItem(key, JSON.stringify(data));
  },

  // Helper cho Campaigns
  getCampaigns() {
    return this.get(this.STORAGE_KEYS.CAMPAIGNS);
  },

  saveCampaign(campaign) {
    const campaigns = this.getCampaigns();
    if (campaign.id) {
      const index = campaigns.findIndex(c => c.id === campaign.id);
      if (index !== -1) {
        campaigns[index] = { ...campaigns[index], ...campaign, updated_at: new Date().toISOString() };
      }
    } else {
      campaign.id = Date.now();
      campaign.created_at = new Date().toISOString();
      campaign.status = campaign.status || "DRAFT";
      campaign.registered_count = 0;
      campaigns.unshift(campaign);
    }
    this.set(this.STORAGE_KEYS.CAMPAIGNS, campaigns);
    return campaign;
  },

  // Helper cho Organizations
  getOrganizations() {
    return this.get(this.STORAGE_KEYS.ORGS);
  },

  updateOrgStatus(orgId, status, rejectionReason = null) {
    const orgs = this.getOrganizations();
    const index = orgs.findIndex(o => o.id === orgId);
    if (index !== -1) {
      orgs[index].status = status;
      orgs[index].rejection_reason = rejectionReason;
      orgs[index].updated_at = new Date().toISOString();
      this.set(this.STORAGE_KEYS.ORGS, orgs);
      return orgs[index];
    }
    return null;
  },

  // Helper cho Users
  getUsers() {
    return this.get(this.STORAGE_KEYS.USERS);
  },

  updateUserStatus(userId, status) {
    const users = this.getUsers();
    const index = users.findIndex(u => u.id === userId);
    if (index !== -1) {
      users[index].status = status;
      this.set(this.STORAGE_KEYS.USERS, users);
      return users[index];
    }
    return null;
  },

  // Helper cho Registrations
  getRegistrations() {
    return this.get(this.STORAGE_KEYS.REGISTRATIONS);
  },

  addRegistration(registration) {
    const regs = this.getRegistrations();
    registration.id = Date.now();
    registration.status = "PENDING";
    registration.created_at = new Date().toISOString();
    regs.unshift(registration);
    this.set(this.STORAGE_KEYS.REGISTRATIONS, regs);
    return registration;
  },

  updateRegistrationStatus(regId, status, rejectionReason = null) {
    const regs = this.getRegistrations();
    const index = regs.findIndex(r => r.id === regId);
    if (index !== -1) {
      regs[index].status = status;
      regs[index].rejection_reason = rejectionReason;
      this.set(this.STORAGE_KEYS.REGISTRATIONS, regs);
      return regs[index];
    }
    return null;
  },

  // Helper cho Certificates
  getCertificates() {
    return this.get(this.STORAGE_KEYS.CERTIFICATES);
  },

  revokeCertificate(certId, reason) {
    const certs = this.getCertificates();
    const index = certs.findIndex(c => c.id === certId);
    if (index !== -1) {
      certs[index].status = "REVOKED";
      certs[index].revoked_reason = reason;
      this.set(this.STORAGE_KEYS.CERTIFICATES, certs);
      return certs[index];
    }
    return null;
  }
};

// Khởi chạy ngay khi nạp script
DataStore.init();

