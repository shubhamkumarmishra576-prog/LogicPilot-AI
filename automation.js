const Engine = {

    isRunning: false,
    isPaused: false,

    currentAttempt: 1,

    lastResult: null,

    lastBetTarget: null,

    lastBetAmount: null,

    timerAutomationActive: false,

    lastProcessedPeriodId: null,

    start(){

        this.isRunning = true;

        this.isPaused = false;

        console.log(
            "🚀 Engine Started"
        );

    },

    stop(){

        this.isRunning = false;

        this.isPaused = false;

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

        // STRICT SEQUENTIAL PROGRESSION - WIN and LOSS both move forward
        const nextAttempt = this.currentAttempt + 1;
        this.currentAttempt = nextAttempt;
        
        if (result === "WIN") {
            console.log("WIN detected - Moving to next attempt:", nextAttempt);
        } else {
            console.log("LOSS detected - Moving to next attempt:", nextAttempt);
        }

        console.log(
            "CURRENT ATTEMPT = ",
            this.currentAttempt
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

        // For subsequent attempts - use direct config
        const currentAttemptConfig = strategyData[this.currentAttempt];

        if(!currentAttemptConfig){
            console.error("[Engine] Current attempt config not found");
            return null;
        }

        console.log("[Engine] Using Attempt", this.currentAttempt, "config:", currentAttemptConfig);

        return currentAttemptConfig;

    }

};