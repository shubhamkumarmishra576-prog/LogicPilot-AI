export function isRestrictedTabUrl(url) {
    if (!url) {
        return true;
    }
    return (
        url.startsWith("chrome://") ||
        url.startsWith("chrome-extension://") ||
        url.startsWith("edge://") ||
        url.startsWith("about:") ||
        url.startsWith("devtools://")
    );
}

export function isSupportedTabUrl(url) {
    if (!url) {
        return false;
    }
    try {
        const parsed = new URL(url);
        return (
            parsed.hostname === "damanworld.org" ||
            parsed.hostname === "damanapp.download"
        );
    } catch {
        return false;
    }
}

export function isMissingContentScriptError(errorMessage) {
    return (
        errorMessage.includes("Receiving end does not exist") ||
        errorMessage.includes("Could not establish connection") ||
        errorMessage === "MESSAGE_TIMEOUT"
    );
}

export function sendMessageToTab(tabId, message, timeout = 5000) {
    return new Promise((resolve) => {
        const timeoutId = setTimeout(() => {
            resolve({ ok: false, error: "MESSAGE_TIMEOUT" });
        }, timeout);

        chrome.tabs.sendMessage(tabId, message, (response) => {
            clearTimeout(timeoutId);
            const lastError = chrome.runtime.lastError;
            if (lastError) {
                resolve({ ok: false, error: lastError.message });
            } else {
                resolve({ ok: true, response });
            }
        });
    });
}

export async function sendToActiveTab(message) {
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
                const urlSupported = isSupportedTabUrl(url);

                if (!urlSupported) {
                    resolve({ error: "UNSUPPORTED_URL", url });
                    return;
                }

                if (isRestrictedTabUrl(url)) {
                    resolve({ error: "RESTRICTED_URL", url });
                    return;
                }

                let result = await sendMessageToTab(tab.id, message);

                if (!result.ok && isMissingContentScriptError(result.error)) {
                    try {
                        await chrome.scripting.executeScript({
                            target: { tabId: tab.id },
                            files: ["content.js"]
                        });
                        result = await sendMessageToTab(tab.id, message);
                    } catch (injectError) {
                        resolve({
                            error: result.error,
                            url: tab.url,
                            injectError: injectError.message
                        });
                        return;
                    }
                }

                if (!result.ok) {
                    resolve({ error: result.error, url: tab.url });
                } else {
                    resolve({ response: result.response, url: tab.url });
                }
            }
        );
    });
}
