import {

    engineState,

    startEngine,

    pauseEngine,

    stopEngine

} from "./workflowEngine.js";

import { sendToActiveTab, isSupportedTabUrl, isRestrictedTabUrl, sendMessageToTab, isMissingContentScriptError } from "./messaging.js";
import {
    autoLogin,
    login as blackFoxLogin,
    logout as blackFoxLogout,
    register as blackFoxRegister,
    restoreSession
} from "./auth.js";
import {
    getCoordinationMode,
    setCoordinationMode,
    getCoordinationDeviceId,
    getCoordinationSessionId,
    setCoordinationSessionId,
    getCoordinationAuthorityId,
    setCoordinationAuthorityId,
    getCoordinationConnectionStatus,
    setCoordinationConnectionStatus,
    getCoordinationSessionState,
    setCoordinationSessionState,
    clearCoordinationState
} from "./storage.js";
import { heartbeat } from "./heartbeat.js";
import { getSubscriptionStatus as fetchSubscriptionStatus } from "./subscription.js";
import { getAutomationDisabled } from "./storage.js";

// Import AI prediction modules
import { HistoryCollector } from "./ai/historyCollector.js";
import { FeatureEngine } from "./ai/featureEngine.js";
import { PredictionEngine } from "./ai/predictionEngine.js";
import { AccuracyTracker } from "./ai/accuracyTracker.js";
import { Backtester } from "./ai/backtester.js";

let logicData = {}; // Multi-logic structure: {1: {logicId, attempts: {...}}, 2: {logicId, attempts: {...}}, ...}
let activeLogicId = 1;
let currentLogicPosition = 0;
let lastExecutionPlan = {
    executionOrder: [],
    shuffleEnabled: false,
    shuffleFrom: 1,
    shuffleTo: 1
};
const POPUP_STATE_KEY = "logicpilot.popup.state";
const ATTEMPT_STRATEGY_STORAGE_KEY = "logicPilotAttemptStrategy";
let flipSettings = {
    manualFlip: { targetLogicId: null },
    autoFlip1: { enabled: false, targetLogicId: null, minutes: 10 },
    autoFlip2: { enabled: false, targetLogicId: null, attempt: 5 },
    shuffleFlip: { enabled: false, wins: 3, losses: 5, triggerType: "win" },
    flipRecoveryMode: "reset" // Options: "reset", "carry_attempt", "carry_attempt_amount"
};

function getDefaultFlipSettings() {
    return {
        manualFlip: { targetLogicId: null },
        autoFlip1: { enabled: false, targetLogicId: null, minutes: 10 },
        autoFlip2: { enabled: false, targetLogicId: null, attempt: 5 },
        shuffleFlip: { enabled: false, wins: 3, losses: 5, triggerType: "win" },
        flipRecoveryMode: "reset"
    };
}

function normalizeFlipSettings(settings = {}) {
    const defaults = getDefaultFlipSettings();
    const savedSettings = settings && typeof settings === "object" ? settings : {};

    return {
        manualFlip: {
            ...defaults.manualFlip,
            ...(savedSettings.manualFlip || {})
        },
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
        },
        flipRecoveryMode:
            savedSettings.flipRecoveryMode ||
            defaults.flipRecoveryMode
    };
}

flipSettings = normalizeFlipSettings(flipSettings);

let persistedStateRestored = false;
let lastRestoredData = null;

let currentAttemptUI = null;
let activeLogicUI = null;
let activeLogicSummaryUI = null;
let nextChoiceUI = null;
let nextAmountUI = null;
let engineStatusUI = null;
let lastResultUI = null;
let attemptProgressUI = null;
let authPanel = null;
let sessionPanel = null;
let automationApp = null;
let authMessage = null;
let loginForm = null;
let registerForm = null;
let showLoginBtn = null;
let showRegisterBtn = null;
let logoutBtn = null;
let startAutomationBtn = null;
let startBtnUI = null;

// Prediction UI elements
let predictionPeriodUI = null;
let predictionNextUI = null;
let predictionBigUI = null;
let predictionSmallUI = null;
let predictionConfidenceUI = null;
let predictionCountUI = null;
let predictionAccuracyUI = null;
let predictionHistoryUsedUI = null;

// Analyzer UI elements
let analyzerSamplesUI = null;
let analyzerStatusUI = null;
let analyzerBigPercentUI = null;
let analyzerSmallPercentUI = null;
let analyzerPredictionUI = null;
let analyzerConfidenceUI = null;
let analyzerAccuracyUI = null;
let analyzerPredictionCountUI = null;
let analyzerModelEdgeUI = null;
let viewAnalysisBtn = null;

// Analyzer instance
let outcomeAnalyzer = null;
let currentAuthState = {
    authenticated: false,
    user: null,
    subscription: null,
    entitlement: null
};

// Coordination state
let coordinationState = {
    mode: null, // 'authority' | 'worker' | null
    deviceId: null,
    sessionId: null,
    authorityId: null,
    connectionStatus: 'disconnected', // 'disconnected' | 'connecting' | 'connected' | 'removed'
    isAuthority: false,
    currentAttempt: 1,
    totalAttempts: 0,
    sessionStatus: 'idle', // 'idle' | 'running' | 'paused' | 'stopped' | 'completed'
    workerDevices: [],
    readyState: {},
    lastRoundId: null
};

function setText(id, value) {
    const element = document.getElementById(id);

    if (element) {
        element.textContent =
            value === undefined || value === null || value === ""
                ? "-"
                : String(value);
    }
}

function setAuthMessage(message, isError = false) {
    if (!authMessage) {
        return;
    }

    authMessage.textContent = message || "";
    authMessage.classList.toggle("error", Boolean(isError));
}

function formatAuthError(error, fallbackMessage) {
    const parts = [];

    if (error?.status) {
        parts.push(`HTTP ${error.status}`);
    }

    if (error?.message) {
        parts.push(error.message);
    }

    const validationErrors = error?.data?.errors;

    if (validationErrors && typeof validationErrors === "object") {
        const details = Object.values(validationErrors)
            .flat()
            .filter(Boolean)
            .join(" ");

        if (details && !parts.includes(details)) {
            parts.push(details);
        }
    }

    if (error?.request?.url) {
        parts.push(`Request URL: ${error.request.url}`);
    }

    return parts.filter(Boolean).join(" ") || fallbackMessage;
}

function getUserName(user) {
    return user?.name || user?.full_name || user?.email || "-";
}

function getHardwareId(user) {
    return (
        user?.hardware_id ||
        user?.hardwareId ||
        user?.computer?.hardware_id ||
        user?.license?.hardware_id ||
        "-"
    );
}

function getLicenseStatus(user, subscription) {
    return (
        user?.license_status ||
        user?.licenseStatus ||
        user?.license?.status ||
        subscription?.license?.status ||
        subscription?.license_status ||
        subscription?.license_status ||
        subscription?.licenseStatus ||
        subscription?.status ||
        "-"
    );
}

function getSubscriptionEndDate(user, subscription) {
    const value =
        user?.subscription_ends_at ||
        user?.subscriptionEndsAt ||
        subscription?.ends_at ||
        subscription?.endsAt ||
        subscription?.subscription_ends_at;

    return value ? new Date(value) : null;
}

function getRemainingDays(user, subscription) {
    const directValue =
        user?.subscription_remaining_days ??
        user?.remaining_days ??
        subscription?.remaining_days ??
        subscription?.remainingDays;

    if (directValue !== undefined && directValue !== null) {
        return Number(directValue);
    }

    if (subscription?.is_lifetime || subscription?.isLifetime) {
        return "Lifetime";
    }

    const endDate = getSubscriptionEndDate(user, subscription);

    if (!endDate || Number.isNaN(endDate.getTime())) {
        return "-";
    }

    const diffMs = endDate.getTime() - Date.now();

    return Math.max(0, Math.ceil(diffMs / 86400000));
}

function isAccountBlocked(user) {
    return (
        user?.account_status === "blocked" ||
        user?.accountStatus === "blocked" ||
        user?.status === "blocked" ||
        user?.is_blocked === true ||
        user?.blocked === true
    );
}

function getSubscriptionStatus(user, subscription) {
    const explicitStatus =
        subscription?.status ||
        user?.subscription_status ||
        user?.subscriptionStatus;

    if (explicitStatus) {
        return explicitStatus;
    }

    const remainingDays = getRemainingDays(user, subscription);

    if (remainingDays === "Lifetime") {
        return "active";
    }

    if (typeof remainingDays === "number") {
        return remainingDays > 0 ? "active" : "expired";
    }

    return "-";
}

function isSubscriptionExpired(user, subscription) {
    const status = String(
        getSubscriptionStatus(user, subscription)
    ).toLowerCase();

    if (status === "expired" || status === "cancelled" || status === "inactive") {
        return true;
    }

    const remainingDays = getRemainingDays(user, subscription);

    return typeof remainingDays === "number" && remainingDays <= 0;
}

function setAutomationVisibility(isVisible) {
    if (automationApp) {
        automationApp.hidden = !isVisible;
    }
}

function setAutomationStartDisabled(isDisabled) {
    const title = isDisabled
        ? "Automation is disabled until BlackFox approves this device, subscription, and license."
        : "";

    if (startAutomationBtn) {
        startAutomationBtn.disabled = isDisabled;
        startAutomationBtn.title = title;
    }

    if (startBtnUI) {
        startBtnUI.disabled = isDisabled;
        startBtnUI.title = title;
    }
}

function getEntitlementFailure(entitlement, user, subscription) {
    if (isAccountBlocked(user)) {
        return "Account blocked. Automation is disabled.";
    }

    if (entitlement) {
        if (!entitlement.approved_user) {
            return "User is not approved. Automation is disabled.";
        }

        if (!entitlement.active_subscription) {
            return "Subscription is not active. Automation is disabled.";
        }

        if (!entitlement.valid_license) {
            return "License is not valid. Automation is disabled.";
        }

        if (!entitlement.same_device) {
            return "This account is linked to another device. Automation is disabled.";
        }

        if (entitlement.automation_allowed === false) {
            return "BlackFox has disabled automation for this account.";
        }
    }

    if (isSubscriptionExpired(user, subscription)) {
        return "Subscription expired. Automation is disabled.";
    }

    return "";
}

function renderLoggedOut(message = "") {
    currentAuthState = {
        authenticated: false,
        user: null,
        subscription: null,
        entitlement: null
    };

    if (authPanel) {
        authPanel.hidden = false;
    }

    if (sessionPanel) {
        sessionPanel.hidden = true;
    }

    // Hide coordination UI when logged out
    const modeSelectionCard = document.getElementById('modeSelectionCard');
    const authorityModeCard = document.getElementById('authorityModeCard');
    const workerModeCard = document.getElementById('workerModeCard');
    const connectedDevicesCard = document.getElementById('connectedDevicesCard');
    const sessionProgressCard = document.getElementById('sessionProgressCard');
    
    if (modeSelectionCard) modeSelectionCard.style.display = 'none';
    if (authorityModeCard) authorityModeCard.style.display = 'none';
    if (workerModeCard) workerModeCard.style.display = 'none';
    if (connectedDevicesCard) connectedDevicesCard.style.display = 'none';
    if (sessionProgressCard) sessionProgressCard.style.display = 'none';

    setAutomationVisibility(false);
    setAutomationStartDisabled(true);
    setAuthMessage(message);
}

function renderLoggedIn(user, subscription, entitlement = null) {
    const remainingDays = getRemainingDays(user, subscription);
    const subscriptionStatus = getSubscriptionStatus(user, subscription);
    const failure = getEntitlementFailure(entitlement, user, subscription);

    currentAuthState = {
        authenticated: true,
        user,
        subscription,
        entitlement
    };

    if (authPanel) {
        authPanel.hidden = true;
    }

    if (sessionPanel) {
        sessionPanel.hidden = false;
    }

    setText("authUserName", getUserName(user));
    setText("authSubscriptionStatus", entitlement?.subscription?.status || subscriptionStatus);
    setText("authRemainingDays", remainingDays);
    setText("authLicenseStatus", entitlement?.license?.status || getLicenseStatus(user, subscription));
    setText("authHardwareId", entitlement?.device?.hardware_id || getHardwareId(user));

    setAutomationVisibility(true);
    setAutomationStartDisabled(Boolean(failure));

    if (failure) {
        setAuthMessage(failure, true);
    } else {
        setAuthMessage("");
    }
}

async function applyAuthResult(result) {
    const user = result?.user || null;
    const subscription = result?.subscription || user?.subscription || null;
    const entitlement = result?.entitlement || result?.raw || null;

    if (isAccountBlocked(user)) {
        await blackFoxLogout();
        renderLoggedOut("Account blocked. You have been logged out.");
        return false;
    }

    if (result?.authenticated) {
        renderLoggedIn(user, subscription, entitlement);
        await initializeCoordinationMode();
        return true;
    }

    renderLoggedOut();
    return false;
}

async function refreshAutomationAccess() {
    const disabled = await getAutomationDisabled();

    if (disabled.disabled) {
        setAutomationStartDisabled(true);
        return {
            allowed: false,
            message: disabled.reason || "Automation was disabled remotely."
        };
    }

    const heartbeatResult = await heartbeat({
        metadata: {
            source: "popup_pre_start"
        }
    });

    const entitlementResult = await fetchSubscriptionStatus();
    const entitlement =
        entitlementResult.entitlement ||
        heartbeatResult.raw?.entitlement ||
        currentAuthState.entitlement;
    const user = entitlement?.user || entitlementResult.user || currentAuthState.user;
    const subscription =
        entitlement?.subscription ||
        entitlementResult.subscription ||
        currentAuthState.subscription;

    if (isAccountBlocked(user)) {
        await blackFoxLogout();
        renderLoggedOut("Account blocked. You have been logged out.");

        return {
            allowed: false,
            message: "Account blocked. You have been logged out."
        };
    }

    const failure = getEntitlementFailure(entitlement, user, subscription);

    renderLoggedIn(user, subscription, entitlement);

    return {
        allowed: !failure,
        message: failure
    };
}

