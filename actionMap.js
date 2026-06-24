export const actionMap = {

    ACTION_PRIMARY: async (
        step
    ) => {

        console.log(
            "Executing ACTION_PRIMARY",
            step
        );

        const strategy = step.strategy;

        if (!strategy) {
            console.error("No strategy data found in step");
            return;
        }

        const choice = strategy.choice || "big";
        const amount = strategy.amount || 10;

        console.log("Placing bet:", { choice, amount });

        const message = {
            action: "PLACE_BET",
            choice: choice,
            amount: amount
        };

        const result = await sendToActiveTab(message);

        if (result.error) {
            console.error("Failed to place bet:", result.error);
        } else {
            console.log("Bet placed successfully:", result.response);
       }
    },

    ACTION_SECONDARY: async (
        step
    ) => {

        console.log(
            "Executing ACTION_SECONDARY",
            step
        );

        const strategy = step.strategy;

        if (!strategy) {
            console.error("No strategy data found in step");
            return;
        }

        const choice = strategy.choice || "small";
        const amount = strategy.amount || 20;

        console.log("Placing bet:", { choice, amount });

        const message = {
            action: "PLACE_BET",
            choice: choice,
            amount: amount
        };

        const result = await sendToActiveTab(message);

        if (result.error) {
            console.error("Failed to place bet:", result.error);
        } else {
            console.log("Bet placed successfully:", result.response);
        }
    }
};

async function sendToActiveTab(message) {
    return new Promise((resolve) => {
        chrome.tabs.query(
            { active: true, lastFocusedWindow: true },
            async (tabs) => {
                const tab = tabs[0];

                if (!tab?.id) {
                    resolve({ error: "NO_TAB" });
                    return;
                }

                const url = tab.url;
                const isSupported = url && (
                    url.includes("damanworld.org") ||
                    url.includes("damanapp.download")
                    
                );

                if (!isSupported) {
                    resolve({ error: "UNSUPPORTED_URL", url });
                    return;
                }

                if (url.startsWith("chrome://") ||
                    url.startsWith("chrome-extension://") ||
                    url.startsWith("edge://") ||
                    url.startsWith("about:") ||
                    url.startsWith("devtools://")) {
                    resolve({ error: "RESTRICTED_URL", url });
                    return;
                }

                try {
                    const response = await chrome.tabs.sendMessage(tab.id, message);
                    resolve({ ok: true, response });
                } catch (error) {
                    if (error.message.includes("Receiving end does not exist") ||
                        error.message.includes("Could not establish connection")) {
                        try {
                            await chrome.scripting.executeScript({
                                target: { tabId: tab.id },
                                files: ["content.js"]
                            });
                            const response = await chrome.tabs.sendMessage(tab.id, message);
                            resolve({ ok: true, response });
                        } catch (injectError) {
                            resolve({ error: error.message, injectError: injectError.message });
                        }
                    } else {
                        resolve({ error: error.message });
                    }
                }
            }
        );
    });
}