// Background script for PassMed Progress Tracker

// Handle messages from popup and content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'syncToTracker') {
        syncDataToStorage(request.data, request.auto)
            .then(result => sendResponse(result))
            .catch(error => sendResponse({ success: false, error: error.message }));
        return true; // Keep message channel open for async response
    } else if (request.action === 'getProgressData') {
        getProgressData()
            .then(data => sendResponse({ success: true, data: data }))
            .catch(error => sendResponse({ success: false, error: error.message }));
        return true;
    }
});

// Function to sync data to Chrome storage
async function syncDataToStorage(data, isAuto = false) {
    try {
        // Get existing data from storage (merged view of local + sync)
        const existingData = await getProgressData();

        // Merge new data with existing data
        let updatedCount = 0;
        for (const [date, count] of Object.entries(data.daily)) {
            if (count > 0) {
                if (!existingData.daily[date] || existingData.daily[date] !== count) {
                    existingData.daily[date] = count;
                    updatedCount++;
                }
            }
        }

        if (updatedCount === 0) {
            return { success: true, message: 'No new data to sync', synced: 0 };
        }

        // Update metadata
        existingData.lastSync = new Date().toISOString();
        existingData.totalDays = Object.keys(existingData.daily).length;
        existingData.totalQuestions = Object.values(existingData.daily).reduce((sum, count) => sum + count, 0);

        // Local storage is the primary store
        await chrome.storage.local.set({
            progressData: existingData,
            lastBackup: new Date().toISOString()
        });

        // Sync storage is best-effort: its 8KB per-item quota will eventually
        // be exceeded by a long daily history, which must not fail the sync
        try {
            await chrome.storage.sync.set({ progressData: existingData });
        } catch (syncError) {
        }

        // Show notification (only for manual syncs)
        if (!isAuto) {
            chrome.notifications.create({
                type: 'basic',
                iconUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
                title: 'PassMed Progress Tracker',
                message: `Successfully synced ${updatedCount} days of progress data!`
            });
        }

        return { success: true, synced: updatedCount, totalDays: existingData.totalDays };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

// Function to get all progress data. Reads both stores and merges them,
// taking the higher count per day (counts only ever grow).
async function getProgressData() {
    let syncData = null;
    let localData = null;
    try {
        syncData = (await chrome.storage.sync.get(['progressData'])).progressData;
    } catch (error) {
    }
    try {
        localData = (await chrome.storage.local.get(['progressData'])).progressData;
    } catch (error) {
    }

    const merged = Object.assign({}, syncData || {}, localData || {}, { daily: {} });
    for (const source of [syncData, localData]) {
        if (source && source.daily) {
            for (const [date, count] of Object.entries(source.daily)) {
                merged.daily[date] = Math.max(merged.daily[date] || 0, count);
            }
        }
    }
    return merged;
}

// Handle installation
chrome.runtime.onInstalled.addListener(() => {
});