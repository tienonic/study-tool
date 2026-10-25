# Components

Study Tool uses SolidJS for the browser UI, a Web Worker for database operations, SQLite for local persistence, and FSRS for review scheduling. The feature folders below separate the responsibilities without requiring a router or a remote account service.

## Application and data

| Component | Location | Responsibility |
| --- | --- | --- |
| Application entry | `src/main.tsx`, `src/App.tsx` | Mounts the app and switches between the dashboard and an active study project. |
| Study layout | `src/components/layout/` | Hosts the study menu, section views, review toggles, and supporting panels. |
| Shared state | `src/core/store/` | Tracks the active project, section, view, and UI settings. A handler registry routes keyboard actions to the active section. |
| Shared hooks | `src/core/hooks/` | Connects the worker, keyboard controls, timer, and math rendering to the UI. |
| Worker protocol | `src/core/workers/protocol.ts` | Defines requests and responses between the browser UI and the database worker. |
| Database worker | `src/core/workers/` | Runs SQLite queries and scheduler operations away from the UI thread. Persists data through IndexedDB. |
| Project model | `src/projects/` | Defines, validates, and loads project sections. The public registry includes a synthetic example. |
| Math generators | `src/data/` | Creates math problems and their worked solutions. |
| Display helpers | `src/components/`, `src/utils/` | Renders math and shared controls and supplies formatting helpers. |

## Feature folders

| Folder under `src/features/` | Responsibility |
| --- | --- |
| `dashboard` | Project selection, statistics, content creation, and scheduling parameters. |
| `launcher` | File import, recent projects, project loading, and transitions into study. |
| `learning` | Workbook, topic map, learning context validation, source links, and math checks. |
| `quiz` | Multiple choice, passage questions, flashcards, source figures, review flow, and merged sessions. |
| `math` | Generated exercise sessions and their answer flow. |
| `activity` | Review charts and session activity displays. |
| `glossary` | Searchable terms relevant to the current content. |
| `ai` | Optional assistant UI and requests to the local AI bridge. |
| `notes` | Quick notes associated with a project. |
| `settings` | Scheduling settings, keyboard bindings, and shortcut tips. |
| `backup` | Backup, restore, and autosave behavior. |
| `export` | Explicit project exports. |

## Scheduling and evidence

`ts-fsrs` 5.2.3 implements FSRS-6. The scheduler uses its default 21 weights, short-term learning, no fuzz, and each deck's retention and maximum interval settings. This app does not fit new weights from local review logs.

SQLite schema version 4 preserves the FSRS card state, including `learning_steps`. Review logs support statistics and undo. Changes to the scheduler dependency require checking migrations and learning transitions, not just compiling the application.

The learning workspace distinguishes source coverage, browser recall, coached attempts, and independent attempts. Topic evidence supplied by a tutor is displayed as supplied. A generated explanation, answer reveal, or source reference does not become independent practice credit.

## Local development services

The plugins in `vite-plugins/` run only with the local Vite server.

| Plugin | Responsibility |
| --- | --- |
| `open-folder.ts` | Reads and opens allowed local project locations. |
| `export-data.ts` | Writes requested exports within the allowed output root. |
| `learning-workspace.ts` | Reads a validated workspace receipt from local learning exports. |
| `ai-bridge.ts` | Calls a locally configured Claude CLI and streams its response. |
| `img-proxy.ts` | Supports optional image lookup through a server request. |
| `local-audio-cache.ts` | Serves locally cached pronunciation audio. |
| `debug-log.ts` | Receives local diagnostic logs. |

Keep this server on loopback. These endpoints are local tools, not a hosted multi-user backend. A static deployment needs an explicit replacement for any server feature it intends to support.

## Portable route planner

`harness/learning-workspace.mjs` contains the portable planner bundled from the existing tutoring implementation. `harness/demo.mjs` exercises it with synthetic topics and attempts. The planner can run without a private tutoring installation. See [Tutor integration](integration.md) for its boundary.

`harness/learning-core.mjs` also contains tutor mode parsing and instructions, practice evidence evaluation, card quality rules, card storage operations, incremental preparation, and retirement checks. This is reusable logic with caller-supplied storage and job adapters. It does not include the private tutor UI, provider configuration, or source collection service.
