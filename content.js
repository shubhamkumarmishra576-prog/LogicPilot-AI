console.log("CONTENT SCRIPT LOADED");
console.log("Current URL:", document.URL);
console.log("Current Host:", location.hostname);
console.log("Is Top Window:", window === window.top);
console.log("Is Inside Iframe:", window !== window.top);
console.log("Frame URL:", document.URL);
console.log("Content Script Instance ID:", globalThis.__logicPilotInstanceId || (globalThis.__logicPilotInstanceId = Math.random().toString(36).substr(2, 9)));

// Local automation state - content script manages its own state
const AutomationState = {
    currentAttempt: 1,
    lastResult: null,
    lastBetTarget: null,
    lastBetAmount: null,
    lastProcessedPeriodId: null,
    lastOutcomeProcessedPeriodId: null, // Track last period where outcome was processed for attempt transition
    timerAutomationEnabled: false,
    activeLogicId: 1,
    currentLogicPosition: 0,
    executionOrder: [],
    attemptByLogicId: {},
    logicStartTime: null,
    logicWinCount: 0,
    logicLossCount: 0,
    randomBetPeriodId: null,
    randomBetTargetSecond: null,
    previousRandomBetTargetSecond: null,
    sessionId: null, // Unique session identifier to prevent old session events from affecting new sessions
    baselinePeriodId: null, // Baseline period captured on START to avoid processing old DOM results
    processedPeriodsBySession: new Map() // Session-scoped processed periods tracking: sessionId -> Set of periodIds
};

const SESSION_STATE_KEY = "logicpilot.coordination.sessionState";

const SessionState = {
    status: "idle",
    totalAttempts: 0,
    startAttempt: 1,
    sessionTotal: 0,
    completedAttempts: 0,
    processedCompletions: []
};

