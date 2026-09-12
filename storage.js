/**
 * LogicPilot AI authentication storage helpers.
 *
 * This module is intentionally small and dependency-free. It is the only place
 * in the authentication layer that knows the exact chrome.storage.local keys
 * used for saved session data.
 */

export const STORAGE_KEYS = Object.freeze({
    authToken: "logicpilot.auth.token",
    tokenType: "logicpilot.auth.tokenType",
    currentUser: "logicpilot.auth.currentUser",
    subscription: "logicpilot.auth.subscription",
    hardwareId: "logicpilot.device.hardwareId",
    automationDisabled: "logicpilot.automation.disabled",
    lastHeartbeatAt: "logicpilot.auth.lastHeartbeatAt",
    lastCommands: "logicpilot.auth.lastCommands",
    // Coordination state keys
    coordinationMode: "logicpilot.coordination.mode",
    coordinationDeviceId: "logicpilot.coordination.deviceId",
    coordinationSessionId: "logicpilot.coordination.sessionId",
    coordinationAuthorityId: "logicpilot.coordination.authorityId",
    coordinationConnectionStatus: "logicpilot.coordination.connectionStatus",
    coordinationSessionState: "logicpilot.coordination.sessionState"
});

export function getLocal(keys = null) {
    return new Promise((resolve, reject) => {
        chrome.storage.local.get(keys, (items) => {
            const error = chrome.runtime.lastError;

            if (error) {
                reject(new Error(error.message));
                return;
            }

            resolve(items || {});
        });
    });
}

export function setLocal(items) {
    return new Promise((resolve, reject) => {
        chrome.storage.local.set(items, () => {
            const error = chrome.runtime.lastError;

            if (error) {
                reject(new Error(error.message));
                return;
            }

            resolve();
        });
    });
}

export function removeLocal(keys) {
    return new Promise((resolve, reject) => {
        chrome.storage.local.remove(keys, () => {
            const error = chrome.runtime.lastError;

            if (error) {
                reject(new Error(error.message));
                return;
            }

            resolve();
        });
    });
}

export async function saveAuthToken(token, tokenType = "Bearer") {
    console.log("[STORAGE] STEP 1: saveAuthToken called", { tokenLength: token?.length, tokenType });
    if (!token || typeof token !== "string") {
        throw new Error("A valid auth token is required.");
    }

    console.log("[STORAGE] STEP 2: Saving token to chrome.storage.local");
    await setLocal({
        [STORAGE_KEYS.authToken]: token,
        [STORAGE_KEYS.tokenType]: tokenType || "Bearer"
    });
    console.log("[STORAGE] STEP 3: Token saved successfully");
}

export async function getAuthToken() {
    const items = await getLocal(STORAGE_KEYS.authToken);
    return items[STORAGE_KEYS.authToken] || null;
}

export async function getTokenType() {
    const items = await getLocal(STORAGE_KEYS.tokenType);
    return items[STORAGE_KEYS.tokenType] || "Bearer";
}

export async function saveCurrentUser(user) {
    console.log("[STORAGE] STEP 1: saveCurrentUser called", user);
    await setLocal({ [STORAGE_KEYS.currentUser]: user || null });
    console.log("[STORAGE] STEP 2: User saved successfully");
}

export async function getCurrentUser() {
    const items = await getLocal(STORAGE_KEYS.currentUser);
    return items[STORAGE_KEYS.currentUser] || null;
}

export async function saveSubscription(subscription) {
    console.log("[STORAGE] STEP 1: saveSubscription called", subscription);
    await setLocal({ [STORAGE_KEYS.subscription]: subscription || null });
    console.log("[STORAGE] STEP 2: Subscription saved successfully");
}

export async function getSubscription() {
    const items = await getLocal(STORAGE_KEYS.subscription);
    return items[STORAGE_KEYS.subscription] || null;
}

