import { API_CONFIG, authenticatedPost } from "./api.js";
import { getHardwareId, setLocal, STORAGE_KEYS } from "./storage.js";

/**
 * Send a licensing heartbeat only. This does not start, stop, or call any
 * LogicPilot automation behavior.
 */
export async function heartbeat(payload = {}) {
    const checkedAt = new Date().toISOString();
    const hardwareId = payload.hardware_id || await getHardwareId();
    const manifest = chrome.runtime.getManifest?.() || {};
    const response = await authenticatedPost(API_CONFIG.endpoints.heartbeat, {
        checked_at: checkedAt,
        extension: "LogicPilot AI",
        extension_version: payload.extension_version || manifest.version,
        hardware_id: hardwareId,
        computer_name: payload.computer_name || navigator.userAgentData?.platform || navigator.platform || "LogicPilot Computer",
        os_name: payload.os_name || navigator.userAgentData?.platform || navigator.platform || "Unknown",
        os_version: payload.os_version || navigator.userAgent || "",
        platform: payload.platform || "chrome",
        app_version: payload.app_version || manifest.version || "1.0.0",
        build_version: payload.build_version || manifest.version || "1.0.0",
        browser: payload.browser || "chrome",
        metadata: payload.metadata || {}
    });

    await setLocal({ [STORAGE_KEYS.lastHeartbeatAt]: checkedAt });

    return {
        ok: true,
        checkedAt,
        raw: response
    };
}
