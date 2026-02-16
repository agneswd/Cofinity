# Cofinity Implementation Plan

## Purpose

Build Cofinity as a TypeScript VS Code extension for GitHub Copilot that contributes a tool-driven human-in-the-loop workflow similar to TaskSync, but without chat participants and without single-session overlap.

The extension must:

- work with the built-in Copilot agent through VS Code language model tools
- isolate multiple concurrent Copilot sessions so they do not share queue, timers, history, or pending requests
- provide an Activity Bar session manager UI
- support queued prompts per session
- support optional autopilot behavior per session
- stay on marketplace-safe public APIs where possible

## Feasibility Verdict

This is feasible.

What is possible:

- register one or more Copilot tools with `vscode.lm.registerTool`
- use the tool to collect user feedback or release queued prompts back to the model
- manage many concurrent sessions in the extension host
- route each pending tool request to the correct UI session
- keep queue, history, autopilot, and timers fully isolated per session

What is not guaranteed:

- the built-in Copilot agent cannot be forced with absolute certainty to call the tool before ending every response
- model compliance can be strongly encouraged with tool descriptions and instructions, but not guaranteed

This means Cofinity can implement a strong non-termination workflow pattern, but not a mathematically guaranteed infinite trap for the built-in Copilot agent.

## Key Design Decision

TaskSync's overlap issue comes from singleton state. Cofinity must replace that with per-session state.

TaskSync-style singleton fields that must never exist globally in Cofinity:

- one current tool call id
- one pending request map for all sessions
- one global prompt queue
- one global timeout timer
- one current session history array
- one global attachments bucket

Instead, Cofinity will have a `SessionRegistry` that owns many `SessionController` instances, one for each active Copilot session.

## API Constraints

### Public API we can rely on

- `vscode.lm.registerTool`
- `LanguageModelToolInvocationOptions.toolInvocationToken`
- `vscode.window.registerWebviewViewProvider`
- extension storage APIs such as `workspaceState` and `globalState`

### API we should not require for correctness

VS Code exposes richer chat identifiers in proposed or private APIs, including `chatSessionResource`, `chatRequestId`, `chatInteractionId`, and chat-session disposal hooks.

These are useful as optional enhancements, but the core implementation should not depend on them if the goal is marketplace-safe behavior.

### Routing implication

The stable public API gives us an opaque `toolInvocationToken`. We should treat it as opaque and non-serializable.

The safe runtime strategy is:

1. use an extension-generated `sessionId` string as the primary key
2. use an in-memory `WeakMap<object, sessionId>` as a best-effort token association layer while the extension host is alive
3. return the `sessionId` in every tool result and instruct the model to reuse it on later calls

## Product Shape

### Extension surface

Cofinity should be a tool-only extension with an Activity Bar session manager.

It does not need to edit files directly. The built-in Copilot agent will continue using its own existing tools for search, edits, execution, and diagnostics. Cofinity only manages the feedback loop.

### Primary tool

Start with one main tool:

- `cofinity_request_input`

This tool is responsible for:

- surfacing a question or next-step request to the user
- releasing the next queued prompt if one exists for that session
- returning user feedback to the model
- preserving the current `sessionId`

Optional future tools can be added later, but the MVP should stay with one tool to reduce model confusion.

### Activity Bar view

The Activity Bar view is the operator console for all live sessions.

The UI should support:

- session list with status and queue counts
- selected session detail panel
- pending request view
- response input for the current pending request
- queue editor for the selected session
- autopilot controls for the selected session
- event history for the selected session

## Recommended Project Structure

Use feature-first organization and keep files focused.

