# AGENTS.md

## Changelog & Versioning

- Update `CHANGELOG.md` with every user-facing change.
- Use this heading format exactly: `## Cofinity vX.Y.Z (MM-DD-YY)`.
- Use a two-digit year in the date, for example `02-25-26`.

## Security & Responsible Use

- Do not commit secrets or credentials.
- Do not introduce synchronous blocking calls on the VS Code extension host.
- Remove all `console.log` and `console.warn` statements once all issues are fixed.
- Use `console.error` for genuine errors only.