console.log("LogicPilot AI Loaded");

chrome.runtime.onInstalled.addListener(() => {
    // #region agent log
    fetch('http://127.0.0.1:7391/ingest/de6115f7-dc0a-4377-999c-10b7507a1859',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'ef7d33'},body:JSON.stringify({sessionId:'ef7d33',location:'background.js:onInstalled',message:'extension installed/reloaded',data:{manifestMatches:chrome.runtime.getManifest().content_scripts?.[0]?.matches},timestamp:Date.now(),hypothesisId:'A',runId:'pre-fix'})}).catch(()=>{});
    // #endregion
});