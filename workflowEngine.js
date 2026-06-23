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

        throw new Error(
            `Unknown action: ${step.action}`
        );
    }

    await action(step);

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

    engineState.currentAttempt = 1;
}