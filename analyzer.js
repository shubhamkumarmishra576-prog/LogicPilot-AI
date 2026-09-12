// LogicPilot AI - Outcome Analyzer
// Real statistical prediction engine for Big/Small outcomes

class OutcomeAnalyzer {
    constructor() {
        this.history = []; // Array of {periodId, outcome, timestamp}
        this.predictions = []; // Array of {periodId, predicted, actual, probability, confidence, timestamp}
        this.modelWeights = {
            frequency: 0.25,
            transition: 0.20,
            pattern: 0.20,
            streak: 0.15,
            momentum: 0.20
        };
        this.minSamplesForPrediction = 100;
        this.minPatternMatches = 20;
        this.debugMode = false;
    }

    // ============================================================
    // DATA MANAGEMENT
    // ============================================================

    addOutcome(periodId, outcome, timestamp = Date.now()) {
        // Prevent duplicates
        if (this.history.some(h => h.periodId === periodId)) {
            console.log('[ANALYZER] Duplicate outcome ignored:', periodId);
            return false;
        }

        this.history.push({
            periodId,
            outcome: outcome.toUpperCase(), // Ensure consistent uppercase
            timestamp
        });

        // Keep history manageable (max 5000 entries)
        if (this.history.length > 5000) {
            this.history = this.history.slice(-5000);
        }

        console.log('[ANALYZER] Outcome added:', periodId, outcome, 'Total samples:', this.history.length);
        return true;
    }

    addBackfill(outcomes) {
        let added = 0;
        for (const outcome of outcomes) {
            if (this.addOutcome(outcome.periodId, outcome.outcome, outcome.timestamp)) {
                added++;
            }
        }
        console.log('[ANALYZER] Backfill added:', added, 'outcomes');
        return added;
    }

    getHistory() {
        return this.history.slice();
    }

    getSampleCount() {
        return this.history.length;
    }

    // ============================================================
    // BASIC FREQUENCY ANALYSIS
    // ============================================================

    calculateFrequency(windowSize = null) {
        const data = windowSize ? this.history.slice(-windowSize) : this.history;
        
        if (data.length === 0) {
            return { big: 0, small: 0, bigPercent: 50, smallPercent: 50, sampleSize: 0 };
        }

        const bigCount = data.filter(h => h.outcome === 'BIG').length;
        const smallCount = data.filter(h => h.outcome === 'SMALL').length;
        const total = bigCount + smallCount;

        return {
            big: bigCount,
            small: smallCount,
            bigPercent: total > 0 ? (bigCount / total) * 100 : 50,
            smallPercent: total > 0 ? (smallCount / total) * 100 : 50,
            sampleSize: total
        };
    }

    calculateMultipleWindows() {
        const windows = [10, 25, 50, 100, 250, 500];
        const results = {};
        
        for (const window of windows) {
            if (this.history.length >= window) {
                results[window] = this.calculateFrequency(window);
            }
        }
        
        return results;
    }

    // ============================================================
    // TRANSITION PROBABILITY ANALYSIS
    // ============================================================

    calculateTransitionProbability(windowSize = null) {
        const data = windowSize ? this.history.slice(-windowSize) : this.history;
        
        if (data.length < 2) {
            return {
                bigToBig: 0, bigToSmall: 0,
                smallToBig: 0, smallToSmall: 0,
                pBigGivenBig: 50, pSmallGivenBig: 50,
                pBigGivenSmall: 50, pSmallGivenSmall: 50,
                sampleSize: 0
            };
        }

        let bigToBig = 0, bigToSmall = 0;
        let smallToBig = 0, smallToSmall = 0;

        for (let i = 1; i < data.length; i++) {
            const prev = data[i - 1].outcome;
            const curr = data[i].outcome;

            if (prev === 'BIG' && curr === 'BIG') bigToBig++;
            else if (prev === 'BIG' && curr === 'SMALL') bigToSmall++;
            else if (prev === 'SMALL' && curr === 'BIG') smallToBig++;
            else if (prev === 'SMALL' && curr === 'SMALL') smallToSmall++;
        }

        const afterBig = bigToBig + bigToSmall;
        const afterSmall = smallToBig + smallToSmall;

        return {
            bigToBig, bigToSmall,
            smallToBig, smallToSmall,
            pBigGivenBig: afterBig > 0 ? (bigToBig / afterBig) * 100 : 50,
            pSmallGivenBig: afterBig > 0 ? (bigToSmall / afterBig) * 100 : 50,
            pBigGivenSmall: afterSmall > 0 ? (smallToBig / afterSmall) * 100 : 50,
            pSmallGivenSmall: afterSmall > 0 ? (smallToSmall / afterSmall) * 100 : 50,
            sampleSize: data.length - 1
        };
    }

