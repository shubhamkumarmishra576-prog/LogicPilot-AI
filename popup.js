let strategyData = {};

initializeApp();

const currentAttemptUI =
document.getElementById(
    "currentAttempt"
);

const nextChoiceUI =
document.getElementById(
    "nextChoice"
);

const nextAmountUI =
document.getElementById(
    "nextAmount"
);

const engineStatusUI =
document.getElementById(
    "engineStatus"
);
const lastResultUI =
document.getElementById(
    "lastResult"
);


const attemptProgressUI =
document.getElementById(
    "attemptProgress"
);


const generateBtn =
document.getElementById("generateBtn");

const clearBtn =
document.getElementById("clearBtn");

const strategyContainer =
    document.getElementById("strategyContainer");

let strategyListenersInitialized = false;

function ensureStrategyContainerListeners() {
    if (strategyListenersInitialized) {
        return;
    }
    strategyListenersInitialized = true;

    strategyContainer.addEventListener("click", (event) => {
        const header = event.target.closest(".accordion-header");
        if (header) {
            const body = header.nextElementSibling;
            if (body) {
                body.classList.toggle("active");
            }
            return;
        }

        const saveBtn = event.target.closest(".save-btn");
        if (saveBtn) {
            handleSaveAttempt(saveBtn);
            return;
        }

        const copyBtn = event.target.closest(".copy-btn");
        if (copyBtn) {
            handleCopyAttempt(copyBtn);
        }
    });
}

function handleSaveAttempt(btn) {
    const attempt = btn.dataset.attempt;

    console.log(
        "SAVE CLICKED",
        attempt
    );

    if (attempt === "1") {
        strategyData[attempt] = {
            choice: document.getElementById(`choice-${attempt}`).value,
            amount: Number(document.getElementById(`amount-${attempt}`).value)
        };
    } else {
        strategyData[attempt] = {
            onWin: {
                choice: document.getElementById(`win-choice-${attempt}`).value,
                amount: Number(document.getElementById(`win-amount-${attempt}`).value)
            },
            onLoss: {
                choice: document.getElementById(`loss-choice-${attempt}`).value,
                amount: Number(document.getElementById(`loss-amount-${attempt}`).value)
            }
        };
    }

    StrategyManager.save(strategyData);

    console.log(
        "AFTER SAVE",
        JSON.stringify(strategyData, null, 2)
    );

    btn.innerText = "✅ Saved";
    btn.style.background = "#16a34a";

    Engine.currentAttempt = Number(attempt);
    currentAttemptUI.innerText = Engine.currentAttempt;
}

function handleCopyAttempt(btn) {
    const current = Number(btn.dataset.attempt);
    const previous = current - 1;
    const previousData = strategyData[previous];

    if (!previousData) {
        alert("Previous attempt not saved.");
        return;
    }

    strategyData[current] = JSON.parse(JSON.stringify(previousData));
    StrategyManager.save(strategyData);
    restoreValues();
    alert(`Attempt ${previous} copied`);
}

ensureStrategyContainerListeners();

function isRestrictedTabUrl(url) {
    if (!url) {
        return true;
    }
    return (
        url.startsWith("chrome://") ||
        url.startsWith("chrome-extension://") ||
        url.startsWith("edge://") ||
        url.startsWith("about:") ||
        url.startsWith("devtools://")
    );
}

function sendMessageToTab(tabId, message) {
    return new Promise((resolve) => {
        chrome.tabs.sendMessage(tabId, message, (response) => {
            const lastError = chrome.runtime.lastError;
            if (lastError) {
                resolve({ ok: false, error: lastError.message });
            } else {
                resolve({ ok: true, response });
            }
        });
    });
}

function isMissingContentScriptError(errorMessage) {
    return (
        errorMessage.includes("Receiving end does not exist") ||
        errorMessage.includes("Could not establish connection")
    );
}

function isSupportedTabUrl(url) {
    if (!url) {
        return false;
    }
    try {
        const parsed = new URL(url);
        return (
            parsed.hostname === "damanworld.org" ||
            parsed.hostname === "damanapp.download"
        );
    } catch {
        return false;
    }
}

