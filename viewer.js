// Viewer script for PassMed Progress Dashboard
let progressData = { daily: {} };
let charts = {};
let currentDailyRange = 7; // Track the current selected range

// Plugin to add year to first displayed tick of each year
const yearDisplayPlugin = {
    id: 'yearDisplay',
    afterBuildTicks: (chart) => {
        const scale = chart.scales.x;
        if (!scale || !scale.ticks) return;

        let shownYears = {};
        scale.ticks.forEach((tick, i) => {
            const label = tick.label;
            if (!label || typeof label !== 'string' || !label.includes('|')) return;

            const [year, monthDay] = label.split('|');
            // First displayed tick OR first tick of a new year
            if (i === 0 || !shownYears[year]) {
                tick.label = year + ' ' + monthDay;
                shownYears[year] = true;
            } else {
                tick.label = monthDay;
            }
        });
    }
};

// Helper function to get local date string without timezone issues
function getLocalDateString(date = new Date()) {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
}

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

    // Calculate total days from first record to today (including inactive days)
    let avgPerDay = '0';
    if (dates.length > 0) {
        const firstDate = new Date(dates[0]);
        const todayDate = new Date();
        todayDate.setHours(0, 0, 0, 0);
        firstDate.setHours(0, 0, 0, 0);
        const totalDays = Math.floor((todayDate - firstDate) / (1000 * 60 * 60 * 24)) + 1;
        avgPerDay = (totalQuestions / totalDays).toFixed(1);
    }

    // Get today's questions
    const today = getLocalDateString();
    const todayQuestions = progressData.daily[today] || 0;
    
    // Calculate current streak
    let streak = 0;
    const todayDate = new Date();
    todayDate.setHours(0, 0, 0, 0);
    
    for (let i = 0; i < 365; i++) {
        const checkDate = new Date(todayDate);
        checkDate.setDate(checkDate.getDate() - i);
        const dateStr = getLocalDateString(checkDate);
        
        if (progressData.daily[dateStr]) {
            streak++;
        } else if (i > 0) { // Don't break on first day (today) if no data
            break;
        }
    }
    
    animateStat('todayQuestions', todayQuestions);
    animateStat('totalQuestions', totalQuestions);
    animateStat('daysActive', daysActive);
    animateStat('avgPerDay', parseFloat(avgPerDay), 1);
    animateStat('currentStreak', streak);
    statsAnimatedOnce = true;
}

