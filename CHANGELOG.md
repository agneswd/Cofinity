# Changelog

## Cofinity v0.0.3 (03-18-26)

- Remembered whether the session manager was last on the global inbox view or the normal session chat when reopening the view.
- Kept the active view mode synchronized between the webview and extension host so the inbox state survives tab switches.
- Closed the global inbox view automatically when switching to a different session from the sidebar.
- Made pending-request options clickable in both the session chat and global inbox views so they send the option text immediately.
- Removed the queued-prompt clear button to avoid an easy accidental destructive click.
- Updated the `cofinity_request_input` model description to reinforce the required requestInput loop behavior.

## Cofinity v0.0.2 (03-17-26)

- Fixed chat reopen behavior so session view reopens pinned to the latest messages instead of resetting to the top.
- Added a one-shot orange attention flash around the chat when a pending request becomes visible.
- Kept the working indicator alive across view reopen without a timeout by persisting the post-reply waiting state.

## Cofinity v0.0.1 (03-17-26)

- Added a multi-session session manager UI for Cofinity-managed Copilot tool loops.
- Added a global pending view for replying across multiple waiting sessions.
- Added queue editing, autopilot settings, and improved session-manager UX polish.
- Added VSIX packaging support, MIT licensing, and automated GitHub release workflow support.