```text
Cofinity/
├── docs/
│   └── cofinity-implementation-plan.md
├── media/
│   └── session-manager/
│       ├── sessionManager.css
│       ├── sessionManager.html
│       └── sessionManager.ts
├── src/
│   ├── extension.ts
│   ├── features/
│   │   ├── cofinity-tool/
│   │   │   ├── registerCofinityTool.ts
│   │   │   ├── invokeCofinityTool.ts
│   │   │   ├── cofinityToolSchema.ts
│   │   │   └── cofinityToolResult.ts
│   │   ├── session-runtime/
│   │   │   ├── SessionRegistry.ts
│   │   │   ├── SessionController.ts
│   │   │   ├── SessionTokenRouter.ts
│   │   │   ├── sessionTypes.ts
│   │   │   ├── sessionSnapshot.ts
│   │   │   ├── sessionPersistence.ts
│   │   │   ├── sessionCleanup.ts
│   │   │   ├── Deferred.ts
│   │   │   └── Mutex.ts
│   │   └── session-manager-view/
│   │       ├── SessionManagerViewProvider.ts
│   │       ├── sessionManagerProtocol.ts
│   │       ├── sessionManagerProtocolGuards.ts
│   │       ├── sessionManagerStateBridge.ts
│   │       └── sessionManagerHtml.ts
│   └── shared/
│       └── ids.ts
├── package.json
├── tsconfig.json
└── esbuild.mjs
```

Notes:

- `shared/` should stay tiny and contain only truly cross-feature primitives such as ID generation
- queueing, timers, and autopilot should stay inside `session-runtime`, not a generic utility folder
- the webview feature should only know DTOs and protocol messages, never mutate runtime state directly

## Data Model

### Session identity

The extension must generate a stable string `sessionId`.

Recommended format:

- `UUID` or `ULID`

This `sessionId` becomes the main routing key for all extension state and all webview actions.

### Core types

```ts
type SessionId = string;

type SessionStatus =
  | "active"
  | "waitingForUser"
  | "running"
  | "paused"
  | "error"
  | "disposed";

interface PromptQueueItem {
  itemId: string;
  content: string;
  source: "user" | "system";
  enqueuedAtMs: number;
  status: "queued" | "sentToModel" | "skipped";
}

interface AutopilotState {
  mode: "off" | "drainQueue";
  maxTurns?: number;
  turnsUsed: number;
  cooldownUntilMs?: number;
}

interface SessionEvent {
  eventId: string;
  atMs: number;
  kind:
    | "toolInvoked"
    | "pendingRequestCreated"
    | "userResponded"
    | "queueItemAdded"
    | "queueItemReleased"
    | "autopilotUsed"
    | "cancelled"
    | "error";
  summary: string;
}

interface PendingUserRequest {
  requestId: string;
  prompt: string;
  kind: "question" | "approval" | "pick" | "freeform";
  options?: string[];
  createdAtMs: number;
}

interface InflightInvocation {
  invocationId: string;
  startedAtMs: number;
  cancelled: boolean;
}

interface SessionState {
  sessionId: SessionId;
  createdAtMs: number;
  lastActiveAtMs: number;
  status: SessionStatus;
  title: string;
  inflight: InflightInvocation | null;
  pendingRequest: PendingUserRequest | null;
  promptQueue: PromptQueueItem[];
  autopilot: AutopilotState;
  history: SessionEvent[];
  stats: {
    toolCalls: number;
    userResponses: number;
    cancellations: number;
  };
}
```

### In-memory only runtime fields

Some fields must never be persisted:

- deferred resolvers for pending tool calls
- live cancellation token bindings
- live timeout handles
- live token-object associations
- mutex state

Those belong inside `SessionController`, not inside persisted DTOs.

## Session Runtime Architecture

### SessionRegistry

Responsibilities:

- create sessions
- get existing sessions by `sessionId`
- list active sessions for the UI
- dispose idle or closed sessions
- publish snapshots to the webview bridge
- own the `Map<sessionId, SessionController>`

### SessionTokenRouter

Responsibilities:

- maintain `WeakMap<object, SessionId>` for best-effort association between `toolInvocationToken` and a session
- attach a token to a session after the session is known
- resolve a session from token if available
- never attempt to serialize or inspect token internals

### SessionController

Responsibilities:

- enforce one in-flight tool request at a time for that session
- own queue state for that session
- create and resolve pending user requests
- apply autopilot policy for that session
- record history and stats for that session
- produce immutable snapshots for the UI
- own timeout handles and cleanup for that session

### Serialization rule

Different sessions may run concurrently.

Within one session, tool invocations must be serialized with a mutex. This prevents race conditions when the model calls the tool twice before the user has answered the first pending request.

## Tool Contract

### MVP input schema

The tool input should be explicit and resilient to malformed model output.

Recommended schema:

```ts
interface CofinityAskUserInput {
  sessionId?: string;
  question: string;
  requestKind?: "question" | "approval" | "pick" | "freeform";
  options?: string[];
}
```

