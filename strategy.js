const StrategyManager = {

    save(data){

        chrome.storage.local.set({
            strategy:data
        });

    },

    load(){

        return new Promise(resolve=>{

            chrome.storage.local.get(
                ["strategy"],
                result=>{

                    resolve(
                        result.strategy || {}
                    );

                }
            );

        });

    }

};