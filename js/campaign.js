/**
 * Trang Tìm kiếm & Lọc Chiến dịch (pages/campaign.html)
 * Tận dụng endpoint GET /api/campaigns của Backend FastAPI:
 *   - Hiển thị 2 hàng x 4 cột (PAGE_SIZE = 8)
 *   - Tìm kiếm (keyword), lọc (category), phân trang (page, page_size) do BE xử lý
 */

const PAGE_SIZE = 8;

let currentPage = 1;
let totalPages = 1;
let categoriesLoaded = false;

function checkScrollBottom() {
  const gridWrapper = document.getElementById("campaign-grid-wrapper");
  if (!gridWrapper) return;
  const rect = gridWrapper.getBoundingClientRect();
  const scrollPosition = window.innerHeight + window.scrollY;
  const bottomThreshold = document.documentElement.scrollHeight - 240;

  if (scrollPosition >= bottomThreshold || rect.bottom <= window.innerHeight + 80) {
    gridWrapper.classList.add("show-page-nav");
  } else {
    gridWrapper.classList.remove("show-page-nav");
  }
}

function updatePaginationButtons() {
  const btnPrev = document.getElementById("btn-page-prev");
  const btnNext = document.getElementById("btn-page-next");
  const indicator = document.getElementById("campaignPageIndicator");
  if (btnPrev) btnPrev.disabled = currentPage <= 1;
  if (btnNext) btnNext.disabled = currentPage >= totalPages;
  if (indicator) {
    indicator.textContent = totalPages > 1 ? `Trang ${currentPage} / ${totalPages}` : "";
  }
  checkScrollBottom();
}

function renderCampaignGrid(items) {
  const listContainer = document.getElementById("campaign-list-container");
  const templateEl = document.getElementById("campaign-card-template");
  if (!listContainer || !templateEl) return;

  if (!Array.isArray(items) || items.length === 0) {
    listContainer.innerHTML = `
      <div class="home-state-box">
        <strong class="campaign-empty-title">Không tìm thấy chiến dịch phù hợp</strong>
        <span>Hãy thử thay đổi từ khóa, địa điểm, lĩnh vực hoặc trạng thái tìm kiếm.</span>
      </div>
    `;
    return;
  }

  listContainer.innerHTML = "";
  const fragment = document.createDocumentFragment();
  items.forEach((campaign) => {
    fragment.appendChild(Layout.createCampaignCard(campaign, templateEl));
  });
  listContainer.appendChild(fragment);
}

function renderCategoryDropdown(items) {
  const selectEl = document.getElementById("filter-category");
  if (!selectEl) return;

  const categories = Array.from(
    new Set(items.map((c) => (c.category || "").trim()).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b, "vi"));

  const currentVal = selectEl.value;
  selectEl.innerHTML = [
    '<option value="">Tất cả lĩnh vực</option>',
    ...categories.map(
      (cat) => `<option value="${escapeHtml(cat)}">${escapeHtml(cat)}</option>`
    ),
  ].join("");

  if (currentVal && categories.includes(currentVal)) {
    selectEl.value = currentVal;
  }
}

async function loadCampaigns(page = 1, shouldScrollTop = false) {
  const listContainer = document.getElementById("campaign-list-container");
  if (!listContainer) return;

  currentPage = Math.max(1, page);
  const keyword = document.getElementById("filter-keyword")?.value.trim() || "";
  const category = document.getElementById("filter-category")?.value.trim() || "";
  const status = document.getElementById("filter-status")?.value.trim() || "";

  // Lần tải đầu không có filter: lấy page_size=100 để vừa dựng category từ DB vừa hiển thị trang 1 (1 request duy nhất)
  const isInitialFetch = !categoriesLoaded && currentPage === 1 && !keyword && !category && !status;
  const params = {
    page: currentPage,
    page_size: isInitialFetch ? 100 : PAGE_SIZE,
  };
  if (keyword) params.keyword = keyword;
  if (category) params.category = category;
  if (status) params.status = status;

  Layout.renderStateBox(listContainer, "Đang tải danh sách chiến dịch...", "home-state-box--loading");

  try {
    const response = await api.get("/campaigns", { params });
    const data = response.data || {};
    const items = Array.isArray(data.items) ? data.items : [];

    if (!categoriesLoaded) {
      renderCategoryDropdown(items);
      categoriesLoaded = true;
    }

    if (isInitialFetch) {
      const total = Number(data.total) || items.length;
      totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
      renderCampaignGrid(items.slice(0, PAGE_SIZE));
    } else {
      currentPage = Number(data.page) || currentPage;
      totalPages = Math.max(1, Number(data.total_pages) || 1);
      renderCampaignGrid(items);
    }

    updatePaginationButtons();
    if (shouldScrollTop) {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  } catch (error) {
    const message = Layout.extractApiErrorMessage(error, "Không thể tải danh sách chiến dịch.");
    Layout.renderStateBox(listContainer, message, "home-state-box--error");
    if (typeof showToast === "function") showToast(message, "error");
    updatePaginationButtons();
  }
}

document.addEventListener("DOMContentLoaded", () => {
  Layout.renderPublicShell("btnCampaignLogout");

  const urlParams = new URLSearchParams(window.location.search);
  const urlKeyword = urlParams.get("keyword");
  const urlCategory = urlParams.get("category");
  const urlStatus = urlParams.get("status");

  const keywordInput = document.getElementById("filter-keyword");
  if (urlKeyword && keywordInput) {
    keywordInput.value = urlKeyword.trim();
  }
  const statusSelect = document.getElementById("filter-status");
  if (urlStatus && statusSelect) {
    statusSelect.value = urlStatus.trim();
  }
  if (urlCategory) {
    const catSelect = document.getElementById("filter-category");
    if (catSelect) {
      const opt = document.createElement("option");
      opt.value = urlCategory.trim();
      opt.textContent = urlCategory.trim();
      catSelect.appendChild(opt);
      catSelect.value = urlCategory.trim();
    }
  }

  document.getElementById("filter-category")?.addEventListener("change", () => {
    loadCampaigns(1);
  });

  document.getElementById("filter-status")?.addEventListener("change", () => {
    loadCampaigns(1);
  });

  document.getElementById("campaign-filter-form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    loadCampaigns(1);
  });

  document.getElementById("btn-page-prev")?.addEventListener("click", () => {
    if (currentPage > 1) loadCampaigns(currentPage - 1, true);
  });

  document.getElementById("btn-page-next")?.addEventListener("click", () => {
    if (currentPage < totalPages) loadCampaigns(currentPage + 1, true);
  });

  window.addEventListener("scroll", checkScrollBottom, { passive: true });
  window.addEventListener("resize", checkScrollBottom);

  loadCampaigns(1);
});
