const STORAGE_KEY = 'hiddenNovelsMap';
const UNMARK_CATEGORY = 'unmarked';

// Define all categories and styles, including button colors
const CATEGORY_STYLES = {
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

    document.getElementById('total-count').textContent = counts.total;
    document.getElementById('reading-count').textContent = counts.reading;
    document.getElementById('disliked-count').textContent = counts.disliked;
    document.getElementById('hiatus-count').textContent = counts.hiatus;
    document.getElementById('completed-count').textContent = counts.completed;
}

/**
 * Renders the list of saved novels based on the current filter.
 */
async function renderNovelList() {
    const novelsMap = await getHiddenNovelsMap();
    allNovels = Array.from(novelsMap.values());
    updateCounts();

    const novelListElement = document.getElementById('hidden-list');
    novelListElement.innerHTML = '';

    let filteredNovels = allNovels.filter(novel => {
        if (currentFilter === 'all') return true;
        return novel.category === currentFilter;
    });
    
    // ⚠️ NEW: Sort novels by lastUpdated timestamp (most recent is at the bottom/end of the list)
    // We sort ascending (oldest first) so that when we use insertBefore, the list ends up sorted properly.
    // However, since we're using appendChild, we sort by lastUpdated ascending (oldest first) 
    // to match the previous list order logic, keeping the "newest" at the end.
    filteredNovels.sort((a, b) => a.lastUpdated - b.lastUpdated); 


    if (filteredNovels.length === 0) {
        const categoryLabel = currentFilter === 'all' ? '' : CATEGORY_STYLES[currentFilter]?.label;
        novelListElement.innerHTML = `<li>No novels categorized as ${categoryLabel || 'Tracked'} found.</li>`;
        return;
    }

    filteredNovels.forEach(novel => {
        const li = document.createElement('li');
        const style = CATEGORY_STYLES[novel.category] || { label: novel.category, btnColor: '#6c757d', liClass: '' };

        li.className = style.liClass; 

        // 1. Generate Action Buttons HTML
        const actionButtonsHTML = Object.keys(CATEGORY_STYLES).map(categoryKey => {
            const categoryData = CATEGORY_STYLES[categoryKey];
            const isDisabled = categoryKey === novel.category; // Disable button for the current category
            
            return `
                <button class="options-btn action-${categoryKey}" 
                    data-action="${categoryKey}" 
                    data-url="${novel.url}"
                    ${isDisabled ? 'disabled' : ''}
                    style="background-color: ${categoryData.btnColor}; ${categoryKey === 'hiatus' ? 'color: #333;' : ''};">
                    ${categoryData.label}
                </button>
            `;
        }).join('');

        // 2. Generate Chapter Link HTML
        let chapterLinkHTML = '';
        if (novel.currentChapterUrl && (novel.category === 'reading' || novel.category === 'hiatus')) {
            const chapterTitle = novel.currentChapterTitle || 'Continue Reading';
            const categoryLabel = style.label;
            
            chapterLinkHTML = `
                <span class="novel-chapter-link" style="display: inline-block; margin-top: 5px; font-size: 1.3em; font-weight: bold; max-width: 90%;">
                    <strong>[${categoryLabel}]:</strong> 
                    <a href="${novel.currentChapterUrl}" target="_blank">${chapterTitle}</a>
                </span>
            `;
        }

        li.innerHTML = `
            <div class="novel-info" style="text-align: center;"> ${chapterLinkHTML} <span class="novel-title" style="display: block; font-size: 0.9em; margin-top: 5px;"><a href="${novel.url}" target="_blank">${novel.title}</a>
                </span>
                <span class="novel-url" style="display:none;">${novel.url}</span>
                <span class="novel-category">Category: ${style.label}</span>
            </div>
            <div class="novel-actions">
                ${actionButtonsHTML}
                <button class="options-btn unmark-btn" data-action="${UNMARK_CATEGORY}" data-url="${novel.url}">Unmark</button>
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
            // If the novel already exists, it retains currentChapterUrl/Title.
            // If it's a new entry from the options page, it won't have it (which is correct).
        } else {
            // Clear tracking data if moving to disliked/completed
            delete novel.currentChapterUrl;
            delete novel.currentChapterTitle;
        }
        
        // Change category
        novel.category = action;
        
        // ⚠️ NEW: Update the timestamp whenever an action is taken
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
 * Handles clearing all novels from storage.
 */
async function handleClearAll() {
    if (confirm('Are you sure you want to clear ALL categorized novels? This cannot be undone.')) {
        await saveHiddenNovelsMap(new Map());
        renderNovelList();
    }
}

document.addEventListener('DOMContentLoaded', () => {
    // 1. Initialize List and Counts
    renderNovelList();
    
    // 2. Clear All Listener
    document.getElementById('clear-all-btn').addEventListener('click', handleClearAll);
    
    // 3. Filter Listeners
    document.querySelectorAll('#filter-controls button').forEach(btn => {
        btn.addEventListener('click', handleFilterClick);
    });

    // 4. Center and Pad #hidden-list for layout
    const hiddenList = document.getElementById('hidden-list');
    if (hiddenList) {
        // Center the block element
        hiddenList.style.marginLeft = 'auto';
        hiddenList.style.marginRight = 'auto';
        // Set maximum width (70% means 30% combined padding/margin on the sides)
        hiddenList.style.maxWidth = '70%'; 
        // Ensure a minimum width for readability
        hiddenList.style.minWidth = '400px'; 
        hiddenList.style.padding = '0';
    }
});