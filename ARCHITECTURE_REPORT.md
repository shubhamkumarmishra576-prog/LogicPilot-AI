# LogicPilot AI - Architecture Report

## File Responsibilities

### manifest.json
- Extension configuration
- Permissions declaration (storage, activeTab, tabs, scripting)
- Host permissions for damanworld.org and damanapp.download
- Content script injection rules
- Service worker registration

### background.js
- Service worker for extension lifecycle
- Handles extension install/reload events
- Minimal implementation (currently only logs)

### content.js
- Injected into damanworld.org and damanapp.download pages
- DOM manipulation (clicking buttons, reading results)
- Message listener for popup/actionMap communication
- Timer monitoring for automation
- Bet execution logic
- SPA route change detection

### popup.js
- UI controller for extension popup
- Strategy configuration UI generation
- State persistence (chrome.storage.local)
- Activity logging
- Engine state synchronization
- Manual win/loss simulation buttons
- Timer automation start/stop controls

### workflowEngine.js
- Workflow execution engine
- Manages engineState (status, currentAttempt, totalAttempts, lastResult)
- Executes workflow steps via actionMap
- Handles step transitions
- Engine lifecycle (start, pause, stop)

### actionMap.js
- Maps workflow actions to implementations
- ACTION_PRIMARY: Places bet via sendToActiveTab
- ACTION_SECONDARY: Alternative bet placement (currently unused)
- Delegates to messaging.js for communication

### automation.js
- Engine object for strategy logic
- State management (isRunning, isPaused, currentAttempt, lastResult, lastBetTarget, lastBetAmount)
- Strategy branching logic (onWin/onLoss)
- Bet recording and outcome determination
- Next move calculation based on strategy data

### strategy.js
- StrategyManager for persistence
- save(): Stores strategy to chrome.storage.local
- load(): Retrieves strategy from chrome.storage.local

### messaging.js (NEW)
- Centralized messaging utilities
- isRestrictedTabUrl(): Checks for chrome://, edge://, etc.
- isSupportedTabUrl(): Validates damanworld.org and damanapp.download
- isMissingContentScriptError(): Detects content script injection failures
- sendMessageToTab(): Sends messages with timeout handling
- sendToActiveTab(): High-level message sending with auto-injection fallback

## Data Flow

### Strategy Configuration Flow
1. User enters attempts in popup
2. User clicks "Generate Strategy"
3. popup.js generates strategy cards (Attempt 1, Attempt 2, etc.)
4. User configures choice/amount for each attempt
5. User clicks "Save" on each card
6. StrategyManager.save() stores to chrome.storage.local
7. popup.js syncs attempt UI and saves state

### Workflow Execution Flow
1. User clicks "Start" in popup
2. popup.js calls buildWorkflow() to create workflow from strategyData
3. popup.js calls workflowEngine.startEngine(workflow)
4. workflowEngine.executeCurrentStep() retrieves current step
5. workflowEngine calls actionMap[step.action](step)
6. actionMap.ACTION_PRIMARY calls sendToActiveTab(message)
7. messaging.js sends message to active tab
8. content.js receives message and executes action
9. content.js returns response
10. workflowEngine advances to next step

### Timer Automation Flow
1. User clicks "START AUTOMATION" in popup
2. popup.js calls startTimerAutomation()
3. popup.js sends START_TIMER_AUTOMATION message to content script
4. content.js starts timer monitoring (MutationObserver on .TimeLeft__C)
5. When timer hits 00:20, callback triggers
6. content.js calls Engine.calculateNextMove(strategyData)
7. content.js calls executeBet(choice, amount)
8. content.js calls getLatestResult() after bet
9. content.js updates Engine.lastResult
10. Cycle repeats for next round

### State Persistence Flow
1. Any state change in popup
2. popup.js calls saveState()
3. syncEngineStateFromUI() syncs UI to engineState
4. chrome.storage.local.set() saves engineState, engineStatus, currentAttempt, totalAttempts, lastResult, nextChoice, nextAmount, activityLogs
5. On popup open, restorePersistedState() loads from storage
6. UI elements updated with restored values

## Message Flow

### Popup → Content Script
- **PING**: Health check
- **CLICK_BIG**: Click big betting button
- **CLICK_SMALL**: Click small betting button
- **PLACE_BET**: Execute bet with choice and amount
- **START_TIMER_AUTOMATION**: Begin timer-based automation
- **STOP_TIMER_AUTOMATION**: Stop timer-based automation

