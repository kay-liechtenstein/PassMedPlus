// Viewer script for PassMed Progress Dashboard
let progressData = { daily: {} };
let charts = {};
let currentDailyRange = 7; // Track the current selected range

// Initialize the dashboard
async function initDashboard() {
    try {
        // Load theme first, before creating charts
        await loadSavedTheme();
        
        // Load saved daily range preference
        const savedPrefs = await chrome.storage.local.get(['dailyChartRange']);
        if (savedPrefs.dailyChartRange) {
            currentDailyRange = savedPrefs.dailyChartRange;
        }
        
        // Get data from Chrome storage
        const response = await chrome.runtime.sendMessage({ action: 'getProgressData' });
        
        if (!response || !response.success) {
            throw new Error('Failed to get data from background script');
        }
        
        progressData = response.data || { daily: {} };
        
        const hasData = Object.keys(progressData.daily).length > 0;
        
        // Update UI
        document.getElementById('loading').style.display = 'none';
        
        if (hasData) {
            document.getElementById('content').style.display = 'block';
            document.getElementById('noData').style.display = 'none';
            
            updateStats();
            // Small delay to ensure CSS is applied
            setTimeout(() => {
                initCharts();
                // Restore button active states
                restoreButtonStates();
            }, 10);
            updateSyncStatus();
        } else {
            document.getElementById('content').style.display = 'none';
            document.getElementById('noData').style.display = 'block';
            document.getElementById('syncStatus').textContent = 'No data synced yet. Visit PassMed to start tracking!';
        }
    } catch (error) {
        document.getElementById('loading').textContent = 'Error loading data. Please check the extension.';
        document.getElementById('syncStatus').textContent = 'Error: ' + error.message;
    }
}

// Update statistics
function updateStats() {
    const dates = Object.keys(progressData.daily).sort();
    const totalQuestions = Object.values(progressData.daily).reduce((sum, count) => sum + count, 0);
    const daysActive = dates.length;
    const avgPerDay = daysActive > 0 ? (totalQuestions / daysActive).toFixed(1) : '0';
    
    // Get today's questions
    const today = new Date().toISOString().split('T')[0];
    const todayQuestions = progressData.daily[today] || 0;
    
    // Calculate current streak
    let streak = 0;
    const todayDate = new Date();
    todayDate.setHours(0, 0, 0, 0);
    
    for (let i = 0; i < 365; i++) {
        const checkDate = new Date(todayDate);
        checkDate.setDate(checkDate.getDate() - i);
        const dateStr = checkDate.toISOString().split('T')[0];
        
        if (progressData.daily[dateStr]) {
            streak++;
        } else if (i > 0) { // Don't break on first day (today) if no data
            break;
        }
    }
    
    document.getElementById('todayQuestions').textContent = todayQuestions.toLocaleString();
    document.getElementById('totalQuestions').textContent = totalQuestions.toLocaleString();
    document.getElementById('daysActive').textContent = daysActive;
    document.getElementById('avgPerDay').textContent = avgPerDay;
    document.getElementById('currentStreak').textContent = streak;
}

// Update sync status
function updateSyncStatus() {
    const syncDate = progressData.lastSync ? new Date(progressData.lastSync) : null;
    const message = syncDate 
        ? `Last synced: ${syncDate.toLocaleString()}.`
        : 'Data stored locally in Chrome.';
    
    document.getElementById('syncStatus').textContent = message;
}

