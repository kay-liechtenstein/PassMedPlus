// Popup script for PassMed Progress Tracker
// Version: 2.0 - Fixed extractBtn reference

// Wait for DOM to be ready
document.addEventListener('DOMContentLoaded', () => {
    // DOM elements
    const statusDiv = document.getElementById('status');
    const dataDiv = document.getElementById('data');
    const viewBtn = document.getElementById('viewBtn');

    // Check if on PassMed and show stored data
    async function initialize() {
        // Load saved color preference
        await loadColorPreference();
        
        // Display stored data
        await displayStoredData();
        
        // Check current tab
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        const isPassMed = tab.url && tab.url.includes('passmedicine.com');
        
        if (isPassMed) {
            // Don't show any auto-sync message, just hide the status
            statusDiv.style.display = 'none';
        } else {
            // Still show data even if not on PassMed
            const hasData = await chrome.storage.sync.get(['progressData']);
            if (hasData.progressData && Object.keys(hasData.progressData.daily || {}).length > 0) {
                statusDiv.textContent = 'Showing saved progress data';
                statusDiv.className = 'status success';
            } else {
                statusDiv.textContent = 'Visit PassMed to start tracking';
                statusDiv.className = 'status warning';
            }
        }
    }
    
    // Load and apply color preference
    async function loadColorPreference() {
        // Check for theme from dashboard first
        const themeResult = await chrome.storage.local.get(['theme']);
        let color = '#0ABAB5'; // Default to tiffany blue
        
        if (themeResult.theme && themeResult.theme.primary) {
            color = themeResult.theme.primary;
        } else {
            // Fallback to old themeColor
            const result = await chrome.storage.sync.get(['themeColor']);
            color = result.themeColor || '#0ABAB5';
        }
        
        applyThemeColor(color);
    }
    
    // Function to darken a color
    function darkenColor(color, amount = 0.2) {
        const num = parseInt(color.replace('#', ''), 16);
        const r = Math.max(0, (num >> 16) * (1 - amount));
        const g = Math.max(0, ((num & 0x0000FF00) >> 8) * (1 - amount));
        const b = Math.max(0, (num & 0x000000FF) * (1 - amount));
        return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
    }
    
    // Function to lighten a color
    function lightenColor(color, amount = 0.2) {
        const num = parseInt(color.replace('#', ''), 16);
        const r = Math.min(255, Math.floor((num >> 16) + (255 - (num >> 16)) * amount));
        const g = Math.min(255, Math.floor(((num & 0x0000FF00) >> 8) + (255 - ((num & 0x0000FF00) >> 8)) * amount));
        const b = Math.min(255, Math.floor((num & 0x000000FF) + (255 - (num & 0x000000FF)) * amount));
        return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
    }
    
    // Apply theme color to popup elements
    function applyThemeColor(color) {
        // Update CSS variables or directly update elements
        document.documentElement.style.setProperty('--theme-color', color);
        document.documentElement.style.setProperty('--theme-color-dark', darkenColor(color));
        
        // Add gradient to body background - make it more prominent
        const bodyLightColor = lightenColor(color, 0.85);
        const bodyLighterColor = lightenColor(color, 0.95);
        document.body.style.background = `linear-gradient(135deg, #ffffff 0%, ${bodyLighterColor} 40%, ${bodyLightColor} 100%)`;
        
        // Also update content area with subtle gradient
        const content = document.querySelector('.content');
        if (content) {
            content.style.background = `linear-gradient(135deg, rgba(255,255,255,0.8) 0%, rgba(255,255,255,0.6) 100%)`;
            content.style.backdropFilter = 'blur(10px)';
        }
        
        // Update header with gradient
        const header = document.querySelector('.header');
        if (header) {
            const darkColor = darkenColor(color, 0.2);
            const darkestColor = darkenColor(color, 0.4);
            header.style.background = `linear-gradient(135deg, ${color} 0%, ${darkColor} 50%, ${darkestColor} 100%)`;
        }
        
        // Update primary button with gradient
        const primaryButtons = document.querySelectorAll('.button-primary');
        primaryButtons.forEach(btn => {
            const darkColor = darkenColor(color, 0.2);
            const darkestColor = darkenColor(color, 0.4);
            btn.style.background = `linear-gradient(135deg, ${color} 0%, ${darkColor} 50%, ${darkestColor} 100%)`;
            
            // Add hover listeners
            btn.onmouseenter = () => {
                const hoverDark = darkenColor(color, 0.3);
                const hoverDarkest = darkenColor(color, 0.5);
                btn.style.background = `linear-gradient(135deg, ${color} 0%, ${hoverDark} 50%, ${hoverDarkest} 100%)`;
            };
            btn.onmouseleave = () => {
                btn.style.background = `linear-gradient(135deg, ${color} 0%, ${darkColor} 50%, ${darkestColor} 100%)`;
            };
        });
        
        // Update stat values with gradient
        const statValues = document.querySelectorAll('.stat-value');
        statValues.forEach(val => {
            if (!val.parentElement.classList.contains('today-stat')) {
                const statDark = darkenColor(color, 0.2);
                const statDarkest = darkenColor(color, 0.4);
                val.style.background = `linear-gradient(135deg, ${color} 0%, ${statDark} 50%, ${statDarkest} 100%)`;
                val.style.webkitBackgroundClip = 'text';
                val.style.webkitTextFillColor = 'transparent';
                val.style.backgroundClip = 'text';
                val.style.display = 'inline-block';
                val.style.lineHeight = '1.2';
            }
        });
    }

    // Display data from Chrome storage
    async function displayStoredData() {
        try {
            const response = await chrome.runtime.sendMessage({ action: 'getProgressData' });
            if (!response || !response.success) {
                throw new Error('Failed to get data from background script');
            }
            const data = response.data || { daily: {} };
            
            // Also get today's questions from local storage
            const localData = await chrome.storage.local.get(['todayQuestions', 'todayQuestionsDate']);
            const today = new Date().toISOString().split('T')[0];
            const todayQuestions = (localData.todayQuestionsDate === today) ? localData.todayQuestions : 0;
            
            const activeDays = Object.keys(data.daily).length;
            const totalQuestions = Object.values(data.daily).reduce((sum, count) => sum + count, 0);

            // Calculate total days from first record to today (including inactive days)
            const dates = Object.keys(data.daily).sort();
            const firstDate = new Date(dates[0]);
            const todayDate = new Date();
            todayDate.setHours(0, 0, 0, 0);
            firstDate.setHours(0, 0, 0, 0);
            const totalDays = Math.floor((todayDate - firstDate) / (1000 * 60 * 60 * 24)) + 1;

            if (activeDays > 0) {
                // Get recent entries
                const recentEntries = Object.entries(data.daily)
                    .sort((a, b) => new Date(b[0]) - new Date(a[0]))
                    .slice(0, 5);
                
                let html = `
                    <div class="stats">
                        ${todayQuestions > 0 ? `
                        <div class="stat-item today-stat">
                            <div class="stat-value">${todayQuestions}</div>
                            <div class="stat-label">Questions Today</div>
                        </div>
                        ` : ''}
                        <div class="stat-item">
                            <div class="stat-value">${activeDays}</div>
                            <div class="stat-label">Active Days</div>
                        </div>
                        <div class="stat-item">
                            <div class="stat-value">${totalQuestions}</div>
                            <div class="stat-label">Total Questions</div>
                        </div>
                        <div class="stat-item">
                            <div class="stat-value">${(totalQuestions / totalDays).toFixed(1)}</div>
                            <div class="stat-label">Average/Day</div>
                        </div>
                    </div>
                    <h3>Recent Activity</h3>
                    <div class="recent-list">
                `;
                
                recentEntries.forEach(([date, count]) => {
                    const dateObj = new Date(date);
                    const formatted = dateObj.toLocaleDateString('en-US', { 
                        weekday: 'short', 
                        month: 'short', 
                        day: 'numeric' 
                    });
                    html += `<div class="recent-item">
                        <span>${formatted}</span>
                        <span>${count} questions</span>
                    </div>`;
                });
                
                html += '</div>';
                
                if (data.lastSync) {
                    const syncDate = new Date(data.lastSync);
                    const dateStr = syncDate.toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric'
                    });
                    const timeStr = syncDate.toLocaleTimeString('en-GB', {
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: false
                    });
                    html += `<div class="last-sync">Last updated: ${dateStr} at ${timeStr}</div>`;
                }
                
                dataDiv.innerHTML = html;
                
                // Reapply theme color to new elements
                const themeResult = await chrome.storage.local.get(['theme']);
                let color = '#0ABAB5';
                
                if (themeResult.theme && themeResult.theme.primary) {
                    color = themeResult.theme.primary;
                } else {
                    const result = await chrome.storage.sync.get(['themeColor']);
                    color = result.themeColor || '#0ABAB5';
                }
                
                applyThemeColor(color);
            } else {
                dataDiv.innerHTML = '<p>No data stored yet. Visit PassMed and data will sync automatically!</p>';
            }
        } catch (error) {
            dataDiv.innerHTML = '<p>Error loading data</p>';
        }
    }

    // View progress button
    if (viewBtn) {
        viewBtn.addEventListener('click', () => {
            // Open the viewer in a new tab
            chrome.tabs.create({ url: chrome.runtime.getURL('viewer.html') });
        });
    } else {
    }

    // Initialize on load
    initialize();
    
    // Listen for refresh messages from content script
    window.addEventListener('message', (event) => {
        if (event.data && event.data.action === 'refreshData') {
            displayStoredData();
        }
    });

}); // End DOMContentLoaded