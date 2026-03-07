# Project Guidelines

## Build and Test

- Run `npm install` before first build.
- Use `npm run check` after TypeScript edits to catch type regressions early.
- Use `npm run build` for full validation. It builds both the extension host bundle and the session manager webview bundle.
- Use `npm test` for extension-host coverage. The `pretest` script already runs `npm run build` first.
- Use `npm run watch` when iterating on extension and webview code together. It only rebuilds bundles on change; it does not launch the extension development host.
- To run the extension, start the `Run Cofinity Extension` launch configuration in VS Code after a build or while `npm run watch` is running.

## Architecture

- Cofinity is a tool-only VS Code extension built around one primary Copilot tool, `cofinity_request_input`, plus an Activity Bar session manager.
- Keep feature boundaries intact:
  - `src/features/cofinity-tool/`: tool schema, registration, and invocation flow
  - `src/features/session-runtime/`: per-session state, routing, queueing, persistence, cleanup, and async primitives
  - `src/features/session-manager-view/`: extension-host webview provider, protocol, and state bridge
  - `media/session-manager/`: browser-side session manager UI assets
  - `src/shared/`: small cross-feature primitives only
- `SessionRegistry` owns session lifecycles. `SessionController` owns per-session behavior. Prefer extending those existing seams instead of adding new global coordinators.
- The webview must communicate through the session-manager protocol and snapshots. Do not let UI code mutate runtime state directly.

## Conventions

- Preserve strict per-session isolation. Do not introduce singleton mutable state for pending requests, queues, timers, histories, autopilot state, attachments, or the current tool call.
- Treat `toolInvocationToken` as opaque, in-memory only, and non-serializable. Use extension-owned `sessionId` values as the durable routing key.
- Keep the one-session-one-inflight-request model intact. If a change affects request sequencing, follow the existing `Mutex` and `Deferred` patterns instead of bypassing them.
- Keep persistence aligned with the current summary-only restore model unless the task explicitly expands persistence requirements.
- Reuse the existing ID pattern in `src/shared/ids.ts` for new session-related identifiers.
- Prefer small, feature-local changes over adding generic utility layers.

## References

- See `README.md` for setup, manual validation flow, and the current project layout.
- See `docs/cofinity-implementation-plan.md` for design rationale, API constraints, and session-runtime guardrails.
- Use `src/features/session-runtime/SessionRegistry.ts`, `src/features/session-runtime/SessionController.ts`, and `src/test/suite/sessionRegistry.test.ts` as the primary examples for session isolation behavior.