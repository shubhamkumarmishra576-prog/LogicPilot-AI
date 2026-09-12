/**
 * LogicPilot AI - Historical Data Collector
 * Collects and stores BIG/SMALL outcomes for prediction analysis
 */

const HistoryCollector = {
    STORAGE_KEY: 'logicpilot_history',
    MAX_HISTORY_SIZE: 10000, // Support thousands of rounds for testing
    
    /**
     * Initialize the history collector
     */
    async init() {
        console.log('[LogicPilot AI Prediction] HistoryCollector initialized');
        await this.ensureStorage();
    },
    
    /**
     * Ensure storage is initialized
     */
    async ensureStorage() {
        const data = await chrome.storage.local.get(this.STORAGE_KEY);
        if (!data[this.STORAGE_KEY]) {
            await chrome.storage.local.set({
                [this.STORAGE_KEY]: []
            });
            console.log('[LogicPilot AI Prediction] History storage initialized');
        }
    },
    
    /**
     * Get all historical records
     */
    async getHistory() {
        const data = await chrome.storage.local.get(this.STORAGE_KEY);
        return data[this.STORAGE_KEY] || [];
    },
    
    /**
     * Add a new outcome record
     * @param {string} periodId - The period/round ID
     * @param {string} outcome - "BIG" or "SMALL"
     */
    async addOutcome(periodId, outcome) {
        try {
            // Validate outcome
            if (outcome !== 'BIG' && outcome !== 'SMALL') {
                console.warn('[LogicPilot AI Prediction] Invalid outcome:', outcome);
                return false;
            }
            
            // Normalize outcome to uppercase
            const normalizedOutcome = outcome.toUpperCase();
            
            // Get existing history
            const history = await this.getHistory();
            
            // Check for duplicate period ID
            const existingIndex = history.findIndex(record => record.periodId === periodId);
            if (existingIndex !== -1) {
                console.log('[LogicPilot AI Prediction] Duplicate period ID detected, skipping:', periodId);
                return false;
            }
            
            // Create new record
            const record = {
                periodId: String(periodId),
                outcome: normalizedOutcome,
                timestamp: Date.now()
            };
            
            // Add to history (maintain chronological order)
            history.push(record);
            
            // Trim if exceeding max size
            if (history.length > this.MAX_HISTORY_SIZE) {
                history.shift(); // Remove oldest
                console.log('[LogicPilot AI Prediction] History trimmed to max size');
            }
            
            // Save to storage
            await chrome.storage.local.set({
                [this.STORAGE_KEY]: history
            });
            
            console.log('[LogicPilot AI Prediction] Outcome recorded:', record);
            return true;
            
        } catch (error) {
            console.error('[LogicPilot AI Prediction] Error adding outcome:', error);
            return false;
        }
    },
    
    /**
     * Get the latest N outcomes for prediction
     * @param {number} count - Number of recent outcomes to retrieve
     */
    async getLatestOutcomes(count = 100) {
        const history = await this.getHistory();
        const latest = history.slice(-count);
        return latest;
    },
    
    /**
     * Get total count of records
     */
    async getCount() {
        const history = await this.getHistory();
        return history.length;
    },
    
    /**
     * Clear all history (for testing/reset)
     */
    async clearHistory() {
        await chrome.storage.local.set({
            [this.STORAGE_KEY]: []
        });
        console.log('[LogicPilot AI Prediction] History cleared');
    },
    
    /**
     * Get history statistics
     */
    async getStats() {
        const history = await this.getHistory();
        const bigCount = history.filter(r => r.outcome === 'BIG').length;
        const smallCount = history.filter(r => r.outcome === 'SMALL').length;
        
        return {
            total: history.length,
            big: bigCount,
            small: smallCount,
            bigRatio: history.length > 0 ? (bigCount / history.length * 100).toFixed(1) : 0,
            smallRatio: history.length > 0 ? (smallCount / history.length * 100).toFixed(1) : 0
        };
    }
};

// Export for use in other modules
export { HistoryCollector };