function showAuthScreen(screenName) {
    const isRegister = screenName === "register";

    if (loginForm) {
        loginForm.hidden = isRegister;
    }

    if (registerForm) {
        registerForm.hidden = !isRegister;
    }

    if (showLoginBtn) {
        showLoginBtn.classList.toggle("active", !isRegister);
    }

    if (showRegisterBtn) {
        showRegisterBtn.classList.toggle("active", isRegister);
    }

    setAuthMessage("");
}

async function initializeAuthFlow() {
    renderLoggedOut("Checking saved login...");

    const restored = await restoreSession();

    if (restored.authenticated) {
        await applyAuthResult(restored);
        return;
    }

    const autoLoginResult = await autoLogin();
    await applyAuthResult(autoLoginResult);
}

// Coordination mode functions
async function initializeCoordinationMode() {
    console.log("[Coordination] Initializing coordination mode");
    
    // Only initialize coordination mode if user is authenticated
    if (!currentAuthState.authenticated) {
        console.log("[Coordination] User not authenticated - skipping coordination initialization");
        return;
    }
    
    const mode = await getCoordinationMode();
    const deviceId = await getCoordinationDeviceId();
    
    coordinationState.mode = mode;
    coordinationState.deviceId = deviceId;
    
    console.log("[Coordination] Mode:", mode, "Device ID:", deviceId);
    
    if (!mode) {
        // First-time setup - show mode selection
        showModeSelection();
    } else {
        // Load existing mode
        await loadCoordinationState();
        updateCoordinationUI();
    }
}

function showModeSelection() {
    // Only show mode selection if user is authenticated
    if (!currentAuthState.authenticated) {
        console.log("[Coordination] Cannot show mode selection - user not authenticated");
        return;
    }
    
    document.getElementById('modeSelectionCard').style.display = 'block';
    document.getElementById('authorityModeCard').style.display = 'none';
    document.getElementById('workerModeCard').style.display = 'none';
    document.getElementById('connectedDevicesCard').style.display = 'none';
    document.getElementById('sessionProgressCard').style.display = 'none';
}

async function selectAuthorityMode() {
    console.log("[Coordination] User selected Authority mode");
    await setCoordinationMode('authority');
    coordinationState.mode = 'authority';
    coordinationState.isAuthority = true;
    
    // Generate session ID for authority
    const sessionId = generateSessionId();
    await setCoordinationSessionId(sessionId);
    coordinationState.sessionId = sessionId;
    
    await loadCoordinationState();
    updateCoordinationUI();
}

async function selectWorkerMode() {
    console.log("[Coordination] User selected Worker mode");
    await setCoordinationMode('worker');
    coordinationState.mode = 'worker';
    coordinationState.isAuthority = false;
    
    await loadCoordinationState();
    updateCoordinationUI();
}

