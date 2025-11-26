const STORAGE_KEY = 'hiddenNovelsMap';
// Selectors for List View
const NOVEL_SELECTOR = 'li:has(a[href*="/book/"])'; 
// Selectors for Single Novel Page (book/92122.html)
const SINGLE_NOVEL_CONTAINER_SELECTOR = '.addbtn'; 
const MAIN_PAGE_CONTENT_SELECTOR = '.bookbox'; 
// Selector for Chapter Reader Page (txt/92122/52029900)
const CHAPTER_PAGE_CONTENT_SELECTOR = '#txtcontent0'; 
const UNMARK_CATEGORY = 'unmarked'; 

// Define all categories for easy reference and management
const CATEGORIES = {
    READING: { label: 'Reading', color: '#4CAF50' }, 
    DISLIKED: { label: 'Disliked', color: '#ff4d4f' },
    HIATUS: { label: 'Hiatus', color: '#ffc107' },
    COMPLETED: { label: 'Completed', color: '#20c997' }
};
const HIDDEN_CATEGORIES = ['disliked', 'reading', 'hiatus', 'completed'];

// --- Storage Functions ---

/**
 * Retrieves the map of hidden novels (URL -> {url, title, category, [chapterData]}) from local storage.
 */
async function getHiddenNovelsMap() {
    return new Promise((resolve) => {
        // Using chrome.storage.local
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

/**
 * Saves the updated map of hidden novels to local storage.
 */
async function saveHiddenNovelsMap(novelsMap) {
    const novelsArray = Array.from(novelsMap.values());
    return new Promise((resolve) => {
        chrome.storage.local.set({ [STORAGE_KEY]: novelsArray }, () => {
            resolve();
        });
    });
}

// --- Hiding and UI Functions ---

// Helper function to create the compact button
const createCompactButton = (novelElement, novelUrl, novelTitle, text, categoryKey, color, isDisabled = false, isSinglePage = false, isChapterPage = false) => {
    const button = document.createElement('a');
    // ⭐ MODIFICATION: Remove inline style logic, rely on CSS classes (btn-novel-X and compact-btn)
    button.className = `btn btn-novel-${categoryKey} compact-btn`; 
    button.dataset.category = categoryKey; 
    
    // ⭐ MODIFICATION: Set aria-disabled attribute for styling via CSS
    if (isDisabled) {
        button.setAttribute('aria-disabled', 'true');
        button.style.pointerEvents = 'none'; // Keep pointer-events inline for reliability
    }

    // ⭐ MODIFICATION: Remove all cssText setting
    // The specific layout adjustments (flex-grow, margins) for List/Single/Chapter pages
    // are now handled by the specific container selectors in style.css or by default class settings.

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

/**
 * Handles the click event to categorize a specific novel.
 */
async function handleCategorizeClick(novelElement, url, title, categoryKey, isSinglePage = false, isChapterPage = false, chapterData = {}) {
    if (!url || !title) return;

    const currentNovelsMap = await getHiddenNovelsMap();
    const existingNovelData = currentNovelsMap.get(url);


    if (categoryKey === UNMARK_CATEGORY) {
        // Remove entry from storage
        const deleted = currentNovelsMap.delete(url);
        if (deleted) {
             console.log(`[Novel Hider] Removed category for: ${title} (${url})`);
        }
    } else if (categoryKey) {
        // Start with existing data or new default data
        const novelData = { 
            url: url, 
            title: title, 
            category: categoryKey, 
            // Retain existing chapter tracking data by default if it exists
            currentChapterUrl: existingNovelData?.currentChapterUrl,
            currentChapterTitle: existingNovelData?.currentChapterTitle,
        };
        
        const shouldTrackChapter = categoryKey === 'reading' || categoryKey === 'hiatus';

        // 1. If on a chapter page and marking as Reading/Hiatus, capture and save the current chapter
        if (isChapterPage && shouldTrackChapter && chapterData.currentChapterUrl) {
            novelData.currentChapterUrl = chapterData.currentChapterUrl;
            novelData.currentChapterTitle = chapterData.currentChapterTitle;
            novelData.lastUpdated = Date.now(); 
            console.log(`[Novel Hider] Tracking chapter for ${categoryKey}: ${chapterData.currentChapterTitle}`); // Explicit logging
        } 
        // 2. If on the novel page or list page and marking as Reading/Hiatus, retain previous chapter data
        else if (!isChapterPage && shouldTrackChapter) {
            // currentChapterUrl and currentChapterTitle are already carried over from existingNovelData above.
            console.log(`[Novel Hider] Retained chapter tracking data: ${novelData.currentChapterTitle}`);
        } 
        // 3. If changing to DISLIKED/COMPLETED, ensure chapter tracking data is removed
        else {
             delete novelData.currentChapterUrl;
             delete novelData.currentChapterTitle;
        }
        
        // Always set lastUpdated timestamp on categorization change
        novelData.lastUpdated = Date.now(); 
        
        console.log(`[Novel Hider] Data prepared for saving (check chapter tracking):`, novelData);

        currentNovelsMap.set(url, novelData); 
        console.log(`[Novel Hider] Saved novel as ${categoryKey}: ${title} (${url})`);
    } else {
        return;
    }
    
    await saveHiddenNovelsMap(currentNovelsMap);
    
    // Refresh the UI for the clicked element
    if (isSinglePage) {
        await updateNovelPageButtons();
    } else if (isChapterPage) {
        // Refresh buttons on the chapter page
        await updateChapterPageButtons();
    } else {
        // List page
        if (HIDDEN_CATEGORIES.includes(categoryKey)) {
            novelElement.style.display = 'none';
             console.log(`[Novel Hider] Hiding novel on current page: ${title}`);
        }
    }
}

// --- Chapter Page Logic ---

/**
 * Extracts novel details from the breadcrumb on a chapter page.
 * Returns { novelUrl: string, novelTitle: string } or null.
 */
function extractNovelDetailsFromBreadcrumb() {
    const breadcrumb = document.querySelector('.bread');
    if (!breadcrumb) return null;

    // The novel link is typically the third <a> tag in the breadcrumb (index 2)
    const novelLinkElement = breadcrumb.querySelectorAll('a')[2];
    
    if (novelLinkElement) {
        // Get the novel's index URL and convert to the base .html format
        const novelUrl = novelLinkElement.href.split('/index.html')[0] + '.html';
        const novelTitle = novelLinkElement.textContent.trim();
        return { novelUrl, novelTitle };
    }
    return null;
}

/**
 * Creates and appends the Hiatus/Reading/Unmark buttons on the chapter reader page.
 */
async function updateChapterPageButtons() {
    const chapterDetails = extractNovelDetailsFromBreadcrumb();
    const container = document.querySelector('.tools ul'); // The list of navigation buttons

    if (!container || !chapterDetails) {
        return;
    }
    
    const { novelUrl, novelTitle } = chapterDetails;
    const currentChapterUrl = window.location.href.split('#')[0].split('?')[0];

    const hiddenNovelsMap = await getHiddenNovelsMap();
    const existingNovelData = hiddenNovelsMap.get(novelUrl);
    const currentCategory = existingNovelData?.category;
    
    // Check if the novel is currently categorized as reading or hiatus
    const isSaved = !!currentCategory; // Flag to show Unmark button if ANY category is set
    
    // Remove any previously injected button li items
    container.querySelectorAll('.chapter-hider-li').forEach(el => el.remove());
    
    // --- Create and Inject Tracking Buttons ---
    
    const categoriesToTrack = [CATEGORIES.READING, CATEGORIES.HIATUS];
    let lastInjectedLi = null;

    // Find the Table of Contents button (the one with the icon-mulu class)
    const tocLi = container.querySelector('li:has(.icon-mulu)');
    
    categoriesToTrack.forEach(data => {
        const categoryKey = data.label.toLowerCase();
        const li = document.createElement('li');
        li.className = 'chapter-hider-li';
        
        // ⭐ MODIFICATION: Remove inline LI style since it's now in style.css
        // li.style.cssText = 'display: inline-flex !important; align-items: center; justify-content: center;';

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
    if (isSaved) { // Show if ANY category is saved
        const unmarkLi = document.createElement('li');
        unmarkLi.className = 'chapter-hider-li';
        
        // ⭐ MODIFICATION: Remove inline LI style since it's now in style.css
        // unmarkLi.style.cssText = 'display: inline-flex !important; align-items: center; justify-content: center;';

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
            // Fallback if somehow no other buttons were injected
            tocLi.insertAdjacentElement('beforebegin', unmarkLi);
        } else {
             container.appendChild(unmarkLi);
        }
    }
}

// --- Single Novel Page Logic ---

/**
 * Creates and appends the Read/Disliked/Hiatus/Completed/Unmark buttons on the single novel page.
 */
async function updateNovelPageButtons() {
    const novelUrl = window.location.href.split('#')[0].split('?')[0]; 
    const container = document.querySelector(SINGLE_NOVEL_CONTAINER_SELECTOR);
    const titleElement = document.querySelector('div.booknav2 h1 a');
    
    if (!container || !titleElement) {
        return;
    }
    
    const hiddenNovelsMap = await getHiddenNovelsMap();
    const existingNovelData = hiddenNovelsMap.get(novelUrl);
    const currentCategory = existingNovelData?.category;
    const isSaved = !!currentCategory; 
    
    const novelTitle = titleElement.textContent.trim();
    const novelElement = document.querySelector('.mybox'); 

    container.parentElement.querySelectorAll('.novel-hider-buttons').forEach(el => el.remove());
    
    const horizontalButtonContainer = document.createElement('div');
    horizontalButtonContainer.className = 'novel-hider-buttons';
    // ⭐ MODIFICATION: Keep essential display/layout inline as these are structure settings
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
async function processNovelList() {
    const hiddenNovelsMap = await getHiddenNovelsMap();
    const hiddenUrlsSet = new Set(Array.from(hiddenNovelsMap.values())
        .filter(novel => HIDDEN_CATEGORIES.includes(novel.category)) 
        .map(novel => novel.url));
    
    const novelListItems = document.querySelectorAll(NOVEL_SELECTOR);
    let hiddenCount = 0;

    novelListItems.forEach(item => {
        const novelLinkElement = item.querySelector('a[href*="/book/"]');
        const titleElement = item.querySelector('h3 a');

        if (!novelLinkElement || !titleElement) return;

        const novelUrl = novelLinkElement.href; 
        const novelTitle = titleElement.textContent.trim();
        
        if (hiddenUrlsSet.has(novelUrl)) {
            item.style.display = 'none';
            hiddenCount++;
        }
        
        const rightContainer = item.querySelector('.newright');

        if (rightContainer) {
            const existingNovelData = hiddenNovelsMap.get(novelUrl);
            const isReading = existingNovelData?.category === 'reading';

            const horizontalButtonContainer = document.createElement('div');
            // ⭐ MODIFICATION: Keep essential display/layout inline as these are structure settings
            horizontalButtonContainer.style.cssText = `
                display: flex;
                gap: .5px;
                margin-top: 5px;
            `;

            const readingButton = createCompactButton(
                item, novelUrl, novelTitle, CATEGORIES.READING.label, 'reading', CATEGORIES.READING.color, isReading, false, false
            ); 
            
            const dislikedButton = createCompactButton(
                item, novelUrl, novelTitle, CATEGORIES.DISLIKED.label, 'disliked', CATEGORIES.DISLIKED.color, false, false, false
            ); 
            
            horizontalButtonContainer.appendChild(readingButton);
            horizontalButtonContainer.appendChild(dislikedButton);
            
            rightContainer.appendChild(horizontalButtonContainer);
        }
    });

    console.log(`[Novel Hider] List view initialized. Total novels hidden: ${hiddenCount}.`);
}


/**
 * Determines page type and initializes the appropriate function.
 */
function initialize() {
    const chapterPageContent = document.querySelector(CHAPTER_PAGE_CONTENT_SELECTOR);
    const singleNovelContainer = document.querySelector(MAIN_PAGE_CONTENT_SELECTOR);
    
    if (chapterPageContent) {
        updateChapterPageButtons();
    } else if (singleNovelContainer) {
        updateNovelPageButtons();
    } else {
        processNovelList();
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