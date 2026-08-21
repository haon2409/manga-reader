// Global variables
let currentSlug = "";
let currentChapterId = "";
let chapters = [];
let currentChapterIndex = -1;
let isVerticalNav = true;
let readChapters = {};
let isNewest = false;
let followedMangas = [];
let currentChapterPages = [];
let currentDoublePageIndex = 0;

// DOM elements
const elements = {
    mangaTitle: document.getElementById("manga-title"),
    mangaContent: document.getElementById("manga-content"),
    loading: document.getElementById("loading"),
    errorMessage: document.getElementById("error-message"),
    prevChapterBtn: document.getElementById("prev-chapter"),
    nextChapterBtn: document.getElementById("next-chapter"),
    chapterList: document.getElementById("chapter-list"),
    toggleNavPositionBtn: document.getElementById("toggle-nav-position"),
    chapterNavigation: document.getElementById("chapter-navigation"),
    warmthSlider: document.getElementById("warmth-slider"),
    followMangaBtn: document.getElementById("follow-manga-btn"),
    searchForm: document.getElementById("search-form"),
    searchInput: document.getElementById("search-input"),
    errorText: document.getElementById("error-text"),
    chapterDropdown: document.getElementById("chapterDropdown"),
    chapterCount: document.getElementById("chapter-count"),
    readingModeSelect: document.getElementById("reading-mode-select"),
};

// Helper functions
const helpers = {
    getBasePath: () => {
        const path = window.location.pathname;
        const segments = path
            .split("/")
            .filter((segment) => segment.length > 0);
        return segments[0] === "manga-reader" ? "/manga-reader/" : "./";
    },

    formatChapterText: (chapter) => {
        let text = `Chapter ${chapter.number}`;
        if (chapter.title && chapter.title.trim() !== "") {
            text += `: ${chapter.title}`;
        }
        return text;
    },

    updateFollowButton: (slug) => {
        const isFollowed = followedMangas.some((m) => m.slug === slug);
        const buttons = document.querySelectorAll(
            `.follow-btn[data-slug="${slug}"], #follow-manga-btn[data-slug="${slug}"]`,
        );

        buttons.forEach((button) => {
            button.classList.toggle("followed", isFollowed);
            button.innerHTML = isFollowed
                ? '<i class="fas fa-star"></i>'  // Ngôi sao đầy vàng khi followed
                : '<i class="far fa-star"></i>'; // Ngôi sao rỗng trắng khi chưa follow
        });
    },

    showLoading: (show) => {
        elements.loading.style.display = show ? "block" : "none";
    },

    showError: (message) => {
        elements.errorMessage.style.display = "block";
        elements.errorText.textContent = message;
        elements.mangaContent.style.display = "none";
    },

    hideError: () => {
        elements.errorMessage.style.display = "none";
    },
};

// Initialize the application
document.addEventListener("DOMContentLoaded", function () {
    const navbarBrand = document.querySelector(".navbar-brand");
    if (navbarBrand) {
        navbarBrand.href = helpers.getBasePath();
    }

    loadFollowedMangas();
    loadReadHistory();
    parseUrlParameters();

    if (elements.searchForm) {
        elements.searchForm.addEventListener("submit", function (e) {
            e.preventDefault();
            const keyword = elements.searchInput.value.trim();
            if (keyword) {
                handleSearchResults(keyword);
            }
        });
    }

    setupEventListeners();
    setupWarmthSlider();
});

// Touch event handlers
document.addEventListener("touchstart", function (e) {
    window.touchStartX = e.touches[0].clientX;
    window.touchStartTime = Date.now();
});

document.addEventListener(
    "touchmove",
    function (e) {
        if (
            window.touchStartX < 20 ||
            window.touchStartX > window.innerWidth - 20
        ) {
            e.preventDefault();
        }
    },
    { passive: false },
);

document.addEventListener("touchend", function (e) {
    const touchEndX = e.changedTouches[0].clientX;
    const deltaX = touchEndX - window.touchStartX;
    const duration = Date.now() - window.touchStartTime;

    if (window.touchStartX < 20 && deltaX > 50 && duration < 500) {
        elements.prevChapterBtn.click();
    } else if (
        window.touchStartX > window.innerWidth - 20 &&
        deltaX < -50 &&
        duration < 500
    ) {
        elements.nextChapterBtn.click();
    }
});

function parseUrlParameters() {
    const urlParams = new URLSearchParams(window.location.search);
    currentSlug = urlParams.get("slug") || "";
    currentChapterId = urlParams.get("chapter_id") || ""; // Gán trực tiếp vào currentChapterId
    isNewest = urlParams.get("newest") === "true";

    console.log("URL params:", { currentSlug, currentChapterId, isNewest }); // Log giữ nguyên

    if (currentSlug) {
        const formattedSlug = currentSlug
            .split("-")
            .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
            .join(" ");
        elements.mangaTitle.textContent = formattedSlug; // Sửa lỗi cú pháp: gán formattedSlug

        elements.followMangaBtn.style.display = "inline-block";
        elements.followMangaBtn.setAttribute("data-slug", currentSlug);

        helpers.updateFollowButton(currentSlug);
        loadMangaContent(currentSlug); // Chỉ truyền slug
    } else {
        elements.followMangaBtn.style.display = "none";
        showEmptyState();
    }
}

