// Popup script for the heatmap data viewer

document.addEventListener('DOMContentLoaded', async () => {
    // Load and display data
    await loadData();
    
    // Set up event listeners
    document.getElementById('export-json').addEventListener('click', exportJSON);
    document.getElementById('export-csv').addEventListener('click', exportCSV);
    document.getElementById('refresh').addEventListener('click', loadData);
    document.getElementById('clear-data').addEventListener('click', clearData);
});

async function loadData() {
    try {
        showLoading();
        
        const result = await HeatmapUtils.getData();
        
        if (!result.data || !result.metadata) {
            showNoData();
            return;
        }
        
        // Display metadata
        document.getElementById('last-updated').textContent = formatDate(result.metadata.lastUpdated);
        document.getElementById('total-entries').textContent = result.metadata.totalEntries || '0';
        document.getElementById('intercept-count').textContent = result.metadata.extractCount || result.metadata.interceptCount || '0';
        
        if (result.metadata.dateRange) {
            document.getElementById('date-range').textContent = 
                `${result.metadata.dateRange.start} to ${result.metadata.dateRange.end}`;
        } else {
            document.getElementById('date-range').textContent = '-';
        }
        
        // Calculate and display statistics
        const stats = await HeatmapUtils.getStatistics();
        if (stats) {
            document.getElementById('total-questions').textContent = formatNumber(stats.totalQuestions);
            document.getElementById('avg-percentage').textContent = `${stats.averagePercentage}%`;
            document.getElementById('current-streak').textContent = `${stats.currentStreak} days`;
            document.getElementById('longest-streak').textContent = `${stats.longestStreak} days`;
        }
        
        showData();
    } catch (error) {
        console.error('Error loading data:', error);
        showMessage('Error loading data', 'error');
    }
}

async function exportJSON() {
    try {
        const result = await HeatmapUtils.getData();
        
        if (!result.data) {
            showMessage('No data to export', 'error');
            return;
        }
        
        const dataStr = JSON.stringify(result, null, 2);
        const blob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `passmed_heatmap_${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
        
        showMessage('Data exported as JSON', 'success');
    } catch (error) {
        console.error('Error exporting JSON:', error);
        showMessage('Error exporting data', 'error');
    }
}

async function exportCSV() {
    try {
        await HeatmapUtils.exportAsCSV();
        showMessage('Data exported as CSV', 'success');
    } catch (error) {
        console.error('Error exporting CSV:', error);
        showMessage('Error exporting data', 'error');
    }
}

async function clearData() {
    if (confirm('Are you sure you want to clear all stored heatmap data?')) {
        try {
            await HeatmapUtils.clearData();
            showMessage('Data cleared successfully', 'success');
            setTimeout(() => loadData(), 1000);
        } catch (error) {
            console.error('Error clearing data:', error);
            showMessage('Error clearing data', 'error');
        }
    }
}

function showLoading() {
    document.getElementById('loading').style.display = 'block';
    document.getElementById('content').style.display = 'none';
}

function showNoData() {
    document.getElementById('loading').style.display = 'none';
    document.getElementById('content').style.display = 'block';
    document.getElementById('no-data').style.display = 'block';
    document.getElementById('data-content').style.display = 'none';
}

function showData() {
    document.getElementById('loading').style.display = 'none';
    document.getElementById('content').style.display = 'block';
    document.getElementById('no-data').style.display = 'none';
    document.getElementById('data-content').style.display = 'block';
}

function showMessage(text, type) {
    const messageEl = document.getElementById('message');
    messageEl.textContent = text;
    messageEl.className = `message message-${type}`;
    messageEl.style.display = 'block';
    
    setTimeout(() => {
        messageEl.style.display = 'none';
    }, 3000);
}

function formatDate(dateStr) {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleString();
}

function formatNumber(num) {
    return num.toLocaleString();
}