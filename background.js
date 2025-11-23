// Background script for PassMed Progress Tracker

// Handle messages from popup and content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'syncToTracker') {
        // Always save to Chrome storage first
        syncDataToStorage(request.data, request.auto)
            .then(result => {
                // Optionally try to sync to external tracker if configured
                if (!request.auto || chrome.storage.sync.get(['enableExternalSync'])) {
                    // For now, just return the storage result
                    return result;
                }
                return result;
            })
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
        // Get existing data from storage
        const stored = await chrome.storage.sync.get(['progressData']);
        const existingData = stored.progressData || { daily: {} };
        
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
        
        // Save to Chrome sync storage (syncs across devices)
        await chrome.storage.sync.set({ progressData: existingData });
        
        // Also save to local storage as backup
        await chrome.storage.local.set({ 
            progressData: existingData,
            lastBackup: new Date().toISOString()
        });
        
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

// Function to get all progress data
async function getProgressData() {
    try {
        const stored = await chrome.storage.sync.get(['progressData']);
        return stored.progressData || { daily: {} };
    } catch (error) {
        try {
            // Fallback to local storage if sync fails
            const local = await chrome.storage.local.get(['progressData']);
            return local.progressData || { daily: {} };
        } catch (localError) {
            return { daily: {} };
        }
    }
}

// Handle installation
chrome.runtime.onInstalled.addListener(() => {
});