import { sendToActiveTab } from "./messaging.js";

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