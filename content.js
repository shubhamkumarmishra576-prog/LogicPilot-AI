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