function toggleFollowManga(slug, title, chapterId = null) {
    const mangaIndex = followedMangas.findIndex((manga) => manga.slug === slug);

    if (mangaIndex === -1) {
        followedMangas.push({ slug, title, chapterId });
    } else {
        followedMangas.splice(mangaIndex, 1);
    }

    saveFollowedMangas();
    helpers.updateFollowButton(slug);

    if (!currentSlug) {
        showEmptyState();
    }
}

function setupEventListeners() {
    // Navigation buttons
    elements.prevChapterBtn.addEventListener("click", function (e) {
        e.preventDefault();
        if (currentChapterIndex > 0) {
            navigateToChapter(chapters[currentChapterIndex - 1].id);
        }
    });

    elements.nextChapterBtn.addEventListener("click", function (e) {
        e.preventDefault();
        if (
            currentChapterIndex < chapters.length - 1 &&
            currentChapterIndex !== -1
        ) {
            navigateToChapter(chapters[currentChapterIndex + 1].id);
        }
    });

    // Navigation position toggle
    elements.toggleNavPositionBtn.addEventListener("click", function (e) {
        e.preventDefault();
        toggleNavPosition();
    });

    // Load saved navigation position
    loadNavPositionFromStorage();

    // Keyboard navigation
    document.addEventListener("keydown", function (e) {
        const mode = elements.readingModeSelect?.value || "scroll";
        
        // Xử lý riêng cho chế độ trang đôi: Lật trang bằng phím mũi tên
        if (mode === "double") {
            if (e.key === "ArrowLeft") {
                const navLeft = document.querySelector('.page-nav-left');
                if (navLeft) navLeft.click();
            }
            if (e.key === "ArrowRight") {
                const navRight = document.querySelector('.page-nav-right');
                if (navRight) navRight.click();
            }
        }
        
        // Giữ lại phím P (Prev) và N (Next) để chuyển chương, vô hiệu hóa phím mũi tên cho chức năng này
        if (e.key.toLowerCase() === "p" && !elements.prevChapterBtn.disabled) {
            elements.prevChapterBtn.click();
        }
        if (e.key.toLowerCase() === "n" && !elements.nextChapterBtn.disabled) {
            elements.nextChapterBtn.click();
        }
    });

    // Follow buttons
    document.addEventListener("click", function (e) {
        const followBtn = e.target.closest(".follow-btn");
        const unfollowBtn = e.target.closest(".unfollow-btn");

        if (followBtn) {
            const slug = followBtn.dataset.slug || currentSlug;
            const title =
                followBtn.dataset.title || elements.mangaTitle.textContent;
            const chapterId = followBtn.dataset.chapterId || currentChapterId;
            toggleFollowManga(slug, title, chapterId);
        }

        if (unfollowBtn) {
            const slug = unfollowBtn.dataset.slug;
            const manga = followedMangas.find((m) => m.slug === slug);
            if (manga) {
                toggleFollowManga(slug, manga.title, manga.chapterId);
            }
        }
    });

    // Sự kiện cho warmth toggle
    const warmthToggle = document.querySelector(".warmth-toggle");
    const warmthControl = document.querySelector(".warmth-control");

    warmthToggle.addEventListener("click", function (e) {
        e.preventDefault();
        if (!isVerticalNav) { // Chỉ hoạt động khi ở chế độ nav-horizontal
            warmthControl.classList.toggle("show");
        }
    });

    // Ẩn thanh trượt khi click ra ngoài
    document.addEventListener("click", function (e) {
        if (!isVerticalNav && !warmthControl.contains(e.target)) {
            warmthControl.classList.remove("show");
        }
    });

    // Khôi phục chế độ đọc đã lưu
    if(elements.readingModeSelect) {
        elements.readingModeSelect.value = localStorage.getItem("readingMode") || "scroll";
        elements.readingModeSelect.addEventListener("change", function(e) {
            localStorage.setItem("readingMode", e.target.value);
            currentDoublePageIndex = 0; // Đưa về trang đầu khi đổi chế độ
            renderPages();
        });
    }
}