// Count-up animation for the stat tiles. Runs only on the first load;
// the 30-second background refresh sets values directly.
let statsAnimatedOnce = false;
const REDUCED_MOTION = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function animateStat(id, target, decimals = 0) {
    const el = document.getElementById(id);
    if (!el) return;
    const fmt = v => decimals ? v.toFixed(decimals) : Math.round(v).toLocaleString();
    if (statsAnimatedOnce || REDUCED_MOTION) {
        el.textContent = fmt(target);
        return;
    }
    const duration = 900;
    const start = performance.now();
    function frame(now) {
        const t = Math.min(1, (now - start) / duration);
        const eased = 1 - Math.pow(1 - t, 3);
        el.textContent = fmt(target * eased);
        if (t < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
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

    const themeColor = getComputedStyle(document.documentElement).getPropertyValue('--primary-color') || '#0ABAB5';
    const primaryColor = chartPrimary(themeColor);
    const darkColor = getComputedStyle(document.documentElement).getPropertyValue('--primary-dark') || '#089A96';

    // Charts sit on dark glass panels: recessive grid, mono ticks,
    // dark tooltips edged in the theme colour.
    const inkDim = 'rgba(233, 241, 241, 0.55)';
    const gridLine = 'rgba(255, 255, 255, 0.055)';
    Chart.defaults.color = inkDim;
    Chart.defaults.font.family = "'IBM Plex Mono', 'SF Mono', 'Menlo', monospace";
    Chart.defaults.font.size = 10;
    Chart.defaults.plugins.tooltip.backgroundColor = 'rgba(7, 12, 16, 0.94)';
    Chart.defaults.plugins.tooltip.borderColor = primaryColor;
    Chart.defaults.plugins.tooltip.borderWidth = 1;
    Chart.defaults.plugins.tooltip.cornerRadius = 4;
    Chart.defaults.plugins.tooltip.padding = 10;
    Chart.defaults.plugins.tooltip.titleColor = '#E9F1F1';
    Chart.defaults.plugins.tooltip.bodyColor = inkDim;

    // Bars: bright at the tip, fading towards the baseline
    const gradient = dailyCtx.createLinearGradient(0, 0, 0, 400);
    gradient.addColorStop(0, lightenColor(primaryColor, 0.3));
    gradient.addColorStop(0.55, primaryColor);
    gradient.addColorStop(1, primaryColor + '30');

    dailyData.datasets[0].backgroundColor = gradient;
    dailyData.datasets[0].hoverBackgroundColor = lightenColor(primaryColor, 0.45);
    dailyData.datasets[0].borderWidth = 0;
    dailyData.datasets[0].borderRadius = 3;
    dailyData.datasets[0].borderSkipped = 'bottom';

    // Plugin to draw the gold average reference line across full width
    const dailyAveragePlugin = {
        id: 'dailyAverageLine',
        beforeDraw: (chart) => {
            const avg = chart.data.dailyAverage;
            if (avg === undefined || avg === 0) return;

            const ctx = chart.ctx;
            const yScale = chart.scales.y;
            const chartArea = chart.chartArea;
            const yPos = yScale.getPixelForValue(avg);

            // Draw gradient fill from line to bottom
            const gradient = ctx.createLinearGradient(0, yPos, 0, chartArea.bottom);
            gradient.addColorStop(0, 'rgba(212, 175, 55, 0.09)');
            gradient.addColorStop(0.5, 'rgba(212, 175, 55, 0.035)');
            gradient.addColorStop(1, 'rgba(212, 175, 55, 0)');

            ctx.save();
            ctx.fillStyle = gradient;
            ctx.fillRect(chartArea.left, yPos, chartArea.right - chartArea.left, chartArea.bottom - yPos);

            // Draw the line
            ctx.strokeStyle = '#D4AF37';
            ctx.lineWidth = 1.5;
            ctx.setLineDash([6, 5]);
            ctx.beginPath();
            ctx.moveTo(chartArea.left, yPos);
            ctx.lineTo(chartArea.right, yPos);
            ctx.stroke();
            ctx.restore();
        }
    };

    charts.daily = new Chart(dailyCtx, {
        type: 'bar',
        data: dailyData,
        plugins: [dailyAveragePlugin, yearDisplayPlugin],
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: {
                duration: 700,
                easing: 'easeOutQuart',
                delay: (context) => context.type === 'data' && context.mode === 'default'
                    ? Math.min(context.dataIndex * 14, 1000)
                    : 0
            },
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Questions Completed',
                        font: { family: "'Space Grotesk', sans-serif", size: 11 }
                    },
                    grid: {
                        display: true,
                        color: gridLine
                    },
                    border: { display: false }
                },
                x: {
                    grid: {
                        display: false
                    },
                    border: { display: false }
                }
            },
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                    labels: {
                        usePointStyle: true,
                        padding: 15,
                        generateLabels: (chart) => {
                            const original = Chart.defaults.plugins.legend.labels.generateLabels(chart);
                            original.push({
                                text: 'Daily Average',
                                fillStyle: 'rgba(212, 175, 55, 0.2)',
                                strokeStyle: '#D4AF37',
                                lineWidth: 1.5,
                                lineDash: [6, 5],
                                hidden: false,
                                index: 1
                            });
                            return original;
                        }
                    }
                },
                tooltip: {
                    callbacks: {
                        title: (items) => {
                            const label = items[0]?.label || '';
                            return label.includes('|') ? label.replace('|', ' ') : label;
                        }
                    }
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
    weeklyGradient.addColorStop(0, primaryColor + '40');
    weeklyGradient.addColorStop(0.5, primaryColor + '18');
    weeklyGradient.addColorStop(1, primaryColor + '03');

    // Thin luminous line with hollow points on the dark panel
    weeklyData.datasets[0].backgroundColor = weeklyGradient;
    weeklyData.datasets[0].borderColor = lightenColor(primaryColor, 0.15);
    weeklyData.datasets[0].borderWidth = 2.5;
    weeklyData.datasets[0].pointBackgroundColor = '#0B1216';
    weeklyData.datasets[0].pointBorderColor = lightenColor(primaryColor, 0.2);
    weeklyData.datasets[0].pointBorderWidth = 2;
    weeklyData.datasets[0].pointRadius = 4;
    weeklyData.datasets[0].pointHoverRadius = 6;
    weeklyData.datasets[0].pointHoverBackgroundColor = primaryColor;
    weeklyData.datasets[0].pointHoverBorderColor = '#fff';

    // Plugin to draw the gold weekly average reference line
    const weeklyAveragePlugin = {
        id: 'weeklyAverageLine',
        beforeDraw: (chart) => {
            const avg = chart.data.weeklyAverage;
            if (avg === undefined || avg === 0) return;

            const ctx = chart.ctx;
            const yScale = chart.scales.y;
            const chartArea = chart.chartArea;
            const yPos = yScale.getPixelForValue(avg);

            // Draw gradient fill from line to bottom
            const gradient = ctx.createLinearGradient(0, yPos, 0, chartArea.bottom);
            gradient.addColorStop(0, 'rgba(212, 175, 55, 0.09)');
            gradient.addColorStop(0.5, 'rgba(212, 175, 55, 0.035)');
            gradient.addColorStop(1, 'rgba(212, 175, 55, 0)');

            ctx.save();
            ctx.fillStyle = gradient;
            ctx.fillRect(chartArea.left, yPos, chartArea.right - chartArea.left, chartArea.bottom - yPos);

            // Draw the line
            ctx.strokeStyle = '#D4AF37';
            ctx.lineWidth = 1.5;
            ctx.setLineDash([6, 5]);
            ctx.beginPath();
            ctx.moveTo(chartArea.left, yPos);
            ctx.lineTo(chartArea.right, yPos);
            ctx.stroke();
            ctx.restore();
        }
    };

    charts.weekly = new Chart(weeklyCtx, {
        type: 'line',
        data: weeklyData,
        plugins: [weeklyAveragePlugin],
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: {
                duration: 1100,
                easing: 'easeOutQuart'
            },
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Questions per Week',
                        font: { family: "'Space Grotesk', sans-serif", size: 11 }
                    },
                    grid: { color: gridLine },
                    border: { display: false }
                },
                x: {
                    grid: { display: false },
                    border: { display: false }
                }
            },
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                    labels: {
                        usePointStyle: true,
                        padding: 15,
                        generateLabels: (chart) => {
                            const original = Chart.defaults.plugins.legend.labels.generateLabels(chart);
                            original.push({
                                text: 'Weekly Average',
                                fillStyle: 'rgba(212, 175, 55, 0.2)',
                                strokeStyle: '#D4AF37',
                                lineWidth: 1.5,
                                lineDash: [6, 5],
                                hidden: false,
                                index: 1
                            });
                            return original;
                        }
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
    cumulativeGradient.addColorStop(0, primaryColor + '3A');
    cumulativeGradient.addColorStop(0.5, primaryColor + '16');
    cumulativeGradient.addColorStop(1, primaryColor + '03');

    cumulativeData.datasets[0].backgroundColor = cumulativeGradient;
    cumulativeData.datasets[0].borderColor = lightenColor(primaryColor, 0.2);
    cumulativeData.datasets[0].borderWidth = 2.5;
    // With one point per day, full-size white-rimmed dots merge into a
    // scalloped caterpillar. Keep small rimless dots along the line and
    // emphasise only the latest value.
    const lastIndex = cumulativeData.datasets[0].data.length - 1;
    cumulativeData.datasets[0].pointBackgroundColor = primaryColor;
    cumulativeData.datasets[0].pointBorderColor = '#fff';
    cumulativeData.datasets[0].pointBorderWidth = (ctx) => ctx.dataIndex === lastIndex ? 2 : 0;
    cumulativeData.datasets[0].pointRadius = (ctx) => ctx.dataIndex === lastIndex ? 5 : 3;
    cumulativeData.datasets[0].pointHoverRadius = 6;
    cumulativeData.datasets[0].pointHitRadius = 8;
    
    charts.cumulative = new Chart(cumulativeCtx, {
        type: 'line',
        data: cumulativeData,
        plugins: [yearDisplayPlugin],
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: {
                duration: 1100,
                easing: 'easeOutQuart'
            },
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Total Questions',
                        font: { family: "'Space Grotesk', sans-serif", size: 11 }
                    },
                    grid: { color: gridLine },
                    border: { display: false }
                },
                x: {
                    grid: { display: false },
                    border: { display: false }
                }
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        title: (items) => {
                            const label = items[0]?.label || '';
                            return label.includes('|') ? label.replace('|', ' ') : label;
                        }
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
            // Parse as LOCAL date to avoid timezone issues
            const firstDate = parseLocalDate(allDates[0]);
            const today = new Date();
            today.setHours(23, 59, 59, 999); // End of today to ensure today is included

            // Generate all days from first to today
            const currentDate = new Date(firstDate);
            while (currentDate <= today) {
                const dateStr = getLocalDateString(currentDate);
                const currentYear = currentDate.getFullYear();
                const monthDay = currentDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                // Store as YEAR|MonthDay - plugin will format for display
                dates.push(`${currentYear}|${monthDay}`);
                values.push(progressData.daily[dateStr] || 0);
                currentDate.setDate(currentDate.getDate() + 1);
            }
        }
    } else {
        // Show last N days of actual data
        const allDates = Object.keys(progressData.daily).sort();
        const recentDates = allDates.slice(-days);

        // If we have less data than requested days, show all
        if (recentDates.length < days && allDates.length > 0) {
            allDates.forEach((dateStr) => {
                const date = parseLocalDate(dateStr);
                const currentYear = date.getFullYear();
                const monthDay = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                dates.push(`${currentYear}|${monthDay}`);
                values.push(progressData.daily[dateStr]);
            });
        } else {
            // Show the requested number of days
            const today = new Date();
            for (let i = days - 1; i >= 0; i--) {
                const date = new Date(today);
                date.setDate(date.getDate() - i);
                const dateStr = getLocalDateString(date);
                const currentYear = date.getFullYear();
                const monthDay = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                dates.push(`${currentYear}|${monthDay}`);
                values.push(progressData.daily[dateStr] || 0);
            }
        }
    }
    
    // Calculate daily average (total questions / total days from first record to today)
    const allDates = Object.keys(progressData.daily).sort();
    let dailyAverage = 0;
    if (allDates.length > 0) {
        const totalQuestions = Object.values(progressData.daily).reduce((sum, count) => sum + count, 0);
        const firstDate = new Date(allDates[0]);
        const todayDate = new Date();
        todayDate.setHours(0, 0, 0, 0);
        firstDate.setHours(0, 0, 0, 0);
        const totalDays = Math.floor((todayDate - firstDate) / (1000 * 60 * 60 * 24)) + 1;
        dailyAverage = totalQuestions / totalDays;
    }

    return {
        labels: dates,
        datasets: [
            {
                label: 'Questions Completed',
                data: values,
                backgroundColor: getComputedStyle(document.documentElement).getPropertyValue('--primary-color') || '#0ABAB5',
                borderColor: getComputedStyle(document.documentElement).getPropertyValue('--primary-dark') || '#089A96',
                borderWidth: 1,
                type: 'bar'
            }
        ],
        dailyAverage: dailyAverage
    };
}

