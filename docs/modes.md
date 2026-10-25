# Study modes

Study Tool separates the kind of work from the controls used during review. A view determines what you do; a review option changes how Drill presents cards.

## Workspace views

| View | Use it for | Behavior |
| --- | --- | --- |
| Drill | Repeated retrieval practice. | Runs the active section's quiz, flashcard session, or math generator. |
| Workbook | Working through a question with written reasoning. | Shows prompts, source figures, hints, answer reveals, and generated math checks. Revealing an answer does not prove independent performance. |
| Topic map | Finding related topics and prerequisites. | Draws topic relationships and displays evidence supplied by the tutoring owner. Follow a prerequisite and return to the original topic. |

## Learning modes

**Exam** keeps work tied to the supplied assessed scope and goal. Prerequisites remain visible when they support that scope. **Depth** supports broader exploration of the topic and its prerequisites. Both depend on the supplied topic graph; neither infers an exam syllabus from card titles.

The portable planner can recommend next work from explicit attempts. A local tutor owns the actual teaching conversation and independent assessment. Workbook checks, browser recall, and tutor attempts remain separate evidence.

## Drill formats

| Format | Interaction | Feedback |
| --- | --- | --- |
| Flashcards | Recall the answer before revealing the back. | Rate the recall to update its next review date. Cards may include figures and pronunciation audio. |
| Multiple choice | Choose an answer from the available options. | See the correct answer and supplied explanation. |
| Passage questions | Read shared context, then answer related questions. | Keep the passage beside the current question. |
| Generated math | Enter an answer to a new conversion, average, percentage, or decimal problem. | Check the answer and inspect the solution. |

## Review options

| Option | Effect |
| --- | --- |
| Scheduled review | Selects due cards and introduces new cards within the configured daily limit. |
| Cram | Reviews cards without waiting for their due dates, ordered by weak stability. |
| Simple mode | Uses fewer review controls. The exact available ratings depend on the card format. |
| Merge sections | Combines compatible quiz sections while keeping the underlying section and card identities. |
| Flip | Presents the definition side first for flashcards. |
| Mix | Randomizes which side appears first on new flashcards. While enabled, it controls the prompt side instead of Flip. |
| Zen | Hides extra controls and progress information. |
| Suspend | Removes a card from normal review until it is restored. |
| Bury | Defers the card until the next day. |
| Undo | Reverses the last supported review action. |

Open the study menu for **Keys** and **Tips**. Those panels show current shortcuts, including customized bindings. They are the authoritative shortcut reference because flashcard and quiz ratings use different controls.

## Dashboard and supporting tools

**Review** opens projects and shows their card counts. **Stats** summarizes browser review history. **Create** prepares new project content, with optional AI generation. **Parameters** configures scheduling settings.

The activity graph, glossary, notes, AI panel, backup tools, and focus timer support a session. Statistics describe recorded activity and recall; they do not establish independent mastery or an expected exam score.

## Tutoring modes and card preparation

The portable learning core exposes the original tutor's three modes separately from the browser views.

| Tutor mode | Purpose |
| --- | --- |
| Topic tree (`tree`, or `1`) | Shows concepts, connections, and saved evidence, then waits for a branch choice. |
| Exam preparation (`exam`, or `2`) | Uses source-backed questions, independent first answers, focused repair, and later mixed practice. |
| Fundamentals (`fundamentals`, or `3`) | Explains mechanisms and dependencies, with optional depth and no compulsory quiz. |

The browser calls broader exploration **Depth**. The tutor core calls its corresponding learning mode **Fundamentals**. These are separate interfaces; `parseMode` accepts the tutor values above.

Card policy is independently **off** or **needed**. The preparation worker scans history initially, considers new or changed answers on later runs, and periodically reconsiders existing cards. It checks existing objectives before creating cards and preserves stable IDs and schedules. Retirement requires repeated independently graded evidence on distinct dates over at least seven days. Later incorrect evidence can invalidate a retirement. Age or one correct answer is insufficient.

These functions ship in `harness/learning-core.mjs`. The terminal UI, live tutor-turn trigger, and background scheduler remain integration responsibilities; importing the module does not start an agent.