async function loadMangaContent(slug) {
    const urlParams = new URLSearchParams(window.location.search);

    try {
        helpers.showLoading(true);
        elements.mangaContent.style.display = "none";
        helpers.hideError();
        elements.chapterNavigation.style.display = "flex";

        currentSlug = slug;

        await fetchMangaInfo(slug);

        if (!chapters || chapters.length === 0) {
            throw new Error("No chapters available");
        }

        // Logic chọn chương trực tiếp với currentChapterId
        if (isNewest) {
            currentChapterId = chapters[chapters.length - 1].id;
        } else if (!currentChapterId || !chapters.some((chapter) => chapter.id === currentChapterId)) {
            currentChapterId = chapters[0].id; // Mặc định về chương đầu tiên nếu không hợp lệ
        }

        currentChapterIndex = chapters.findIndex(
            (chapter) => chapter.id === currentChapterId,
        );

        const url = new URL(window.location.href);
        url.searchParams.set("slug", slug);
        url.searchParams.set("chapter_id", currentChapterId);
        if (urlParams.get("newest") === "true" && isNewest) {
            url.searchParams.set("newest", "true");
        } else {
            url.searchParams.delete("newest");
        }
        window.history.replaceState({}, "", url.toString());

        await fetchChapterContent(slug, currentChapterId);
        isNewest = false;

        updateNavigation();
        helpers.updateFollowButton(currentSlug);
        applyWarmthFromStorage();
    } catch (error) {
        console.error("Error loading manga content:", error);
        helpers.showError(
            error.message ||
                "Unable to load manga content. Please try again later.",
        );
    } finally {
        helpers.showLoading(false);
    }
}

/**
 * Fetch manga information from API
 * @param {string} slug - Manga slug/identifier
 */
async function fetchMangaInfo(slug) {
    const apiUrl = `https://otruyenapi.com/v1/api/truyen-tranh/${encodeURIComponent(slug)}`;

    try {
        helpers.showLoading(true);
        console.log(`Fetching manga info for: ${slug}`);

        const response = await fetch(apiUrl, {
            method: "GET",
            headers: {
                Accept: "application/json",
                "Content-Type": "application/json",
                "User-Agent":
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            },
        });

        console.log("API response status:", response.status);

        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }

        const data = await response.json();
        console.log("API response data:", data);

        if (!data?.data?.item) {
            throw new Error("Invalid API response structure");
        }

        elements.mangaTitle.textContent =
            data.data.item.name || "Unknown Manga";

        // Process chapters data
        chapters = data.data.item.chapters[0].server_data.map((chapter) => ({
            id: chapter.chapter_api_data.split("/").pop(),
            number: chapter.chapter_name,
            title: chapter.chapter_title || "",
        }));

        // Update current chapter index before populating dropdown
        updateCurrentChapterIndex();

        // Populate chapter dropdown with the correct index
        populateChapterDropdown();

        return { success: true, chapters };
    } catch (error) {
        console.error("Error fetching manga info:", error);
        helpers.showError("Failed to load manga info. Please try again later.");
        return { success: false, error };
    } finally {
        helpers.showLoading(false);
    }
}

/**
 * Update the current chapter index based on currentChapterId
 */
function updateCurrentChapterIndex() {
    if (!chapters || chapters.length === 0) {
        currentChapterIndex = -1;
        return;
    }

    // Find the index of current chapter
    currentChapterIndex = chapters.findIndex(
        (chapter) => chapter.id === currentChapterId,
    );
    console.log("currentChapterId: ", currentChapterId);
    console.log("chapters: ", currentChapterId);
    // Fallback to first chapter if not found
    if (currentChapterIndex === -1 && currentChapterId) {
        console.warn(
            `Chapter ${currentChapterId} not found, defaulting to first chapter`,
        );
        currentChapterIndex = 0;
        currentChapterId = chapters[0].id;

        // Update URL to reflect the correct chapter
        const url = new URL(window.location.href);
        url.searchParams.set("chapter_id", currentChapterId);
        window.history.replaceState({}, "", url.toString());
    }

    console.log("Updated currentChapterIndex:", currentChapterIndex);
}

async function fetchMangaDetails(slug) {
    try {
        const apiUrl = `https://otruyenapi.com/v1/api/truyen-tranh/${encodeURIComponent(slug)}`;
        const response = await fetch(apiUrl, {
            method: "GET",
            headers: {
                Accept: "application/json",
                "Content-Type": "application/json",
                "User-Agent":
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            },
        });

        if (!response.ok) {
            throw new Error(
                `API request failed with status ${response.status}`,
            );
        }

        const data = await response.json();
        if (!data?.data?.item) {
            throw new Error("Invalid API response structure");
        }

        const manga = data.data.item;
        const cdnDomain =
            data.data.APP_DOMAIN_CDN_IMAGE || "https://sv1.otruyencdn.com";

        return {
            slug: manga.slug,
            name: manga.name || "Unknown Title",
            author: Array.isArray(manga.author)
                ? manga.author.join(", ")
                : "Unknown Author",
            thumbnail:
                `${cdnDomain}/uploads/comics/${manga.thumb_url}` ||
                "https://via.placeholder.com/50x70?text=No+Image",
            status: manga.status || "Unknown",
            chapterCount: manga.chapters?.[0]?.server_data?.length || 0,
            updatedAt: manga.updatedAt
                ? new Date(manga.updatedAt).toLocaleDateString()
                : "N/A",
            chapters: manga.chapters || [],
        };
    } catch (error) {
        console.error(`Error fetching details for slug ${slug}:`, error);
        return {
            slug,
            name: "Error Loading Title",
            author: "N/A",
            thumbnail: "https://via.placeholder.com/50x70?text=Error",
            status: "N/A",
            chapterCount: 0,
            updatedAt: "N/A",
            chapters: [],
        };
    }
}

