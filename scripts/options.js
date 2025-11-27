const STORAGE_KEY = 'hiddenNovelsMap';
const UNMARK_CATEGORY = 'unmarked';

// IMPORTANT FIX: Rename to CATEGORIES for consistency with content.js and update button logic
const CATEGORIES = {
    'reading': { label: 'Reading', color: '#4CAF50', btnColor: '#4CAF50', liClass: 'reading' },
    'disliked': { label: 'Disliked', color: '#f44336', btnColor: '#f44336', liClass: 'disliked' },
    'hiatus': { label: 'Hiatus', color: '#ffc107', btnColor: '#ffc107', liClass: 'hiatus' },
    'completed': { label: 'Completed', color: '#20c997', btnColor: '#20c997', liClass: 'completed' },
};

/**
 * Retrieves the map of hidden novels from local storage.
 */
async function getHiddenNovelsMap() {
    return new Promise((resolve) => {
        chrome.storage.local.get([STORAGE_KEY], (result) => {
            const novelsArray = result[STORAGE_KEY] || [];
            // Ensure every novel has a lastUpdated field for sorting (default to 0 if missing)
            const novelsMap = new Map(novelsArray.map(item => {
                const category = item.category || 'disliked';
                const lastUpdated = item.lastUpdated || 0; 
                return [item.url, { ...item, category, title: item.title, lastUpdated }];
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

let allNovels = [];
let currentFilter = 'all';
// ⭐ NEW: Track current sort direction (ascending = oldest first, descending = newest first/latest first)
let currentSort = 'ascending'; 

/**
 * Updates the summary counts based on the current novel data.
 */
function updateCounts() {
    const counts = {
        'total': allNovels.length,
        'reading': 0,
        'disliked': 0,
        'hiatus': 0,
        'completed': 0,
    };

    allNovels.forEach(novel => {
        if (counts.hasOwnProperty(novel.category)) {
            counts[novel.category]++;
        }
    });

    // Check if the HTML elements exist before trying to update them
    if (document.getElementById('total-count')) document.getElementById('total-count').textContent = counts.total;
    if (document.getElementById('reading-count')) document.getElementById('reading-count').textContent = counts.reading;
    if (document.getElementById('disliked-count')) document.getElementById('disliked-count').textContent = counts.disliked;
    if (document.getElementById('hiatus-count')) document.getElementById('hiatus-count').textContent = counts.hiatus;
    if (document.getElementById('completed-count')) document.getElementById('completed-count').textContent = counts.completed;
}

/**
 * Renders the list of saved novels based on the current filter and sort order.
 */
async function renderNovelList() {
    const novelsMap = await getHiddenNovelsMap();
    allNovels = Array.from(novelsMap.values());
    updateCounts();

    const novelListElement = document.getElementById('hidden-list');
    if (!novelListElement) {
        console.error("Options page HTML element #hidden-list not found.");
        return; // Exit if element is missing
    }
    
    novelListElement.innerHTML = '';

    let filteredNovels = allNovels.filter(novel => {
        if (currentFilter === 'all') return true;
        return novel.category === currentFilter;
    });
    
    // ⭐ CHANGE: Apply sorting based on currentSort state
    if (currentSort === 'ascending') {
        // Oldest first (Newest items go to the bottom/end of the list)
        filteredNovels.sort((a, b) => a.lastUpdated - b.lastUpdated); 
    } else {
        // Descending: Newest first (Newest items go to the top/start of the list)
        filteredNovels.sort((a, b) => b.lastUpdated - a.lastUpdated); 
    }

    if (filteredNovels.length === 0) {
        const categoryLabel = currentFilter === 'all' ? '' : CATEGORIES[currentFilter]?.label;
        novelListElement.innerHTML = `<li>No novels categorized as ${categoryLabel || 'Tracked'} found.</li>`;
        return;
    }

    filteredNovels.forEach(novel => {
        const li = document.createElement('li');
        const style = CATEGORIES[novel.category] || { label: novel.category, btnColor: '#6c757d', liClass: '' };

        // 1. Generate Action Buttons HTML
        const actionButtonsHTML = Object.keys(CATEGORIES).map(categoryKey => {
            const categoryData = CATEGORIES[categoryKey];
            const isDisabled = categoryKey === novel.category; // Disable button for the current category
            
            // REMOVED INLINE STYLES FOR BUTTONS: The styles are now in style.css
            // Note: The color: #333; for Hiatus is still needed inline because CATEGORIES only stores the background color
            return `
                <button class="options-btn action-${categoryKey}" 
                    data-action="${categoryKey}" 
                    data-url="${novel.url}"
                    ${isDisabled ? 'disabled' : ''}>
                    ${categoryData.label}
                </button>
            `;
        }).join('');

        // 2. Generate Chapter Link HTML
        let chapterLinkHTML = '';
        if (novel.currentChapterUrl && (novel.category === 'reading' || novel.category === 'hiatus')) {
            const chapterTitle = novel.currentChapterTitle || 'Continue Reading';
            const categoryLabel = style.label;
            
            // REMOVED INLINE STYLES for chapter link
            chapterLinkHTML = `
                <span class="novel-chapter-link">
                    <strong>[${categoryLabel}]:</strong> 
                    <a href="${novel.currentChapterUrl}" target="_blank">${chapterTitle}</a>
                </span>
            `;
        }
        
        // ⭐ FIX: Re-introduced the novel-hider-list-item wrapper and applied the category class to it.
        li.innerHTML = `
            <div class="novel-hider-list-item ${style.liClass}">
                <div class="novel-info"> 
                    ${chapterLinkHTML} 
                    <span class="novel-title"><a href="${novel.url}" target="_blank">${novel.title}</a></span>
                    <span class="novel-url" style="display: block; font-size: 0.8em; color: #666;">${novel.url}</span>
                    <span class="novel-category">Category: ${style.label}</span>
                </div>
                <div class="novel-actions">
                    ${actionButtonsHTML}
                    <button class="options-btn unmark-btn" data-action="${UNMARK_CATEGORY}" data-url="${novel.url}">Unmark</button>
                </div>
            </div>
        `;
        
        // Add listeners to all action buttons in the list item
        li.querySelectorAll('.options-btn').forEach(btn => {
            if (!btn.disabled) {
                btn.addEventListener('click', handleNovelAction);
            }
        });
        
        novelListElement.appendChild(li);
    });
}

/**
 * Handles action buttons (Change Category or Unmark)
 */
async function handleNovelAction(event) {
    const url = event.target.dataset.url;
    const action = event.target.dataset.action;
    
    const novelsMap = await getHiddenNovelsMap();
    const novel = novelsMap.get(url) || { url: url, title: 'Unknown Title' };

    // When changing category, ensure chapter tracking data is updated/retained/removed
    if (action === UNMARK_CATEGORY) {
        // Remove entry
        novelsMap.delete(url);
    } else {
        // Retain tracking data if moving between reading/hiatus
        if (action === 'reading' || action === 'hiatus') {
            // Data is carried over by default from novelsMap.get(url)
        } else {
            // Clear tracking data if moving to disliked/completed
            delete novel.currentChapterUrl;
            delete novel.currentChapterTitle;
        }
        
        // Change category
        novel.category = action;
        
        // Update the timestamp whenever an action is taken
        novel.lastUpdated = Date.now(); 
        
        novelsMap.set(url, novel);
    }
    
    await saveHiddenNovelsMap(novelsMap);
    
    // Re-render the list to update the colors, disabled buttons, and counts and apply new sorting
    renderNovelList(); 
}

/**
 * Handles filter button clicks.
 */
function handleFilterClick(event) {
    const newFilter = event.target.dataset.filter;
    if (newFilter === currentFilter) return;

    currentFilter = newFilter;

    // Update active class on buttons
    document.querySelectorAll('#filter-controls button').forEach(btn => {
        btn.classList.remove('active');
    });
    event.target.classList.add('active');

    renderNovelList();
}

/**
 * Handles toggling the sort order.
 */
function handleSortToggle(event) {
    const btn = event.target;
    if (currentSort === 'ascending') {
        currentSort = 'descending';
        btn.textContent = 'Sort: Latest First';
        btn.dataset.sort = 'descending';
    } else {
        currentSort = 'ascending';
        btn.textContent = 'Sort: Oldest First';
        btn.dataset.sort = 'ascending';
    }
    renderNovelList();
}


/**
 * Handles clearing all novels from storage.
 */
async function handleClearAll() {
    if (confirm('Are you sure you want to clear ALL categorized novels? This cannot be undone.')) {
        await saveHiddenNovelsMap(new Map());
        renderNovelList();
    }
}

document.addEventListener('DOMContentLoaded', () => {
    // Check for the main HTML structure before proceeding
    const filterControls = document.getElementById('filter-controls');
    const hiddenList = document.getElementById('hidden-list');
    const sortToggleBtn = document.getElementById('sort-toggle-btn');
    
    if (!filterControls || !hiddenList || !sortToggleBtn) {
        console.error("Options page HTML structure is incomplete. Cannot initialize script.");
        return;
    }
    
    // 1. Initialize List and Counts
    // Set initial button text based on 'ascending' default
    sortToggleBtn.textContent = 'Sort: Oldest First';
    renderNovelList();
    
    // 2. Clear All Listener
    document.getElementById('clear-all-btn').addEventListener('click', handleClearAll);
    
    // 3. Filter Listeners
    document.querySelectorAll('#filter-controls button').forEach(btn => {
        btn.addEventListener('click', handleFilterClick);
    });
    
    // ⭐ NEW: Sort Toggle Listener
    sortToggleBtn.addEventListener('click', handleSortToggle);


    // 4. Center and Pad #hidden-list for layout
    if (hiddenList) {
        hiddenList.style.marginLeft = 'auto';
        hiddenList.style.marginRight = 'auto';
        hiddenList.style.maxWidth = '40%'; 
        hiddenList.style.minWidth = '400px'; 
        hiddenList.style.padding = '0';
    }
});