// Initialize charts
function initCharts() {
    
    // Destroy existing charts if any
    if (charts.daily) {
        charts.daily.destroy();
    }
    if (charts.weekly) {
        charts.weekly.destroy();
    }
    if (charts.cumulative) {
        charts.cumulative.destroy();
    }
    
    // Daily progress chart
    const dailyCanvas = document.getElementById('dailyChart');
    if (!dailyCanvas) {
        return;
    }
    
    const dailyCtx = dailyCanvas.getContext('2d');
    const dailyData = getDailyData(currentDailyRange);
    
    // Create gradient for bars
    const gradient = dailyCtx.createLinearGradient(0, 0, 0, 400);
    const primaryColor = getComputedStyle(document.documentElement).getPropertyValue('--primary-color') || '#0ABAB5';
    const darkColor = getComputedStyle(document.documentElement).getPropertyValue('--primary-dark') || '#089A96';
    
    gradient.addColorStop(0, primaryColor);
    gradient.addColorStop(0.5, darkColor);
    gradient.addColorStop(1, primaryColor + '80'); // 50% opacity
    
    // Apply gradient to daily data
    dailyData.datasets[0].backgroundColor = gradient;
    dailyData.datasets[0].borderWidth = 0;
    dailyData.datasets[0].borderRadius = 0;
    dailyData.datasets[0].borderSkipped = false;
    
    charts.daily = new Chart(dailyCtx, {
        type: 'bar',
        data: dailyData,
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: {
                duration: 800
            },
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Questions Completed'
                    },
                    grid: {
                        display: true,
                        drawBorder: false,
                        color: 'rgba(0, 0, 0, 0.05)'
                    }
                },
                x: {
                    grid: {
                        display: false
                    }
                }
            },
            plugins: {
                legend: {
                    display: false
                }
            }
        }
    });
    
    // Weekly progress chart
    const weeklyCanvas = document.getElementById('weeklyChart');
    if (!weeklyCanvas) {
        return;
    }
    
    const weeklyCtx = weeklyCanvas.getContext('2d');
    const weeklyData = getWeeklyData();
    
    // Create gradient for weekly chart background
    const weeklyGradient = weeklyCtx.createLinearGradient(0, 0, 0, 400);
    weeklyGradient.addColorStop(0, primaryColor + '60');
    weeklyGradient.addColorStop(0.5, primaryColor + '30');
    weeklyGradient.addColorStop(1, primaryColor + '05');
    
    // Create gradient for the line itself - more dramatic
    const weeklyLineGradient = weeklyCtx.createLinearGradient(0, 0, weeklyCanvas.width, 0);
    weeklyLineGradient.addColorStop(0, primaryColor);
    weeklyLineGradient.addColorStop(0.25, darkColor);
    weeklyLineGradient.addColorStop(0.5, lightenColor(primaryColor, 0.3));
    weeklyLineGradient.addColorStop(0.75, darkColor);
    weeklyLineGradient.addColorStop(1, primaryColor);
    
    weeklyData.datasets[0].backgroundColor = weeklyGradient;
    weeklyData.datasets[0].borderColor = weeklyLineGradient;
    weeklyData.datasets[0].borderWidth = 4;
    weeklyData.datasets[0].pointBackgroundColor = primaryColor;
    weeklyData.datasets[0].pointBorderColor = '#fff';
    weeklyData.datasets[0].pointBorderWidth = 3;
    weeklyData.datasets[0].pointRadius = 6;
    weeklyData.datasets[0].pointHoverRadius = 8;
    
    charts.weekly = new Chart(weeklyCtx, {
        type: 'line',
        data: weeklyData,
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: {
                duration: 800
            },
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Questions per Week'
                    }
                }
            }
        }
    });
    
    // Cumulative progress chart
    const cumulativeCanvas = document.getElementById('cumulativeChart');
    if (!cumulativeCanvas) {
        return;
    }
    
    const cumulativeCtx = cumulativeCanvas.getContext('2d');
    const cumulativeData = getCumulativeData();
    
    // Create gradient for cumulative chart background
    const cumulativeGradient = cumulativeCtx.createLinearGradient(0, 0, 0, 400);
    cumulativeGradient.addColorStop(0, primaryColor + '60');
    cumulativeGradient.addColorStop(0.5, primaryColor + '30');
    cumulativeGradient.addColorStop(1, primaryColor + '05');
    
    // Create gradient for the line itself - very dramatic with contrasting colors
    const cumulativeLineGradient = cumulativeCtx.createLinearGradient(0, 0, cumulativeCanvas.width, 0);
    cumulativeLineGradient.addColorStop(0, darkColor);
    cumulativeLineGradient.addColorStop(0.2, lightenColor(primaryColor, 0.4));
    cumulativeLineGradient.addColorStop(0.4, darkColor);
    cumulativeLineGradient.addColorStop(0.6, primaryColor);
    cumulativeLineGradient.addColorStop(0.8, darkenColor(primaryColor, 0.4));
    cumulativeLineGradient.addColorStop(1, lightenColor(primaryColor, 0.3));
    
    cumulativeData.datasets[0].backgroundColor = cumulativeGradient;
    cumulativeData.datasets[0].borderColor = cumulativeLineGradient;
    cumulativeData.datasets[0].borderWidth = 4;
    cumulativeData.datasets[0].pointBackgroundColor = primaryColor;
    cumulativeData.datasets[0].pointBorderColor = '#fff';
    cumulativeData.datasets[0].pointBorderWidth = 3;
    cumulativeData.datasets[0].pointRadius = 6;
    cumulativeData.datasets[0].pointHoverRadius = 8;
    
    charts.cumulative = new Chart(cumulativeCtx, {
        type: 'line',
        data: cumulativeData,
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: {
                duration: 800
            },
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Total Questions'
                    }
                }
            }
        }
    });
}