function sendToActiveTab(message) {
    return new Promise((resolve) => {

    chrome.tabs.query(
        { active: true, lastFocusedWindow: true },

        async (tabs) => {

            const tab = tabs[0];

            console.log(
                "TAB URL:",
                tab.url
            );

            const urlSupported = isSupportedTabUrl(tab?.url);
            const legacyStartsWith = tab.url?.startsWith(
                "https://damanworld.org/#/saasLottery/WinGo?gameCode=WinGo_30S&lottery=WinGo/"
            );

            // #region agent log
            fetch('http://127.0.0.1:7391/ingest/de6115f7-dc0a-4377-999c-10b7507a1859',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'ef7d33'},body:JSON.stringify({sessionId:'ef7d33',location:'popup.js:sendToActiveTab',message:'tab query result',data:{tabId:tab?.id,tabUrl:tab?.url,urlSupported,legacyStartsWith,messageAction:message?.action},timestamp:Date.now(),hypothesisId:'B',runId:'pre-fix'})}).catch(()=>{});
            // #endregion

            if (!urlSupported) {

                resolve({
                    error: "UNSUPPORTED_URL",
                    url: tab.url
                });

                return;
            }

            if (!tab?.id) {

                resolve({
                    error: "NO_TAB"
                });

                return;
            }

                if (isRestrictedTabUrl(tab.url)) {
                    resolve({ error: "RESTRICTED_URL", url: tab.url });
                    return;
                }

                let result = await sendMessageToTab(tab.id, message);

                // #region agent log
                fetch('http://127.0.0.1:7391/ingest/de6115f7-dc0a-4377-999c-10b7507a1859',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'ef7d33'},body:JSON.stringify({sessionId:'ef7d33',location:'popup.js:sendMessage',message:'first sendMessage result',data:{tabId:tab.id,ok:result.ok,error:result.error||null,response:result.response||null},timestamp:Date.now(),hypothesisId:'C',runId:'pre-fix'})}).catch(()=>{});
                // #endregion

                if (!result.ok && isMissingContentScriptError(result.error)) {
                    try {
                        await chrome.scripting.executeScript({
                            target: { tabId: tab.id },
                            files: ["content.js"]
                        });
                        // #region agent log
                        fetch('http://127.0.0.1:7391/ingest/de6115f7-dc0a-4377-999c-10b7507a1859',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'ef7d33'},body:JSON.stringify({sessionId:'ef7d33',location:'popup.js:executeScript',message:'manual inject succeeded',data:{tabId:tab.id},timestamp:Date.now(),hypothesisId:'C',runId:'pre-fix'})}).catch(()=>{});
                        // #endregion
                        result = await sendMessageToTab(tab.id, message);
                    } catch (injectError) {
                        // #region agent log
                        fetch('http://127.0.0.1:7391/ingest/de6115f7-dc0a-4377-999c-10b7507a1859',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'ef7d33'},body:JSON.stringify({sessionId:'ef7d33',location:'popup.js:executeScript',message:'manual inject failed',data:{tabId:tab.id,injectError:injectError.message,lastSendError:result.error},timestamp:Date.now(),hypothesisId:'C',runId:'pre-fix'})}).catch(()=>{});
                        // #endregion
                        resolve({
                            error: result.error,
                            url: tab.url,
                            injectError: injectError.message
                        });
                        return;
                    }
                }

                // #region agent log
                fetch('http://127.0.0.1:7391/ingest/de6115f7-dc0a-4377-999c-10b7507a1859',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'ef7d33'},body:JSON.stringify({sessionId:'ef7d33',location:'popup.js:sendToActiveTab:final',message:'final result',data:{tabId:tab.id,ok:result.ok,error:result.error||null,response:result.response||null},timestamp:Date.now(),hypothesisId:'D',runId:'pre-fix'})}).catch(()=>{});
                // #endregion

                if (!result.ok) {
                    resolve({ error: result.error, url: tab.url });
                } else {
                    resolve({ response: result.response, url: tab.url });
                }
            }
        );
    });
}