// Session ID management
function generateSessionId() {
    // Generate unique session ID like "LP-82K4-91X"
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const segment1 = Array.from({length: 2}, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    const segment2 = Array.from({length: 4}, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    const segment3 = Array.from({length: 3}, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    return `${segment1}-${segment2}-${segment3}`;
}

function startNewSession(baselinePeriodId = null) {
    const newSessionId = generateSessionId();
    AutomationState.sessionId = newSessionId;
    AutomationState.baselinePeriodId = baselinePeriodId;
    AutomationState.processedPeriodsBySession.set(newSessionId, new Set());
    
    console.log("[ATTEMPT] START");
    console.log("[ATTEMPT] New sessionId: " + newSessionId);
    console.log("[ATTEMPT] currentAttempt reset to A1");
    console.log("[ATTEMPT] Baseline period: " + (baselinePeriodId || "none"));
    
    return newSessionId;
}

function clearSession() {
    const oldSessionId = AutomationState.sessionId;
    console.log("[SESSION] STOP sessionId=" + oldSessionId + " attemptAtStop=" + AutomationState.currentAttempt);
    
    // Clear session-specific data
    AutomationState.sessionId = null;
    AutomationState.baselinePeriodId = null;
    
    // Clear processed periods for the old session
    if (oldSessionId) {
        AutomationState.processedPeriodsBySession.delete(oldSessionId);
    }
}

function getLogicIds(logicData = {}) {
    return Object.keys(logicData)
        .map(Number)
        .filter(Number.isInteger)
        .sort((a, b) => a - b);
}

function normalizeExecutionOrder(executionOrder, logicData = {}) {
    const availableIds = new Set(getLogicIds(logicData));
    const normalized = [];

    if (Array.isArray(executionOrder)) {
        for (const logicId of executionOrder.map(Number)) {
            if (availableIds.has(logicId) && !normalized.includes(logicId)) {
                normalized.push(logicId);
            }
        }
    }

    for (const logicId of availableIds) {
        if (!normalized.includes(logicId)) {
            normalized.push(logicId);
        }
    }

    return normalized;
}

function setActiveLogicAttempt(logicId, attempt) {
    const normalizedLogicId = Number(logicId);
    const normalizedAttempt = Math.max(1, Number(attempt) || 1);

    AutomationState.activeLogicId = normalizedLogicId;
    AutomationState.attemptByLogicId[normalizedLogicId] = normalizedAttempt;
    AutomationState.currentAttempt = normalizedAttempt;
}

function startExecutionOrderSession(logicData, executionOrder, currentLogicPosition = 0, startAttempt = 1) {
    const order = normalizeExecutionOrder(executionOrder, logicData);
    const position = Math.max(0, Number(currentLogicPosition) || 0);
    const boundedPosition = Math.min(position, Math.max(0, order.length - 1));
    const activeLogicId = order[boundedPosition] || Number(Object.keys(logicData || {})[0]) || 1;

    AutomationState.executionOrder = order;
    AutomationState.currentLogicPosition = boundedPosition;
    AutomationState.attemptByLogicId = {};

    for (const logicId of order) {
        AutomationState.attemptByLogicId[logicId] = 1;
    }

    setActiveLogicAttempt(activeLogicId, startAttempt);
}

function advanceToNextLogic(logicData) {
    const order = normalizeExecutionOrder(AutomationState.executionOrder, logicData);
    const currentPosition = order.indexOf(Number(AutomationState.activeLogicId));
    const nextPosition = (currentPosition >= 0 ? currentPosition : AutomationState.currentLogicPosition) + 1;

    if (nextPosition >= order.length) {
        return false;
    }

    const nextLogicId = order[nextPosition];
    AutomationState.executionOrder = order;
    AutomationState.currentLogicPosition = nextPosition;
    setActiveLogicAttempt(nextLogicId, AutomationState.attemptByLogicId[nextLogicId] || 1);
    AutomationState.logicWinCount = 0;
    AutomationState.logicLossCount = 0;
    AutomationState.lastBetTarget = null;
    AutomationState.lastBetAmount = null;
    return true;
}

function getSessionSnapshot() {
    return {
        status: SessionState.status,
        currentAttempt: AutomationState.currentAttempt,
        activeLogicId: AutomationState.activeLogicId,
        currentLogicPosition: AutomationState.currentLogicPosition,
        executionOrder: [...AutomationState.executionOrder],
        totalAttempts: SessionState.totalAttempts,
        startAttempt: SessionState.startAttempt,
        sessionTotal: SessionState.sessionTotal,
        completedAttempts: SessionState.completedAttempts,
        processedCompletions: [...SessionState.processedCompletions]
    };
}

function publishSessionState() {
    const snapshot = getSessionSnapshot();

    try {
        if (chrome.storage?.local) {
            chrome.storage.local.set({ [SESSION_STATE_KEY]: snapshot });
        }
    } catch (error) {
        console.warn("[Session] Failed to persist session state:", error.message);
    }

    try {
        if (chrome.runtime?.id) {
            chrome.runtime.sendMessage({
                action: "SESSION_STATE_UPDATE",
                session: snapshot
            }).catch(() => {});
        }
    } catch (error) {
        console.warn("[Session] Failed to broadcast session state:", error.message);
    }
}

function initializeSessionState(totalAttempts, startAttempt = 1) {
    const normalizedStart = Math.max(1, Number(startAttempt) || 1);
    const normalizedTotal = Math.max(0, Number(totalAttempts) || 0);

    SessionState.status = "running";
    SessionState.totalAttempts = normalizedTotal;
    SessionState.startAttempt = normalizedStart;
    SessionState.sessionTotal = 0;
    SessionState.completedAttempts = 0;
    SessionState.processedCompletions = [];
    AutomationState.currentAttempt = normalizedStart;

    publishSessionState();
}

function resetSessionState(totalAttempts, startAttempt = 1) {
    initializeSessionState(totalAttempts, startAttempt);
    SessionState.status = "idle";
    publishSessionState();
}

function resetAttemptToZero(activeLogicId = null) {
    const previousAttempt = AutomationState.currentAttempt;
    console.log("[LP RESET] runtime previous attempt:", previousAttempt);

    if (activeLogicId !== null && activeLogicId !== undefined) {
        AutomationState.activeLogicId = activeLogicId;
    }

    AutomationState.currentAttempt = 0;
    AutomationState.attemptByLogicId[AutomationState.activeLogicId] = 0;
    console.log("[LP RESET] runtime attempt:", AutomationState.currentAttempt);

    publishAutomationRuntimeState();
    publishSessionState();
}

function stopSessionAutomation(status = "completed") {
    SessionState.status = status;
    AutomationState.timerAutomationEnabled = false;
    globalThis.__timerAutomationActive = false;

    if (globalThis.__timerObserver) {
        globalThis.__timerObserver.disconnect();
        globalThis.__timerObserver = null;
    }

    publishSessionState();

    try {
        if (chrome.runtime?.id) {
            chrome.runtime.sendMessage({
                action: "SESSION_COMPLETED",
                session: getSessionSnapshot()
            }).catch(() => {});
        }
    } catch (error) {
        console.warn("[Session] Failed to notify session completion:", error.message);
    }
}

function recordSessionCompletion(executedAttempt, amount, periodId, totalAttempts) {
    const completionKey = `${executedAttempt}:${periodId || "unknown"}`;

    if (SessionState.processedCompletions.includes(completionKey)) {
        console.log("[Session] Duplicate completion ignored:", completionKey);
        return false;
    }

    SessionState.processedCompletions.push(completionKey);
    SessionState.completedAttempts += 1;
    SessionState.sessionTotal += Number(amount) || 0;

    console.log(
        "[Session] Attempt",
        executedAttempt,
        "completed. Added",
        amount,
        "Session total:",
        SessionState.sessionTotal
    );

    publishSessionState();
    return false;
}

function publishAutomationRuntimeState() {
    try {
        if (!chrome.runtime || !chrome.runtime.id) {
            console.warn("[STEP] chrome.runtime unavailable - skipping state publish");
            return;
        }

            const runtimeState = {
                activeLogicId: AutomationState.activeLogicId,
                currentAttempt: AutomationState.currentAttempt,
                currentLogicPosition: AutomationState.currentLogicPosition,
                executionOrder: [...AutomationState.executionOrder],
                timerAutomationEnabled: AutomationState.timerAutomationEnabled,
                logicStartTime: AutomationState.logicStartTime,
                updatedAt: Date.now()
            };

        chrome.storage.local.get(["logicpilot.popup.state"], (data) => {
            try {
                const popupState = data["logicpilot.popup.state"] || {};

                chrome.storage.local.set({
                    "logicpilot.popup.state": {
                        ...popupState,
                        activeLogicId: AutomationState.activeLogicId,
                        currentAttempt: String(AutomationState.currentAttempt),
                        runtimeState
                    },
                    activeLogicId: AutomationState.activeLogicId,
                    currentAttempt: String(AutomationState.currentAttempt)
                });
            } catch (e) {
                console.warn("[STEP] Failed to publish runtime state:", e.message);
                // Continue automation even if state publish fails
            }
        });
    } catch (e) {
        console.warn("[STEP] Failed to publish automation state:", e.message);
        // Continue automation even if state publish fails
    }
}

// Prediction system state
const PredictionState = {
    lastCollectedPeriodId: null,
    previousPeriodId: null,
    outcomeCollectionEnabled: true
};

const BET_TIMING_MIN_SECOND = 12;
const BET_TIMING_MAX_SECOND = 28;

const DefaultSelectors = {
    timer: [".TimeLeft__C"],
    timerDigits: ["div"],
    periodId: [".TimeLeft__C-id"],
    history: [".record-body", ".history"],
    resultRow: [".van-row"],
    resultValue: [".van-col.van-col--5 span"],
    periodIdInRow: [
        ".van-col.van-col--7 span",
        ".van-col.van-col--12 span",
        ".van-col:first-child span"
    ],
    bigButton: [".Betting__C-foot-b"],
    smallButton: [".Betting__C-foot-s"],
    amountInput: ['input[type="number"]'],
    amountButton: [".default"],
    submitButton: ["button.bet-amount"]
};

if (!globalThis.__logicPilotRouteWatcherRegistered) {
    globalThis.__logicPilotRouteWatcherRegistered = true;

    window.addEventListener("hashchange", () => {
        console.log("LOGICPILOT ROUTE CHANGED:", document.URL);
    });
}

// Listen for messages from wrapper to iframe
if (!globalThis.__logicPilotIframeMessageListenerRegistered) {
    globalThis.__logicPilotIframeMessageListenerRegistered = true;
    
    window.addEventListener("message", (event) => {
        // Only accept messages from same origin or wrapper
        if (event.data && event.data.source === "logicpilot-wrapper") {
            console.log("[Iframe] Received message from wrapper:", event.data.action);
            
            // Handle automation start command from wrapper
            if (event.data.action === "START_TIMER_AUTOMATION_IFRAME") {
                console.log("=== MESSAGE RECEIVED: START_TIMER_AUTOMATION_IFRAME ===");
                console.log("[MESSAGE DEBUG] Source:", event.data.source);
                console.log("[MESSAGE DEBUG] Current URL:", document.URL);
                console.log("[MESSAGE DEBUG] Current Host:", location.hostname);
                console.log("[MESSAGE DEBUG] window === window.top:", window === window.top);
                console.log("[MESSAGE DEBUG] window.frameElement:", window.frameElement);
                console.log("[MESSAGE DEBUG] document.URL:", document.URL);
                console.log("[MESSAGE DEBUG] document.title:", document.title);
                console.log("[MESSAGE DEBUG] isWrapperPage():", isWrapperPage());
                console.log("[MESSAGE DEBUG] Content script instance ID:", globalThis.__logicPilotInstanceId);
                console.log("=== MESSAGE DEBUG END ===");
                
                console.log("[Iframe] Received START command from wrapper - following Daman execution path");
                
                // Disconnect existing observer if present (prevent memory leak)
                console.log("[Iframe] Entering: Disconnect existing observer");
                if(globalThis.__timerObserver){
                    console.log("[Automation] Disconnecting existing observer before creating new one");
                    globalThis.__timerObserver.disconnect();
                    globalThis.__timerObserver = null;
                }
                console.log("[Iframe] Leaving: Disconnect existing observer");

                if(!globalThis.__timerAutomationActive){
                    console.log("[Iframe] Entering: Set automation state");
                    console.log("[Iframe] Current context - URL:", document.URL);
                    console.log("[Iframe] Current context - Host:", location.hostname);
                    console.log("[Iframe] Current context - Is Top:", window === window.top);
                    
                    globalThis.__timerAutomationActive = true;
                    AutomationState.timerAutomationEnabled = true;

                    const logicData = event.data.logicData;
                    const activeLogicId = event.data.activeLogicId;
                    const totalAttempts = event.data.totalAttempts;
                    const customStartingAttempt = event.data.customStartingAttempt || null;
                    const executionOrder = event.data.executionOrder;
                    const currentLogicPosition = event.data.currentLogicPosition || 0;

                    AutomationState.logicWinCount = 0;
                    AutomationState.logicLossCount = 0;
                    AutomationState.logicStartTime = Date.now();
                    
                    // CRITICAL FIX: Capture baseline period to avoid processing old DOM results
                    const baselinePeriodId = getCurrentPeriodId();
                    
                    // CRITICAL FIX: START MUST ALWAYS BEGIN FROM ATTEMPT 1
                    // Generate new session ID to invalidate old session events
                    startNewSession(baselinePeriodId);
                    
                    const startAttempt = customStartingAttempt && customStartingAttempt > 0
                        ? customStartingAttempt
                        : 1;
                    if (customStartingAttempt && customStartingAttempt > 0) {
                        console.log("[Iframe] Using custom starting attempt:", customStartingAttempt);
                    } else {
                        console.log("[SESSION] NEW sessionId=" + AutomationState.sessionId + " RESET to A1");
                    }
                    startExecutionOrderSession(logicData, executionOrder, currentLogicPosition, startAttempt);

                    initializeSessionState(totalAttempts, AutomationState.currentAttempt);
                    
                    console.log("[Iframe] Entering: Publish runtime state");
                    publishAutomationRuntimeState();
                    console.log("[Iframe] Leaving: Publish runtime state");
                    console.log("[Iframe] Leaving: Set automation state");

                    const activeLogic = logicData[AutomationState.activeLogicId];
                    const strategyData = activeLogic ? activeLogic.attempts : {};

                    console.log("[Automation] Starting with Logic:", AutomationState.activeLogicId);
                    console.log("[Automation] Strategy data:", strategyData);

                    console.log("[Iframe] Entering: Initialize timer monitoring");
                    console.log("[Iframe] Context before initializeTimerMonitoring:");
                    console.log("[Iframe] - URL:", document.URL);
                    console.log("[Iframe] - Host:", location.hostname);
                    console.log("[Iframe] - Is Top:", window === window.top);
                    console.log("[Iframe] - FrameElement:", window.frameElement);
                    console.log("[Iframe] - isWrapperPage():", isWrapperPage());
                    
                    globalThis.__timerObserver = initializeTimerMonitoring(strategyData, totalAttempts, logicData);
                    
                    console.log("[Iframe] Leaving: Initialize timer monitoring");
                    console.log("[Iframe] Timer observer created:", !!globalThis.__timerObserver);
                    
                    if (globalThis.__timerObserver) {
                        console.log("[Timer] Timer monitoring started successfully");
                    } else {
                        console.error("[Timer] Timer monitoring FAILED to start");
                        globalThis.__timerAutomationActive = false;
                        AutomationState.timerAutomationEnabled = false;
                    }
                } else {
                    console.log("[Automation] Timer automation already running");
                }
            }
            
            // Handle stop automation command from wrapper
            if (event.data.action === "STOP_TIMER_AUTOMATION_IFRAME") {
                console.log("[Iframe] Received STOP command from wrapper");
                
                console.log("[Iframe] Entering: Disconnect observer");
                if(globalThis.__timerObserver){
                    globalThis.__timerObserver.disconnect();
                    globalThis.__timerObserver = null;
                }
                console.log("[Iframe] Leaving: Disconnect observer");

                globalThis.__timerAutomationActive = false;
                AutomationState.timerAutomationEnabled = false;
                SessionState.status = "stopped";
                
                // CRITICAL FIX: Clear session to invalidate old session events
                clearSession();
                
                // Clear all pending transition state
                AutomationState.lastOutcomeProcessedPeriodId = null;
                AutomationState.lastProcessedPeriodId = null;
                SessionState.processedCompletions = [];
                
                publishSessionState();
                
                console.log("[Iframe] Entering: Publish runtime state");
                publishAutomationRuntimeState();
                console.log("[Iframe] Leaving: Publish runtime state");

                console.log("[Automation] Timer automation stopped");
            }
            
            // Handle bet placement command from wrapper
            if (event.data.action === "PLACE_BET_IFRAME") {
                console.log("[Iframe] Placing bet from wrapper command");
                
                const choice = event.data.choice;
                const amount = event.data.amount;

                executeBet(choice, amount).then(result => {
                    console.log("[Iframe] Bet placed:", result);
                }).catch(err => {
                    console.error("[Iframe] Failed to place bet:", err);
                });
            }

            if (event.data.action === "RESET_ATTEMPT_TO_ZERO_IFRAME") {
                resetAttemptToZero(event.data.activeLogicId);
            }
            
            // Handle quick shift command
            if (event.data.action === "QUICK_SHIFT_ATTEMPT") {
                console.log("[Quick Shift] Received quick shift command");
                const targetAttempt = event.data.targetAttempt;
                const newActiveLogicId = event.data.activeLogicId;
                
                if (targetAttempt && targetAttempt > 0) {
                    console.log("[Quick Shift] Shifting to attempt:", targetAttempt);
                    setActiveLogicAttempt(newActiveLogicId || AutomationState.activeLogicId, targetAttempt);
                    
                    console.log("[Quick Shift] State updated - currentAttempt:", AutomationState.currentAttempt, "activeLogicId:", AutomationState.activeLogicId);
                    
                    // Publish updated state
                    publishAutomationRuntimeState();
                    publishSessionState();
                    
                    console.log("[Quick Shift] Quick shift completed successfully");
                } else {
                    console.error("[Quick Shift] Invalid target attempt:", targetAttempt);
                }
            }
        }
    });
}

// If running in iframe, check if we should wait for wrapper commands
if (window !== window.top) {
    console.log("[Iframe] Running inside iframe");
}

if (!globalThis.__logicPilotMessageListenerRegistered) {

    globalThis.__logicPilotMessageListenerRegistered = true;

    function getSiteConfig() {
        // Removed hostname-based site detection - now selector-driven
        return null;
    }

    function isWrapperPage() {
        const hostname = location.hostname;
        
        console.log("[WRAPPER DEBUG] isWrapperPage() called");
        console.log("[WRAPPER DEBUG] Current hostname:", hostname);
        console.log("[WRAPPER DEBUG] window === window.top:", window === window.top);
        console.log("[WRAPPER DEBUG] window.frameElement:", window.frameElement);
        
        // CRITICAL: Only return true if we are the TOP window with a wrapper hostname
        // If we are inside an iframe (window !== window.top), we are NOT a wrapper
        if (window !== window.top) {
            console.log("[WRAPPER DEBUG] Inside iframe - returning false (not a wrapper)");
            return false;
        }
        
        // Check if this is a known wrapper page (ONLY if top window)
        if (hostname === "bdggame.typingmaster.in") {
            console.log("[Wrapper Detection] This is a wrapper page (hostname match + top window)");
            console.log("[WRAPPER DEBUG] Returning: true (hostname check)");
            return true;
        }
        
        // Check if page only contains an iframe and no game elements (ONLY if top window)
        const iframe = document.querySelector("iframe");
        const hasGameElements = document.querySelector(".TimeLeft__C") || 
                                document.querySelector(".Betting__C") || 
                                document.querySelector(".record-body") ||
                                document.querySelector(".history");
        
        console.log("[WRAPPER DEBUG] Has iframe:", !!iframe);
        console.log("[WRAPPER DEBUG] Has game elements:", hasGameElements);
        console.log("[WRAPPER DEBUG] Is top window:", window === window.top);
        
        if (iframe && !hasGameElements && window === window.top) {
            console.log("[Wrapper Detection] Page contains iframe but no game elements - likely a wrapper");
            console.log("[WRAPPER DEBUG] Returning: true (iframe wrapper check)");
            return true;
        }
        
        console.log("[WRAPPER DEBUG] Returning: false (not a wrapper)");
        return false;
    }

    function frameDocumentHasGameElements(doc) {
        if (!doc) {
            return false;
        }
        return !!(
            doc.querySelector(".TimeLeft__C") ||
            doc.querySelector(".Betting__C") ||
            doc.querySelector(".record-body") ||
            doc.querySelector(".history")
        );
    }

    function findGameIframe(rootDoc = document) {
        const iframes = rootDoc.querySelectorAll("iframe");
        for (const iframe of iframes) {
            try {
                // Try to access iframe content - this will fail for cross-origin
                const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
                if (iframeDoc && frameDocumentHasGameElements(iframeDoc)) {
                    console.log("[Wrapper] Found game iframe:", iframe.src);
                    return iframe;
                }
                const nested = findGameIframe(iframeDoc);
                if (nested) {
                    return nested;
                }
            } catch (e) {
                // Cross-origin access failed - use fallback detection
                try {
                    // Safely check iframe.src without triggering cross-origin errors
                    const iframeSrc = iframe.getAttribute('src') || '';
                    if (iframeSrc && (iframeSrc.includes("paapaa.org") || iframeSrc.includes("bdg6848"))) {
                        console.log("[Wrapper] Found potential game iframe by src:", iframeSrc);
                        return iframe;
                    }
                } catch (srcError) {
                    // If we can't access iframe attributes due to cross-origin, use fallback
                    console.log("[Wrapper] Cannot access iframe attributes due to cross-origin, using fallback detection");
                    // For BDG, we know the game is likely in the iframe that has game elements
                    // Since we're in the catch block, this iframe likely has game elements
                    return iframe;
                }
            }
        }
        return null;
    }

    function waitForGameIframe(maxWait = 10000, interval = 500) {
        return new Promise((resolve, reject) => {
            const startTime = Date.now();
            
            const checkIframe = () => {
                const iframe = findGameIframe();
                if (iframe) {
                    console.log("[Wrapper] Game iframe found after", Date.now() - startTime, "ms");
                    resolve(iframe);
                    return;
                }
                
                if (Date.now() - startTime > maxWait) {
                    console.error("[Wrapper] Game iframe not found within", maxWait, "ms");
                    reject(new Error("Game iframe not found"));
                    return;
                }
                
                setTimeout(checkIframe, interval);
            };
            
            checkIframe();
        });
    }

    function sendMessageToIframe(iframe, message) {
        try {
            iframe.contentWindow.postMessage(message, "*");
            console.log("[Wrapper] Message sent to iframe:", message.action);
        } catch (e) {
            console.error("[Wrapper] Failed to send message to iframe:", e);
        }
    }

    function getSelectors() {
        return DefaultSelectors;
    }

    function queryFirst(selectorList, root = document) {
        const selectors = Array.isArray(selectorList) ? selectorList : [selectorList];

        for (const selector of selectors) {
            const element = root.querySelector(selector);
            if (element) {
                return element;
            }
        }

        return null;
    }

    function queryAllFirst(selectorList, root = document) {
        const selectors = Array.isArray(selectorList) ? selectorList : [selectorList];

        for (const selector of selectors) {
            const elements = root.querySelectorAll(selector);
            if (elements.length > 0) {
                return elements;
            }
        }

        return [];
    }

    function verifySelectors() {
        // Skip verification on wrapper pages
        if (isWrapperPage()) {
            console.log("[Wrapper] Skipping selector verification on wrapper page");
            return false;
        }
        
        const selectors = getSelectors();
        const hostname = location.hostname;
        
        console.log("=== LOGICPILOT SELECTOR VERIFICATION ===");
        console.log("Current URL:", document.URL);
        console.log("Current Host:", hostname);
        console.log("Is Top Window:", window === window.top);
        console.log("Is Inside Iframe:", window !== window.top);
        console.log("Frame URL:", document.URL);
        console.log("Selector-Driven Initialization");
        console.log("[DOM DEBUG] Document title:", document.title);
        console.log("[DOM DEBUG] Body classes:", document.body?.className);
        console.log("[DOM DEBUG] Total elements:", document.querySelectorAll('*').length);
        console.log("");
        
        const timerElement = queryFirst(selectors.timer);
        const bettingPanelElement = queryFirst(selectors.bigButton) || queryFirst(selectors.smallButton);
        const historyElement = queryFirst(selectors.history);
        
        console.log("Timer Found:", timerElement ? "YES" : "NO");
        console.log("Betting Panel Found:", bettingPanelElement ? "YES" : "NO");
        console.log("History Found:", historyElement ? "YES" : "NO");
        
        if(timerElement) {
            console.log("[DOM DEBUG] Timer element classes:", timerElement.className);
            console.log("[DOM DEBUG] Timer element text:", timerElement.textContent?.substring(0, 50));
        }
        
        if(bettingPanelElement) {
            console.log("[DOM DEBUG] Betting element classes:", bettingPanelElement.className);
        }
        
        console.log("");
        
        const checks = [
            { name: "Timer", selector: selectors.timer, required: true },
            { name: "Period ID", selector: selectors.periodId, required: true },
            { name: "History", selector: selectors.history, required: true },
            { name: "Big Button", selector: selectors.bigButton, required: true },
            { name: "Small Button", selector: selectors.smallButton, required: true },
            { name: "Amount Input", selector: selectors.amountInput, required: false, deferredUntil: "Big/Small selection" },
            { name: "Submit Button", selector: selectors.submitButton, required: false, deferredUntil: "amount panel open" }
        ];
        
        let allPassed = true;
        
        checks.forEach(check => {
            const element = queryFirst(check.selector);
            let status;
            if (element) {
                status = "OK";
            } else if (check.required) {
                status = "MISSING";
                allPassed = false;
            } else {
                status = `DEFERRED (${check.deferredUntil || "betting UI"})`;
            }
            console.log(`${check.name.padEnd(20)} ............ ${status}`);
            if (element) {
                console.log(`  [DOM DEBUG] ${check.name} classes:`, element.className);
                console.log(`  [DOM DEBUG] ${check.name} tag:`, element.tagName);
            }
        });
        
        console.log("");
        console.log("=== VERIFICATION COMPLETE ===");
        console.log("Overall Status:", allPassed ? "PASS" : "FAIL");
        console.log("");
        
        return allPassed;
    }

    // Run selector verification on startup (skip on wrapper)
    setTimeout(() => {
        if (!isWrapperPage()) {
            verifySelectors();
        } else {
            console.log("[Wrapper] Skipping selector verification on wrapper page");
        }
    }, 2000);

    // Periodically check for selectors (selector-driven initialization)
    setInterval(() => {
        if (!isWrapperPage() && !globalThis.__timerAutomationActive) {
            verifySelectors();
        }
    }, 5000);

    // Also run verification on route changes for SPA (skip on wrapper)
    window.addEventListener("hashchange", () => {
        if (!isWrapperPage()) {
            setTimeout(() => {
                verifySelectors();
            }, 1000);
        }
    });

    function getCurrentPeriodId() {
        const periodIdElement = queryFirst(getSelectors().periodId);
        return periodIdElement ? periodIdElement.textContent.trim() : null;
    }

    function getTimerValue(timerElement) {
        const selectors = getSelectors();
        const timerDigitSelector = selectors.timerDigits?.[0];
        const timerDivs = timerDigitSelector ? timerElement.querySelectorAll(timerDigitSelector) : [];
        let timerValue = "";

        timerDivs.forEach(div => {
            timerValue += div.textContent.trim();
        });

        return timerValue || timerElement.textContent.trim();
    }

    function getTimerSecond(timerValue) {
        const digitGroups = String(timerValue).match(/\d+/g);

        if (!digitGroups) {
            return null;
        }

        if (digitGroups.length >= 2) {
            return Number(digitGroups[digitGroups.length - 1]);
        }

        const compactDigits = digitGroups[0];
        return Number(compactDigits.slice(-2));
    }

    function generateRandomBetTargetSecond() {
        const rangeSize = BET_TIMING_MAX_SECOND - BET_TIMING_MIN_SECOND + 1;
        let targetSecond = Math.floor(Math.random() * rangeSize) + BET_TIMING_MIN_SECOND;

        if (rangeSize > 1 && targetSecond === AutomationState.previousRandomBetTargetSecond) {
            targetSecond = targetSecond === BET_TIMING_MAX_SECOND
                ? BET_TIMING_MIN_SECOND
                : targetSecond + 1;
        }

        return targetSecond;
    }

    function ensureRandomBetTargetForPeriod(periodId) {
        if (!periodId) {
            return null;
        }

        if (AutomationState.randomBetPeriodId !== periodId) {
            AutomationState.randomBetPeriodId = periodId;
            AutomationState.randomBetTargetSecond = generateRandomBetTargetSecond();
            AutomationState.previousRandomBetTargetSecond = AutomationState.randomBetTargetSecond;

            console.log(
                "[Timer] Random bet target selected for Period",
                periodId,
                "=",
                AutomationState.randomBetTargetSecond,
                "seconds"
            );
        }

        return AutomationState.randomBetTargetSecond;
    }

    function hasReachedRandomBetTarget(timerSecond, targetSecond) {
        return (
            Number.isFinite(timerSecond) &&
            Number.isFinite(targetSecond) &&
            timerSecond <= targetSecond
        );
    }

    async function waitForElement(selector, maxAttempts = 30, delay = 500) {

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {

            const element = queryFirst(selector);

            console.log(
                `[${selector}] Attempt ${attempt}:`,
                element
            );

            if (element instanceof HTMLElement) {
                return element;
            }

            await new Promise(resolve =>
                setTimeout(resolve, delay)
            );
        }

        return null;
    }

    async function clickBigButton() {
        const selectors = getSelectors();

        console.log(
    "BIG VISIBLE:",
    !!queryFirst(selectors.bigButton)
);

console.log(
    "ALL MATCHES:",
    queryAllFirst(selectors.bigButton).length
);

        console.log(
            "CONTENT URL:",
            document.URL
        );

        console.log(
            "BODY COUNT:",
            document.querySelectorAll("*").length
        );

        const btn = await waitForElement(
            selectors.bigButton
        );

        if (btn) {

            btn.click();

            console.log("BIG CLICKED");

            return {
                clicked: true,
                selector: selectors.bigButton[0]
            };
        }

        console.log("BIG BUTTON NOT FOUND");

        return {
            clicked: false
        };
    }

    async function clickSmallButton() {
        const selectors = getSelectors();

        const btn = await waitForElement(
            selectors.smallButton
        );

        if (btn) {

            btn.click();

            console.log("SMALL CLICKED");

            return {
                clicked: true,
                selector: selectors.smallButton[0]
            };
        }

        console.log("SMALL BUTTON NOT FOUND");

        return {
            clicked: false
        };
    }

    async function executeBet(target, amount) {

        console.log("=== BETTING PIPELINE DEBUG START ===");
        console.log("[DEBUG] Current URL:", document.URL);
        console.log("[DEBUG] Current Host:", location.hostname);
        console.log("[DEBUG] Is Top Window:", window === window.top);
        console.log("[DEBUG] Is Inside Iframe:", window !== window.top);
        console.log("[DEBUG] Document Ready State:", document.readyState);
        console.log("[DEBUG] Body Children Count:", document.body?.children?.length || 0);
        console.log("[executeBet] Starting execution:", { target, amount });

        try {

            // STEP 1: Validate parameters
            console.log("[STEP 1] Validating parameters...");
            if(!['big', 'small'].includes(target.toLowerCase())) {
                console.error("[STEP 1] ❌ Invalid target:", target, "- ABORTING");
                throw new Error("Invalid target: " + target);
            }
            console.log("[STEP 1] ✅ Target validation passed:", target);

            if(!Number.isInteger(amount) || amount <= 0) {
                console.error("[STEP 1] ❌ Invalid amount:", amount, "- ABORTING");
                throw new Error("Invalid amount: " + amount);
            }
            console.log("[STEP 1] ✅ Amount validation passed:", amount);

            // STEP 2: Get selectors
            console.log("[STEP 2] Getting selectors...");
            const selectors = getSelectors();
            console.log("[STEP 2] ✅ Selectors retrieved:", selectors);

            // STEP 3: Locate target button
            console.log("[STEP 3] Locating", target, "button...");
            const buttonSelector = target.toLowerCase() === 'big'
                ? selectors.bigButton
                : selectors.smallButton;
            console.log("[STEP 3] Button selector:", buttonSelector);

            const btn = await waitForElement(buttonSelector, 30, 300);
            if(!btn) {
                console.error("[STEP 3] ❌ Button not found:", buttonSelector, "- ABORTING");
                console.log("[STEP 3] Available buttons on page:");
                document.querySelectorAll('button, [role="button"]').forEach((el, i) => {
                    console.log(`[STEP 3] Button ${i}:`, el.className, el.textContent?.substring(0, 20));
                });
                throw new Error("Button not found: " + buttonSelector);
            }
            console.log("[STEP 3] ✅ Button found:", btn);
            console.log("[STEP 3] Button classes:", btn.className);
            console.log("[STEP 3] Button position:", btn.getBoundingClientRect());

            // STEP 4: Click target button
            console.log("[STEP 4] Clicking", target, "button...");
            console.log("[STEP 4] Button before click - disabled:", btn.disabled, "visible:", btn.offsetParent !== null);
            btn.click();
            console.log("[STEP 4] ✅ Button clicked");
            console.log("[STEP 4] Button after click - disabled:", btn.disabled);

            // STEP 5–7: Amount — panel appears only after Big/Small selection
            console.log("[STEP 5] Waiting for amount controls after selection...");
            let amountApplied = false;

            const amountInput = await waitForElement(selectors.amountInput, 25, 200);
            if (amountInput) {
                console.log("[STEP 6] ✅ Amount input found:", amountInput);
                amountInput.value = '';
                amountInput.focus();
                amountInput.value = String(amount);
                amountInput.dispatchEvent(new Event('input', { bubbles: true }));
                amountInput.dispatchEvent(new Event('change', { bubbles: true }));
                amountInput.dispatchEvent(new Event('blur', { bubbles: true }));
                amountApplied = true;
                console.log("[STEP 7] ✅ Amount set via input:", amountInput.value);
            } else {
                console.log("[STEP 6] No amount input yet — trying preset amount buttons");
                const amountClicked = await clickAmountButton(amount);
                if (amountClicked) {
                    amountApplied = true;
                    console.log("[STEP 7] ✅ Amount set via preset button:", amount);
                }
            }

            if (!amountApplied) {
                throw new Error("Amount controls not found after Big/Small selection");
            }

            await new Promise(resolve => setTimeout(resolve, 300));

            // STEP 8–9: Submit — appears after amount is set
            console.log("[STEP 8] Waiting for submit/confirm control...");
            const submitBtn = await waitForElement(selectors.submitButton, 25, 200);

            if(!submitBtn) {
                console.error("[STEP 8] ❌ Submit button not found:", selectors.submitButton, "- ABORTING");
                document.querySelectorAll('button, [role="button"]').forEach((el, i) => {
                    console.log(`[STEP 8] Button ${i}:`, el.className, el.textContent?.substring(0, 20));
                });
                throw new Error("Submit button not found");
            }
            console.log("[STEP 8] ✅ Submit button found:", submitBtn);

            console.log("[STEP 9] Clicking submit button...");
            submitBtn.click();
            console.log("[STEP 9] ✅ Submit button clicked");

            await new Promise(resolve => setTimeout(resolve, 500));

            console.log("=== BETTING PIPELINE DEBUG END ===");

            console.log("[executeBet] ✅ Bet executed successfully");

            return { success: true, target, amount };

        } catch(error) {

            console.error("[executeBet] ❌ Error:", error.message);
            console.log("=== BETTING PIPELINE DEBUG FAILED ===");
            console.log("[DEBUG] Error occurred at step above");
            console.log("[DEBUG] Current document:", document.title, document.URL);
            console.log("[DEBUG] Active element:", document.activeElement);
            console.log("[DEBUG] Body classes:", document.body?.className);

            return { success: false, error: error.message };

        }
    }

    function normalizeOutcomeLabel(text) {
        const match = String(text || "").match(/\b(big|small)\b/i);
        if (!match) {
            return null;
        }
        return match[1].toLowerCase() === "big" ? "Big" : "Small";
    }

    function readOutcomeFromHistoryRow(row, selectors) {
        if (!row) {
            return null;
        }

        const resultElement = queryFirst(selectors.resultValue, row);
        if (resultElement) {
            const normalized = normalizeOutcomeLabel(resultElement.textContent.trim());
            if (normalized) {
                return normalized;
            }
        }

        return normalizeOutcomeLabel(row.innerText || row.textContent || "");
    }

    async function getLatestResult() {

        try {
            const selectors = getSelectors();

            const recordBody = queryFirst(selectors.history);

            if(!recordBody) {
                console.warn("[getLatestResult] History container not found");
                return null;
            }

            const rows = queryAllFirst(selectors.resultRow, recordBody);
            const latestRow = rows[0] || recordBody.firstElementChild;

            if(!latestRow) {
                console.warn("[getLatestResult] No records found");
                return null;
            }

            const result = readOutcomeFromHistoryRow(latestRow, selectors);

            if(result === 'Big' || result === 'Small') {
                console.log("[getLatestResult] Latest result:", result);
                return result;
            }

            console.warn("[getLatestResult] Unexpected result value:", result);
            return null;

        } catch(error) {

            console.error("[getLatestResult] Error:", error.message);
            return null;

        }

    }

    async function collectExistingHistoryForPrediction() {
        try {
            console.log('[LogicPilot AI Prediction] Collecting existing historical outcomes');
            const selectors = getSelectors();

            const recordBody = queryFirst(selectors.history);
            if (!recordBody) {
                console.warn('[LogicPilot AI Prediction] Record body not found');
                return;
            }

            const allRows = queryAllFirst(selectors.resultRow, recordBody);
            console.log('[LogicPilot AI Prediction] Historical rows found:', allRows.length);

            if (allRows.length === 0) {
                console.warn('[LogicPilot AI Prediction] No historical rows found');
                return;
            }

            const historicalOutcomes = [];

            for (let i = 0; i < allRows.length; i++) {
                const row = allRows[i];
                
                // Diagnostic logging for first few rows
                if (i < 3) {
                    console.log('[LogicPilot AI Prediction] HISTORY ROW HTML:', row.outerHTML);
                    console.log('[LogicPilot AI Prediction] HISTORY ROW TEXT:', row.innerText);
                }
                
                const resultElement = queryFirst(selectors.resultValue, row);

                if (resultElement) {
                    const result = resultElement.textContent.trim();
                    if (result === 'Big' || result === 'Small') {
                        // Extract period ID using regex fallback as primary method
                        let periodId = null;
                        
                        // First try: extract from row text using regex (most robust)
                        const rowText = row.innerText || row.textContent || "";
                        const periodMatch = rowText.match(/\d{14,20}/);
                        
                        if (periodMatch) {
                            periodId = periodMatch[0];
                        } else {
                            // Fallback: try specific selectors
                            for (const selector of selectors.periodIdInRow) {
                                const periodIdElement = row.querySelector(selector);
                                if (periodIdElement) {
                                    const potentialId = periodIdElement.textContent.trim();
                                    if (/^\d{10,}$/.test(potentialId)) {
                                        periodId = potentialId;
                                        break;
                                    }
                                }
                            }
                        }
                        
                        if (!periodId) {
                            console.warn('[LogicPilot AI Prediction] Could not extract period ID from row:', i, 'Row text:', rowText);
                            continue;
                        }

                        historicalOutcomes.push({
                            periodId: periodId,
                            outcome: result.toUpperCase(),
                            timestamp: Date.now() - (allRows.length - i) * 60000 // Approximate timestamps
                        });
                        
                        console.log('[LogicPilot AI Prediction] Parsed period', periodId, '=', result.toUpperCase());
                    }
                }
            }

            console.log('[LogicPilot AI Prediction] Valid outcomes extracted:', historicalOutcomes.length);

            if (historicalOutcomes.length === 0) {
                console.warn('[LogicPilot AI Prediction] No valid outcomes extracted');
                return;
            }

            // Reverse to get chronological order (oldest first)
            const chronologicalOutcomes = historicalOutcomes.reverse();

            // Send all historical outcomes to background service worker
            try {
                if (chrome.runtime && chrome.runtime.id) {
                    chrome.runtime.sendMessage({
                        action: "BACKFILL_HISTORY",
                        outcomes: chronologicalOutcomes
                    }).catch(err => {
                        console.error('[LogicPilot AI Prediction] Failed to send history to background:', err);
                    });
                } else {
                    console.warn('[LogicPilot AI Prediction] chrome.runtime unavailable - skipping history backfill');
                }
            } catch (e) {
                console.warn('[LogicPilot AI Prediction] Failed to send history:', e.message);
            }

            console.log('[LogicPilot AI Prediction] History backfill sent:', chronologicalOutcomes.length);
            
            // Get current period ID for initial prediction
            const currentPeriodId = getCurrentPeriodId();
            
            if (currentPeriodId) {
                PredictionState.previousPeriodId = currentPeriodId;
                console.log('[LogicPilot AI Prediction] Initial current period set to:', currentPeriodId);
                
                // Trigger initial prediction for current period
                setTimeout(() => {
                    try {
                        if (chrome.runtime && chrome.runtime.id) {
                            chrome.runtime.sendMessage({
                                action: "GENERATE_INITIAL_PREDICTION",
                                currentPeriodId: currentPeriodId
                            }).catch(err => {
                                console.log('[LogicPilot AI Prediction] Failed to request initial prediction:', err);
                            });
                        } else {
                            console.warn('[LogicPilot AI Prediction] chrome.runtime unavailable - skipping initial prediction');
                        }
                    } catch (e) {
                        console.warn('[LogicPilot AI Prediction] Failed to request prediction:', e.message);
                    }
                }, 1000);
            }

        } catch (error) {
            console.error('[LogicPilot AI Prediction] Error collecting existing history:', error);
        }
    }

    async function collectOutcomeForPrediction() {
        try {
            if (!PredictionState.outcomeCollectionEnabled) {
                return;
            }

            const currentPeriodId = getCurrentPeriodId();

            if (!currentPeriodId) {
                return;
            }

            // Initialize previous period ID on first run
            if (!PredictionState.previousPeriodId) {
                PredictionState.previousPeriodId = currentPeriodId;
                console.log('[LogicPilot AI Prediction] Initial period:', currentPeriodId);
                return;
            }

            // Check if period changed
            if (currentPeriodId === PredictionState.previousPeriodId) {
                return;
            }

            console.log('[LogicPilot AI Prediction] Period changed to:', currentPeriodId);
            console.log('[LogicPilot AI Prediction] Looking for completed period:', PredictionState.previousPeriodId);

            // The previous period is now completed, try to find its result in history
            const completedResult = await findCompletedPeriodResult(PredictionState.previousPeriodId);
            
            if (completedResult) {
                console.log('[LogicPilot AI Prediction] Found completed period:', completedResult.periodId);
                console.log('[LogicPilot AI Prediction] Actual:', completedResult.outcome);

                // Send outcome to background service worker for storage
                try {
                    if (chrome.runtime && chrome.runtime.id) {
                        chrome.runtime.sendMessage({
                            action: "RECORD_OUTCOME",
                            periodId: completedResult.periodId,
                            outcome: completedResult.outcome
                        }).catch(err => {
                            console.log('[LogicPilot AI Prediction] Failed to send outcome to background:', err);
                        });
                    } else {
                        console.warn('[LogicPilot AI Prediction] chrome.runtime unavailable - skipping outcome recording');
                    }
                } catch (e) {
                    console.warn('[LogicPilot AI Prediction] Failed to send outcome:', e.message);
                }

                // Send outcome to popup for analyzer
                try {
                    if (chrome.runtime && chrome.runtime.id) {
                        chrome.runtime.sendMessage({
                            action: "RECORD_OUTCOME",
                            periodId: completedResult.periodId,
                            outcome: completedResult.outcome
                        }).catch(err => {
                            console.log('[ANALYZER] Failed to send outcome to popup:', err);
                        });
                    }
                } catch (e) {
                    console.warn('[ANALYZER] Failed to send outcome to popup:', e.message);
                }
            } else {
                console.warn('[LogicPilot AI Prediction] Could not find result for completed period:', PredictionState.previousPeriodId);
            }

            // Update to new current period
            PredictionState.previousPeriodId = currentPeriodId;

        } catch (error) {
            console.error('[LogicPilot AI Prediction] Error collecting outcome:', error);
        }
    }

    async function findCompletedPeriodResult(periodId, maxRetries = 5, delay = 500) {
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            const result = await findPeriodInHistory(periodId);
            if (result) {
                return result;
            }
            
            if (attempt < maxRetries) {
                console.log('[LogicPilot AI Prediction] Retry', attempt, 'for period:', periodId);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
        
        console.warn('[LogicPilot AI Prediction] Period not found in history after retries:', periodId);
        return null;
    }

    async function findPeriodInHistory(periodId) {
        try {
            const selectors = getSelectors();
            const recordBody = queryFirst(selectors.history);
            if (!recordBody) {
                return null;
            }

            const allRows = queryAllFirst(selectors.resultRow, recordBody);
            
            for (const row of allRows) {
                const resultElement = queryFirst(selectors.resultValue, row);
                if (!resultElement) continue;
                
                const result = resultElement.textContent.trim();
                if (result !== 'Big' && result !== 'Small') continue;

                // Extract period ID using regex (same method as backfill)
                const rowText = row.innerText || row.textContent || "";
                const periodMatch = rowText.match(/\d{14,20}/);
                
                if (periodMatch && periodMatch[0] === periodId) {
                    return {
                        periodId: periodId,
                        outcome: result.toUpperCase()
                    };
                }
            }
            
            return null;
        } catch (error) {
            console.error('[LogicPilot AI Prediction] Error finding period in history:', error);
            return null;
        }
    }

    function getDefaultFlipSettings() {
        return {
            autoFlip1: { enabled: false, targetLogicId: null, minutes: 10 },
            autoFlip2: { enabled: false, targetLogicId: null, attempt: 5 },
            shuffleFlip: { enabled: false, wins: 3, losses: 5, triggerType: "win" }
        };
    }

    function normalizeFlipSettings(settings = {}) {
        const defaults = getDefaultFlipSettings();
        const savedSettings = settings && typeof settings === "object" ? settings : {};

        return {
            autoFlip1: {
                ...defaults.autoFlip1,
                ...(savedSettings.autoFlip1 || {})
            },
            autoFlip2: {
                ...defaults.autoFlip2,
                ...(savedSettings.autoFlip2 || {})
            },
            shuffleFlip: {
                ...defaults.shuffleFlip,
                ...(savedSettings.shuffleFlip || {}),
                triggerType:
                    savedSettings.shuffleFlip?.triggerType ||
                    savedSettings.everyResultShuffle?.triggerType ||
                    defaults.shuffleFlip.triggerType,
                enabled:
                    Boolean(savedSettings.shuffleFlip?.enabled) ||
                    Boolean(savedSettings.everyResultShuffle?.enabled)
            }
        };
    }

    function checkFlipConditions(lastOutcome = null, processedPeriodId = null) {
        // Get flip settings from storage or use defaults
        return new Promise((resolve) => {
            chrome.storage.local.get(['flipSettings', 'logicData'], (data) => {
            if (!AutomationState.timerAutomationEnabled || !globalThis.__timerAutomationActive) {
                resolve(null);
                return;
            }

            const flipSettings = normalizeFlipSettings(data.flipSettings);

            const logicData = data.logicData || {};

            // Condition 1: Time-based flip
            if (flipSettings.autoFlip1.enabled && AutomationState.logicStartTime) {
                const elapsedMinutes = (Date.now() - AutomationState.logicStartTime) / (1000 * 60);
                if (elapsedMinutes >= flipSettings.autoFlip1.minutes) {
                    console.log("[Flip Engine] Time-based flip triggered:", elapsedMinutes, "minutes >= ", flipSettings.autoFlip1.minutes);
                    
                    let targetLogicId = flipSettings.autoFlip1.targetLogicId;
                    
                    // Handle Random Logic selection
                    if (targetLogicId === "random" || targetLogicId === null) {
                        const logicIds = Object.keys(logicData).map(Number).filter(id => id !== AutomationState.activeLogicId);
                        if (logicIds.length > 0) {
                            const randomIndex = Math.floor(Math.random() * logicIds.length);
                            targetLogicId = logicIds[randomIndex];
                            console.log("[Flip Engine] Random Logic selected for Condition 1:", targetLogicId);
                        } else {
                            console.warn("[Flip Engine] No other logic available for random selection");
                            resolve(null);
                            return;
                        }
                    }
                    
                    resolve(performFlip(targetLogicId, logicData, processedPeriodId, flipSettings.flipRecoveryMode));
                    return;
                }
            }

            // Condition 2: Attempt-based flip
            if (flipSettings.autoFlip2.enabled) {
                if (AutomationState.currentAttempt >= flipSettings.autoFlip2.attempt) {
                    console.log("[Flip Engine] Attempt-based flip triggered:", AutomationState.currentAttempt, ">= ", flipSettings.autoFlip2.attempt);
                    
                    let targetLogicId = flipSettings.autoFlip2.targetLogicId;
                    
                    // Handle Random Logic selection
                    if (targetLogicId === "random" || targetLogicId === null) {
                        const logicIds = Object.keys(logicData).map(Number).filter(id => id !== AutomationState.activeLogicId);
                        if (logicIds.length > 0) {
                            const randomIndex = Math.floor(Math.random() * logicIds.length);
                            targetLogicId = logicIds[randomIndex];
                            console.log("[Flip Engine] Random Logic selected for Condition 2:", targetLogicId);
                        } else {
                            console.warn("[Flip Engine] No other logic available for random selection");
                            resolve(null);
                            return;
                        }
                    }
                    
                    resolve(performFlip(targetLogicId, logicData, processedPeriodId, flipSettings.flipRecoveryMode));
                    return;
                }
            }

            // Condition 3: Shuffle mode
            if (flipSettings.shuffleFlip.enabled) {
                const triggerType = flipSettings.shuffleFlip.triggerType === "loss" ? "loss" : "win";

                if (lastOutcome === triggerType) {
                    console.log("[Flip Engine] Shuffle mode triggered:", triggerType);
                    resolve(performShuffleFlip(logicData, processedPeriodId, flipSettings.flipRecoveryMode));
                    return;
                }
            }
            resolve(null);
            });
        });
    }

    function performFlip(targetLogicId, logicData, processedPeriodId = null, flipRecoveryMode = "reset") {
        if (!logicData[targetLogicId]) {
            console.error("[Flip Engine] Target logic not found:", targetLogicId);
            return null;
        }

        console.log("[Flip Engine] Flipping to Logic:", targetLogicId, "Recovery Mode:", flipRecoveryMode);

        const previousAttempt = AutomationState.currentAttempt;
        const previousAmount = AutomationState.lastBetAmount;

        AutomationState.activeLogicId = targetLogicId;
        const orderIndex = AutomationState.executionOrder.indexOf(Number(targetLogicId));
        if (orderIndex >= 0) {
            AutomationState.currentLogicPosition = orderIndex;
        }

        // Handle recovery modes
        if (flipRecoveryMode === "reset") {
            // Mode 1: Reset Attempt (default)
            setActiveLogicAttempt(targetLogicId, 1);
            AutomationState.lastBetTarget = null;
            AutomationState.lastBetAmount = null;
            console.log("[Flip Engine] Mode: Reset Attempt - Starting from Attempt 1");
        } else if (flipRecoveryMode === "carry_attempt") {
            // Mode 2: Carry Attempt
            const targetLogicAttempts = logicData[targetLogicId].attempts;
            const maxAttempts = Object.keys(targetLogicAttempts).length;
            
            // Use previous attempt, capped at max attempts
            setActiveLogicAttempt(targetLogicId, Math.min(previousAttempt, maxAttempts));
            AutomationState.lastBetTarget = null;
            AutomationState.lastBetAmount = null;
            console.log("[Flip Engine] Mode: Carry Attempt - Using Attempt", AutomationState.currentAttempt, "(capped at", maxAttempts, ")");
        } else if (flipRecoveryMode === "carry_attempt_amount") {
            // Mode 3: Carry Attempt + Amount
            const targetLogicAttempts = logicData[targetLogicId].attempts;
            const maxAttempts = Object.keys(targetLogicAttempts).length;
            
            // Use previous attempt, capped at max attempts
            setActiveLogicAttempt(targetLogicId, Math.min(previousAttempt, maxAttempts));
            AutomationState.lastBetTarget = null;
            // Preserve previous amount
            AutomationState.lastBetAmount = previousAmount;
            console.log("[Flip Engine] Mode: Carry Attempt + Amount - Using Attempt", AutomationState.currentAttempt, "with Amount", previousAmount, "(capped at", maxAttempts, ")");
        }

        if (processedPeriodId) {
            AutomationState.lastProcessedPeriodId = processedPeriodId;
        }
        AutomationState.logicStartTime = Date.now();
        AutomationState.logicWinCount = 0;
        AutomationState.logicLossCount = 0;
        publishAutomationRuntimeState();

        const strategyData = logicData[targetLogicId].attempts;
        const totalAttempts = Object.keys(strategyData).length;

        // Restart timer monitoring with new logic
        if(globalThis.__timerObserver){
            globalThis.__timerObserver.disconnect();
            globalThis.__timerObserver = null;
        }

        globalThis.__timerObserver = initializeTimerMonitoring(strategyData, totalAttempts, logicData);

        // Notify popup
        try {
            if (chrome.runtime && chrome.runtime.id) {
                chrome.runtime.sendMessage({
                    action: "UPDATE_CURRENT_ATTEMPT",
                    currentAttempt: AutomationState.currentAttempt,
                    activeLogicId: targetLogicId
                }).catch(err => {
                    console.log("[Flip Engine] Failed to send update to popup:", err);
                });
            } else {
                console.warn("[Flip Engine] chrome.runtime unavailable - skipping popup update");
            }
        } catch (e) {
            console.warn("[Flip Engine] Failed to send popup update:", e.message);
        }

        return {
            activeLogicId: targetLogicId,
            strategyData,
            totalAttempts
        };
    }

    function performShuffleFlip(logicData, processedPeriodId = null, flipRecoveryMode = "reset") {
        const logicIds = Object.keys(logicData).map(Number).filter(id => id !== AutomationState.activeLogicId);

        if (logicIds.length === 0) {
            console.warn("[Flip Engine] No other logic blocks available for shuffle");
            return null;
        }

        const randomIndex = Math.floor(Math.random() * logicIds.length);
        const targetLogicId = logicIds[randomIndex];

        console.log("[Flip Engine] Shuffle flip to Logic:", targetLogicId);
        return performFlip(targetLogicId, logicData, processedPeriodId, flipRecoveryMode);
    }

    function calculateNextMove(strategyData, totalAttempts, completedRoundOutcome = null, currentPeriodId = null, logicData = null) {
        console.log("======== calculateNextMove START ========");
        console.log("Current Attempt:", AutomationState.currentAttempt);
        console.log("Total Attempts:", totalAttempts);
        console.log("Completed Round Outcome:", completedRoundOutcome);
        console.log("Current Period ID:", currentPeriodId);
        console.log("Last Outcome Processed Period ID:", AutomationState.lastOutcomeProcessedPeriodId);
        console.log("Session ID:", AutomationState.sessionId);
        console.log("Baseline Period ID:", AutomationState.baselinePeriodId);
        console.log("========================================");

        if(!strategyData){
            console.error("[Timer] No strategy data");
            return null;
        }

        // CRITICAL FIX: Validate session exists - ignore events from old sessions
        if (!AutomationState.sessionId) {
            console.warn("[ATTEMPT] IGNORED STALE EVENT");
            console.warn("[ATTEMPT] eventSessionId=null, currentSessionId=null");
            console.warn("[ATTEMPT] period=" + currentPeriodId);
            return null;
        }

        // CRITICAL FIX: Check if this is the baseline period (old DOM result) and ignore it
        if (currentPeriodId && AutomationState.baselinePeriodId && currentPeriodId === AutomationState.baselinePeriodId) {
            console.log("[ATTEMPT] IGNORED - Baseline period (old DOM result):", currentPeriodId);
            console.log("[ATTEMPT] This is the period visible when START was pressed - not a new result");
            // Return current config without advancing
            const executedAttempt = AutomationState.currentAttempt;
            const currentAttemptConfig = strategyData[executedAttempt];
            if (!currentAttemptConfig) {
                console.error("[Timer] Current attempt config not found at index", executedAttempt);
                return null;
            }
            return {
                ...currentAttemptConfig,
                executedAttempt,
                executedAmount: currentAttemptConfig.amount
            };
        }

        if(AutomationState.currentAttempt > totalAttempts){
            console.log("[Session] Final attempt already completed - stopping session");
            stopSessionAutomation("completed");
            return null;
        }

        const executedAttempt = AutomationState.currentAttempt;
        const currentAttemptConfig = strategyData[executedAttempt];
        if(!currentAttemptConfig){
            console.error("[Timer] Current attempt config not found at index", executedAttempt);
            return null;
        }

        console.log("[Session] Executed Attempt:", executedAttempt);
        console.log("[Session] Executed Strategy:", currentAttemptConfig);

        // CRITICAL FIX: Session-scoped duplicate result protection
        const sessionProcessedPeriods = AutomationState.processedPeriodsBySession.get(AutomationState.sessionId);
        if (currentPeriodId && sessionProcessedPeriods && sessionProcessedPeriods.has(currentPeriodId)) {
            console.log("[ATTEMPT] IGNORED DUPLICATE PERIOD");
            console.log("[ATTEMPT] period=" + currentPeriodId + " already processed in current session");
            return null;
        }

        // Handle WIN/LOSS transitions - WIN resets to A1, LOSS moves down one attempt.
        const attemptBefore = AutomationState.currentAttempt;
        
        if (completedRoundOutcome === "win") {
            console.log("[ATTEMPT] Processing NEW period: " + currentPeriodId);
            console.log("[ATTEMPT] Session: " + AutomationState.sessionId);
            console.log("[ATTEMPT] Current attempt: A" + attemptBefore);
            console.log("[RESULT] period=" + currentPeriodId + " result=WIN attemptBefore=" + attemptBefore);
            console.log("[TRANSITION] A" + attemptBefore + " → A1");

            setActiveLogicAttempt(AutomationState.activeLogicId, 1);

            if (currentPeriodId && sessionProcessedPeriods) {
                sessionProcessedPeriods.add(currentPeriodId);
            }

            if (currentPeriodId) {
                AutomationState.lastOutcomeProcessedPeriodId = currentPeriodId;
            }
        } else if (completedRoundOutcome === "loss") {
            // LOSS → MOVE TO NEXT ATTEMPT
            if (executedAttempt < totalAttempts) {
                console.log("[ATTEMPT] Processing NEW period: " + currentPeriodId);
                console.log("[ATTEMPT] Session: " + AutomationState.sessionId);
                console.log("[ATTEMPT] Current attempt: A" + attemptBefore);
                console.log("[ATTEMPT] Advancing A" + attemptBefore + " -> A" + (executedAttempt + 1));
                console.log("[RESULT] period=" + currentPeriodId + " result=LOSS attemptBefore=" + attemptBefore);
                console.log("[TRANSITION] A" + attemptBefore + " → A" + (executedAttempt + 1));
                
                setActiveLogicAttempt(AutomationState.activeLogicId, executedAttempt + 1);
                
                // CRITICAL FIX: Mark this period as processed in the current session
                if (currentPeriodId && sessionProcessedPeriods) {
                    sessionProcessedPeriods.add(currentPeriodId);
                }
                
                // Legacy: also mark in lastOutcomeProcessedPeriodId for backward compatibility
                if (currentPeriodId) {
                    AutomationState.lastOutcomeProcessedPeriodId = currentPeriodId;
                }
            } else {
                console.log("[Session] FINAL ATTEMPT LOSS - moving to next logic if available");

                if (currentPeriodId && sessionProcessedPeriods) {
                    sessionProcessedPeriods.add(currentPeriodId);
                }

                if (currentPeriodId) {
                    AutomationState.lastOutcomeProcessedPeriodId = currentPeriodId;
                }

                if (!advanceToNextLogic(logicData)) {
                    console.log("[Session] FINAL LOGIC FINAL ATTEMPT LOSS - Session complete, stopping automation");
                    stopSessionAutomation("completed");
                    return null;
                }

                strategyData = logicData?.[AutomationState.activeLogicId]?.attempts || {};
                totalAttempts = Object.keys(strategyData).length;
            }
        } else {
            console.log("[TRANSITION] No completed outcome yet - using current attempt A" + attemptBefore);
        }

        console.log("[Session] Next Attempt will be:", AutomationState.currentAttempt);
        console.log("[Session] Active Logic will be:", AutomationState.activeLogicId);

        // CRITICAL FIX: Read config from the NEW currentAttempt after transition
        // This ensures the next bet uses the correct attempt's configuration
        const nextAttempt = AutomationState.currentAttempt;
        const nextAttemptConfig = strategyData[nextAttempt];
        
        if(!nextAttemptConfig){
            console.error("[Timer] Next attempt config not found at index", nextAttempt);
            return null;
        }

        console.log("[Session] Next Attempt Config:", nextAttempt);
        console.log("[Session] Next Strategy:", nextAttemptConfig);
        console.log("======== calculateNextMove END ========");

        return {
            ...nextAttemptConfig,
            executedAttempt: nextAttempt,
            activeLogicId: AutomationState.activeLogicId,
            currentLogicPosition: AutomationState.currentLogicPosition,
            executedAmount: nextAttemptConfig.amount
        };
    }

    function initializeTimerMonitoring(strategyData, totalAttempts, logicData = null) {

        console.log("=== CONTEXT DEBUG: initializeTimerMonitoring START ===");
        console.log("[CONTEXT] Current URL:", location.href);
        console.log("[CONTEXT] Current document.URL:", document.URL);
        console.log("[CONTEXT] window === window.top:", window === window.top);
        console.log("[CONTEXT] window.frameElement:", window.frameElement);
        console.log("[CONTEXT] window.location.href:", document.URL);
        console.log("[CONTEXT] document.body.className:", document.body?.className);
        console.log("[CONTEXT] document.title:", document.title);
        console.log("[CONTEXT] isWrapperPage():", isWrapperPage());
        console.log("[CONTEXT] Window name:", window.name);
        console.log("[CONTEXT] Parent window:", window.parent === window ? "same" : "different");
        console.log("=== CONTEXT DEBUG END ===");

        console.log("[Timer] Entering: initializeTimerMonitoring");
        console.log("[Timer] Instance ID:", globalThis.__logicPilotInstanceId);
        console.log("[Timer] Strategy data keys:", Object.keys(strategyData));

        let timerTriggeredThisRound = false;
        let lastProcessedPeriodId = AutomationState.lastProcessedPeriodId || null;
        let lastObservedPeriodId = getCurrentPeriodId();
        let betInFlightPeriodId = null;
        const selectors = getSelectors();
        const siteConfig = getSiteConfig();

        console.log("[Timer] Locating timer element...");
        const timerElement = queryFirst(selectors.timer);

        if(!timerElement) {
            console.error("[Timer] Timer element not found - ABORTING");
            console.log("[Timer] Leaving: initializeTimerMonitoring (FAILED)");
            return null;
        }

        console.log("[Timer] Timer element found successfully");
        console.log("[Timer] Creating MutationObserver for timer");
        console.log("[Timer] Leaving: initializeTimerMonitoring (SUCCESS)");

        const observer = new MutationObserver(async () => {

            const timerValue = getTimerValue(timerElement);
            const timerSecond = getTimerSecond(timerValue);

            // Read current period ID
            const currentPeriodId = getCurrentPeriodId();

            // Check if period ID changed
            const periodChanged = currentPeriodId && currentPeriodId !== lastObservedPeriodId;
            const randomBetTargetSecond = ensureRandomBetTargetForPeriod(currentPeriodId);
            const hasReachedRandomTarget = hasReachedRandomBetTarget(
                timerSecond,
                randomBetTargetSecond
            );
            const hasBetLockForPeriod = (
                timerTriggeredThisRound ||
                betInFlightPeriodId === currentPeriodId ||
                AutomationState.lastProcessedPeriodId === currentPeriodId ||
                lastProcessedPeriodId === currentPeriodId
            );

            if (periodChanged) {
                timerTriggeredThisRound = false;
                betInFlightPeriodId = null;
                lastObservedPeriodId = currentPeriodId;
            }

            // Collect outcome for prediction system when period changes
            if (periodChanged) {
                await collectOutcomeForPrediction();
            }

            // Log monitoring state
            if(hasReachedRandomTarget || periodChanged) {
                console.log("[Timer] Monitoring - Site:", siteConfig?.key || "unknown", "| Timer:", timerValue, "| Seconds:", timerSecond, "| Target:", randomBetTargetSecond, "| Period ID:", currentPeriodId, "| Last Processed Period:", lastProcessedPeriodId, "| Period Changed:", periodChanged, "| Target reached:", hasReachedRandomTarget, "| Bet locked:", hasBetLockForPeriod, "| Enabled:", AutomationState.timerAutomationEnabled);
            }

            if(hasReachedRandomTarget && currentPeriodId && !hasBetLockForPeriod && AutomationState.timerAutomationEnabled) {

                timerTriggeredThisRound = true;
                betInFlightPeriodId = currentPeriodId;

                console.log("[Timer] ✓ Timer reached random target", randomBetTargetSecond, "seconds - executing automation");
                console.log("=== START OF TIMER CYCLE ===");
                console.log("currentAttempt:", AutomationState.currentAttempt);
                console.log("lastBetTarget:", AutomationState.lastBetTarget);
                console.log("lastResult:", AutomationState.lastResult);

                try {
                    let nextMove;

                    // Always get latest result and calculate next move
                    const latestResult = await getLatestResult();

                    if(!latestResult) {
                        console.warn("[Timer] Could not get latest result, skipping round");
                        timerTriggeredThisRound = false;
                        betInFlightPeriodId = null;
                        return;
                    }

                    // Update state with outcome
                    AutomationState.lastResult = latestResult;
                    const completedRoundOutcome =
                        AutomationState.lastBetTarget == null
                            ? null
                            : AutomationState.lastBetTarget === latestResult
                                ? "win"
                                : "loss";

                    let activeStrategyData = logicData?.[AutomationState.activeLogicId]?.attempts || strategyData;
                    let activeTotalAttempts = Object.keys(activeStrategyData).length || totalAttempts;

                    if (completedRoundOutcome) {
                        // Update win/loss counts for flip engine (preserved for flip system)
                        if(completedRoundOutcome === "win"){
                            AutomationState.logicWinCount++;
                            AutomationState.logicLossCount = 0;
                        } else {
                            AutomationState.logicLossCount++;
                            AutomationState.logicWinCount = 0;
                        }

                        const flipResult = await checkFlipConditions(completedRoundOutcome, currentPeriodId);

                        if (flipResult) {
                            activeStrategyData = flipResult.strategyData;
                            activeTotalAttempts = flipResult.totalAttempts;
                        }
                    }

                    console.log("=== BEFORE calculateNextMove ===");
                    console.log("currentAttempt:", AutomationState.currentAttempt);
                    console.log("lastBetTarget:", AutomationState.lastBetTarget);
                    console.log("lastResult:", AutomationState.lastResult);
                    console.log("completedRoundOutcome:", completedRoundOutcome);
                    console.log("activeLogicId:", AutomationState.activeLogicId);

                    console.log("[STEP 10] Calculating next move...");
                    // Calculate next move using simple sequential progression
                    nextMove = calculateNextMove(activeStrategyData, activeTotalAttempts, completedRoundOutcome, currentPeriodId, logicData);

                    console.log("=== AFTER calculateNextMove ===");
                    console.log("currentAttempt:", AutomationState.currentAttempt);
                    console.log("nextMove returned:", nextMove);

                    if(!nextMove) {
                        timerTriggeredThisRound = false;
                        betInFlightPeriodId = null;
                        console.error("[STEP 10] Failed to calculate next move - ABORTING");
                        return;
                    }

                    const executedAttempt = nextMove.executedAttempt;
                    const executedAmount = nextMove.executedAmount ?? nextMove.amount;

                    console.log("[STEP 11] Next move calculated - Choice:", nextMove.choice, "Amount:", nextMove.amount);

                    // Store bet details before execution
                    // Store bet details
const betTarget = nextMove.choice === 'big' ? 'Big' : 'Small';

console.log("[STEP 10] Calling executeBet() with choice:", nextMove.choice, "amount:", nextMove.amount);
console.log("[CONTEXT DEBUG] Before executeBet - Document URL:", document.URL);
console.log("[CONTEXT DEBUG] Before executeBet - Window Top:", window === window.top);
console.log("[CONTEXT DEBUG] Before executeBet - Iframe:", window !== window.top);

// Execute bet first
const result = await executeBet(nextMove.choice, nextMove.amount);

console.log("[CONTEXT DEBUG] After executeBet - Still in same document:", document.URL);
console.log("[STEP 14] executeBet() returned:", result);

// Save only after successful execution
if (result.success) {
    console.log("[STEP 14] Bet execution successful - storing state");
    AutomationState.lastBetTarget = betTarget;
    AutomationState.lastBetAmount = nextMove.amount;

    console.log("=== AFTER executeBet ===");
    console.log("lastBetTarget stored:", AutomationState.lastBetTarget);
    console.log("lastBetAmount stored:", AutomationState.lastBetAmount);
    console.log("currentAttempt:", AutomationState.currentAttempt);

} else {
    console.error("[STEP 14] Bet execution FAILED:", result);
}
                    if(result.success) {
                        console.log("[Timer] ✅ Automation round complete");
                        
                        // Update processed period ID
                        if(currentPeriodId) {
                            AutomationState.lastProcessedPeriodId = currentPeriodId;
                            lastProcessedPeriodId = currentPeriodId;
                            console.log("[Timer] Period ID updated:", currentPeriodId);
                        }

                        recordSessionCompletion(
                            executedAttempt,
                            executedAmount,
                            currentPeriodId,
                            activeTotalAttempts
                        );

                        publishAutomationRuntimeState();

                        // Send currentAttempt update to popup for UI synchronization
                        try {
                            if (chrome.runtime && chrome.runtime.id) {
                                chrome.runtime.sendMessage({
                                    action: "UPDATE_CURRENT_ATTEMPT",
                                    currentAttempt: AutomationState.currentAttempt,
                                    activeLogicId: AutomationState.activeLogicId
                                }).catch(err => {
                                    console.log("[Timer] Failed to send currentAttempt update to popup:", err);
                                });
                            } else {
                                console.warn("[Timer] chrome.runtime unavailable - skipping popup update");
                            }
                        } catch (e) {
                            console.warn("[Timer] Failed to send popup update:", e.message);
                        }

                    } else {
                        console.error("[Timer] Bet execution failed:", result.error);
                    }

                } catch(error) {

                    betInFlightPeriodId = null;
                    timerTriggeredThisRound = false;

                    console.error("[Timer] Error in automation flow:", error);
                    console.error("[Timer] Error stack:", error.stack);
                    console.error("[Timer] Error name:", error.name);

                }

            }

        });

        observer.observe(timerElement, {
            characterData: true,
            subtree: true,
            childList: true
        });

        console.log("[Timer] ✓ Timer monitoring started - Observer configured with characterData, subtree, childList");
        console.log("[Timer] Monitoring timer element:", timerElement, "| Site:", siteConfig?.key || "unknown", "| Selectors:", selectors);
        console.log("=====================================");
        console.log("Current Attempt:", AutomationState.currentAttempt);
        console.log("Last Bet:", AutomationState.lastBetTarget);
        console.log("Latest Result:", AutomationState.lastResult);
        console.log("Outcome: pending until previous bet exists");
        console.log("=====================================");

        // Collect existing historical outcomes for prediction system
        setTimeout(() => {
            collectExistingHistoryForPrediction();
        }, 2000);

        return observer;

    }

    function monitorTimer(callback) {

        const timerElement = queryFirst(getSelectors().timer);

        if(!timerElement){
            console.error("[Timer] Timer element not found");
            return null;
        }

        let hasTriggered = false;

        const observer = new MutationObserver(() => {

            const timerText = getTimerValue(timerElement);
            const currentPeriodId = getCurrentPeriodId();
            const targetSecond = ensureRandomBetTargetForPeriod(currentPeriodId);
            const timerSecond = getTimerSecond(timerText);

            if(hasReachedRandomBetTarget(timerSecond, targetSecond) && !hasTriggered){

                hasTriggered = true;

                console.log("[Timer] ✅ Timer reached random target", targetSecond);

                callback();

            } else if(!hasReachedRandomBetTarget(timerSecond, targetSecond) && hasTriggered){

                hasTriggered = false;

            }

        });

        observer.observe(timerElement, {
            characterData: true,
            subtree: true,
            childList: true
        });

        console.log("[Timer] Monitoring started");

        return observer;

    }


    async function clickAmountButton(amount) {

        console.log("[Amount] Looking for amount button:", amount);

        // Find all amount buttons
        const amountButtons = document.querySelectorAll(".default");

        if(!amountButtons || amountButtons.length === 0){
            console.error("[Amount] No amount buttons found");
            return false;
        }

        // Search for matching amount button
        for(let btn of amountButtons){

            if(btn.textContent.trim() === String(amount)){

                console.log("[Amount] Found button for amount", amount);

                btn.click();

                console.log("[Amount] Amount button clicked");

                return true;

            }

        }

        console.error("[Amount] Button for amount", amount, "not found");

        return false;

    }

    async function executeBetSequence(choice, amount) {

        try {

            console.log("[Bet] Executing bet sequence - Choice:", choice, "Amount:", amount);

            // Step 1: Click Big or Small
            let clickResult;

            if(choice.toLowerCase() === "big"){

                clickResult = await clickBigButton();

            } else if(choice.toLowerCase() === "small"){

                clickResult = await clickSmallButton();

            } else {

                throw new Error("Invalid choice: " + choice);

            }

            if(!clickResult.clicked){
                throw new Error("Failed to click " + choice + " button");
            }

            console.log("[Bet] " + choice + " button clicked successfully");

            // Step 2: Wait for amount buttons to appear
            await new Promise(resolve => setTimeout(resolve, 400));

            // Step 3: Click matching amount button
            const amountClicked = await clickAmountButton(amount);

            if(!amountClicked){
                throw new Error("Failed to click amount button for: " + amount);
            }

            console.log("[Bet] ✅ Bet sequence complete - Choice:", choice, "Amount:", amount);

            return { success: true, choice, amount };

        } catch(error){

            console.error("[Bet] ❌ Bet execution failed:", error.message);

            return { success: false, error: error.message };

        }

    }

    chrome.runtime.onMessage.addListener(
        (message, sender, sendResponse) => {

            (async () => {

                try {

                    console.log(
                        "MESSAGE RECEIVED:",
                        message
                    );

                    let payload = {
                        status: "OK"
                    };

                    if (message.action === "PING") {

                        payload = {
                            status: "OK",
                            action: "PING",
                            pong: true
                        };

                    } else if (
                        message.action === "CLICK_BIG"
                    ) {

                        payload = {
                            status: "OK",
                            action: "CLICK_BIG",
                            result: await clickBigButton()
                        };

                    } else if (
                        message.action === "CLICK_SMALL"
                    ) {

                        payload = {
                            status: "OK",
                            action: "CLICK_SMALL",
                            result: await clickSmallButton()
                        };

                    } else if (
                        message.action === "PLACE_BET"
                    ) {

                        // Check if this is a wrapper page - forward to iframe ONLY
                        if (isWrapperPage()) {
                            console.log("[PLACE_BET] Wrapper page detected - forwarding to game iframe");
                            console.log("[Wrapper] Wrapper will NOT execute any bet placement code");
                            
                            waitForGameIframe().then(iframe => {
                                console.log("[PLACE_BET] Found game iframe, forwarding bet command");
                                
                                // Send command to iframe
                                sendMessageToIframe(iframe, {
                                    source: "logicpilot-wrapper",
                                    action: "PLACE_BET_IFRAME",
                                    choice: message.choice,
                                    amount: message.amount
                                });
                                
                                console.log("[Wrapper] Bet command forwarded to iframe");
                                console.log("[Wrapper] EXITING - wrapper execution complete");
                                
                                payload = {
                                    status: "OK",
                                    action: "PLACE_BET",
                                    message: "Bet forwarded to game iframe"
                                };
                                sendResponse(payload);
                            }).catch(err => {
                                console.error("[PLACE_BET] Failed to find game iframe:", err);
                                console.log("[Wrapper] EXITING with error - wrapper execution complete");
                                payload = {
                                    status: "ERROR",
                                    action: "PLACE_BET",
                                    message: "Failed to find game iframe: " + err.message
                                };
                                sendResponse(payload);
                            });
                            return; // CRITICAL: Return immediately - wrapper will never continue to bet code
                        }

                        const choice = message.choice;
                        const amount = message.amount;

                        console.log("[PLACE_BET] Executing bet:", { choice, amount });

                        const result = await executeBet(choice, amount);

                        payload = {
                            status: "OK",
                            action: "PLACE_BET",
                            result: result
                        };

                    } else if (message.action === "QUICK_SHIFT_ATTEMPT") {
                        console.log("[Quick Shift] Received quick shift command via runtime message");
                        const targetAttempt = message.targetAttempt;
                        const newActiveLogicId = message.activeLogicId;
                        
                        if (targetAttempt && targetAttempt > 0) {
                            console.log("[Quick Shift] Shifting to attempt:", targetAttempt);
                            setActiveLogicAttempt(newActiveLogicId || AutomationState.activeLogicId, targetAttempt);
                            
                            console.log("[Quick Shift] State updated - currentAttempt:", AutomationState.currentAttempt, "activeLogicId:", AutomationState.activeLogicId);
                            
                            // Publish updated state
                            publishAutomationRuntimeState();
                            publishSessionState();
                            
                            payload = {
                                status: "OK",
                                action: "QUICK_SHIFT_ATTEMPT",
                                message: "Quick shift completed successfully"
                            };
                        } else {
                            console.error("[Quick Shift] Invalid target attempt:", targetAttempt);
                            payload = {
                                status: "ERROR",
                                action: "QUICK_SHIFT_ATTEMPT",
                                message: "Invalid target attempt"
                            };
                        }

                    } else if (message.action === "RESET_ATTEMPT_TO_ZERO") {
                        if (isWrapperPage()) {
                            waitForGameIframe().then(iframe => {
                                sendMessageToIframe(iframe, {
                                    source: "logicpilot-wrapper",
                                    action: "RESET_ATTEMPT_TO_ZERO_IFRAME",
                                    activeLogicId: message.activeLogicId
                                });

                                sendResponse({
                                    status: "OK",
                                    action: "RESET_ATTEMPT_TO_ZERO",
                                    message: "Reset forwarded to game iframe"
                                });
                            }).catch(err => {
                                sendResponse({
                                    status: "ERROR",
                                    action: "RESET_ATTEMPT_TO_ZERO",
                                    message: "Failed to find game iframe: " + err.message
                                });
                            });
                            return;
                        }

                        resetAttemptToZero(message.activeLogicId);

                        payload = {
                            status: "OK",
                            action: "RESET_ATTEMPT_TO_ZERO",
                            currentAttempt: AutomationState.currentAttempt,
                            message: "Current attempt reset to 0"
                        };

                    } else if (message.action === "RESET_SESSION") {
                        const totalAttempts =
                            message.totalAttempts || SessionState.totalAttempts || 0;
                        const startAttempt =
                            message.startAttempt || SessionState.startAttempt || 1;

                        resetSessionState(totalAttempts, startAttempt);
                        publishAutomationRuntimeState();

                        payload = {
                            status: "OK",
                            action: "RESET_SESSION",
                            message: "Session reset"
                        };

                    } else if (
                        message.action === "START_TIMER_AUTOMATION"
                    ) {

                        console.log("[STEP 1] START_TIMER_AUTOMATION received");
                        console.log("[STEP 1] Instance ID:", globalThis.__logicPilotInstanceId);
                        console.log("[STEP 1] __timerAutomationActive:", globalThis.__timerAutomationActive);
                        console.log("[STEP 1] __timerObserver exists:", !!globalThis.__timerObserver);
                        console.log("[STEP 1] Current URL:", document.URL);
                        console.log("[STEP 1] Current Host:", location.hostname);
                        console.log("[STEP 1] isWrapperPage():", isWrapperPage());

                        // Check if this is a wrapper page - forward to iframe ONLY
                        if (isWrapperPage()) {
                            console.log("[STEP 2] Wrapper page detected - forwarding to game iframe");
                            console.log("[Wrapper] Wrapper will NOT execute any automation code");
                            console.log("[Wrapper] BLOCKING all automation code execution in wrapper context");
                            
                            waitForGameIframe().then(iframe => {
                                console.log("[STEP 2] Found game iframe, forwarding automation command");
                                
                                // Send command to iframe
                                sendMessageToIframe(iframe, {
                                    source: "logicpilot-wrapper",
                                    action: "START_TIMER_AUTOMATION_IFRAME",
                                    logicData: message.logicData,
                                    activeLogicId: message.activeLogicId,
                                    totalAttempts: message.totalAttempts,
                                    customStartingAttempt: message.customStartingAttempt,
                                    executionOrder: message.executionOrder,
                                    currentLogicPosition: message.currentLogicPosition,
                                    shuffleEnabled: message.shuffleEnabled,
                                    shuffleFrom: message.shuffleFrom,
                                    shuffleTo: message.shuffleTo
                                });
                                
                                console.log("[STEP 2] Automation command forwarded to iframe");
                                console.log("[Wrapper] EXITING - wrapper execution complete, no automation code will run");
                                
                                payload = {
                                    status: "OK",
                                    action: "START_TIMER_AUTOMATION",
                                    message: "Automation forwarded to game iframe"
                                };
                                sendResponse(payload);
                            }).catch(err => {
                                console.error("[STEP 2] Failed to find game iframe:", err);
                                console.log("[Wrapper] EXITING with error - wrapper execution complete");
                                payload = {
                                    status: "ERROR",
                                    action: "START_TIMER_AUTOMATION",
                                    message: "Failed to find game iframe: " + err.message
                                };
                                sendResponse(payload);
                            });
                            return; // CRITICAL: Return immediately - wrapper will never continue to automation code
                        }

                        // Disconnect existing observer if present (prevent memory leak)
                        if(globalThis.__timerObserver){
                            console.log("[Automation] Disconnecting existing observer before creating new one");
                            globalThis.__timerObserver.disconnect();
                            globalThis.__timerObserver = null;
                        }

                        if(!globalThis.__timerAutomationActive){

                            globalThis.__timerAutomationActive = true;
                            AutomationState.timerAutomationEnabled = true;

                            const logicData = message.logicData;
                            const activeLogicId = message.activeLogicId;
                            const totalAttempts = message.totalAttempts;
                            const customStartingAttempt = message.customStartingAttempt || null;
                            const executionOrder = message.executionOrder;
                            const currentLogicPosition = message.currentLogicPosition || 0;

                            AutomationState.logicWinCount = 0;
                            AutomationState.logicLossCount = 0;
                            AutomationState.logicStartTime = Date.now();
                            
                            // CRITICAL FIX: Capture baseline period to avoid processing old DOM results
                            const baselinePeriodId = getCurrentPeriodId();
                            
                            // CRITICAL FIX: START MUST ALWAYS BEGIN FROM ATTEMPT 1
                            // Generate new session ID to invalidate old session events
                            startNewSession(baselinePeriodId);
                            
                            const startAttempt = customStartingAttempt && customStartingAttempt > 0
                                ? customStartingAttempt
                                : 1;
                            if (customStartingAttempt && customStartingAttempt > 0) {
                                console.log("[Automation] Using custom starting attempt:", customStartingAttempt);
                            } else {
                                console.log("[SESSION] NEW sessionId=" + AutomationState.sessionId + " RESET to A1");
                            }
                            startExecutionOrderSession(logicData, executionOrder, currentLogicPosition, startAttempt);

                            initializeSessionState(totalAttempts, AutomationState.currentAttempt);
                            
                            publishAutomationRuntimeState();

                            const activeLogic = logicData[AutomationState.activeLogicId];
                            const strategyData = activeLogic ? activeLogic.attempts : {};

                            console.log("[Automation] Starting with Logic:", AutomationState.activeLogicId);
                            console.log("[Automation] Strategy data:", strategyData);

                            globalThis.__timerObserver = initializeTimerMonitoring(strategyData, totalAttempts, logicData);

                            if (!globalThis.__timerObserver) {
                                globalThis.__timerAutomationActive = false;
                                AutomationState.timerAutomationEnabled = false;
                                payload = {
                                    status: "ERROR",
                                    action: "START_TIMER_AUTOMATION",
                                    message: "Timer element not found in this frame"
                                };
                            } else {
                                payload = {
                                    status: "OK",
                                    action: "START_TIMER_AUTOMATION",
                                    message: "Timer automation started"
                                };
                            }

                        } else {

                            payload = {
                                status: "OK",
                                message: "Timer automation already running"
                            };

                        }

                    } else if (
                        message.action === "SWITCH_LOGIC"
                    ) {

                        console.log("[Automation] SWITCH_LOGIC received");
                        console.log("[Automation] Switching to Logic:", message.activeLogicId);

                        const activeLogicId = message.activeLogicId;
                        const logicData = message.logicData;
                        const flipRecoveryMode = message.flipRecoveryMode || "reset";

                        const previousAttempt = AutomationState.currentAttempt;
                        const previousAmount = AutomationState.lastBetAmount;

                        AutomationState.activeLogicId = activeLogicId;
                        const orderIndex = AutomationState.executionOrder.indexOf(Number(activeLogicId));
                        if (orderIndex >= 0) {
                            AutomationState.currentLogicPosition = orderIndex;
                        }

                        // Handle recovery modes
                        if (flipRecoveryMode === "reset") {
                            // Mode 1: Reset Attempt (default)
                            setActiveLogicAttempt(activeLogicId, 1);
                            AutomationState.lastBetTarget = null;
                            AutomationState.lastBetAmount = null;
                            console.log("[Automation] Mode: Reset Attempt - Starting from Attempt 1");
                        } else if (flipRecoveryMode === "carry_attempt") {
                            // Mode 2: Carry Attempt
                            const targetLogicAttempts = logicData ? logicData.attempts : {};
                            const maxAttempts = Object.keys(targetLogicAttempts).length;
                            
                            // Use previous attempt, capped at max attempts
                            setActiveLogicAttempt(activeLogicId, Math.min(previousAttempt, maxAttempts));
                            AutomationState.lastBetTarget = null;
                            AutomationState.lastBetAmount = null;
                            console.log("[Automation] Mode: Carry Attempt - Using Attempt", AutomationState.currentAttempt, "(capped at", maxAttempts, ")");
                        } else if (flipRecoveryMode === "carry_attempt_amount") {
                            // Mode 3: Carry Attempt + Amount
                            const targetLogicAttempts = logicData ? logicData.attempts : {};
                            const maxAttempts = Object.keys(targetLogicAttempts).length;
                            
                            // Use previous attempt, capped at max attempts
                            setActiveLogicAttempt(activeLogicId, Math.min(previousAttempt, maxAttempts));
                            AutomationState.lastBetTarget = null;
                            // Preserve previous amount
                            AutomationState.lastBetAmount = previousAmount;
                            console.log("[Automation] Mode: Carry Attempt + Amount - Using Attempt", AutomationState.currentAttempt, "with Amount", previousAmount, "(capped at", maxAttempts, ")");
                        }

                        AutomationState.logicWinCount = 0;
                        AutomationState.logicLossCount = 0;
                        AutomationState.logicStartTime = Date.now();
                        publishAutomationRuntimeState();

                        const strategyData = logicData ? logicData.attempts : {};
                        const totalAttempts = Object.keys(strategyData).length;

                        // Restart timer monitoring with new logic
                        if(globalThis.__timerObserver){
                            globalThis.__timerObserver.disconnect();
                            globalThis.__timerObserver = null;
                        }

                        globalThis.__timerObserver = initializeTimerMonitoring(strategyData, totalAttempts, logicData);

                        payload = {
                            status: "OK",
                            action: "SWITCH_LOGIC",
                            message: `Switched to Logic ${activeLogicId}`
                        };

                    } else if (
                        message.action === "STOP_TIMER_AUTOMATION"
                    ) {

                        // Check if this is a wrapper page - forward to iframe ONLY
                        if (isWrapperPage()) {
                            console.log("[STOP_TIMER_AUTOMATION] Wrapper page detected - forwarding to game iframe");
                            console.log("[Wrapper] Wrapper will NOT execute stop automation commands");
                            
                            waitForGameIframe().then(iframe => {
                                console.log("[STOP_TIMER_AUTOMATION] Found game iframe, forwarding stop command");
                                
                                // Send command to iframe
                                sendMessageToIframe(iframe, {
                                    source: "logicpilot-wrapper",
                                    action: "STOP_TIMER_AUTOMATION_IFRAME"
                                });
                                
                                console.log("[Wrapper] Stop command forwarded to iframe");
                                console.log("[Wrapper] EXITING - wrapper execution complete");
                                
                                payload = {
                                    status: "OK",
                                    action: "STOP_TIMER_AUTOMATION",
                                    message: "Stop command forwarded to game iframe"
                                };
                                sendResponse(payload);
                            }).catch(err => {
                                console.error("[STOP_TIMER_AUTOMATION] Failed to find game iframe:", err);
                                console.log("[Wrapper] EXITING with error - wrapper execution complete");
                                payload = {
                                    status: "ERROR",
                                    action: "STOP_TIMER_AUTOMATION",
                                    message: "Failed to find game iframe: " + err.message
                                };
                                sendResponse(payload);
                            });
                            return; // CRITICAL: Return immediately - wrapper will never continue to stop code
                        }

                        if(globalThis.__timerObserver){
                            globalThis.__timerObserver.disconnect();
                            globalThis.__timerObserver = null;
                        }

                        globalThis.__timerAutomationActive = false;
                        AutomationState.timerAutomationEnabled = false;
                        SessionState.status = "stopped";
                        
                        // CRITICAL FIX: Clear session to invalidate old session events
                        clearSession();
                        
                        // Clear all pending transition state
                        AutomationState.lastOutcomeProcessedPeriodId = null;
                        AutomationState.lastProcessedPeriodId = null;
                        SessionState.processedCompletions = [];
                        
                        publishSessionState();
                        publishAutomationRuntimeState();

                        console.log("[Automation] Timer automation stopped");

                        payload = {
                            status: "OK",
                            action: "STOP_TIMER_AUTOMATION",
                            message: "Timer automation stopped"
                        };

                    } else {

                        payload = {
                            status: "UNKNOWN_ACTION",
                            action: message.action
                        };
                    }

                    sendResponse(payload);

                } catch (error) {

                    console.error(error);

                    sendResponse({
                        status: "ERROR",
                        message: error.message
                    });
                }

            })();

            return true;
        }
    );
}