function generateSessionId() {
    // Generate session ID like "BF-82K4-91X"
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const segment1 = Array.from({length: 2}, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    const segment2 = Array.from({length: 4}, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    const segment3 = Array.from({length: 3}, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    return `${segment1}-${segment2}-${segment3}`;
}

function updateSessionProgressUI(session = {}) {
    coordinationState.currentAttempt =
        session.currentAttempt ?? coordinationState.currentAttempt ?? 1;
    coordinationState.totalAttempts =
        session.totalAttempts ?? coordinationState.totalAttempts ?? 0;
    coordinationState.sessionStatus =
        session.status ?? session.sessionStatus ?? coordinationState.sessionStatus ?? "idle";
    coordinationState.sessionTotal =
        session.sessionTotal ?? coordinationState.sessionTotal ?? 0;
    coordinationState.completedAttempts =
        session.completedAttempts ?? coordinationState.completedAttempts ?? 0;

    const currentEl = document.getElementById("sessionCurrentAttempt");
    const totalEl = document.getElementById("sessionTotalAttempts");
    const amountEl = document.getElementById("sessionTotalAmount");
    const statusEl = document.getElementById("sessionStatus");

    if (currentEl) {
        currentEl.textContent = coordinationState.currentAttempt;
    }

    if (totalEl) {
        totalEl.textContent = coordinationState.totalAttempts;
    }

    if (amountEl) {
        amountEl.textContent = coordinationState.sessionTotal;
    }

    if (statusEl) {
        statusEl.textContent = getSessionStatusEmoji(coordinationState.sessionStatus);
    }
}

async function loadSessionProgressFromStorage() {
    const sessionState = await getCoordinationSessionState();

    if (sessionState) {
        updateSessionProgressUI(sessionState);
    }
}

async function persistSessionProgressUI() {
    await setCoordinationSessionState({
        status: coordinationState.sessionStatus,
        currentAttempt: coordinationState.currentAttempt,
        totalAttempts: coordinationState.totalAttempts,
        sessionTotal: coordinationState.sessionTotal,
        completedAttempts: coordinationState.completedAttempts,
        startAttempt: Number(getControlValue("startFromAttempt", "1")) || 1
    });
}

async function handleResetSession() {
    const totalAttempts = getTotalAttemptsNumber();
    const startAttempt = getCustomStartingAttempt() || 1;

    updateSessionProgressUI({
        status: "idle",
        currentAttempt: startAttempt,
        totalAttempts,
        sessionTotal: 0,
        completedAttempts: 0
    });

    await persistSessionProgressUI();
    await syncAttemptUI(startAttempt, totalAttempts, true);

    engineState.currentAttempt = startAttempt;
    Engine.currentAttempt = startAttempt;

    await sendToActiveTab({
        action: "RESET_SESSION",
        startAttempt,
        totalAttempts
    });
}

function applySessionUpdateToPopup(session = {}) {
    if (!session || typeof session !== "object") {
        return;
    }

    updateSessionProgressUI(session);

    if (session.activeLogicId !== undefined) {
        activeLogicId = Number(session.activeLogicId) || activeLogicId;
        setControlValue("manualFlipLogic", activeLogicId);
        updateActiveLogicDisplay();
    }

    if (session.currentLogicPosition !== undefined) {
        currentLogicPosition = Number(session.currentLogicPosition) || 0;
    }

    if (Array.isArray(session.executionOrder)) {
        lastExecutionPlan = {
            ...lastExecutionPlan,
            executionOrder: session.executionOrder
        };
        updateExecutionPlanDisplay(lastExecutionPlan);
    }

    if (session.currentAttempt !== undefined) {
        currentAttemptUI.textContent = String(session.currentAttempt);
        engineState.currentAttempt = session.currentAttempt;
        Engine.currentAttempt = session.currentAttempt;

        const totalAttempts =
            session.totalAttempts || getTotalAttemptsNumber();

        if (totalAttempts > 0) {
            updateAttemptProgress(session.currentAttempt, totalAttempts);
        }
    }

    if (session.status === "completed" || session.status === "stopped") {
        engineStatusUI.textContent =
            session.status === "completed" ? "🟢 Completed" : "🔴 Stopped";
    }

    persistSessionProgressUI();
}

async function loadCoordinationState() {
    const sessionId = await getCoordinationSessionId();
    const authorityId = await getCoordinationAuthorityId();
    const connectionStatus = await getCoordinationConnectionStatus();
    const sessionState = await getCoordinationSessionState();
    
    coordinationState.sessionId = sessionId;
    coordinationState.authorityId = authorityId;
    coordinationState.connectionStatus = connectionStatus;
    coordinationState.sessionStatus = sessionState?.status || 'idle';
    coordinationState.currentAttempt = sessionState?.currentAttempt ?? 1;
    coordinationState.totalAttempts = sessionState?.totalAttempts || 0;
    coordinationState.sessionTotal = sessionState?.sessionTotal || 0;
    coordinationState.completedAttempts = sessionState?.completedAttempts || 0;
    coordinationState.workerDevices = sessionState?.workerDevices || [];
    coordinationState.readyState = sessionState?.readyState || {};

    updateSessionProgressUI(sessionState || {});
}

function updateCoordinationUI() {
    const mode = coordinationState.mode;
    
    // Hide mode selection
    document.getElementById('modeSelectionCard').style.display = 'none';
    
    if (mode === 'authority') {
        // Show authority UI
        document.getElementById('authorityModeCard').style.display = 'block';
        document.getElementById('workerModeCard').style.display = 'none';
        document.getElementById('connectedDevicesCard').style.display = 'block';
        document.getElementById('sessionProgressCard').style.display = 'block';
        
        // Update authority info
        document.getElementById('authoritySessionId').textContent = coordinationState.sessionId || '-';
        document.getElementById('connectedCount').textContent = coordinationState.workerDevices.filter(d => d.status !== 'offline' && d.status !== 'removed').length;
        document.getElementById('totalConnected').textContent = coordinationState.workerDevices.length;
        document.getElementById('readyCount').textContent = Object.values(coordinationState.readyState).filter(r => r === 'ready').length;
        document.getElementById('totalReady').textContent = coordinationState.workerDevices.length;
        
        // Update session progress
        updateSessionProgressUI(coordinationState);
        
        // Render connected devices
        renderConnectedDevices();
        
    } else if (mode === 'worker') {
        // Show worker UI
        document.getElementById('authorityModeCard').style.display = 'none';
        document.getElementById('workerModeCard').style.display = 'block';
        document.getElementById('connectedDevicesCard').style.display = 'none';
        document.getElementById('sessionProgressCard').style.display = 'block';
        
        // Update worker info
        document.getElementById('workerDeviceCode').textContent = coordinationState.deviceId || '-';
        document.getElementById('workerAuthorityId').textContent = coordinationState.authorityId || '-';
        document.getElementById('workerConnectionStatus').textContent = getConnectionStatusEmoji(coordinationState.connectionStatus);
        
        // Show/hide connect section based on connection status
        const connectSection = document.getElementById('workerConnectSection');
        if (coordinationState.connectionStatus === 'connected') {
            connectSection.style.display = 'none';
        } else {
            connectSection.style.display = 'block';
        }
        
        // Update session progress
        updateSessionProgressUI(coordinationState);
    }
}

function getSessionStatusEmoji(status) {
    const statusEmojis = {
        'idle': '🔴 IDLE',
        'running': '🟢 RUNNING',
        'paused': '🟡 PAUSED',
        'stopped': '🔴 STOPPED',
        'completed': '🟢 COMPLETED'
    };
    return statusEmojis[status] || '🔴 UNKNOWN';
}

function getConnectionStatusEmoji(status) {
    const statusEmojis = {
        'disconnected': '🔴 DISCONNECTED',
        'connecting': '🟡 CONNECTING',
        'connected': '🟢 CONNECTED',
        'removed': '🚫 REMOVED'
    };
    return statusEmojis[status] || '🔴 UNKNOWN';
}

function renderConnectedDevices() {
    const container = document.getElementById('connectedDevicesList');
    container.innerHTML = '';
    
    if (coordinationState.workerDevices.length === 0) {
        container.innerHTML = '<p style="color: #64748b; text-align: center; padding: 20px;">No devices connected</p>';
        return;
    }
    
    coordinationState.workerDevices.forEach(device => {
        const card = document.createElement('div');
        card.className = `connected-device-card ${device.status}`;
        
        const statusClass = device.status || 'offline';
        const statusText = (device.status || 'OFFLINE').toUpperCase();
        
        card.innerHTML = `
            <div class="device-card-header">
                <span class="device-name">${device.name || 'Unknown Device'}</span>
                <span class="device-status ${statusClass}">${statusText}</span>
            </div>
            <div class="device-card-details">
                <p>Device ID: ${device.deviceId}</p>
                <p>Current Attempt: ${device.currentAttempt || 0} / ${coordinationState.totalAttempts || 0}</p>
                <p>Local Session Total: ₹${device.sessionTotal || 0}</p>
            </div>
            <div class="device-card-actions">
                <button class="stop-btn" onclick="stopDevice('${device.deviceId}')">STOP</button>
                <button class="remove-btn" onclick="removeDevice('${device.deviceId}')">REMOVE</button>
            </div>
        `;
        
        container.appendChild(card);
    });
}

async function connectToAuthority() {
    const authorityCode = document.getElementById('authorityCodeInput').value.trim().toUpperCase();
    
    if (!authorityCode || authorityCode.length !== 9) {
        alert('Please enter a valid Authority Session Code (format: XX-XXXX-XXX)');
        return;
    }
    
    console.log("[Coordination] Worker connecting to authority:", authorityCode);
    
    // Update state
    coordinationState.authorityId = authorityCode;
    coordinationState.connectionStatus = 'connecting';
    
    await setCoordinationAuthorityId(authorityCode);
    await setCoordinationConnectionStatus('connecting');
    
    updateCoordinationUI();
    
    // TODO: Implement actual connection via API/WebSocket
    // For now, simulate connection after delay
    setTimeout(async () => {
        coordinationState.connectionStatus = 'connected';
        coordinationState.sessionId = authorityCode;
        
        await setCoordinationConnectionStatus('connected');
        await setCoordinationSessionId(authorityCode);
        
        updateCoordinationUI();
        console.log("[Coordination] Worker connected to authority successfully");
    }, 1000);
}

async function copyDeviceCode() {
    const deviceCode = coordinationState.deviceId;
    if (!deviceCode) return;
    
    try {
        await navigator.clipboard.writeText(deviceCode);
        alert('Device code copied to clipboard!');
    } catch (err) {
        console.error('[Coordination] Failed to copy device code:', err);
    }
}

async function handleChangeMode() {
    const confirmed = confirm('Changing mode will disconnect the current session. Continue?');
    if (!confirmed) return;
    
    // Clear coordination state
    await clearCoordinationState();
    
    // Reset local state
    coordinationState.mode = null;
    coordinationState.sessionId = null;
    coordinationState.authorityId = null;
    coordinationState.connectionStatus = 'disconnected';
    coordinationState.workerDevices = [];
    coordinationState.readyState = {};
    
    // Show mode selection
    showModeSelection();
}

// Global functions for device actions (assigned to window for onclick handlers)
window.stopDevice = async function(deviceId) {
    console.log("[Coordination] Stopping device:", deviceId);
    // TODO: Implement actual stop via API
    const device = coordinationState.workerDevices.find(d => d.deviceId === deviceId);
    if (device) {
        device.status = 'stopped';
        updateCoordinationUI();
    }
};

window.removeDevice = async function(deviceId) {
    console.log("[Coordination] Removing device:", deviceId);
    const confirmed = confirm('Remove this device from the session?');
    if (!confirmed) return;
    
    // TODO: Implement actual removal via API
    coordinationState.workerDevices = coordinationState.workerDevices.filter(d => d.deviceId !== deviceId);
    updateCoordinationUI();
};

async function handleLoginSubmit(event) {
    event.preventDefault();
    console.log("[AUTH] STEP 1: Login button clicked");
    setAuthMessage("Logging in...");

    try {
        console.log("[AUTH] STEP 2: Calling blackFoxLogin()");
        const result = await blackFoxLogin({
            email: document.getElementById("loginEmail")?.value.trim(),
            password: document.getElementById("loginPassword")?.value
        });
        console.log("[AUTH] STEP 3: Login response received", result);

        console.log("[AUTH] STEP 4: Applying auth result");
        await applyAuthResult({
            authenticated: true,
            user: result.user,
            subscription: result.subscription,
            entitlement: result.entitlement
        });
        console.log("[AUTH] STEP 5: Auth result applied successfully");
    } catch (error) {
        console.error("[AUTH] ERROR: Login failed", error);
        const message = formatAuthError(error, "Login failed.");
        showAuthScreen("login");
        setAuthMessage(message, true);
    }
}

async function handleRegisterSubmit(event) {
    event.preventDefault();
    setAuthMessage("Creating account...");

    const password =
        document.getElementById("registerPassword")?.value;
    const passwordConfirmation =
        document.getElementById("registerPasswordConfirmation")?.value;

    if (password !== passwordConfirmation) {
        setAuthMessage("Passwords do not match.", true);
        return;
    }

    try {
        const response = await blackFoxRegister({
            name: document.getElementById("registerName")?.value.trim(),
            email: document.getElementById("registerEmail")?.value.trim(),
            password,
            password_confirmation: passwordConfirmation
        });

        showAuthScreen("login");
        setAuthMessage(
            response?.message ||
            "Registration submitted. Please wait for admin approval before logging in."
        );
    } catch (error) {
        setAuthMessage(formatAuthError(error, "Registration failed."), true);
    }
}

async function handleLogoutClick() {
    setAuthMessage("Logging out...");
    await blackFoxLogout();
    renderLoggedOut("Logged out.");
}

function syncEngineStateFromUI() {
    engineState.currentAttempt =
        getCurrentAttemptNumber();
    engineState.totalAttempts =
        getTotalAttemptsNumber();
    engineState.status =
        engineStatusUI.textContent;
    engineState.lastResult =
        lastResultUI.textContent;
    Engine.currentAttempt =
        engineState.currentAttempt;
}

async function syncAttemptUI(
    currentAttempt,
    totalAttempts,
    persist = false
) {
    currentAttemptUI.textContent =
        String(currentAttempt);
    engineState.currentAttempt =
        currentAttempt;
    engineState.totalAttempts =
        totalAttempts;
    Engine.currentAttempt =
        currentAttempt;

    if (totalAttempts > 0) {
        updateAttemptProgress(
            currentAttempt,
            totalAttempts
        );
    }

    if (persist) {
        await saveState();
    }
}

function getCurrentAttemptNumber() {
    return Number(
        String(currentAttemptUI.textContent).trim()
    ) || 0;
}

function getTotalAttemptsNumber() {
    const activeLogic = logicData[activeLogicId];
    const savedAttempts = activeLogic?.attempts
        ? Object.keys(activeLogic.attempts).length
        : 0;

    return savedAttempts || Number(
        document.getElementById("attemptsPerLogic")?.value
    ) || 0;
}

function getLogicColor(logicId) {
    const colors = [
        "#16a34a",
        "#2563eb",
        "#7c3aed",
        "#f97316",
        "#ec4899",
        "#14b8a6",
        "#f59e0b",
        "#ef4444"
    ];

    return colors[(Number(logicId) - 1) % colors.length];
}

function getLogicCountFromUI() {
    return Number(
        document.getElementById("numberOfLogic")?.value
    ) || Object.keys(logicData).length || 0;
}

function getAttemptsPerLogicFromUI() {
    const fromAttemptsPerLogic = Number(
        document.getElementById("attemptsPerLogic")?.value
    );
    if (Number.isFinite(fromAttemptsPerLogic) && fromAttemptsPerLogic > 0) {
        return fromAttemptsPerLogic;
    }

    const fromNumberOfAttempts = Number(
        document.getElementById("numberOfAttempts")?.value
    );
    if (Number.isFinite(fromNumberOfAttempts) && fromNumberOfAttempts > 0) {
        return fromNumberOfAttempts;
    }

    return getTotalAttemptsNumber() || 0;
}

function getShuffleApi() {
    return globalThis.LogicPilotShuffle;
}

function syncAttemptsPerLogicAlias(attemptsPerLogic) {
    const resolved = Number(attemptsPerLogic) || getAttemptsPerLogicFromUI() || 0;
    setControlValue("attemptsPerLogic", resolved);
    setControlValue("numberOfAttempts", resolved);
    return resolved;
}

function getShuffleConfigFromUI() {
    const totalLogics = getLogicCountFromUI();
    return {
        totalLogics,
        shuffleEnabled: Boolean(document.getElementById("logicShuffleEnabled")?.checked),
        shuffleFrom: Number(document.getElementById("shuffleFromLogic")?.value),
        shuffleTo: Number(document.getElementById("shuffleToLogic")?.value)
    };
}

function setShuffleValidationMessage(message) {
    const element = document.getElementById("shuffleValidationMessage");
    if (element) {
        element.textContent = message || "";
    }
}

function updateExecutionPlanDisplay(plan = lastExecutionPlan) {
    const generatedLogics = Object.keys(logicData).length || plan?.totalLogics || 0;
    const attemptsPerLogic = getAttemptsPerLogicFromUI();
    const shuffleEnabled = Boolean(plan?.shuffleEnabled);
    const executionOrder = Array.isArray(plan?.executionOrder) ? plan.executionOrder : [];
    const shuffleApi = getShuffleApi();

    const generatedEl = document.getElementById("statusGeneratedLogics");
    const attemptsEl = document.getElementById("statusAttemptsPerLogic");
    const shuffleEl = document.getElementById("statusShuffleEnabled");
    const rangeEl = document.getElementById("statusShuffleRange");
    const orderEl = document.getElementById("statusExecutionOrder");

    if (generatedEl) {
        generatedEl.textContent = String(generatedLogics);
    }
    if (attemptsEl) {
        attemptsEl.textContent = String(attemptsPerLogic);
    }
    if (shuffleEl) {
        shuffleEl.textContent = shuffleEnabled ? "ON" : "OFF";
    }
    if (rangeEl) {
        rangeEl.textContent = shuffleEnabled
            ? `Logic ${plan.shuffleFrom} → Logic ${plan.shuffleTo}`
            : "-";
    }
    if (orderEl) {
        orderEl.textContent = shuffleApi?.formatExecutionOrder(executionOrder) || "-";
    }
}

function buildExecutionPlan(options = {}) {
    const shuffleApi = getShuffleApi();
    const config = {
        ...getShuffleConfigFromUI(),
        ...options
    };

    if (!shuffleApi) {
        return {
            ok: true,
            executionOrder: Array.from({ length: config.totalLogics || 0 }, (_, index) => index + 1),
            shuffleEnabled: false
        };
    }

    return shuffleApi.buildExecutionOrder(config);
}

function applyGeneratedLogicsToState(totalLogics, attemptsPerLogic, preserveExisting) {
    const shuffleApi = getShuffleApi();
    const existing = preserveExisting ? logicData : {};
    if (shuffleApi) {
        logicData = shuffleApi.generateLogics(totalLogics, attemptsPerLogic, existing);
        return;
    }

    const nextLogicData = {};
    for (let logicId = 1; logicId <= totalLogics; logicId++) {
        const previous = existing[logicId] || {
            attempts: {},
            startTime: null,
            winCount: 0,
            lossCount: 0
        };
        const attempts = {};
        for (let attemptNum = 1; attemptNum <= attemptsPerLogic; attemptNum++) {
            attempts[attemptNum] = previous.attempts?.[attemptNum] || {
                choice: "big",
                amount: ""
            };
        }
        nextLogicData[logicId] = {
            logicId,
            attempts,
            startTime: previous.startTime || null,
            winCount: previous.winCount || 0,
            lossCount: previous.lossCount || 0
        };
    }
    logicData = nextLogicData;
}

function updateActiveLogicDisplay() {
    const label = `Logic ${activeLogicId}`;

    if (activeLogicUI) {
        activeLogicUI.textContent = label;
    }

    if (activeLogicSummaryUI) {
        activeLogicSummaryUI.textContent = label;
    }

    strategyContainer?.querySelectorAll?.(".logic-card")?.forEach((card) => {
        const logicId = Number(card.dataset.logic);
        const badges = card.querySelector(".logic-badges");
        const existingRunning = card.querySelector(".logic-badge.running");

        if (existingRunning) {
            existingRunning.remove();
        }

        if (logicId === Number(activeLogicId) && badges) {
            badges.insertAdjacentHTML(
                "beforeend",
                '<span class="logic-badge running">RUNNING</span>'
            );
        }
    });
}

function getExpandedState() {
    const expandedLogicIds = [];
    const expandedAttemptIds = [];

    strategyContainer?.querySelectorAll?.(".logic-card")?.forEach((card) => {
        if (card.querySelector(".logic-body")?.classList.contains("active")) {
            expandedLogicIds.push(card.dataset.logic);
        }
    });

    strategyContainer?.querySelectorAll?.(".accordion-card")?.forEach((card) => {
        if (card.querySelector(".accordion-body")?.classList.contains("active")) {
            expandedAttemptIds.push(card.dataset.attemptKey);
        }
    });

    return {
        expandedLogicIds,
        expandedAttemptIds
    };
}

function collectDraftValues() {
    const drafts = {};

    strategyContainer?.querySelectorAll?.("select[id^='choice-'], input[id^='amount-']")?.forEach((element) => {
        const match = element.id.match(/^(choice|amount)-(\d+)-(\d+)$/);

        if (!match) {
            return;
        }

        const [, field, logicId, attempt] = match;
        const key = `${logicId}-${attempt}`;

        drafts[key] = drafts[key] || {};
        drafts[key][field] = element.value;
    });

    return drafts;
}

function applyDraftValues(drafts = {}) {
    Object.entries(drafts).forEach(([key, values]) => {
        const [logicId, attempt] = key.split("-");
        const choice = document.getElementById(`choice-${logicId}-${attempt}`);
        const amount = document.getElementById(`amount-${logicId}-${attempt}`);

        if (choice && values.choice !== undefined) {
            choice.value = values.choice;
        }

        if (amount && values.amount !== undefined) {
            amount.value = values.amount;
        }
    });
}

function getControlValue(id, fallback = "") {
    const element = document.getElementById(id);
    return element ? element.value : fallback;
}

function setControlValue(id, value) {
    const element = document.getElementById(id);

    if (element && value !== undefined && value !== null) {
        element.value = String(value);
    }
}

function setToggleValue(id, isEnabled) {
    const element = document.getElementById(id);

    if (element instanceof HTMLInputElement) {
        element.checked = Boolean(isEnabled);
        updateToggleLabel(element);
    }
}

function updateToggleLabel(toggle) {
    const label = toggle
        ?.closest(".toggle-switch")
        ?.querySelector(".toggle-label");

    if (label) {
        label.textContent = toggle.checked ? "ON" : "OFF";
    }
}

function getNumberControlValue(id, fallback) {
    const rawValue = getControlValue(id, fallback);

    if (rawValue === "" || rawValue === undefined || rawValue === null) {
        return fallback;
    }

    const value = Number(rawValue);
    return Number.isFinite(value) ? value : fallback;
}

function syncFlipSettingsFromControls() {
    flipSettings = normalizeFlipSettings(flipSettings);

    const autoFlip1LogicValue = getControlValue("autoFlip1Logic", "");
    flipSettings.autoFlip1.targetLogicId = autoFlip1LogicValue === "random" ? "random" : parseInt(autoFlip1LogicValue) || null;
    
    flipSettings.autoFlip1.minutes = getNumberControlValue(
        "autoFlip1Minutes",
        flipSettings.autoFlip1.minutes
    );
    
    const autoFlip2LogicValue = getControlValue("autoFlip2Logic", "");
    flipSettings.autoFlip2.targetLogicId = autoFlip2LogicValue === "random" ? "random" : parseInt(autoFlip2LogicValue) || null;
    
    flipSettings.autoFlip2.attempt = getNumberControlValue(
        "autoFlip2Attempt",
        flipSettings.autoFlip2.attempt
    );
    flipSettings.shuffleFlip.triggerType =
        getControlValue(
            "shuffleTriggerType",
            flipSettings.shuffleFlip.triggerType
        ) === "loss"
            ? "loss"
            : "win";
    flipSettings.flipRecoveryMode = getControlValue(
        "flipRecoveryMode",
        flipSettings.flipRecoveryMode
    );
}

function buildPopupStateSnapshot() {
    const expanded = getExpandedState();

    return {
        numberOfLogic: getLogicCountFromUI(),
        attemptsPerLogic: getAttemptsPerLogicFromUI(),
        logicShuffleEnabled: Boolean(document.getElementById("logicShuffleEnabled")?.checked),
        shuffleFromLogic: getControlValue("shuffleFromLogic", "1"),
        shuffleToLogic: getControlValue("shuffleToLogic", String(getLogicCountFromUI() || 1)),
        executionOrder: lastExecutionPlan.executionOrder,
        executionPlan: lastExecutionPlan,
        currentLogicPosition,
        activeLogicId,
        currentAttempt: String(currentAttemptUI?.textContent || "0").trim(),
        engineStatus: engineStatusUI?.textContent || "🔴 Stopped",
        lastResult: lastResultUI?.textContent || "-",
        nextChoice: nextChoiceUI?.textContent || "-",
        nextAmount: nextAmountUI?.textContent || "-",
        manualFlipLogic: getControlValue("manualFlipLogic", String(activeLogicId)),
        autoFlip1Logic: getControlValue("autoFlip1Logic", ""),
        autoFlip2Logic: getControlValue("autoFlip2Logic", ""),
        autoFlip1Minutes: getControlValue("autoFlip1Minutes", flipSettings.autoFlip1.minutes),
        autoFlip2Attempt: getControlValue("autoFlip2Attempt", flipSettings.autoFlip2.attempt),
        shuffleTriggerType: getControlValue("shuffleTriggerType", flipSettings.shuffleFlip.triggerType),
        flipSettings,
        drafts: collectDraftValues(),
        startFromAttempt: getControlValue("startFromAttempt", "1"),
        ...expanded
    };
}

function applyPopupStateToControls(state = {}) {
    if (!state || typeof state !== "object") {
        updateActiveLogicDisplay();
        return;
    }

    setControlValue("numberOfLogic", state.numberOfLogic);
    setControlValue("attemptsPerLogic", state.attemptsPerLogic);
    syncAttemptsPerLogicAlias(state.attemptsPerLogic || state.numberOfAttempts);
    setToggleValue("logicShuffleEnabled", state.logicShuffleEnabled);
    setControlValue("shuffleFromLogic", state.shuffleFromLogic || 1);
    setControlValue("shuffleToLogic", state.shuffleToLogic || state.numberOfLogic || 1);
    if (Array.isArray(state.executionOrder) || state.executionPlan) {
        lastExecutionPlan = {
            executionOrder: state.executionPlan?.executionOrder || state.executionOrder || [],
            shuffleEnabled: Boolean(state.executionPlan?.shuffleEnabled || state.logicShuffleEnabled),
            shuffleFrom: Number(state.executionPlan?.shuffleFrom || state.shuffleFromLogic) || 1,
            shuffleTo: Number(state.executionPlan?.shuffleTo || state.shuffleToLogic) || 1
        };
        updateExecutionPlanDisplay(lastExecutionPlan);
    }
    setControlValue("manualFlipLogic", state.manualFlipLogic);
    setControlValue("autoFlip1Logic", state.autoFlip1Logic);
    setControlValue("autoFlip2Logic", state.autoFlip2Logic);
    setControlValue("autoFlip1Minutes", state.autoFlip1Minutes);
    setControlValue("autoFlip2Attempt", state.autoFlip2Attempt);
    setControlValue(
        "shuffleTriggerType",
        state.shuffleTriggerType ||
            flipSettings.shuffleFlip.triggerType
    );
    setToggleValue("autoFlip1Enabled", flipSettings.autoFlip1.enabled);
    setToggleValue("autoFlip2Enabled", flipSettings.autoFlip2.enabled);
    setToggleValue("shuffleFlipEnabled", flipSettings.shuffleFlip.enabled);
    setControlValue("flipRecoveryMode", flipSettings.flipRecoveryMode);
    
    // Restore custom starting attempt if saved
    if (state.startFromAttempt !== undefined) {
        setControlValue("startFromAttempt", state.startFromAttempt);
    } else {
        // Default to 1 if not saved
        setControlValue("startFromAttempt", "1");
    }
    
    // Update max values for attempt inputs based on current logic data
    const activeLogic = logicData[activeLogicId];
    if (activeLogic && activeLogic.attempts) {
        const totalAttempts = Object.keys(activeLogic.attempts).length;
        if (totalAttempts > 0) {
            updateAttemptInputMaxValues(totalAttempts);
        }
    }

    applyDraftValues(state.drafts);
    updateActiveLogicDisplay();
}

function buildAttemptStrategySnapshot() {
    const attemptsPerLogic = getAttemptsPerLogicFromUI();
    const logicIds = Object.keys(logicData).map(Number).sort((a, b) => a - b);
    const firstLogicAttempts = [];
    const logics = {};

    for (const logicId of logicIds) {
        const logicAttempts = [];
        const storedAttempts = logicData[logicId]?.attempts || {};
        for (let attempt = 1; attempt <= attemptsPerLogic; attempt++) {
            const choice = document.getElementById(`choice-${logicId}-${attempt}`)?.value
                || storedAttempts[attempt]?.choice
                || "big";
            const amountValue = document.getElementById(`amount-${logicId}-${attempt}`)?.value;
            const amount = amountValue === "" || amountValue === undefined
                ? (storedAttempts[attempt]?.amount ?? "")
                : Number(amountValue);
            logicAttempts.push({ choice, amount });
            if (logicId === 1) {
                firstLogicAttempts.push({ choice, amount });
            }
        }
        logics[logicId] = { logicId, attempts: logicAttempts };
    }

    return {
        attempts: firstLogicAttempts,
        numberOfLogic: logicIds.length,
        attemptsPerLogic,
        logics
    };
}

function applyAttemptStrategyToLogicData(strategy) {
    if (strategy?.logics && typeof strategy.logics === "object") {
        const nextLogicData = {};
        Object.keys(strategy.logics).forEach((key) => {
            const logicId = Number(key);
            const source = strategy.logics[key];
            const attempts = {};
            const sourceAttempts = Array.isArray(source.attempts)
                ? source.attempts
                : Object.values(source.attempts || {});
            sourceAttempts.forEach((attempt, index) => {
                attempts[index + 1] = {
                    choice: attempt.choice || "big",
                    amount: attempt.amount ?? ""
                };
            });
            nextLogicData[logicId] = {
                logicId,
                attempts,
                startTime: null,
                winCount: 0,
                lossCount: 0
            };
        });
        logicData = nextLogicData;
        activeLogicId = Number(Object.keys(nextLogicData)[0]) || 1;
        return;
    }

    const attempts = {};

    (strategy.attempts || []).forEach((attempt, index) => {
        attempts[index + 1] = {
            choice: attempt.choice || "big",
            amount: attempt.amount ?? ""
        };
    });

    logicData = {
        1: {
            logicId: 1,
            attempts,
            startTime: null,
            winCount: 0,
            lossCount: 0
        }
    };
    activeLogicId = 1;
}

async function saveAttemptStrategy() {
    const strategy = buildAttemptStrategySnapshot();

    applyAttemptStrategyToLogicData(strategy);
    await chrome.storage.local.set({
        [ATTEMPT_STRATEGY_STORAGE_KEY]: strategy
    });

    return strategy;
}

async function loadAttemptStrategy() {
    const data = await chrome.storage.local.get(ATTEMPT_STRATEGY_STORAGE_KEY);
    const strategy = data[ATTEMPT_STRATEGY_STORAGE_KEY];

    return (Array.isArray(strategy?.attempts) && strategy.attempts.length > 0)
        || (strategy?.logics && Object.keys(strategy.logics).length > 0)
        ? strategy
        : null;
}

function updateAttemptProgress(
    currentAttempt,
    totalAttempts
) {

    if (!attemptProgressUI) {
        return;
    }

    attemptProgressUI.innerHTML = "";

    for (
        let i = 1;
        i <= totalAttempts;
        i++
    ) {

        const div =
            document.createElement("div");

        let status = "⏳ Pending";

        if (i < currentAttempt) {
            status = "✅ Completed";
        }

        if (i === currentAttempt) {
            status = "🟢 Running";
        }

        div.className =
            "attempt-item";

        div.textContent =
            `Attempt ${i} → ${status}`;

        attemptProgressUI.appendChild(
            div
        );
    }
}

let activityLog = null;
let generateBtn = null;
let clearBtn = null;
let generateAttemptsBtn = null;
let clearAttemptsBtn = null;
let startFromAttemptInput = null;
let quickShiftAttemptInput = null;
let quickShiftBtn = null;
let resetAttemptZeroBtn = null;
let strategyContainer = null;
let strategyListenersInitialized = false;

function ensureStrategyContainerListeners() {

    console.log("LISTENERS ATTACHED");

    if (strategyListenersInitialized || !strategyContainer) {
        return;
    }

    strategyListenersInitialized = true;

    strategyContainer.addEventListener("click", (event) => {

        const logicHeader =
            event.target.closest(".logic-header");

        if (logicHeader) {
            const body =
                logicHeader.nextElementSibling;

            if (body) {
                body.classList.toggle("active");
                const chevron = logicHeader.querySelector(".logic-chevron");

                if (chevron) {
                    chevron.textContent = body.classList.contains("active") ? "⌃" : "⌄";
                }

                saveState();
            }

            return;
        }

        const header =
            event.target.closest(".accordion-header");

        if (header) {

            console.log("HEADER CLICKED");

            const body =
                header.nextElementSibling;

            if (body) {

                console.log("BODY FOUND");

                body.classList.toggle("active");

                console.log(
                    "BODY CLASS:",
                    body.className
                );

                saveState();
            }

            return;
        }

        const saveBtn =
            event.target.closest(".save-btn");

        if (saveBtn) {

            handleSaveAttempt(saveBtn);

            return;
        }

        const copyBtn =
            event.target.closest(".copy-btn");

        if (copyBtn) {

            handleCopyAttempt(copyBtn);
        }
    });

    strategyContainer.addEventListener("input", async (event) => {
        if (event.target.matches("input[id^='amount-']")) {
            await saveAttemptStrategy();
            await saveState();
        }
    });

    strategyContainer.addEventListener("change", async (event) => {
        if (
            event.target.matches("select[id^='choice-']") ||
            event.target.matches("input[id^='amount-']")
        ) {
            await saveAttemptStrategy();
            await saveState();
        }
    });
}

function renderLogs(logs) {

    activityLog.innerHTML = "";

    logs.forEach((log) => {

        const div =
            document.createElement("div");

        div.className = "log-item";

        div.textContent = log;

        activityLog.appendChild(div);
    });
}

async function addLog(message) {

    const now = new Date();

    const time =
    now.toLocaleTimeString();

    const entry =
        `${time} → ${message}`;

    const data =
        await chrome.storage.local.get(
            ["activityLogs"]
        );

    const logs =
        data.activityLogs || [];

    logs.unshift(entry);

    if (logs.length > 50) {
        logs.pop();
    }

    await chrome.storage.local.set({
        activityLogs: logs
    });

    renderLogs(logs);
}

async function saveState() {

    const data =
        await chrome.storage.local.get(
            ["activityLogs"]
        );

    syncFlipSettingsFromControls();
    syncEngineStateFromUI();

    const popupState = buildPopupStateSnapshot();

    await chrome.storage.local.set({

        engineState,

        engineStatus:
            engineStatusUI.textContent,

        activeLogicId: activeLogicId,

        currentAttempt:
            String(currentAttemptUI.textContent).trim(),

        lastResult:
            lastResultUI.textContent,

        nextChoice:
            nextChoiceUI.textContent,

        nextAmount:
            nextAmountUI.textContent,

        activityLogs:
            data.activityLogs || [],

        flipSettings: flipSettings,

        logicData: logicData,

        [POPUP_STATE_KEY]: popupState
    });
}

async function restorePersistedState() {

    if (persistedStateRestored) {
        return lastRestoredData;
    }

    console.log(
        "BEFORE RESTORE",
        engineState
    );

    const data =
        await chrome.storage.local.get([

            "engineState",

            "activityLogs",

            "engineStatus",

            "activeLogicId",

            "currentAttempt",

            "lastResult",

            "nextChoice",

            "nextAmount",

            "flipSettings",

            "logicData",

            POPUP_STATE_KEY
        ]);

    if (data.logicData && typeof data.logicData === "object" && Object.keys(data.logicData).length > 0) {
        logicData = data.logicData;
    }

    const popupState = data[POPUP_STATE_KEY] || {};

    renderLogs(
        data.activityLogs || []
    );

    engineStatusUI.textContent =
        popupState.engineStatus ??
        data.engineStatus ??
        "🔴 Stopped";

    activeLogicId =
        Number(popupState.activeLogicId ?? data.activeLogicId) || 1;

    // Only restore currentAttempt from saved state if engine is NOT running
    // If engine is running, wait for live runtime state via UPDATE_CURRENT_ATTEMPT message
    const engineStatus = popupState.engineStatus ?? data.engineStatus ?? "🔴 Stopped";
    const isEngineRunning = engineStatus.includes("Running") || engineStatus.includes("🟢");
    
    if (!isEngineRunning) {
        currentAttemptUI.textContent =
            popupState.currentAttempt ??
            data.currentAttempt ??
            String(data.engineState?.currentAttempt ?? "0");
    } else {
        // Engine is running - don't overwrite with stale saved state
        // Keep current UI value until live runtime update arrives
        console.log("[Popup] Engine is running - skipping stale currentAttempt restore, waiting for live runtime state");
    }

    if (popupState.flipSettings || data.flipSettings) {
        flipSettings = normalizeFlipSettings(popupState.flipSettings || data.flipSettings);
    }

    lastResultUI.textContent =
        popupState.lastResult ??
        data.lastResult ??
        data.engineState?.lastResult ??
        "-";

    nextChoiceUI.textContent =
        popupState.nextChoice ??
        data.nextChoice ?? "-";

    nextAmountUI.textContent =
        popupState.nextAmount ??
        data.nextAmount ?? "-";

    applyPopupStateToControls(popupState);

    syncEngineStateFromUI();

    const restoredAttempt =
        getCurrentAttemptNumber();
    const restoredTotal =
        getTotalAttemptsNumber();

    if (
        restoredTotal > 0 &&
        restoredAttempt > 0
    ) {
        updateAttemptProgress(
            restoredAttempt,
            restoredTotal
        );
    }

    persistedStateRestored = true;
    lastRestoredData = data;

    console.log(
        "AFTER RESTORE",
        engineState
    );

    console.log(
        "STATE RESTORED"
    );

    return data;
}

// AI Prediction Functions
async function initializePredictionSystem() {
    console.log('[LogicPilot AI Prediction] Initializing prediction system (popup only)');
    // Storage and initialization now handled by background service worker
    // Popup only handles display and reads persisted prediction
    
    // Load persisted prediction from storage
    try {
        const data = await chrome.storage.local.get('logicpilot_current_prediction');
        if (data.logicpilot_current_prediction) {
            console.log('[LogicPilot AI Prediction] Loaded persisted prediction:', data.logicpilot_current_prediction);
            updatePredictionUI(data.logicpilot_current_prediction, data.logicpilot_current_prediction.historyUsed);
        } else {
            // No persisted prediction, try to generate one
            await generatePrediction();
        }
    } catch (error) {
        console.error('[LogicPilot AI Prediction] Error loading persisted prediction:', error);
        await generatePrediction();
    }
    
    await updatePredictionDisplay();
}

async function generatePrediction() {
    console.log('[LogicPilot AI Prediction] Generating prediction');
    
    try {
        const latestOutcomes = await HistoryCollector.getLatestOutcomes(100);
        
        if (latestOutcomes.length < 10) {
            console.log('[LogicPilot AI Prediction] Collecting history:', latestOutcomes.length, '/ 10 minimum');
            updatePredictionUI(null, latestOutcomes.length);
            return null;
        }
        
        const features = FeatureEngine.generateFeatures(latestOutcomes);
        const prediction = PredictionEngine.predict(features);
        
        console.log('[LogicPilot AI Prediction] Prediction generated:', prediction);
        console.log('[LogicPilot AI Prediction] History used for prediction:', latestOutcomes.length);
        updatePredictionUI(prediction, latestOutcomes.length);
        
        return prediction;
        
    } catch (error) {
        console.error('[LogicPilot AI Prediction] Error generating prediction:', error);
        updatePredictionUI(null, 0);
        return null;
    }
}

async function recordOutcome(periodId, outcome) {
    console.log('[LogicPilot AI Prediction] Recording outcome:', periodId, outcome);
    
    try {
        // History storage and evaluation now handled by background service worker
        // This function is kept for potential future use
        
        // Update accuracy display
        await updatePredictionDisplay();
        
        // Generate new prediction for next round
        await generatePrediction();
        
    } catch (error) {
        console.error('[LogicPilot AI Prediction] Error recording outcome:', error);
    }
}

function updatePredictionUI(prediction, historyCount = 0) {
    if (!prediction) {
        if (predictionPeriodUI) predictionPeriodUI.textContent = '-';
        if (predictionNextUI) predictionNextUI.textContent = '-';
        if (predictionBigUI) predictionBigUI.textContent = '50.0%';
        if (predictionSmallUI) predictionSmallUI.textContent = '50.0%';
        if (predictionConfidenceUI) predictionConfidenceUI.textContent = 'LOW';
        
        if (historyCount === 0) {
            if (predictionHistoryUsedUI) predictionHistoryUsedUI.textContent = 'Waiting for historical data';
        } else if (historyCount < 10) {
            if (predictionHistoryUsedUI) predictionHistoryUsedUI.textContent = `Collecting history: ${historyCount} / 10`;
        } else {
            if (predictionHistoryUsedUI) predictionHistoryUsedUI.textContent = `${historyCount} / 100`;
        }
        return;
    }
    
    if (predictionPeriodUI) {
        predictionPeriodUI.textContent = prediction.periodId || '-';
    }
    
    if (predictionNextUI) {
        predictionNextUI.textContent = prediction.prediction || '-';
        predictionNextUI.style.color = prediction.prediction === 'BIG' ? '#22c55e' : '#f59e0b';
    }
    
    if (predictionBigUI) predictionBigUI.textContent = prediction.bigProbability + '%';
    if (predictionSmallUI) predictionSmallUI.textContent = prediction.smallProbability + '%';
    
    if (predictionConfidenceUI) {
        predictionConfidenceUI.textContent = prediction.confidence || 'LOW';
        const confColor = {
            'LOW': '#f59e0b',
            'MEDIUM': '#3b82f6',
            'HIGH': '#22c55e'
        };
        predictionConfidenceUI.style.color = confColor[prediction.confidence] || '#f59e0b';
    }
    
    if (predictionHistoryUsedUI) {
        predictionHistoryUsedUI.textContent = `${historyCount} / 100`;
    }
}

async function updatePredictionDisplay() {
    try {
        const stats = await AccuracyTracker.getAccuracyStats();
        
        if (predictionCountUI) predictionCountUI.textContent = stats.total;
        if (predictionAccuracyUI) predictionAccuracyUI.textContent = stats.overallAccuracy + '%';
        
    } catch (error) {
        console.error('[LogicPilot AI Prediction] Error updating prediction display:', error);
    }
}

async function handleSaveAttempt(btn) {

    const logicId = btn.dataset.logic;
    const attempt = btn.dataset.attempt;

    console.log(
        "SAVE CLICKED",
        "Logic:", logicId,
        "Attempt:", attempt
    );

    if (!logicData[logicId]) {
        logicData[logicId] = {
            attempts: {},
            startTime: null,
            winCount: 0,
            lossCount: 0
        };
    }

    logicData[logicId].attempts[attempt] = {
        choice: document.getElementById(`choice-${logicId}-${attempt}`).value,
        amount: Number(document.getElementById(`amount-${logicId}-${attempt}`).value)
    };

    StrategyManager.save(logicData);

    console.log(
        "AFTER SAVE",
        JSON.stringify(logicData, null, 2)
    );

    btn.innerText = "✅ Saved";
    btn.style.background = "#16a34a";

    await addLog(`Saved Logic ${logicId} Attempt ${attempt}`);
    await saveState();
}
function buildWorkflow() {

    const workflow = {};

    if (!logicData[activeLogicId]) {
        console.error("No active logic found");
        return workflow;
    }

    const activeLogic = logicData[activeLogicId];
    const attemptNumbers = Object.keys(activeLogic.attempts).map(Number).sort((a, b) => a - b);

    if (attemptNumbers.length === 0) {
        console.error("No attempts found in active logic");
        return workflow;
    }

    attemptNumbers.forEach((attemptNum, index) => {
        const strategy = activeLogic.attempts[attemptNum];

        if (!strategy) {
            console.error(`Missing strategy for attempt ${attemptNum}`);
            return;
        }

        if (!strategy.choice || !strategy.amount || strategy.amount <= 0) {
            console.error(`Invalid strategy for attempt ${attemptNum}: missing choice or invalid amount`);
            return;
        }

        workflow[attemptNum] = {
            stepId: attemptNum,
            action: "ACTION_PRIMARY",
            nextStep: attemptNum < attemptNumbers.length ? attemptNumbers[index + 1] : null,
            strategy: strategy
        };
    });

    console.log(
        "WORKFLOW GENERATED:",
        workflow
    );

    return workflow;
}

function handleCopyAttempt(btn) {
    const logicId = btn.dataset.logic;
    const current = Number(btn.dataset.attempt);
    const previous = current - 1;

    if (!logicData[logicId]) {
        alert("Logic not found.");
        return;
    }

    const previousData = logicData[logicId].attempts[previous];

    if (!previousData) {
        alert("Previous attempt not saved.");
        return;
    }

    logicData[logicId].attempts[current] = JSON.parse(JSON.stringify(previousData));
    StrategyManager.save(logicData);
    restoreValues();
    alert(`Attempt ${previous} copied to Attempt ${current}`);
    saveState();
}

async function runStartupStep(name, callback) {
    try {
        await callback();
    } catch (error) {
        console.error(`[Popup] ${name} failed:`, error);
    }
}

async function handleStartClick() {
    try {
        if (!currentAuthState.authenticated) {
            alert("Please login before starting automation.");
            return;
        }

        if (
            isSubscriptionExpired(
                currentAuthState.user,
                currentAuthState.subscription
            )
        ) {
            alert("Subscription expired. Start Automation is disabled.");
            return;
        }

        const access = await refreshAutomationAccess();

        if (!access.allowed) {
            alert(access.message || "Automation is disabled by BlackFox.");
            return;
        }

        console.log(
            "START CLICKED"
        );

        console.log(
            "LOGIC DATA:",
            logicData
        );

        console.log(
            "ENGINE STATE:",
            engineState
        );

        if (Object.keys(logicData).length === 0) {
            alert("Please generate and save a logic first!");
            return;
        }

        const shuffleConfig = getShuffleConfigFromUI();
        const executionPlan = buildExecutionPlan(shuffleConfig);

        if (!executionPlan.ok) {
            setShuffleValidationMessage(executionPlan.error);
            alert(executionPlan.error);
            return;
        }

        setShuffleValidationMessage("");
        lastExecutionPlan = {
            executionOrder: executionPlan.executionOrder,
            shuffleEnabled: Boolean(shuffleConfig.shuffleEnabled),
            shuffleFrom: shuffleConfig.shuffleFrom,
            shuffleTo: shuffleConfig.shuffleTo,
            totalLogics: shuffleConfig.totalLogics
        };
        currentLogicPosition = 0;
        activeLogicId = lastExecutionPlan.executionOrder[0] || 1;
        updateExecutionPlanDisplay(lastExecutionPlan);
        updateActiveLogicDisplay();

        // CRITICAL FIX: START MUST ALWAYS BEGIN FROM ATTEMPT 1 (unless custom starting attempt)
        // Reset engine state to ensure fresh start
        engineState.currentAttempt = 1;
        Engine.currentAttempt = 1;
        
        // Handle custom starting attempt
        const customStartAttempt = getCustomStartingAttempt();
        if (customStartAttempt && customStartAttempt > 0) {
            console.log("[Start] Using custom starting attempt:", customStartAttempt);
            
            // Validate custom attempt exists
            const activeLogic = logicData[activeLogicId];
            if (!activeLogic || !activeLogic.attempts[customStartAttempt]) {
                alert(`Attempt ${customStartAttempt} does not exist. Please generate attempts first.`);
                return;
            }
            
            // Override engine state with custom starting attempt
            engineState.currentAttempt = customStartAttempt;
            Engine.currentAttempt = customStartAttempt;
            
            console.log("[Start] Engine state updated to custom attempt:", engineState.currentAttempt);
        } else {
            console.log("[Start] Resetting to Attempt 1 for new session");
        }

        buildWorkflow();

        await startTimerAutomation();

        engineStatusUI.textContent =
            "🟢 Running";

        currentAttemptUI.textContent =
            String(engineState.currentAttempt);

            await addLog(
                `Automation Started - Logic ${activeLogicId} Attempt ${engineState.currentAttempt} | ${getShuffleApi()?.formatExecutionOrder(lastExecutionPlan.executionOrder) || ""}`
            );

        await saveState();

        console.log(
            "START SUCCESS",
            "currentAttempt:",
            engineState.currentAttempt
        );
    } catch (error) {
        console.error(
            "START ERROR:",
            error
        );
    }
}

function getCustomStartingAttempt() {
    if (!startFromAttemptInput) return null;
    
    const value = parseInt(startFromAttemptInput.value);
    if (isNaN(value) || value < 1) return null;
    
    return value;
}

function updateAttemptInputMaxValues(maxAttempts) {
    if (startFromAttemptInput) {
        startFromAttemptInput.max = maxAttempts;
        // Reset if current value exceeds new max
        if (parseInt(startFromAttemptInput.value) > maxAttempts) {
            startFromAttemptInput.value = 1;
        }
    }
    
    if (quickShiftAttemptInput) {
        quickShiftAttemptInput.max = maxAttempts;
        // Reset if current value exceeds new max
        if (parseInt(quickShiftAttemptInput.value) > maxAttempts) {
            quickShiftAttemptInput.value = 1;
        }
    }
}

async function handleQuickShift() {
    try {
        const targetAttempt = parseInt(quickShiftAttemptInput?.value);
        
        if (isNaN(targetAttempt) || targetAttempt < 1) {
            alert("Please enter a valid attempt number.");
            return;
        }
        
        const activeLogic = logicData[activeLogicId];
        if (!activeLogic || !activeLogic.attempts[targetAttempt]) {
            alert(`Attempt ${targetAttempt} does not exist. Please generate attempts first.`);
            return;
        }
        
        console.log("[Quick Shift] Shifting to attempt:", targetAttempt);
        
        // Update local state
        engineState.currentAttempt = targetAttempt;
        Engine.currentAttempt = targetAttempt;
        
        // Update UI
        currentAttemptUI.textContent = String(targetAttempt);
        
        // Send quick shift message to content script
        const tabs = await new Promise((resolve) => {
            chrome.tabs.query({ active: true, currentWindow: true }, resolve);
        });
        
        if (tabs && tabs.length > 0) {
            const result = await sendToActiveTab({
                action: "QUICK_SHIFT_ATTEMPT",
                targetAttempt: targetAttempt,
                activeLogicId: activeLogicId
            });
            
            if (result.error) {
                console.error("[Quick Shift] Failed to send message:", result.error);
                alert("Failed to send quick shift command to content script.");
                return;
            }
        }
        
        await addLog(`Quick Shift - Now at Attempt ${targetAttempt}`);
        await saveState();
        
        console.log("[Quick Shift] Successfully shifted to attempt:", targetAttempt);
        
    } catch (error) {
        console.error("[Quick Shift] Error:", error);
        alert("Quick shift failed: " + error.message);
    }
}

async function handleResetAttemptToZero() {
    console.log("[LP RESET] button clicked");
    const shouldReset = confirm("Reset current attempt to 0?");

    if (!shouldReset) {
        return;
    }

    const targetAttempt = 0;
    const totalAttempts = getTotalAttemptsNumber();
    const previousAttempt = getCurrentAttemptNumber();

    console.log("[LP RESET] previous attempt:", previousAttempt);
    console.log("[LP RESET] setting attempt:", targetAttempt);

    const result = await sendToActiveTab({
        action: "RESET_ATTEMPT_TO_ZERO",
        activeLogicId
    });

    if (result.error) {
        console.error("[Reset Attempt] Failed to send reset command:", result.error);
        alert("Failed to send reset command to content script.");
        return;
    }

    console.log("[LP RESET] message sent");
    if (result.currentAttempt !== undefined) {
        console.log("[LP RESET] runtime attempt:", result.currentAttempt);
    }

    engineState.currentAttempt = targetAttempt;
    Engine.currentAttempt = targetAttempt;

    currentAttemptUI.textContent = String(targetAttempt);
    updateSessionProgressUI({ currentAttempt: targetAttempt });

    if (totalAttempts > 0) {
        updateAttemptProgress(targetAttempt, totalAttempts);
    }

    await addLog("Reset current attempt to 0");
    await persistSessionProgressUI();
    await saveState();

    console.log("[LP RESET] final attempt after sync:", getCurrentAttemptNumber());
}

async function handlePauseClick() {
    await stopTimerAutomation();

    engineStatusUI.textContent =
        "🟡 Paused";

    await addLog(
        "Automation Paused"
    );

    await saveState();
}

async function handleStopClick() {
    await stopTimerAutomation();

    engineStatusUI.textContent =
        "🔴 Stopped";

    // CRITICAL FIX: Reset attempt state on STOP to prevent resume from old attempt
    console.log("[Popup] STOP - Resetting attempt state for fresh start");
    engineState.currentAttempt = 1;
    Engine.currentAttempt = 1;
    currentAttemptUI.textContent = "1";

    await addLog(
        "Automation Stopped"
    );

    await saveState();
}

async function handleWinClick() {
    Engine.processResult("WIN");
    lastResultUI.innerText = "WIN";

    const nextData =
        logicData[activeLogicId]?.attempts?.[Engine.currentAttempt];

    if (nextData && nextData.choice) {
        nextChoiceUI.innerText = nextData.choice;
        nextAmountUI.innerText = nextData.amount;
        console.log("NEXT BET", nextData);
    }

    await syncAttemptUI(
        Engine.currentAttempt,
        getTotalAttemptsNumber(),
        true
    );
}

async function handleLossClick() {
    Engine.processResult("LOSS");
    lastResultUI.innerText = "LOSS";

    const nextData =
        logicData[activeLogicId]?.attempts?.[Engine.currentAttempt];

    if (nextData && nextData.choice) {
        nextChoiceUI.innerText = nextData.choice;
        nextAmountUI.innerText = nextData.amount;
        console.log("NEXT BET", nextData);
    }

    await syncAttemptUI(
        Engine.currentAttempt,
        getTotalAttemptsNumber(),
        true
    );
}

function registerPopupEventListeners() {
    showLoginBtn?.addEventListener(
        "click",
        () => showAuthScreen("login")
    );

    showRegisterBtn?.addEventListener(
        "click",
        () => showAuthScreen("register")
    );

    loginForm?.addEventListener(
        "submit",
        handleLoginSubmit
    );

    registerForm?.addEventListener(
        "submit",
        handleRegisterSubmit
    );

    logoutBtn?.addEventListener(
        "click",
        handleLogoutClick
    );

    chrome.runtime.onMessage.addListener((message) => {
        if(message.action === "UPDATE_CURRENT_ATTEMPT" && message.currentAttempt !== undefined){
            console.log("[Popup] Received currentAttempt update:", message.currentAttempt);
            if (message.activeLogicId !== undefined) {
                activeLogicId = Number(message.activeLogicId) || activeLogicId;
                setControlValue("manualFlipLogic", activeLogicId);
                updateActiveLogicDisplay();
            }
            // Always update UI from live runtime state
            currentAttemptUI.textContent = String(message.currentAttempt);
            engineState.currentAttempt = message.currentAttempt;
            Engine.currentAttempt = message.currentAttempt;

            const totalAttempts = getTotalAttemptsNumber();
            if(totalAttempts > 0){
                updateAttemptProgress(message.currentAttempt, totalAttempts);
            }

            // Don't save state here - let the runtime state be the source of truth
            // Saving here could overwrite live state with stale data
            console.log("[Popup] Control Panel updated with live runtime currentAttempt:", message.currentAttempt);
        }

        // Analyzer integration - receive outcomes from content script
        if(message.action === "RECORD_OUTCOME" && outcomeAnalyzer) {
            console.log("[ANALYZER] Received outcome:", message.periodId, message.outcome);
            outcomeAnalyzer.addOutcome(message.periodId, message.outcome);
            updateAnalyzerUI();
            saveAnalyzerState();
        }

        // Analyzer integration - receive historical backfill
        if(message.action === "BACKFILL_HISTORY" && outcomeAnalyzer && message.outcomes) {
            console.log("[ANALYZER] Received backfill:", message.outcomes.length, "outcomes");
            outcomeAnalyzer.addBackfill(message.outcomes);
            updateAnalyzerUI();
            saveAnalyzerState();
        }

        if(message.action === "UPDATE_CURRENT_MODE" && message.currentMode !== undefined){
            console.log("[Popup] Received currentMode update (deprecated in V3.0):", message.currentMode);
        }

        if (message.action === "SESSION_STATE_UPDATE" && message.session) {
            applySessionUpdateToPopup(message.session);
        }

        if(message.action === "PREDICTION_UPDATED" && message.prediction){
            console.log("[Popup] Received prediction update from background:", message.prediction);
            updatePredictionUI(message.prediction, message.prediction.historyUsed);
            updatePredictionDisplay();
        }
    });

    startBtnUI?.addEventListener(
        "click",
        handleStartClick
    );

    startAutomationBtn?.addEventListener(
        "click",
        handleStartClick
    );

    document.getElementById("pauseBtn")?.addEventListener(
        "click",
        handlePauseClick
    );

    document.getElementById("stopBtn")?.addEventListener(
        "click",
        handleStopClick
    );

    document.getElementById("stopAutomationBtn")?.addEventListener(
        "click",
        handleStopClick
    );

    generateAttemptsBtn?.addEventListener(
        "click",
        async () => {
            console.log("GENERATE ATTEMPTS CLICKED");
            await generateAttempts({
                isNewGeneration: true
            });

            console.log("ATTEMPTS GENERATED");
        }
    );

    clearAttemptsBtn?.addEventListener(
        "click",
        clearAllLogic
    );

    // Coordination mode event listeners
    document.getElementById("resetSessionBtn")?.addEventListener(
        "click",
        handleResetSession
    );

    document.getElementById("selectAuthorityMode")?.addEventListener(
        "click",
        selectAuthorityMode
    );

    document.getElementById("selectWorkerMode")?.addEventListener(
        "click",
        selectWorkerMode
    );

    document.getElementById("changeModeBtn")?.addEventListener(
        "click",
        handleChangeMode
    );

    document.getElementById("changeModeBtnWorker")?.addEventListener(
        "click",
        handleChangeMode
    );

    document.getElementById("connectToAuthorityBtn")?.addEventListener(
        "click",
        connectToAuthority
    );

    document.getElementById("copyDeviceCodeBtn")?.addEventListener(
        "click",
        copyDeviceCode
    );

    quickShiftBtn?.addEventListener(
        "click",
        handleQuickShift
    );

    resetAttemptZeroBtn?.addEventListener(
        "click",
        handleResetAttemptToZero
    );

    document.getElementById("manualFlipBtn")?.addEventListener(
        "click",
        async () => {
            const targetLogicId = parseInt(document.getElementById("manualFlipLogic").value);
            await performManualFlip(targetLogicId);
        }
    );

    const bindFlipToggle = (id, applyValue) => {
        const toggle = document.getElementById(id);

        toggle?.addEventListener("change", (event) => {
            applyValue(event.target.checked);
            updateToggleLabel(event.target);
            saveState();
        });

        updateToggleLabel(toggle);
    };

    bindFlipToggle("autoFlip1Enabled", (isEnabled) => {
        flipSettings.autoFlip1.enabled = isEnabled;
    });

    bindFlipToggle("autoFlip2Enabled", (isEnabled) => {
        flipSettings.autoFlip2.enabled = isEnabled;
    });

    bindFlipToggle("shuffleFlipEnabled", (isEnabled) => {
        flipSettings.shuffleFlip.enabled = isEnabled;
    });

    document.getElementById("autoFlip1Minutes")?.addEventListener("change", (event) => {
        flipSettings.autoFlip1.minutes = parseInt(event.target.value);
        saveState();
    });

    document.getElementById("autoFlip2Attempt")?.addEventListener("change", (event) => {
        flipSettings.autoFlip2.attempt = parseInt(event.target.value);
        saveState();
    });

    document.getElementById("autoFlip1Logic")?.addEventListener("change", (event) => {
        const value = event.target.value;
        flipSettings.autoFlip1.targetLogicId = value === "random" ? "random" : parseInt(value) || null;
        saveState();
    });

    document.getElementById("autoFlip2Logic")?.addEventListener("change", (event) => {
        const value = event.target.value;
        flipSettings.autoFlip2.targetLogicId = value === "random" ? "random" : parseInt(value) || null;
        saveState();
    });

    document.getElementById("shuffleTriggerType")?.addEventListener("change", (event) => {
        flipSettings.shuffleFlip.triggerType = event.target.value === "loss" ? "loss" : "win";
        saveState();
    });

    document.getElementById("flipRecoveryMode")?.addEventListener("change", (event) => {
        flipSettings.flipRecoveryMode = event.target.value;
        saveState();
    });

    document.getElementById("numberOfLogic")?.addEventListener("change", () => {
        const totalLogics = getLogicCountFromUI() || 1;
        const shuffleToInput = document.getElementById("shuffleToLogic");
        const shuffleFromInput = document.getElementById("shuffleFromLogic");
        if (shuffleFromInput) {
            shuffleFromInput.max = totalLogics;
        }
        if (shuffleToInput) {
            shuffleToInput.max = totalLogics;
            if (!shuffleToInput.value || Number(shuffleToInput.value) > totalLogics) {
                shuffleToInput.value = String(totalLogics);
            }
        }
        saveState();
    });
    document.getElementById("attemptsPerLogic")?.addEventListener("change", () => {
        syncAttemptsPerLogicAlias(getAttemptsPerLogicFromUI());
        saveState();
    });
    document.getElementById("logicShuffleEnabled")?.addEventListener("change", saveState);
    document.getElementById("shuffleFromLogic")?.addEventListener("change", saveState);
    document.getElementById("shuffleToLogic")?.addEventListener("change", saveState);
    document.getElementById("manualFlipLogic")?.addEventListener("change", saveState);

    document.getElementById("winBtn")?.addEventListener(
        "click",
        handleWinClick
    );

    document.getElementById("lossBtn")?.addEventListener(
        "click",
        handleLossClick
    );
}

document.addEventListener(
    "DOMContentLoaded",
    async () => {

        currentAttemptUI = document.getElementById("currentAttempt");
        activeLogicUI = document.getElementById("activeLogic");
        activeLogicSummaryUI = document.getElementById("activeLogicSummaryValue");
        nextChoiceUI = document.getElementById("nextChoice");
        nextAmountUI = document.getElementById("nextAmount");
        engineStatusUI = document.getElementById("engineStatus");
        lastResultUI = document.getElementById("lastResult");
        attemptProgressUI = document.getElementById("attemptProgress");
        activityLog = document.getElementById("activityLog");
        generateAttemptsBtn = document.getElementById("generateAttemptsBtn");
        clearAttemptsBtn = document.getElementById("clearAttemptsBtn");
        startFromAttemptInput = document.getElementById("startFromAttempt");
        quickShiftAttemptInput = document.getElementById("quickShiftAttempt");
        quickShiftBtn = document.getElementById("quickShiftBtn");
        resetAttemptZeroBtn = document.getElementById("resetAttemptZeroBtn");
        strategyContainer = document.getElementById("strategyContainer");
        authPanel = document.getElementById("authPanel");
        sessionPanel = document.getElementById("sessionPanel");
        automationApp = document.getElementById("automationApp");
        authMessage = document.getElementById("authMessage");
        loginForm = document.getElementById("loginForm");
        registerForm = document.getElementById("registerForm");
        showLoginBtn = document.getElementById("showLoginBtn");
        showRegisterBtn = document.getElementById("showRegisterBtn");
        logoutBtn = document.getElementById("logoutBtn");
        startAutomationBtn = document.getElementById("startAutomationBtn");
        startBtnUI = document.getElementById("startBtn");

        // Prediction UI elements
        predictionPeriodUI = document.getElementById("predictionPeriod");
        predictionNextUI = document.getElementById("predictionNext");
        predictionBigUI = document.getElementById("predictionBig");
        predictionSmallUI = document.getElementById("predictionSmall");
        predictionConfidenceUI = document.getElementById("predictionConfidence");
        predictionCountUI = document.getElementById("predictionCount");
        predictionAccuracyUI = document.getElementById("predictionAccuracy");
        predictionHistoryUsedUI = document.getElementById("predictionHistoryUsed");

        // Analyzer UI elements
        analyzerSamplesUI = document.getElementById("analyzerSamples");
        analyzerStatusUI = document.getElementById("analyzerStatus");
        analyzerBigPercentUI = document.getElementById("analyzerBigPercent");
        analyzerSmallPercentUI = document.getElementById("analyzerSmallPercent");
        analyzerPredictionUI = document.getElementById("analyzerPrediction");
        analyzerConfidenceUI = document.getElementById("analyzerConfidence");
        analyzerAccuracyUI = document.getElementById("analyzerAccuracy");
        analyzerPredictionCountUI = document.getElementById("analyzerPredictionCount");
        analyzerModelEdgeUI = document.getElementById("analyzerModelEdge");
        viewAnalysisBtn = document.getElementById("viewAnalysisBtn");

        registerPopupEventListeners();

        await runStartupStep("auth initialization", initializeAuthFlow);
        await runStartupStep("state restore", restorePersistedState);
        await runStartupStep("app initialization", initializeApp);
        await runStartupStep("prediction initialization", initializePredictionSystem);
        await runStartupStep("analyzer initialization", initializeAnalyzer);
    }
);

async function initializeApp(){

    console.log(
        "BEFORE INIT",
        engineState
    );

    const data =
        await restorePersistedState();

    const popupState = data?.[POPUP_STATE_KEY] || {};
    const savedAttemptStrategy = await loadAttemptStrategy();

    if (savedAttemptStrategy) {
        applyAttemptStrategyToLogicData(savedAttemptStrategy);
        await generateAttempts({
            restoredState: popupState,
            attemptStrategy: savedAttemptStrategy,
            skipSave: true
        });
    }

    applyPopupStateToControls(popupState);

    console.log(
        "AFTER INIT",
        engineState
    );
}

async function loadSavedLogic() {

    logicData =
        await StrategyManager.load();

    console.log(
        "Loaded Logic",
        logicData
    );
}

async function startTimerAutomation() {

    if(!Engine || !Engine.start) {
        console.error("[Popup] Engine not loaded - automation.js missing?");
        return false;
    }

    if(Object.keys(logicData).length === 0) {
        console.error("[Popup] No logic created yet");
        return false;
    }

    const activeLogic = logicData[activeLogicId];
    if(!activeLogic) {
        console.error("[Popup] Active logic not found:", activeLogicId);
        return false;
    }

    const totalAttempts = Object.keys(activeLogic.attempts).length;

    Engine.start();
    Engine.timerAutomationEnabled = true;

    // Send message to content script
    try {

        const tabs = await new Promise((resolve) => {
            chrome.tabs.query(
                { active: true, currentWindow: true },
                resolve
            );
        });

        if(!tabs || tabs.length === 0) {
            console.error("[Popup] No active tab found");
            return false;
        }

        const tab = tabs[0];

        // Validate URL - must be betting website
        const url = tab.url;
        const supportedBettingHosts = [
            "damanworld.org",
            "damanapp.download",
            "bdggame.typingmaster.in",
            "bdg6848.com"
        ];
        const isBettingSite = url && supportedBettingHosts.some(host => url.includes(host));

        if(!isBettingSite) {
            console.error("[Popup] Active tab is not a betting site:", url);
            alert("Please open a supported betting website (damanworld.org, damanapp.download, bdggame.typingmaster.in, or bdg6848.com) and try again.");
            return false;
        }

        console.log("[Popup] Sending message to tab:", tab.id, "URL:", url);
        console.log("[Popup] Active Logic:", activeLogicId, "Attempts:", totalAttempts);

        // Get custom starting attempt
        const customStartingAttempt = getCustomStartingAttempt();
        console.log("[Popup] Custom starting attempt:", customStartingAttempt);

        const startPayload = {
            action: "START_TIMER_AUTOMATION",
            logicData: logicData,
            activeLogicId: activeLogicId,
            totalAttempts: totalAttempts,
            customStartingAttempt: customStartingAttempt,
            executionOrder: lastExecutionPlan.executionOrder,
            currentLogicPosition: currentLogicPosition,
            shuffleEnabled: Boolean(lastExecutionPlan.shuffleEnabled),
            shuffleFrom: lastExecutionPlan.shuffleFrom,
            shuffleTo: lastExecutionPlan.shuffleTo
        };

        // Try sending message, inject content script if needed
        chrome.tabs.sendMessage(
            tab.id,
            startPayload,
            (response) => {
                if (chrome.runtime.lastError) {
                    console.error("[Popup] Error Message:", chrome.runtime.lastError.message);
                    console.dir(chrome.runtime.lastError);

                    // If content script not loaded, inject it
                    if(chrome.runtime.lastError.message.includes("Receiving end does not exist") ||
                       chrome.runtime.lastError.message.includes("Could not establish connection")) {
                        console.log("[Popup] Content script not loaded, injecting...");
                        chrome.scripting.executeScript({
                            target: { tabId: tab.id },
                            files: ["content.js"]
                        }, () => {
                            if(chrome.runtime.lastError) {
                                console.error("[Popup] Failed to inject content script:", chrome.runtime.lastError);
                            } else {
                                console.log("[Popup] Content script injected, retrying message...");
                                // Retry message after injection
                                setTimeout(() => {
                                    chrome.tabs.sendMessage(
                                        tab.id,
                                        startPayload,
                                        (retryResponse) => {
                                            if(chrome.runtime.lastError) {
                                                console.error("[Popup] Retry failed:", chrome.runtime.lastError);
                                            } else {
                                                console.log("[Popup] ✅ Timer automation started (after injection)");
                                            }
                                        }
                                    );
                                }, 500);
                            }
                        });
                    }
                } else {
                    console.log("[Popup] ✅ Timer automation started");
                }
            }
        );

        return true;

    } catch(error) {

        console.error("[Popup] Error starting automation:", error);
        return false;

    }

}

async function stopTimerAutomation() {

    if(!Engine) {
        console.error("[Popup] Engine not loaded");
        return false;
    }

    Engine.stop();
    Engine.timerAutomationEnabled = false;

    try {

        const tabs = await new Promise((resolve) => {
            chrome.tabs.query(
                { active: true, currentWindow: true },
                resolve
            );
        });

        if(tabs && tabs.length > 0) {

            chrome.tabs.sendMessage(
                tabs[0].id,
                { action: "STOP_TIMER_AUTOMATION" },
                () => {
                    // Ignore errors - tab might have changed
                }
            );

        }

        console.log("[Popup] ✅ Timer automation stopped");
        return true;

    } catch(error) {

        console.error("[Popup] Error stopping automation:", error);
        return false;

    }

}

async function generateAttempts(
    options = {}
) {

    console.log("GENERATE ATTEMPTS STARTED", options);

    const restoredState = options.restoredState || {};
    const savedAttempts = options.attemptStrategy?.attempts;
    const numberOfLogics =
        Number(restoredState.numberOfLogic) ||
        getLogicCountFromUI() ||
        1;

    const attemptsPerLogic =
        savedAttempts?.length ||
        Number(restoredState.attemptsPerLogic) ||
        Number(restoredState.numberOfAttempts) ||
        getAttemptsPerLogicFromUI() ||
        1;

    setControlValue("numberOfLogic", numberOfLogics);
    syncAttemptsPerLogicAlias(attemptsPerLogic);
    updateAttemptInputMaxValues(attemptsPerLogic);

    const executionPlan = buildExecutionPlan({
        totalLogics: numberOfLogics,
        shuffleEnabled: Boolean(document.getElementById("logicShuffleEnabled")?.checked),
        shuffleFrom: Number(document.getElementById("shuffleFromLogic")?.value || 1),
        shuffleTo: Number(document.getElementById("shuffleToLogic")?.value || numberOfLogics)
    });

    if (!executionPlan.ok) {
        setShuffleValidationMessage(executionPlan.error);
        alert(executionPlan.error);
        return;
    }

    setShuffleValidationMessage("");

    console.log("LOGICS TO GENERATE:", numberOfLogics);
    console.log("ATTEMPTS PER LOGIC:", attemptsPerLogic);

    if (options.isNewGeneration) {
        activeLogicId = 1;
    }

    applyGeneratedLogicsToState(numberOfLogics, attemptsPerLogic, !options.isNewGeneration);

    if (!logicData[activeLogicId]) {
        activeLogicId = 1;
    }

    strategyContainer.innerHTML = "";

    const expandedAttemptIds = restoredState.expandedAttemptIds || [];

    for (let logicId = 1; logicId <= numberOfLogics; logicId++) {
        const logicCard = document.createElement("div");
        logicCard.className = "logic-card";
        logicCard.dataset.logic = String(logicId);

        const logicBody = document.createElement("div");
        logicBody.className = `logic-body ${logicId === activeLogicId ? "active" : ""}`;

        logicCard.innerHTML = `
            <div class="logic-header">
                <div class="logic-header-main">
                    <span class="logic-indicator" style="background:${getLogicColor(logicId)}"></span>
                    <span class="logic-title">Logic ${logicId}</span>
                </div>
                <div class="logic-badges">
                    <span class="logic-badge starting">STARTING</span>
                    <span class="logic-badge running">RUNNING</span>
                </div>
                <span class="logic-chevron">⌃</span>
            </div>
        `;

        logicCard.appendChild(logicBody);
        strategyContainer.appendChild(logicCard);

        for (let attemptNum = 1; attemptNum <= attemptsPerLogic; attemptNum++) {

            const card = document.createElement("div");
            card.className = "accordion-card";
            card.dataset.attemptKey = `${logicId}-${attemptNum}`;

            const isAttemptExpanded = expandedAttemptIds.includes(card.dataset.attemptKey);
            const attemptData = logicData[logicId].attempts[attemptNum];
            const attemptColor = attemptData ? "#16a34a" : "#dc2626";

            card.innerHTML = `

                <div class="accordion-header">
                    <span class="attempt-indicator" style="background:${attemptColor}"></span>
                    <span>Attempt ${attemptNum}</span>
                </div>

                <div class="accordion-body ${isAttemptExpanded ? "active" : ""}">

                    <label>Choice</label>

                    <select id="choice-${logicId}-${attemptNum}">
                        <option value="big">Big</option>
                        <option value="small">Small</option>
                    </select>

                    <label>Amount</label>

                    <input
                        type="number"
                        id="amount-${logicId}-${attemptNum}"
                        value=""
                        placeholder="Enter amount"
                    >

                    <button class="save-btn" data-logic="${logicId}" data-attempt="${attemptNum}">
                        Save
                    </button>

                </div>
            `;

            logicBody.appendChild(card);
        }
    }

    lastExecutionPlan = {
        executionOrder: executionPlan.executionOrder,
        shuffleEnabled: Boolean(executionPlan.shuffleEnabled),
        shuffleFrom: executionPlan.shuffleFrom || 1,
        shuffleTo: executionPlan.shuffleTo || numberOfLogics,
        totalLogics: numberOfLogics
    };
    currentLogicPosition = lastExecutionPlan.executionOrder.indexOf(activeLogicId);
    if (currentLogicPosition < 0) {
        currentLogicPosition = 0;
        activeLogicId = lastExecutionPlan.executionOrder[0] || 1;
    }
    updateExecutionPlanDisplay(lastExecutionPlan);
    updateActiveLogicDisplay();

    // Update manual flip dropdown
    updateManualFlipDropdown();

    // Update auto flip dropdowns
    updateAutoFlipDropdowns();

    if (options.isNewGeneration) {
        await addLog(`Generated ${numberOfLogics} logics with ${attemptsPerLogic} attempts each`);
    }

    ensureStrategyContainerListeners();
    restoreValues();
    applyPopupStateToControls(restoredState);

    if (!options.skipSave) {
        await saveAttemptStrategy();
        await saveState();
    }
}

async function initializeAnalyzer() {
    console.log('[ANALYZER] Initializing Outcome Analyzer...');
    
    // Initialize analyzer instance
    outcomeAnalyzer = new OutcomeAnalyzer();
    
    // Load saved analyzer state if available
    const savedAnalyzerState = await chrome.storage.local.get('analyzerState');
    if (savedAnalyzerState.analyzerState) {
        try {
            outcomeAnalyzer.fromJSON(savedAnalyzerState.analyzerState);
            console.log('[ANALYZER] Loaded saved state:', outcomeAnalyzer.getSampleCount(), 'samples');
        } catch (e) {
            console.error('[ANALYZER] Failed to load saved state:', e);
        }
    }
    
    // Update UI
    updateAnalyzerUI();
    
    // Set up event listener for view analysis button
    if (viewAnalysisBtn) {
        viewAnalysisBtn.addEventListener('click', showDetailedAnalysis);
    }
    
    console.log('[ANALYZER] Initialization complete');
}

function updateAnalyzerUI() {
    if (!outcomeAnalyzer) return;
    
    const sampleCount = outcomeAnalyzer.getSampleCount();
    const prediction = outcomeAnalyzer.generatePrediction();
    const accuracy = outcomeAnalyzer.getPredictionAccuracy();
    
    // Update samples
    if (analyzerSamplesUI) {
        analyzerSamplesUI.textContent = sampleCount;
    }
    
    // Update status
    if (analyzerStatusUI) {
        if (sampleCount < 100) {
            analyzerStatusUI.textContent = 'LOW DATA';
            analyzerStatusUI.style.color = '#fbbf24';
        } else if (sampleCount < 500) {
            analyzerStatusUI.textContent = 'LEARNING';
            analyzerStatusUI.style.color = '#60a5fa';
        } else {
            analyzerStatusUI.textContent = 'READY';
            analyzerStatusUI.style.color = '#4ade80';
        }
    }
    
    // Update probabilities
    if (analyzerBigPercentUI) {
        analyzerBigPercentUI.textContent = prediction.bigProbability.toFixed(1) + '%';
    }
    if (analyzerSmallPercentUI) {
        analyzerSmallPercentUI.textContent = prediction.smallProbability.toFixed(1) + '%';
    }
    
    // Update prediction
    if (analyzerPredictionUI) {
        if (prediction.prediction === 'INSUFFICIENT_DATA') {
            analyzerPredictionUI.textContent = '-';
            analyzerPredictionUI.style.color = '#94a3b8';
        } else {
            analyzerPredictionUI.textContent = prediction.prediction;
            analyzerPredictionUI.style.color = prediction.prediction === 'BIG' ? '#f87171' : '#60a5fa';
        }
    }
    
    // Update confidence
    if (analyzerConfidenceUI) {
        analyzerConfidenceUI.textContent = prediction.confidence;
        if (prediction.confidence === 'HIGH') {
            analyzerConfidenceUI.style.color = '#4ade80';
        } else if (prediction.confidence === 'MEDIUM') {
            analyzerConfidenceUI.style.color = '#fbbf24';
        } else {
            analyzerConfidenceUI.style.color = '#94a3b8';
        }
    }
    
    // Update accuracy
    if (analyzerAccuracyUI) {
        analyzerAccuracyUI.textContent = accuracy.accuracy.toFixed(1) + '%';
    }
    
    // Update prediction count
    if (analyzerPredictionCountUI) {
        analyzerPredictionCountUI.textContent = accuracy.total;
    }
    
    // Run backtest and update model edge
    const backtest = outcomeAnalyzer.runWalkForwardBacktest(100);
    if (backtest && backtest.totalPredictions > 50) {
        if (analyzerModelEdgeUI) {
            const edge = backtest.modelEdge;
            if (edge > 2) {
                analyzerModelEdgeUI.textContent = '+' + edge.toFixed(1) + '%';
                analyzerModelEdgeUI.style.color = '#4ade80';
            } else if (edge < -2) {
                analyzerModelEdgeUI.textContent = edge.toFixed(1) + '%';
                analyzerModelEdgeUI.style.color = '#f87171';
            } else {
                analyzerModelEdgeUI.textContent = 'NEUTRAL';
                analyzerModelEdgeUI.style.color = '#94a3b8';
            }
        }
    } else {
        if (analyzerModelEdgeUI) {
            analyzerModelEdgeUI.textContent = 'N/A';
            analyzerModelEdgeUI.style.color = '#94a3b8';
        }
    }
}

function showDetailedAnalysis() {
    if (!outcomeAnalyzer) {
        alert('Analyzer not initialized');
        return;
    }
    
    const sampleCount = outcomeAnalyzer.getSampleCount();
    const prediction = outcomeAnalyzer.generatePrediction();
    const windows = outcomeAnalyzer.calculateMultipleWindows();
    const transition = outcomeAnalyzer.calculateTransitionProbability();
    const streak = outcomeAnalyzer.getCurrentStreak();
    const accuracy = outcomeAnalyzer.getPredictionAccuracy();
    const backtest = outcomeAnalyzer.runWalkForwardBacktest(100);
    
    let analysis = `
=== OUTCOME ANALYZER DETAILED REPORT ===

SAMPLE SIZE: ${sampleCount}
MODEL STATUS: ${sampleCount < 100 ? 'LOW DATA' : (sampleCount < 500 ? 'LEARNING' : 'READY')}

=== CURRENT PREDICTION ===
Prediction: ${prediction.prediction}
BIG Probability: ${prediction.bigProbability.toFixed(1)}%
SMALL Probability: ${prediction.smallProbability.toFixed(1)}%
Confidence: ${prediction.confidence}

=== FREQUENCY ANALYSIS ===
`;
    
    for (const window in windows) {
        analysis += `Last ${window}: BIG ${windows[window].bigPercent.toFixed(1)}% / SMALL ${windows[window].smallPercent.toFixed(1)}%\n`;
    }
    
    analysis += `
=== TRANSITION PROBABILITY ===
After BIG: BIG ${transition.pBigGivenBig.toFixed(1)}% / SMALL ${transition.pSmallGivenBig.toFixed(1)}%
After SMALL: BIG ${transition.pBigGivenSmall.toFixed(1)}% / SMALL ${transition.pSmallGivenSmall.toFixed(1)}%

=== CURRENT STREAK ===
Current: ${streak.outcome} x${streak.length}

=== MODEL PERFORMANCE ===
Total Predictions: ${accuracy.total}
Correct: ${accuracy.correct}
Incorrect: ${accuracy.incorrect}
Accuracy: ${accuracy.accuracy.toFixed(1)}%
BIG Precision: ${accuracy.bigPrecision.toFixed(1)}%
SMALL Precision: ${accuracy.smallPrecision.toFixed(1)}%
`;
    
    if (backtest) {
        analysis += `
=== WALK-FORWARD BACKTEST ===
Backtest Predictions: ${backtest.totalPredictions}
Backtest Accuracy: ${backtest.accuracy.toFixed(1)}%
Baseline Accuracy: ${backtest.baselineAccuracy.toFixed(1)}%
Model Edge: ${backtest.modelEdge.toFixed(1)}%
`;
    }
    
    alert(analysis);
}

async function saveAnalyzerState() {
    if (!outcomeAnalyzer) return;
    
    try {
        await chrome.storage.local.set({
            analyzerState: outcomeAnalyzer.toJSON()
        });
        console.log('[ANALYZER] State saved');
    } catch (e) {
        console.error('[ANALYZER] Failed to save state:', e);
    }
}

function restoreValues(){
    console.log(
    "RESTORE VALUES RUNNING"
);

    for (const logicId in logicData) {
        const logic = logicData[logicId];
        for (const attempt in logic.attempts) {
            const data = logic.attempts[attempt];

            const choice = document.getElementById(`choice-${logicId}-${attempt}`);
            const amount = document.getElementById(`amount-${logicId}-${attempt}`);

            if (choice && data.choice) {
                choice.value = data.choice;
            }

            if (amount && data.amount !== undefined && data.amount !== null) {
                amount.value = data.amount;
            }
        }
    }

    // Update active logic display
    if (activeLogicUI) {
        activeLogicUI.textContent = `Logic ${activeLogicId}`;
    }
    updateActiveLogicDisplay();
}


async function clearAllLogic(){

    const confirmDelete =
    confirm(
        "Delete all saved Logic blocks?"
    );

    if(!confirmDelete){
        return;
    }

    logicData = {};
    activeLogicId = 1;

    await chrome.storage.local.remove([
        ATTEMPT_STRATEGY_STORAGE_KEY,
        "strategy",
        "logicData"
    ]);

    strategyContainer.innerHTML = "";
    document.getElementById("numberOfAttempts").value = 10;
    currentAttemptUI.innerText = "0";
    activeLogicUI.innerText = "Logic 1";
    updateActiveLogicDisplay();

    alert("All Logic Cleared ✅");
    console.log("All Logic Deleted");

}

function updateManualFlipDropdown() {
    const dropdown = document.getElementById("manualFlipLogic");
    if (!dropdown) return;

    dropdown.innerHTML = "";
    for (const logicId in logicData) {
        const option = document.createElement("option");
        option.value = logicId;
        option.textContent = `Logic ${logicId}`;
        dropdown.appendChild(option);
    }
}

function updateAutoFlipDropdowns() {
    const dropdown1 = document.getElementById("autoFlip1Logic");
    const dropdown2 = document.getElementById("autoFlip2Logic");

    if (dropdown1) {
        dropdown1.innerHTML = "";
        // Add Random Logic option
        const randomOption1 = document.createElement("option");
        randomOption1.value = "random";
        randomOption1.textContent = "Random Logic";
        dropdown1.appendChild(randomOption1);
        
        for (const logicId in logicData) {
            const option = document.createElement("option");
            option.value = logicId;
            option.textContent = `Logic ${logicId}`;
            dropdown1.appendChild(option);
        }
    }

    if (dropdown2) {
        dropdown2.innerHTML = "";
        // Add Random Logic option
        const randomOption2 = document.createElement("option");
        randomOption2.value = "random";
        randomOption2.textContent = "Random Logic";
        dropdown2.appendChild(randomOption2);
        
        for (const logicId in logicData) {
            const option = document.createElement("option");
            option.value = logicId;
            option.textContent = `Logic ${logicId}`;
            dropdown2.appendChild(option);
        }
    }
}

async function performManualFlip(targetLogicId) {
    if (!logicData[targetLogicId]) {
        alert(`Logic ${targetLogicId} does not exist.`);
        return;
    }

    const previousAttempt = engineState.currentAttempt;
    const previousAmount = Engine.lastBetAmount || null;

    activeLogicId = targetLogicId;

    // Handle recovery modes
    const recoveryMode = flipSettings.flipRecoveryMode;
    const targetLogicAttempts = logicData[targetLogicId].attempts;
    const maxAttempts = Object.keys(targetLogicAttempts).length;

    if (recoveryMode === "reset") {
        // Mode 1: Reset Attempt (default)
        engineState.currentAttempt = 1;
        Engine.currentAttempt = 1;
        Engine.lastBetAmount = null;
    } else if (recoveryMode === "carry_attempt") {
        // Mode 2: Carry Attempt
        engineState.currentAttempt = Math.min(previousAttempt, maxAttempts);
        Engine.currentAttempt = engineState.currentAttempt;
        Engine.lastBetAmount = null;
    } else if (recoveryMode === "carry_attempt_amount") {
        // Mode 3: Carry Attempt + Amount
        engineState.currentAttempt = Math.min(previousAttempt, maxAttempts);
        Engine.currentAttempt = engineState.currentAttempt;
        // Preserve previous amount
        Engine.lastBetAmount = previousAmount;
    }

    // Update UI
    if (activeLogicUI) {
        activeLogicUI.textContent = `Logic ${activeLogicId}`;
    }
    if (currentAttemptUI) {
        currentAttemptUI.textContent = String(engineState.currentAttempt);
    }
    setControlValue("manualFlipLogic", activeLogicId);
    updateActiveLogicDisplay();

    // Send message to content script to switch logic
    try {
        const tabs = await new Promise((resolve) => {
            chrome.tabs.query({ active: true, currentWindow: true }, resolve);
        });

        if (tabs && tabs.length > 0) {
            chrome.tabs.sendMessage(
                tabs[0].id,
                {
                    action: "SWITCH_LOGIC",
                    activeLogicId: activeLogicId,
                    logicData: logicData[activeLogicId],
                    flipRecoveryMode: recoveryMode
                },
                (response) => {
                    if (chrome.runtime.lastError) {
                        console.error("[Popup] Failed to switch logic:", chrome.runtime.lastError);
                    } else {
                        console.log("[Popup] ✅ Logic switched successfully");
                    }
                }
            );
        }
    } catch (error) {
        console.error("[Popup] Error switching logic:", error);
    }

    await addLog(`Manually flipped to Logic ${activeLogicId}`);
    await saveState();
}

async function performShuffleFlip() {
    const logicIds = Object.keys(logicData).map(Number).filter(id => id !== activeLogicId);

    if (logicIds.length === 0) {
        alert("No other Logic blocks available to shuffle to.");
        return;
    }

    const randomIndex = Math.floor(Math.random() * logicIds.length);
    const targetLogicId = logicIds[randomIndex];

    await performManualFlip(targetLogicId);
    await addLog(`Shuffle flip to Logic ${targetLogicId}`);
}
