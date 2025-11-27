const STORAGE_KEY = 'hiddenNovelsMap';

// --- 1. SITE-SPECIFIC CONFIGURATION MAP ---
// Add new websites and their corresponding selectors here.
const SITE_CONFIGS = {
    // Configuration for the current site
    'twkan.com': {
        // List View Selectors
        NOVEL_SELECTOR: 'li:has(a[href*="/book/"])',
        NOVEL_LINK_SELECTOR: 'a[href*="/book/"]',
        NOVEL_TITLE_SELECTOR: 'h3 a',
        LIST_BUTTON_CONTAINER_SELECTOR: '.newright', // Where to append buttons on list view
        // Novel Page Selectors
        SINGLE_NOVEL_CONTAINER_SELECTOR: '.addbtn', // Where to place the main button bar
        MAIN_PAGE_CONTENT_SELECTOR: '.bookbox', // General container for single novel page
        SINGLE_NOVEL_TITLE_SELECTOR: 'div.booknav2 h1 a',
        // Chapter Page Selectors
        CHAPTER_PAGE_CONTENT_SELECTOR: '#txtcontent0', // Primary chapter content container
        CHAPTER_BREADCRUMB_SELECTOR: '.bread', // To extract novel link/title
        CHAPTER_TOOLS_CONTAINER_SELECTOR: '.tools ul', // Where to place tracking buttons
        CHAPTER_TITLE_SELECTOR: '.txtnav h1',
        CHAPTER_TOC_SELECTOR: 'li:has(.icon-mulu)' // The TOC button for injection point
    },
    
    // --- EXAMPLE FOR A NEW SITE ---
    // 'newnovelhost.com': {
    //     NOVEL_SELECTOR: '.novel-item-card',
    //     NOVEL_LINK_SELECTOR: '.novel-item-card a.title-link',
    //     NOVEL_TITLE_SELECTOR: '.novel-item-card h4',
    //     LIST_BUTTON_CONTAINER_SELECTOR: '.novel-item-actions',
    //     
    //     SINGLE_NOVEL_CONTAINER_SELECTOR: '.novel-info-header',
    //     MAIN_PAGE_CONTENT_SELECTOR: '.novel-main-page-wrapper', 
    //     SINGLE_NOVEL_TITLE_SELECTOR: 'h1.novel-title',
    //     
    //     CHAPTER_PAGE_CONTENT_SELECTOR: '#chapter-text-area',
    //     CHAPTER_BREADCRUMB_SELECTOR: '.chapter-breadcrumb',
    //     CHAPTER_TOOLS_CONTAINER_SELECTOR: '.chapter-nav-controls',
    //     CHAPTER_TITLE_SELECTOR: 'h2.chapter-title',
    //     CHAPTER_TOC_SELECTOR: '.nav-btn-toc'
    // }
};

// --- 2. GLOBAL CONSTANTS ---
const UNMARK_CATEGORY = 'unmarked'; 
const CATEGORIES = {
    READING: { label: 'Reading', color: '#4CAF50' }, 
    DISLIKED: { label: 'Disliked', color: '#ff4d4f' },
    HIATUS: { label: 'Hiatus', color: '#ffc107' },
    COMPLETED: { label: 'Completed', color: '#20c997' }
};
const HIDDEN_CATEGORIES = ['disliked', 'reading', 'hiatus', 'completed'];


// --- 3. CONFIGURATION HANDLER ---

/**
 * Gets the configuration object based on the current hostname.
 */
function getCurrentSiteConfig() {
    const hostname = window.location.hostname.replace('www.', ''); // Normalize hostname
    // Try to find a direct match
    if (SITE_CONFIGS[hostname]) {
        return SITE_CONFIGS[hostname];
    }
    // Simple check for domains that might be configured by a subdomain
    const domainParts = hostname.split('.');
    if (domainParts.length >= 2) {
        const rootDomain = domainParts.slice(domainParts.length - 2).join('.');
        if (SITE_CONFIGS[rootDomain]) {
            return SITE_CONFIGS[rootDomain];
        }
    }
    
    return null; // Return null if the site is not supported
}


// --- Storage Functions ---
async function getHiddenNovelsMap() {
    return new Promise((resolve) => {
        chrome.storage.local.get([STORAGE_KEY], (result) => {
            const novelsArray = result[STORAGE_KEY] || [];
            const novelsMap = new Map(novelsArray.map(item => {
                const category = item.category || 'disliked';
                return [item.url, { ...item, category, title: item.title }];
            }));
            resolve(novelsMap);
        });
    });
}
async function saveHiddenNovelsMap(novelsMap) {
    const novelsArray = Array.from(novelsMap.values());
    return new Promise((resolve) => {
        chrome.storage.local.set({ [STORAGE_KEY]: novelsArray }, () => {
            resolve();
        });
    });
}