generateBtn.addEventListener(
    "click",
    async () => {

        console.log(
            "GENERATE CLICKED"
        );

        generateStrategy();

        const result = await sendToActiveTab({
            action: "CLICK_BIG"
        });

        console.log(
            "CLICK_BIG RESULT:",
            result
        );

    }
);

clearBtn.addEventListener(
    "click",
    clearStrategy
);


async function initializeApp(){

    await loadSavedStrategy();

    if(
        Object.keys(strategyData).length > 0
    ){

        const savedAttempts =
        Object.keys(
            strategyData
        ).length;

        document.getElementById(
            "attempts"
        ).value =
        savedAttempts;

        generateStrategy();

        restoreValues();

    }

}



async function loadSavedStrategy() {

    strategyData =
        await StrategyManager.load();

    console.log(
        "Loaded Strategy",
        strategyData
    );
}

function generateStrategy() {

    strategyContainer.innerHTML = "";

    const attempts = parseInt(
        document.getElementById("attempts").value
    );

    for (let i = 1; i <= attempts; i++) {

        const card =
            document.createElement("div");

        card.className =
            "accordion-card";

        const isSaved =
            strategyData[i];

        const statusIcon =
            isSaved ? "🟢" : "🔴";

        if (i === 1) {

            card.innerHTML = `

            <div class="accordion-header">
                ${statusIcon} Attempt ${i}
            </div>

            <div class="accordion-body">

                <label>Choice</label>

                <select id="choice-${i}">
                    <option value="big">Big</option>
                    <option value="small">Small</option>
                </select>

                <label>Amount</label>

                <input
                    type="number"
                    id="amount-${i}"
                    value="10"
                >

                <button
                 class="copy-btn"
                 data-attempt="${i}">
                 Copy Previous
                </button>



                <button
                    class="save-btn"
                    data-attempt="${i}">
                    Save
                </button>

            
        

            </div>
            `;

        } else {

            card.innerHTML = `

            <div class="accordion-header">
                ${statusIcon} Attempt ${i}
            </div>

            <div class="accordion-body">

                <h4>IF ATTEMPT ${i - 1} WIN</h4>

                <label>Choice</label>

                <select id="win-choice-${i}">
                    <option value="big">Big</option>
                    <option value="small">Small</option>
                </select>

                <label>Amount</label>

                <input
                    type="number"
                    id="win-amount-${i}"
                    value="10"
                >

                <hr>

                <h4>IF ATTEMPT ${i - 1} LOSS</h4>

                <label>Choice</label>

                <select id="loss-choice-${i}">
                    <option value="big">Big</option>
                    <option value="small">Small</option>
                </select>

                <label>Amount</label>

                <input
                    type="number"
                    id="loss-amount-${i}"
                    value="20"
                >

                <button
                    class="save-btn"
                    data-attempt="${i}">
                    Save
                </button>

            </div>
            `;
        }

        strategyContainer.appendChild(
            card
        );
    }

}

function restoreValues(){
    console.log(
    "RESTORE VALUES RUNNING"
);

    for(
        const attempt in strategyData
    ){

        const data =
        strategyData[attempt];

        if(attempt === "1"){

            const choice =
            document.getElementById(
                `choice-${attempt}`
            );

            const amount =
            document.getElementById(
                `amount-${attempt}`
            );

            if(choice)
                choice.value =
                data.choice;

            if(amount)
                amount.value =
                data.amount;

        }else{

            const winChoice =
            document.getElementById(
                `win-choice-${attempt}`
            );

            const winAmount =
            document.getElementById(
                `win-amount-${attempt}`
            );

            const lossChoice =
            document.getElementById(
                `loss-choice-${attempt}`
            );

            const lossAmount =
            document.getElementById(
                `loss-amount-${attempt}`
            );

            if(
                data.onWin &&
                winChoice
            ){
                winChoice.value =
                data.onWin.choice;
            }

            if(
                data.onWin &&
                winAmount
            ){
                winAmount.value =
                data.onWin.amount;
            }

            if(
                data.onLoss &&
                lossChoice
            ){
                lossChoice.value =
                data.onLoss.choice;
            }

            if(
                data.onLoss &&
                lossAmount
            ){
                lossAmount.value =
                data.onLoss.amount;
            }

        }

    }

}
console.log(Engine);
const winBtn =
document.getElementById(
    "winBtn"
);