### MVP output shape

Return both plain text and structured JSON so the model has a durable machine-readable payload.

Recommended output fields:

```ts
interface CofinityAskUserOutput {
  sessionId: string;
  response: string;
  source: "user" | "queue" | "autopilot";
  queuedRemaining: number;
  waiting: false;
}
```

If the tool wants to indicate an unresolved wait state, it can still block and await the user in the extension host. That is the primary MVP behavior.

### Tool description strategy

The tool description should tell the model:

- call this tool before ending a task or when user feedback is needed
- always reuse the exact `sessionId` returned by the previous call
- if more work remains after processing the returned response, call the tool again with the same `sessionId`

This improves compliance, but does not guarantee it.

## End-to-End Tool Flow

### New session flow

1. Copilot agent invokes `cofinity_request_input` without a known `sessionId`.
2. Tool handler validates input.
3. Tool handler asks `SessionTokenRouter` whether the token is already associated.
4. If not, `SessionRegistry` creates a new session and returns a new `sessionId`.
5. The tool attaches the live token object to that `sessionId` in the `WeakMap`.
6. `SessionController` decides how to satisfy the request:
   - if queue has items and autopilot policy allows drain, release next queued item
   - otherwise create a pending request and wait for user response from the webview
7. Tool returns a result containing `sessionId` and the chosen response.

### Existing session flow

1. Copilot agent invokes the tool and includes `sessionId`.
2. Tool handler routes directly to the matching session.
3. Session mutex is acquired.
4. SessionController either:
   - returns next queued prompt
   - uses autopilot response
   - creates a new pending request and waits for user input
5. Tool returns structured result.

### User response flow

1. Extension pushes a pending-request snapshot to the webview.
2. User selects the correct session in the Activity Bar view.
3. User submits a response.
4. Webview sends `respondToRequest` with `sessionId` and `requestId`.
5. Extension validates that the request is still current.
6. SessionController resolves the matching deferred promise.
7. Tool invocation completes and returns the result to the model.

## Queueing Behavior

Queueing is per session.

Required rules:

- adding a prompt to one session must never affect another session
- if a session has a pending request, queued content for another session must not wake it
- if a session is in `drainQueue` autopilot mode, each tool call should release at most one queued item
- queue items should keep provenance so the UI can show whether a response came from a user or queue

Recommended policy:

- a queued prompt should not auto-inject itself unless the tool is invoked for that same session
- if the session has a pending request and the user queues a prompt manually, allow a policy switch:
  - MVP: queue only
  - later: optionally consume queue immediately if the pending request is unresolved and the user explicitly selects "answer with queued prompt"

## Autopilot Behavior

Autopilot should also be per session.

Recommended MVP mode:

- `off`
- `drainQueue`

Rules:

- autopilot must never be global
- autopilot counters must never be shared across sessions
- autopilot should have a `maxTurns` limit per session to prevent accidental runaway use
- when queue becomes empty, the session should fall back to waiting for user input

## Persistence Strategy

### Persist

Persist only lightweight session summaries, not active promises.

Persistable fields:

- `sessionId`
- `title`
- `createdAtMs`
- `lastActiveAtMs`
- `status` as a summary state
- bounded history summary
- queue summary if desired
- autopilot mode and counters

### Do not persist

- live pending request resolvers
- active `toolInvocationToken` associations
- live timeout handles
- mutex state

### Reload semantics

On extension reload:

- restore session summaries for visibility only
- mark any session that had an active wait as `interrupted`
- require a new tool call to continue

This avoids pretending that an interrupted in-flight tool request can be resumed.

## Webview Protocol

The protocol should be versioned and strict.

### Envelope

```ts
interface ProtocolEnvelope<TType extends string, TPayload> {
  protocolVersion: 1;
  type: TType;
  requestId?: string;
  sessionId?: string;
  payload: TPayload;
}
```

### Extension to webview messages

- `sessionsSnapshot`
- `sessionSnapshot`
- `sessionDisposed`
- `error`

### Webview to extension messages

- `uiReady`
- `selectSession`
- `respondToRequest`
- `enqueuePrompt`
- `toggleAutopilot`
- `disposeSession`
- `clearQueue`

### Validation rules

- `respondToRequest` must include both `sessionId` and `requestId`
- stale or mismatched `requestId` must be rejected
- if selected session does not exist, return protocol error
- snapshots should be idempotent so webview reload is safe