// Get weekly data for chart
function getWeeklyData() {
    const weeklyTotals = {};

    // Get all dates from daily data
    const allDates = Object.keys(progressData.daily).sort();

    if (allDates.length === 0) {
        // If no data at all, show current week with 0
        const currentWeekStart = getWeekStart(new Date());
        weeklyTotals[getLocalDateString(currentWeekStart)] = 0;
    } else {
        // Find the earliest week with data - parse as LOCAL date
        const firstDate = parseLocalDate(allDates[0]);
        const firstWeekStart = getWeekStart(firstDate);

        // Get current week
        const currentWeekStart = getWeekStart(new Date());

        // Generate all weeks from first week to current week
        const weekStart = new Date(firstWeekStart);
        // Reset time to start of day for proper comparison
        weekStart.setHours(0, 0, 0, 0);
        const currentWeekStartDate = new Date(currentWeekStart);
        currentWeekStartDate.setHours(23, 59, 59, 999); // End of day to ensure current week is included

        while (weekStart <= currentWeekStartDate) {
            const weekKey = getLocalDateString(weekStart);
            weeklyTotals[weekKey] = 0; // Initialize with 0

            // Move to next week
            weekStart.setDate(weekStart.getDate() + 7);
        }

        // Now populate with actual data
        Object.entries(progressData.daily).forEach(([dateStr, count]) => {
            // Parse as LOCAL date to avoid timezone issues
            const date = parseLocalDate(dateStr);
            const weekStartForDate = getWeekStart(date);
            const weekKey = getLocalDateString(weekStartForDate);

            if (weeklyTotals.hasOwnProperty(weekKey)) {
                weeklyTotals[weekKey] += count;
            }
        });
    }
    
    // Sort and prepare data
    const weeks = Object.keys(weeklyTotals).sort();

    let lastYear = null;
    const labels = weeks.map((week) => {
        // Parse as LOCAL date to avoid timezone issues
        const date = parseLocalDate(week);
        const currentYear = date.getFullYear();
        const monthDay = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        // Include year on the first label or when year changes
        if (lastYear === null || currentYear !== lastYear) {
            lastYear = currentYear;
            return `${currentYear} ${monthDay}`;
        }
        return monthDay;
    });
    
    // Calculate average of weekly totals
    const weeklyValues = weeks.map(week => weeklyTotals[week]);
    const weeklyAverage = weeklyValues.length > 0
        ? weeklyValues.reduce((sum, val) => sum + val, 0) / weeklyValues.length
        : 0;

    const weeklyData = {
        labels: labels,
        datasets: [
            {
                label: 'Questions per Week',
                data: weeklyValues,
                borderColor: getComputedStyle(document.documentElement).getPropertyValue('--primary-color') || '#0ABAB5',
                backgroundColor: (getComputedStyle(document.documentElement).getPropertyValue('--primary-color') || '#0ABAB5') + '1A',
                tension: 0.1
            }
        ],
        weeklyAverage: weeklyAverage
    };

    return weeklyData;
}