### Content Script → Popup
- Response messages with status and result data
- No direct content-to-popup messages (all responses are async callbacks)

### ActionMap → Content Script
- **PLACE_BET**: Via sendToActiveTab() through messaging.js

### Content Script Injection Flow
1. sendToActiveTab() attempts to send message
2. If "Receiving end does not exist" error
3. chrome.scripting.executeScript() injects content.js
4. Retry message send
5. If injection fails, return error

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                        popup.html                            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   Strategy   │  │   Control    │  │   Activity   │      │
│  │   Config UI  │  │   Buttons    │  │     Log      │      │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘      │
└─────────┼──────────────────┼──────────────────┼─────────────┘
          │                  │                  │
          ▼                  ▼                  ▼
┌─────────────────────────────────────────────────────────────┐
│                        popup.js                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │  Strategy    │  │   Engine     │  │   State      │      │
│  │  Manager     │  │   Control    │  │ Persistence  │      │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘      │
└─────────┼──────────────────┼──────────────────┼─────────────┘
          │                  │                  │
          ▼                  ▼                  │
┌──────────────────┐  ┌──────────────┐          │
│ workflowEngine.js│  │ automation.js│          │
│  ┌────────────┐  │  │  ┌────────┐  │          │
│  │  engine    │  │  │  │ Engine │  │          │
│  │  State     │  │  │  │ Object │  │          │
│  └─────┬──────┘  │  │  └───┬────┘  │          │
└────────┼─────────┘  └──────┼───────┘          │
         │                    │                  │
         ▼                    ▼                  │
┌──────────────────┐  ┌──────────────┐          │
│   actionMap.js   │  │ strategy.js  │          │
│  ┌────────────┐  │  │  ┌────────┐  │          │
│  │ ACTION_    │  │  │  │ Save/  │  │          │
│  │ PRIMARY    │  │  │  │ Load   │  │          │
│  └─────┬──────┘  │  │  └───┬────┘  │          │
└────────┼─────────┘  └──────┼───────┘          │
         │                    │                  │
         └────────┬───────────┘                  │
                  ▼                              │
         ┌──────────────────┐                    │
         │   messaging.js   │                    │
         │  ┌────────────┐  │                    │
         │  │sendToActive│  │                    │
         │  │    Tab     │  │                    │
         │  └─────┬──────┘  │                    │
         └────────┼─────────┘                    │
                  │                              │
                  ▼                              │
         ┌──────────────────┐                    │
         │ chrome.tabs API  │                    │
         └────────┬─────────┘                    │
                  │                              │
                  ▼                              │
         ┌──────────────────┐                    │
         │   content.js     │                    │
         │  ┌────────────┐  │                    │
         │  │ DOM Manip  │  │                    │
         │  │ Bet Exec   │  │                    │
         │  │ Timer Obs  │  │                    │
         │  └────────────┘  │                    │
         └──────────────────┘                    │
                  │                              │
                  ▼                              │
         ┌──────────────────┐                    │
         │   Web Page       │                    │
         │ (damanworld.org) │                    │
         └──────────────────┘                    │
                                                 │
         ┌──────────────────┐                    │
         │chrome.storage    │◄───────────────────┘
         │    .local        │
         └──────────────────┘
```

## Key Design Patterns

### Module Pattern
- automation.js uses Engine object as singleton
- strategy.js uses StrategyManager object as singleton

### Strategy Pattern
- actionMap.js maps action names to implementations
- Allows easy addition of new action types

### Observer Pattern
- content.js uses MutationObserver for timer monitoring
- content.js uses hashchange listener for SPA routing

### Promise-based Messaging
- All chrome.tabs.sendMessage calls wrapped in Promises
- Timeout handling for reliability

### State Persistence
- chrome.storage.local used for all state
- Automatic restore on popup open

## Potential Improvements

1. **Background Service Worker**: Currently minimal, could handle periodic tasks
2. **Error Recovery**: Add retry logic for failed bet executions
3. **Validation**: Add client-side validation before saving strategies
4. **Testing**: No unit tests present
5. **TypeScript**: Could benefit from type safety
6. **Configuration**: Hardcoded URLs could be configurable
7. **Logging**: Debug logging scattered, could use centralized logger
8. **Metrics**: No telemetry for success/failure rates
