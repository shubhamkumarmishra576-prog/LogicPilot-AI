/**
 * LogicPilot AI - Prediction Engine
 * Uses statistical models to predict next BIG/SMALL outcome
 * Transparent, modular design for future ML integration
 */

const PredictionEngine = {
    
    /**
     * Generate prediction based on historical features
     * @param {Object} features - Feature set from FeatureEngine
     * @returns {Object} Prediction with probabilities and confidence
     */
    predict(features) {
        console.log('[LogicPilot AI Prediction] Generating prediction from features');
        
        // Check data quality
        if (features.dataQuality === 'VERY_LOW' || features.dataSize < 10) {
            return this.getNoSignalPrediction();
        }
        
        // Base probabilities from recent ratios
        let bigProb = features.bigSmallRatio100.bigPercent;
        let smallProb = features.bigSmallRatio100.smallPercent;
        
        // Apply trend adjustment
        const trendAdjustment = this.calculateTrendAdjustment(features);
        bigProb += trendAdjustment.big;
        smallProb += trendAdjustment.small;
        
        // Apply streak adjustment (mean reversion)
        const streakAdjustment = this.calculateStreakAdjustment(features);
        bigProb += streakAdjustment.big;
        smallProb += streakAdjustment.small;
        
        // Apply transition probability adjustment
        const transitionAdjustment = this.calculateTransitionAdjustment(features);
        bigProb += transitionAdjustment.big;
        smallProb += transitionAdjustment.small;
        
        // Normalize to ensure probabilities sum to 100
        const total = bigProb + smallProb;
        if (total > 0) {
            bigProb = (bigProb / total) * 100;
            smallProb = (smallProb / total) * 100;
        } else {
            bigProb = 50;
            smallProb = 50;
        }
        
        // Determine prediction
        const prediction = bigProb > smallProb ? 'BIG' : 'SMALL';
        
        // Calculate confidence based on signal strength
        const confidence = this.calculateConfidence(features, bigProb, smallProb);
        
        const result = {
            prediction: prediction,
            bigProbability: parseFloat(bigProb.toFixed(1)),
            smallProbability: parseFloat(smallProb.toFixed(1)),
            confidence: confidence,
            features: features,
            timestamp: Date.now()
        };
        
        console.log('[LogicPilot AI Prediction] Prediction generated:', result);
        return result;
    },
    
    /**
     * Calculate trend adjustment
     */
    calculateTrendAdjustment(features) {
        let adjustment = { big: 0, small: 0 };
        
        // Mean reversion: if trend is strong, bet against it
        if (features.trendDirection === 'BIG_BIAS') {
            adjustment.small += 3; // Slight bias toward SMALL
        } else if (features.trendDirection === 'SMALL_BIAS') {
            adjustment.big += 3; // Slight bias toward BIG
        }
        
        return adjustment;
    },
    
    /**
     * Calculate streak adjustment (mean reversion)
     */
    calculateStreakAdjustment(features) {
        let adjustment = { big: 0, small: 0 };
        
        // Long streaks tend to reverse
        if (features.currentStreak === 'BIG' && features.streakLength >= 3) {
            adjustment.small += features.streakLength * 1.5;
        } else if (features.currentStreak === 'SMALL' && features.streakLength >= 3) {
            adjustment.big += features.streakLength * 1.5;
        }
        
        // Cap adjustment to prevent extreme bias
        adjustment.big = Math.min(adjustment.big, 10);
        adjustment.small = Math.min(adjustment.small, 10);
        
        return adjustment;
    },
    
    /**
     * Calculate transition probability adjustment
     */
    calculateTransitionAdjustment(features) {
        let adjustment = { big: 0, small: 0 };
        
        // Use transition probabilities from recent history
        if (features.currentOutcome === 'BIG') {
            // If current is BIG, use BIG transition probabilities
            adjustment.big += (features.bigToBigTransition - 0.5) * 10;
            adjustment.small += (features.bigToSmallTransition - 0.5) * 10;
        } else if (features.currentOutcome === 'SMALL') {
            // If current is SMALL, use SMALL transition probabilities
            adjustment.big += (features.smallToBigTransition - 0.5) * 10;
            adjustment.small += (features.smallToSmallTransition - 0.5) * 10;
        }
        
        return adjustment;
    },
    
    /**
     * Calculate confidence level
     */
    calculateConfidence(features, bigProb, smallProb) {
        const probDiff = Math.abs(bigProb - smallProb);
        const dataSize = features.dataSize;
        
        // Base confidence on probability difference
        let confidenceScore = 0;
        
        if (probDiff < 5) {
            confidenceScore = 0; // No meaningful signal
        } else if (probDiff < 10) {
            confidenceScore = 1;
        } else if (probDiff < 15) {
            confidenceScore = 2;
        } else if (probDiff < 20) {
            confidenceScore = 3;
        } else {
            confidenceScore = 4;
        }
        
        // Adjust for data quality
        if (dataSize < 30) {
            confidenceScore = Math.max(0, confidenceScore - 2);
        } else if (dataSize < 50) {
            confidenceScore = Math.max(0, confidenceScore - 1);
        }
        
        // Convert to confidence level
        if (confidenceScore <= 0) return 'LOW';
        if (confidenceScore <= 2) return 'LOW';
        if (confidenceScore <= 3) return 'MEDIUM';
        return 'HIGH';
    },
    
    /**
     * Get no-signal prediction when insufficient data
     */
    getNoSignalPrediction() {
        return {
            prediction: null,
            bigProbability: 50.0,
            smallProbability: 50.0,
            confidence: 'LOW',
            features: null,
            timestamp: Date.now(),
            noSignal: true
        };
    },
    
    /**
     * Simple baseline prediction: always predict majority of recent outcomes
     */
    baselineMajority(features) {
        if (!features || features.dataSize === 0) {
            return { prediction: 'BIG', bigProbability: 50, smallProbability: 50 };
        }
        
        const recentRatio = features.bigSmallRatio10;
        const prediction = recentRatio.bigPercent > recentRatio.smallPercent ? 'BIG' : 'SMALL';
        
        return {
            prediction: prediction,
            bigProbability: recentRatio.bigPercent,
            smallProbability: recentRatio.smallPercent
        };
    },
    
    /**
     * Simple baseline prediction: always BIG
     */
    baselineAlwaysBig() {
        return { prediction: 'BIG', bigProbability: 100, smallProbability: 0 };
    },
    
    /**
     * Simple baseline prediction: always SMALL
     */
    baselineAlwaysSmall() {
        return { prediction: 'SMALL', bigProbability: 0, smallProbability: 100 };
    },
    
    /**
     * Random baseline prediction (50/50)
     */
    baselineRandom() {
        const prediction = Math.random() > 0.5 ? 'BIG' : 'SMALL';
        return { prediction: prediction, bigProbability: 50, smallProbability: 50 };
    }
};

// Export for use in other modules
export { PredictionEngine };
