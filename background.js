import { restoreSession } from "./auth.js";
import { pollAndExecuteCommands } from "./command.js";
import { heartbeat } from "./heartbeat.js";

// Import AI prediction modules
import { HistoryCollector } from "./ai/historyCollector.js";
import { AccuracyTracker } from "./ai/accuracyTracker.js";
import { FeatureEngine } from "./ai/featureEngine.js";
import { PredictionEngine } from "./ai/predictionEngine.js";

// Prediction state storage
const PREDICTION_STORAGE_KEY = 'logicpilot_current_prediction';

const BLACKFOX_POLL_ALARM = "blackfox-license-poll";
const POLL_PERIOD_MINUTES = 0.5;

async function runBlackFoxPoll() {
    const session = await restoreSession();

    if (!session.authenticated) {
        return;
    }

    await heartbeat({
        metadata: {
            source: "service_worker"
        }
    });

    await pollAndExecuteCommands();
}

chrome.runtime.onInstalled.addListener(() => {
    chrome.alarms.create(BLACKFOX_POLL_ALARM, {
        periodInMinutes: POLL_PERIOD_MINUTES
    });

    runBlackFoxPoll().catch((error) => {
        console.error("[BlackFox] Initial poll failed:", error);
    });
});

chrome.runtime.onStartup.addListener(() => {
    chrome.alarms.create(BLACKFOX_POLL_ALARM, {
        periodInMinutes: POLL_PERIOD_MINUTES
    });
});

chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name !== BLACKFOX_POLL_ALARM) {
        return;
    }

    runBlackFoxPoll().catch((error) => {
        console.error("[BlackFox] Poll failed:", error);
    });
});

// Initialize AI prediction system in background
(async () => {
    try {
        await HistoryCollector.init();
        await AccuracyTracker.init();
        console.log('[LogicPilot AI Prediction] Background service worker initialized');
    } catch (error) {
        console.error('[LogicPilot AI Prediction] Background initialization failed:', error);
    }
})();

// Handle messages from content script for prediction system
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "BACKFILL_HISTORY" && message.outcomes) {
        console.log('[LogicPilot AI Prediction] Background received history backfill:', message.outcomes.length);
        
        (async () => {
            try {
                let storedCount = 0;
                for (const outcome of message.outcomes) {
                    const success = await HistoryCollector.addOutcome(outcome.periodId, outcome.outcome);
                    if (success) storedCount++;
                }
                console.log('[LogicPilot AI Prediction] History backfill stored:', storedCount, '/', message.outcomes.length);
            } catch (error) {
                console.error('[LogicPilot AI Prediction] Error storing history backfill:', error);
            }
        })();
    }
    
    if (message.action === "RECORD_OUTCOME" && message.periodId && message.outcome) {
        console.log('[LogicPilot AI Prediction] Background received outcome:', message.periodId, message.outcome);
        
        (async () => {
            try {
                const success = await HistoryCollector.addOutcome(message.periodId, message.outcome);
                if (success) {
                    console.log('[LogicPilot AI Prediction] Completed period:', message.periodId);
                    console.log('[LogicPilot AI Prediction] Actual outcome:', message.outcome);
                    console.log('[LogicPilot AI Prediction] New unique history record stored');
                    
                    // Evaluate previous prediction for this period
                    const evaluationResult = await AccuracyTracker.evaluatePrediction(message.periodId, message.outcome);
                    console.log('[LogicPilot AI Prediction] Previous prediction evaluation:', evaluationResult ? 'CORRECT' : 'INCORRECT/NONE');
                    
                    // Get current history count
                    const historyCount = await HistoryCollector.getCount();
                    console.log('[LogicPilot AI Prediction] Stored history count:', historyCount);
                    
                    // Generate new prediction for next round
                    await generateNextPrediction(message.periodId);
                } else {
                    console.log('[LogicPilot AI Prediction] Duplicate period, skipping:', message.periodId);
                }
            } catch (error) {
                console.error('[LogicPilot AI Prediction] Error recording outcome:', error);
            }
        })();
    }
    
    if (message.action === "GENERATE_INITIAL_PREDICTION" && message.currentPeriodId) {
        console.log('[LogicPilot AI Prediction] Background received initial prediction request for:', message.currentPeriodId);
        
        (async () => {
            try {
                await generateNextPrediction(message.currentPeriodId);
            } catch (error) {
                console.error('[LogicPilot AI Prediction] Error generating initial prediction:', error);
            }
        })();
    }
});

async function generateNextPrediction(completedPeriodId) {
    try {
        const latestOutcomes = await HistoryCollector.getLatestOutcomes(100);
        
        if (latestOutcomes.length < 10) {
            console.log('[LogicPilot AI Prediction] Insufficient history for prediction:', latestOutcomes.length, '/ 10 minimum');
            return;
        }
        
        // Generate features
        const features = FeatureEngine.generateFeatures(latestOutcomes);
        
        // Generate prediction
        const prediction = PredictionEngine.predict(features);
        
        if (prediction.noSignal) {
            console.log('[LogicPilot AI Prediction] No signal generated');
            return;
        }
        
        // Determine next period ID (increment from completed period)
        const nextPeriodId = incrementPeriodId(completedPeriodId);
        
        console.log('[LogicPilot AI Prediction] Predicting next period:', nextPeriodId);
        console.log('[LogicPilot AI Prediction] BIG:', prediction.bigProbability + '%');
        console.log('[LogicPilot AI Prediction] SMALL:', prediction.smallProbability + '%');
        console.log('[LogicPilot AI Prediction] Next:', prediction.prediction);
        
        // Record this prediction
        await AccuracyTracker.recordPrediction(prediction, nextPeriodId);
        
        // Store prediction with period association
        const predictionWithPeriod = {
            ...prediction,
            periodId: nextPeriodId,
            historyUsed: latestOutcomes.length,
            timestamp: Date.now()
        };
        
        await chrome.storage.local.set({
            [PREDICTION_STORAGE_KEY]: predictionWithPeriod
        });
        
        // Broadcast to popup
        chrome.runtime.sendMessage({
            action: "PREDICTION_UPDATED",
            prediction: predictionWithPeriod
        }).catch(err => {
            console.log('[LogicPilot AI Prediction] Failed to broadcast prediction:', err);
        });
        
        console.log('[LogicPilot AI Prediction] Prediction broadcast to popup');
        
    } catch (error) {
        console.error('[LogicPilot AI Prediction] Error generating next prediction:', error);
    }
}

function incrementPeriodId(periodId) {
    // Try to parse as number and increment
    const num = parseInt(periodId);
    if (!isNaN(num)) {
        return String(num + 1);
    }
    
    // If not a simple number, return a placeholder
    return 'next-period';
}
