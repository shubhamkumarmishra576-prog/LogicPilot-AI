console.log("LOGICPILOT CONTENT LOADED");

// Local automation state - content script manages its own state
const AutomationState = {
    currentAttempt: 1,
    lastResult: null,
    lastBetTarget: null,
    lastBetAmount: null,
    lastProcessedPeriodId: null,
    timerAutomationEnabled: false
};

// #region agent log
fetch('http://127.0.0.1:7391/ingest/de6115f7-dc0a-4377-999c-10b7507a1859',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'ef7d33'},body:JSON.stringify({sessionId:'ef7d33',location:'content.js:top',message:'content script injected',data:{href:location.href,host:location.hostname,hash:location.hash,bodyCount:document.querySelectorAll('*').length,bigBtnCount:document.querySelectorAll('.Betting__C-foot-b').length},timestamp:Date.now(),hypothesisId:'A',runId:'pre-fix'})}).catch(()=>{});
// #endregion

if (!globalThis.__logicPilotRouteWatcherRegistered) {
    globalThis.__logicPilotRouteWatcherRegistered = true;

    window.addEventListener("hashchange", () => {
        console.log("LOGICPILOT ROUTE CHANGED:", location.href);
        // #region agent log
        fetch('http://127.0.0.1:7391/ingest/de6115f7-dc0a-4377-999c-10b7507a1859',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'ef7d33'},body:JSON.stringify({sessionId:'ef7d33',location:'content.js:hashchange',message:'spa route changed',data:{href:location.href,hash:location.hash,bigBtnCount:document.querySelectorAll('.Betting__C-foot-b').length},timestamp:Date.now(),hypothesisId:'E',runId:'post-fix'})}).catch(()=>{});
        // #endregion
    });
}

