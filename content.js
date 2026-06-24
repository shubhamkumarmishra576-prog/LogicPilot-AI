console.log("LOGICPILOT CONTENT LOADED");

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

    function initializeTimerMonitoring(strategyData, totalAttempts) {

        console.log("[Timer] Initializing timer monitoring...");

        let timerTriggeredThisRound = false;

        const timerElement = document.querySelector('.TimeLeft__C');

        if(!timerElement) {
            console.error("[Timer] Timer element not found");
            return null;
        }

        const observer = new MutationObserver(async () => {

            const timerText = timerElement.textContent.trim();

            // Check if timer is at 00:20
            if(timerText === '00:20' && !timerTriggeredThisRound && Engine && Engine.timerAutomationEnabled) {

                timerTriggeredThisRound = true;

                console.log("[Timer] ✓ Timer hit 00:20 - executing automation");

                try {

                    // Get latest result from previous round
                    const latestResult = await getLatestResult();

                    if(!latestResult) {
                        console.warn("[Timer] Could not get latest result, skipping round");
                        return;
                    }

                    // Update Engine with outcome
                    Engine.updateOutcome(latestResult);

                    // Calculate next move using Engine
                    const nextMove = Engine.calculateNextMove(strategyData, totalAttempts);

                    if(!nextMove) {
                        console.error("[Timer] Failed to calculate next move");
                        return;
                    }

                    // Store bet details before execution
                    const betTarget = nextMove.choice === 'big' ? 'Big' : 'Small';
                    Engine.updateBetState(betTarget, nextMove.amount);

                    // Execute the bet
                    const result = await executeBet(nextMove.choice, nextMove.amount);

                    if(result.success) {
                        console.log("[Timer] ✅ Automation round complete");
                    } else {
                        console.error("[Timer] Bet execution failed:", result.error);
                    }

                } catch(error) {

                    console.error("[Timer] Error in automation flow:", error.message);

                }

            }

            // Reset flag when timer changes from 00:20
            if(timerText !== '00:20' && timerTriggeredThisRound) {
                timerTriggeredThisRound = false;
                console.log("[Timer] New round detected");
            }

        });

        observer.observe(timerElement, {
            characterData: true,
            subtree: true,
            childList: false
        });

        console.log("[Timer] Timer monitoring started");

        return observer;

    }

    function monitorTimer(callback) {

        const timerElement = document.querySelector(
            ".TimeLeft__C-time"
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

    function getLatestResult() {

        try {

            const resultElement = document.querySelector(
                ".record-body .van-row:first-child .van-col.van-col--5 span"
            );

            if(!resultElement){
                console.warn("[Result] Result element not found");
                return null;
            }

            const result = resultElement.textContent.trim();

            if(result === "Big" || result === "Small"){
                console.log("[Result] Latest result:", result);
                return result;
            }

            console.warn("[Result] Unexpected result value:", result);
            return null;

        } catch(error){

            console.error("[Result] Error reading result:", error);
            return null;

        }

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
                        message.action === "START_TIMER_AUTOMATION"
                    ) {

                        if(!globalThis.__timerAutomationActive){

                            globalThis.__timerAutomationActive = true;

                            const strategyData = message.strategyData;
                            const totalAttempts = message.totalAttempts;

                            console.log("[Automation] Starting with strategy:", strategyData);

                            globalThis.__timerObserver = monitorTimer(async () => {

                                console.log("[Automation] Timer callback triggered");

                                try {

                                    // Get current move from strategy
                                    const nextMove = Engine.getNextMove(strategyData);

                                    if(!nextMove){
                                        console.error("[Automation] Failed to get next move");
                                        return;
                                    }

                                    // Execute the bet
                                    const betResult = await executeBetSequence(
                                        nextMove.choice,
                                        nextMove.amount
                                    );

                                    if(betResult.success){

                                        // Store the bet details
                                        Engine.recordBet(
                                            nextMove.choice,
                                            nextMove.amount
                                        );

                                        console.log("[Automation] Bet recorded. Waiting for result...");

                                        // Wait a moment for result to appear
                                        await new Promise(resolve => setTimeout(resolve, 1000));

                                        // Read the result
                                        const result = getLatestResult();

                                        if(result){
                                            Engine.lastResult = result;
                                            console.log("[Automation] Result stored:", result);
                                        }

                                        // Check if we've reached max attempts
                                        if(Engine.currentAttempt > totalAttempts){
                                            console.log("[Automation] Max attempts reached, resetting");
                                            Engine.currentAttempt = 1;
                                        }

                                    } else {

                                        console.error("[Automation] Bet failed:", betResult.error);

                                    }

                                } catch(error){

                                    console.error("[Automation] Error in timer callback:", error.message);

                                }

                            });

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
                        Engine.timerAutomationActive = false;

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