async function fetchChapterContent(slug, chapterId) {
    const apiUrl = `https://sv1.otruyencdn.com/v1/api/chapter/${chapterId}`;
    const response = await fetch(apiUrl, {
        method: "GET",
        headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
    });

    if (!response.ok) {
        throw new Error(`API request failed with status ${response.status}`);
    }

    const data = await response.json();
    if (!data || data.status !== "success" || !data.data) {
        throw new Error("Invalid API response structure");
    }

    const domainCdn = data.data.domain_cdn || "";
    const chapterPath = data.data.item?.chapter_path || "";
    const chapterImages = data.data.item?.chapter_image || [];

    if (!chapterImages.length) {
        throw new Error("No images found in this chapter");
    }

    const pages = chapterImages.map((image, index) => ({
        id: index + 1,
        url: `${domainCdn}/${chapterPath}/${image.image_file || ""}`,
        filename: image.image_file || "",
    }));

    currentChapterPages = pages;
    currentDoublePageIndex = 0;
    renderPages(); // Hàm mới xử lý hiển thị theo chế độ

    if (currentChapterIndex !== -1 && chapters[currentChapterIndex]) {
        const chapter = chapters[currentChapterIndex];
        document.title = `Chap ${chapter.number} - ${elements.mangaTitle.textContent}`;
    }
}

function displayMangaPages(pages) {
    if (!elements.mangaContent) {
        console.error("Manga content container not found");
        return;
    }

    elements.mangaContent.innerHTML = "";

    if (Array.isArray(pages) && pages.length > 0) {
        const pagesContainer = document.createElement("div");
        pagesContainer.className = "manga-pages-container";
        elements.mangaContent.appendChild(pagesContainer);

        pages.forEach((page, index) => {
            const pageElement = document.createElement("div");
            pageElement.className = "manga-page-container";
            pageElement.dataset.pageNumber = index + 1;

            const img = document.createElement("img");
            img.src = page.url;
            img.alt = `Page ${page.id}`;
            img.className = "manga-page";
            img.loading = "lazy";

            img.onerror = function () {
                this.onerror = null;
                this.src =
                    "https://via.placeholder.com/800x1200/333333/FFFFFF?text=Image+Load+Error";
            };

            const pageNumber = document.createElement("div");
            pageNumber.className = "page-number badge bg-secondary";
            pageNumber.textContent = `Page ${index + 1}`;

            pageElement.appendChild(img);
            pageElement.appendChild(pageNumber);
            pagesContainer.appendChild(pageElement);
        });

        elements.mangaContent.style.display = "block";
    } else {
        showEmptyState("No pages found for this chapter");
    }
}

function renderPages() {
    const mode = elements.readingModeSelect ? elements.readingModeSelect.value : "scroll";
    if (mode === "scroll") {
        displayMangaPages(currentChapterPages);
    } else {
        displayDoublePages();
    }
    applyWarmthFromStorage(); // Giữ nguyên filter màu đã chỉnh
}

function displayDoublePages() {
    if (!elements.mangaContent) return;
    
    // Bắt buộc khung chứa phải hiển thị
    elements.mangaContent.style.display = "block";
    elements.mangaContent.innerHTML = "";

    if (!currentChapterPages || currentChapterPages.length === 0) {
        elements.mangaContent.innerHTML = "<p class='text-center my-5'>Không có dữ liệu trang truyện.</p>";
        return;
    }

    // Đảm bảo index luôn là số nguyên, tránh lỗi cộng dồn chuỗi
    currentDoublePageIndex = parseInt(currentDoublePageIndex, 10);

    const container = document.createElement("div");
    container.className = "double-page-container";

    const wrapper = document.createElement("div");
    wrapper.className = "double-page-wrapper";

    // Render trang trái (Trang thứ nhất trong cặp)
    if (currentChapterPages[currentDoublePageIndex + 1]) {
        const img2 = document.createElement("img");
        img2.src = currentChapterPages[currentDoublePageIndex + 1].url;
        img2.className = "manga-page";
        wrapper.appendChild(img2);
    }

    // Render trang phải (Trang thứ hai trong cặp)
    if (currentChapterPages[currentDoublePageIndex]) {
        const img1 = document.createElement("img");
        img1.src = currentChapterPages[currentDoublePageIndex].url;
        img1.className = "manga-page";
        wrapper.appendChild(img1);
    }

    // Nút lùi trang
    const btnPrev = document.createElement("button");
    btnPrev.className = "page-nav-btn page-nav-left";
    btnPrev.innerHTML = '<i class="fas fa-chevron-left"></i>';
    btnPrev.onclick = (e) => {
        e.preventDefault();
        if (currentDoublePageIndex >= 2) {
            currentDoublePageIndex -= 2;
            renderPages();
            window.scrollTo({ top: 0, behavior: 'smooth' });
        } else if (currentChapterIndex > 0) {
            // Cần lưu lại index chương cũ để trigger sự kiện đổi chương
            // Sau khi đổi chương, ta cần set trang cuối cho chương đó
            const previousChapter = chapters[currentChapterIndex - 1];
            
            // Gọi hàm đổi chương của bạn (giả sử là loadChapter hoặc tương tự)
            // Lưu ý: Bạn cần đảm bảo sau khi load xong chương mới, 
            // nó sẽ set currentDoublePageIndex = trang cuối.
            elements.prevChapterBtn.click(); 
            
            // MẸO: Đợi một chút cho dữ liệu chương mới load xong rồi mới set trang
            setTimeout(() => {
                currentDoublePageIndex = currentChapterPages.length % 2 === 0 
                    ? currentChapterPages.length - 2 
                    : currentChapterPages.length - 1;
                renderPages();
            }, 500); 
        }
    };

    // Nút tiến trang (Giờ nằm bên phải màn hình)
    const btnNext = document.createElement("button");
    btnNext.className = "page-nav-btn page-nav-right"; // Đổi class để CSS bắt đúng vị trí phải
    btnNext.innerHTML = '<i class="fas fa-chevron-right"></i>';
    btnNext.onclick = (e) => {
        e.preventDefault();
        if (currentDoublePageIndex + 2 < currentChapterPages.length) {
            currentDoublePageIndex += 2;
            renderPages();
            window.scrollTo({ top: 0, behavior: 'smooth' });
        } else if (currentChapterIndex < chapters.length - 1) {
            elements.nextChapterBtn.click();
        }
    };

    // Ẩn nút nếu không còn đường lùi/tiến
    if (currentDoublePageIndex === 0 && currentChapterIndex <= 0) {
        btnPrev.style.display = 'none';
    }
    if (currentDoublePageIndex + 2 >= currentChapterPages.length && currentChapterIndex >= chapters.length - 1) {
        btnNext.style.display = 'none';
    }

    container.appendChild(btnPrev);
    container.appendChild(wrapper);
    container.appendChild(btnNext);
    
    elements.mangaContent.appendChild(container);
}

