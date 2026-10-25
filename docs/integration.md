# Tutor integration

Study Tool can display a workspace receipt written by a tutoring system. The tutor owns teaching, source acquisition, and independent assessment. Study Tool owns browser practice and recall history. The portable route planner connects explicit topic and attempt data to useful next work.

## Run the planner example

```bash
npm run test:harness
```

The synthetic example in `harness/demo.mjs` shows the actual input shape and checks an exam-scoped result. The exported implementation is in `harness/learning-workspace.mjs`. Use those files as the executable API reference.

## Supply a workspace receipt

Write a JSON receipt to `exports/learning/<topic-id>.json`. The receipt's `workspace` field follows `LearningConfig` in `src/features/learning/model.ts`. It includes topics with stable IDs, titles, associated section IDs, and prerequisite IDs. Optional fields supply a goal, exam or depth mode, source references, and an adaptive route with distinct evidence categories.

During local development, open:

```text
http://localhost:3000/?learningFile=example-topic.json&view=map
```

Use `view=workbook` for the workbook. The local endpoint exposes the receipt's workspace data. Filenames must pass the endpoint's validation. Topic and section IDs must match the intended project; a receipt does not silently establish a different deck's ownership.

A project can also carry learning configuration in `config.learning`. Static builds can use this imported configuration without the local receipt endpoint.

## Keep responsibilities separate

| Owner | Responsibility |
| --- | --- |
| Study Tool | Browser views, project import, review state, recall scheduling, and explicit exports. |
| Portable planner | Computes a learning route from supplied topic relations and attempt evidence. |
| Tutoring system | Teaches, collects attempts, evaluates independent work, and writes current receipts. |
| Source system | Acquires and stores authorized course or reference material. |

Pi is the tutoring owner in the original local installation. Its private sessions, course connectors, agent settings, and maintenance jobs are not bundled here. A new installation must supply its own tutor and sources if it wants those integrations. Pstack and Potato Mode are development workflows, not required app components.

## Preserve evidence meaning

A tutor should distinguish assisted work, independent answers, and recall. Keep the original attempt records in the tutor's ledger and expose only the fields needed for the browser view. A source link means the material is available; it does not show that the learner read or mastered it. Refresh receipts when their underlying evidence changes.

## Reuse the learning core

`harness/learning-core.mjs` exports mode parsing, mode instructions, practice evidence and recommendations, recall-card quality checks, card operations, incremental preparation, and reversible retirement checks. `harness/learning-core.test.mjs` demonstrates mode selection, source-checked card preparation, and retirement evidence.

`createLearningCardTools` receives storage adapters for deck paths, journal paths, state reads and writes, and card policy. `createFlashcardPreparation` receives the tutor's snapshot, job launch, and apply adapters. Callers provide their own private directories and model execution. The module includes file-lock support for serialized local updates; it does not bundle a provider account or start scheduled work.

The export removes the original machine-specific writing-guide path from the preparation prompt and keeps its plain-language instruction. Runtime files, topic catalogs, personal sources, conversation histories, and saved preferences remain outside the package.