console.log(
    "ATTEMPT =",
    Engine.currentAttempt
);

console.log(
    "DATA =",
    strategyData[
        Engine.currentAttempt
    ]
);

const lossBtn =
document.getElementById(
    "lossBtn"
);

if(winBtn){

    winBtn.addEventListener(
        "click",
        ()=>{

            Engine.processResult(
                "WIN"
            );

            lastResultUI.innerText =
                "WIN";
            
            
                const nextData =
strategyData[
    Engine.currentAttempt
];

if(
    nextData &&
    nextData.onWin
){

    nextChoiceUI.innerText =
    nextData.onWin.choice;

    nextAmountUI.innerText =
    nextData.onWin.amount;

    console.log(
        "NEXT BET",
        nextData.onWin
    );

}

            currentAttemptUI.innerText =
            Engine.currentAttempt;

        }
    );

}

if(lossBtn){

    lossBtn.addEventListener(
        "click",
        ()=>{

            Engine.processResult(
                "LOSS"
            );

            lastResultUI.innerText =
                "LOSS";

            const nextData =
strategyData[
    Engine.currentAttempt
];


if(
    nextData &&
    nextData.onLoss
){

    nextChoiceUI.innerText =
    nextData.onLoss.choice;

    nextAmountUI.innerText =
    nextData.onLoss.amount;

    console.log(
        "NEXT BET",
        nextData.onLoss
    );

}

            currentAttemptUI.innerText =
Engine.currentAttempt;

updateAttemptProgress();

        }
    );

}


const startBtn = document.getElementById("startBtn");
const pauseBtn = document.getElementById("pauseBtn");
const stopBtn = document.getElementById("stopBtn");

if (startBtn) {
    startBtn.addEventListener("click", () => {
        Engine.start();
        engineStatusUI.innerText = "🟢 Running";
    });
}

if (pauseBtn) {
    pauseBtn.addEventListener("click", () => {
        Engine.pause();
        engineStatusUI.innerText = "⏸ Paused";
    });
}

if (stopBtn) {
    stopBtn.addEventListener("click", () => {
        Engine.stop();
        engineStatusUI.innerText = "🔴 Stopped";
        currentAttemptUI.innerText = "0";
    });
}


function clearStrategy(){

    const confirmDelete =
    confirm(
        "Delete all saved attempts?"
    );

    if(!confirmDelete){
        return;
    }

    strategyData = {};

    chrome.storage.local.remove(
        "strategy",
        ()=>{

            strategyContainer.innerHTML =
            "";

            document.getElementById(
                "attempts"
            ).value = 1;

            currentAttemptUI.innerText =
            "0";

            alert(
                "Strategy Cleared ✅"
            );

            console.log(
                "Strategy Deleted"
            );

        }
    );

}
function updateAttemptProgress(){

    if(!attemptProgressUI){
        return;
    }

    attemptProgressUI.innerHTML = "";

    const totalAttempts =
    Number(
        document.getElementById(
            "attempts"
        ).value || 0
    );

    for(
        let i = 1;
        i <= totalAttempts;
        i++
    ){

        const row =
        document.createElement("div");

        let icon = "⏳";

        if(
            i < Engine.currentAttempt
        ){
            icon = "✅";
        }
        else if(
            i === Engine.currentAttempt
        ){
            icon = "🔄";
        }

        row.innerText =
        `${icon} Attempt ${i}`;

        attemptProgressUI.appendChild(
            row
        );

    }

}