    // ============================================================
    // STREAK ANALYSIS
    // ============================================================

    calculateStreakStatistics(windowSize = null) {
        const data = windowSize ? this.history.slice(-windowSize) : this.history;
        
        if (data.length === 0) {
            return {};
        }

        const streaks = {};
        let currentStreak = 1;
        let currentOutcome = data[0].outcome;

        for (let i = 1; i < data.length; i++) {
            if (data[i].outcome === currentOutcome) {
                currentStreak++;
            } else {
                // Record streak ending
                const key = `${currentOutcome}_${currentStreak}`;
                if (!streaks[key]) {
                    streaks[key] = { count: 0, nextBig: 0, nextSmall: 0 };
                }
                streaks[key].count++;
                
                // Record what came after
                if (i < data.length) {
                    const nextOutcome = data[i].outcome;
                    if (nextOutcome === 'BIG') streaks[key].nextBig++;
                    else streaks[key].nextSmall++;
                }

                currentStreak = 1;
                currentOutcome = data[i].outcome;
            }
        }

        // Don't forget the last streak
        const key = `${currentOutcome}_${currentStreak}`;
        if (!streaks[key]) {
            streaks[key] = { count: 0, nextBig: 0, nextSmall: 0 };
        }
        streaks[key].count++;

        // Calculate probabilities
        for (const streakKey in streaks) {
            const s = streaks[streakKey];
            const totalNext = s.nextBig + s.nextSmall;
            s.pBigNext = totalNext > 0 ? (s.nextBig / totalNext) * 100 : 50;
            s.pSmallNext = totalNext > 0 ? (s.nextSmall / totalNext) * 100 : 50;
        }

        return streaks;
    }

    getCurrentStreak() {
        if (this.history.length === 0) return { outcome: null, length: 0 };

        let streak = 1;
        const lastOutcome = this.history[this.history.length - 1].outcome;

        for (let i = this.history.length - 2; i >= 0; i--) {
            if (this.history[i].outcome === lastOutcome) {
                streak++;
            } else {
                break;
            }
        }

        return { outcome: lastOutcome, length: streak };
    }

    // ============================================================
    // PATTERN MATCHING ANALYSIS
    // ============================================================

    findPatternMatches(patternLength, minMatches = this.minPatternMatches) {
        if (this.history.length < patternLength + minMatches) {
            return null;
        }

        const recentPattern = this.history.slice(-patternLength).map(h => h.outcome);
        const matches = { big: 0, small: 0 };

        // Search through history (excluding the most recent pattern itself)
        for (let i = 0; i < this.history.length - patternLength - 1; i++) {
            const historicalPattern = this.history.slice(i, i + patternLength).map(h => h.outcome);
            
            // Check if patterns match
            if (this.patternsMatch(recentPattern, historicalPattern)) {
                const nextOutcome = this.history[i + patternLength].outcome;
                if (nextOutcome === 'BIG') matches.big++;
                else matches.small++;
            }
        }

        const totalMatches = matches.big + matches.small;

        if (totalMatches < minMatches) {
            return null;
        }

        return {
            pattern: recentPattern.join(''),
            matches: totalMatches,
            big: matches.big,
            small: matches.small,
            pBig: totalMatches > 0 ? (matches.big / totalMatches) * 100 : 50,
            pSmall: totalMatches > 0 ? (matches.small / totalMatches) * 100 : 50
        };
    }

