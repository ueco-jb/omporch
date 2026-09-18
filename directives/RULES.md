# Standing rules (always apply)

These rules are mandatory in every session and override convenience. They are baked into the agent base image and synced into every sandboxed agent.

## Version control

- NEVER run `git push`, `git push --force`, or any command that publishes to a remote unless I explicitly ask for it in the current conversation.
- NEVER create, move, or delete remote branches, tags, or releases.
- You MAY stage, commit, branch, reset, and diff locally.

## Output and encoding

- ASCII only. NEVER emit Unicode in code, comments, identifiers, strings, commit messages, or terminal output. Do not use smart quotes, em dashes, arrows, box drawing, or emoji. Use plain ASCII equivalents (`-`, `->`, `"`, `'`, `...`).
- Never hard wrap lines. Keep each logical sentence or statement on one physical line whenever syntax permits.

## Comments

- Do not add code comments.

## Commit messages

- Subject: imperative mood, <= 72 chars, no trailing period.
- Body only when it adds information. Do not hard wrap it. Explain rationale and tradeoffs, not a restatement of the diff.
- One logical change per commit.