export async function getHardwareId() {
    const items = await getLocal(STORAGE_KEYS.hardwareId);
    const existing = items[STORAGE_KEYS.hardwareId];

    if (typeof existing === "string" && existing.trim()) {
        return existing;
    }

    const generated =
        globalThis.crypto?.randomUUID?.() ||
        `logicpilot-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    await setLocal({ [STORAGE_KEYS.hardwareId]: generated });

    return generated;
}

export async function setAutomationDisabled(value, reason = "") {
    await setLocal({
        [STORAGE_KEYS.automationDisabled]: {
            disabled: Boolean(value),
            reason,
            updatedAt: new Date().toISOString()
        }
    });
}

export async function getAutomationDisabled() {
    const items = await getLocal(STORAGE_KEYS.automationDisabled);
    return items[STORAGE_KEYS.automationDisabled] || {
        disabled: false,
        reason: ""
    };
}

export async function clearAuthStorage() {
    await removeLocal([
        STORAGE_KEYS.authToken,
        STORAGE_KEYS.tokenType,
        STORAGE_KEYS.currentUser,
        STORAGE_KEYS.subscription,
        STORAGE_KEYS.lastHeartbeatAt,
        STORAGE_KEYS.lastCommands
    ]);
}

export async function getAuthSnapshot() {
    const items = await getLocal([
        STORAGE_KEYS.authToken,
        STORAGE_KEYS.tokenType,
        STORAGE_KEYS.currentUser,
        STORAGE_KEYS.subscription
    ]);

    return {
        token: items[STORAGE_KEYS.authToken] || null,
        tokenType: items[STORAGE_KEYS.tokenType] || "Bearer",
        user: items[STORAGE_KEYS.currentUser] || null,
        subscription: items[STORAGE_KEYS.subscription] || null
    };
}

// Coordination state management functions
export async function getCoordinationMode() {
    const items = await getLocal(STORAGE_KEYS.coordinationMode);
    return items[STORAGE_KEYS.coordinationMode] || null;
}

export async function setCoordinationMode(mode) {
    if (!['authority', 'worker'].includes(mode)) {
        throw new Error("Invalid coordination mode. Must be 'authority' or 'worker'.");
    }
    await setLocal({ [STORAGE_KEYS.coordinationMode]: mode });
}

export async function getCoordinationDeviceId() {
    const items = await getLocal(STORAGE_KEYS.coordinationDeviceId);
    const existing = items[STORAGE_KEYS.coordinationDeviceId];

    if (typeof existing === "string" && existing.trim()) {
        return existing;
    }

    // Generate device ID if not exists
    const generated = generateDeviceId();
    await setLocal({ [STORAGE_KEYS.coordinationDeviceId]: generated });
    return generated;
}

function generateDeviceId() {
    // Generate a 4-character device ID like "A7K9-X2P4"
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No I, O, 0, 1 for clarity
    const segment1 = Array.from({length: 4}, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    const segment2 = Array.from({length: 4}, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    return `${segment1}-${segment2}`;
}

export async function getCoordinationSessionId() {
    const items = await getLocal(STORAGE_KEYS.coordinationSessionId);
    return items[STORAGE_KEYS.coordinationSessionId] || null;
}

export async function setCoordinationSessionId(sessionId) {
    await setLocal({ [STORAGE_KEYS.coordinationSessionId]: sessionId });
}

export async function getCoordinationAuthorityId() {
    const items = await getLocal(STORAGE_KEYS.coordinationAuthorityId);
    return items[STORAGE_KEYS.coordinationAuthorityId] || null;
}

export async function setCoordinationAuthorityId(authorityId) {
    await setLocal({ [STORAGE_KEYS.coordinationAuthorityId]: authorityId });
}

export async function getCoordinationConnectionStatus() {
    const items = await getLocal(STORAGE_KEYS.coordinationConnectionStatus);
    return items[STORAGE_KEYS.coordinationConnectionStatus] || 'disconnected';
}

export async function setCoordinationConnectionStatus(status) {
    const validStatuses = ['disconnected', 'connecting', 'connected', 'removed'];
    if (!validStatuses.includes(status)) {
        throw new Error("Invalid connection status");
    }
    await setLocal({ [STORAGE_KEYS.coordinationConnectionStatus]: status });
}

export async function getCoordinationSessionState() {
    const items = await getLocal(STORAGE_KEYS.coordinationSessionState);
    return items[STORAGE_KEYS.coordinationSessionState] || null;
}

export async function setCoordinationSessionState(state) {
    await setLocal({ [STORAGE_KEYS.coordinationSessionState]: state });
}

export async function clearCoordinationState() {
    await removeLocal([
        STORAGE_KEYS.coordinationSessionId,
        STORAGE_KEYS.coordinationAuthorityId,
        STORAGE_KEYS.coordinationConnectionStatus,
        STORAGE_KEYS.coordinationSessionState
    ]);
}