    patternsMatch(pattern1, pattern2) {
        if (pattern1.length !== pattern2.length) return false;
        for (let i = 0; i < pattern1.length; i++) {
            if (pattern1[i] !== pattern2[i]) return false;
        }
        return true;
    }

    calculateBestPatternSignal() {
        const patternLengths = [2, 3, 4, 5, 6, 8, 10];
        let bestSignal = null;

        for (const length of patternLengths) {
            const signal = this.findPatternMatches(length);
            if (signal && (!bestSignal || signal.matches > bestSignal.matches)) {
                bestSignal = signal;
            }
        }

        return bestSignal;
    }

    // ============================================================
    // RECENT MOMENTUM ANALYSIS
    // ============================================================

    calculateMomentum(shortWindow = 10, longWindow = 100) {
        const shortFreq = this.calculateFrequency(shortWindow);
        const longFreq = this.calculateFrequency(longWindow);

        if (shortFreq.sampleSize === 0 || longFreq.sampleSize === 0) {
            return null;
        }

        const bigDelta = shortFreq.bigPercent - longFreq.bigPercent;
        const smallDelta = shortFreq.smallPercent - longFreq.smallPercent;

        return {
            shortBigPercent: shortFreq.bigPercent,
            longBigPercent: longFreq.bigPercent,
            bigDelta,
            smallDelta,
            momentum: bigDelta > 0 ? 'BIG' : (smallDelta > 0 ? 'SMALL' : 'NEUTRAL'),
            strength: Math.abs(bigDelta)
        };
    }

    // ============================================================
    // WEIGHTED ENSEMBLE PREDICTION
    // ============================================================