## UI Layout

Recommended layout:

### Left rail

- active sessions list
- status badge
- queued item count
- pending/waiting indicator
- last active time

### Main panel

- session title and status
- current pending question card
- response textbox and submit button
- queue list for that session
- add-to-queue form
- autopilot mode control
- event history list

### UX requirements

- switching sessions must never drop pending state
- response form must lock onto the selected session only
- if a user tries to submit a stale response, the UI should show a warning and refresh

## Implementation Phases

### Phase 1: Foundation

- create extension scaffold
- configure TypeScript strict mode
- add build pipeline for extension host and webview assets
- register the Activity Bar container and webview view
- register `cofinity_request_input`

### Phase 2: Session runtime

- implement shared types
- implement mutex and deferred primitives
- implement SessionController
- implement SessionRegistry
- implement SessionTokenRouter

### Phase 3: Tool flow

- implement tool schema validation
- implement new-session and existing-session routing
- implement pending-request wait flow
- implement queue release flow
- implement structured tool results

### Phase 4: Webview shell

- implement webview host provider
- implement protocol layer and runtime guards
- implement sessions list and selected session view
- implement response form

### Phase 5: Queue and autopilot

- implement per-session queue UI
- implement per-session drain policy
- implement autopilot guardrails and limits

### Phase 6: Persistence and cleanup

- persist summaries only
- restore interrupted sessions after reload
- add idle cleanup and manual dispose

### Phase 7: Testing and hardening

- unit tests for session runtime
- integration tests for tool routing and webview bridge
- manual validation with two or more live Copilot sessions

## Testing Strategy

### Unit tests

Test the session runtime without Copilot.

Required cases:

- two sessions can wait for user input at the same time without overlap
- two tool invocations in one session are serialized
- queue drain affects only one session
- stale `requestId` reply is rejected
- cancellation affects only the correct session
- autopilot counters are isolated per session

### Integration tests

Test the extension host and webview bridge.

Required cases:

- activating the extension creates the Activity Bar view correctly
- webview `uiReady` receives snapshots
- responding in session A cannot resolve session B
- enqueuing in session B cannot wake session A
- reload restores summaries and marks interrupted sessions correctly

### Manual validation

Required real-world checks:

- start two Copilot sessions that both call the tool
- confirm that both appear in the session manager separately
- confirm that answering one only resolves one invocation
- confirm that queues stay isolated

## Risks and Mitigations

### Risk: model omits `sessionId` on later calls

Mitigation:

- return `sessionId` in structured JSON and plain text
- keep tool description explicit about reusing it
- use best-effort token association while the extension host remains alive

### Risk: `toolInvocationToken` identity is not enough across reloads

Mitigation:

- do not depend on it across reloads
- use it only as a runtime convenience, never as a persisted identifier

### Risk: user closes or reloads the webview while the tool is waiting

Mitigation:

- keep pending state in extension host memory
- resend snapshots when the webview reconnects
- optionally reveal the Activity Bar view when a pending request is created

### Risk: model does not continue the loop

Mitigation:

- design each tool call to still be useful if it is the last one
- provide strong tool instructions and recommended custom instructions for the user
- avoid product promises that claim guaranteed infinite looping

### Risk: marketplace review or policy scrutiny

Mitigation:

- position the product as a multi-session human-in-the-loop workflow manager
- include guardrails such as per-session turn caps and explicit user control
- keep private-use and GitHub-release distribution as the initial launch path

## Parallel Sub-Agent Task Plan

This breakdown is designed to minimize file overlap.

Parallelism gate:

- Track 1 does not need to be fully complete before parallel work begins
- what must be stable first is the shared contract slice
- that contract slice includes public session types, snapshot DTOs, tool input and output shapes, and webview protocol message unions
- once those contracts are frozen, runtime internals, tool wiring, webview host wiring, and UI implementation can proceed in parallel with much lower merge risk

### Track 0: Project scaffold

Owner: one agent

Outputs:

- `package.json`
- `tsconfig.json`
- `esbuild.mjs`
- base `src/extension.ts`
- Activity Bar and view contributions

Dependencies:

- none

Overlap risk:

- high if shared with other tracks, so keep it isolated and finish first

### Track 1: Session runtime core

