# Cofinity

Cofinity is a TypeScript VS Code extension for GitHub Copilot that adds a multi-session human-in-the-loop tool workflow around Copilot tool calls.

The current implementation is built around one language model tool, `cofinity_request_input`, and an Activity Bar session manager that keeps concurrent sessions isolated instead of collapsing them into one shared queue or one shared pending prompt.

## Current capabilities

- concurrent session isolation with a per-session runtime model
- `toolInvocationToken`-assisted routing with extension-owned `sessionId` values
- queued prompts per session
- basic per-session autopilot with turn guardrails
- summary-only session persistence across reloads
- idle-session cleanup
- Activity Bar session manager for responding, queueing, inspecting history, and disposing sessions
- extension-host tests for session isolation, queue routing, restore behavior, autopilot limits, and cancellation

## Important limitation

Cofinity can strongly encourage Copilot to keep returning to the tool loop, but it cannot absolutely force the built-in Copilot agent to call the tool before every completion. Model compliance is influenced by tool descriptions and instructions, not guaranteed by the extension API.

## Development

Install dependencies:

```bash
npm install
```

Build the extension and webview bundles:

```bash
npm run build
```

Run a TypeScript check:

```bash
npm run check
```

Run the extension-host test suite:

```bash
npm test
```

Watch during development:

```bash
npm run watch
```

## Project layout

- `src/features/cofinity-tool/`: tool schema, registration, and invocation flow
- `src/features/session-runtime/`: session state, routing, queueing, persistence, and cleanup
- `src/features/session-manager-view/`: Activity Bar webview host and protocol
- `media/session-manager/`: session manager UI assets
- `src/test/`: extension-host test runner and session runtime tests
- `docs/cofinity-implementation-plan.md`: architectural plan and task breakdown

## Manual validation flow

1. Run `npm run build`.
2. Launch the extension development host from VS Code.
3. Open the Cofinity Activity Bar view.
4. Start one or more Copilot sessions that invoke `cofinity_request_input`.
5. Verify that each session appears independently and that responding to one session does not resolve another.

## Status

The extension foundation, runtime core, persistence layer, session manager UI, and session-isolation tests are in place.
