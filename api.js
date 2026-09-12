import { getAuthToken, getTokenType } from "./storage.js";

/**
 * Get the configured API base URL from chrome.storage.local.
 * Falls back to localhost for development if not configured.
 */
async function getApiBaseUrl() {
    try {
        const result = await new Promise((resolve) => {
            chrome.storage.local.get('logicpilot.api.baseUrl', resolve);
        });
        return result['logicpilot.api.baseUrl'] || "https://api.blackfoxlicense.in/api/v1";
    } catch (error) {
        // Fallback if chrome.storage is not available
        return "https://api.blackfoxlicense.in/api/v1";
    }
}

/**
 * Central API configuration for the BlackFox Laravel License Server.
 * 
 * The server URL can be configured via chrome.storage.local with key 'logicpilot.api.baseUrl'.
 * 
 * Examples:
 * - Development: "http://127.0.0.1:8000/api/v1"
 * - Testing (ngrok): "https://xxxx-xx-xx-xx-xx.ngrok-free.app/api/v1"
 * - Production: "https://license.blackfox.ai/api/v1"
 * 
 * To configure: chrome.storage.local.set({ 'logicpilot.api.baseUrl': 'YOUR_URL' })
 */
export const API_CONFIG = Object.freeze({
    get baseUrl() {
        // Synchronous getter for compatibility
        // Note: This returns the default. For custom URLs, use getApiBaseUrl() directly
        return "https://api.blackfoxlicense.in/api/v1";
    },
    timeoutMs: 15000,
    endpoints: Object.freeze({
        register: "/register",
        login: "/login",
        logout: "/logout",
        me: "/me",
        heartbeat: "/heartbeat",
        commands: "/commands",
        subscription: "/subscription",
        // Coordination endpoints
        coordinationMode: "/coordination/mode",
        createSession: "/coordination/sessions",
        joinSession: "/coordination/sessions/{id}/join",
        leaveSession: "/coordination/sessions/{id}/leave",
        startSession: "/coordination/sessions/{id}/start",
        stopSession: "/coordination/sessions/{id}/stop",
        resetSession: "/coordination/sessions/{id}/reset",
        stopDevice: "/coordination/sessions/{id}/devices/{deviceId}/stop",
        removeDevice: "/coordination/sessions/{id}/devices/{deviceId}",
        getSession: "/coordination/sessions/{id}",
        deviceHeartbeat: "/coordination/devices/{deviceId}/heartbeat",
        deviceReady: "/coordination/devices/{deviceId}/ready"
    })
});

export class ApiError extends Error {
    constructor(message, options = {}) {
        super(message);
        this.name = "ApiError";
        this.status = options.status || 0;
        this.code = options.code || "API_ERROR";
        this.data = options.data || null;
        this.request = options.request || null;
        this.cause = options.cause || null;
        this.isAuthError = this.status === 401 || this.status === 419;
    }
}

export async function buildApiUrl(path) {
    if (/^https?:\/\//i.test(path)) {
        return path;
    }

    const baseUrl = await getApiBaseUrl();
    const cleanBaseUrl = baseUrl.replace(/\/+$/, "");
    const cleanPath = String(path || "").replace(/^\/+/, "");

    return `${cleanBaseUrl}/${cleanPath}`;
}

async function parseResponseBody(response) {
    const contentType = response.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
        try {
            return await response.json();
        } catch (error) {
            return {
                message: "BlackFox API returned invalid JSON.",
                parse_error: error?.message || String(error)
            };
        }
    }

    const text = await response.text();
    return text ? { message: text } : null;
}

function flattenValidationErrors(errors) {
    if (!errors || typeof errors !== "object") {
        return "";
    }

    return Object.values(errors)
        .flat()
        .filter(Boolean)
        .join(" ");
}

function throwForErrorResponse(response, body, requestDetails) {
    if (response.ok) {
        return;
    }

    const validationMessage = flattenValidationErrors(body?.errors);
    const message =
        body?.message ||
        body?.error ||
        validationMessage ||
        `BlackFox API request failed with status ${response.status}.`;

    throw new ApiError(message, {
        status: response.status,
        code: response.status === 401 ? "UNAUTHENTICATED" : "HTTP_ERROR",
        data: body,
        request: requestDetails
    });
}

async function buildHeaders(options = {}) {
    const headers = {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...(options.headers || {})
    };

    if (options.authenticated) {
        const token = await getAuthToken();

        if (!token) {
            throw new ApiError("No saved auth token is available.", {
                status: 401,
                code: "TOKEN_MISSING"
            });
        }

        const tokenType = await getTokenType();
        headers.Authorization = `${tokenType || "Bearer"} ${token}`;
    }

    return headers;
}

export async function apiRequest(path, options = {}) {
    console.log("[API] STEP 1: apiRequest called", { path, method: options.method });
    const controller = new AbortController();
    const timeoutId = setTimeout(
        () => controller.abort(),
        options.timeoutMs || API_CONFIG.timeoutMs
    );
    const requestDetails = {
        url: await buildApiUrl(path),
        method: options.method || "GET",
        headers: null,
        body: options.body || null
    };
    console.log("[API] STEP 2: Request details", requestDetails);

    try {
        const headers = await buildHeaders(options);
        requestDetails.headers = headers;
        console.log("[API] STEP 3: Headers built", headers);

        console.log("[API] STEP 4: Starting fetch to", requestDetails.url);
        const response = await fetch(requestDetails.url, {
            method: requestDetails.method,
            headers,
            body: options.body ? JSON.stringify(options.body) : undefined,
            signal: controller.signal
        });
        console.log("[API] STEP 5: Fetch response received", { status: response.status, ok: response.ok });
        const body = await parseResponseBody(response);
        console.log("[API] STEP 6: Response body parsed", body);

        throwForErrorResponse(response, body, requestDetails);

        console.log("[API] STEP 7: Request successful, returning body");
        return body;
    } catch (error) {
        console.error("[API] ERROR: Request failed", error);
        if (error instanceof ApiError) {
            throw error;
        }

        if (error?.name === "AbortError") {
            throw new ApiError("BlackFox API request timed out.", {
                code: "REQUEST_TIMEOUT",
                request: requestDetails,
                cause: error
            });
        }

        const originalMessage = error?.message || String(error);
        const browserMessage =
            originalMessage === "Failed to fetch"
                ? "Browser blocked or could not connect to the BlackFox API."
                : originalMessage;

        throw new ApiError(`${browserMessage} URL: ${requestDetails.url}`, {
            code: "NETWORK_ERROR",
            request: requestDetails,
            cause: error
        });
    } finally {
        clearTimeout(timeoutId);
    }
}

export function authenticatedGet(path) {
    return apiRequest(path, { method: "GET", authenticated: true });
}

export function authenticatedPost(path, body = {}) {
    return apiRequest(path, { method: "POST", body, authenticated: true });
}