if (!globalThis.__logicPilotMessageListenerRegistered) {

    globalThis.__logicPilotMessageListenerRegistered = true;

    async function waitForElement(selector, maxAttempts = 30, delay = 500) {

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {

            const element = document.querySelector(selector);

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

        console.log(
    "BIG VISIBLE:",
    !!document.querySelector(".Betting__C-foot-b")
);

console.log(
    "ALL MATCHES:",
    document.querySelectorAll(".Betting__C-foot-b").length
);

        console.log(
            "CONTENT URL:",
            location.href
        );

        console.log(
            "BODY COUNT:",
            document.querySelectorAll("*").length
        );

        const btn = await waitForElement(
            ".Betting__C-foot-b"
        );

        // #region agent log
        fetch('http://127.0.0.1:7391/ingest/de6115f7-dc0a-4377-999c-10b7507a1859',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'ef7d33'},body:JSON.stringify({sessionId:'ef7d33',location:'content.js:clickBigButton',message:'click big result',data:{href:location.href,found:!!btn,allMatches:document.querySelectorAll('.Betting__C-foot-b').length,bodyCount:document.querySelectorAll('*').length},timestamp:Date.now(),hypothesisId:'E',runId:'post-fix'})}).catch(()=>{});
        // #endregion

        if (btn) {

            btn.click();

            console.log("BIG CLICKED");

            return {
                clicked: true,
                selector: ".Betting__C-foot-b"
            };
        }

        console.log("BIG BUTTON NOT FOUND");

        return {
            clicked: false
        };
    }

    async function clickSmallButton() {

        const btn = await waitForElement(
            ".Betting__C-foot-s"
        );

        if (btn) {

            btn.click();

            console.log("SMALL CLICKED");

            return {
                clicked: true,
                selector: ".Betting__C-foot-s"
            };
        }

        console.log("SMALL BUTTON NOT FOUND");

        return {
            clicked: false
        };
    }

    async function executeBet(target, amount) {

        console.log(
            "[executeBet] Starting execution:",
            { target, amount }
        );

        try {

            if(!['big', 'small'].includes(target.toLowerCase())) {
                throw new Error("Invalid target: " + target);
            }

            if(!Number.isInteger(amount) || amount <= 0) {
                throw new Error("Invalid amount: " + amount);
            }

            // Step 1: Click the correct button
            const buttonSelector = target.toLowerCase() === 'big'
                ? '.Betting__C-foot-b'
                : '.Betting__C-foot-s';

            const btn = await waitForElement(buttonSelector, 30, 300);

            if(!btn) {
                throw new Error("Button not found: " + buttonSelector);
            }

            console.log("[executeBet] Clicking", target, "button");
            btn.click();

            // Step 2: Wait for amount input to appear
            await new Promise(resolve => setTimeout(resolve, 400));

            // Step 3: Find and fill amount input
            const amountInput = document.querySelector('input[type="number"]');

            if(amountInput) {
                console.log("[executeBet] Setting amount to", amount);
                amountInput.value = '';
                amountInput.focus();
                amountInput.value = String(amount);
                amountInput.dispatchEvent(new Event('input', { bubbles: true }));
                amountInput.dispatchEvent(new Event('change', { bubbles: true }));
            } else {
                console.warn("[executeBet] Amount input not found");
            }

            // Step 4: Wait for input to register
            await new Promise(resolve => setTimeout(resolve, 300));

            // Step 5: Click submit button
            const submitBtn = document.querySelector('button.bet-amount');

            if(!submitBtn) {
                throw new Error("Submit button not found");
            }

            console.log("[executeBet] Clicking submit button");
            submitBtn.click();

            // Step 6: Wait for submission
            await new Promise(resolve => setTimeout(resolve, 500));

            console.log("[executeBet] ✅ Bet executed successfully");

            return { success: true, target, amount };

        } catch(error) {

            console.error("[executeBet] ❌ Error:", error.message);

            return { success: false, error: error.message };

        }

    }

    async function getLatestResult() {

        try {

            const recordBody = document.querySelector('.record-body');

            if(!recordBody) {
                console.warn("[getLatestResult] Record body not found");
                return null;
            }

            const latestRow = recordBody.querySelector('.van-row');

            if(!latestRow) {
                console.warn("[getLatestResult] No records found");
                return null;
            }

            const resultElement = latestRow.querySelector('.van-col.van-col--5 span');

            if(!resultElement) {
                console.warn("[getLatestResult] Result element not found");
                return null;
            }

            const result = resultElement.textContent.trim();

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

    function calculateNextMove(strategyData, totalAttempts) {
        console.log("[Timer] calculateNextMove called - currentAttempt:", AutomationState.currentAttempt, "totalAttempts:", totalAttempts);
        
        if(!strategyData){
            console.error("[Timer] No strategy data");
            return null;
        }

        console.log("[Timer] Strategy data keys:", Object.keys(strategyData));

        if(AutomationState.currentAttempt > totalAttempts){
            console.log("[Timer] Max attempts reached, resetting from", AutomationState.currentAttempt, "to 1");
            AutomationState.currentAttempt = 1;
        }

        // Determine if we won or lost
        const isWin = AutomationState.lastBetTarget === AutomationState.lastResult;
        const outcome = isWin ? "WIN" : "LOSS";

        console.log("[Timer] Bet target:", AutomationState.lastBetTarget, "| Latest result:", AutomationState.lastResult, "| Outcome:", outcome);

        // BASE STRATEGY (Attempt 1)
        if(AutomationState.currentAttempt === 1){
            const attempt1 = strategyData[1];
            if(!attempt1){
                console.error("[Timer] Attempt 1 not found in strategy");
                return null;
            }
            
            if(isWin){
                console.log("[Recovery] Still Winning - Continuing Base Strategy - Attempt = 1");
            } else {
                console.log("[Recovery] First LOSS - Entering Recovery Mode - Moving to Attempt 2");
                AutomationState.currentAttempt = 2;
            }
            
            console.log("[Timer] ✓ Using Attempt 1 config:", attempt1);
            return attempt1;
        }

        // RECOVERY MODE (Attempts 2+)
        const currentAttemptConfig = strategyData[AutomationState.currentAttempt];

        console.log("[Timer] Current attempt index:", AutomationState.currentAttempt, "config:", currentAttemptConfig);

        if(!currentAttemptConfig){
            console.error("[Timer] Current attempt config not found at index", AutomationState.currentAttempt);
            return null;
        }

        if(isWin){
            // Recovery WIN - Exit recovery mode, return to base strategy
            console.log("[Recovery] Recovery WIN - Resetting to Attempt 1");
            AutomationState.currentAttempt = 1;
            const attempt1 = strategyData[1];
            if(!attempt1){
                console.error("[Timer] Attempt 1 not found in strategy");
                return null;
            }
            console.log("[Timer] ✓ Returning to Base Strategy - Attempt 1 config:", attempt1);
            return attempt1;
        } else {
            // Recovery LOSS - Advance to next recovery attempt
            console.log("[Recovery] Recovery LOSS - Moving to Attempt", AutomationState.currentAttempt + 1);
            AutomationState.currentAttempt++;
            
            // Check if we've exceeded max attempts
            if(AutomationState.currentAttempt > totalAttempts){
                console.log("[Timer] Max attempts reached, resetting to Attempt 1");
                AutomationState.currentAttempt = 1;
                const attempt1 = strategyData[1];
                if(!attempt1){
                    console.error("[Timer] Attempt 1 not found in strategy");
                    return null;
                }
                console.log("[Timer] ✓ Using Attempt 1 config after max attempts:", attempt1);
                return attempt1;
            }
            
            const nextAttemptConfig = strategyData[AutomationState.currentAttempt];
            if(!nextAttemptConfig){
                console.error("[Timer] Next attempt config not found at index", AutomationState.currentAttempt);
                return null;
            }
            
            const nextConfig = nextAttemptConfig.onLoss;
            if(!nextConfig){
                console.error("[Timer] No onLoss config found in attempt", AutomationState.currentAttempt);
                return null;
            }
            
            console.log("[Timer] ✓ Next move from LOSS branch - Attempt", AutomationState.currentAttempt, "config:", nextConfig);
            return nextConfig;
        }
    }

    function initializeTimerMonitoring(strategyData, totalAttempts) {

        console.log("[Timer] Initializing timer monitoring...");

        let timerTriggeredThisRound = false;
        let lastProcessedPeriodId = AutomationState.lastProcessedPeriodId || null;

        const timerElement = document.querySelector('.TimeLeft__C');
        const periodIdElement = document.querySelector('.TimeLeft__C-id');

        if(!timerElement) {
            console.error("[Timer] Timer element not found");
            return null;
        }

        const observer = new MutationObserver(async () => {

            // Read timer from child divs
            const timerDivs = timerElement.querySelectorAll('div');
            let timerValue = '';
            timerDivs.forEach(div => {
                timerValue += div.textContent.trim();
            });
            
            // Check if timer is at 20 (last two digits)
            const isAt20 = timerValue.endsWith('20');

            // Read current period ID
            const currentPeriodId = periodIdElement ? periodIdElement.textContent.trim() : null;

            // Check if period ID changed
            const periodChanged = currentPeriodId && currentPeriodId !== lastProcessedPeriodId;

            // Log monitoring state
            if(isAt20 || periodChanged) {
                console.log("[Timer] Monitoring - Timer:", timerValue, "| Period ID:", currentPeriodId, "| Last Period:", lastProcessedPeriodId, "| Period Changed:", periodChanged, "| Timer at 20:", isAt20, "| Triggered:", timerTriggeredThisRound, "| Enabled:", AutomationState.timerAutomationEnabled);
            }

            if(isAt20 && periodChanged && !timerTriggeredThisRound && AutomationState.timerAutomationEnabled) {

                timerTriggeredThisRound = true;

                console.log("[Timer] ✓ Timer hit 00:20 - executing automation");

                try {

                    let nextMove;

                    // First round - use Attempt 1 config directly
                    if(AutomationState.currentAttempt === 1) {
                        console.log("[Timer] First round - using Attempt 1 config");
                        nextMove = strategyData[1];
                        if(!nextMove) {
                            console.error("[Timer] Attempt 1 config not found");
                            return;
                        }
                    } else {
                        // Subsequent rounds - check previous result
                        const latestResult = await getLatestResult();

                        if(!latestResult) {
                            console.warn("[Timer] Could not get latest result, skipping round");
                            return;
                        }

                        // Update state with outcome
                        AutomationState.lastResult = latestResult;

                        // Calculate next move using local logic
                        nextMove = calculateNextMove(strategyData, totalAttempts);

                        if(!nextMove) {
                            console.error("[Timer] Failed to calculate next move");
                            return;
                        }
                    }

                    // Store bet details before execution
                    const betTarget = nextMove.choice === 'big' ? 'Big' : 'Small';
                    AutomationState.lastBetTarget = betTarget;
                    AutomationState.lastBetAmount = nextMove.amount;

                    // Execute the bet
                    const result = await executeBet(nextMove.choice, nextMove.amount);

                    if(result.success) {
                        console.log("[Timer] ✅ Automation round complete");
                        
                        // Update processed period ID
                        if(currentPeriodId) {
                            AutomationState.lastProcessedPeriodId = currentPeriodId;
                            lastProcessedPeriodId = currentPeriodId;
                            console.log("[Timer] Period ID updated:", currentPeriodId);
                        }
                        
                        // Wait for result to appear
                        await new Promise(resolve => setTimeout(resolve, 1000));
                        
                        // Read and store result for next round
                        const latestResult = await getLatestResult();
                        if(latestResult) {
                            AutomationState.lastResult = latestResult;
                            console.log("[Timer] Result stored for next round:", latestResult);
                        }
                        
                        // currentAttempt is now managed by calculateNextMove based on WIN/LOSS
                        // No automatic increment here

                        // Send currentAttempt update to popup for UI synchronization
                        chrome.runtime.sendMessage({
                            action: "UPDATE_CURRENT_ATTEMPT",
                            currentAttempt: AutomationState.currentAttempt
                        }).catch(err => {
                            console.log("[Timer] Failed to send currentAttempt update to popup:", err);
                        });
                    } else {
                        console.error("[Timer] Bet execution failed:", result.error);
                    }

                } catch(error) {

                    console.error("[Timer] Error in automation flow:", error.message);

                }

            }

            // Reset flag when timer changes from 20
            if(!isAt20 && timerTriggeredThisRound) {
                timerTriggeredThisRound = false;
                console.log("[Timer] Timer changed from 20");
            }

        });

        observer.observe(timerElement, {
            characterData: true,
            subtree: true,
            childList: true
        });

        console.log("[Timer] ✓ Timer monitoring started - Observer configured with characterData, subtree, childList");
        console.log("[Timer] Monitoring timer element:", timerElement, "| Period element:", periodIdElement);

        return observer;

    }

    function monitorTimer(callback) {

        const timerElement = document.querySelector(
            ".TimeLeft__C"
        );

        if(!timerElement){
            console.error("[Timer] Timer element not found");
            return null;
        }

        let hasTriggered = false;

        const observer = new MutationObserver(() => {

            const timerText = timerElement.textContent.trim();

            if(timerText === "00:20" && !hasTriggered){

                hasTriggered = true;

                console.log("[Timer] ✅ Timer hit 00:20");

                callback();

            } else if(timerText !== "00:20" && hasTriggered){

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

                        const choice = message.choice;
                        const amount = message.amount;

                        console.log("[PLACE_BET] Executing bet:", { choice, amount });

                        const result = await executeBet(choice, amount);

                        payload = {
                            status: "OK",
                            action: "PLACE_BET",
                            result: result
                        };

                    } else if (
                        message.action === "START_TIMER_AUTOMATION"
                    ) {

                        // Disconnect existing observer if present (prevent memory leak)
                        if(globalThis.__timerObserver){
                            console.log("[Automation] Disconnecting existing observer before creating new one");
                            globalThis.__timerObserver.disconnect();
                            globalThis.__timerObserver = null;
                        }

                        if(!globalThis.__timerAutomationActive){

                            globalThis.__timerAutomationActive = true;
                            AutomationState.timerAutomationEnabled = true;

                            const strategyData = message.strategyData;
                            const totalAttempts = message.totalAttempts;

                            console.log("[Automation] Starting with strategy:", strategyData);

                            globalThis.__timerObserver = initializeTimerMonitoring(strategyData, totalAttempts);

                            payload = {
                                status: "OK",
                                action: "START_TIMER_AUTOMATION",
                                message: "Timer automation started"
                            };

                        } else {

                            payload = {
                                status: "OK",
                                message: "Timer automation already running"
                            };

                        }

                    } else if (
                        message.action === "STOP_TIMER_AUTOMATION"
                    ) {

                        if(globalThis.__timerObserver){
                            globalThis.__timerObserver.disconnect();
                            globalThis.__timerObserver = null;
                        }

                        globalThis.__timerAutomationActive = false;
                        AutomationState.timerAutomationEnabled = false;

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