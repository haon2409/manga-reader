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
let openDoublePageAtEnd = false;

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
};

// Helpers
const helpers = {
    getBasePath: () => {
        const path = window.location.pathname;
        const segments = path.split("/").filter((s) => s.length > 0);
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
            `.follow-btn[data-slug="${slug}"], #follow-manga-btn[data-slug="${slug}"]`
        );
        buttons.forEach((button) => {
            button.classList.toggle("followed", isFollowed);
            button.innerHTML = isFollowed
                ? '<i class="fas fa-star"></i>'
                : '<i class="far fa-star"></i>';
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

    getReadingMode: () => localStorage.getItem("readingMode") || "scroll",
};

// Init
document.addEventListener("DOMContentLoaded", () => {
    const navbarBrand = document.querySelector(".navbar-brand");
    if (navbarBrand) navbarBrand.href = helpers.getBasePath();

    loadFollowedMangas();
    loadReadHistory();
    restoreReadingMode();
    parseUrlParameters();

    if (elements.searchForm) {
        elements.searchForm.addEventListener("submit", (e) => {
            e.preventDefault();
            const keyword = elements.searchInput.value.trim();
            if (keyword) handleSearchResults(keyword);
        });
    }

    setupEventListeners();
    setupWarmthSlider();
});

// Touch swipe
document.addEventListener("touchstart", (e) => {
    window.touchStartX = e.touches[0].clientX;
    window.touchStartTime = Date.now();
});

document.addEventListener(
    "touchmove",
    (e) => {
        if (window.touchStartX < 20 || window.touchStartX > window.innerWidth - 20) {
            e.preventDefault();
        }
    },
    { passive: false }
);

document.addEventListener("touchend", (e) => {
    const touchEndX = e.changedTouches[0].clientX;
    const deltaX = touchEndX - window.touchStartX;
    const duration = Date.now() - window.touchStartTime;

    if (window.touchStartX < 20 && deltaX > 50 && duration < 500) {
        elements.prevChapterBtn.click();
    } else if (window.touchStartX > window.innerWidth - 20 && deltaX < -50 && duration < 500) {
        elements.nextChapterBtn.click();
    }
});

function parseUrlParameters() {
    const urlParams = new URLSearchParams(window.location.search);
    currentSlug = urlParams.get("slug") || "";
    currentChapterId = urlParams.get("chapter_id") || "";
    isNewest = urlParams.get("newest") === "true";

    if (currentSlug) {
        const formattedSlug = currentSlug
            .split("-")
            .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
            .join(" ");
        elements.mangaTitle.textContent = formattedSlug;
        elements.followMangaBtn.style.display = "inline-block";
        elements.followMangaBtn.setAttribute("data-slug", currentSlug);
        helpers.updateFollowButton(currentSlug);
        loadMangaContent(currentSlug);
    } else {
        elements.followMangaBtn.style.display = "none";
        showEmptyState();
    }
}

function toggleFollowManga(slug, title, chapterId = null) {
    const idx = followedMangas.findIndex((m) => m.slug === slug);
    if (idx === -1) {
        followedMangas.push({ slug, title, chapterId });
    } else {
        followedMangas.splice(idx, 1);
    }
    saveFollowedMangas();
    helpers.updateFollowButton(slug);
    if (!currentSlug) showEmptyState();
}

function setupEventListeners() {
    elements.prevChapterBtn.addEventListener("click", (e) => {
        e.preventDefault();
        if (currentChapterIndex > 0) {
            navigateToChapter(chapters[currentChapterIndex - 1].id);
        }
    });

    elements.nextChapterBtn.addEventListener("click", (e) => {
        e.preventDefault();
        if (currentChapterIndex < chapters.length - 1 && currentChapterIndex !== -1) {
            navigateToChapter(chapters[currentChapterIndex + 1].id);
        }
    });

    elements.toggleNavPositionBtn.addEventListener("click", (e) => {
        e.preventDefault();
        if (document.body.classList.contains("double-reading-mode")) return;
        toggleNavPosition();
    });

    loadNavPositionFromStorage();

    document.addEventListener("keydown", (e) => {
        const mode = helpers.getReadingMode();
        if (mode === "double") {
            if (e.key === "ArrowLeft") {
                const navLeft = document.querySelector(".page-nav-left");
                if (navLeft) navLeft.click();
            }
            if (e.key === "ArrowRight") {
                const navRight = document.querySelector(".page-nav-right");
                if (navRight) navRight.click();
            }
        }
        if (e.key.toLowerCase() === "p" && !elements.prevChapterBtn.disabled) {
            elements.prevChapterBtn.click();
        }
        if (e.key.toLowerCase() === "n" && !elements.nextChapterBtn.disabled) {
            elements.nextChapterBtn.click();
        }
    });

    document.addEventListener("click", (e) => {
        const followBtn = e.target.closest(".follow-btn");
        const unfollowBtn = e.target.closest(".unfollow-btn");

        if (followBtn) {
            const slug = followBtn.dataset.slug || currentSlug;
            const title = followBtn.dataset.title || elements.mangaTitle.textContent;
            const chapterId = followBtn.dataset.chapterId || currentChapterId;
            toggleFollowManga(slug, title, chapterId);
        }

        if (unfollowBtn) {
            const slug = unfollowBtn.dataset.slug;
            const manga = followedMangas.find((m) => m.slug === slug);
            if (manga) toggleFollowManga(slug, manga.title, manga.chapterId);
        }
    });

    const warmthToggle = document.querySelector(".warmth-toggle");
    const warmthControl = document.querySelector(".warmth-control");

    warmthToggle?.addEventListener("click", (e) => {
        e.preventDefault();
        if (!isVerticalNav) warmthControl.classList.toggle("show");
    });

    document.addEventListener("click", (e) => {
        if (!isVerticalNav && warmthControl && !warmthControl.contains(e.target)) {
            warmthControl.classList.remove("show");
        }
    });

    // Segmented control - Reading Mode
    document.querySelectorAll(".segmented-control .segment").forEach((btn) => {
        btn.addEventListener("click", () => {
            const mode = btn.dataset.mode;

            document.querySelectorAll(".segmented-control .segment")
                .forEach((b) => b.classList.remove("active"));
            btn.classList.add("active");

            localStorage.setItem("readingMode", mode);
            currentDoublePageIndex = 0;
            renderPages();
        });
    });
}

function restoreReadingMode() {
    const saved = helpers.getReadingMode();
    document.querySelectorAll(".segmented-control .segment").forEach((btn) => {
        btn.classList.toggle("active", btn.dataset.mode === saved);
    });
    applyDoubleReadingLayout();
}

function applyDoubleReadingLayout(enabled) {
    const mode = helpers.getReadingMode();
    const isEnabled =
        enabled !== undefined ? enabled : mode === "double" && !!currentSlug;

    document.body.classList.toggle("double-reading-mode", isEnabled);

    // Ẩn hoàn toàn nút toggle khi ở chế độ trang đôi
    if (elements.toggleNavPositionBtn) {
        elements.toggleNavPositionBtn.style.display = isEnabled ? "none" : "";
    }
}

async function loadMangaContent(slug) {
    const urlParams = new URLSearchParams(window.location.search);
    try {
        helpers.showLoading(true);
        elements.mangaContent.style.display = "none";
        helpers.hideError();
        elements.chapterNavigation.style.display = "flex";
        applyDoubleReadingLayout();

        currentSlug = slug;
        await fetchMangaInfo(slug);

        if (!chapters || chapters.length === 0) {
            throw new Error("No chapters available");
        }

        if (isNewest) {
            currentChapterId = chapters[chapters.length - 1].id;
        } else if (!currentChapterId || !chapters.some((c) => c.id === currentChapterId)) {
            currentChapterId = chapters[0].id;
        }

        currentChapterIndex = chapters.findIndex((c) => c.id === currentChapterId);

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
        helpers.showError(error.message || "Unable to load manga content. Please try again later.");
    } finally {
        helpers.showLoading(false);
    }
}

async function fetchMangaInfo(slug) {
    const apiUrl = `https://otruyenapi.com/v1/api/truyen-tranh/${encodeURIComponent(slug)}`;
    try {
        const response = await fetch(apiUrl, {
            method: "GET",
            headers: {
                Accept: "application/json",
                "Content-Type": "application/json",
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            },
        });

        if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);

        const data = await response.json();
        if (!data?.data?.item) throw new Error("Invalid API response structure");

        elements.mangaTitle.textContent = data.data.item.name || "Unknown Manga";

        chapters = data.data.item.chapters[0].server_data.map((chapter) => ({
            id: chapter.chapter_api_data.split("/").pop(),
            number: chapter.chapter_name,
            title: chapter.chapter_title || "",
        }));

        updateCurrentChapterIndex();
        populateChapterDropdown();
        return { success: true, chapters };
    } catch (error) {
        console.error("Error fetching manga info:", error);
        helpers.showError("Failed to load manga info. Please try again later.");
        return { success: false, error };
    }
}

function updateCurrentChapterIndex() {
    if (!chapters || chapters.length === 0) {
        currentChapterIndex = -1;
        return;
    }
    currentChapterIndex = chapters.findIndex((c) => c.id === currentChapterId);
    if (currentChapterIndex === -1 && currentChapterId) {
        currentChapterIndex = 0;
        currentChapterId = chapters[0].id;
        const url = new URL(window.location.href);
        url.searchParams.set("chapter_id", currentChapterId);
        window.history.replaceState({}, "", url.toString());
    }
}

async function fetchMangaDetails(slug) {
    try {
        const apiUrl = `https://otruyenapi.com/v1/api/truyen-tranh/${encodeURIComponent(slug)}`;
        const response = await fetch(apiUrl, {
            method: "GET",
            headers: {
                Accept: "application/json",
                "Content-Type": "application/json",
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            },
        });

        if (!response.ok) throw new Error(`API request failed with status ${response.status}`);

        const data = await response.json();
        if (!data?.data?.item) throw new Error("Invalid API response structure");

        const manga = data.data.item;
        const cdnDomain = data.data.APP_DOMAIN_CDN_IMAGE || "https://sv1.otruyencdn.com";

        return {
            slug: manga.slug,
            name: manga.name || "Unknown Title",
            author: Array.isArray(manga.author) ? manga.author.join(", ") : "Unknown Author",
            thumbnail: `${cdnDomain}/uploads/comics/${manga.thumb_url}` || "https://via.placeholder.com/50x70?text=No+Image",
            status: manga.status || "Unknown",
            chapterCount: manga.chapters?.[0]?.server_data?.length || 0,
            updatedAt: manga.updatedAt ? new Date(manga.updatedAt).toLocaleDateString() : "N/A",
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
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
    });

    if (!response.ok) throw new Error(`API request failed with status ${response.status}`);

    const data = await response.json();
    if (!data || data.status !== "success" || !data.data) {
        throw new Error("Invalid API response structure");
    }

    const domainCdn = data.data.domain_cdn || "";
    const chapterPath = data.data.item?.chapter_path || "";
    const chapterImages = data.data.item?.chapter_image || [];

    if (!chapterImages.length) throw new Error("No images found in this chapter");

    const pages = chapterImages.map((image, index) => ({
        id: index + 1,
        url: `${domainCdn}/${chapterPath}/${image.image_file || ""}`,
        filename: image.image_file || "",
    }));

    currentChapterPages = pages;
    const readingMode = helpers.getReadingMode();
    if (openDoublePageAtEnd && readingMode === "double") {
        currentDoublePageIndex = Math.max(0, pages.length - 2);
    } else {
        currentDoublePageIndex = 0;
    }
    openDoublePageAtEnd = false;
    renderPages();

    if (currentChapterIndex !== -1 && chapters[currentChapterIndex]) {
        const chapter = chapters[currentChapterIndex];
        document.title = `Chap ${chapter.number} - ${elements.mangaTitle.textContent}`;
    }
}

function displayMangaPages(pages) {
    if (!elements.mangaContent) return;

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
                this.src = "https://via.placeholder.com/800x1200/333333/FFFFFF?text=Image+Load+Error";
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
    const mode = helpers.getReadingMode();
    applyDoubleReadingLayout(mode === "double" && !!currentSlug);
    if (mode === "scroll") {
        displayMangaPages(currentChapterPages);
    } else {
        displayDoublePages();
    }
    applyWarmthFromStorage();
}

function displayDoublePages() {
    if (!elements.mangaContent) return;

    elements.mangaContent.style.display = "block";
    elements.mangaContent.innerHTML = "";

    if (!currentChapterPages || currentChapterPages.length === 0) {
        elements.mangaContent.innerHTML = "<p class='text-center my-5'>Không có dữ liệu trang truyện.</p>";
        return;
    }

    currentDoublePageIndex = parseInt(currentDoublePageIndex, 10);

    const container = document.createElement("div");
    container.className = "double-page-container";

    const wrapper = document.createElement("div");
    wrapper.className = "double-page-wrapper";

    if (currentChapterPages[currentDoublePageIndex]) {
        const imgLeft = document.createElement("img");
        imgLeft.src = currentChapterPages[currentDoublePageIndex].url;
        imgLeft.className = "manga-page";
        wrapper.appendChild(imgLeft);
    }

    if (currentChapterPages[currentDoublePageIndex + 1]) {
        const imgRight = document.createElement("img");
        imgRight.src = currentChapterPages[currentDoublePageIndex + 1].url;
        imgRight.className = "manga-page";
        wrapper.appendChild(imgRight);
    }

    const btnPrev = document.createElement("button");
    btnPrev.className = "page-nav-btn page-nav-left";
    btnPrev.innerHTML = '<i class="fas fa-chevron-left"></i>';
    btnPrev.onclick = (e) => {
        e.preventDefault();
        if (currentDoublePageIndex >= 2) {
            currentDoublePageIndex -= 2;
            renderPages();
        } else if (currentChapterIndex > 0) {
            openDoublePageAtEnd = true;
            elements.prevChapterBtn.click();
        }
    };

    const btnNext = document.createElement("button");
    btnNext.className = "page-nav-btn page-nav-right";
    btnNext.innerHTML = '<i class="fas fa-chevron-right"></i>';
    btnNext.onclick = (e) => {
        e.preventDefault();
        if (currentDoublePageIndex + 2 < currentChapterPages.length) {
            currentDoublePageIndex += 2;
            renderPages();
        } else if (currentChapterIndex < chapters.length - 1) {
            elements.nextChapterBtn.click();
        }
    };

    if (currentDoublePageIndex === 0 && currentChapterIndex <= 0) {
        btnPrev.disabled = true;
        btnPrev.setAttribute("aria-hidden", "true");
    }
    if (currentDoublePageIndex + 2 >= currentChapterPages.length && currentChapterIndex >= chapters.length - 1) {
        btnNext.disabled = true;
        btnNext.setAttribute("aria-hidden", "true");
    }

    container.appendChild(btnPrev);
    container.appendChild(wrapper);
    container.appendChild(btnNext);
    elements.mangaContent.appendChild(container);
}

function populateChapterDropdown() {
    elements.chapterList.innerHTML = "";

    if (!chapters || chapters.length === 0) {
        const listItem = document.createElement("li");
        listItem.textContent = "No chapters available";
        elements.chapterList.appendChild(listItem);
        return;
    }

    const displayIndex = currentChapterIndex !== -1 ? currentChapterIndex : 0;
    elements.chapterDropdown.textContent = `Chap ${chapters[displayIndex].number}`;

    [...chapters].reverse().forEach((chapter) => {
        const listItem = document.createElement("li");
        const link = document.createElement("a");
        link.className = "dropdown-item";
        link.href = "#";
        link.textContent = helpers.formatChapterText(chapter);

        if (readChapters[currentSlug]?.includes(chapter.id)) {
            link.classList.add("read");
        }

        if (chapter.id === currentChapterId) {
            link.classList.add("active");
            link.innerHTML = `<i class="fas fa-bookmark me-2"></i>${helpers.formatChapterText(chapter)}`;
            link.dataset.selected = "true";
        }

        link.addEventListener("click", (e) => {
            e.preventDefault();
            navigateToChapter(chapter.id);
        });

        listItem.appendChild(link);
        elements.chapterList.appendChild(listItem);
    });

    updateDropdownPosition();

    elements.chapterDropdown.addEventListener(
        "shown.bs.dropdown",
        () => {
            const activeItem = elements.chapterList.querySelector(".dropdown-item.active");
            if (activeItem) activeItem.scrollIntoView({ behavior: "smooth", block: "center" });
        },
        { once: true }
    );
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
        loadMangaContent(currentSlug);
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
        currentChapterIndex >= chapters.length - 1 || currentChapterIndex === -1;
    elements.nextChapterBtn.innerHTML = `<i class="fas fa-arrow-right"></i>`;
    elements.nextChapterBtn.title =
        currentChapterIndex < chapters.length - 1 && currentChapterIndex !== -1
            ? `Next Chapter (${chapters[currentChapterIndex + 1].number})`
            : `No Next Chapter`;

    if (currentChapterId) saveReadChapter(currentChapterId);

    if (currentChapterIndex !== -1 && chapters[currentChapterIndex]) {
        const chapter = chapters[currentChapterIndex];
        document.title = `Chapter ${chapter.number} - ${elements.mangaTitle.textContent}`;
    } else {
        document.title = "Manga Reader";
    }

    if (elements.chapterCount) {
        elements.chapterCount.textContent = chapters.length > 0 ? `${chapters.length}` : "No chapters available";
    }
}

function toggleNavPosition() {
    isVerticalNav = !isVerticalNav;
    applyNavPositionStyles();
    localStorage.setItem("isVerticalNav", isVerticalNav.toString());
    updateNavPositionIcon();
    updateDropdownPosition();

    const warmthControl = document.querySelector(".warmth-control");
    if (warmthControl) warmthControl.classList.remove("show");
}

function loadNavPositionFromStorage() {
    const saved = localStorage.getItem("isVerticalNav");
    if (saved !== null) isVerticalNav = saved === "true";
    applyNavPositionStyles();
    updateNavPositionIcon();
    updateDropdownPosition();

    const warmthControl = document.querySelector(".warmth-control");
    if (warmthControl && !isVerticalNav) warmthControl.classList.remove("show");
}

function applyNavPositionStyles() {
    elements.chapterNavigation.classList.remove("nav-vertical", "nav-horizontal");
    elements.chapterNavigation.classList.add(isVerticalNav ? "nav-vertical" : "nav-horizontal");
}

function updateNavPositionIcon() {
    if (isVerticalNav) {
        elements.toggleNavPositionBtn.title = "Switch to horizontal layout";
        elements.toggleNavPositionBtn.innerHTML = '<i class="fas fa-grip-horizontal"></i>';
    } else {
        elements.toggleNavPositionBtn.title = "Switch to vertical layout";
        elements.toggleNavPositionBtn.innerHTML = '<i class="fas fa-grip-vertical"></i>';
    }
}

function updateDropdownPosition() {
    const dropdownMenu = document.querySelector(".dropdown-menu");
    if (!dropdownMenu) return;
    dropdownMenu.classList.remove("dropdown-menu-end", "dropdown-menu-start", "dropdown-menu-up");
    dropdownMenu.classList.add(isVerticalNav ? "dropdown-menu-start" : "dropdown-menu-up");
}

function loadReadHistory() {
    const history = localStorage.getItem("readChapters");
    if (history) {
        try {
            readChapters = JSON.parse(history);
            if (typeof readChapters !== "object" || readChapters === null) readChapters = {};
        } catch {
            readChapters = {};
        }
    }
}

async function showEmptyState(message = "No manga content to display") {
    helpers.showLoading(false);
    applyDoubleReadingLayout(false);
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

        const mangaDetails = await Promise.all(followedMangas.map((m) => fetchMangaDetails(m.slug)));

        const followedMangasHtml = mangaDetails
            .map((manga) => {
                const latestChapterId = followedMangas.find((m) => m.slug === manga.slug)?.chapterId;
                const url = latestChapterId
                    ? `./?slug=${manga.slug}&chapter_id=${latestChapterId}`
                    : `./?slug=${manga.slug}`;

                const chaptersData = manga.chapters?.[0]?.server_data || [];
                const chapterIndex = chaptersData.findIndex(
                    (ch) => ch.chapter_api_data.split("/").pop() === latestChapterId
                );
                const chapter = chapterIndex !== -1 ? chaptersData[chapterIndex] : null;
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
                        <i class="fas fa-star"></i>
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
        } catch {
            followedMangas = [];
        }
    }
}

function saveReadChapter(chapterId) {
    if (!chapterId || !currentSlug) return;

    if (!readChapters[currentSlug]) readChapters[currentSlug] = [];
    if (!readChapters[currentSlug].includes(chapterId)) {
        readChapters[currentSlug].push(chapterId);
        localStorage.setItem("readChapters", JSON.stringify(readChapters));
    }

    const mangaIndex = followedMangas.findIndex((m) => m.slug === currentSlug);
    if (mangaIndex !== -1) {
        followedMangas[mangaIndex].chapterId = chapterId;
        saveFollowedMangas();
    }
}

function saveFollowedMangas() {
    localStorage.setItem("followedMangas", JSON.stringify(followedMangas));
}

async function handleSearchResults(keyword) {
    if (!keyword || typeof keyword !== "string") {
        elements.mangaContent.innerHTML = '<div class="alert alert-info">Vui lòng nhập từ khóa tìm kiếm hợp lệ.</div>';
        return;
    }

    if (!elements.mangaContent || !elements.chapterNavigation) return;

    elements.chapterNavigation.style.display = "none";
    applyDoubleReadingLayout(false);
    elements.mangaTitle.textContent = `Kết quả tìm kiếm: "${keyword}"`;
    elements.followMangaBtn.style.display = "none";

    try {
        elements.mangaContent.innerHTML = '<div class="text-center my-5"><div class="spinner-border"></div></div>';

        const response = await fetch(
            `https://otruyenapi.com/v1/api/tim-kiem?keyword=${encodeURIComponent(keyword)}`,
            {
                headers: {
                    Accept: "application/json",
                    "Content-Type": "application/json",
                },
            }
        );

        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

        const data = await response.json();

        if (data.status === "success" && data.data?.items?.length > 0) {
            const resultsHtml = data.data.items
                .map((manga) => {
                    const thumbnail = manga.thumb_url
                        ? `${data.data.APP_DOMAIN_CDN_IMAGE}/uploads/comics/${manga.thumb_url}`
                        : "https://via.placeholder.com/200x300?text=No+Image";
                    const date = manga.updatedAt ? new Date(manga.updatedAt).toLocaleDateString() : "N/A";
                    const authors = Array.isArray(manga.author) ? manga.author.join(", ") : "Unknown";
                    const chapterCount = manga.chapters?.[0]?.server_data?.length || 0;
                    const isFollowed = followedMangas.some((m) => m.slug === manga.slug);

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
    fetch(`https://otruyenapi.com/v1/api/truyen-tranh/${encodeURIComponent(slug)}`, {
        headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
        },
    })
        .then((response) => response.json())
        .then((data) => {
            if (data?.data?.item?.chapters?.[0]?.server_data) {
                const firstChapter = data.data.item.chapters[0].server_data[0];
                const chapterId = firstChapter.chapter_api_data.split("/").pop();
                window.location.href = `./?slug=${slug}&chapter_id=${chapterId}`;
            } else {
                window.location.href = `./?slug=${slug}`;
            }
        })
        .catch(() => {
            window.location.href = `./?slug=${slug}`;
        });
}

function setupWarmthSlider() {
    const savedWarmth = localStorage.getItem("warmthValue");
    if (savedWarmth !== null) elements.warmthSlider.value = savedWarmth;

    elements.warmthSlider.addEventListener("input", () => {
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