/**
 * Populate the chapter dropdown list
 */
function populateChapterDropdown() {
    // Clear previous items
    elements.chapterList.innerHTML = "";

    if (!chapters || chapters.length === 0) {
        const listItem = document.createElement("li");
        listItem.textContent = "No chapters available";
        elements.chapterList.appendChild(listItem);
        return;
    }

    // Set dropdown button text
    const displayIndex = currentChapterIndex !== -1 ? currentChapterIndex : 0;
    elements.chapterDropdown.textContent = `Chap ${chapters[displayIndex].number}`;

    // Add chapters to dropdown in reverse order (newest first)
    [...chapters].reverse().forEach((chapter, index) => {
        const listItem = document.createElement("li");
        const link = document.createElement("a");
        link.className = "dropdown-item";
        link.href = "#";

        // Format chapter text
        link.textContent = helpers.formatChapterText(chapter);

        // Mark as read if in read history
        if (readChapters[currentSlug]?.includes(chapter.id)) {
            link.classList.add("read");
        }

        // Highlight current chapter
        if (chapter.id === currentChapterId) {
            link.classList.add("active");
            link.innerHTML = `<i class="fas fa-bookmark me-2"></i>${helpers.formatChapterText(chapter)}`;
            link.dataset.selected = "true"; // Thêm thuộc tính để dễ xác định
        }

        // Add click handler
        link.addEventListener("click", (e) => {
            e.preventDefault();
            navigateToChapter(chapter.id);
        });

        listItem.appendChild(link);
        elements.chapterList.appendChild(listItem);
    });

    // Update dropdown position based on navigation style
    updateDropdownPosition();

    // Thêm sự kiện để focus vào chapter hiện tại khi dropdown mở
    elements.chapterDropdown.addEventListener("shown.bs.dropdown", () => {
        const activeItem = elements.chapterList.querySelector(".dropdown-item.active");
        if (activeItem) {
            activeItem.scrollIntoView({ behavior: "smooth", block: "center" });
        }
    }, { once: true }); // Chỉ thêm listener một lần để tránh trùng lặp
}

function navigateToChapter(chapterId) {
    if (!chapterId) {
        helpers.showError("Không thể chuyển chapter do thiếu ID");
        return;
    }

    if (chapterId !== currentChapterId) {
        const url = new URL(window.location.href);
        url.searchParams.set("slug", currentSlug);
        url.searchParams.set("chapter_id", chapterId);
        url.searchParams.delete("newest");
        window.history.pushState({}, "", url.toString());

        currentChapterId = chapterId;
        loadMangaContent(currentSlug, currentChapterId);
    }
}

