const assert = require("assert");
const shuffle = require("../logicShuffle.js");

function uniqueSorted(values) {
    return [...new Set(values)].sort((a, b) => a - b);
}

function makeRng(values) {
    let index = 0;
    return () => values[index++ % values.length];
}

function applyOutcomeOnce(state, periodId, outcome) {
    if (state.processedPeriods.has(periodId)) {
        return state;
    }

    state.processedPeriods.add(periodId);
    const next = shuffle.resolveAttemptTransition({
        currentAttempt: state.currentAttempt,
        totalAttempts: state.totalAttempts,
        outcome,
        hasNextLogic: false
    });
    state.currentAttempt = next.currentAttempt;
    return state;
}

const logics = shuffle.generateLogics(10, 5);
assert.strictEqual(Object.keys(logics).length, 10, "generates 10 unique logics");
for (let logicId = 1; logicId <= 10; logicId++) {
    assert.strictEqual(Object.keys(logics[logicId].attempts).length, 5, `Logic ${logicId} has 5 attempts`);
}

const disabledPlan = shuffle.buildExecutionOrder({ totalLogics: 10, shuffleEnabled: false });
assert.deepStrictEqual(disabledPlan.executionOrder, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], "shuffle disabled keeps sequential order");

const rangedPlan = shuffle.buildExecutionOrder({
    totalLogics: 10,
    shuffleEnabled: true,
    shuffleFrom: 3,
    shuffleTo: 7,
    rng: makeRng([0.1, 0.7, 0.2, 0.9])
});
assert.strictEqual(rangedPlan.executionOrder[0], 1, "Logic 1 stays fixed outside range");
assert.strictEqual(rangedPlan.executionOrder[1], 2, "Logic 2 stays fixed outside range");
assert.deepStrictEqual(rangedPlan.executionOrder.slice(7), [8, 9, 10], "Logics after range stay fixed");
assert.deepStrictEqual(uniqueSorted(rangedPlan.executionOrder.slice(2, 7)), [3, 4, 5, 6, 7], "only selected range is permuted");
assert.deepStrictEqual(uniqueSorted(rangedPlan.executionOrder), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], "ranged shuffle has no duplicates or missing logics");

const fullPlan = shuffle.buildExecutionOrder({
    totalLogics: 10,
    shuffleEnabled: true,
    shuffleFrom: 1,
    shuffleTo: 10,
    rng: makeRng([0.3, 0.8, 0.1])
});
assert.deepStrictEqual(uniqueSorted(fullPlan.executionOrder), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], "full shuffle keeps every logic exactly once");

const singlePlan = shuffle.buildExecutionOrder({
    totalLogics: 10,
    shuffleEnabled: true,
    shuffleFrom: 5,
    shuffleTo: 5
});
assert.deepStrictEqual(singlePlan.executionOrder, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], "single logic range remains valid");

assert.strictEqual(
    shuffle.buildExecutionOrder({ totalLogics: 10, shuffleEnabled: true, shuffleFrom: 8, shuffleTo: 3 }).error,
    shuffle.SHUFFLE_ERRORS.FROM_GT_TO,
    "rejects from greater than to"
);
assert.strictEqual(
    shuffle.buildExecutionOrder({ totalLogics: 10, shuffleEnabled: true, shuffleFrom: 0, shuffleTo: 5 }).error,
    shuffle.SHUFFLE_ERRORS.FROM_INVALID,
    "rejects from below 1"
);
assert.strictEqual(
    shuffle.buildExecutionOrder({ totalLogics: 10, shuffleEnabled: true, shuffleFrom: 3, shuffleTo: 11 }).error,
    shuffle.SHUFFLE_ERRORS.TO_INVALID,
    "rejects to above total"
);

const existing = {
    3: {
        logicId: 3,
        attempts: {
            2: { choice: "small", amount: 300 }
        }
    }
};
const regenerated = shuffle.generateLogics(5, 4, existing);
assert.deepStrictEqual(regenerated[3].attempts[2], { choice: "small", amount: 300 }, "attempts remain attached to their logic identity");

assert.strictEqual(shuffle.resolveAttemptTransition({ currentAttempt: 1, totalAttempts: 5, outcome: "win" }).currentAttempt, 1, "A1 WIN stays A1");
assert.strictEqual(shuffle.resolveAttemptTransition({ currentAttempt: 1, totalAttempts: 5, outcome: "loss" }).currentAttempt, 2, "A1 LOSS moves to A2");
assert.strictEqual(shuffle.resolveAttemptTransition({ currentAttempt: 3, totalAttempts: 5, outcome: "loss" }).currentAttempt, 4, "loss moves down exactly one attempt");
assert.strictEqual(shuffle.resolveAttemptTransition({ currentAttempt: 3, totalAttempts: 5, outcome: "win" }).currentAttempt, 1, "WIN after losses resets to A1");
assert.strictEqual(shuffle.resolveAttemptTransition({ currentAttempt: 5, totalAttempts: 5, outcome: "win" }).currentAttempt, 1, "A5 WIN resets to A1");

const maxLossComplete = shuffle.resolveAttemptTransition({
    currentAttempt: 5,
    totalAttempts: 5,
    outcome: "loss",
    hasNextLogic: false
});
assert.strictEqual(maxLossComplete.currentAttempt, 5, "A5 LOSS without next logic does not create A6");
assert.strictEqual(maxLossComplete.sessionComplete, true, "A5 LOSS without next logic completes session");

const maxLossNextLogic = shuffle.resolveAttemptTransition({
    currentAttempt: 5,
    totalAttempts: 5,
    outcome: "loss",
    hasNextLogic: true
});
assert.strictEqual(maxLossNextLogic.currentAttempt, 1, "A5 LOSS with next logic starts next logic at A1");
assert.strictEqual(maxLossNextLogic.logicAdvanced, true, "A5 LOSS with next logic advances logic");

let state = { currentAttempt: 2, totalAttempts: 5, processedPeriods: new Set() };
applyOutcomeOnce(state, "20260912001", "loss");
applyOutcomeOnce(state, "20260912001", "loss");
assert.strictEqual(state.currentAttempt, 3, "duplicate LOSS period advances only once");

state = { currentAttempt: 4, totalAttempts: 5, processedPeriods: new Set() };
applyOutcomeOnce(state, "20260912002", "win");
applyOutcomeOnce(state, "20260912002", "win");
assert.strictEqual(state.currentAttempt, 1, "duplicate WIN period resets only once");

const cursor = shuffle.createSessionCursor(rangedPlan.executionOrder, 1);
assert.strictEqual(cursor.currentLogicPosition, 0, "new session starts at first execution position");
assert.strictEqual(cursor.currentLogicId, rangedPlan.executionOrder[0], "new session starts at first execution logic");
assert.strictEqual(cursor.currentAttempt, 1, "new session starts at A1");

console.log("logicShuffle tests passed");
