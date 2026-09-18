# Working conventions

Context for every sandboxed agent. Hard prohibitions live in `RULES.md`, which is loaded as a sticky rule. This file defines the working process.

## Environment

- You run inside an isolated Docker sandbox managed by `ompbox`. You can see only the directories that were explicitly mounted: the active workspace plus any extra directories added on purpose. Treat anything outside those mounts as nonexistent.
- The workspace is bind mounted at its real host path, so absolute paths you read or print match the host.
- Do not assume network access, credentials, remote state, installed tools, or files outside visible mounts.

## Instructions and sources of truth

- At the start of every task, read every applicable `AGENTS.md`, `CLAUDE.md`, `RULES.md`, skill, spec, and referenced project document for the files in scope. Read them again whenever a finding or correction cites a rule.
- Current repository files and current tool output outrank summaries and prior interpretations.
- Identify the project hierarchy before implementation. A project spec, accepted decision, issue, plan, test contract, and implementation may form an ordered chain. Do not make a downstream layer contradict an upstream source of truth.
- Use names and domain terms from project docs and existing code. Search for precedent before introducing a new name or mechanism.

## Scope and planning

- Understand the task before editing. Read the relevant docs, complete source sections, callers, tests, and configuration. Form an approach, criticize it, and reduce it to the smallest coherent change.
- Use planning effort proportional to risk. Handle obvious local edits directly. Use an explicit plan for coupled components, architecture decisions, migrations, public contracts, secrets, or difficult rollback.
- Organize work around the requested end state. Separate independent work, sequence only real dependencies, put shared foundations first, and leave conflict prone integration until dependent work is ready.
- Track every item in a multi step request. Track questions awaiting user input as tasks so they cannot be lost.
- Ask only when a choice has materially different outcomes and project sources do not answer it. State the decision needed and its tradeoffs in one place.
- Do not pause between authorized steps or ask whether to continue. Stop only when genuinely blocked or before an action that requires explicit approval.

## Implementation

- Fix the source of a problem, not its symptom. Prefer changing the producer over compensating in every consumer.
- Reuse existing mechanisms before adding new ones. Do not add a second convention beside an existing one.
- Choose the smallest solution that preserves required behavior, error handling, security, and tests. Every added abstraction, option, state field, wrapper, fallback, and branch must have a current caller and a concrete need.
- Avoid abstractions with one user, forwarding only wrappers, stored values that are cheap to derive, options every caller sets identically, defensive branches for states the types exclude, and support for data shapes the system never produced.
- Remove dead parameters, fields, functions, branches, aliases, and compatibility paths. Migrate every caller in the same pass. Never hide dead surface with a prefix, lint suppression, or explanatory doc.
- Use domain types when they exist. Introduce a small domain type when interchangeable primitives can be swapped or bypass validation. Primitive wire values are acceptable at external boundaries, then parse them into domain types.
- Treat errors as part of the API. Preserve structured failure information, handle every meaningful branch, and avoid silent fallbacks.
- Avoid unnecessary allocation, cloning, collection, locking, and dynamic dispatch in compiled code. Use the standard library and exhaustive types where they express the behavior directly.
- If the user identifies a repeated mistake, fix the instance, inspect all session changes for the same pattern, and fix every occurrence.

## External boundaries

- Treat every external type, numeric width, unit, decimal scale, field name, nullability rule, enum set, error shape, ordering rule, timestamp format, and encoding as unverified until pinned to an authoritative specification or a test based on a real recorded response.
- Generated bindings count as evidence for the artifact they came from. Hand written casts, scaling, and reinterpretation still require independent verification.
- Rank boundary risk by impact. Money movement, authentication, permissions, and chain data require the strongest evidence.

## Tests

- For a bug fix, write or preserve a reproduction that fails before the fix and passes after it. If a permanent test would add no durable value, use a direct smoke reproduction and report it.
- Modified logic needs tests that observe behavior a user or caller depends on. Cover boundaries, invariants, state transitions, precedence, concurrency, financial calculations, and real error paths when relevant.
- Prefer real data and real implementations. Mock only true IO boundaries such as network, file system, clock, or an unavailable external service.
- Do not test getters, constructors, language behavior, framework plumbing, mock echoes, source text, implementation details, bare absence of an exception, or incidental formatting.
- Tests must survive internal refactors that preserve behavior. Test names state the behavior and expected outcome.
- Never delete, skip, weaken, or ignore a valid test to make validation pass. Fix the code or prove the assertion is wrong.

## Verification

- Run the narrow command that exercises the changed behavior first. Then run the project checks required by its docs and the affected surface.
- Run independent checks in parallel. After a failure, fix the root cause and rerun only the failed checks unless the fix can affect another passed check.
- Never suppress a compiler error, warning, lint, or failing check without explicit user approval. Delete dead code rather than silencing it.
- Use the project formatter for formatting. Do not hand edit formatting that a configured formatter owns.
- Treat environment failures as environment failures. Report the missing prerequisite or broken environment instead of changing product code to accommodate it.
- Before handoff, inspect every changed chunk for necessity, scope, caller migration, docs, tests, and leftover scaffolding. Revert any change that cannot be justified by the request, required behavior, or a defect encountered in scope.

## Reviews and feedback

- Review the changed files in full, not only the diff hunks. Keep findings scoped to lines the change can fix.
- Every finding names the exact code, the actors in the causal chain, the observable damage, and the evidence. Do not sell a finding with severity prose when the causal chain cannot justify it.
- Anchor a review comment where it will be posted. Put related code at the end as a parenthetical reference.
- Keep review comments short and concise, using only the length needed to explain the finding. Put backticks around every identifier. Mark uncertainty exactly where it occurs. Prefix every comment with exactly one severity: `nit:`, `low:`, `med:`, or `high:`.
- Suggest rather than command in review comments. Use one concrete suggestion sentence after the causal chain.
- Recheck outdated but unresolved feedback against current source. Do not treat outdated as resolved.
- Independently evaluate every human or automated review comment against the current source. Do not repeat it as fact.
- Do not publish review comments, submit reviews, resolve threads, push fixes, or mutate remote state without explicit approval of that exact action.

## Communication and handoff

- Answer the question first. Do not paraphrase the request as a confirmation step.
- State decisions already made and make them vetoable. Surface any required user action at the end where it cannot be missed.
- When blocked, state the exact missing input, what was verified, and what work remains. Do not include speculative alternatives as facts.
- A handoff uses pointers rather than payloads: paths, symbols, issue ids, pull request ids, exact status, decisions, rejected approaches, next actions, and blockers. Do not paste code, diffs, or logs that the next agent can read directly.
- Report only verification that actually ran. Never claim completion from a plan, test file, or plausible implementation alone.
