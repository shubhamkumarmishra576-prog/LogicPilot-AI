/**
 * LogicPilot AI - Accuracy Tracker
 * Tracks prediction accuracy and performance metrics
 */

const AccuracyTracker = {
    STORAGE_KEY: 'logicpilot_accuracy',
    PREDICTIONS_KEY: 'logicpilot_predictions',
    
    /**
     * Initialize the accuracy tracker
     */
    async init() {
        console.log('[LogicPilot AI Prediction] AccuracyTracker initialized');
        await this.ensureStorage();
    },
    
    /**
     * Ensure storage is initialized
     */
    async ensureStorage() {
        const data = await chrome.storage.local.get([this.STORAGE_KEY, this.PREDICTIONS_KEY]);
        if (!data[this.STORAGE_KEY]) {
            await chrome.storage.local.set({
                [this.STORAGE_KEY]: {
                    total: 0,
                    correct: 0,
                    incorrect: 0,
                    bigPredictions: 0,
                    bigCorrect: 0,
                    smallPredictions: 0,
                    smallCorrect: 0,
                    lowConfidence: 0,
                    lowConfidenceCorrect: 0,
                    mediumConfidence: 0,
                    mediumConfidenceCorrect: 0,
                    highConfidence: 0,
                    highConfidenceCorrect: 0
                }
            });
        }
        if (!data[this.PREDICTIONS_KEY]) {
            await chrome.storage.local.set({
                [this.PREDICTIONS_KEY]: []
            });
        }
    },
    
    /**
     * Record a prediction
     * @param {Object} prediction - Prediction object from PredictionEngine
     * @param {string} periodId - Period ID being predicted
     */
    async recordPrediction(prediction, periodId) {
        try {
            const data = await chrome.storage.local.get(this.PREDICTIONS_KEY);
            const predictions = data[this.PREDICTIONS_KEY] || [];
            
            // Check for duplicate period ID
            const existing = predictions.find(p => p.periodId === periodId);
            if (existing) {
                console.log('[LogicPilot AI Prediction] Prediction already recorded for period:', periodId);
                return false;
            }
            
            const record = {
                periodId: String(periodId),
                prediction: prediction.prediction,
                bigProbability: prediction.bigProbability,
                smallProbability: prediction.smallProbability,
                confidence: prediction.confidence,
                timestamp: prediction.timestamp,
                evaluated: false,
                actualOutcome: null,
                correct: null
            };
            
            predictions.push(record);
            await chrome.storage.local.set({
                [this.PREDICTIONS_KEY]: predictions
            });
            
            console.log('[LogicPilot AI Prediction] Prediction recorded:', record);
            return true;
            
        } catch (error) {
            console.error('[LogicPilot AI Prediction] Error recording prediction:', error);
            return false;
        }
    },
    
    /**
     * Evaluate a prediction against actual outcome
     * @param {string} periodId - Period ID to evaluate
     * @param {string} actualOutcome - Actual outcome ("BIG" or "SMALL")
     */
    async evaluatePrediction(periodId, actualOutcome) {
        try {
            // Validate outcome
            if (actualOutcome !== 'BIG' && actualOutcome !== 'SMALL') {
                console.warn('[LogicPilot AI Prediction] Invalid actual outcome:', actualOutcome);
                return false;
            }
            
            const normalizedOutcome = actualOutcome.toUpperCase();
            
            const data = await chrome.storage.local.get([this.PREDICTIONS_KEY, this.STORAGE_KEY]);
            const predictions = data[this.PREDICTIONS_KEY] || [];
            const accuracy = data[this.STORAGE_KEY] || this.getDefaultAccuracy();
            
            // Find the prediction
            const predictionIndex = predictions.findIndex(p => p.periodId === periodId && !p.evaluated);
            
            if (predictionIndex === -1) {
                console.log('[LogicPilot AI Prediction] No unevaluated prediction found for period:', periodId);
                return false;
            }
            
            const prediction = predictions[predictionIndex];
            
            // Check if already evaluated
            if (prediction.evaluated) {
                console.log('[LogicPilot AI Prediction] Prediction already evaluated for period:', periodId);
                return false;
            }
            
            // Evaluate
            const correct = prediction.prediction === normalizedOutcome;
            
            // Update prediction record
            predictions[predictionIndex].evaluated = true;
            predictions[predictionIndex].actualOutcome = normalizedOutcome;
            predictions[predictionIndex].correct = correct;
            
            // Update accuracy stats
            accuracy.total++;
            if (correct) {
                accuracy.correct++;
            } else {
                accuracy.incorrect++;
            }
            
            // Update prediction-specific stats
            if (prediction.prediction === 'BIG') {
                accuracy.bigPredictions++;
                if (correct) accuracy.bigCorrect++;
            } else if (prediction.prediction === 'SMALL') {
                accuracy.smallPredictions++;
                if (correct) accuracy.smallCorrect++;
            }
            
            // Update confidence-specific stats
            if (prediction.confidence === 'LOW') {
                accuracy.lowConfidence++;
                if (correct) accuracy.lowConfidenceCorrect++;
            } else if (prediction.confidence === 'MEDIUM') {
                accuracy.mediumConfidence++;
                if (correct) accuracy.mediumConfidenceCorrect++;
            } else if (prediction.confidence === 'HIGH') {
                accuracy.highConfidence++;
                if (correct) accuracy.highConfidenceCorrect++;
            }
            
            // Save updates
            await chrome.storage.local.set({
                [this.PREDICTIONS_KEY]: predictions,
                [this.STORAGE_KEY]: accuracy
            });
            
            console.log('[LogicPilot AI Prediction] Prediction evaluated:', {
                periodId,
                prediction: prediction.prediction,
                actual: normalizedOutcome,
                correct
            });
            
            return true;
            
        } catch (error) {
            console.error('[LogicPilot AI Prediction] Error evaluating prediction:', error);
            return false;
        }
    },
    
    /**
     * Get current accuracy statistics
     */
    async getAccuracyStats() {
        const data = await chrome.storage.local.get(this.STORAGE_KEY);
        const accuracy = data[this.STORAGE_KEY] || this.getDefaultAccuracy();
        
        const overallAccuracy = accuracy.total > 0 
            ? (accuracy.correct / accuracy.total * 100).toFixed(1) 
            : 0;
        
        const bigAccuracy = accuracy.bigPredictions > 0 
            ? (accuracy.bigCorrect / accuracy.bigPredictions * 100).toFixed(1) 
            : 0;
        
        const smallAccuracy = accuracy.smallPredictions > 0 
            ? (accuracy.smallCorrect / accuracy.smallPredictions * 100).toFixed(1) 
            : 0;
        
        const lowConfAccuracy = accuracy.lowConfidence > 0 
            ? (accuracy.lowConfidenceCorrect / accuracy.lowConfidence * 100).toFixed(1) 
            : 0;
        
        const mediumConfAccuracy = accuracy.mediumConfidence > 0 
            ? (accuracy.mediumConfidenceCorrect / accuracy.mediumConfidence * 100).toFixed(1) 
            : 0;
        
        const highConfAccuracy = accuracy.highConfidence > 0 
            ? (accuracy.highConfidenceCorrect / accuracy.highConfidence * 100).toFixed(1) 
            : 0;
        
        return {
            total: accuracy.total,
            correct: accuracy.correct,
            incorrect: accuracy.incorrect,
            overallAccuracy: parseFloat(overallAccuracy),
            bigPredictions: accuracy.bigPredictions,
            bigCorrect: accuracy.bigCorrect,
            bigAccuracy: parseFloat(bigAccuracy),
            smallPredictions: accuracy.smallPredictions,
            smallCorrect: accuracy.smallCorrect,
            smallAccuracy: parseFloat(smallAccuracy),
            lowConfidence: accuracy.lowConfidence,
            lowConfidenceCorrect: accuracy.lowConfidenceCorrect,
            lowConfidenceAccuracy: parseFloat(lowConfAccuracy),
            mediumConfidence: accuracy.mediumConfidence,
            mediumConfidenceCorrect: accuracy.mediumConfidenceCorrect,
            mediumConfidenceAccuracy: parseFloat(mediumConfAccuracy),
            highConfidence: accuracy.highConfidence,
            highConfidenceCorrect: accuracy.highConfidenceCorrect,
            highConfidenceAccuracy: parseFloat(highConfAccuracy)
        };
    },
    
    /**
     * Get default accuracy structure
     */
    getDefaultAccuracy() {
        return {
            total: 0,
            correct: 0,
            incorrect: 0,
            bigPredictions: 0,
            bigCorrect: 0,
            smallPredictions: 0,
            smallCorrect: 0,
            lowConfidence: 0,
            lowConfidenceCorrect: 0,
            mediumConfidence: 0,
            mediumConfidenceCorrect: 0,
            highConfidence: 0,
            highConfidenceCorrect: 0
        };
    },
    
    /**
     * Reset all accuracy data
     */
    async resetAccuracy() {
        await chrome.storage.local.set({
            [this.STORAGE_KEY]: this.getDefaultAccuracy(),
            [this.PREDICTIONS_KEY]: []
        });
        console.log('[LogicPilot AI Prediction] Accuracy data reset');
    },
    
    /**
     * Get pending predictions (not yet evaluated)
     */
    async getPendingPredictions() {
        const data = await chrome.storage.local.get(this.PREDICTIONS_KEY);
        const predictions = data[this.PREDICTIONS_KEY] || [];
        return predictions.filter(p => !p.evaluated);
    }
};

// Export for use in other modules
export { AccuracyTracker };