// Get daily data for chart
function getDailyData(days) {
    const dates = [];
    const values = [];
    
    if (days === 'all') {
        // Show all days from first activity to today (including days with 0 questions)
        const allDates = Object.keys(progressData.daily).sort();
        if (allDates.length > 0) {
            const firstDate = new Date(allDates[0]);
            const today = new Date();
            
            // Generate all days from first to today
            const currentDate = new Date(firstDate);
            while (currentDate <= today) {
                const dateStr = currentDate.toISOString().split('T')[0];
                dates.push(currentDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
                values.push(progressData.daily[dateStr] || 0); // Include 0 for days with no activity
                
                // Move to next day
                currentDate.setDate(currentDate.getDate() + 1);
            }
        }
    } else {
        // Show last N days of actual data
        const allDates = Object.keys(progressData.daily).sort();
        const recentDates = allDates.slice(-days);
        
        // If we have less data than requested days, show all
        if (recentDates.length < days && allDates.length > 0) {
            allDates.forEach(dateStr => {
                const date = new Date(dateStr);
                dates.push(date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
                values.push(progressData.daily[dateStr]);
            });
        } else {
            // Show the requested number of days
            const today = new Date();
            for (let i = days - 1; i >= 0; i--) {
                const date = new Date(today);
                date.setDate(date.getDate() - i);
                const dateStr = date.toISOString().split('T')[0];
                
                dates.push(date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
                values.push(progressData.daily[dateStr] || 0);
            }
        }
    }
    
    
    return {
        labels: dates,
        datasets: [{
            label: 'Questions Completed',
            data: values,
            backgroundColor: getComputedStyle(document.documentElement).getPropertyValue('--primary-color') || '#0ABAB5',
            borderColor: getComputedStyle(document.documentElement).getPropertyValue('--primary-dark') || '#089A96',
            borderWidth: 1
        }]
    };
}

// Get weekly data for chart
function getWeeklyData() {
    const weeklyTotals = {};
    const startDate = new Date('2025-09-14'); // Starting date
    
    // Group by week
    Object.entries(progressData.daily).forEach(([dateStr, count]) => {
        const date = new Date(dateStr);
        const weekStart = getWeekStart(date);
        const weekKey = weekStart.toISOString().split('T')[0];
        
        weeklyTotals[weekKey] = (weeklyTotals[weekKey] || 0) + count;
    });
    
    // Sort and prepare data
    const weeks = Object.keys(weeklyTotals).sort();
    const labels = weeks.map(week => {
        const date = new Date(week);
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    });
    
    return {
        labels: labels,
        datasets: [{
            label: 'Questions per Week',
            data: weeks.map(week => weeklyTotals[week]),
            borderColor: getComputedStyle(document.documentElement).getPropertyValue('--primary-color') || '#0ABAB5',
            backgroundColor: (getComputedStyle(document.documentElement).getPropertyValue('--primary-color') || '#0ABAB5') + '1A',
            tension: 0.1
        }]
    };
}

// Get cumulative data for chart
function getCumulativeData() {
    const allDates = Object.keys(progressData.daily).sort();
    
    if (allDates.length === 0) {
        return {
            labels: [],
            datasets: [{
                label: 'Total Questions',
                data: [],
                borderColor: getComputedStyle(document.documentElement).getPropertyValue('--primary-color') || '#0ABAB5',
                backgroundColor: (getComputedStyle(document.documentElement).getPropertyValue('--primary-color') || '#0ABAB5') + '1A',
                fill: true
            }]
        };
    }
    
    let cumulative = 0;
    const cumulativeData = [];
    const labels = [];
    
    // Get first and last dates
    const firstDate = new Date(allDates[0]);
    const today = new Date();
    
    // Generate all days from first to today
    const currentDate = new Date(firstDate);
    while (currentDate <= today) {
        const dateStr = currentDate.toISOString().split('T')[0];
        
        // Add the questions for this day (0 if no activity)
        cumulative += progressData.daily[dateStr] || 0;
        cumulativeData.push(cumulative);
        
        // Add label for this day
        labels.push(currentDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
        
        // Move to next day
        currentDate.setDate(currentDate.getDate() + 1);
    }
    
    return {
        labels: labels,
        datasets: [{
            label: 'Total Questions',
            data: cumulativeData,
            borderColor: getComputedStyle(document.documentElement).getPropertyValue('--primary-color') || '#0ABAB5',
            backgroundColor: (getComputedStyle(document.documentElement).getPropertyValue('--primary-color') || '#0ABAB5') + '1A',
            fill: true
        }]
    };
}

// Get start of week (Monday)
function getWeekStart(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // adjust for Sunday
    return new Date(d.setDate(diff));
}

// Restore button active states based on currentDailyRange
function restoreButtonStates() {
    document.querySelectorAll('.time-range button[data-chart="daily"]').forEach(button => {
        button.classList.remove('active');
        const range = button.dataset.range;
        if ((range === 'all' && currentDailyRange === 'all') ||
            (range !== 'all' && parseInt(range) === currentDailyRange)) {
            button.classList.add('active');
        }
    });
}

// Handle time range buttons
document.querySelectorAll('.time-range button').forEach(button => {
    button.addEventListener('click', (e) => {
        const range = e.target.dataset.range;
        const chartType = e.target.dataset.chart;
        
        // Update active state
        e.target.parentElement.querySelectorAll('button').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        
        // Update chart
        if (chartType === 'daily' && charts.daily) {
            // Save the current range
            currentDailyRange = range === 'all' ? 'all' : parseInt(range);
            
            // Save preference to storage
            chrome.storage.local.set({ dailyChartRange: currentDailyRange });
            
            const newData = getDailyData(currentDailyRange);
            
            // Reapply gradient with current theme colors
            const ctx = charts.daily.ctx;
            const gradient = ctx.createLinearGradient(0, 0, 0, 400);
            const primaryColor = getComputedStyle(document.documentElement).getPropertyValue('--primary-color') || '#0ABAB5';
            const darkColor = getComputedStyle(document.documentElement).getPropertyValue('--primary-dark') || '#089A96';
            
            gradient.addColorStop(0, primaryColor);
            gradient.addColorStop(0.5, darkColor);
            gradient.addColorStop(1, primaryColor + '80');
            
            newData.datasets[0].backgroundColor = gradient;
            newData.datasets[0].borderWidth = 0;
            newData.datasets[0].borderRadius = 0;
            newData.datasets[0].borderSkipped = false;
            
            charts.daily.data = newData;
            charts.daily.update();
        }
    });
});



// Initialize on load
initDashboard();

// Refresh data every 30 seconds
setInterval(initDashboard, 30000);

// Theme Color Selector - 12 diverse colors
const themeColors = [
    { color: '#0ABAB5', dark: '#089A96' }, // Tiffany Blue (default)
    { color: '#FF6B6B', dark: '#E74C3C' }, // Coral Red
    { color: '#FFD93D', dark: '#F39C12' }, // Golden Yellow
    { color: '#6BCF7F', dark: '#27AE60' }, // Emerald Green
    { color: '#4834D4', dark: '#3742FA' }, // Royal Blue
    { color: '#EB4D4B', dark: '#C0392B' }, // Crimson
    { color: '#FF9FF3', dark: '#E91E63' }, // Hot Pink
    { color: '#F97F51', dark: '#E67E22' }, // Orange
    { color: '#9B59B6', dark: '#8E44AD' }, // Purple
    { color: '#1E272E', dark: '#0C0E10' }, // Charcoal
    { color: '#5C6BC0', dark: '#3F51B5' }, // Indigo
    { color: '#74B9FF', dark: '#0984E3' }  // Sky Blue
];

// Initialize theme selector
function initThemeSelector() {
    const themeButton = document.getElementById('themeButton');
    const colorPalette = document.getElementById('colorPalette');
    
    // Create color options
    themeColors.forEach((theme, index) => {
        const colorOption = document.createElement('div');
        colorOption.className = 'color-option';
        colorOption.style.background = `linear-gradient(135deg, ${theme.color}, ${theme.dark})`;
        colorOption.setAttribute('data-color', theme.color);
        colorOption.setAttribute('data-dark', theme.dark);
        
        if (index === 0) {
            colorOption.classList.add('selected');
        }
        
        colorOption.addEventListener('click', () => {
            applyTheme(theme.color, theme.dark);
            document.querySelectorAll('.color-option').forEach(opt => opt.classList.remove('selected'));
            colorOption.classList.add('selected');
            colorPalette.classList.remove('active');
        });
        
        colorPalette.appendChild(colorOption);
    });
    
    // Toggle palette visibility
    themeButton.addEventListener('click', (e) => {
        e.stopPropagation();
        colorPalette.classList.toggle('active');
    });
    
    // Close palette when clicking outside
    document.addEventListener('click', () => {
        colorPalette.classList.remove('active');
    });
    
    colorPalette.addEventListener('click', (e) => {
        e.stopPropagation();
    });
    
    // Theme is already loaded in initDashboard
}

// Apply theme colors
function applyTheme(primaryColor, darkColor) {
    document.documentElement.style.setProperty('--primary-color', primaryColor);
    document.documentElement.style.setProperty('--primary-dark', darkColor);
    
    // Convert hex to RGB for box-shadow
    const hex2rgb = (hex) => {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? 
            `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}` : 
            '10, 186, 181';
    };
    document.documentElement.style.setProperty('--primary-color-rgb', hex2rgb(primaryColor));
    
    // Check if this is a green theme
    const isGreenTheme = isColorGreen(primaryColor);
    if (isGreenTheme) {
        document.body.classList.add('green-theme');
    } else {
        document.body.classList.remove('green-theme');
    }
    
    // Update chart colors
    updateChartColors(primaryColor, darkColor);
    
    // Save theme preference
    chrome.storage.local.set({ 
        theme: { primary: primaryColor, dark: darkColor } 
    });
}

// Helper function to determine if a color is green
function isColorGreen(hex) {
    // Convert hex to RGB
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!result) return false;
    
    const r = parseInt(result[1], 16);
    const g = parseInt(result[2], 16);
    const b = parseInt(result[3], 16);
    
    // Check if green is dominant and significant
    return g > r && g > b && g > 100;
}

// Helper function to lighten a color
function lightenColor(color, factor = 0.2) {
    const num = parseInt(color.replace('#', ''), 16);
    const r = Math.min(255, Math.floor((num >> 16) + (255 - (num >> 16)) * factor));
    const g = Math.min(255, Math.floor(((num >> 8) & 0x00FF) + (255 - ((num >> 8) & 0x00FF)) * factor));
    const b = Math.min(255, Math.floor((num & 0x0000FF) + (255 - (num & 0x0000FF)) * factor));
    return '#' + (r << 16 | g << 8 | b).toString(16).padStart(6, '0');
}

// Helper function to darken a color
function darkenColor(color, factor = 0.2) {
    const num = parseInt(color.replace('#', ''), 16);
    const r = Math.max(0, Math.floor((num >> 16) * (1 - factor)));
    const g = Math.max(0, Math.floor(((num >> 8) & 0x00FF) * (1 - factor)));
    const b = Math.max(0, Math.floor((num & 0x0000FF) * (1 - factor)));
    return '#' + (r << 16 | g << 8 | b).toString(16).padStart(6, '0');
}

// Update chart colors
function updateChartColors(primaryColor, darkColor) {
    if (charts.daily) {
        // Create new gradient for daily chart
        const ctx = charts.daily.ctx;
        const gradient = ctx.createLinearGradient(0, 0, 0, 400);
        gradient.addColorStop(0, primaryColor);
        gradient.addColorStop(0.5, darkColor);
        gradient.addColorStop(1, primaryColor + '80');
        
        charts.daily.data.datasets[0].backgroundColor = gradient;
        
        // Force immediate update with no transition
        charts.daily.options.animation = { duration: 0 };
        charts.daily.update();
        charts.daily.options.animation = { duration: 800 }; // Restore animation
    }
    
    if (charts.weekly) {
        // For line charts, we need to update point styles immediately
        const dataset = charts.weekly.data.datasets[0];
        
        // Create gradient for weekly chart background
        const ctx = charts.weekly.ctx;
        const gradient = ctx.createLinearGradient(0, 0, 0, 400);
        gradient.addColorStop(0, primaryColor + '60');
        gradient.addColorStop(0.5, primaryColor + '30');
        gradient.addColorStop(1, primaryColor + '05');
        
        // Create gradient for the line itself - more dramatic
        const lineGradient = ctx.createLinearGradient(0, 0, ctx.canvas.width, 0);
        lineGradient.addColorStop(0, primaryColor);
        lineGradient.addColorStop(0.25, darkColor);
        lineGradient.addColorStop(0.5, lightenColor(primaryColor, 0.3));
        lineGradient.addColorStop(0.75, darkColor);
        lineGradient.addColorStop(1, primaryColor);
        
        // Update all color properties
        dataset.borderColor = lineGradient;
        dataset.backgroundColor = gradient;
        dataset.pointBackgroundColor = primaryColor;
        dataset.pointBorderColor = '#fff';
        dataset.pointHoverBackgroundColor = primaryColor;
        dataset.pointHoverBorderColor = '#fff';
        
        // Force immediate update with no transition
        charts.weekly.options.animation = { duration: 0 };
        charts.weekly.update();
        charts.weekly.options.animation = { duration: 800 }; // Restore animation
    }
    
    if (charts.cumulative) {
        // For line charts, we need to update point styles immediately
        const dataset = charts.cumulative.data.datasets[0];
        
        // Create gradient for cumulative chart background
        const ctx = charts.cumulative.ctx;
        const gradient = ctx.createLinearGradient(0, 0, 0, 400);
        gradient.addColorStop(0, primaryColor + '60');
        gradient.addColorStop(0.5, primaryColor + '30');
        gradient.addColorStop(1, primaryColor + '05');
        
        // Create gradient for the line itself - very dramatic with contrasting colors
        const lineGradient = ctx.createLinearGradient(0, 0, ctx.canvas.width, 0);
        lineGradient.addColorStop(0, darkColor);
        lineGradient.addColorStop(0.2, lightenColor(primaryColor, 0.4));
        lineGradient.addColorStop(0.4, darkColor);
        lineGradient.addColorStop(0.6, primaryColor);
        lineGradient.addColorStop(0.8, darkenColor(primaryColor, 0.4));
        lineGradient.addColorStop(1, lightenColor(primaryColor, 0.3));
        
        // Update all color properties
        dataset.borderColor = lineGradient;
        dataset.backgroundColor = gradient;
        dataset.pointBackgroundColor = primaryColor;
        dataset.pointBorderColor = '#fff';
        dataset.pointHoverBackgroundColor = primaryColor;
        dataset.pointHoverBorderColor = '#fff';
        
        // Force immediate update with no transition
        charts.cumulative.options.animation = { duration: 0 };
        charts.cumulative.update();
        charts.cumulative.options.animation = { duration: 800 }; // Restore animation
    }
}

// Load saved theme
async function loadSavedTheme() {
    const result = await chrome.storage.local.get(['theme']);
    if (result.theme) {
        applyTheme(result.theme.primary, result.theme.dark);
        
        // Update selected color in palette
        document.querySelectorAll('.color-option').forEach(opt => {
            if (opt.getAttribute('data-color') === result.theme.primary) {
                opt.classList.add('selected');
            } else {
                opt.classList.remove('selected');
            }
        });
    } else {
        // Apply default theme if none saved
        applyTheme('#0ABAB5', '#089A96');
    }
}

// Initialize theme selector when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initThemeSelector);
} else {
    initThemeSelector();
}