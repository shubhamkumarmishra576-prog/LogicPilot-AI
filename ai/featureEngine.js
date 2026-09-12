/**
 * LogicPilot AI - Feature Engine
 * Analyzes historical outcomes to generate predictive features
 * Prevents data leakage by only using information available before the prediction
 */

const FeatureEngine = {
    
    /**
     * Generate features from historical outcomes
     * @param {Array} outcomes - Array of outcome records (chronological order)
     * @returns {Object} Feature set for prediction
     */
    generateFeatures(outcomes) {
        if (!outcomes || outcomes.length === 0) {
            console.log('[LogicPilot AI Prediction] No outcomes available for feature generation');
            return this.getEmptyFeatures();
        }
        
        const features = {};
        const outcomesOnly = outcomes.map(o => o.outcome);
        
        // BIG/SMALL ratios at different time windows
        features.bigSmallRatio100 = this.calculateRatio(outcomesOnly.slice(-100));
        features.bigSmallRatio50 = this.calculateRatio(outcomesOnly.slice(-50));
        features.bigSmallRatio20 = this.calculateRatio(outcomesOnly.slice(-20));
        features.bigSmallRatio10 = this.calculateRatio(outcomesOnly.slice(-10));
        
        // Current outcome (most recent)
        features.currentOutcome = outcomesOnly[outcomesOnly.length - 1];
        
        // Current streak
        const streakInfo = this.calculateStreak(outcomesOnly);
        features.currentStreak = streakInfo.type;
        features.streakLength = streakInfo.length;
        
        // Historical streak statistics
        features.maxBigStreak = this.calculateMaxStreak(outcomesOnly, 'BIG');
        features.maxSmallStreak = this.calculateMaxStreak(outcomesOnly, 'SMALL');
        features.avgStreakLength = this.calculateAverageStreakLength(outcomesOnly);
        
        // Transition probabilities
        const transitions = this.calculateTransitions(outcomesOnly);
        features.bigToBigTransition = transitions.bigToBig;
        features.bigToSmallTransition = transitions.bigToSmall;
        features.smallToBigTransition = transitions.smallToBig;
        features.smallToSmallTransition = transitions.smallToSmall;
        
        // Recent patterns
        features.recentPattern2 = this.getRecentPattern(outcomesOnly, 2);
        features.recentPattern3 = this.getRecentPattern(outcomesOnly, 3);
        features.recentPattern4 = this.getRecentPattern(outcomesOnly, 4);
        
        // Distribution/trend changes
        features.trendDirection = this.calculateTrendDirection(outcomesOnly.slice(-20));
        features.volatility = this.calculateVolatility(outcomesOnly.slice(-20));
        
        // Data quality indicators
        features.dataSize = outcomesOnly.length;
        features.dataQuality = this.assessDataQuality(outcomesOnly.length);
        
        console.log('[LogicPilot AI Prediction] Features generated:', features);
        return features;
    },
    
    /**
     * Calculate BIG/SMALL ratio
     */
    calculateRatio(outcomes) {
        if (!outcomes || outcomes.length === 0) {
            return { big: 0, small: 0, bigPercent: 50, smallPercent: 50 };
        }
        
        const bigCount = outcomes.filter(o => o === 'BIG').length;
        const smallCount = outcomes.filter(o => o === 'SMALL').length;
        const total = outcomes.length;
        
        return {
            big: bigCount,
            small: smallCount,
            bigPercent: total > 0 ? (bigCount / total * 100) : 50,
            smallPercent: total > 0 ? (smallCount / total * 100) : 50
        };
    },
    
    /**
     * Calculate current streak
     */
    calculateStreak(outcomes) {
        if (!outcomes || outcomes.length === 0) {
            return { type: null, length: 0 };
        }
        
        let streakType = outcomes[outcomes.length - 1];
        let streakLength = 1;
        
        for (let i = outcomes.length - 2; i >= 0; i--) {
            if (outcomes[i] === streakType) {
                streakLength++;
            } else {
                break;
            }
        }
        
        return { type: streakType, length: streakLength };
    },
    
    /**
     * Calculate maximum streak for a specific outcome
     */
    calculateMaxStreak(outcomes, outcomeType) {
        if (!outcomes || outcomes.length === 0) return 0;
        
        let maxStreak = 0;
        let currentStreak = 0;
        
        for (const outcome of outcomes) {
            if (outcome === outcomeType) {
                currentStreak++;
                maxStreak = Math.max(maxStreak, currentStreak);
            } else {
                currentStreak = 0;
            }
        }
        
        return maxStreak;
    },
    
    /**
     * Calculate average streak length
     */
    calculateAverageStreakLength(outcomes) {
        if (!outcomes || outcomes.length === 0) return 0;
        
        const streaks = [];
        let currentStreak = 1;
        
        for (let i = 1; i < outcomes.length; i++) {
            if (outcomes[i] === outcomes[i - 1]) {
                currentStreak++;
            } else {
                streaks.push(currentStreak);
                currentStreak = 1;
            }
        }
        streaks.push(currentStreak);
        
        if (streaks.length === 0) return 0;
        
        const sum = streaks.reduce((a, b) => a + b, 0);
        return (sum / streaks.length).toFixed(2);
    },
    
    /**
     * Calculate transition probabilities
     */
    calculateTransitions(outcomes) {
        if (!outcomes || outcomes.length < 2) {
            return {
                bigToBig: 0.5,
                bigToSmall: 0.5,
                smallToBig: 0.5,
                smallToSmall: 0.5
            };
        }
        
        let bigToBig = 0, bigToSmall = 0;
        let smallToBig = 0, smallToSmall = 0;
        let bigCount = 0, smallCount = 0;
        
        for (let i = 0; i < outcomes.length - 1; i++) {
            const current = outcomes[i];
            const next = outcomes[i + 1];
            
            if (current === 'BIG') {
                bigCount++;
                if (next === 'BIG') bigToBig++;
                else bigToSmall++;
            } else {
                smallCount++;
                if (next === 'BIG') smallToBig++;
                else smallToSmall++;
            }
        }
        
        return {
            bigToBig: bigCount > 0 ? bigToBig / bigCount : 0.5,
            bigToSmall: bigCount > 0 ? bigToSmall / bigCount : 0.5,
            smallToBig: smallCount > 0 ? smallToBig / smallCount : 0.5,
            smallToSmall: smallCount > 0 ? smallToSmall / smallCount : 0.5
        };
    },
    
    /**
     * Get recent pattern of specified length
     */
    getRecentPattern(outcomes, length) {
        if (!outcomes || outcomes.length === 0) return '';
        const start = Math.max(0, outcomes.length - length);
        return outcomes.slice(start).join('');
    },
    
    /**
     * Calculate trend direction
     */
    calculateTrendDirection(outcomes) {
        if (!outcomes || outcomes.length < 5) return 'NEUTRAL';
        
        const recent = outcomes.slice(-10);
        const bigCount = recent.filter(o => o === 'BIG').length;
        const smallCount = recent.filter(o => o === 'SMALL').length;
        
        if (bigCount > smallCount + 2) return 'BIG_BIAS';
        if (smallCount > bigCount + 2) return 'SMALL_BIAS';
        return 'NEUTRAL';
    },
    
    /**
     * Calculate volatility (frequency of outcome changes)
     */
    calculateVolatility(outcomes) {
        if (!outcomes || outcomes.length < 2) return 0;
        
        let changes = 0;
        for (let i = 1; i < outcomes.length; i++) {
            if (outcomes[i] !== outcomes[i - 1]) {
                changes++;
            }
        }
        
        return (changes / (outcomes.length - 1) * 100).toFixed(1);
    },
    
    /**
     * Assess data quality based on sample size
     */
    assessDataQuality(size) {
        if (size < 10) return 'VERY_LOW';
        if (size < 30) return 'LOW';
        if (size < 50) return 'MEDIUM';
        if (size < 100) return 'GOOD';
        return 'HIGH';
    },
    
    /**
     * Get empty features when no data available
     */
    getEmptyFeatures() {
        return {
            bigSmallRatio100: { big: 0, small: 0, bigPercent: 50, smallPercent: 50 },
            bigSmallRatio50: { big: 0, small: 0, bigPercent: 50, smallPercent: 50 },
            bigSmallRatio20: { big: 0, small: 0, bigPercent: 50, smallPercent: 50 },
            bigSmallRatio10: { big: 0, small: 0, bigPercent: 50, smallPercent: 50 },
            currentOutcome: null,
            currentStreak: null,
            streakLength: 0,
            maxBigStreak: 0,
            maxSmallStreak: 0,
            avgStreakLength: 0,
            bigToBigTransition: 0.5,
            bigToSmallTransition: 0.5,
            smallToBigTransition: 0.5,
            smallToSmallTransition: 0.5,
            recentPattern2: '',
            recentPattern3: '',
            recentPattern4: '',
            trendDirection: 'NEUTRAL',
            volatility: 0,
            dataSize: 0,
            dataQuality: 'VERY_LOW'
        };
    }
};

// Export for use in other modules
export { FeatureEngine };
