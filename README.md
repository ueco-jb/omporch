# omporch

omporch runs OMP agents inside isolated and persistent Docker sandboxes. It also coordinates groups of temporary workers for larger tasks.

The project keeps its existing command names:

- `ompbox` creates and manages one sandbox.
- `omporch` plans work, dispatches workers, and reports results.

## Requirements

Install these programs on the host:

- Docker
- Bun 1.3.14 or later
- SQLite 3

The host user must be able to access Docker without `sudo`.

## Root setup

Run this once:

```sh
sudo ./setup-root.sh
```

This starts Docker at boot and adds the invoking user to the `docker` group. Sign in again if the script changes group membership.

Use the shared mount option only when live directory attachment is required:

```sh
sudo ./setup-root.sh --rshared
```

## Build the base image

```sh
bin/ompbox build
```

The default image contains Bun, OMP 18.1.16, Nix, Rust 1.95.0, Cargo, Git, common command tools, and the standing directives under `directives/`.

Version overrides:

```sh
OMP_VERSION=18.1.16 bin/ompbox build --no-cache
OMPBOX_BASE_IMAGE=example/image:tag bin/ompbox build
```

## Create and use a sandbox

```sh
bin/ompbox up myproject -w ~/projects/myproject
bin/ompbox run myproject
bin/ompbox sh myproject
```

The workspace is mounted at the same absolute host path. Each agent gets its own state directory under `~/.ompbox/agents/<name>/state`. All boxes share an isolated Nix store under `~/.ompbox/nix` so downloaded project toolchains and dependencies survive temporary workers.

Agent names must contain lowercase letters, digits, and dashes. The maximum length is 63 characters.

When a workspace contains `flake.nix`, workers run project build, test, lint, and generated code commands through `nix develop -c`. This activates the pinned project tools and environment instead of relying on the base image Rust toolchain.

## Directory access

A sandbox sees its workspace and only the extra directories that were added on purpose.

```sh
bin/ompbox add-dir myproject ~/projects/shared
bin/ompbox add-dir myproject ~/secrets --ro
bin/ompbox rm-dir myproject /home/u/secrets
```

A directory under the user home is mounted at the same path. Other directories default to `/mnt/<name>`. Adding or removing a directory recreates the container after committing its writable layer.

For a live attachment, first create the shared stage with `setup-root.sh --rshared`, mount the stage into the agent, then bind a directory into it:

```sh
sudo mount --bind /path/to/data ~/.ompbox/stage/data
```

## Sandbox commands

```text
ompbox build [--no-cache]
ompbox up <name> -w <dir> [-d HOST[:CONT][:ro]]...
ompbox run <name> [-- <omp args>]
ompbox sh <name>
ompbox add-dir <name> <host> [cont] [--ro]
ompbox rm-dir <name> <cont>
ompbox stop <name>
ompbox start <name>
ompbox snapshot <name> [tag]
ompbox ls
ompbox rm <name> [--purge]
ompbox logs <name>
```

Removing an agent without `--purge` keeps its state. Using `--purge` removes its state image and host state directory.

## omporch chat

```sh
bin/omporch chat -w ~/projects/myproject
```

The chat session is the orchestrator. It scopes the request and dispatches isolated workers through the `dispatch` tool.

```text
omporch chat -w <workspace> [--model M] [--worker-model M] [-c N] [--keep-workers] [--new | --continue | --resume [ID]] [--allow-dir DIR]
```

Behavior:

- The orchestrator has inspection tools but no tools that modify the workspace.
- Each worker receives one complete task and the shared workspace.
- Independent tasks run in parallel.
- Worker containers are removed after each task by default.
- `--keep-workers` retains worker containers for investigation.
- Cancellation stops active worker commands and removes their containers.
- Without a session flag, an interactive terminal menu offers a new session, OMP continue behavior, recent sessions from this omporch workspace, the full OMP history browser, and quit. Up and Down move the selection and Enter opens it.
- `--new` starts a fresh chat session.
- `--continue` asks OMP to continue the session associated with the current terminal; it is not guaranteed to select the newest session.
- `--resume ID` and `--resume=ID` resume that session. Bare `--resume` opens the OMP history browser.
- Explicit session flags bypass the menu. Noninteractive callers must provide one of them.

Extra directories must be approved through `--allow-dir`. omporch resolves each path before dispatch, rejects paths inside the workspace, shows approved paths during batch approval, and mounts them as read only. Models cannot add host mounts.

## omporch batch run

```sh
bin/omporch run "implement the requested change" -w ~/projects/myproject
```

```text
omporch run <request> -w <workspace> [--yes] [-c N] [--model M] [--keep-workers] [--allow-dir DIR]
```

The batch flow is:

1. A host OMP process creates a validated task graph with tools disabled.
2. The user approves the graph unless `--yes` is present.
3. omporch runs ready tasks up to the concurrency limit.
4. A host OMP process writes the final report with tools disabled.

Task ids are validated before any file or Docker operation. Duplicate ids, unknown dependencies, self dependencies, and dependency cycles are rejected.

Run artifacts are stored under `~/.ompbox/runs/<run id>/`:

- `plan.json`
- `results.json`
- one JSONL event file for each started task
- `report.md` for batch runs

## Authentication

OMP stores account credentials in `~/.omp/agent/agent.db`. When a new sandbox is created, omporch uses the SQLite backup command to make a consistent copy of the account database. It also copies `config.yml` and `models.db` when they exist.

Each sandbox owns its copy. Concurrent copies can conflict when an identity provider rotates refresh tokens. Use the OMP authentication broker for large parallel runs.

## Standing directives

The base image contains:

- `directives/RULES.md`
- `directives/AGENTS.md`

The container entrypoint copies them into the agent state directory on every start. Rebuild the image and recreate an agent to apply directive changes.

## Development

Install dependencies and run validation:

```sh
cd orchestrator
bun install --frozen-lockfile
bun test
bun run typecheck
```

The TypeScript check includes `src`, `ext`, and `test`. The test suite covers identifier validation, dependency graphs, mount boundaries, worker cleanup, cancellation, planner parsing, event parsing, and shell path traversal.
