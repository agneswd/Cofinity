# Changelog

## Cofinity v0.0.2 (03-17-26)

- Fixed chat reopen behavior so session view reopens pinned to the latest messages instead of resetting to the top.
- Added a one-shot orange attention flash around the chat when a pending request becomes visible.
- Kept the working indicator alive across view reopen without a timeout by persisting the post-reply waiting state.

## Cofinity v0.0.1 (03-17-26)

- Added a multi-session session manager UI for Cofinity-managed Copilot tool loops.
- Added a global pending view for replying across multiple waiting sessions.
- Added queue editing, autopilot settings, and improved session-manager UX polish.
- Added VSIX packaging support, MIT licensing, and automated GitHub release workflow support.