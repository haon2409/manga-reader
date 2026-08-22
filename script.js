// ===== Globals =====
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

// ===== DOM =====
const el = {
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

// ===== Helpers =====
const helpers = {
    getBasePath: () => {
        const segments = window.location.pathname.split("/").filter(Boolean);
        return segments[0] === "manga-reader" ? "/manga-reader/" : "./";
    },
    formatChapterText: (ch) => `Chapter ${ch.number}${ch.title?.trim() ? `: ${ch.title}` : ""}`,
    getReadingMode: () => localStorage.getItem("readingMode") || "scroll",
    showLoading: (show) => (el.loading.style.display = show ? "block" : "none"),
    showError: (msg) => {
        el.errorMessage.style.display = "block";
        el.errorText.textContent = msg;
        el.mangaContent.style.display = "none";
    },
    hideError: () => (el.errorMessage.style.display = "none"),
    updateFollowButton: (slug) => {
        const isFollowed = followedMangas.some((m) => m.slug === slug);
        document.querySelectorAll(`.follow-btn[data-slug="${slug}"], #follow-manga-btn[data-slug="${slug}"]`).forEach((btn) => {
            btn.classList.toggle("followed", isFollowed);
            btn.innerHTML = isFollowed ? '<i class="fas fa-star"></i>' : '<i class="far fa-star"></i>';
        });
    },
};

// ===== Init =====
document.addEventListener("DOMContentLoaded", () => {
    const brand = document.querySelector(".navbar-brand");
    if (brand) brand.href = helpers.getBasePath();

    loadFollowedMangas();
    loadReadHistory();
    restoreReadingMode();
    parseUrlParameters();
    setupEventListeners();
    setupWarmthSlider();

    el.searchForm?.addEventListener("submit", (e) => {
        e.preventDefault();
        const keyword = el.searchInput.value.trim();
        if (keyword) handleSearchResults(keyword);
    });
});

// ===== Touch swipe =====
document.addEventListener("touchstart", (e) => {
    window.touchStartX = e.touches[0].clientX;
    window.touchStartTime = Date.now();
});
document.addEventListener("touchmove", (e) => {
    if (window.touchStartX < 20 || window.touchStartX > window.innerWidth - 20) e.preventDefault();
}, { passive: false });
document.addEventListener("touchend", (e) => {
    const deltaX = e.changedTouches[0].clientX - window.touchStartX;
    const duration = Date.now() - window.touchStartTime;
    if (window.touchStartX < 20 && deltaX > 50 && duration < 500) el.prevChapterBtn.click();
    else if (window.touchStartX > window.innerWidth - 20 && deltaX < -50 && duration < 500) el.nextChapterBtn.click();
});

// ===== URL & State =====
function parseUrlParameters() {
    const params = new URLSearchParams(window.location.search);
    currentSlug = params.get("slug") || "";
    currentChapterId = params.get("chapter_id") || "";
    isNewest = params.get("newest") === "true";

    if (currentSlug) {
        el.mangaTitle.textContent = currentSlug.split("-").map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");
        el.followMangaBtn.style.display = "inline-block";
        el.followMangaBtn.dataset.slug = currentSlug;
        helpers.updateFollowButton(currentSlug);
        loadMangaContent(currentSlug);
    } else {
        el.followMangaBtn.style.display = "none";
        showEmptyState();
    }
}

function toggleFollowManga(slug, title, chapterId = null) {
    const idx = followedMangas.findIndex((m) => m.slug === slug);
    if (idx === -1) followedMangas.push({ slug, title, chapterId });
    else followedMangas.splice(idx, 1);
    saveFollowedMangas();
    helpers.updateFollowButton(slug);
    if (!currentSlug) showEmptyState();
}

// ===== Event Listeners =====
function setupEventListeners() {
    el.prevChapterBtn.addEventListener("click", (e) => {
        e.preventDefault();
        if (currentChapterIndex > 0) navigateToChapter(chapters[currentChapterIndex - 1].id);
    });
    el.nextChapterBtn.addEventListener("click", (e) => {
        e.preventDefault();
        if (currentChapterIndex < chapters.length - 1 && currentChapterIndex !== -1)
            navigateToChapter(chapters[currentChapterIndex + 1].id);
    });
    el.toggleNavPositionBtn.addEventListener("click", (e) => {
        e.preventDefault();
        if (!document.body.classList.contains("double-reading-mode")) toggleNavPosition();
    });
    loadNavPositionFromStorage();

    document.addEventListener("keydown", (e) => {
        const mode = helpers.getReadingMode();
        if (mode === "double") {
            if (e.key === "ArrowLeft") document.querySelector(".page-nav-left")?.click();
            if (e.key === "ArrowRight") document.querySelector(".page-nav-right")?.click();
        }
        if (e.key.toLowerCase() === "p" && !el.prevChapterBtn.disabled) el.prevChapterBtn.click();
        if (e.key.toLowerCase() === "n" && !el.nextChapterBtn.disabled) el.nextChapterBtn.click();
    });

    document.addEventListener("click", (e) => {
        const followBtn = e.target.closest(".follow-btn");
        const unfollowBtn = e.target.closest(".unfollow-btn");
        if (followBtn) {
            toggleFollowManga(
                followBtn.dataset.slug || currentSlug,
                followBtn.dataset.title || el.mangaTitle.textContent,
                followBtn.dataset.chapterId || currentChapterId
            );
        }
        if (unfollowBtn) {
            const manga = followedMangas.find((m) => m.slug === unfollowBtn.dataset.slug);
            if (manga) toggleFollowManga(manga.slug, manga.title, manga.chapterId);
        }
    });

    const warmthToggle = document.querySelector(".warmth-toggle");
    const warmthControl = document.querySelector(".warmth-control");
    warmthToggle?.addEventListener("click", (e) => {
        e.preventDefault();
        if (!isVerticalNav) warmthControl?.classList.toggle("show");
    });
    document.addEventListener("click", (e) => {
        if (!isVerticalNav && warmthControl && !warmthControl.contains(e.target))
            warmthControl.classList.remove("show");
    });

    document.querySelectorAll(".segmented-control .segment").forEach((btn) => {
        btn.addEventListener("click", () => {
            document.querySelectorAll(".segmented-control .segment").forEach((b) => b.classList.remove("active"));
            btn.classList.add("active");
            localStorage.setItem("readingMode", btn.dataset.mode);
            currentDoublePageIndex = 0;
            renderPages();
        });
    });
}

// ===== Reading Mode =====
function restoreReadingMode() {
    const saved = helpers.getReadingMode();
    document.querySelectorAll(".segmented-control .segment").forEach((btn) =>
        btn.classList.toggle("active", btn.dataset.mode === saved)
    );
    applyDoubleReadingLayout();
}

function applyDoubleReadingLayout(enabled) {
    const isEnabled = enabled !== undefined ? enabled : helpers.getReadingMode() === "double" && !!currentSlug;
    document.body.classList.toggle("double-reading-mode", isEnabled);
    if (el.toggleNavPositionBtn) el.toggleNavPositionBtn.style.display = isEnabled ? "none" : "";
}

// ===== Core Load =====
async function loadMangaContent(slug) {
    try {
        helpers.showLoading(true);
        el.mangaContent.style.display = "none";
        helpers.hideError();
        el.chapterNavigation.style.display = "flex";
        applyDoubleReadingLayout();

        currentSlug = slug;
        await fetchMangaInfo(slug);

        if (!chapters?.length) throw new Error("No chapters available");

        if (isNewest) currentChapterId = chapters[chapters.length - 1].id;
        else if (!currentChapterId || !chapters.some((c) => c.id === currentChapterId))
            currentChapterId = chapters[0].id;

        currentChapterIndex = chapters.findIndex((c) => c.id === currentChapterId);

        const url = new URL(window.location.href);
        url.searchParams.set("slug", slug);
        url.searchParams.set("chapter_id", currentChapterId);
        if (isNewest) url.searchParams.set("newest", "true");
        else url.searchParams.delete("newest");
        window.history.replaceState({}, "", url);

        await fetchChapterContent(slug, currentChapterId);
        isNewest = false;
        updateNavigation();
        helpers.updateFollowButton(currentSlug);
        applyWarmthFromStorage();
    } catch (err) {
        console.error(err);
        helpers.showError(err.message || "Unable to load manga content.");
    } finally {
        helpers.showLoading(false);
    }
}

async function fetchMangaInfo(slug) {
    const res = await fetch(`https://otruyenapi.com/v1/api/truyen-tranh/${encodeURIComponent(slug)}`, {
        headers: { Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!data?.data?.item) throw new Error("Invalid API response");

    el.mangaTitle.textContent = data.data.item.name || "Unknown Manga";
    chapters = data.data.item.chapters[0].server_data.map((ch) => ({
        id: ch.chapter_api_data.split("/").pop(),
        number: ch.chapter_name,
        title: ch.chapter_title || "",
    }));
    updateCurrentChapterIndex();
    populateChapterDropdown();
}

function updateCurrentChapterIndex() {
    if (!chapters?.length) {
        currentChapterIndex = -1;
        return;
    }
    currentChapterIndex = chapters.findIndex((c) => c.id === currentChapterId);
    if (currentChapterIndex === -1 && currentChapterId) {
        currentChapterIndex = 0;
        currentChapterId = chapters[0].id;
        const url = new URL(window.location.href);
        url.searchParams.set("chapter_id", currentChapterId);
        window.history.replaceState({}, "", url);
    }
}

async function fetchMangaDetails(slug) {
    try {
        const res = await fetch(`https://otruyenapi.com/v1/api/truyen-tranh/${encodeURIComponent(slug)}`, {
            headers: { Accept: "application/json" },
        });
        if (!res.ok) throw new Error(`API ${res.status}`);
        const data = await res.json();
        if (!data?.data?.item) throw new Error("Invalid structure");

        const m = data.data.item;
        const cdn = data.data.APP_DOMAIN_CDN_IMAGE || "https://sv1.otruyencdn.com";
        return {
            slug: m.slug,
            name: m.name || "Unknown",
            author: Array.isArray(m.author) ? m.author.join(", ") : "Unknown",
            thumbnail: `${cdn}/uploads/comics/${m.thumb_url}`,
            status: m.status || "Unknown",
            chapterCount: m.chapters?.[0]?.server_data?.length || 0,
            updatedAt: m.updatedAt ? new Date(m.updatedAt).toLocaleDateString() : "N/A",
            chapters: m.chapters || [],
        };
    } catch {
        return {
            slug,
            name: "Error Loading",
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
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    try {
        const res = await fetch(`https://sv1.otruyencdn.com/v1/api/chapter/${chapterId}`, {
            headers: { Accept: "application/json" },
            signal: controller.signal
        });
        clearTimeout(timeoutId);
        
        if (!res.ok) throw new Error(`API ${res.status}`);
        const data = await res.json();
        if (data.status !== "success" || !data.data) throw new Error("Invalid response");

        const { domain_cdn, item } = data.data;
        const images = item?.chapter_image || [];
        if (!images.length) throw new Error("No images found");

        currentChapterPages = images.map((img, i) => ({
            id: i + 1,
            url: `${domain_cdn}/${item.chapter_path}/${img.image_file || ""}`,
        }));
    } catch (err) {
        clearTimeout(timeoutId);
        const errorMsg = err.name === 'AbortError' ? 'Timeout 5s' : err.message;
        const errorImgUrl = `https://placehold.co/800x1200/333333/ffffff?text=${encodeURIComponent('Lỗi tải dữ liệu:\n' + errorMsg)}`;
        
        // Tạo 2 trang giả để lấp đầy giao diện chế độ Trang đôi
        currentChapterPages = [
            { id: 1, url: errorImgUrl },
            { id: 2, url: errorImgUrl }
        ];
    }

    currentDoublePageIndex = openDoublePageAtEnd && helpers.getReadingMode() === "double"
        ? Math.max(0, currentChapterPages.length - 2)
        : 0;
    openDoublePageAtEnd = false;
    renderPages();

    if (currentChapterIndex !== -1) {
        document.title = `Chap ${chapters[currentChapterIndex].number} - ${el.mangaTitle.textContent}`;
    }
}

// ===== Render =====
function renderPages() {
    const mode = helpers.getReadingMode();
    applyDoubleReadingLayout(mode === "double" && !!currentSlug);
    if (mode === "scroll") displayMangaPages(currentChapterPages);
    else displayDoublePages();
    applyWarmthFromStorage();
}

function displayMangaPages(pages) {
    if (!el.mangaContent) return;
    el.mangaContent.innerHTML = "";
    if (!pages?.length) {
        showEmptyState("No pages found");
        return;
    }
    const container = document.createElement("div");
    container.className = "manga-pages-container";
    pages.forEach((page, i) => {
        const wrap = document.createElement("div");
        wrap.className = "manga-page-container";
        wrap.dataset.pageNumber = i + 1;
        const img = document.createElement("img");
        img.src = page.url;
        img.alt = `Page ${page.id}`;
        img.className = "manga-page";
        img.loading = "lazy";
        img.onerror = () => {
            img.onerror = null;
            img.src = "https://placehold.co/800x1200/333333/ffffff?text=Image+Error";
        };
        const num = document.createElement("div");
        num.className = "page-number badge bg-secondary";
        num.textContent = `Page ${i + 1}`;
        wrap.append(img, num);
        container.appendChild(wrap);
    });
    el.mangaContent.appendChild(container);
    el.mangaContent.style.display = "block";
}

function displayDoublePages() {
    if (!el.mangaContent) return;
    el.mangaContent.style.display = "block";
    el.mangaContent.innerHTML = "";

    if (!currentChapterPages?.length) {
        el.mangaContent.innerHTML = "<p class='text-center my-5'>Không có dữ liệu trang truyện.</p>";
        return;
    }

    currentDoublePageIndex = parseInt(currentDoublePageIndex, 10) || 0;
    const container = document.createElement("div");
    container.className = "double-page-container";
    const wrapper = document.createElement("div");
    wrapper.className = "double-page-wrapper";

    if (currentChapterPages[currentDoublePageIndex]) {
        const imgL = document.createElement("img");
        imgL.src = currentChapterPages[currentDoublePageIndex].url;
        imgL.className = "manga-page";
        wrapper.appendChild(imgL);
    }
    if (currentChapterPages[currentDoublePageIndex + 1]) {
        const imgR = document.createElement("img");
        imgR.src = currentChapterPages[currentDoublePageIndex + 1].url;
        imgR.className = "manga-page";
        wrapper.appendChild(imgR);
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
            el.prevChapterBtn.click();
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
            el.nextChapterBtn.click();
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

    container.append(btnPrev, wrapper, btnNext);
    el.mangaContent.appendChild(container);
}

// ===== Chapter UI =====
function populateChapterDropdown() {
    el.chapterList.innerHTML = "";
    if (!chapters?.length) {
        el.chapterList.innerHTML = "<li>No chapters available</li>";
        return;
    }
    const idx = currentChapterIndex !== -1 ? currentChapterIndex : 0;
    el.chapterDropdown.textContent = `Chap ${chapters[idx].number}`;

    [...chapters].reverse().forEach((ch) => {
        const li = document.createElement("li");
        const a = document.createElement("a");
        a.className = "dropdown-item";
        a.href = "#";
        a.textContent = helpers.formatChapterText(ch);
        if (readChapters[currentSlug]?.includes(ch.id)) a.classList.add("read");
        if (ch.id === currentChapterId) {
            a.classList.add("active");
            a.innerHTML = `<i class="fas fa-bookmark me-2"></i>${helpers.formatChapterText(ch)}`;
        }
        a.addEventListener("click", (e) => {
            e.preventDefault();
            navigateToChapter(ch.id);
        });
        li.appendChild(a);
        el.chapterList.appendChild(li);
    });

    updateDropdownPosition();
    el.chapterDropdown.addEventListener("shown.bs.dropdown", () => {
        el.chapterList.querySelector(".dropdown-item.active")?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, { once: true });
}

function navigateToChapter(chapterId) {
    if (!chapterId) {
        helpers.showError("Thiếu ID chapter");
        return;
    }
    if (chapterId === currentChapterId) return;
    const url = new URL(window.location.href);
    url.searchParams.set("slug", currentSlug);
    url.searchParams.set("chapter_id", chapterId);
    url.searchParams.delete("newest");
    window.history.pushState({}, "", url);
    currentChapterId = chapterId;
    loadMangaContent(currentSlug);
}

function updateNavigation() {
    el.prevChapterBtn.disabled = currentChapterIndex <= 0;
    el.prevChapterBtn.title = currentChapterIndex > 0
        ? `Previous (${chapters[currentChapterIndex - 1].number})`
        : "No Previous";
    el.nextChapterBtn.disabled = currentChapterIndex >= chapters.length - 1 || currentChapterIndex === -1;
    el.nextChapterBtn.title = currentChapterIndex < chapters.length - 1 && currentChapterIndex !== -1
        ? `Next (${chapters[currentChapterIndex + 1].number})`
        : "No Next";

    if (currentChapterId) saveReadChapter(currentChapterId);
    document.title = currentChapterIndex !== -1
        ? `Chapter ${chapters[currentChapterIndex].number} - ${el.mangaTitle.textContent}`
        : "Manga Reader";
    if (el.chapterCount) el.chapterCount.textContent = chapters.length || "No chapters";
}

// ===== Nav Position =====
function toggleNavPosition() {
    isVerticalNav = !isVerticalNav;
    applyNavPositionStyles();
    localStorage.setItem("isVerticalNav", isVerticalNav);
    updateNavPositionIcon();
    updateDropdownPosition();
    document.querySelector(".warmth-control")?.classList.remove("show");
}

function loadNavPositionFromStorage() {
    const saved = localStorage.getItem("isVerticalNav");
    if (saved !== null) isVerticalNav = saved === "true";
    applyNavPositionStyles();
    updateNavPositionIcon();
    updateDropdownPosition();
}

function applyNavPositionStyles() {
    el.chapterNavigation.classList.remove("nav-vertical", "nav-horizontal");
    el.chapterNavigation.classList.add(isVerticalNav ? "nav-vertical" : "nav-horizontal");
}

function updateNavPositionIcon() {
    el.toggleNavPositionBtn.title = isVerticalNav ? "Switch to horizontal" : "Switch to vertical";
    el.toggleNavPositionBtn.innerHTML = isVerticalNav
        ? '<i class="fas fa-grip-horizontal"></i>'
        : '<i class="fas fa-grip-vertical"></i>';
}

function updateDropdownPosition() {
    const menu = document.querySelector(".dropdown-menu");
    if (!menu) return;
    menu.classList.remove("dropdown-menu-end", "dropdown-menu-start", "dropdown-menu-up");
    menu.classList.add(isVerticalNav ? "dropdown-menu-start" : "dropdown-menu-up");
}

// ===== Storage =====
function loadReadHistory() {
    try {
        readChapters = JSON.parse(localStorage.getItem("readChapters") || "{}") || {};
    } catch {
        readChapters = {};
    }
}

function saveReadChapter(chapterId) {
    if (!chapterId || !currentSlug) return;
    if (!readChapters[currentSlug]) readChapters[currentSlug] = [];
    if (!readChapters[currentSlug].includes(chapterId)) {
        readChapters[currentSlug].push(chapterId);
        localStorage.setItem("readChapters", JSON.stringify(readChapters));
    }
    const idx = followedMangas.findIndex((m) => m.slug === currentSlug);
    if (idx !== -1) {
        followedMangas[idx].chapterId = chapterId;
        saveFollowedMangas();
    }
}

function loadFollowedMangas() {
    try {
        followedMangas = JSON.parse(localStorage.getItem("followedMangas") || "[]");
    } catch {
        followedMangas = [];
    }
}

function saveFollowedMangas() {
    localStorage.setItem("followedMangas", JSON.stringify(followedMangas));
}

// ===== Empty / Search =====
async function showEmptyState(message = "No manga content to display") {
    helpers.showLoading(false);
    applyDoubleReadingLayout(false);
    el.mangaContent.style.display = "block";
    el.chapterNavigation.style.display = "none";
    el.followMangaBtn.style.display = "none";

    if (!followedMangas.length) {
        el.mangaContent.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-book"></i>
                <h3>Welcome to Manga Reader</h3>
                <p>${message}</p>
                <p>Enter a valid manga URL to begin reading.</p>
                <p><a href="./?slug=dao-hai-tac&chapter_id=65901d64ac52820f564b373e" target="_blank">Example</a></p>
            </div>`;
        return;
    }

    el.mangaContent.innerHTML = `<div class="text-center my-5"><div class="spinner-border"></div></div>`;
    const details = await Promise.all(followedMangas.map((m) => fetchMangaDetails(m.slug)));

    const html = details.map((manga) => {
        const saved = followedMangas.find((m) => m.slug === manga.slug);
        const url = saved?.chapterId ? `./?slug=${manga.slug}&chapter_id=${saved.chapterId}` : `./?slug=${manga.slug}`;
        const chaptersData = manga.chapters?.[0]?.server_data || [];
        const chIdx = chaptersData.findIndex((ch) => ch.chapter_api_data.split("/").pop() === saved?.chapterId);
        const readingText = chIdx !== -1
            ? `Đang đọc: <span class="highlight-text">${chIdx + 1}${chaptersData[chIdx]?.chapter_title ? ` - ${chaptersData[chIdx].chapter_title}` : ""}</span>`
            : "";

        return `
            <div class="followed-manga-card">
                <img src="${manga.thumbnail}" alt="${manga.name}" class="followed-manga-thumbnail"
                     onerror="this.src='https://via.placeholder.com/80x120?text=Error'">
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
            </div>`;
    }).join("");

    el.mangaContent.innerHTML = `
        <div class="followed-mangas">
            <h4 class="mb-4">Truyện theo dõi</h4>
            <div class="followed-mangas-grid">${html}</div>
        </div>`;
}

async function handleSearchResults(keyword) {
    if (!keyword) {
        el.mangaContent.innerHTML = '<div class="alert alert-info">Vui lòng nhập từ khóa hợp lệ.</div>';
        return;
    }
    el.chapterNavigation.style.display = "none";
    applyDoubleReadingLayout(false);
    el.mangaTitle.textContent = `Kết quả tìm kiếm: "${keyword}"`;
    el.followMangaBtn.style.display = "none";
    el.mangaContent.innerHTML = '<div class="text-center my-5"><div class="spinner-border"></div></div>';

    try {
        const res = await fetch(`https://otruyenapi.com/v1/api/tim-kiem?keyword=${encodeURIComponent(keyword)}`, {
            headers: { Accept: "application/json" },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();

        if (data.status === "success" && data.data?.items?.length) {
            const html = data.data.items.map((manga) => {
                const thumb = manga.thumb_url
                    ? `${data.data.APP_DOMAIN_CDN_IMAGE}/uploads/comics/${manga.thumb_url}`
                    : "https://via.placeholder.com/200x300?text=No+Image";
                const isFollowed = followedMangas.some((m) => m.slug === manga.slug);
                return `
                    <div class="card mb-3 search-result" style="max-width:800px;margin:auto">
                        <div class="row g-0">
                            <div class="col-md-3">
                                <img src="${thumb}" class="img-fluid rounded-start" alt="${manga.name}"
                                     style="height:200px;object-fit:cover"
                                     onerror="this.src='https://via.placeholder.com/200x300?text=Error'">
                            </div>
                            <div class="col-md-9">
                                <div class="card-body">
                                    <div class="d-flex align-items-center">
                                        <h5 class="card-title me-2">
                                            <a href="#" onclick="handleMangaClick('${manga.slug}');return false" class="text-decoration-none text-info">${manga.name}</a>
                                        </h5>
                                        <button class="btn btn-sm btn-outline-info follow-btn ${isFollowed ? "followed" : ""}"
                                                data-slug="${manga.slug}" data-title="${manga.name}">
                                            ${isFollowed ? '<i class="fas fa-star"></i>' : '<i class="far fa-star"></i>'}
                                        </button>
                                    </div>
                                    <p class="card-text">
                                        <small class="text-muted">Author: <span class="highlight-text">${Array.isArray(manga.author) ? manga.author.join(", ") : "Unknown"}</span></small><br>
                                        <small class="text-muted">Status: <span class="highlight-text">${manga.status || "Unknown"}</span></small><br>
                                        <small class="text-muted">Chapters: <span class="highlight-text">${manga.chapters?.[0]?.server_data?.length || 0}</span></small><br>
                                        <small class="text-muted">Updated: <span class="highlight-text">${manga.updatedAt ? new Date(manga.updatedAt).toLocaleDateString() : "N/A"}</span></small>
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>`;
            }).join("");
            el.mangaContent.innerHTML = `<div class="container">${html}</div>`;
        } else {
            el.mangaContent.innerHTML = `<div class="alert alert-info"><i class="fas fa-info-circle me-2"></i>No results for "${keyword}"</div>`;
        }
    } catch (err) {
        console.error(err);
        el.mangaContent.innerHTML = `<div class="alert alert-danger"><i class="fas fa-exclamation-triangle me-2"></i>Error searching. Please try again.</div>`;
    }
}

function handleMangaClick(slug) {
    fetch(`https://otruyenapi.com/v1/api/truyen-tranh/${encodeURIComponent(slug)}`, {
        headers: { Accept: "application/json" },
    })
        .then((r) => r.json())
        .then((data) => {
            const first = data?.data?.item?.chapters?.[0]?.server_data?.[0];
            const chapterId = first ? first.chapter_api_data.split("/").pop() : null;
            window.location.href = chapterId ? `./?slug=${slug}&chapter_id=${chapterId}` : `./?slug=${slug}`;
        })
        .catch(() => (window.location.href = `./?slug=${slug}`));
}

// ===== Warmth =====
function setupWarmthSlider() {
    const saved = localStorage.getItem("warmthValue");
    if (saved !== null) el.warmthSlider.value = saved;
    el.warmthSlider.addEventListener("input", () => {
        applyWarmth(el.warmthSlider.value);
        localStorage.setItem("warmthValue", el.warmthSlider.value);
    });
}

function applyWarmth(val) {
    const sepia = val * 1;
    const brightness = 100 - val * 0.15;
    const hue = val * 0.2;
    const contrast = 100 - val * 0.1;
    const r = Math.round(255 - (255 - 212) * (val / 100));
    const g = Math.round(255 - (255 - 160) * (val / 100));
    const b = Math.round(255 - (255 - 23) * (val / 100));
    el.warmthSlider.style.background = `rgb(${r},${g},${b})`;
    document.querySelectorAll(".manga-page").forEach((p) => {
        p.style.filter = `sepia(${sepia}%) brightness(${brightness}%) hue-rotate(${hue}deg) contrast(${contrast}%)`;
    });
}

function applyWarmthFromStorage() {
    const saved = localStorage.getItem("warmthValue");
    if (saved !== null) {
        el.warmthSlider.value = saved;
        applyWarmth(saved);
    }
}