function updateNavigation() {
    elements.prevChapterBtn.disabled = currentChapterIndex <= 0;
    elements.prevChapterBtn.innerHTML = `<i class="fas fa-arrow-left"></i>`;
    elements.prevChapterBtn.title =
        currentChapterIndex > 0
            ? `Previous Chapter (${chapters[currentChapterIndex - 1].number})`
            : `No Previous Chapter`;

    elements.nextChapterBtn.disabled =
        currentChapterIndex >= chapters.length - 1 ||
        currentChapterIndex === -1;
    elements.nextChapterBtn.innerHTML = `<i class="fas fa-arrow-right"></i>`;
    elements.nextChapterBtn.title =
        currentChapterIndex < chapters.length - 1 && currentChapterIndex !== -1
            ? `Next Chapter (${chapters[currentChapterIndex + 1].number})`
            : `No Next Chapter`;

    if (currentChapterId) {
        saveReadChapter(currentChapterId);
    }

    if (currentChapterIndex !== -1 && chapters[currentChapterIndex]) {
        const chapter = chapters[currentChapterIndex];
        document.title = `Chapter ${chapter.number} - ${elements.mangaTitle.textContent}`;
    } else {
        document.title = "Manga Reader";
    }

    if (elements.chapterCount) {
        elements.chapterCount.textContent =
            chapters.length > 0
                ? `${chapters.length}`
                : "No chapters available";
    }
}

function toggleNavPosition() {
    isVerticalNav = !isVerticalNav;
    applyNavPositionStyles();
    localStorage.setItem("isVerticalNav", isVerticalNav.toString());
    updateNavPositionIcon();
    updateDropdownPosition();

    // Cập nhật trạng thái warmth-control
    const warmthControl = document.querySelector(".warmth-control");
    if (isVerticalNav) {
        warmthControl.classList.remove("show"); // Đảm bảo thanh trượt luôn hiển thị ở nav-vertical
    } else {
        warmthControl.classList.remove("show"); // Ẩn thanh trượt khi chuyển sang nav-horizontal
    }
}

function loadNavPositionFromStorage() {
    const savedPosition = localStorage.getItem("isVerticalNav");
    if (savedPosition !== null) {
        isVerticalNav = savedPosition === "true";
    }
    applyNavPositionStyles();
    updateNavPositionIcon();
    updateDropdownPosition();

    // Cập nhật trạng thái warmth-control khi load
    const warmthControl = document.querySelector(".warmth-control");
    if (!isVerticalNav) {
        warmthControl.classList.remove("show"); // Ẩn thanh trượt ở nav-horizontal
    }
}

function applyNavPositionStyles() {
    elements.chapterNavigation.classList.remove(
        "nav-vertical",
        "nav-horizontal",
    );
    elements.chapterNavigation.classList.add(
        isVerticalNav ? "nav-vertical" : "nav-horizontal",
    );
}

function updateNavPositionIcon() {
    if (isVerticalNav) {
        elements.toggleNavPositionBtn.title = "Switch to horizontal layout";
        elements.toggleNavPositionBtn.innerHTML =
            '<i class="fas fa-grip-horizontal"></i>';
    } else {
        elements.toggleNavPositionBtn.title = "Switch to vertical layout";
        elements.toggleNavPositionBtn.innerHTML =
            '<i class="fas fa-grip-vertical"></i>';
    }
}

function updateDropdownPosition() {
    const dropdownMenu = document.querySelector(".dropdown-menu");
    if (!dropdownMenu) return;

    dropdownMenu.classList.remove(
        "dropdown-menu-end",
        "dropdown-menu-start",
        "dropdown-menu-up",
    );
    dropdownMenu.classList.add(
        isVerticalNav ? "dropdown-menu-start" : "dropdown-menu-up",
    );
}

function loadReadHistory() {
    const history = localStorage.getItem("readChapters");
    if (history) {
        try {
            readChapters = JSON.parse(history);
            if (typeof readChapters !== "object" || readChapters === null) {
                readChapters = {};
            }
        } catch (error) {
            console.error("Error parsing read history:", error);
            readChapters = {};
        }
    }
}

