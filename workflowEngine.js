import { actionMap } from "./actionMap.js";

export const engineState = {

    status: "stopped",

    currentAttempt: 1,

    totalAttempts: 0,

    lastResult: null
};

export async function executeCurrentStep(
    workflow
) {

    console.log(
    "executeCurrentStep called"
);

console.log(
    "currentAttempt:",
    engineState.currentAttempt
);

if (engineState.currentAttempt < 1) {
    engineState.currentAttempt = 1;
}

if (!workflow) {
    console.error("No workflow provided");
    engineState.status = "error";
    return;
}

const step =
    workflow?.[
        engineState.currentAttempt
    ];

console.log(
    "STEP:",
    step
);

    console.log(
        "WORKFLOW:",
        workflow
    );

    console.log(
        "ATTEMPT:",
        engineState.currentAttempt
    );



    console.log(
        "STEP:",
        step
    );

    if (!step) {

        console.warn(
            `No workflow step found for attempt ${engineState.currentAttempt}`
        );

        engineState.status =
            "completed";

        return;
    }

    const action =
        actionMap[
            step.action
        ];

    console.log(
        "ACTION:",
        action
    );

    if (!action) {

        console.error(
            `Unknown action: ${step.action}`
        );
        engineState.status = "error";
        return;
    }

    try {
        await action(step);
    } catch (error) {
        console.error("Error executing action:", error);
        engineState.status = "error";
        return;
    }

    const previousAttempt = engineState.currentAttempt;
    engineState.currentAttempt =
        step.nextStep ||
        (engineState.currentAttempt + 1);

    console.log(
        "Step executed. Moving from attempt",
        previousAttempt,
        "to",
        engineState.currentAttempt
    );
}

export async function startEngine(
    workflow
) {

    if (
        engineState.currentAttempt >
        Object.keys(workflow).length
    ) {

        engineState.currentAttempt = 1;
    }

    engineState.status =
        "running";

    await executeCurrentStep(
        workflow
    );
}

export function pauseEngine() {

    engineState.status =
        "paused";
}

export function stopEngine() {

    engineState.status =
        "stopped";

}