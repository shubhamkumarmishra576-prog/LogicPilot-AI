(function (root) {
    const SHUFFLE_ERRORS = {
        TOTAL_INVALID: "Number of Logics must be at least 1.",
        FROM_GT_TO: "Shuffle From Logic cannot be greater than Shuffle To Logic.",
        FROM_INVALID: "Shuffle From Logic must be between 1 and the total number of logics.",
        TO_INVALID: "Shuffle To Logic must be between 1 and the total number of logics."
    };

    function toPositiveInt(value) {
        const number = Number(value);
        if (!Number.isFinite(number)) {
            return NaN;
        }
        return Math.trunc(number);
    }

    function sequentialOrder(totalLogics) {
        const total = toPositiveInt(totalLogics);
        if (!Number.isFinite(total) || total < 1) {
            return [];
        }
        return Array.from({ length: total }, (_, index) => index + 1);
    }

    function generateLogics(totalLogics, attemptsPerLogic, existingLogicData) {
        const total = Math.max(0, toPositiveInt(totalLogics) || 0);
        const attemptsCount = Math.max(0, toPositiveInt(attemptsPerLogic) || 0);
        const existing = existingLogicData && typeof existingLogicData === "object"
            ? existingLogicData
            : {};
        const logics = {};

        for (let logicId = 1; logicId <= total; logicId++) {
            const previous = existing[logicId] || existing[String(logicId)] || {};
            const previousAttempts = previous.attempts || {};
            const attempts = {};

            for (let attemptNum = 1; attemptNum <= attemptsCount; attemptNum++) {
                const previousAttempt = previousAttempts[attemptNum] || previousAttempts[String(attemptNum)] || {};
                attempts[attemptNum] = {
                    choice: previousAttempt.choice || "big",
                    amount: previousAttempt.amount === undefined || previousAttempt.amount === null
                        ? ""
                        : previousAttempt.amount
                };
            }

            logics[logicId] = {
                logicId,
                attempts,
                startTime: previous.startTime || null,
                winCount: previous.winCount || 0,
                lossCount: previous.lossCount || 0
            };
        }

        return logics;
    }

    function validateShuffleRange(shuffleFrom, shuffleTo, totalLogics) {
        const total = toPositiveInt(totalLogics);
        const from = toPositiveInt(shuffleFrom);
        const to = toPositiveInt(shuffleTo);

        if (!Number.isFinite(total) || total < 1) {
            return { ok: false, error: SHUFFLE_ERRORS.TOTAL_INVALID };
        }

        if (!Number.isFinite(from) || from < 1 || from > total) {
            return { ok: false, error: SHUFFLE_ERRORS.FROM_INVALID };
        }

        if (!Number.isFinite(to) || to < 1 || to > total) {
            return { ok: false, error: SHUFFLE_ERRORS.TO_INVALID };
        }

        if (from > to) {
            return { ok: false, error: SHUFFLE_ERRORS.FROM_GT_TO };
        }

        return { ok: true, error: null, shuffleFrom: from, shuffleTo: to, totalLogics: total };
    }

    function fisherYates(items, rng) {
        const random = typeof rng === "function" ? rng : Math.random;
        const result = items.slice();

        for (let index = result.length - 1; index > 0; index--) {
            const swapIndex = Math.floor(random() * (index + 1));
            const current = result[index];
            result[index] = result[swapIndex];
            result[swapIndex] = current;
        }

        return result;
    }

    function hasDuplicateOrMissing(executionOrder, totalLogics) {
        const expected = sequentialOrder(totalLogics);
        if (executionOrder.length !== expected.length) {
            return true;
        }

        const seen = new Set();
        for (const logicId of executionOrder) {
            if (!Number.isInteger(logicId) || logicId < 1 || logicId > totalLogics || seen.has(logicId)) {
                return true;
            }
            seen.add(logicId);
        }

        return seen.size !== expected.length;
    }

    function buildExecutionOrder(options) {
        const totalLogics = toPositiveInt(options?.totalLogics);
        const shuffleEnabled = Boolean(options?.shuffleEnabled);
        const rng = options?.rng;

        if (!Number.isFinite(totalLogics) || totalLogics < 1) {
            return { ok: false, error: SHUFFLE_ERRORS.TOTAL_INVALID, executionOrder: [] };
        }

        const baseOrder = sequentialOrder(totalLogics);

        if (!shuffleEnabled) {
            return {
                ok: true,
                error: null,
                executionOrder: baseOrder,
                shuffleEnabled: false
            };
        }

        const validation = validateShuffleRange(
            options?.shuffleFrom,
            options?.shuffleTo,
            totalLogics
        );

        if (!validation.ok) {
            return { ok: false, error: validation.error, executionOrder: [] };
        }

        const fromIndex = validation.shuffleFrom - 1;
        const toIndex = validation.shuffleTo;
        const prefix = baseOrder.slice(0, fromIndex);
        const range = baseOrder.slice(fromIndex, toIndex);
        const suffix = baseOrder.slice(toIndex);
        const shuffledRange = range.length <= 1 ? range.slice() : fisherYates(range, rng);
        const executionOrder = prefix.concat(shuffledRange, suffix);

        if (hasDuplicateOrMissing(executionOrder, totalLogics)) {
            return {
                ok: false,
                error: "Shuffled execution plan must contain every logic exactly once.",
                executionOrder: []
            };
        }

        return {
            ok: true,
            error: null,
            executionOrder,
            shuffleEnabled: true,
            shuffleFrom: validation.shuffleFrom,
            shuffleTo: validation.shuffleTo
        };
    }

    function createSessionCursor(executionOrder, startAttempt) {
        const order = Array.isArray(executionOrder) ? executionOrder.slice() : [];
        const currentLogicPosition = 0;
        const currentLogicId = order[0] ?? null;
        const currentAttempt = Math.max(1, toPositiveInt(startAttempt) || 1);

        return {
            currentLogicPosition,
            currentLogicId,
            currentAttempt,
            executionOrder: order
        };
    }

    function advanceAttempt(state) {
        const executionOrder = Array.isArray(state?.executionOrder) ? state.executionOrder : [];
        const currentLogicPosition = Math.max(0, toPositiveInt(state?.currentLogicPosition) || 0);
        const currentAttempt = Math.max(1, toPositiveInt(state?.currentAttempt) || 1);
        const totalAttempts = Math.max(0, toPositiveInt(state?.totalAttempts) || 0);
        const currentLogicId = executionOrder[currentLogicPosition] ?? state?.currentLogicId ?? null;

        if (currentAttempt < totalAttempts) {
            return {
                currentAttempt: currentAttempt + 1,
                currentLogicPosition,
                currentLogicId,
                sessionComplete: false,
                logicAdvanced: false
            };
        }

        const nextPosition = currentLogicPosition + 1;
        if (nextPosition >= executionOrder.length) {
            return {
                currentAttempt: totalAttempts,
                currentLogicPosition,
                currentLogicId,
                sessionComplete: true,
                logicAdvanced: false
            };
        }

        return {
            currentAttempt: 1,
            currentLogicPosition: nextPosition,
            currentLogicId: executionOrder[nextPosition],
            sessionComplete: false,
            logicAdvanced: true
        };
    }

    function resolveAttemptTransition(options = {}) {
        const currentAttempt = Math.max(1, toPositiveInt(options.currentAttempt) || 1);
        const totalAttempts = Math.max(0, toPositiveInt(options.totalAttempts) || 0);
        const outcome = String(options.outcome || "").toLowerCase();
        const hasNextLogic = Boolean(options.hasNextLogic);

        if (outcome === "win") {
            return {
                currentAttempt: 1,
                logicComplete: false,
                logicAdvanced: false,
                sessionComplete: false
            };
        }

        if (outcome === "loss") {
            if (currentAttempt < totalAttempts) {
                return {
                    currentAttempt: currentAttempt + 1,
                    logicComplete: false,
                    logicAdvanced: false,
                    sessionComplete: false
                };
            }

            return {
                currentAttempt: hasNextLogic ? 1 : totalAttempts,
                logicComplete: true,
                logicAdvanced: hasNextLogic,
                sessionComplete: !hasNextLogic
            };
        }

        return {
            currentAttempt,
            logicComplete: false,
            logicAdvanced: false,
            sessionComplete: false
        };
    }

    function formatExecutionOrder(executionOrder) {
        if (!Array.isArray(executionOrder) || executionOrder.length === 0) {
            return "-";
        }
        return executionOrder.map((logicId) => `L${logicId}`).join(" → ");
    }

    function getAttemptsForLogic(logics, logicId) {
        const logic = logics?.[logicId] || logics?.[String(logicId)];
        return logic?.attempts || {};
    }

    const api = {
        SHUFFLE_ERRORS,
        sequentialOrder,
        generateLogics,
        validateShuffleRange,
        buildExecutionOrder,
        createSessionCursor,
        advanceAttempt,
        resolveAttemptTransition,
        formatExecutionOrder,
        hasDuplicateOrMissing,
        getAttemptsForLogic
    };

    root.LogicPilotShuffle = api;

    if (typeof module !== "undefined" && module.exports) {
        module.exports = api;
    }
})(typeof globalThis !== "undefined" ? globalThis : this);
