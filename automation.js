const Engine = {

    isRunning: false,
    isPaused: false,

    currentAttempt: 1,

    lastResult: null,

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

    }

};