async function showEmptyState(message = "No manga content to display") {
    helpers.showLoading(false);
    elements.mangaContent.style.display = "block";
    elements.chapterNavigation.style.display = "none";
    elements.followMangaBtn.style.display = "none";

    let emptyStateHtml = "";

    if (followedMangas.length === 0) {
        emptyStateHtml = `
            <div class="empty-state">
                <i class="fas fa-book"></i>
                <h3>Welcome to Manga Reader</h3>
                <p>${message}</p>
                <p>Enter a valid manga URL to begin reading.</p>
                <p><a href="./?slug=dao-hai-tac&chapter_id=65901d64ac52820f564b373e" target="_blank">Example: ?slug=dao-hai-tac&chapter_id=65901d64ac52820f564b373e</a></p>
            </div>
        `;
    } else {
        elements.mangaContent.innerHTML = `
            <div class="text-center my-5">
                <div class="spinner-border" role="status">
                    <span class="visually-hidden">Loading followed mangas...</span>
                </div>
            </div>
        `;

        const mangaDetails = await Promise.all(
            followedMangas.map((manga) => fetchMangaDetails(manga.slug)),
        );

        const followedMangasHtml = mangaDetails
            .map((manga, index) => {
                const latestChapterId = followedMangas.find(
                    (m) => m.slug === manga.slug,
                )?.chapterId;
                const url = latestChapterId
                    ? `./?slug=${manga.slug}&chapter_id=${latestChapterId}`
                    : `./?slug=${manga.slug}`;

                const chapters = manga.chapters?.[0]?.server_data || [];
                const chapterIndex = chapters.findIndex(
                    (ch) =>
                        ch.chapter_api_data.split("/").pop() ===
                        latestChapterId,
                );

                const chapter =
                    chapterIndex !== -1 ? chapters[chapterIndex] : null;

                const chapterName = chapterIndex + 1;
                const chapterTitle = chapter?.chapter_title || "";
                const readingText = chapterName
                    ? `Đang đọc: <span class="highlight-text">${chapterName}${chapterTitle ? ` - ${chapterTitle}` : ""}</span>`
                    : "";

                return `
                <div class="followed-manga-card">
                    <img src="${manga.thumbnail}" alt="${manga.name}" class="followed-manga-thumbnail" onerror="this.src='https://via.placeholder.com/80x120?text=Error';">
                    <div class="followed-manga-info">
                        <a href="${url}" class="followed-manga-title">${manga.name}</a>
                        <p class="small text-muted mb-1">Tác giả: <span class="highlight-text">${manga.author}</span></p>
                        <p class="small text-muted mb-1">Trạng thái: <span class="highlight-text">${manga.status}</span></p>
                        <p class="small text-muted mb-1">Chương: <span class="highlight-text">${manga.chapterCount}</span> | Cập nhật: <span class="highlight-text">${manga.updatedAt}</span></p>
                        <p class="small text-muted mb-0">${readingText}</p>
                    </div>
                    <button class="unfollow-btn" data-slug="${manga.slug}" title="Bỏ theo dõi">
                        <i class="fas fa-star"></i> <!-- Ngôi sao đầy vàng cho followed -->
                    </button>
                </div>
            `;
            })
            .join("");

        emptyStateHtml = `
            <div class="followed-mangas">
                <h4 class="mb-4">Truyện theo dõi</h4>
                <div class="followed-mangas-grid">
                    ${followedMangasHtml}
                </div>
            </div>
        `;
    }

    elements.mangaContent.innerHTML = emptyStateHtml;
}

function loadFollowedMangas() {
    const followed = localStorage.getItem("followedMangas");
    if (followed) {
        try {
            followedMangas = JSON.parse(followed);
        } catch (error) {
            console.error("Error parsing followed mangas:", error);
            followedMangas = [];
        }
    }
}

function saveReadChapter(chapterId) {
    if (!chapterId || !currentSlug) return;

    if (!readChapters[currentSlug]) {
        readChapters[currentSlug] = [];
    }

    if (!readChapters[currentSlug].includes(chapterId)) {
        readChapters[currentSlug].push(chapterId);
        localStorage.setItem("readChapters", JSON.stringify(readChapters));
    }

    const mangaIndex = followedMangas.findIndex(
        (manga) => manga.slug === currentSlug,
    );
    if (mangaIndex !== -1) {
        followedMangas[mangaIndex].chapterId = chapterId;
        saveFollowedMangas();
    }
}

function saveFollowedMangas() {
    localStorage.setItem("followedMangas", JSON.stringify(followedMangas));
}

async function loadLatestChapter(slug) {
    try {
        helpers.showLoading(true);
        elements.mangaContent.style.display = "none";
        helpers.hideError();

        currentSlug = slug;
        await fetchMangaInfo(slug);

        if (chapters && chapters.length > 0) {
            currentChapterId = chapters[chapters.length - 1].id; // Gán trực tiếp

            const url = new URL(window.location.href);
            url.searchParams.set("slug", slug);
            url.searchParams.set("chapter_id", currentChapterId);
            url.searchParams.set("newest", "true");
            window.history.replaceState({}, "", url.toString());

            await fetchChapterContent(slug, currentChapterId);
            updateNavigation();
            applyWarmthFromStorage();
        } else {
            throw new Error("No chapters found for this manga");
        }
    } catch (error) {
        console.error("Error loading latest chapter:", error);
        helpers.showError(
            error.message ||
                "Unable to load manga content. Please try again later.",
        );
    } finally {
        helpers.showLoading(false);
    }
}

