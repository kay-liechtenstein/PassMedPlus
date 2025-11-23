// Utility functions for working with the intercepted heatmap data
// This file provides helper functions that can be used in other scripts

const HeatmapUtils = {
    // Get the stored heatmap data
    getData: function() {
        return new Promise((resolve, reject) => {
            chrome.storage.local.get(['passmed_heatmap_data', 'passmed_heatmap_metadata'], (result) => {
                if (chrome.runtime.lastError) {
                    reject(chrome.runtime.lastError);
                } else {
                    resolve({
                        data: result.passmed_heatmap_data,
                        metadata: result.passmed_heatmap_metadata
                    });
                }
            });
        });
    },

    // Get parsed heatmap entries
    getParsedEntries: async function() {
        try {
            const result = await this.getData();
            return result.data?.parsed || [];
        } catch (error) {
            return [];
        }
    },

    // Get entries within a date range
    getEntriesInRange: async function(startDate, endDate) {
        const entries = await this.getParsedEntries();
        const start = new Date(startDate);
        const end = new Date(endDate);
        
        return entries.filter(entry => {
            const entryDate = new Date(entry.date);
            return entryDate >= start && entryDate <= end;
        });
    },

    // Calculate statistics from the data
    getStatistics: async function() {
        const entries = await this.getParsedEntries();
        
        if (entries.length === 0) {
            return null;
        }

        const totalQuestions = entries.reduce((sum, entry) => sum + entry.questions_count, 0);
        const averagePercentage = entries.reduce((sum, entry) => sum + entry.percentage, 0) / entries.length;
        
        // Find best and worst days
        const sortedByPercentage = [...entries].sort((a, b) => b.percentage - a.percentage);
        const bestDay = sortedByPercentage[0];
        const worstDay = sortedByPercentage[sortedByPercentage.length - 1];
        
        // Calculate streak
        const streak = this.calculateStreak(entries);
        
        return {
            totalDays: entries.length,
            totalQuestions,
            averagePercentage: averagePercentage.toFixed(2),
            bestDay,
            worstDay,
            currentStreak: streak.current,
            longestStreak: streak.longest
        };
    },

    // Calculate study streak
    calculateStreak: function(entries) {
        if (entries.length === 0) return { current: 0, longest: 0 };
        
        // Sort entries by date
        const sorted = [...entries].sort((a, b) => new Date(a.date) - new Date(b.date));
        
        let currentStreak = 1;
        let longestStreak = 1;
        let tempStreak = 1;
        
        for (let i = 1; i < sorted.length; i++) {
            const prevDate = new Date(sorted[i - 1].date);
            const currDate = new Date(sorted[i].date);
            const daysDiff = Math.floor((currDate - prevDate) / (1000 * 60 * 60 * 24));
            
            if (daysDiff === 1) {
                tempStreak++;
                if (tempStreak > longestStreak) {
                    longestStreak = tempStreak;
                }
            } else {
                tempStreak = 1;
            }
        }
        
        // Check if the streak is current (last entry is today or yesterday)
        const lastEntry = sorted[sorted.length - 1];
        const lastDate = new Date(lastEntry.date);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        
        if (lastDate >= yesterday) {
            currentStreak = tempStreak;
        } else {
            currentStreak = 0;
        }
        
        return { current: currentStreak, longest: longestStreak };
    },

    // Generate chart data for visualization
    getChartData: async function(limit = 30) {
        const entries = await this.getParsedEntries();
        const recent = entries.slice(-limit);
        
        return {
            labels: recent.map(entry => entry.date),
            datasets: [
                {
                    label: 'Questions Answered',
                    data: recent.map(entry => entry.questions_count),
                    type: 'bar',
                    yAxisID: 'y-questions'
                },
                {
                    label: 'Correct Percentage',
                    data: recent.map(entry => entry.percentage),
                    type: 'line',
                    yAxisID: 'y-percentage'
                }
            ]
        };
    },

    // Export data as CSV
    exportAsCSV: async function() {
        const entries = await this.getParsedEntries();
        
        if (entries.length === 0) {
            return;
        }
        
        const csv = [
            'Date,Questions Count,Percentage',
            ...entries.map(entry => `${entry.date},${entry.questions_count},${entry.percentage}`)
        ].join('\n');
        
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `passmed_heatmap_data_${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
    },

    // Clear stored data
    clearData: function() {
        return new Promise((resolve, reject) => {
            chrome.storage.local.remove(['passmed_heatmap_data', 'passmed_heatmap_metadata'], () => {
                if (chrome.runtime.lastError) {
                    reject(chrome.runtime.lastError);
                } else {
                    resolve(true);
                }
            });
        });
    }
};

// Make available globally if needed
if (typeof window !== 'undefined') {
    window.HeatmapUtils = HeatmapUtils;
}