// Helper function to parse YYYY-MM-DD string as local date (not UTC)
function parseLocalDate(dateStr) {
    const [year, month, day] = dateStr.split('-').map(Number);
    return new Date(year, month - 1, day);
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

    // Get first and last dates - parse as LOCAL dates to avoid timezone issues
    const firstDate = parseLocalDate(allDates[0]);
    const today = new Date();
    today.setHours(23, 59, 59, 999); // End of today to ensure today is included

    // Generate all days from first to today
    const currentDate = new Date(firstDate);
    while (currentDate <= today) {
        const dateStr = getLocalDateString(currentDate);

        // Add the questions for this day (0 if no activity)
        cumulative += progressData.daily[dateStr] || 0;
        cumulativeData.push(cumulative);

        // Store as YEAR|MonthDay - plugin will format for display
        const currentYear = currentDate.getFullYear();
        const monthDay = currentDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        labels.push(`${currentYear}|${monthDay}`);

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
            const primaryColor = chartPrimary(getComputedStyle(document.documentElement).getPropertyValue('--primary-color') || '#0ABAB5');

            gradient.addColorStop(0, lightenColor(primaryColor, 0.3));
            gradient.addColorStop(0.55, primaryColor);
            gradient.addColorStop(1, primaryColor + '30');

            newData.datasets[0].backgroundColor = gradient;
            newData.datasets[0].hoverBackgroundColor = lightenColor(primaryColor, 0.45);
            newData.datasets[0].borderWidth = 0;
            newData.datasets[0].borderRadius = 3;
            newData.datasets[0].borderSkipped = 'bottom';

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

// Redraw the "P+" tab favicon in the current theme colours: serif monogram
// with a thin gold keyline frame. Mid-tone golds are invisible against
// mid-tone theme colours, so the plus needs lightness contrast: deep ink on
// light/medium themes, pale gold on dark themes.
function updateFavicon(primaryColor, darkColor) {
    const link = document.getElementById('pmplus-favicon');
    if (!link) return;
    const rgb = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(primaryColor.trim());
    const luminance = rgb
        ? (0.2126 * parseInt(rgb[1], 16) + 0.7152 * parseInt(rgb[2], 16) + 0.0722 * parseInt(rgb[3], 16)) / 255
        : 0.5;
    const plusColor = luminance > 0.22 ? '#1F3A33' : '#FFE9A0';
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">` +
        `<defs><linearGradient id="pmpg" x1="0" y1="0" x2="1" y2="1">` +
        `<stop offset="0" stop-color="${primaryColor}"/><stop offset="1" stop-color="${darkColor}"/>` +
        `</linearGradient></defs>` +
        `<rect width="64" height="64" rx="12" fill="url(#pmpg)"/>` +
        `<rect x="3.5" y="3.5" width="57" height="57" rx="9.5" fill="none" stroke="#D4AF37" stroke-width="1.5" opacity="0.9"/>` +
        `<text x="27" y="51" font-family="'Times New Roman', Times, serif" font-size="50" fill="#FFFFFF" text-anchor="middle">P</text>` +
        `<text x="46.5" y="26" font-family="'Times New Roman', Times, serif" font-size="28" font-weight="bold" fill="${plusColor}" text-anchor="middle">+</text>` +
        `</svg>`;
    link.href = 'data:image/svg+xml,' + encodeURIComponent(svg);
}

// Apply theme colors
function applyTheme(primaryColor, darkColor) {
    document.documentElement.style.setProperty('--primary-color', primaryColor);
    document.documentElement.style.setProperty('--primary-dark', darkColor);
    updateFavicon(primaryColor, darkColor);

    // Convert hex to RGB for box-shadow
    const hex2rgb = (hex) => {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ?
            `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}` :
            '10, 186, 181';
    };

    // Create a lighter version of the primary color for shimmer effect
    const lightenColor = (hex, percent) => {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        if (!result) return hex;
        let r = parseInt(result[1], 16);
        let g = parseInt(result[2], 16);
        let b = parseInt(result[3], 16);
        r = Math.min(255, Math.round(r + (255 - r) * percent));
        g = Math.min(255, Math.round(g + (255 - g) * percent));
        b = Math.min(255, Math.round(b + (255 - b) * percent));
        return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
    };

    document.documentElement.style.setProperty('--shimmer-color', lightenColor(primaryColor, 0.5));
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

// Very dark theme colours (e.g. charcoal) would vanish against the dark
// panels, so chart marks use a lifted version of those primaries.
function chartPrimary(color) {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(color.trim());
    if (!m) return color;
    const lum = (0.2126 * parseInt(m[1], 16) + 0.7152 * parseInt(m[2], 16) + 0.0722 * parseInt(m[3], 16)) / 255;
    return lum < 0.22 ? lightenColor(color, 0.45) : color;
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

// Update chart colors on theme change (mirrors the styling in initCharts)
function updateChartColors(themeColor, darkColor) {
    const primaryColor = chartPrimary(themeColor);
    Chart.defaults.plugins.tooltip.borderColor = primaryColor;

    if (charts.daily) {
        const ctx = charts.daily.ctx;
        const gradient = ctx.createLinearGradient(0, 0, 0, 400);
        gradient.addColorStop(0, lightenColor(primaryColor, 0.3));
        gradient.addColorStop(0.55, primaryColor);
        gradient.addColorStop(1, primaryColor + '30');

        charts.daily.data.datasets[0].backgroundColor = gradient;
        charts.daily.data.datasets[0].hoverBackgroundColor = lightenColor(primaryColor, 0.45);

        // Force immediate update with no transition
        charts.daily.options.animation = { duration: 0 };
        charts.daily.update();
        charts.daily.options.animation = { duration: 800 }; // Restore animation
    }

    if (charts.weekly) {
        const dataset = charts.weekly.data.datasets[0];

        const ctx = charts.weekly.ctx;
        const gradient = ctx.createLinearGradient(0, 0, 0, 400);
        gradient.addColorStop(0, primaryColor + '40');
        gradient.addColorStop(0.5, primaryColor + '18');
        gradient.addColorStop(1, primaryColor + '03');

        dataset.backgroundColor = gradient;
        dataset.borderColor = lightenColor(primaryColor, 0.15);
        dataset.pointBackgroundColor = '#0B1216';
        dataset.pointBorderColor = lightenColor(primaryColor, 0.2);
        dataset.pointHoverBackgroundColor = primaryColor;
        dataset.pointHoverBorderColor = '#fff';

        // Force immediate update with no transition
        charts.weekly.options.animation = { duration: 0 };
        charts.weekly.update();
        charts.weekly.options.animation = { duration: 800 }; // Restore animation
    }

    if (charts.cumulative) {
        const dataset = charts.cumulative.data.datasets[0];

        const ctx = charts.cumulative.ctx;
        const gradient = ctx.createLinearGradient(0, 0, 0, 400);
        gradient.addColorStop(0, primaryColor + '3A');
        gradient.addColorStop(0.5, primaryColor + '16');
        gradient.addColorStop(1, primaryColor + '03');

        dataset.backgroundColor = gradient;
        dataset.borderColor = lightenColor(primaryColor, 0.2);
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

// Golden particles animation
function createParticles() {
    const container = document.getElementById('particles');
    if (!container) return;

    const particleCount = 25;

    for (let i = 0; i < particleCount; i++) {
        const particle = document.createElement('div');
        particle.className = 'particle';
        particle.style.left = Math.random() * 100 + '%';
        const duration = Math.random() * 10 + 15; // 15-25 seconds
        particle.style.animationDuration = duration + 's';
        // Negative delay spreads particles across their animation cycle on load
        particle.style.animationDelay = -(Math.random() * duration) + 's';
        const size = Math.random() * 4 + 3; // 3-7px (smaller)
        particle.style.width = size + 'px';
        particle.style.height = size + 'px';
        container.appendChild(particle);
    }
}

// Initialize particles
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', createParticles);
} else {
    createParticles();
}

// ECG trace animation for the header: a telemetry heartbeat in the theme
// colour, scrolling right to left with a glowing head at the newest sample.
(function() {
    function createEcgAnimation(canvasId) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        let width, height;
        let dpr = window.devicePixelRatio || 1;
        const reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

        function resize() {
            dpr = window.devicePixelRatio || 1;
            const rect = canvas.parentElement.getBoundingClientRect();
            width = rect.width;
            height = rect.height;
            canvas.width = width * dpr;
            canvas.height = height * dpr;
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        }

        function hexToRgb(hex) {
            const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex.trim());
            return m
                ? `${parseInt(m[1], 16)}, ${parseInt(m[2], 16)}, ${parseInt(m[3], 16)}`
                : '10, 186, 181';
        }

        const bump = (p, centre, w, h) => h * Math.exp(-Math.pow((p - centre) / w, 2));

        // One sinus beat as a vertical offset: P wave, QRS complex, T wave.
        // Phases are fractions of an R-R interval read as 5 large boxes (1.0s,
        // 60bpm), which puts QRS at 100ms, PR at ~185ms and QT at ~390ms. Widen
        // the complex without shortening beatWidth to match and the trace reads
        // as bradycardia, since QRS width is the only scale cue on an ungridded
        // strip.
        function sinusOffset(s, beatWidth) {
            const phase = (((s % beatWidth) + beatWidth) % beatWidth) / beatWidth;
            let y = 0;
            y += bump(phase, 0.215, 0.030, 4);   // P
            y -= bump(phase, 0.360, 0.0095, 6);  // Q
            y += bump(phase, 0.390, 0.013, 30);  // R
            y -= bump(phase, 0.420, 0.011, 10);  // S
            y += bump(phase, 0.625, 0.054, 7);   // T
            return y;
        }

        // Atrial flutter: sawtooth F waves at ~4x the sinus rate, 3:1 conduction
        function flutterOffset(s, beatWidth) {
            const fw = beatWidth / 4.2;
            const ph = (((s % fw) + fw) % fw) / fw;
            const saw = ph < 0.72 ? ph / 0.72 : (1 - ph) / 0.28;
            let y = saw * 9.5;
            if (Math.floor(s / fw) % 3 === 0) {
                y += bump(ph, 0.5, 0.045, 27);
            }
            return y;
        }

        // Torsades de pointes: rapid complexes inside a twisting spindle envelope
        function torsadesOffset(s, beatWidth) {
            const p = beatWidth / 5.5;
            const spindle = beatWidth * 1.5;
            const amp = 6 + 17 * Math.abs(Math.sin(Math.PI * s / spindle));
            return amp * Math.sin(2 * Math.PI * s / p);
        }

        // Rare, irregular arrhythmia episodes drift across the trace and
        // self-terminate back to sinus rhythm. Positions are in absolute
        // signal pixels, so an episode scrolls by like a real strip.
        const episodes = [];
        let nextEpisodeAt = 3000 + Math.random() * 6000;

        function scheduleEpisodes() {
            if (t + width + 200 > nextEpisodeAt) {
                const type = Math.random() < 0.5 ? 'flutter' : 'torsades';
                const length = 450 + Math.random() * 320;
                episodes.push({ start: nextEpisodeAt, end: nextEpisodeAt + length, type: type });
                nextEpisodeAt = nextEpisodeAt + length + 6000 + Math.random() * 10000;
            }
            while (episodes.length && episodes[0].end < t - 100) {
                episodes.shift();
            }
        }

        function signalOffset(s, beatWidth) {
            const sinus = sinusOffset(s, beatWidth);
            const ep = episodes.find(e => s >= e.start && s < e.end);
            if (!ep) return sinus;
            // Short crossfade so the rhythm change doesn't step
            const w = Math.min(1, (s - ep.start) / 50, (ep.end - s) / 50);
            const arr = ep.type === 'flutter'
                ? flutterOffset(s, beatWidth)
                : torsadesOffset(s, beatWidth);
            return sinus * (1 - w) + arr * w;
        }

        let t = 0;
        function draw() {
            const primaryColor = getComputedStyle(document.documentElement).getPropertyValue('--primary-color').trim() || '#0ABAB5';
            const rgb = hexToRgb(primaryColor);

            ctx.clearRect(0, 0, width, height);

            const baseline = height * 0.74;
            const beatWidth = Math.max(184, width / 6);
            const scale = Math.min(1.6, height / 120);

            // Trace fades towards the left, brightest at the newest sample
            const grad = ctx.createLinearGradient(0, 0, width, 0);
            grad.addColorStop(0, `rgba(${rgb}, 0)`);
            grad.addColorStop(0.45, `rgba(${rgb}, 0.18)`);
            grad.addColorStop(1, `rgba(${rgb}, 0.8)`);

            ctx.save();
            ctx.lineWidth = 1.6;
            ctx.lineJoin = 'round';
            ctx.strokeStyle = grad;
            ctx.shadowColor = `rgba(${rgb}, 0.9)`;
            ctx.shadowBlur = 9;
            scheduleEpisodes();
            ctx.beginPath();
            let headY = baseline;
            for (let x = 0; x <= width; x += 2) {
                const y = baseline - signalOffset(x + t, beatWidth) * scale;
                if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
                headY = y;
            }
            ctx.stroke();
            ctx.restore();

            // Glowing head dot at the newest sample
            ctx.save();
            ctx.fillStyle = `rgba(${rgb}, 0.95)`;
            ctx.shadowColor = `rgba(${rgb}, 1)`;
            ctx.shadowBlur = 14;
            ctx.beginPath();
            ctx.arc(width - 1, headY, 2.6, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }

        function animate() {
            t += 1.3;
            draw();
            requestAnimationFrame(animate);
        }

        window.addEventListener('resize', () => {
            resize();
            if (reducedMotion) draw();
        });

        resize();
        if (reducedMotion) {
            draw(); // a still trace, no animation loop
        } else {
            animate();
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => createEcgAnimation('header-bg'));
    } else {
        createEcgAnimation('header-bg');
    }
})();