// --- Hiding and UI Functions ---
const createCompactButton = (novelElement, novelUrl, novelTitle, text, categoryKey, color, isDisabled = false, isSinglePage = false, isChapterPage = false) => {
    const button = document.createElement('a');
    button.className = `btn btn-novel-${categoryKey} compact-btn`; 
    button.dataset.category = categoryKey; 
    
    if (isDisabled) {
        button.setAttribute('aria-disabled', 'true');
        button.style.pointerEvents = 'none';
    }

    button.textContent = text; 
    
    if (!isDisabled) {
        button.addEventListener('click', () => {
            let chapterData = {};
            if (isChapterPage && categoryKey !== UNMARK_CATEGORY) {
                chapterData.currentChapterUrl = window.location.href.split('#')[0].split('?')[0];
                chapterData.currentChapterTitle = document.querySelector('.txtnav h1')?.textContent.trim() || 'Unknown Chapter'; 
            }
            
            handleCategorizeClick(novelElement, novelUrl, novelTitle, categoryKey, isSinglePage, isChapterPage, chapterData);
        });
    }
    return button;
};

async function handleCategorizeClick(novelElement, url, title, categoryKey, isSinglePage = false, isChapterPage = false, chapterData = {}) {
    if (!url || !title) return;

    const currentNovelsMap = await getHiddenNovelsMap();
    const existingNovelData = currentNovelsMap.get(url);


    if (categoryKey === UNMARK_CATEGORY) {
        const deleted = currentNovelsMap.delete(url);
        if (deleted) {
            console.log(`[Novel Hider] Removed category for: ${title} (${url})`);
        }
    } else if (categoryKey) {
        const novelData = { 
            url: url, 
            title: title, 
            category: categoryKey, 
            currentChapterUrl: existingNovelData?.currentChapterUrl,
            currentChapterTitle: existingNovelData?.currentChapterTitle,
        };
        const shouldTrackChapter = categoryKey === 'reading' || categoryKey === 'hiatus';

        if (isChapterPage && shouldTrackChapter && chapterData.currentChapterUrl) {
            novelData.currentChapterUrl = chapterData.currentChapterUrl;
            novelData.currentChapterTitle = chapterData.currentChapterTitle;
            novelData.lastUpdated = Date.now(); 
            console.log(`[Novel Hider] Tracking chapter for ${categoryKey}: ${chapterData.currentChapterTitle}`);
        } else if (!isChapterPage && shouldTrackChapter) {
            console.log(`[Novel Hider] Retained chapter tracking data: ${novelData.currentChapterTitle}`);
        } else {
            delete novelData.currentChapterUrl;
            delete novelData.currentChapterTitle;
        }
        
        novelData.lastUpdated = Date.now(); 
        currentNovelsMap.set(url, novelData); 
        console.log(`[Novel Hider] Saved novel as ${categoryKey}: ${title} (${url})`);
    } else {
        return;
    }
    
    await saveHiddenNovelsMap(currentNovelsMap);
    
    // Since this function is called on a click, we need to refresh the UI based on page type
    const config = getCurrentSiteConfig();
    if (!config) return;

    if (isSinglePage) {
        await updateNovelPageButtons(config);
    } else if (isChapterPage) {
        await updateChapterPageButtons(config);
    } else {
        // List page
        if (HIDDEN_CATEGORIES.includes(categoryKey)) {
            novelElement.style.display = 'none';
            console.log(`[Novel Hider] Hiding novel on current page: ${title}`);
        }
    }
}


// --- Chapter Page Logic ---

function extractNovelDetailsFromBreadcrumb(config) {
    const breadcrumb = document.querySelector(config.CHAPTER_BREADCRUMB_SELECTOR);
    if (!breadcrumb) return null;

    // The novel link index might change, but for twkan.com it's usually the 3rd <a> (index 2)
    const novelLinkElement = breadcrumb.querySelectorAll('a')[2];
    
    if (novelLinkElement) {
        // Get the novel's index URL and convert to the base .html format (twkan specific logic)
        const novelUrl = novelLinkElement.href.split('/index.html')[0] + '.html';
        const novelTitle = novelLinkElement.textContent.trim();
        return { novelUrl, novelTitle };
    }
    return null;
}

