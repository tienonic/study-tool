# Project File Format

Create a local `.json` file, then load it via "Open Project File" or drag and drop. Real project JSON files are local-only and ignored by Git; the GitHub-visible sample lives in `src/projects/example-art-history.ts`.

## Structure

```json
{
  "name": "Project Name",
  "version": 1,
  "config": {
    "desired_retention": 0.9,
    "new_per_session": 20,
    "leech_threshold": 8,
    "max_interval": 365,
    "imageSearchSuffix": "",
    "listening": { "enabled": false },
    "study_goal": {
      "start_date": "2030-01-07",
      "target_date": "2030-01-15",
      "weekend_multiplier": 2
    }
  },
  "sections": [],
  "glossary": []
}
```

- **config** is optional (defaults shown above). `desired_retention` is a retrieval-probability target; a higher value creates more reviews. It is not a progress percentage. `new_per_session` is the legacy JSON name for the local-day new-card limit. `max_interval` caps the longest review gap in days (default: 365). `imageSearchSuffix` is appended to Google Images queries. Listening defaults to disabled and is deck-specific.
- **study_goal** is optional and deck-specific. Calendar dates use `YYYY-MM-DD`. The weekend multiplier can range from 1 through 4; `2` assigns twice the unseen-card exposure to Saturday and Sunday. The planner recalculates from the current unseen count after missed days. It never rewrites review history or treats exposure as durable retention.
- **sections**: array of section objects (at least one required)
- **glossary**: optional array of `{ "term": "...", "def": "..." }` objects shown in the sidebar. Add `"hasImage": true` to include a Google Images link.

## Section Types

Every section needs `id` (unique lowercase string), `name`, and `type`.

### mc-quiz

```json
{
  "id": "elements",
  "name": "Elements",
  "type": "mc-quiz",
  "questions": [
    {
      "q": "What is the symbol for Gold?",
      "correct": "Au",
      "wrong": ["Go", "Gd", "Ag"],
      "explanation": "From Latin 'aurum'.",
      "imageName": "gold element"
    }
  ],
  "hasFlashcards": true,
  "flashcards": [
    {
      "front": "Gold (Au)",
      "back": "<strong>Atomic #:</strong> 79<br><strong>Group:</strong> Transition metal"
    }
  ]
}
```

**Question fields:** `q`, `correct`, `wrong` (exactly 3) are required. `explanation` and `imageName` are optional.

**Flashcards:** Set `hasFlashcards: true` and add a `flashcards` array with `front`/`back` pairs. `back` supports HTML (`<strong>`, `<br>`, `<em>`).

A section may contain flashcards without placeholder quiz questions. It opens directly in flashcard mode. Vocabulary decks can add stable `id` and `priority` values plus `lemma`, `display_form`, `pronunciation_en`, `meaning_en`, `usage_note`, `part_of_speech`, `grammar`, `tags`, `source_refs`, and `audio_text`. If one vocabulary field is present, all required vocabulary fields must be present. Keep provenance in `source_refs`, not in visible `front` or `back` copy.

Generated decks, source extracts, audio, private validators, and audit manifests remain local-only. Keep one-off release profiles outside tracked source.

For a listening-enabled local deck, pre-generate immutable audio with an installed `edge-tts` Python module:

```bash
npm run audio:generate -- path/to/source-deck.json \
  --output-deck path/to/deck-with-audio.json \
  --cache-root audio-cache
```

The deck's listening config must specify `provider: "cached-audio"`, a voice, rate, and the exact version reported by `edge-tts --version`. The generator refuses a version mismatch. The cache key includes normalized text, voice, rate, pronunciation override, and engine version. `audio-cache/` and its manifest are ignored by Git. At runtime the local dev server serves only confined `.mp3`, `.ogg`, or `.wav` paths from that cache.

**Images:** Set `hasImages: true` to show "View Image" links using each question's `imageName`.

### passage-quiz

```json
{
  "id": "reactions",
  "name": "Reactions",
  "type": "passage-quiz",
  "instruction": "Read the passage, then answer.",
  "scenarios": [
    {
      "passage": "In an exothermic reaction, energy is released...",
      "source": "Chemistry Ch. 5",
      "questions": [
        {
          "q": "What is ΔH for exothermic?",
          "correct": "Negative",
          "wrong": ["Positive", "Zero", "Undefined"],
          "explanation": "Energy leaves → ΔH < 0."
        }
      ]
    }
  ],
  "tips": ["Check atom counts on both sides"]
}
```

Shows a passage then asks questions about it. `instruction`, `source`, and `tips` are optional. Questions use the same format as mc-quiz.

### math-gen

```json
{
  "id": "math",
  "name": "Math",
  "type": "math-gen",
  "generators": ["conversion", "average", "percent", "decimal"]
}
```

Generates random problems with step-by-step solutions. Available generators: `conversion` (unit conversions), `average`, `percent`, `decimal` (arithmetic).

## Rules

- Always exactly 3 wrong answers per question
- Keep answer options similar in character count and detail; the longest and shortest visible options should stay within 12 characters, and the correct answer must not be the longest or most specific option
- Section IDs: lowercase, no spaces (e.g. `"elements"`, `"ch5-reactions"`)
- Keep explanations to 1–2 sentences
- Use `imageName` for visual subjects: creates a Google Images link
- Passage-quiz is best for content that shares context (readings, case studies, legal text)

For detailed guidance on generating projects with LLMs, see [`GENERATING_PROJECTS.md`](../GENERATING_PROJECTS.md).