    generatePrediction() {
        if (this.history.length < this.minSamplesForPrediction) {
            return {
                prediction: 'INSUFFICIENT_DATA',
                bigProbability: 50,
                smallProbability: 50,
                confidence: 'LOW',
                signals: {},
                sampleSize: this.history.length
            };
        }

        const signals = {};

        // 1. Frequency signal
        const freq = this.calculateFrequency(100);
        signals.frequency = {
            big: freq.bigPercent,
            small: freq.smallPercent,
            weight: this.modelWeights.frequency
        };

        // 2. Transition signal
        const trans = this.calculateTransitionProbability(100);
        const lastOutcome = this.history[this.history.length - 1].outcome;
        const pBigGivenPrev = lastOutcome === 'BIG' ? trans.pBigGivenBig : trans.pBigGivenSmall;
        signals.transition = {
            big: pBigGivenPrev,
            small: 100 - pBigGivenPrev,
            weight: this.modelWeights.transition
        };

        // 3. Pattern signal
        const pattern = this.calculateBestPatternSignal();
        if (pattern) {
            signals.pattern = {
                big: pattern.pBig,
                small: pattern.pSmall,
                weight: this.modelWeights.pattern,
                matches: pattern.matches
            };
        } else {
            signals.pattern = {
                big: 50,
                small: 50,
                weight: 0,
                matches: 0
            };
        }

        // 4. Streak signal
        const currentStreak = this.getCurrentStreak();
        const streakStats = this.calculateStreakStatistics(500);
        const streakKey = `${currentStreak.outcome}_${currentStreak.length}`;
        const streakData = streakStats[streakKey];
        
        if (streakData && streakData.count >= 10) {
            signals.streak = {
                big: streakData.pBigNext,
                small: streakData.pSmallNext,
                weight: this.modelWeights.streak,
                streakLength: currentStreak.length,
                streakOutcome: currentStreak.outcome
            };
        } else {
            signals.streak = {
                big: 50,
                small: 50,
                weight: 0,
                streakLength: currentStreak.length,
                streakOutcome: currentStreak.outcome
            };
        }

        // 5. Momentum signal
        const momentum = this.calculateMomentum();
        if (momentum && momentum.strength > 5) {
            signals.momentum = {
                big: momentum.momentum === 'BIG' ? 50 + momentum.strength : 50 - momentum.strength,
                small: momentum.momentum === 'SMALL' ? 50 + momentum.strength : 50 - momentum.strength,
                weight: this.modelWeights.momentum,
                strength: momentum.strength
            };
        } else {
            signals.momentum = {
                big: 50,
                small: 50,
                weight: 0,
                strength: 0
            };
        }

        // Calculate weighted ensemble
        let totalWeight = 0;
        let weightedBig = 0;
        let weightedSmall = 0;

        for (const signalName in signals) {
            const signal = signals[signalName];
            if (signal.weight > 0) {
                weightedBig += signal.big * signal.weight;
                weightedSmall += signal.small * signal.weight;
                totalWeight += signal.weight;
            }
        }

        const finalBigPercent = totalWeight > 0 ? weightedBig / totalWeight : 50;
        const finalSmallPercent = totalWeight > 0 ? weightedSmall / totalWeight : 50;

        // Determine prediction and confidence
        const prediction = finalBigPercent > finalSmallPercent ? 'BIG' : 'SMALL';
        const probabilityDiff = Math.abs(finalBigPercent - finalSmallPercent);
        const confidence = this.calculateConfidence(probabilityDiff, totalWeight, this.history.length);

        if (this.debugMode) {
            console.log('[ANALYZER] Sample size:', this.history.length);
            console.log('[ANALYZER] Frequency signal:', signals.frequency);
            console.log('[ANALYZER] Transition signal:', signals.transition);
            console.log('[ANALYZER] Pattern signal:', signals.pattern);
            console.log('[ANALYZER] Streak signal:', signals.streak);
            console.log('[ANALYZER] Momentum signal:', signals.momentum);
            console.log('[ANALYZER] Final: BIG', finalBigPercent.toFixed(1) + '%', 'SMALL', finalSmallPercent.toFixed(1) + '%');
            console.log('[ANALYZER] Confidence:', confidence);
        }

        return {
            prediction,
            bigProbability: finalBigPercent,
            smallProbability: finalSmallPercent,
            confidence,
            signals,
            sampleSize: this.history.length
        };
    }

    calculateConfidence(probabilityDiff, totalWeight, sampleSize) {
        // Confidence depends on:
        // 1. Probability difference (higher diff = higher confidence)
        // 2. Sample size (more data = higher confidence)
        // 3. Model agreement (higher total weight = higher confidence)

        const diffScore = Math.min(probabilityDiff / 20, 1); // Max at 20% difference
        const sizeScore = Math.min(sampleSize / 500, 1); // Max at 500 samples
        const weightScore = Math.min(totalWeight, 1); // Max at 1.0 total weight

        const overallScore = (diffScore * 0.4) + (sizeScore * 0.3) + (weightScore * 0.3);

        if (overallScore >= 0.7) return 'HIGH';
        if (overallScore >= 0.4) return 'MEDIUM';
        return 'LOW';
    }

    // ============================================================
    // PREDICTION TRACKING
    // ============================================================

    recordPrediction(periodId, prediction, probability, confidence) {
        this.predictions.push({
            periodId,
            predicted: prediction,
            actual: null,
            bigProbability: probability.bigProbability,
            smallProbability: probability.smallProbability,
            confidence,
            timestamp: Date.now()
        });

        // Keep predictions manageable
        if (this.predictions.length > 1000) {
            this.predictions = this.predictions.slice(-1000);
        }
    }

    updatePredictionWithActual(periodId, actualOutcome) {
        const prediction = this.predictions.find(p => p.periodId === periodId && p.actual === null);
        if (prediction) {
            prediction.actual = actualOutcome.toUpperCase();
            prediction.correct = prediction.predicted === prediction.actual;
            console.log('[ANALYZER] Prediction updated:', periodId, 'Predicted:', prediction.predicted, 'Actual:', prediction.actual, 'Correct:', prediction.correct);
        }
    }