async function updateChapterPageButtons(config) {
    const chapterDetails = extractNovelDetailsFromBreadcrumb(config);
    const container = document.querySelector(config.CHAPTER_TOOLS_CONTAINER_SELECTOR);

    if (!container || !chapterDetails) {
        return;
    }
    
    const { novelUrl, novelTitle } = chapterDetails;
    const currentChapterUrl = window.location.href.split('#')[0].split('?')[0];

    const hiddenNovelsMap = await getHiddenNovelsMap();
    const existingNovelData = hiddenNovelsMap.get(novelUrl);
    const currentCategory = existingNovelData?.category;
    const isSaved = !!currentCategory;
    
    // Remove any previously injected button li items
    container.querySelectorAll('.chapter-hider-li').forEach(el => el.remove());
    
    // --- Create and Inject Tracking Buttons ---
    
    const categoriesToTrack = [CATEGORIES.READING, CATEGORIES.HIATUS];
    let lastInjectedLi = null;

    // Find the Table of Contents button using the selector from config
    const tocLi = container.querySelector(config.CHAPTER_TOC_SELECTOR);
    
    categoriesToTrack.forEach(data => {
        const categoryKey = data.label.toLowerCase();
        const li = document.createElement('li');
        li.className = 'chapter-hider-li';
        
        const span = document.createElement('span'); 
        span.style.cssText = 'display: inline-block;';

        // Disable button if this category is already set AND the chapter is the one being tracked
        const isDisabled = currentCategory === categoryKey && existingNovelData?.currentChapterUrl === currentChapterUrl;

        const button = createCompactButton(
            null, novelUrl, novelTitle, data.label, categoryKey, data.color, isDisabled, false, true
        );
        span.appendChild(button);
        li.appendChild(span);
        
        // Inject before the Table of Contents button for reliable placement
        if (tocLi) {
            tocLi.insertAdjacentElement('beforebegin', li);
        } else {
            container.appendChild(li);
        }
        lastInjectedLi = li;
    });

    // 3. Unmark/Untrack Button (Gray) - Clears the novel's categorization/tracking
    if (isSaved) {
        const unmarkLi = document.createElement('li');
        unmarkLi.className = 'chapter-hider-li';

        const span = document.createElement('span'); 
        span.style.cssText = 'display: inline-block;';

        const unmarkButton = createCompactButton(
            null, novelUrl, novelTitle, 'Untrack Novel', UNMARK_CATEGORY, '#6c757d', false, false, true
        );
        span.appendChild(unmarkButton);
        unmarkLi.appendChild(span);
        
        // Inject after the last injected button (Reading Here)
        if (lastInjectedLi) {
            lastInjectedLi.insertAdjacentElement('afterend', unmarkLi);
        } else if (tocLi) {
            // Fallback
            tocLi.insertAdjacentElement('beforebegin', unmarkLi);
        } else {
            container.appendChild(unmarkLi);
        }
    }
}

// --- Single Novel Page Logic ---

async function updateNovelPageButtons(config) {
    const novelUrl = window.location.href.split('#')[0].split('?')[0]; 
    const container = document.querySelector(config.SINGLE_NOVEL_CONTAINER_SELECTOR);
    const titleElement = document.querySelector(config.SINGLE_NOVEL_TITLE_SELECTOR);
    
    if (!container || !titleElement) {
        return;
    }
    
    const hiddenNovelsMap = await getHiddenNovelsMap();
    const existingNovelData = hiddenNovelsMap.get(novelUrl);
    const currentCategory = existingNovelData?.category;
    const isSaved = !!currentCategory; 
    
    const novelTitle = titleElement.textContent.trim();
    const novelElement = document.querySelector(config.MAIN_PAGE_CONTENT_SELECTOR); 

    container.parentElement.querySelectorAll('.novel-hider-buttons').forEach(el => el.remove());
    
    const horizontalButtonContainer = document.createElement('div');
    horizontalButtonContainer.className = 'novel-hider-buttons';
    horizontalButtonContainer.style.cssText = `
        display: flex;
        flex-wrap: wrap; 
        gap: 10px;
        margin-top: 10px;
        align-items: center;
        width: 100%;
        justify-content: flex-start;
    `;

    // Category buttons
    Object.keys(CATEGORIES).forEach(key => {
        const categoryKey = key.toLowerCase();
        const data = CATEGORIES[key];
        const isDisabled = currentCategory === categoryKey;

        const button = createCompactButton(
            novelElement, novelUrl, novelTitle, data.label, categoryKey, data.color, isDisabled, true, false
        ); 
        horizontalButtonContainer.appendChild(button);
    });

    // Unmark Button
    const unmarkButton = createCompactButton(
        novelElement, novelUrl, novelTitle, 'Unmark', UNMARK_CATEGORY, '#6c757d', !isSaved, true, false
    ); 
    horizontalButtonContainer.appendChild(unmarkButton); 

    container.insertAdjacentElement('afterend', horizontalButtonContainer);
}


