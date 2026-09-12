/**
 * LogicPilot AI - Walk-Forward Backtesting Module
 * Tests prediction engine on historical data to measure real performance
 */

const Backtester = {
    
    /**
     * Run walk-forward backtest on historical outcomes
     * @param {Array} history - Array of historical outcome records
     * @param {number} windowSize - Number of outcomes to use for prediction (default: 100)
     * @returns {Object} Backtest results
     */
    async runBacktest(history, windowSize = 100) {
        console.log('[LogicPilot AI Prediction] Starting walk-forward backtest');
        console.log('[LogicPilot AI Prediction] History size:', history.length, 'Window size:', windowSize);
        
        if (!history || history.length < windowSize + 10) {
            console.warn('[LogicPilot AI Prediction] Insufficient data for backtest');
            return this.getEmptyResults();
        }
        
        const results = {
            totalPredictions: 0,
            correct: 0,
            incorrect: 0,
            accuracy: 0,
            lowConfidence: { total: 0, correct: 0, accuracy: 0 },
            mediumConfidence: { total: 0, correct: 0, accuracy: 0 },
            highConfidence: { total: 0, correct: 0, accuracy: 0 },
            predictions: [],
            baselineComparisons: {}
        };
        
        // Walk-forward: for each position, predict next outcome
        for (let i = windowSize; i < history.length; i++) {
            // Get window of historical data (before the outcome being predicted)
            const window = history.slice(i - windowSize, i);
            
            // Generate features
            const features = FeatureEngine.generateFeatures(window);
            
            // Generate prediction
            const prediction = PredictionEngine.predict(features);
            
            if (prediction.noSignal) {
                continue; // Skip predictions with no signal
            }
            
            // Get actual outcome
            const actual = history[i].outcome;
            
            // Evaluate
            const correct = prediction.prediction === actual;
            
            // Update results
            results.totalPredictions++;
            if (correct) {
                results.correct++;
            } else {
                results.incorrect++;
            }
            
            // Update confidence-specific stats
            if (prediction.confidence === 'LOW') {
                results.lowConfidence.total++;
                if (correct) results.lowConfidence.correct++;
            } else if (prediction.confidence === 'MEDIUM') {
                results.mediumConfidence.total++;
                if (correct) results.mediumConfidence.correct++;
            } else if (prediction.confidence === 'HIGH') {
                results.highConfidence.total++;
                if (correct) results.highConfidence.correct++;
            }
            
            // Store prediction detail
            results.predictions.push({
                index: i,
                periodId: history[i].periodId,
                prediction: prediction.prediction,
                actual: actual,
                correct: correct,
                confidence: prediction.confidence,
                bigProbability: prediction.bigProbability,
                smallProbability: prediction.smallProbability
            });
        }
        
        // Calculate accuracies
        if (results.totalPredictions > 0) {
            results.accuracy = (results.correct / results.totalPredictions * 100).toFixed(1);
        }
        
        if (results.lowConfidence.total > 0) {
            results.lowConfidence.accuracy = (results.lowConfidence.correct / results.lowConfidence.total * 100).toFixed(1);
        }
        
        if (results.mediumConfidence.total > 0) {
            results.mediumConfidence.accuracy = (results.mediumConfidence.correct / results.mediumConfidence.total * 100).toFixed(1);
        }
        
        if (results.highConfidence.total > 0) {
            results.highConfidence.accuracy = (results.highConfidence.correct / results.highConfidence.total * 100).toFixed(1);
        }
        
        // Run baseline comparisons
        results.baselineComparisons = this.runBaselineComparisons(history, windowSize);
        
        console.log('[LogicPilot AI Prediction] Backtest complete:', results);
        return results;
    },
    
    /**
     * Run baseline comparisons
     */
    runBaselineComparisons(history, windowSize) {
        const baselines = {
            random: { correct: 0, total: 0, accuracy: 0 },
            alwaysBig: { correct: 0, total: 0, accuracy: 0 },
            alwaysSmall: { correct: 0, total: 0, accuracy: 0 },
            majority: { correct: 0, total: 0, accuracy: 0 }
        };
        
        for (let i = windowSize; i < history.length; i++) {
            const actual = history[i].outcome;
            const window = history.slice(i - windowSize, i);
            
            // Random baseline
            const randomPrediction = Math.random() > 0.5 ? 'BIG' : 'SMALL';
            baselines.random.total++;
            if (randomPrediction === actual) baselines.random.correct++;
            
            // Always BIG
            baselines.alwaysBig.total++;
            if ('BIG' === actual) baselines.alwaysBig.correct++;
            
            // Always SMALL
            baselines.alwaysSmall.total++;
            if ('SMALL' === actual) baselines.alwaysSmall.correct++;
            
            // Majority of recent outcomes
            const recentOutcomes = window.map(o => o.outcome);
            const bigCount = recentOutcomes.filter(o => o === 'BIG').length;
            const smallCount = recentOutcomes.filter(o => o === 'SMALL').length;
            const majorityPrediction = bigCount > smallCount ? 'BIG' : 'SMALL';
            
            baselines.majority.total++;
            if (majorityPrediction === actual) baselines.majority.correct++;
        }
        
        // Calculate baseline accuracies
        if (baselines.random.total > 0) {
            baselines.random.accuracy = (baselines.random.correct / baselines.random.total * 100).toFixed(1);
        }
        if (baselines.alwaysBig.total > 0) {
            baselines.alwaysBig.accuracy = (baselines.alwaysBig.correct / baselines.alwaysBig.total * 100).toFixed(1);
        }
        if (baselines.alwaysSmall.total > 0) {
            baselines.alwaysSmall.accuracy = (baselines.alwaysSmall.correct / baselines.alwaysSmall.total * 100).toFixed(1);
        }
        if (baselines.majority.total > 0) {
            baselines.majority.accuracy = (baselines.majority.correct / baselines.majority.total * 100).toFixed(1);
        }
        
        return baselines;
    },
    
    /**
     * Get empty results structure
     */
    getEmptyResults() {
        return {
            totalPredictions: 0,
            correct: 0,
            incorrect: 0,
            accuracy: 0,
            lowConfidence: { total: 0, correct: 0, accuracy: 0 },
            mediumConfidence: { total: 0, correct: 0, accuracy: 0 },
            highConfidence: { total: 0, correct: 0, accuracy: 0 },
            predictions: [],
            baselineComparisons: {}
        };
    },
    
    /**
     * Format backtest results for display
     */
    formatResults(results) {
        let output = '=== BACKTEST RESULTS ===\n';
        output += `Total Predictions: ${results.totalPredictions}\n`;
        output += `Correct: ${results.correct}\n`;
        output += `Incorrect: ${results.incorrect}\n`;
        output += `Overall Accuracy: ${results.accuracy}%\n\n`;
        
        output += '=== ACCURACY BY CONFIDENCE ===\n';
        output += `LOW Confidence: ${results.lowConfidence.accuracy}% (${results.lowConfidence.correct}/${results.lowConfidence.total})\n`;
        output += `MEDIUM Confidence: ${results.mediumConfidence.accuracy}% (${results.mediumConfidence.correct}/${results.mediumConfidence.total})\n`;
        output += `HIGH Confidence: ${results.highConfidence.accuracy}% (${results.highConfidence.correct}/${results.highConfidence.total})\n\n`;
        
        if (results.baselineComparisons) {
            output += '=== BASELINE COMPARISONS ===\n';
            output += `Random (50/50): ${results.baselineComparisons.random.accuracy}%\n`;
            output += `Always BIG: ${results.baselineComparisons.alwaysBig.accuracy}%\n`;
            output += `Always SMALL: ${results.baselineComparisons.alwaysSmall.accuracy}%\n`;
            output += `Majority of Recent: ${results.baselineComparisons.majority.accuracy}%\n`;
        }
        
        return output;
    }
};

// Export for use in other modules
export { Backtester };
