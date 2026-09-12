import { API_CONFIG, authenticatedGet } from "./api.js";
import { getSubscription as getCachedSubscription, saveCurrentUser, saveSubscription } from "./storage.js";

function extractSubscription(response) {
    return (
        response?.subscription ||
        response?.data?.subscription ||
        response?.user?.subscription ||
        response?.data?.user?.subscription ||
        response?.data ||
        null
    );
}

/**
 * Fetch and cache subscription/license status only. Access enforcement is kept
 * in the popup UI layer for this phase.
 */
export async function getSubscriptionStatus() {
    const response = await authenticatedGet(API_CONFIG.endpoints.subscription);
    const subscription = extractSubscription(response);

    if (response?.user) {
        await saveCurrentUser(response.user);
    }

    await saveSubscription(subscription);

    return {
        subscription,
        user: response?.user || null,
        entitlement: response,
        raw: response
    };
}

export function getCachedSubscriptionStatus() {
    return getCachedSubscription();
}
