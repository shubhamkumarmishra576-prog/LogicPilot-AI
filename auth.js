import { API_CONFIG, apiRequest, authenticatedGet, authenticatedPost } from "./api.js";
import {
    clearAuthStorage,
    getAuthSnapshot,
    getHardwareId,
    saveAuthToken,
    saveCurrentUser,
    saveSubscription
} from "./storage.js";

function getDevicePayload(hardwareId) {
    const manifest = chrome.runtime.getManifest?.() || {};

    return {
        hardware_id: hardwareId,
        device_name: navigator.userAgentData?.platform || navigator.platform || "LogicPilot Computer",
        os_name: navigator.userAgentData?.platform || navigator.platform || "Unknown",
        os_version: navigator.userAgent || "",
        platform: "chrome",
        app_version: manifest.version || "1.0.0",
        build_version: manifest.version || "1.0.0"
    };
}

function extractUser(response) {
    return response?.user || response?.data?.user || null;
}

function extractSubscription(response) {
    return (
        response?.subscription ||
        response?.data?.subscription ||
        response?.user?.subscription ||
        response?.data?.user?.subscription ||
        null
    );
}

export async function login(credentials) {
    console.log("[AUTH] STEP 2.1: login() called with credentials", { email: credentials?.email });
    if (!credentials?.email || !credentials?.password) {
        throw new Error("Email and password are required.");
    }

    const hardwareId = await getHardwareId();
    console.log("[AUTH] STEP 2.2: Hardware ID obtained", hardwareId);

    console.log("[AUTH] STEP 2.3: Calling API login endpoint");
    const response = await apiRequest(API_CONFIG.endpoints.login, {
        method: "POST",
        body: {
            email: credentials.email,
            password: credentials.password,
            ...getDevicePayload(hardwareId),
            device_name: credentials.device_name || "logicpilot-chrome-extension"
        }
    });
    console.log("[AUTH] STEP 2.4: API login response received", response);

    const token = response?.token;
    const tokenType = response?.token_type || "Bearer";

    if (!token) {
        throw new Error("Login succeeded, but no Sanctum token was returned.");
    }

    console.log("[AUTH] STEP 2.5: Saving auth token");
    await saveAuthToken(token, tokenType);
    console.log("[AUTH] STEP 2.6: Token saved successfully");

    console.log("[AUTH] STEP 2.7: Calling subscription endpoint");
    const entitlement = await authenticatedGet(API_CONFIG.endpoints.subscription);
    console.log("[AUTH] STEP 2.8: Subscription response received", entitlement);
    const user = extractUser(entitlement) || extractUser(response);
    const subscription = extractSubscription(entitlement) || extractSubscription(response);

    console.log("[AUTH] STEP 2.9: Saving user data");
    await saveCurrentUser(user);
    console.log("[AUTH] STEP 2.10: User saved successfully");

    console.log("[AUTH] STEP 2.11: Saving subscription data");
    await saveSubscription(subscription);
    console.log("[AUTH] STEP 2.12: Subscription saved successfully");

    return {
        token,
        tokenType,
        user,
        subscription,
        entitlement,
        raw: response
    };
}

export async function register(credentials) {
    if (!credentials?.name || !credentials?.email || !credentials?.password) {
        throw new Error("Name, email, and password are required.");
    }

    const hardwareId = await getHardwareId();

    return apiRequest(API_CONFIG.endpoints.register, {
        method: "POST",
        body: {
            name: credentials.name,
            email: credentials.email,
            password: credentials.password,
            password_confirmation:
                credentials.password_confirmation || credentials.password,
            ...getDevicePayload(hardwareId)
        }
    });
}

export async function me() {
    const response = await authenticatedGet(API_CONFIG.endpoints.subscription);
    const user = extractUser(response);
    const subscription = extractSubscription(response);

    await saveCurrentUser(user);
    await saveSubscription(subscription);

    return {
        authenticated: true,
        user,
        subscription,
        entitlement: response,
        raw: response
    };
}

export async function restoreSession() {
    const snapshot = await getAuthSnapshot();

    if (!snapshot.token) {
        return {
            authenticated: false,
            user: null,
            subscription: null,
            token: null
        };
    }

    try {
        const result = await me();

        return {
            ...result,
            token: snapshot.token
        };
    } catch (error) {
        if (error?.isAuthError) {
            await clearAuthStorage();
        }

        return {
            authenticated: false,
            user: null,
            subscription: null,
            token: null,
            error
        };
    }
}

export async function logout() {
    let serverResponse = null;
    let error = null;

    try {
        serverResponse = await authenticatedPost(API_CONFIG.endpoints.logout);
    } catch (logoutError) {
        error = logoutError;
    } finally {
        await clearAuthStorage();
    }

    return {
        success: !error,
        serverResponse,
        error
    };
}

export function autoLogin() {
    return restoreSession();
}