// --- List Page Logic ---
/**
 * Processes the list view, hides categorized novels, and adds category buttons.
 * ACCEPTS CONFIG.
 */
async function processNovelList(config) {
    const hiddenNovelsMap = await getHiddenNovelsMap();
    const hiddenUrlsSet = new Set(Array.from(hiddenNovelsMap.values())
        .filter(novel => HIDDEN_CATEGORIES.includes(novel.category)) 
        .map(novel => novel.url));
    
    const novelListItems = document.querySelectorAll(config.NOVEL_SELECTOR);
    let hiddenCount = 0;

    novelListItems.forEach(item => {
        const novelLinkElement = item.querySelector(config.NOVEL_LINK_SELECTOR);
        const titleElement = item.querySelector(config.NOVEL_TITLE_SELECTOR);

        if (!novelLinkElement || !titleElement) return;

        const novelUrl = novelLinkElement.href; 
        const novelTitle = titleElement.textContent.trim();
        
        if (hiddenUrlsSet.has(novelUrl)) {
            item.style.display = 'none';
            hiddenCount++;
        }
        
        const rightContainer = item.querySelector(config.LIST_BUTTON_CONTAINER_SELECTOR);

        if (rightContainer) {
            const existingNovelData = hiddenNovelsMap.get(novelUrl);
            const isReading = existingNovelData?.category === 'reading';

            // ⭐ START OF FIX: Change container to flex-direction: column (vertical)
            const verticalButtonContainer = document.createElement('div');
            verticalButtonContainer.className = 'novel-hider-list-buttons-container';
            // Use display:flex and flex-direction:column for vertical stacking
            verticalButtonContainer.style.cssText = `
                display: flex;
                flex-direction: column; 
                gap: 5px; /* Spacing between the buttons */
                margin-top: 5px;
            `;
            // ⭐ END OF FIX

            const readingButton = createCompactButton(
                item, novelUrl, novelTitle, CATEGORIES.READING.label, 'reading', CATEGORIES.READING.color, isReading, false, false
            ); 
            
            const dislikedButton = createCompactButton(
                item, novelUrl, novelTitle, CATEGORIES.DISLIKED.label, 'disliked', CATEGORIES.DISLIKED.color, false, false, false
            ); 
            
            verticalButtonContainer.appendChild(readingButton);
            verticalButtonContainer.appendChild(dislikedButton);
            
            rightContainer.appendChild(verticalButtonContainer); // Append the vertical container
        }
    });

    console.log(`[Novel Hider] List view initialized. Total novels hidden: ${hiddenCount}.`);
}


// --- INITIALIZATION (Config Required) ---
/**
 * Determines page type and initializes the appropriate function.
 */
function initialize() {
    const config = getCurrentSiteConfig();
    
    if (!config) {
        console.log("[Novel Hider] Current site not supported by configuration. Exiting.");
        return;
    }
    
    // Check for Chapter Page (based on chapter content or tools container)
    if (document.querySelector(config.CHAPTER_PAGE_CONTENT_SELECTOR) || document.querySelector(config.CHAPTER_TOOLS_CONTAINER_SELECTOR)) {
        updateChapterPageButtons(config);
    } 
    // Check for Single Novel Page (based on main content container)
    else if (document.querySelector(config.MAIN_PAGE_CONTENT_SELECTOR) || document.querySelector(config.SINGLE_NOVEL_CONTAINER_SELECTOR)) {
        updateNovelPageButtons(config);
    } 
    // Default to List Page
    else {
        processNovelList(config);
    }
    
    // --- Console Management Functions ---
    window.NovelHider = {
        async list() {
            const currentNovelsMap = await getHiddenNovelsMap();
            console.log('[Novel Hider] Current Hidden Novels:', Array.from(currentNovelsMap.values()));
            return Array.from(currentNovelsMap.values());
        },
        async clearAll() {
            await saveHiddenNovelsMap(new Map());
            console.log('[Novel Hider] All hidden novels cleared. Reload the page.');
        },
        async remove(url) {
            const currentNovelsMap = await getHiddenNovelsMap();
            const deleted = currentNovelsMap.delete(url);
            if (deleted) {
                await saveHiddenNovelsMap(currentNovelsMap);
                console.log(`[Novel Hider] Removed URL: ${url}. Reload to see the novel reappear.`);
            } else {
                console.log(`[Novel Hider] URL not found: ${url}`);
            }
        }
    };
}


// Start the extension logic
initialize();