async function handleSearchResults(keyword) {
    if (!keyword || typeof keyword !== "string") {
        elements.mangaContent.innerHTML =
            '<div class="alert alert-info">Vui lòng nhập từ khóa tìm kiếm hợp lệ.</div>';
        return;
    }

    if (!elements.mangaContent || !elements.chapterNavigation) {
        console.error("Required DOM elements not found");
        return;
    }

    elements.chapterNavigation.style.display = "none";
    elements.mangaTitle.textContent = `Kết quả tìm kiếm: "${keyword}"`;
    elements.followMangaBtn.style.display = "none";

    try {
        elements.mangaContent.innerHTML =
            '<div class="text-center my-5"><div class="spinner-border"></div></div>';

        const response = await fetch(
            `https://otruyenapi.com/v1/api/tim-kiem?keyword=${encodeURIComponent(keyword)}`,
            {
                headers: {
                    Accept: "application/json",
                    "Content-Type": "application/json",
                },
            },
        );

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();

        if (data.status === "success" && data.data?.items?.length > 0) {
            const resultsHtml = data.data.items
        .map((manga) => {
            const thumbnail = manga.thumb_url
                ? `${data.data.APP_DOMAIN_CDN_IMAGE}/uploads/comics/${manga.thumb_url}`
                : "https://via.placeholder.com/200x300?text=No+Image";

            const date = manga.updatedAt
                ? new Date(manga.updatedAt).toLocaleDateString()
                : "N/A";
            const authors = Array.isArray(manga.author)
                ? manga.author.join(", ")
                : "Unknown";
            const chapterCount =
                manga.chapters?.[0]?.server_data?.length || 0;
            const isFollowed = followedMangas.some(
                (m) => m.slug === manga.slug,
            );

            return `
            <div class="card mb-3 search-result" style="max-width: 800px; margin: auto;">
                <div class="row g-0">
                    <div class="col-md-3">
                        <img src="${thumbnail}" class="img-fluid rounded-start" alt="${manga.name}" 
                            style="height: 200px; object-fit: cover;"
                            onerror="this.src='https://via.placeholder.com/200x300?text=Error+Loading+Image'">
                    </div>
                    <div class="col-md-9">
                        <div class="card-body">
                            <div class="d-flex align-items-center">
                                <h5 class="card-title me-2">
                                    <a href="#" onclick="handleMangaClick('${manga.slug}'); return false;" class="text-decoration-none text-info">
                                        ${manga.name}
                                    </a>
                                </h5>
                                <button class="btn btn-sm btn-outline-info follow-btn ${isFollowed ? "followed" : ""}" data-slug="${manga.slug}" data-title="${manga.name}">
                                    ${isFollowed ? '<i class="fas fa-star"></i>' : '<i class="far fa-star"></i>'}
                                </button>
                            </div>
                            <p class="card-text">
                                <small class="text-muted">Author: <span class="highlight-text">${authors}</span></small><br>
                                <small class="text-muted">Status: <span class="highlight-text">${manga.status || "Unknown"}</span></small><br>
                                <small class="text-muted">Chapters: <span class="highlight-text">${chapterCount}</span></small><br>
                                <small class="text-muted">Updated: <span class="highlight-text">${date}</span></small>
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        `;
        })
        .join("");

            elements.mangaContent.innerHTML = `<div class="container">${resultsHtml}</div>`;
        } else {
            elements.mangaContent.innerHTML = `
                <div class="alert alert-info">
                    <i class="fas fa-info-circle me-2"></i>
                    No results found for "${keyword}"
                </div>`;
        }
    } catch (error) {
        console.error("Search error:", error);
        elements.mangaContent.innerHTML = `
            <div class="alert alert-danger">
                <i class="fas fa-exclamation-triangle me-2"></i>
                Error searching manga. Please try again later.
            </div>`;
    }
}

function handleMangaClick(slug) {
    fetch(
        `https://otruyenapi.com/v1/api/truyen-tranh/${encodeURIComponent(slug)}`,
        {
            headers: {
                Accept: "application/json",
                "Content-Type": "application/json",
            },
        },
    )
        .then((response) => response.json())
        .then((data) => {
            if (data?.data?.item?.chapters?.[0]?.server_data) {
                const firstChapter = data.data.item.chapters[0].server_data[0];
                const chapterId = firstChapter.chapter_api_data
                    .split("/")
                    .pop();
                window.location.href = `./?slug=${slug}&chapter_id=${chapterId}`;
            } else {
                window.location.href = `./?slug=${slug}`;
            }
        })
        .catch((error) => {
            console.error("Error fetching manga info:", error);
            window.location.href = `./?slug=${slug}`;
        });
}

function setupWarmthSlider() {
    const savedWarmth = localStorage.getItem("warmthValue");
    if (savedWarmth !== null) {
        elements.warmthSlider.value = savedWarmth;
    }

    elements.warmthSlider.addEventListener("input", function () {
        const warmthValue = elements.warmthSlider.value;
        applyWarmth(warmthValue);
        localStorage.setItem("warmthValue", warmthValue);
    });
}

function applyWarmth(warmthValue) {
    const mangaPages = document.querySelectorAll(".manga-page");
    const sepia = warmthValue * 1.0;
    const brightness = 100 - warmthValue * 0.15;
    const hueRotate = warmthValue * 0.2;
    const contrast = 100 - warmthValue * 0.1;

    const red = Math.round(255 - (255 - 212) * (warmthValue / 100));
    const green = Math.round(255 - (255 - 160) * (warmthValue / 100));
    const blue = Math.round(255 - (255 - 23) * (warmthValue / 100));
    elements.warmthSlider.style.background = `rgb(${red}, ${green}, ${blue})`;

    mangaPages.forEach((page) => {
        page.style.filter = `sepia(${sepia}%) brightness(${brightness}%) hue-rotate(${hueRotate}deg) contrast(${contrast}%)`;
    });
}

function applyWarmthFromStorage() {
    const savedWarmth = localStorage.getItem("warmthValue");
    if (savedWarmth !== null) {
        elements.warmthSlider.value = savedWarmth;
        applyWarmth(savedWarmth);
    }
}
