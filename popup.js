let strategyData = {};
let persistedStateRestored = false;

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

function getCurrentAttemptNumber() {
    return Number(
        String(currentAttemptUI.textContent).trim()
    ) || 0;
}

function getTotalAttemptsNumber() {
    return Number(
        document.getElementById("attempts")?.value
    ) || 0;
}

async function syncAttemptUI(
    currentAttempt,
    totalAttempts,
    persist = false
) {
    currentAttemptUI.textContent =
        String(currentAttempt);
    Engine.currentAttempt =
        currentAttempt;

    if (totalAttempts > 0) {
        updateAttemptProgress(
            currentAttempt,
            totalAttempts
        );
    }

    if (persist) {
        await saveState();
    }
}

function updateAttemptProgress(
    currentAttempt,
    totalAttempts
) {

    if (!attemptProgressUI) {
        return;
    }

    attemptProgressUI.innerHTML = "";

    for (
        let i = 1;
        i <= totalAttempts;
        i++
    ) {

        const div =
            document.createElement("div");

        let status = "⏳ Pending";

        if (i < currentAttempt) {
            status = "✅ Completed";
        }

        if (i === currentAttempt) {
            status = "🟢 Running";
        }

        div.className =
            "attempt-item";

        div.textContent =
            `Attempt ${i} → ${status}`;

        attemptProgressUI.appendChild(
            div
        );
    }
}

const activityLog =
    document.getElementById(
        "activityLog"
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

function renderLogs(logs) {

    activityLog.innerHTML = "";

    logs.forEach((log) => {

        const div =
            document.createElement("div");

        div.className = "log-item";

        div.textContent = log;

        activityLog.appendChild(div);
    });
}

async function addLog(message) {

    const now = new Date();

    const time =
        now.toLocaleTimeString();

    const entry =
        `${time} → ${message}`;

    const data =
        await chrome.storage.local.get(
            ["activityLogs"]
        );

    const logs =
        data.activityLogs || [];

    logs.unshift(entry);

    if (logs.length > 50) {
        logs.pop();
    }

    await chrome.storage.local.set({
        activityLogs: logs
    });

    renderLogs(logs);
}

async function saveState() {

    const data =
        await chrome.storage.local.get(
            ["activityLogs"]
        );

    // #region agent log
    fetch('http://127.0.0.1:7391/ingest/de6115f7-dc0a-4377-999c-10b7507a1859',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'5b98c1'},body:JSON.stringify({sessionId:'5b98c1',location:'popup.js:saveState',message:'saveState called',data:{currentAttemptUI:currentAttemptUI?.textContent,engineCurrentAttempt:Engine.currentAttempt,stack:new Error().stack?.split('\n').slice(1,4).join('|')},timestamp:Date.now(),hypothesisId:'B',runId:'pre-fix'})}).catch(()=>{});
    // #endregion

    await chrome.storage.local.set({

        engineStatus:
            engineStatusUI.textContent,

        currentAttempt:
            String(currentAttemptUI.textContent).trim(),

        totalAttempts:
            Number(
                document.getElementById(
                    "attempts"
                ).value
            ),

        lastResult:
            lastResultUI.textContent,

        nextChoice:
            nextChoiceUI.textContent,

        nextAmount:
            nextAmountUI.textContent,

        activityLogs:
            data.activityLogs || []
    });
}

async function restorePersistedState() {

    if (persistedStateRestored) {
        return null;
    }

    const data =
        await chrome.storage.local.get([

            "activityLogs",

            "engineStatus",

            "currentAttempt",

            "totalAttempts",

            "lastResult",

            "nextChoice",

            "nextAmount"
        ]);

    renderLogs(
        data.activityLogs || []
    );

    engineStatusUI.textContent =
        data.engineStatus ?? "🔴 Stopped";

    currentAttemptUI.textContent =
        data.currentAttempt ?? "0";

    Engine.currentAttempt =
        getCurrentAttemptNumber();

    if (data.totalAttempts != null) {
        document.getElementById(
            "attempts"
        ).value = data.totalAttempts;
    }

    lastResultUI.textContent =
        data.lastResult ?? "-";

    nextChoiceUI.textContent =
        data.nextChoice ?? "-";

    nextAmountUI.textContent =
        data.nextAmount ?? "-";

    const restoredAttempt =
        getCurrentAttemptNumber();
    const restoredTotal =
        Number(data.totalAttempts) || 0;

    if (
        restoredTotal > 0 &&
        restoredAttempt > 0
    ) {
        updateAttemptProgress(
            restoredAttempt,
            restoredTotal
        );
    }

    persistedStateRestored = true;

    // #region agent log
    fetch('http://127.0.0.1:7391/ingest/de6115f7-dc0a-4377-999c-10b7507a1859',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'5b98c1'},body:JSON.stringify({sessionId:'5b98c1',location:'popup.js:restorePersistedState',message:'state restored from storage',data:{storedCurrentAttempt:data.currentAttempt,storedTotalAttempts:data.totalAttempts,uiAfterRestore:currentAttemptUI.textContent,engineCurrentAttempt:Engine.currentAttempt},timestamp:Date.now(),hypothesisId:'C',runId:'post-fix'})}).catch(()=>{});
    // #endregion

    console.log(
        "STATE RESTORED"
    );

    return data;
}

