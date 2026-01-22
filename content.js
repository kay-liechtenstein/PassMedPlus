// Content script to extract PassMed progress data

// Helper function to get local date string without timezone issues
// This uses the local date where the user is, which matches what they see on PassMed
function getLocalDateString(date = new Date()) {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// Function to inject the sync button at the top of all PassMed pages
async function injectSyncButton() {
    // Only show on the specific PassMedicine menu pages
    const currentURL = window.location.href;
    if (currentURL !== 'https://www.passmedicine.com/menu.php?revise=all' && 
        currentURL !== 'https://www.passmedicine.com/menu.php') {
        return;
    }
    
    // Check if sync button already exists
    let existingButton = document.getElementById('passmed-sync-button');
    if (existingButton) {
        // Check if we need to reset the button after sync
        const storage = await chrome.storage.local.get(['shouldResetSyncButton']);
        if (storage.shouldResetSyncButton) {
            // Reset the button
            existingButton.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px; vertical-align: middle;">
                    <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.3"/>
                </svg>
                <span style="vertical-align: middle;">Sync Progress</span>
            `;
            existingButton.style.background = 'linear-gradient(135deg, #4CAF50 0%, #45a049 50%, #388E3C 100%)';
            existingButton.disabled = false;
            await chrome.storage.local.remove(['shouldResetSyncButton']);
        }
        return;
    }
    
    // Create sync button
    const syncButton = document.createElement('button');
    syncButton.id = 'passmed-sync-button';
    syncButton.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px; vertical-align: middle;">
            <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.3"/>
        </svg>
        <span style="vertical-align: middle;">Sync Progress</span>
    `;
    syncButton.style.cssText = `
        position: fixed;
        top: 10px;
        left: calc(50% - 100px);
        transform: translateX(-50%);
        z-index: 10000;
        background: linear-gradient(135deg, #4CAF50 0%, #45a049 50%, #388E3C 100%);
        color: white;
        border: none;
        padding: 10px 20px;
        border-radius: 8px;
        cursor: pointer;
        font-size: 14px;
        font-weight: 600;
        box-shadow: 0 2px 6px rgba(0,0,0,0.2);
        transition: all 0.3s ease;
    `;
    
    // Add hover effect
    syncButton.onmouseover = () => {
        syncButton.style.background = 'linear-gradient(135deg, #45a049 0%, #388E3C 50%, #2E7D32 100%)';
        syncButton.style.boxShadow = '0 4px 8px rgba(0,0,0,0.3)';
        syncButton.style.transform = 'translateX(-50%) translateY(-1px)';
    };
    syncButton.onmouseout = () => {
        syncButton.style.background = 'linear-gradient(135deg, #4CAF50 0%, #45a049 50%, #388E3C 100%)';
        syncButton.style.boxShadow = '0 2px 6px rgba(0,0,0,0.2)';
        syncButton.style.transform = 'translateX(-50%)';
    };
    
    // Add click handler
    syncButton.onclick = async () => {
            
        // Update button to show it's working
        syncButton.innerHTML = `
            <style>
                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
            </style>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px; vertical-align: middle; animation: spin 1s linear infinite;">
                <path d="M21 12a9 9 0 11-6.219-8.56"/>
            </svg>
            <span style="vertical-align: middle;">Syncing...</span>
        `;
        syncButton.style.background = 'linear-gradient(135deg, #2196F3 0%, #1976D2 50%, #1565C0 100%)';
        syncButton.disabled = true;
        
        // Check if already on Review Questions page
        if (isOnReviewQuestionsPage()) {
            // Already on Review Questions - just extract data directly
            
            // Check for "Show all questions" button and click it
            const showAllButton = document.querySelector('#showallquestions');
            if (showAllButton && !showAllButton.textContent.includes('Loading')) {
                showAllButton.click();
                await waitForAllQuestionsToLoad();
            }
            
            // Extract data
            setTimeout(async () => {
                    const reviewData = extractQuestionsFromReviewTable();
                    
                if (reviewData.totalQuestions > 0) {
                    // Save data
                    const today = getLocalDateString();
                    const todayCount = reviewData.daily[today] ? reviewData.daily[today].total : 0;
                    
                    await chrome.storage.local.set({ 
                        lastReviewData: reviewData,
                        lastReviewDataDate: new Date().toISOString(),
                        todayQuestions: todayCount,
                        todayQuestionsDate: today
                    });
                    
                    // Sync data
                    await autoSyncData();
                    
                    // Update the floating button with new count
                    const floatingButton = document.getElementById('passmed-tracker-button');
                    if (floatingButton) {
                        const buttonElement = floatingButton.querySelector('button');
                        if (buttonElement) {
                            await updateButtonWithTodayStats(buttonElement);
                        }
                    }
                    
                    // Show success notification with strong gradient
                    const notification = document.createElement('div');
                    notification.style.cssText = `
                        position: fixed;
                        top: 70px;
                        left: calc(50% + 60px);
                        transform: translateX(-50%);
                        background: linear-gradient(135deg, #4CAF50 0%, #45a049 50%, #388E3C 100%);
                        color: white;
                        padding: 15px 30px;
                        border-radius: 8px;
                        font-size: 16px;
                        font-weight: 600;
                        z-index: 10000;
                        box-shadow: 0 4px 8px rgba(0,0,0,0.2);
                    `;
                    notification.innerHTML = `
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="display: inline-block; vertical-align: middle; margin-right: 8px;">
                            <polyline points="20 6 9 17 4 12"></polyline>
                        </svg>
                        <span style="vertical-align: middle;">Synced: ${reviewData.totalQuestions} questions from Review Table</span>
                    `;
                    document.body.appendChild(notification);
                    
                    // Remove notification after 3 seconds
                    setTimeout(() => notification.remove(), 3000);
                }
                
                // Reset sync button
                syncButton.innerHTML = `
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px; vertical-align: middle;">
                        <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.3"/>
                    </svg>
                    <span style="vertical-align: middle;">Sync Progress</span>
                `;
                syncButton.style.background = 'linear-gradient(135deg, #4CAF50 0%, #45a049 50%, #388E3C 100%)';
                syncButton.disabled = false;
            }, 1000);
            
        } else {
            // Not on Review Questions - need to navigate
            
            // Mark that we're syncing so we can extract data after navigation
            await chrome.storage.local.set({ 
                syncInProgress: true 
            });
            
            // Find and click the Review Questions link in the sidebar
            const reviewLink = Array.from(document.querySelectorAll('a, button')).find(el => 
                el.textContent.includes('Review questions') || el.textContent.includes('Review Questions')
            );
            
            if (reviewLink) {
                reviewLink.click();
            } else {
                // Fallback: try direct navigation
                window.location.href = window.location.origin + window.location.pathname + '?section=review_questions';
            }
        }
    };
    
    document.body.appendChild(syncButton);
}

// Function to inject the tracker button
async function injectTrackerButton() {
    // Only show on the specific PassMedicine menu pages
    const currentURL = window.location.href;
    if (currentURL !== 'https://www.passmedicine.com/menu.php?revise=all' && 
        currentURL !== 'https://www.passmedicine.com/menu.php') {
        return;
    }
    
    // Check if button already exists
    if (document.getElementById('passmed-tracker-button')) {
        return;
    }
    
    // Load theme color first
    let themeColor = '#0ABAB5'; // Default
    try {
        // Check for theme from viewer (dashboard)
        const themeResult = await chrome.storage.local.get(['theme']);
        
        // Try local storage first (more reliable)
        const localResult = await chrome.storage.local.get(['themeColor']);
        
        // Then try sync storage
        const syncResult = await chrome.storage.sync.get(['themeColor']);
        
        // Use theme from dashboard if available, otherwise use themeColor
        if (themeResult.theme && themeResult.theme.primary) {
            themeColor = themeResult.theme.primary;
        } else {
            themeColor = localResult.themeColor || syncResult.themeColor || '#0ABAB5';
        }
    } catch (error) {
    }
    
    // Create button container
    const buttonContainer = document.createElement('div');
    buttonContainer.id = 'passmed-tracker-button';
    buttonContainer.style.cssText = `
        position: fixed;
        top: 10px;
        left: calc(50% + 170px);
        transform: translateX(-50%);
        z-index: 9999;
        display: flex;
        align-items: center;
        gap: 8px;
    `;
    
    // Create the button
    const button = document.createElement('button');
    button.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px; vertical-align: middle;">
            <line x1="12" y1="20" x2="12" y2="10"></line>
            <line x1="18" y1="20" x2="18" y2="4"></line>
            <line x1="6" y1="20" x2="6" y2="16"></line>
        </svg>
        <span style="vertical-align: middle;">Progress Tracker</span>
    `;
    button.title = 'Click to view progress | Right-click to change color';
    // Create gradient from theme color
    const darkerColor = darkenColor(themeColor, 0.2);
    const darkestColor = darkenColor(themeColor, 0.4);
    
    button.style.cssText = `
        background: linear-gradient(135deg, ${themeColor} 0%, ${darkerColor} 50%, ${darkestColor} 100%);
        color: white;
        border: none;
        padding: 10px 20px;
        border-radius: 8px;
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        transition: all 0.2s ease;
        display: flex;
        align-items: center;
        gap: 6px;
    `;
    
    // Store original color for hover effects
    button.dataset.themeColor = themeColor;
    
    // Function to darken a color
    function darkenColor(color, amount = 0.2) {
        const num = parseInt(color.replace('#', ''), 16);
        const r = Math.max(0, (num >> 16) * (1 - amount));
        const g = Math.max(0, ((num & 0x0000FF00) >> 8) * (1 - amount));
        const b = Math.max(0, (num & 0x000000FF) * (1 - amount));
        return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
    }
    
    // Hover effect
    button.addEventListener('mouseenter', () => {
        const currentColor = button.dataset.themeColor || '#0ABAB5';
        const hoverDarker = darkenColor(currentColor, 0.3);
        const hoverDarkest = darkenColor(currentColor, 0.5);
        button.style.background = `linear-gradient(135deg, ${currentColor} 0%, ${hoverDarker} 50%, ${hoverDarkest} 100%)`;
        button.style.transform = 'translateY(-1px)';
        button.style.boxShadow = '0 4px 8px rgba(0,0,0,0.15)';
    });
    
    button.addEventListener('mouseleave', () => {
        const currentColor = button.dataset.themeColor || '#0ABAB5';
        const originalDarker = darkenColor(currentColor, 0.2);
        const originalDarkest = darkenColor(currentColor, 0.4);
        button.style.background = `linear-gradient(135deg, ${currentColor} 0%, ${originalDarker} 50%, ${originalDarkest} 100%)`;
        button.style.transform = 'translateY(0)';
        button.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
    });
    
    // Create popup container
    const popupContainer = document.createElement('div');
    popupContainer.id = 'passmed-tracker-popup';
    popupContainer.style.cssText = `
        position: fixed;
        top: 60px;
        left: calc(50% + 170px);
        transform: translateX(-50%);
        width: 350px;
        background: white;
        border-radius: 12px;
        box-shadow: 0 4px 16px rgba(0,0,0,0.15);
        display: none;
        z-index: 9998;
        overflow: hidden;
    `;
    
    // Create iframe to load popup content
    const iframe = document.createElement('iframe');
    let iframeLoaded = false;
    
    iframe.style.cssText = `
        width: 100%;
        height: 450px;
        border: none;
    `;
    
    popupContainer.appendChild(iframe);
    
    // Toggle popup when clicked
    button.addEventListener('click', () => {
        const isVisible = popupContainer.style.display === 'block';
        popupContainer.style.display = isVisible ? 'none' : 'block';
        
        if (!isVisible) {
            if (!iframeLoaded) {
                // First time loading
                iframe.src = chrome.runtime.getURL('popup.html');
                iframeLoaded = true;
            } else {
                // Already loaded, just refresh data
                setTimeout(() => {
                    iframe.contentWindow.postMessage({ action: 'refreshData' }, '*');
                }, 50);
            }
        }
    });
    
    // Add right-click color picker
    button.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        
        // Create a hidden color input
        const colorInput = document.createElement('input');
        colorInput.type = 'color';
        colorInput.value = button.dataset.themeColor || '#0ABAB5';
        colorInput.style.display = 'none';
        document.body.appendChild(colorInput);
        
        // Handle color selection
        colorInput.addEventListener('change', async (event) => {
            const newColor = event.target.value;
            
            // Update button immediately with new gradient
            const newDarker = darkenColor(newColor, 0.2);
            const newDarkest = darkenColor(newColor, 0.4);
            button.style.background = `linear-gradient(135deg, ${newColor} 0%, ${newDarker} 50%, ${newDarkest} 100%)`;
            button.dataset.themeColor = newColor;
            
            // Save to storage
            try {
                // Calculate a darker version for the theme
                const darkerColor = darkenColor(newColor, 0.15);
                
                // Save in the same format as the dashboard theme selector
                await chrome.storage.local.set({ 
                    theme: { primary: newColor, dark: darkerColor },
                    themeColor: newColor // Keep this for backwards compatibility
                });
                
                // Verify it was saved
                const verification = await chrome.storage.local.get(['theme', 'themeColor']);
                
                // Visual feedback
                button.style.transform = 'scale(1.1)';
                setTimeout(() => {
                    button.style.transform = 'scale(1)';
                }, 200);
            } catch (error) {
            }
            
            // Update popup if it's open
            const popupIframe = document.querySelector('#passmed-tracker-popup iframe');
            if (popupIframe) {
                popupIframe.contentWindow.postMessage({ action: 'updateThemeColor', color: newColor }, '*');
            }
            
            // Remove the input
            document.body.removeChild(colorInput);
        });
        
        // Trigger the color picker
        colorInput.click();
    });
    
    // Close popup when clicking outside
    document.addEventListener('click', (e) => {
        if (!buttonContainer.contains(e.target) && !popupContainer.contains(e.target)) {
            popupContainer.style.display = 'none';
        }
    });
    
    buttonContainer.appendChild(button);
    document.body.appendChild(buttonContainer);
    document.body.appendChild(popupContainer);
    
    // Update button with today's questions if available
    updateButtonWithTodayStats(button);
    
    // Check if we have Review Questions data after a short delay
    setTimeout(() => {
        chrome.storage.local.get(['lastReviewData', 'lastReviewDataDate'], (data) => {
            if (!data.lastReviewData && !isOnReviewQuestionsPage()) {
                // No data and not on Review Questions page
                button.innerHTML = `
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px; vertical-align: middle;">
                        <line x1="12" y1="20" x2="12" y2="10"></line>
                        <line x1="18" y1="20" x2="18" y2="4"></line>
                        <line x1="6" y1="20" x2="6" y2="16"></line>
                    </svg>
                    <span style="vertical-align: middle;">Progress Tracker</span>
                    <span style="background: rgba(255,255,255,0.2); padding: 2px 8px; border-radius: 12px; font-size: 12px; color: #ffaaaa; margin-left: 8px;">No data</span>
                `;
                button.title = 'No data available - Click Review Questions in sidebar to start tracking | Right-click to change color';
                
                // Add pulsing effect to draw attention
                button.style.animation = 'pulse 2s infinite';
                const style = document.createElement('style');
                style.textContent = `
                    @keyframes pulse {
                        0% { opacity: 1; }
                        50% { opacity: 0.7; }
                        100% { opacity: 1; }
                    }
                `;
                document.head.appendChild(style);
                
            } else if (data.lastReviewData) {
                // We have data - make sure button is updated
                updateButtonWithTodayStats(button);
                
                if (data.lastReviewDataDate) {
                    // Check data freshness
                    const lastUpdate = new Date(data.lastReviewDataDate);
                    const now = new Date();
                    const daysSinceUpdate = (now - lastUpdate) / (1000 * 60 * 60 * 24);
                    
                    if (daysSinceUpdate > 1) {
                        button.title = `Data is ${Math.floor(daysSinceUpdate)} days old - Visit Review Questions for fresh data | Right-click to change color`;
                    } else {
                        button.title = 'Click to view progress | Right-click to change color';
                    }
                }
            }
        });
    }, 500); // Small delay to ensure data is loaded
    
}

// Function to update button with today's stats
async function updateButtonWithTodayStats(button) {
    try {
        // Check if chrome runtime is still valid
        if (!chrome.runtime?.id) {
            return;
        }
        
        const today = getLocalDateString();
        
        // First check if we have stored Review Questions data for today
        const storedData = await chrome.storage.local.get(['lastExtractedData', 'lastReviewData', 'todayQuestions', 'todayQuestionsDate']);
        
        // Quick check for today's questions from cache
        if (storedData.todayQuestionsDate === today && storedData.todayQuestions !== undefined) {
            const todayCount = storedData.todayQuestions;
            button.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px; vertical-align: middle;">
                    <line x1="12" y1="20" x2="12" y2="10"></line>
                    <line x1="18" y1="20" x2="18" y2="4"></line>
                    <line x1="6" y1="20" x2="6" y2="16"></line>
                </svg>
                <span style="vertical-align: middle;">Progress Tracker</span>
                <span style="background: rgba(255,255,255,0.2); padding: 2px 8px; border-radius: 12px; font-size: 12px; font-weight: bold; margin-left: 8px;">${todayCount} today</span>
            `;
            return;
        }
        
        if (storedData.lastReviewData && storedData.lastReviewData.daily && storedData.lastReviewData.daily[today]) {
            // Use stored review data (with proper multi-part counting)
            const todayCount = storedData.lastReviewData.daily[today].total;
            button.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px; vertical-align: middle;">
                    <line x1="12" y1="20" x2="12" y2="10"></line>
                    <line x1="18" y1="20" x2="18" y2="4"></line>
                    <line x1="6" y1="20" x2="6" y2="16"></line>
                </svg>
                <span style="vertical-align: middle;">Progress Tracker</span>
                <span style="background: rgba(255,255,255,0.2); padding: 2px 8px; border-radius: 12px; font-size: 12px; font-weight: bold; margin-left: 8px;">${todayCount} today</span>
            `;
            
            // Cache this for faster access
            chrome.storage.local.set({
                todayQuestions: todayCount,
                todayQuestionsDate: today
            });
            return;
        }
        
        // Removed auto-extraction on Review Questions page - user must press Sync button
        
        // Fall back to any stored data
        const localData = await chrome.storage.local.get(['todayQuestions', 'todayQuestionsDate']);
        
        if (localData.todayQuestionsDate === today && localData.todayQuestions > 0) {
            button.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px; vertical-align: middle;">
                    <line x1="12" y1="20" x2="12" y2="10"></line>
                    <line x1="18" y1="20" x2="18" y2="4"></line>
                    <line x1="6" y1="20" x2="6" y2="16"></line>
                </svg>
                <span style="vertical-align: middle;">Progress Tracker</span>
                <span style="background: rgba(255,255,255,0.2); padding: 2px 8px; border-radius: 12px; font-size: 12px; font-weight: bold; margin-left: 8px;">${localData.todayQuestions} today</span>
            `;
        } else {
            // Show "0 today" if no questions done today
            button.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px; vertical-align: middle;">
                    <line x1="12" y1="20" x2="12" y2="10"></line>
                    <line x1="18" y1="20" x2="18" y2="4"></line>
                    <line x1="6" y1="20" x2="6" y2="16"></line>
                </svg>
                <span style="vertical-align: middle;">Progress Tracker</span>
                <span style="background: rgba(255,255,255,0.2); padding: 2px 8px; border-radius: 12px; font-size: 12px; font-weight: bold; margin-left: 8px;">0 today</span>
            `;
        }
    } catch (error) {
        // Check if extension context is invalid
        if (error.message && error.message.includes('Extension context invalidated')) {
            // Extension was updated/reloaded - remove UI elements
            const button = document.getElementById('passmed-tracker-button');
            const syncBtn = document.getElementById('passmed-sync-button');
            const popup = document.getElementById('passmed-tracker-popup');
            
            if (button) button.remove();
            if (syncBtn) syncBtn.remove();
            if (popup) popup.remove();
            
            // User needs to refresh the page
            return;
        }
    }
}

// Inject buttons when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
            injectTrackerButton();
        injectSyncButton();
    });
} else {
    injectTrackerButton();
    injectSyncButton();
}

// Function to wait for review table to load all questions
async function waitForAllQuestionsToLoad() {
    return new Promise((resolve) => {
        // Check if we're on review questions page
        const showAllButton = document.querySelector('#showallquestions');
        if (showAllButton && !showAllButton.textContent.includes('Loading')) {
            showAllButton.click();
            
            // Wait for loading to complete
            const checkInterval = setInterval(() => {
                const button = document.querySelector('#showallquestions');
                if (!button || !button.textContent.includes('Loading')) {
                    clearInterval(checkInterval);
                    // Give a bit more time for DOM to settle
                    setTimeout(() => {
                        resolve();
                    }, 500);
                }
            }, 100);
            
            // Timeout after 30 seconds
            setTimeout(() => {
                clearInterval(checkInterval);
                resolve();
            }, 30000);
        } else {
            // No button or already loading/loaded
            resolve();
        }
    });
}


// Function to check if we're on the Review Questions page
function isOnReviewQuestionsPage() {
    // First check URL
    const urlParams = new URLSearchParams(window.location.search);
    const section = urlParams.get('section');
    
    if (section === 'review_questions') {
        return true;
    }
    
    // Check for specific elements that only appear on review questions page
    const hasShowAllButton = document.querySelector('#showallquestions') !== null;
    const hasReviewHeading = Array.from(document.querySelectorAll('h1, h2, h3')).some(h => 
        h.textContent.includes('Review questions') || h.textContent.includes('Review Questions')
    );
    const hasQuestionTable = document.querySelector('table') && 
                            Array.from(document.querySelectorAll('td')).some(td => 
                              td.innerHTML.includes('small_tick.gif') || td.innerHTML.includes('small_cross.gif')
                            );
    
    return hasShowAllButton || hasReviewHeading || hasQuestionTable;
}

// Function to extract questions from review table
function extractQuestionsFromReviewTable() {
    
    // First check if we're actually on the review questions page
    if (!isOnReviewQuestionsPage()) {
        return {
            daily: {},
            totalQuestions: 0,
            correctQuestions: 0,
            incorrectQuestions: 0,
            questions: []
        };
    }
    
    const questionsData = {
        daily: {},
        totalQuestions: 0,
        correctQuestions: 0,
        incorrectQuestions: 0,
        questions: []
    };
    
    // Look for the review questions table
    const reviewTables = document.querySelectorAll('table');
    
    for (const table of reviewTables) {
        const rows = table.querySelectorAll('tr');
        
        for (const row of rows) {
            const cells = row.querySelectorAll('td');
            
            if (cells.length >= 4) {
                // First cell contains the date
                const dateCell = cells[0];
                const dateText = dateCell.textContent.trim();
                
                // Check if this looks like a date (e.g., "22 Nov 25")
                if (dateText.match(/^\d{1,2}\s+\w{3}\s+\d{2}$/)) {
                    // Parse the date
                    const [day, monthAbbr, yearShort] = dateText.split(/\s+/);
                    const year = parseInt(yearShort) < 50 ? `20${yearShort}` : `19${yearShort}`;
                    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 
                                      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                    const monthIndex = monthNames.indexOf(monthAbbr);
                    
                    if (monthIndex !== -1) {
                        const dateObj = new Date(year, monthIndex, parseInt(day));
                        // Use local date format to avoid timezone issues
                        const dateKey = `${year}-${(monthIndex + 1).toString().padStart(2, '0')}-${day.padStart(2, '0')}`;
                        
                        // Check result - could be tick/cross or fraction for multi-part questions
                        const resultCell = cells[2];
                        const resultText = resultCell.textContent.trim();
                        const resultHTML = resultCell.innerHTML;
                        
                        // Check for fraction pattern (e.g., "1/3", "2/3", "3/3")
                        const fractionMatch = resultText.match(/(\d+)\s*\/\s*(\d+)/);
                        let correctParts = 0;
                        let totalParts = 1;
                        let hasResult = false;
                        
                        if (fractionMatch) {
                            // Multi-part question with partial score
                            correctParts = parseInt(fractionMatch[1]);
                            totalParts = parseInt(fractionMatch[2]);
                            hasResult = true;
                        } else if (resultHTML.includes('small_tick.gif')) {
                            // Single question correct
                            correctParts = 1;
                            totalParts = 1;
                            hasResult = true;
                        } else if (resultHTML.includes('small_cross.gif')) {
                            // Single question incorrect
                            correctParts = 0;
                            totalParts = 1;
                            hasResult = true;
                        }
                        
                        if (hasResult) {
                            // Extract question details
                            const questionCell = cells[1];
                            const titleMatch = questionCell.innerHTML.match(/<b>(.*?)<\/b>/);
                            const title = titleMatch ? titleMatch[1] : '';
                            
                            // Count difficulty (number of hammer icons)
                            const hammerCount = (questionCell.innerHTML.match(/icon-hammer/g) || []).length;
                            
                            // For multi-part questions, use the totalParts from the fraction
                            let questionCount = totalParts;
                            
                            // Double-check with EMQ badge if present
                            if (questionCell.innerHTML.includes('badge') && questionCell.innerHTML.includes('EMQ')) {
                                // EMQs should match the fraction denominator
                                if (totalParts === 1) {
                                    // Fraction not detected but EMQ badge present
                                    questionCount = 3;
                                }
                            }
                            
                            // Add to daily count
                            if (!questionsData.daily[dateKey]) {
                                questionsData.daily[dateKey] = { total: 0, correct: 0, incorrect: 0 };
                            }
                            
                            questionsData.daily[dateKey].total += questionCount;
                            questionsData.totalQuestions += questionCount;
                            
                            // Add correct and incorrect parts based on the fraction
                            questionsData.daily[dateKey].correct += correctParts;
                            questionsData.correctQuestions += correctParts;
                            
                            const incorrectParts = totalParts - correctParts;
                            questionsData.daily[dateKey].incorrect += incorrectParts;
                            questionsData.incorrectQuestions += incorrectParts;
                            
                            // Store question details
                            const isFullyCorrect = correctParts === totalParts;
                            const scoreText = totalParts > 1 ? `${correctParts}/${totalParts}` : (isFullyCorrect ? 'correct' : 'incorrect');
                            
                            questionsData.questions.push({
                                date: dateKey,
                                title: title,
                                difficulty: hammerCount,
                                correct: isFullyCorrect,
                                correctParts: correctParts,
                                totalParts: totalParts,
                                dateText: dateText,
                                questionCount: questionCount,
                                isMultiPart: questionCount > 1
                            });
                            
                        }
                    }
                }
            }
        }
    }
    
    
    // Add success indicator if data was found
    if (questionsData.totalQuestions > 0) {
    } else if (isOnReviewQuestionsPage()) {
    } else {
    }
    
    return questionsData;
}

// Removed heatmap extraction function - only using Review Questions data

// Function to send data to background script
function sendProgressData(data) {
    chrome.runtime.sendMessage({
        action: 'saveProgress',
        data: data
    }, response => {
    });
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'extractProgress') {
        // Only use Review Questions data
        const reviewData = extractQuestionsFromReviewTable();
        if (reviewData.totalQuestions > 0) {
            // Convert review data format
            const mergedDaily = {};
            for (const [date, stats] of Object.entries(reviewData.daily)) {
                mergedDaily[date] = stats.total;
            }
            
            const mergedData = {
                daily: mergedDaily,
                totalQuestions: reviewData.totalQuestions,
                todayQuestions: 0, // Review table doesn't have today's live count
                correctQuestions: reviewData.correctQuestions,
                incorrectQuestions: reviewData.incorrectQuestions,
                extractedAt: new Date().toISOString(),
                source: 'review_table'
            };
            
            sendResponse({ success: true, data: mergedData });
        } else {
            // Try to get stored data
            chrome.storage.local.get(['lastReviewData'], (storedData) => {
                if (storedData.lastReviewData) {
                    const mergedDaily = {};
                    for (const [date, stats] of Object.entries(storedData.lastReviewData.daily)) {
                        mergedDaily[date] = stats.total;
                    }
                    
                    const mergedData = {
                        daily: mergedDaily,
                        totalQuestions: storedData.lastReviewData.totalQuestions,
                        todayQuestions: 0,
                        correctQuestions: storedData.lastReviewData.correctQuestions,
                        incorrectQuestions: storedData.lastReviewData.incorrectQuestions,
                        extractedAt: new Date().toISOString(),
                        source: 'review_table_stored'
                    };
                    
                    sendResponse({ success: true, data: mergedData });
                } else {
                    sendResponse({ success: false, error: 'No Review Questions data available' });
                }
            });
            return true; // Keep channel open
        }
    } else if (request.action === 'extractReviewQuestions') {
        const data = extractQuestionsFromReviewTable();
        sendResponse({ success: true, data: data });
    } else if (request.action === 'extractReviewQuestionsWithAll') {
        waitForAllQuestionsToLoad().then(() => {
            const data = extractQuestionsFromReviewTable();
            sendResponse({ success: true, data: data });
        });
        return true; // Keep channel open for async response
    } else if (request.action === 'extractAllData') {
        // First check for stored review data
        chrome.storage.local.get(['lastReviewData'], (storedData) => {
            let reviewData = extractQuestionsFromReviewTable();
            
            // Use stored review data if current extraction returns nothing
            if (reviewData.totalQuestions === 0 && storedData.lastReviewData) {
                reviewData = storedData.lastReviewData;
            }
            
            // Only use Review Questions data
            if (reviewData.totalQuestions > 0) {
                
                // Show Nov 22 summary if any questions found
                const nov22Questions = reviewData.questions.filter(q => q.dateText === '22 Nov 25');
                if (nov22Questions.length > 0) {
                    const nov22Stats = reviewData.daily['2025-11-22'];
                    if (nov22Stats) {
                    }
                }
            
                // Convert review data format
                const mergedDaily = {};
                for (const [date, stats] of Object.entries(reviewData.daily)) {
                    mergedDaily[date] = stats.total;
                }
                
                const mergedData = {
                    daily: mergedDaily,
                    totalQuestions: reviewData.totalQuestions,
                    todayQuestions: 0, // Review table doesn't have real-time today count
                    correctQuestions: reviewData.correctQuestions,
                    incorrectQuestions: reviewData.incorrectQuestions,
                    extractedAt: new Date().toISOString(),
                    source: 'review_table'
                };
                
                sendResponse({ success: true, data: mergedData, reviewData: reviewData });
            } else {
                sendResponse({ success: false, error: 'No Review Questions data available. Please visit Review Questions page.' });
            }
        });
        return true; // Keep channel open for async response
    } else if (request.action === 'updateThemeColor') {
        // Update button color when changed from popup
        const button = document.querySelector('#passmed-tracker-button button');
        if (button) {
            button.style.backgroundColor = request.color;
            button.dataset.themeColor = request.color;
        }
    }
    return true; // Keep message channel open for async response
});

// Debug helper: Press Ctrl+Shift+D to dump storage contents
document.addEventListener('keydown', async (e) => {
    if (e.ctrlKey && e.shiftKey && e.key === 'D') {
        const localData = await chrome.storage.local.get(null);
        const syncData = await chrome.storage.sync.get(null);
    }
});

// Auto-extract when page loads - only updates local cache, does NOT sync to storage
// User must press Sync button to actually sync data
window.addEventListener('load', () => {
    // Wait a bit for dynamic content to load
    setTimeout(async () => {
        // Not on review questions page - try to use stored data for UI display only
        if (!isOnReviewQuestionsPage()) {
            const storedData = await chrome.storage.local.get(['lastReviewData']);
            if (storedData.lastReviewData) {
                const dailyData = {};
                for (const [date, stats] of Object.entries(storedData.lastReviewData.daily)) {
                    dailyData[date] = stats.total;
                }

                chrome.storage.local.set({
                    lastExtractedData: {
                        daily: dailyData,
                        totalQuestions: storedData.lastReviewData.totalQuestions,
                        correctQuestions: storedData.lastReviewData.correctQuestions,
                        incorrectQuestions: storedData.lastReviewData.incorrectQuestions,
                        extractedAt: new Date().toISOString(),
                        source: 'review_table_stored'
                    }
                });
            }
        }
        // Removed auto-extraction on Review Questions page - user must press Sync button
    }, 2000);
    
    // Also check if button needs color update after load
    setTimeout(async () => {
        const button = document.querySelector('#passmed-tracker-button button');
        if (button) {
            const themeResult = await chrome.storage.local.get(['theme']);
            if (themeResult.theme && themeResult.theme.primary && themeResult.theme.primary !== '#0ABAB5') {
                button.style.backgroundColor = themeResult.theme.primary;
                button.dataset.themeColor = themeResult.theme.primary;
            }
        }
    }, 1000);
});

// Removed navigation function - we don't want to force navigation

// Background fetch is not possible - PassMed loads content dynamically
// User must visit Review Questions page at least once

// Function to extract questions from HTML document (not current page)
function extractQuestionsFromHTML(doc) {
    const questionsData = {
        daily: {},
        totalQuestions: 0,
        correctQuestions: 0,
        incorrectQuestions: 0,
        questions: []
    };
    
    // Same extraction logic but using the provided document
    const reviewTables = doc.querySelectorAll('table');
    
    for (const table of reviewTables) {
        const rows = table.querySelectorAll('tr');
        
        for (const row of rows) {
            const cells = row.querySelectorAll('td');
            
            if (cells.length >= 4) {
                const dateCell = cells[0];
                const dateText = dateCell.textContent.trim();
                
                if (dateText.match(/^\d{1,2}\s+\w{3}\s+\d{2}$/)) {
                    const [day, monthAbbr, yearShort] = dateText.split(/\s+/);
                    const year = parseInt(yearShort) < 50 ? `20${yearShort}` : `19${yearShort}`;
                    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 
                                      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                    const monthIndex = monthNames.indexOf(monthAbbr);
                    
                    if (monthIndex !== -1) {
                        const dateObj = new Date(year, monthIndex, parseInt(day));
                        // Use local date format to avoid timezone issues
                        const dateKey = `${year}-${(monthIndex + 1).toString().padStart(2, '0')}-${day.padStart(2, '0')}`;
                        
                        const resultCell = cells[2];
                        const resultText = resultCell.textContent.trim();
                        const resultHTML = resultCell.innerHTML;
                        
                        const fractionMatch = resultText.match(/(\d+)\s*\/\s*(\d+)/);
                        let correctParts = 0;
                        let totalParts = 1;
                        let hasResult = false;
                        
                        if (fractionMatch) {
                            correctParts = parseInt(fractionMatch[1]);
                            totalParts = parseInt(fractionMatch[2]);
                            hasResult = true;
                        } else if (resultHTML.includes('small_tick.gif')) {
                            correctParts = 1;
                            totalParts = 1;
                            hasResult = true;
                        } else if (resultHTML.includes('small_cross.gif')) {
                            correctParts = 0;
                            totalParts = 1;
                            hasResult = true;
                        }
                        
                        if (hasResult) {
                            const questionCell = cells[1];
                            const titleMatch = questionCell.innerHTML.match(/<b>(.*?)<\/b>/);
                            const title = titleMatch ? titleMatch[1] : '';
                            
                            const hammerCount = (questionCell.innerHTML.match(/icon-hammer/g) || []).length;
                            
                            let questionCount = totalParts;
                            
                            if (questionCell.innerHTML.includes('badge') && questionCell.innerHTML.includes('EMQ')) {
                                if (totalParts === 1) {
                                    questionCount = 3;
                                }
                            }
                            
                            if (!questionsData.daily[dateKey]) {
                                questionsData.daily[dateKey] = { total: 0, correct: 0, incorrect: 0 };
                            }
                            
                            questionsData.daily[dateKey].total += questionCount;
                            questionsData.totalQuestions += questionCount;
                            
                            questionsData.daily[dateKey].correct += correctParts;
                            questionsData.correctQuestions += correctParts;
                            
                            const incorrectParts = totalParts - correctParts;
                            questionsData.daily[dateKey].incorrect += incorrectParts;
                            questionsData.incorrectQuestions += incorrectParts;
                            
                            const isFullyCorrect = correctParts === totalParts;
                            const scoreText = totalParts > 1 ? `${correctParts}/${totalParts}` : (isFullyCorrect ? 'correct' : 'incorrect');
                            
                            questionsData.questions.push({
                                date: dateKey,
                                title: title,
                                difficulty: hammerCount,
                                correct: isFullyCorrect,
                                correctParts: correctParts,
                                totalParts: totalParts,
                                dateText: dateText,
                                questionCount: questionCount,
                                isMultiPart: questionCount > 1
                            });
                            
                        }
                    }
                }
            }
        }
    }
    
    return questionsData;
}

// Auto-sync function
async function autoSyncData() {
    let reviewData = { daily: {}, totalQuestions: 0, correctQuestions: 0, incorrectQuestions: 0, questions: [] };
    
    // If we're on review questions page, extract directly
    if (isOnReviewQuestionsPage()) {
        const showAllButton = document.querySelector('#showallquestions');
        if (showAllButton && !showAllButton.textContent.includes('Loading')) {
            showAllButton.click();
            await waitForAllQuestionsToLoad();
        }
        
        reviewData = extractQuestionsFromReviewTable();
    } else {
        // Not on Review Questions page - use stored data
        const storedData = await chrome.storage.local.get(['lastReviewData', 'lastReviewDataDate']);
        if (storedData.lastReviewData) {
            reviewData = storedData.lastReviewData;
            
            // Check how old the data is
            if (storedData.lastReviewDataDate) {
                const lastUpdate = new Date(storedData.lastReviewDataDate);
                const now = new Date();
                const hoursSinceUpdate = (now - lastUpdate) / (1000 * 60 * 60);
                
                if (hoursSinceUpdate > 24) {
                }
            }
        } else {
        }
    }
    
    let dataToSync;
    let source = 'Review Table';
    
    if (reviewData && reviewData.totalQuestions > 0) {
        // Store the full review data for button updates
        const today = getLocalDateString();
        const todayCount = reviewData.daily[today] ? reviewData.daily[today].total : 0;
        
        chrome.storage.local.set({ 
            lastReviewData: reviewData,
            lastReviewDataDate: new Date().toISOString(),
            todayQuestions: todayCount,
            todayQuestionsDate: today
        });
        
        // Convert review data format
        const dailyData = {};
        for (const [date, stats] of Object.entries(reviewData.daily)) {
            dailyData[date] = stats.total;
        }
        
        dataToSync = {
            daily: dailyData,
            totalQuestions: reviewData.totalQuestions,
            correctQuestions: reviewData.correctQuestions,
            incorrectQuestions: reviewData.incorrectQuestions,
            source: 'review_table'
        };
    } else {
        return;
    }
    
    if (dataToSync && Object.keys(dataToSync.daily).length > 0) {
        
        // Send directly to background for syncing
        chrome.runtime.sendMessage({
            action: 'syncToTracker',
            data: dataToSync,
            auto: true
        }, response => {
            if (response && response.success) {
                // Store last sync time
                chrome.storage.local.set({ 
                    lastExtractedData: dataToSync,
                    lastSyncTime: new Date().toISOString(),
                    lastAutoSync: new Date().toISOString(),
                    lastSyncSource: source
                });
            }
        });
    }
}

// Function to prompt user to visit Review Questions for fresh data
async function checkForReviewDataFreshness() {
    const storedData = await chrome.storage.local.get(['lastReviewDataDate']);
    
    if (!storedData.lastReviewDataDate) {
        return false;
    }
    
    const lastUpdate = new Date(storedData.lastReviewDataDate);
    const now = new Date();
    const hoursSinceUpdate = (now - lastUpdate) / (1000 * 60 * 60);
    
    if (hoursSinceUpdate > 24) {
        return false;
    }
    
    return true;
}

// Function to handle automatic data extraction
async function handleAutoDataExtraction() {
    // Check if we're in the middle of a sync process
    const storage = await chrome.storage.local.get(['syncInProgress']);
    
    if (storage.syncInProgress && isOnReviewQuestionsPage()) {
        
        // Clear the sync flag
        await chrome.storage.local.remove(['syncInProgress']);
        
        // Show the sync button in loading state
        const syncButton = document.getElementById('passmed-sync-button');
        if (syncButton) {
            syncButton.innerHTML = `
                <style>
                    @keyframes spin {
                        from { transform: rotate(0deg); }
                        to { transform: rotate(360deg); }
                    }
                </style>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px; vertical-align: middle; animation: spin 1s linear infinite;">
                    <path d="M21 12a9 9 0 11-6.219-8.56"/>
                </svg>
                <span style="vertical-align: middle;">Syncing...</span>
            `;
            syncButton.style.background = 'linear-gradient(135deg, #2196F3 0%, #1976D2 50%, #1565C0 100%)';
            syncButton.disabled = true;
        }
        
        // Wait for page to load and extract data
        setTimeout(async () => {
            // Check for "Show all questions" button and click it
            const showAllButton = document.querySelector('#showallquestions');
            if (showAllButton && !showAllButton.textContent.includes('Loading')) {
                showAllButton.click();
                await waitForAllQuestionsToLoad();
            }
            
            // Extract data
            setTimeout(async () => {
                    const reviewData = extractQuestionsFromReviewTable();
                    
                if (reviewData.totalQuestions > 0) {
                    // Save data
                    const today = getLocalDateString();
                    const todayCount = reviewData.daily[today] ? reviewData.daily[today].total : 0;
                    
                    await chrome.storage.local.set({ 
                        lastReviewData: reviewData,
                        lastReviewDataDate: new Date().toISOString(),
                        todayQuestions: todayCount,
                        todayQuestionsDate: today
                    });
                    
                    // Sync data
                    await autoSyncData();
                    
                    // Update the floating button with new count
                    const floatingButton = document.getElementById('passmed-tracker-button');
                    if (floatingButton) {
                        const buttonElement = floatingButton.querySelector('button');
                        if (buttonElement) {
                            await updateButtonWithTodayStats(buttonElement);
                        }
                    }
                    
                    // Show success notification with strong gradient
                    const notification = document.createElement('div');
                    notification.style.cssText = `
                        position: fixed;
                        top: 70px;
                        left: calc(50% + 60px);
                        transform: translateX(-50%);
                        background: linear-gradient(135deg, #4CAF50 0%, #45a049 50%, #388E3C 100%);
                        color: white;
                        padding: 15px 30px;
                        border-radius: 8px;
                        font-size: 16px;
                        font-weight: 600;
                        z-index: 10000;
                        box-shadow: 0 4px 8px rgba(0,0,0,0.2);
                    `;
                    notification.innerHTML = `
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="display: inline-block; vertical-align: middle; margin-right: 8px;">
                            <polyline points="20 6 9 17 4 12"></polyline>
                        </svg>
                        <span style="vertical-align: middle;">Synced: ${reviewData.totalQuestions} questions from Review Table</span>
                    `;
                    document.body.appendChild(notification);
                    
                    // Remove notification after 3 seconds
                    setTimeout(() => notification.remove(), 3000);
                    
                    // Update tracker button
                    const trackerButton = document.querySelector('#passmed-tracker-button button');
                    if (trackerButton) {
                        await updateButtonWithTodayStats(trackerButton);
                    }
                }
                
                // Reset sync button
                if (syncButton) {
                    syncButton.innerHTML = `
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px; vertical-align: middle;">
                            <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.3"/>
                        </svg>
                        <span style="vertical-align: middle;">Sync Progress</span>
                    `;
                    syncButton.style.background = 'linear-gradient(135deg, #4CAF50 0%, #45a049 50%, #388E3C 100%)';
                    syncButton.disabled = false;
                }
            }, 1000);
        }, 2000);
    }
    // Removed auto-sync on Review Questions page - user must press Sync button
}

// Always call handleAutoDataExtraction when page loads
// Use both DOMContentLoaded and load to ensure it runs
if (document.readyState === 'complete') {
    setTimeout(async () => {
        await handleAutoDataExtraction();
        // Removed auto-sync - user must press Sync button
    }, 2000);
} else {
    window.addEventListener('load', () => {
        setTimeout(async () => {
            await handleAutoDataExtraction();

            // Removed auto-sync - user must press Sync button

            // Update button with stored review data if available
            const button = document.querySelector('#passmed-tracker-button button');
            if (button) {
                updateButtonWithTodayStats(button);
            }

            // Also inject both buttons
            injectTrackerButton();
            injectSyncButton();
        }, 2000); // Wait 2 seconds for any dynamic content
    });
}

// Also try to detect AJAX updates - but only for UI updates, not auto-sync
const observer = new MutationObserver((mutations) => {
    // Debounce to avoid too many extractions
    clearTimeout(window.extractTimeout);
    window.extractTimeout = setTimeout(() => {
        // Track page navigation for UI updates only
        if (isOnReviewQuestionsPage() && !window.wasOnReviewPage) {
            window.wasOnReviewPage = true;
        } else if (!isOnReviewQuestionsPage() && window.wasOnReviewPage) {
            window.wasOnReviewPage = false;
        }
        // Removed auto-sync - user must press Sync button
    }, 1000);
});

// Start observing for dynamic content changes
observer.observe(document.body, {
    childList: true,
    subtree: true
});

// Also listen for navigation within the SPA
let lastPageType = null;
setInterval(() => {
    const currentlyOnReview = isOnReviewQuestionsPage();
    const currentPageType = currentlyOnReview ? 'review' : 'other';

    if (currentPageType !== lastPageType) {
        if (currentlyOnReview) {
            // Check if this is part of auto-extraction (from Sync button click)
            chrome.storage.local.get(['autoExtractInProgress'], async (data) => {
                if (data.autoExtractInProgress) {
                    // This is auto-extraction from Sync button - handle it
                    await handleAutoDataExtraction();
                }
                // Removed auto-sync on regular navigation - user must press Sync button
            });
        }
        lastPageType = currentPageType;

        // Always ensure both buttons are present on any navigation
        injectTrackerButton();
        injectSyncButton();
    }
}, 1000); // Check every second for page changes