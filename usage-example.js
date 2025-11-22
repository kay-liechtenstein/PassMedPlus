// Usage Examples for PassMed Heatmap Data Extractor
// These examples can be run in the browser console while on a PassMed page

// Example 1: Get the stored heatmap data
// Run this in the console to retrieve the extracted data
window.getPassMedHeatmapData((result, error) => {
    if (error) {
        console.error('Error:', error);
        return;
    }
    
    console.log('Heatmap Data:', result.data);
    console.log('Metadata:', result.metadata);
    
    // Access the raw data
    if (result.data) {
        console.log('Raw data:', result.data.raw);
        console.log('Parsed entries:', result.data.parsed);
        console.log('Last updated:', result.data.lastUpdated);
    }
});

// Example 2: Get specific date range data
// This example shows how to filter data for a specific period
window.getPassMedHeatmapData((result) => {
    if (result && result.data && result.data.parsed) {
        const startDate = new Date('2024-01-01');
        const endDate = new Date('2024-01-31');
        
        const januaryData = result.data.parsed.filter(entry => {
            const entryDate = new Date(entry.date);
            return entryDate >= startDate && entryDate <= endDate;
        });
        
        console.log('January 2024 data:', januaryData);
        
        // Calculate January statistics
        const totalQuestions = januaryData.reduce((sum, entry) => sum + entry.questions_count, 0);
        const avgPercentage = januaryData.reduce((sum, entry) => sum + entry.percentage, 0) / januaryData.length;
        
        console.log('January stats:', {
            days: januaryData.length,
            totalQuestions,
            averageScore: avgPercentage.toFixed(2) + '%'
        });
    }
});

// Example 3: Find your best performance days
window.getPassMedHeatmapData((result) => {
    if (result && result.data && result.data.parsed) {
        const entries = result.data.parsed;
        
        // Sort by percentage descending
        const topDays = entries
            .sort((a, b) => b.percentage - a.percentage)
            .slice(0, 10);
        
        console.log('Top 10 performance days:');
        topDays.forEach((day, index) => {
            console.log(`${index + 1}. ${day.date}: ${day.percentage}% (${day.questions_count} questions)`);
        });
    }
});

// Example 4: Calculate weekly averages
window.getPassMedHeatmapData((result) => {
    if (result && result.data && result.data.parsed) {
        const entries = result.data.parsed;
        const weeklyStats = {};
        
        entries.forEach(entry => {
            const date = new Date(entry.date);
            const week = getWeekNumber(date);
            const year = date.getFullYear();
            const weekKey = `${year}-W${week}`;
            
            if (!weeklyStats[weekKey]) {
                weeklyStats[weekKey] = {
                    questions: 0,
                    totalPercentage: 0,
                    days: 0
                };
            }
            
            weeklyStats[weekKey].questions += entry.questions_count;
            weeklyStats[weekKey].totalPercentage += entry.percentage;
            weeklyStats[weekKey].days += 1;
        });
        
        console.log('Weekly averages:');
        Object.entries(weeklyStats).forEach(([week, stats]) => {
            console.log(`${week}: ${(stats.totalPercentage / stats.days).toFixed(2)}% avg, ${stats.questions} questions over ${stats.days} days`);
        });
    }
});

// Helper function to get week number
function getWeekNumber(date) {
    const d = new Date(date);
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

// Example 5: Export data as JSON file
window.exportPassMedHeatmapData();

// Example 6: Clear all stored data
// WARNING: This will delete all intercepted data
// window.clearPassMedHeatmapData((success, error) => {
//     if (success) {
//         console.log('Data cleared successfully');
//     } else {
//         console.error('Error clearing data:', error);
//     }
// });

// Example 7: Monitor for new data updates
// This sets up a listener for storage changes
chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local') {
        if (changes.passmed_heatmap_data) {
            console.log('Heatmap data updated!');
            console.log('Old value:', changes.passmed_heatmap_data.oldValue);
            console.log('New value:', changes.passmed_heatmap_data.newValue);
        }
        if (changes.passmed_heatmap_metadata) {
            console.log('Metadata updated:', changes.passmed_heatmap_metadata.newValue);
        }
    }
});

// Example 8: Create a simple visualization in the console
window.getPassMedHeatmapData((result) => {
    if (result && result.data && result.data.parsed) {
        const entries = result.data.parsed.slice(-30); // Last 30 days
        
        console.log('Last 30 days performance chart:');
        entries.forEach(entry => {
            const bar = '█'.repeat(Math.round(entry.percentage / 5));
            const spaces = ' '.repeat(20 - bar.length);
            console.log(`${entry.date}: ${bar}${spaces} ${entry.percentage}% (${entry.questions_count} Qs)`);
        });
    }
});