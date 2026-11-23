/**
 * Trang chủ (pages/home.html)
 * Kết nối trực tiếp Backend FastAPI:
 *   1. Chiến dịch nổi bật: GET /api/campaigns/featured -> list[CampaignListItemResponse]
 *   2. Chiến dịch sắp diễn ra: GET /api/campaigns?sort=start_asc&page=1&page_size=6 -> CampaignListResponse
 */

function renderCampaignSection(container, items, templateEl, emptyMessage) {
  if (!container) return;

  if (!Array.isArray(items) || items.length === 0) {
    Layout.renderStateBox(container, emptyMessage);
    return;
  }

  container.innerHTML = "";
  const listFragment = document.createDocumentFragment();
  items.forEach((campaign) => {
    listFragment.appendChild(Layout.createCampaignCard(campaign, templateEl));
  });
  container.appendChild(listFragment);
}

async function loadHomeCampaigns() {
  const featuredContainer = document.getElementById("featuredCampaignsContainer");
  const upcomingContainer = document.getElementById("upcomingCampaignsContainer");
  const templateEl = document.getElementById("campaign-card-template");

  if (!featuredContainer || !upcomingContainer || !templateEl) return;

  Layout.renderSkeletonCards(featuredContainer, 3);
  Layout.renderSkeletonCards(upcomingContainer, 3);

  const [featuredResult, upcomingResult] = await Promise.allSettled([
    api.get("/campaigns/featured", { params: { limit: 3 } }),
    api.get("/campaigns", { params: { status: "OPEN", sort: "start_asc", page: 1, page_size: 3 } }),
  ]);

  let firstErrorMessage = null;

  if (featuredResult.status === "fulfilled") {
    const featuredItems = Array.isArray(featuredResult.value.data) ? featuredResult.value.data : [];
    renderCampaignSection(
      featuredContainer,
      featuredItems,
      templateEl,
      "Hiện chưa có chiến dịch nổi bật nào."
    );
  } else {
    firstErrorMessage = Layout.extractApiErrorMessage(
      featuredResult.reason,
      "Không thể tải chiến dịch nổi bật."
    );
    Layout.renderStateBox(featuredContainer, firstErrorMessage, "home-state-box--error");
  }

  if (upcomingResult.status === "fulfilled") {
    const upcomingItems = Array.isArray(upcomingResult.value.data?.items)
      ? upcomingResult.value.data.items
      : [];
    renderCampaignSection(
      upcomingContainer,
      upcomingItems,
      templateEl,
      "Hiện chưa có chiến dịch nào."
    );
  } else {
    const upcomingError = Layout.extractApiErrorMessage(
      upcomingResult.reason,
      "Không thể tải chiến dịch sắp diễn ra."
    );
    if (!firstErrorMessage) firstErrorMessage = upcomingError;
    Layout.renderStateBox(upcomingContainer, upcomingError, "home-state-box--error");
  }

  if (firstErrorMessage && typeof showToast === "function") {
    showToast(firstErrorMessage, "error");
  }
}

document.addEventListener("DOMContentLoaded", () => {
  Layout.renderPublicShell("btnHomeLogout");
  loadHomeCampaigns();
});