async function handleSaveAttempt(btn) {
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

    await syncAttemptUI(
        Number(attempt),
        getTotalAttemptsNumber(),
        true
    );
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

document.addEventListener(
    "DOMContentLoaded",
    async () => {

        await restorePersistedState();
        await initializeApp();
    }
);

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

        await syncAttemptUI(
            1,
            getTotalAttemptsNumber()
        );

        await generateStrategy({
            isNewGeneration: true
        });

        console.log(
            "STRATEGY GENERATED"
        );
    }
);

clearBtn.addEventListener(
    "click",
    clearStrategy
);


async function initializeApp(){

    await loadSavedStrategy();

    const data =
        await restorePersistedState();

    // #region agent log
    fetch('http://127.0.0.1:7391/ingest/de6115f7-dc0a-4377-999c-10b7507a1859',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'5b98c1'},body:JSON.stringify({sessionId:'5b98c1',location:'popup.js:initializeApp',message:'after loadSavedStrategy',data:{strategyKeys:Object.keys(strategyData).length,currentAttemptUI:currentAttemptUI?.textContent,engineCurrentAttempt:Engine.currentAttempt,storedTotalAttempts:data?.totalAttempts,docReady:document.readyState},timestamp:Date.now(),hypothesisId:'A',runId:'post-fix'})}).catch(()=>{});
    // #endregion

    if(
        Object.keys(strategyData).length > 0
    ){

        const savedAttempts =
            data?.totalAttempts ??
            Object.keys(
                strategyData
            ).length;

        document.getElementById(
            "attempts"
        ).value =
        savedAttempts;

        // #region agent log
        fetch('http://127.0.0.1:7391/ingest/de6115f7-dc0a-4377-999c-10b7507a1859',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'5b98c1'},body:JSON.stringify({sessionId:'5b98c1',location:'popup.js:initializeApp',message:'calling generateStrategy on reopen',data:{savedAttempts,currentAttemptUIBefore:currentAttemptUI?.textContent},timestamp:Date.now(),hypothesisId:'A',runId:'post-fix'})}).catch(()=>{});
        // #endregion

        await generateStrategy();

        restoreValues();

        // #region agent log
        fetch('http://127.0.0.1:7391/ingest/de6115f7-dc0a-4377-999c-10b7507a1859',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'5b98c1'},body:JSON.stringify({sessionId:'5b98c1',location:'popup.js:initializeApp',message:'after generateStrategy on reopen',data:{currentAttemptUIAfter:currentAttemptUI?.textContent,engineCurrentAttempt:Engine.currentAttempt},timestamp:Date.now(),hypothesisId:'A',runId:'post-fix'})}).catch(()=>{});
        // #endregion

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

async function generateStrategy(options = {}) {

    strategyContainer.innerHTML = "";

    const attempts = parseInt(
        document.getElementById("attempts").value
    );

    const currentAttempt =
        options.isNewGeneration
            ? 1
            : getCurrentAttemptNumber() || 1;

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

    // #region agent log
    fetch('http://127.0.0.1:7391/ingest/de6115f7-dc0a-4377-999c-10b7507a1859',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'5b98c1'},body:JSON.stringify({sessionId:'5b98c1',location:'popup.js:generateStrategy',message:'about to updateAttemptProgress',data:{currentAttempt,attempts,isNewGeneration:!!options.isNewGeneration,currentAttemptUI:currentAttemptUI?.textContent,engineCurrentAttempt:Engine.currentAttempt},timestamp:Date.now(),hypothesisId:'A',runId:'post-fix'})}).catch(()=>{});
    // #endregion

    await syncAttemptUI(
        currentAttempt,
        attempts
    );

    if (options.isNewGeneration) {
        await addLog(
            `Generated ${attempts} attempts`
        );
    }

    await saveState();
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
        async ()=>{

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

            await syncAttemptUI(
                Engine.currentAttempt,
                getTotalAttemptsNumber(),
                true
            );

        }
    );

}

if(lossBtn){

    lossBtn.addEventListener(
        "click",
        async ()=>{

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

            await syncAttemptUI(
                Engine.currentAttempt,
                getTotalAttemptsNumber(),
                true
            );

        }
    );

}


const startBtn = document.getElementById("startBtn");
const pauseBtn = document.getElementById("pauseBtn");
const stopBtn = document.getElementById("stopBtn");

if (startBtn) {
    startBtn.addEventListener(
    "click",
    async () => {

        engineStatusUI.textContent =
            "🟢 Running";

        await addLog(
            "Automation Started"
        );

        await saveState();
    }
);

}

if (pauseBtn) {
    pauseBtn.addEventListener(
    "click",
    async () => {

        engineStatusUI.textContent =
            "🟡 Paused";

        await addLog(
            "Automation Paused"
        );

        await saveState();
    }
);

}

if (stopBtn) {
    stopBtn.addEventListener(
    "click",
    async () => {

        engineStatusUI.textContent =
            "🔴 Stopped";

        await addLog(
            "Automation Stopped"
        );

        await saveState();
    }
);

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
