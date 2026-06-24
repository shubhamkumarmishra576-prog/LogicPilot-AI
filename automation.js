const Engine = {

    isRunning: false,
    isPaused: false,

    currentAttempt: 1,

    lastResult: null,

    lastBetTarget: null,

    lastBetAmount: null,

    timerAutomationActive: false,

    start(){

        this.isRunning = true;

        this.isPaused = false;

        this.currentAttempt = 1;

        console.log(
            "🚀 Engine Started"
        );

    },

    stop(){

        this.isRunning = false;

        this.isPaused = false;

        this.currentAttempt = 1;

        this.timerAutomationActive = false;

        console.log(
            "🛑 Engine Stopped"
        );

    },

    pause(){

        this.isPaused = true;

        console.log(
            "⏸ Engine Paused"
        );

    },

    processResult(result){

        console.log(
            "RESULT = ",
            result
        );

        const nextAttempt =
        this.currentAttempt + 1;

        this.currentAttempt =
        nextAttempt;

        console.log(
            "NEXT ATTEMPT = ",
            nextAttempt
        );

    },

    recordBet(target, amount){

        this.lastBetTarget = target;

        this.lastBetAmount = amount;

        console.log(
            "[Engine] Bet recorded - Target:",
            target,
            "Amount:",
            amount
        );

    },

    updateOutcome(latestResult){
        this.lastResult = latestResult;
        console.log("[Engine] Outcome updated:", latestResult);
    },

    updateBetState(target, amount){
        this.lastBetTarget = target;
        this.lastBetAmount = amount;
        console.log("[Engine] Bet state updated:", { target, amount });
    },

    calculateNextMove(strategyData, totalAttempts){
        if(!strategyData){
            console.error("[Engine] No strategy data");
            return null;
        }

        if(this.currentAttempt > totalAttempts){
            console.log("[Engine] Max attempts reached, resetting");
            this.currentAttempt = 1;
        }

        const nextMove = this.getNextMove(strategyData);
        return nextMove;
    },

    determineOutcome(latestResult){

        const isWin = this.lastBetTarget === latestResult;

        console.log(
            "[Engine] Bet target:",
            this.lastBetTarget,
            "| Latest result:",
            latestResult,
            "| Outcome:",
            isWin ? "WIN ✅" : "LOSS ❌"
        );

        return isWin ? "WIN" : "LOSS";

    },

    getNextMove(strategyData){

        if(!strategyData){
            console.error("[Engine] No strategy data");
            return null;
        }

        // First attempt - use Attempt 1 config
        if(this.currentAttempt === 1){
            const attempt1 = strategyData[1];
            if(!attempt1){
                console.error("[Engine] Attempt 1 not found in strategy");
                return null;
            }
            console.log("[Engine] Using Attempt 1 config:", attempt1);
            return attempt1;
        }

        // For subsequent attempts - check previous attempt outcome
        const previousAttemptConfig = strategyData[this.currentAttempt - 1];

        if(!previousAttemptConfig){
            console.error("[Engine] Previous attempt config not found");
            return null;
        }

        // Determine if we won or lost
        const outcome = this.determineOutcome(this.lastResult);

        // Select onWin or onLoss branch
        const nextConfig = outcome === "WIN"
            ? previousAttemptConfig.onWin
            : previousAttemptConfig.onLoss;

        if(!nextConfig){
            console.error("[Engine] No config found for", outcome);
            return null;
        }

        // Advance to next attempt
        this.currentAttempt++;

        console.log("[Engine] Next move from", outcome, "branch:", nextConfig);

        return nextConfig;

    }

};