Owner: one agent

Outputs:

- `sessionTypes.ts`
- `Deferred.ts`
- `Mutex.ts`
- `SessionController.ts`
- `SessionRegistry.ts`
- `sessionSnapshot.ts`

Dependencies:

- Track 0 only

Overlap risk:

- low if nobody else edits session-runtime during this track

### Track 2: Token routing and cleanup

Owner: one agent

Outputs:

- `SessionTokenRouter.ts`
- `sessionCleanup.ts`
- `sessionPersistence.ts`

Dependencies:

- Track 0
- coordinate interfaces with Track 1, but avoid editing Track 1 files unless agreed ahead of time

Overlap risk:

- medium with Track 1, so agree on interface boundaries first

### Track 3: Tool contract and tool handler

Owner: one agent

Outputs:

- `cofinityToolSchema.ts`
- `cofinityToolResult.ts`
- `invokeCofinityTool.ts`
- `registerCofinityTool.ts`

Dependencies:

- Track 0
- Track 1 public interfaces
- optional Track 2 token router interface

Overlap risk:

- low if runtime interfaces are stable

### Track 4: Webview protocol and host bridge

Owner: one agent

Outputs:

- `sessionManagerProtocol.ts`
- `sessionManagerProtocolGuards.ts`
- `sessionManagerStateBridge.ts`
- `SessionManagerViewProvider.ts`
- `sessionManagerHtml.ts`

Dependencies:

- Track 0
- snapshot DTO contracts from Track 1

Overlap risk:

- low if DTO shapes are agreed first

### Track 5: Webview UI

Owner: one agent

Outputs:

- `media/session-manager/sessionManager.html`
- `media/session-manager/sessionManager.ts`
- `media/session-manager/sessionManager.css`

Dependencies:

- Track 4 protocol message shapes

Overlap risk:

- low, because this track should not edit extension-host files

### Track 6: Queue and autopilot policies

Owner: one agent

Outputs:

- queue and autopilot logic inside `SessionController`
- queue/autopilot snapshot fields
- UI hooks consumed by Track 5

Dependencies:

- Track 1
- protocol agreements from Track 4

Overlap risk:

- medium with Track 1 and Track 5, so this track should land after Track 1 interfaces are stable

### Track 7: Wiring and integration

Owner: one agent

Outputs:

- final activation wiring in `extension.ts`
- webview-to-runtime event wiring
- tool-to-runtime routing integration

Dependencies:

- Tracks 1, 3, 4, and 5

Overlap risk:

- high, so do this after core feature tracks merge

### Track 8: Tests

Owner: one agent

Outputs:

- runtime unit tests
- protocol guard tests
- integration tests for session isolation

Dependencies:

- Tracks 1, 3, and 4

Overlap risk:

- low if tests live in separate files

## Recommended Execution Order

1. Track 0
2. Freeze the shared contract slice from Tracks 1, 3, and 4
3. Tracks 1, 3, and 4 in parallel once contracts are frozen
4. Track 5 after Track 4 protocol exists
5. Track 2 after Track 1 public interfaces settle
6. Track 6 after Track 1 and Track 4 settle
7. Track 8 after tool and runtime contracts exist
8. Track 7 last for full integration

## MVP Acceptance Criteria

The MVP is done when all of the following are true:

- two or more Copilot sessions can invoke `cofinity_request_input` concurrently
- each session shows up separately in the Activity Bar session manager
- queue state is isolated per session
- answering session A cannot resolve session B
- each tool result returns a stable `sessionId`
- interrupted sessions survive reload as summaries only and are clearly marked interrupted
- no proposed or private API is required for correct runtime behavior

## Post-MVP Enhancements

- optional support for proposed chat-session identifiers when running on Insiders
- attachments and image support per session
- reusable prompt libraries
- exportable session histories
- smarter queue policies such as consume-immediately-on-user-confirm
- diagnostics view for lost session bindings or malformed model calls

## Final Recommendation

Build the first version as a marketplace-safe, tool-only extension with one Activity Bar session manager and one primary tool named `cofinity_request_input`.

Keep the session model explicit and extension-owned. Do not rely on singleton provider state, and do not rely on proposed chat APIs for correctness.

The entire product lives or dies on one rule:

every mutable piece of runtime state must belong to exactly one `sessionId`.