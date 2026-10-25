# Privacy and publication

The public repository contains code and synthetic examples. It excludes real decks, course assets, learner histories, databases, credentials, local machine settings, and trial fonts. Its Git history starts with this sanitized package so earlier local course files do not travel with it.

## Where study data goes

Card state and review history live in SQLite backed by the browser's IndexedDB. Imported project definitions and preferences also use browser storage. Clearing site data can remove this work. Use the backup and export controls before moving browsers or clearing storage.

Local server features can read project files and write exports on your computer. After review events, autosave can write `exports/<project>/autosave.json` automatically. The tutoring receipt endpoint reads `exports/learning/`. Those files are private runtime inputs and do not belong in Git.

## Optional network requests

Core review does not require an account. AI generation, the assistant bridge, image lookup, linked sources, and remote media can send requests outside the browser. Their providers receive the content needed for those requests. Configure them deliberately and avoid sending private course material unless you intend to share it with that provider.

The local Claude bridge uses your installed CLI and its account. This repository does not include credentials or a hosted AI service. Keep the development server bound to localhost.

## Before publishing your own copy

1. Include application code and a small synthetic example only.
2. Exclude `.env` files, credentials, project JSON, generated assets, exports, audio caches, databases, and machine configuration.
3. Inspect the files and the Git history you will push. Deleting a file from the latest commit does not remove it from history.
4. Build from the sanitized tree. Building in a private workspace can include generated decks or assets.
5. Inspect the resulting `dist/` before deploying it.

The source repository does not grant permission to redistribute imported teaching materials. Dependency licenses remain in their packages, with additional notices in `THIRD_PARTY_NOTICES.md` and `LICENSES/`.