    getPredictionAccuracy() {
        const evaluated = this.predictions.filter(p => p.actual !== null);
        if (evaluated.length === 0) {
            return {
                total: 0,
                correct: 0,
                incorrect: 0,
                accuracy: 0,
                bigPrecision: 0,
                smallPrecision: 0
            };
        }

        const correct = evaluated.filter(p => p.correct).length;
        const incorrect = evaluated.length - correct;

        const bigPredictions = evaluated.filter(p => p.predicted === 'BIG');
        const bigCorrect = bigPredictions.filter(p => p.correct).length;
        const bigPrecision = bigPredictions.length > 0 ? (bigCorrect / bigPredictions.length) * 100 : 0;

        const smallPredictions = evaluated.filter(p => p.predicted === 'SMALL');
        const smallCorrect = smallPredictions.filter(p => p.correct).length;
        const smallPrecision = smallPredictions.length > 0 ? (smallCorrect / smallPredictions.length) * 100 : 0;

        return {
            total: evaluated.length,
            correct,
            incorrect,
            accuracy: (correct / evaluated.length) * 100,
            bigPrecision,
            smallPrecision
        };
    }

    // ============================================================
    // WALK-FORWARD BACKTESTING
    // ============================================================

    runWalkForwardBacktest(minTrainingSize = 100, testSize = null) {
        if (this.history.length < minTrainingSize + 10) {
            console.log('[ANALYZER] Insufficient data for backtesting');
            return null;
        }

        const testHistory = testSize ? this.history.slice(-testSize) : this.history;
        const results = [];
        let correct = 0;
        let incorrect = 0;

        // Walk through history
        for (let i = minTrainingSize; i < testHistory.length; i++) {
            // Use only data BEFORE index i for training
            const trainingData = testHistory.slice(0, i);
            const actualOutcome = testHistory[i].outcome;

            // Create temporary analyzer for this prediction
            const tempAnalyzer = new OutcomeAnalyzer();
            tempAnalyzer.history = trainingData.slice();

            // Generate prediction
            const prediction = tempAnalyzer.generatePrediction();

            if (prediction.prediction !== 'INSUFFICIENT_DATA') {
                const isCorrect = prediction.prediction === actualOutcome;
                if (isCorrect) correct++;
                else incorrect++;

                results.push({
                    index: i,
                    predicted: prediction.prediction,
                    actual: actualOutcome,
                    correct: isCorrect,
                    confidence: prediction.confidence
                });
            }
        }

        const total = correct + incorrect;
        const accuracy = total > 0 ? (correct / total) * 100 : 0;

        // Calculate baseline
        const allOutcomes = testHistory.slice(minTrainingSize);
        const bigCount = allOutcomes.filter(h => h.outcome === 'BIG').length;
        const baselinePrediction = bigCount > (allOutcomes.length / 2) ? 'BIG' : 'SMALL';
        const baselineCorrect = allOutcomes.filter(h => h.outcome === baselinePrediction).length;
        const baselineAccuracy = (baselineCorrect / allOutcomes.length) * 100;

        return {
            totalPredictions: total,
            correct,
            incorrect,
            accuracy,
            baselineAccuracy,
            modelEdge: accuracy - baselineAccuracy,
            results
        };
    }

    // ============================================================
    // DEBUG MODE
    // ============================================================

    setDebugMode(enabled) {
        this.debugMode = enabled;
        console.log('[ANALYZER] Debug mode:', enabled);
    }

    // ============================================================
    // SERIALIZATION
    // ============================================================

    toJSON() {
        return {
            history: this.history,
            predictions: this.predictions,
            modelWeights: this.modelWeights,
            sampleSize: this.history.length
        };
    }

    fromJSON(data) {
        if (data.history) this.history = data.history;
        if (data.predictions) this.predictions = data.predictions;
        if (data.modelWeights) this.modelWeights = data.modelWeights;
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = OutcomeAnalyzer;
}
