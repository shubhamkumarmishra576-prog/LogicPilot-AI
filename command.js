import { API_CONFIG, authenticatedGet, authenticatedPost } from "./api.js";
import { getHardwareId, setAutomationDisabled, setLocal, STORAGE_KEYS } from "./storage.js";
import { logout } from "./auth.js";
import { getSubscriptionStatus } from "./subscription.js";

function extractCommands(response) {
    if (Array.isArray(response)) {
        return response;
    }

    if (Array.isArray(response?.commands)) {
        return response.commands;
    }

    if (Array.isArray(response?.data)) {
        return response.data;
    }

    if (Array.isArray(response?.data?.commands)) {
        return response.data.commands;
    }

    return [];
}

/**
 * Fetch server commands only. This module does not execute commands or connect
 * them to automation.
 */
export async function getCommands(options = {}) {
    const query = new URLSearchParams();
    query.set("hardware_id", options.hardware_id || await getHardwareId());

    if (options.status) {
        query.set("status", options.status);
    }

    if (Number.isFinite(options.limit)) {
        query.set("limit", String(options.limit));
    }

    const suffix = query.toString() ? `?${query.toString()}` : "";
    const response = await authenticatedGet(`${API_CONFIG.endpoints.commands}${suffix}`);
    const commands = extractCommands(response);

    await setLocal({ [STORAGE_KEYS.lastCommands]: commands });

    return {
        commands,
        raw: response
    };
}

async function completeCommand(command, status, message = "") {
    if (!command?.id) {
        return null;
    }

    return authenticatedPost(`${API_CONFIG.endpoints.commands}/${command.id}/complete`, {
        status,
        message
    });
}

export async function executeCommand(command) {
    const action = String(command?.command || "").toLowerCase();

    try {
        if (action === "logout") {
            await logout();
        } else if (action === "disable_automation") {
            await setAutomationDisabled(true, command?.payload?.reason || "Disabled remotely.");
        } else if (action === "refresh_license" || action === "sync_subscription") {
            await getSubscriptionStatus();
            await setAutomationDisabled(false, "");
        } else if (action === "show_notification") {
            const title = command?.payload?.title || "LogicPilot AI";
            const message = command?.payload?.message || "BlackFox notification";

            if (chrome.notifications?.create) {
                await chrome.notifications.create(`blackfox-command-${command.id}`, {
                    type: "basic",
                    iconUrl: "icon.svg",
                    title,
                    message
                });
            }
        } else {
            throw new Error(`Unknown command: ${command?.command}`);
        }

        await completeCommand(command, "completed", "Command executed.");
        return { success: true };
    } catch (error) {
        await completeCommand(command, "failed", error?.message || "Command failed.");
        return { success: false, error };
    }
}

export async function pollAndExecuteCommands() {
    const { commands } = await getCommands({ status: "pending", limit: 10 });

    for (const command of commands) {
        await executeCommand(command);
    }

    return commands.length;
}
