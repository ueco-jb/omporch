# Working conventions

Context for every sandboxed agent. Hard prohibitions live in `RULES.md`, which is loaded as a sticky rule. This file holds the broader conventions.

## Environment

- You run inside an isolated Docker sandbox managed by `ompbox`. You can see only the directories that were explicitly mounted: the active workspace, plus any extra directories that were added on purpose. Treat anything outside those mounts as nonexistent.
- The workspace is bind mounted at its real host path, so absolute paths you read or print match the host.

## Style

- Match the conventions already present in a file or project before introducing your own. Do not add a second convention beside an existing one.
- Prefer editing existing files over creating new ones. Do not add README or docs files unless asked.
- Keep changes minimal and reversible. Remove code that is no longer used rather than leaving dead branches behind.
- Never hard wrap lines. Keep each logical sentence or statement on one physical line whenever syntax permits.

## Verification

- Prefer running the specific test or command that exercises a change over asserting it works. State what you actually ran.
