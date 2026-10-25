# Generating Study Projects

This guide covers how to create study project JSON files for the study tool — by hand, or by prompting an LLM to generate them from source material.

---

## Quick Start: LLM Prompt Template

Copy this entire block into any LLM (Claude, Gemini, ChatGPT, etc.) along with your source material. Replace the bracketed placeholders.

````
I need you to create a study project JSON file. Here are the rules:

**Output format:** A single JSON object matching this schema:

```json
{
  "name": "Project Name",
  "version": 1,
  "config": {
    "desired_retention": 0.9,
    "new_per_session": 20,
    "leech_threshold": 8
  },
  "sections": [ ... ],
  "glossary": [ ... ]
}
```

**Section types:**

1. `mc-quiz` — Multiple-choice questions. Required field: `questions` (array).
2. `passage-quiz` — Reading comprehension. Required field: `scenarios` (array of `{passage, source?, questions[]}`).
3. `math-gen` — Math practice. Required field: `generators` (array). Only these keys work: `"conversion"`, `"average"`, `"percent"`, `"decimal"`.

**Question format** (used in mc-quiz and passage-quiz):
```json
{
  "q": "Question text (supports $LaTeX$ for math)",
  "correct": "The correct answer",
  "wrong": ["Wrong 1", "Wrong 2", "Wrong 3"],
  "explanation": "Why the correct answer is right"
}
```

**Flashcard format** (optional, attach to any mc-quiz or passage-quiz section):
```json
{ "front": "Term or question", "back": "Answer (HTML ok: <strong>, <br>)" }
```

**Glossary entry format:**
```json
{ "term": "Key term", "def": "Definition" }
```

**IMPORTANT: Use a single section unless the user explicitly asks for multiple.**
Multiple sections create separate tabs in the UI, which gets crowded. Put all questions in ONE section with a general name (e.g., "All Topics"). Only split into multiple sections if the user specifically requests it.

**Section structure:**
```json
{
  "id": "all-topics",
  "name": "All Topics",
  "type": "mc-quiz",
  "questions": [ ... ],
  "flashcards": [ ... ],
  "hasFlashcards": true,
  "tips": ["Study tip 1", "Study tip 2"]
}
```

**Quality rules — follow these strictly:**
- Before generating, write a short study agreement: goal/event, desired outcome, scope boundary, source universe, output contract, depth/time, and success proof.
- Before generating, build a source ledger for every relevant source in the agreed boundary. Mark each source found/downloaded, converted to LLM-readable text, categorized, excluded by agreement, or inaccessible with a recovery path.
- Do not create a deck from a partial source set unless missing/auth-blocked/unreadable sources are visible source gaps and the deck is labeled as downgraded/not fully exam-ready.
- Every question MUST have exactly 3 wrong answers (4 total options)
- Wrong answers must be plausible misconceptions, not obviously wrong
- Normalize option character count and detail — keep the longest and shortest visible options within 12 characters, and the correct answer must not be the longest or most specific option
- For term-in-context MCQs, do not make one option carry all the contextual detail while the others are short labels
- No "all of the above" or "none of the above"
- No absolutes ("always", "never") unless that's genuinely the answer
- Every question must have an `explanation`
- Card text must be the study prompt or answer only. Do not include source/deck preambles in visible fields: no `Connect eBook Ch4:`, `MGT Ch6 slide visual drill:`, `Source:`, `Final guide:`, source IDs, page IDs, coverage labels, `source point 1`, or `Which [course] final concept fits this clue:` in `q`, `correct`, `wrong[]`, `explanation`, `flashcard.front`, or `flashcard.back`.
- For art history slide/image IDs, style/movement/culture is required ID content: include it in feedback and in flashcard answers, not just in surrounding notes
- For art history, every in-scope artwork/object/image from the source ledger must be covered, explicitly excluded, or listed as a source gap before the deck is called exam-ready.
- Distribute the correct answer position randomly (don't always put it first)
- One fact per flashcard — no lists or compound answers
- Interleave topics within sections rather than clustering by subtopic
- Include a glossary for all key terms
- Questions should span Bloom's taxonomy: ~30% understand, ~40% apply, ~30% analyze

**Do NOT include** `cardIds` or `flashCardIds` — these are computed automatically.

**Source material:**
[PASTE YOUR SOURCE MATERIAL HERE]

**Study agreement and source ledger:**
[PASTE THE AGREED CONSTRAINTS AND SOURCE LEDGER HERE. Do not generate from source material alone.]

**What to generate:**
- Project name: [YOUR PROJECT NAME]
- [NUMBER] mc-quiz sections covering [TOPICS]
- [NUMBER] passage-quiz sections if the source has readings
- Flashcards for key terms and facts
- Glossary of all important terms
- Tips for each section with study strategies

Output ONLY the JSON, no commentary.
````

---

## JSON Schema Reference

### Top Level: `ProjectData`

| Field | Type | Required | Description |
|---|---|---|---|
| `name` | `string` | Yes | Display name for the project |
| `version` | `number` | No | Version number (defaults to 1) |
| `config` | `object` | No | FSRS and session configuration (see below) |
| `sections` | `Section[]` | Yes | At least one section |
| `glossary` | `GlossaryEntry[]` | No | Key terms and definitions |

### `config` (ProjectConfig)

All fields are optional. Defaults shown:

| Field | Type | Default | Description |
|---|---|---|---|
| `desired_retention` | `number` | `0.9` | Target recall probability (0.7–0.97). Lower = fewer reviews, higher = more reviews |
| `learn_steps` | `number[]` | `[1, 10]` | Initial learning steps in minutes |
| `new_per_session` | `number` | `20` | Max new cards introduced per session |
| `leech_threshold` | `number` | `8` | Lapses before a card is flagged as a leech |
| `imageSearchSuffix` | `string` | `""` | Appended to image search queries (e.g. `"plant identification"`) |

### `Section`

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | `string` | Yes | Unique identifier, kebab-case (e.g. `"cell-biology"`) |
| `name` | `string` | Yes | Display name |
| `type` | `string` | Yes | `"mc-quiz"`, `"passage-quiz"`, or `"math-gen"` |
| `questions` | `Question[]` | If `mc-quiz` | Array of multiple-choice questions |
| `scenarios` | `Scenario[]` | If `passage-quiz` | Array of passage + questions groups |
| `generators` | `string[]` | If `math-gen` | Generator keys (see Math section) |
| `flashcards` | `Flashcard[]` | No | Flashcard deck for this section |
| `hasFlashcards` | `boolean` | No | Set `true` if `flashcards` is provided |
| `hasImages` | `boolean` | No | Whether questions reference images (uses `imageName` for search) |
| `tips` | `string[]` | No | Study tips shown in the tips overlay |
| `instruction` | `string` | No | Header text displayed above the section |

**Do NOT include `cardIds` or `flashCardIds`** — these are computed automatically by the loader.

**Validation rules** (the app will reject your file if these fail):
- Every section must have `id`, `name`, and `type`
- Section `id` values must be unique across the project
- `type` must be one of: `mc-quiz`, `passage-quiz`, `math-gen`
- `mc-quiz` sections must have a non-empty `questions` array
- `passage-quiz` sections must have a non-empty `scenarios` array
- `math-gen` sections must have a non-empty `generators` array
- The project must have a `name`
- The project must have at least one section

### `Question`

| Field | Type | Required | Description |
|---|---|---|---|
| `q` | `string` | Yes | Question text. Supports `$LaTeX$` (inline) and `$$LaTeX$$` (display). HTML tags render as literal text |
| `correct` | `string` | Yes | The correct answer |
| `wrong` | `string[]` | Yes | Wrong answers (provide exactly 3 for best results) |
| `explanation` | `string` | No | Shown after answering. Strongly recommended |
| `imageName` | `string` | No | Used for image search queries when `hasImages` is true |
| `cropName` | `string` | No | Alternative crop name for image display |

### `Scenario`

| Field | Type | Required | Description |
|---|---|---|---|
| `passage` | `string` | Yes | The reading passage |
| `source` | `string` | No | Attribution for the passage |
| `questions` | `Question[]` | Yes | Questions about this passage |

### `Flashcard`

| Field | Type | Required | Description |
|---|---|---|---|
| `front` | `string` | Yes | Card front (question/term). Supports both HTML and `$LaTeX$` |
| `back` | `string` | Yes | Card back (answer/definition). Supports both HTML and `$LaTeX$` |

Supported HTML tags in flashcards: `<strong>`, `<em>`, `<br>`, `<ul>`, `<li>`, `<code>`.

### `GlossaryEntry`

| Field | Type | Required | Description |
|---|---|---|---|
| `term` | `string` | Yes | The term |
| `def` | `string` | Yes | Definition |
| `hasImage` | `boolean` | No | Whether to show an image search link |

### Card ID Scheme (auto-generated)

You never supply these — the app computes them at load time:

| Section Type | Card ID Format | Example |
|---|---|---|
| `mc-quiz` | `{sectionId}-{questionIndex}` | `cell-bio-0`, `cell-bio-1` |
| `passage-quiz` | `{sectionId}-{scenarioIdx}-{questionIdx}` | `reading-0-0`, `reading-0-1`, `reading-1-0` |
| Flashcards | `{sectionId}-flash-{cardIndex}` | `cell-bio-flash-0` |
| `math-gen` | None (generated dynamically) | — |

---

## Formatting Support

The app renders each field with a different renderer. Using the wrong format (e.g., HTML tags in a question, or LaTeX in a passage) produces broken output. **Always check this table before generating content.**

| Field | LaTeX `$...$` | HTML tags | Renderer | Notes |
|---|---|---|---|---|
| `q` | Yes | **No** (literal) | `LatexText` | Use LaTeX for math, plain text for everything else |
| `correct` | Yes | **No** (literal) | `LatexText` | Same as `q` |
| `wrong[]` | Yes | **No** (literal) | `LatexText` | Same as `q` |
| `explanation` | Yes | **No** (literal) | `LatexText` | Same as `q` |
| `flashcard.front` | Yes | Yes | `LatexHtml` | Full formatting support |
| `flashcard.back` | Yes | Yes | `LatexHtml` | Full formatting support |
| `passage` | **No** | Yes | raw `innerHTML` | Use unicode for math (×, ÷, ≤, ≥, →) |
| `glossary.def` | **No** | **No** | plain text | Unicode symbols only |
| `tips[]` | **No** | **No** | plain text | Unicode symbols only |

**Common mistakes to avoid:**
- `<strong>` in a question field → renders as literal `<strong>` text
- `$x^2$` in a passage → renders as literal `$x^2$` text
- HTML in glossary definitions → renders as literal tags

---

## Section Type Deep Dive

### `mc-quiz` — Multiple Choice

The core question type. Each question shows the stem, four answer options (shuffled), and feedback after answering.

```json
{
  "id": "chapter-1",
  "name": "Chapter 1: Foundations",
  "type": "mc-quiz",
  "questions": [
    {
      "q": "What is the powerhouse of the cell?",
      "correct": "Mitochondria",
      "wrong": ["Ribosome", "Golgi apparatus", "Endoplasmic reticulum"],
      "explanation": "Mitochondria generate most of the cell's ATP through oxidative phosphorylation."
    }
  ],
  "flashcards": [
    {
      "front": "Mitochondria",
      "back": "<strong>Function:</strong> ATP production via oxidative phosphorylation<br><br><strong>Structure:</strong> Double membrane, inner membrane folded into cristae"
    }
  ],
  "hasFlashcards": true,
  "tips": [
    "Focus on understanding function, not just naming organelles",
    "Draw a cell diagram from memory after each study session"
  ]
}
```

When to use: Factual recall, concept application, distinguishing between similar items.

### `passage-quiz` — Reading Comprehension

A passage is displayed alongside questions that test understanding of the text. Each scenario is a self-contained reading with its own questions.

```json
{
  "id": "case-studies",
  "name": "Case Studies",
  "type": "passage-quiz",
  "scenarios": [
    {
      "passage": "A farmer notices yellowing leaves on the lower portions of his tomato plants. The yellowing progresses upward over two weeks. Soil tests show a pH of 7.8 and nitrogen levels at 12 ppm (optimal: 25-50 ppm).",
      "source": "UC Davis Plant Sciences Extension, 2023",
      "questions": [
        {
          "q": "What is the most likely cause of the yellowing?",
          "correct": "Nitrogen deficiency — low N levels and upward progression of chlorosis are characteristic",
          "wrong": [
            "Iron deficiency — high pH can lock out iron but it affects new growth first",
            "Overwatering — would cause wilting and root rot before yellowing",
            "Viral infection — would show mosaic patterns, not uniform yellowing"
          ],
          "explanation": "Nitrogen is mobile in the plant, so deficiency symptoms appear first in older (lower) leaves as the plant reallocates N to new growth. The soil test confirms N at 12 ppm, well below the 25-50 ppm optimal range."
        },
        {
          "q": "Why does the yellowing start at the bottom of the plant?",
          "correct": "Nitrogen is mobile — the plant moves it from old leaves to support new growth",
          "wrong": [
            "Lower leaves get less sunlight and photosynthesize less",
            "Soil pathogens attack roots closest to the base first",
            "Water splashing from soil carries disease to lower leaves"
          ],
          "explanation": "Mobile nutrients (N, P, K, Mg) show deficiency in older leaves first because the plant translocates them to actively growing tissue."
        }
      ]
    }
  ]
}
```

When to use: Case studies, reading comprehension, applying knowledge to scenarios, analyzing data or descriptions.

### `math-gen` — Math Practice

Uses built-in generators for procedural math problems. Problems are generated dynamically (infinite practice), not from a fixed question bank.

```json
{
  "id": "math",
  "name": "Math Practice",
  "type": "math-gen",
  "generators": ["conversion", "average", "percent", "decimal"]
}
```

Available generator keys:

| Key | Label | What it generates |
|---|---|---|
| `"conversion"` | Unit Conversions | oz/lb, ft/mi, sq ft/acres |
| `"average"` | Averages | Mean of 3-6 values |
| `"percent"` | Percentages | Part-of-whole percentage calculations |
| `"decimal"` | Decimals | Decimal addition, subtraction, word problems |

You cannot define custom math generators via JSON. Only the four keys above are supported.

---

## Content Quality Guidelines

### MCQ Design

**Structure:**
- Exactly 3 wrong answers per question (4 options total)
- The question stem must be a complete question on its own — it should make sense without reading the options
- The question stem must not start with source or deck metadata. Bad: `Connect eBook Ch4: what did SOX respond to?`; good: `What did the Sarbanes-Oxley Act primarily respond to?`
- Answer choices must not contain source labels or source-point suffixes. Bad: `Kota Reliquary, Gabon - source point 1`; good: `Kota Reliquary, Gabon`.
- **Answer-length parity is critical.** All 4 options must be similar in character count, grammar, and detail level. Keep the longest and shortest visible options within 12 characters. The correct answer must NOT be the longest, most qualified, or most specific option. If the correct answer needs a qualifier ("because X"), add comparable qualifiers to the wrong answers too. Agents generating questions must enforce this — it is the #1 source of guessable questions
- **Term-in-context MCQs need matched options.** If the stem gives a context clue and asks for the term, each option should be the same kind of term or same kind of short explanation. Do not make the answer obvious by giving it a full sentence while the distractors are short labels.
- Distribute correct answer positions randomly — don't default to putting the correct answer first in the `correct` field (the app shuffles at display time, but consistent patterns in source data can indicate quality issues)

**Distractors (wrong answers):**
- Each wrong answer should represent a real misconception, a common error, or a plausible confusion with a related concept
- Never use joke answers, obviously wrong answers, or filler
- Wrong answers should be the same type as the correct answer (if the answer is a number, all options should be numbers; if it's a process, all should be processes)
- Avoid overlapping options — no two options should mean the same thing

**Avoid:**
- "All of the above" / "None of the above" — they're guessing shortcuts, not learning tools
- Absolute qualifiers ("always", "never", "only") unless genuinely accurate
- Negative stems ("Which is NOT...") — rewrite as a positive question when possible
- Trick questions that test reading carefully rather than understanding the material

**Bloom's taxonomy mix:**
Aim for variety across cognitive levels, not just "remember" questions.

| Level | ~Target | Example stem |
|---|---|---|
| Remember | 15% | "What is the definition of...?" |
| Understand | 30% | "Which best explains why...?" |
| Apply | 30% | "Given this scenario, what would you do?" |
| Analyze | 20% | "What is the relationship between X and Y?" |
| Evaluate | 5% | "Which approach would be most effective for...?" |

### Flashcard Design

- **One fact per card.** If you're tempted to put a list on the back, split it into multiple cards. "Name the 4 chambers of the heart" is a bad card; four cards each asking "What chamber is in the upper-left of the heart?" are better.
- Flashcard fronts and backs must not show source/deck metadata. Put the term, image prompt, or recall question on the front, and the answer on the back. Keep source anchors and source-point labels outside visible card fields.
- **Minimum information principle.** The answer should be short — a word, phrase, or single sentence. Not a paragraph.
- **Include contrast cards.** If two concepts are easily confused, make cards that specifically ask how they differ. "How does mitosis differ from meiosis?" with a focused, short answer.
- **Why cards.** For every factual card ("What does X do?"), consider adding a companion card ("Why does X do that?" or "What happens if X fails?").
- **Use HTML for structure** when the back needs formatting: `<strong>` for key terms, `<br>` for line breaks, `<em>` for emphasis.

### Art History Slide IDs

- Treat style, movement, or culture as part of the slide ID alongside artist/maker, title/object, date, medium, and significance.
- For each visual ID card, make the learner recall style explicitly. A strong prompt is: "Identify this work, style, and one significance phrase."
- Put style in the answer feedback as `Style: ...` so MCQ review also reinforces it.
- Keep wrong answers balanced by ID label only; do not make the correct MCQ option longer by appending style when distractors omit it.
- For non-paintings, use the closest course-relevant label: architecture, interior, porcelain, print, photography process, culture/dynasty, or movement.

### Passage-Quiz Design

- Passages should be **self-contained** — the reader should have all the information needed to answer without external knowledge (unless the questions test prior knowledge applied to the scenario)
- Include `source` attribution when the passage is from a real source
- Questions should require **understanding** the passage, not just keyword matching. Ask "why" and "what would happen if" questions, not just "what does paragraph 2 say"
- Mix Bloom's levels within a single passage's questions — start with a comprehension question, then application, then analysis

### General

- **Interleave topics** within sections. Don't group all questions about Topic A together followed by all Topic B. Mix them so the learner must recall and switch contexts.
- **Explanations on every question.** Retrieval practice is most effective when followed by feedback. Even for easy questions, the explanation reinforces the correct mental model.
- **Include a glossary** for all key terms introduced in the project. The glossary panel shows context-relevant terms while studying.
- **Add section-level tips** with study strategies specific to that content area.

---

## Worked Examples

### Minimal Valid Project

The absolute minimum that loads without errors:

```json
{
  "name": "Quick Quiz",
  "sections": [
    {
      "id": "basics",
      "name": "Basics",
      "type": "mc-quiz",
      "questions": [
        {
          "q": "What color is the sky on a clear day?",
          "correct": "Blue",
          "wrong": ["Red", "Green", "Yellow"],
          "explanation": "Rayleigh scattering causes shorter blue wavelengths to scatter more, making the sky appear blue."
        }
      ]
    }
  ]
}
```

### Full-Featured Project

A complete project using all section types, flashcards, glossary, tips, and LaTeX:

```json
{
  "name": "Intro to Chemistry",
  "version": 1,
  "config": {
    "desired_retention": 0.85,
    "new_per_session": 15,
    "leech_threshold": 6
  },
  "sections": [
    {
      "id": "atomic-structure",
      "name": "Atomic Structure",
      "type": "mc-quiz",
      "hasFlashcards": true,
      "questions": [
        {
          "q": "An atom has 6 protons, 6 neutrons, and 6 electrons. What element is it?",
          "correct": "Carbon",
          "wrong": ["Nitrogen", "Oxygen", "Boron"],
          "explanation": "The number of protons (atomic number) determines the element. 6 protons = carbon."
        },
        {
          "q": "What is the mass number of an atom with 8 protons and 10 neutrons?",
          "correct": "18",
          "wrong": ["8", "10", "28"],
          "explanation": "Mass number = protons + neutrons = 8 + 10 = 18. Electrons don't contribute significantly to mass."
        },
        {
          "q": "Which subatomic particle determines the chemical behavior of an atom?",
          "correct": "Electrons, specifically valence electrons in the outermost shell",
          "wrong": [
            "Protons, because they define the element",
            "Neutrons, because they stabilize the nucleus",
            "The nucleus as a whole, because it contains most of the mass"
          ],
          "explanation": "While protons define the element, it's the valence electrons that participate in bonding and determine chemical reactivity."
        },
        {
          "q": "Why are noble gases chemically inert?",
          "correct": "Their outer electron shell is full, so they have no tendency to gain, lose, or share electrons",
          "wrong": [
            "They have an equal number of protons and neutrons, making them balanced",
            "Their atoms are too large to form bonds with other elements",
            "They exist only as monatomic gases, which prevents molecular bonding"
          ],
          "explanation": "Noble gases have complete valence shells (2 for He, 8 for others), giving them no energetic incentive to bond."
        }
      ],
      "flashcards": [
        {
          "front": "Atomic Number",
          "back": "<strong>Definition:</strong> Number of protons in an atom's nucleus<br><br>Determines the element's identity. Written as <em>Z</em>."
        },
        {
          "front": "Mass Number",
          "back": "<strong>Definition:</strong> Protons + Neutrons<br><br>Written as <em>A</em>. Not the same as atomic mass (which accounts for isotope abundance)."
        },
        {
          "front": "How do atomic number and mass number differ?",
          "back": "<strong>Atomic number (Z):</strong> protons only — defines the element<br><strong>Mass number (A):</strong> protons + neutrons — defines the isotope"
        },
        {
          "front": "Valence Electrons",
          "back": "Electrons in the outermost shell. Determine chemical reactivity and bonding behavior."
        }
      ],
      "tips": [
        "Use the periodic table as a reference, not a crutch — practice recalling element positions from memory",
        "For electron configuration questions, draw the orbital diagram before checking options",
        "Remember: atomic number = protons = electrons (for neutral atoms)"
      ]
    },
    {
      "id": "reactions",
      "name": "Chemical Reactions",
      "type": "passage-quiz",
      "scenarios": [
        {
          "passage": "A student mixes 50 mL of 0.1 M hydrochloric acid (HCl) with 50 mL of 0.1 M sodium hydroxide (NaOH) in a calorimeter. The temperature rises from 22.0°C to 28.5°C. The student concludes the reaction is exothermic.",
          "source": "Adapted from AP Chemistry Lab Manual",
          "questions": [
            {
              "q": "Is the student's conclusion correct? Why?",
              "correct": "Yes — the temperature increase indicates energy was released to the surroundings, which defines an exothermic reaction",
              "wrong": [
                "No — the temperature increase means the reaction absorbed heat from the environment",
                "Yes — all acid-base reactions are exothermic by definition",
                "No — you can't determine exo/endothermic from temperature alone, you need enthalpy calculations"
              ],
              "explanation": "In an exothermic reaction, energy flows from the system (reactants) to the surroundings (water in the calorimeter), raising the temperature. The temperature increase from 22.0 to 28.5°C confirms energy release."
            },
            {
              "q": "What type of reaction is occurring?",
              "correct": "Neutralization — an acid reacting with a base to form water and a salt",
              "wrong": [
                "Combustion — the temperature increase indicates burning",
                "Decomposition — the reactants are breaking down into simpler substances",
                "Single replacement — one element is replacing another in a compound"
              ],
              "explanation": "HCl + NaOH → NaCl + H₂O. This is a classic neutralization reaction: acid + base → salt + water."
            }
          ]
        }
      ],
      "tips": [
        "When analyzing reaction scenarios, identify the reaction type first before answering questions",
        "Pay attention to units and significant figures in quantitative passages"
      ]
    },
    {
      "id": "math",
      "name": "Chemistry Math",
      "type": "math-gen",
      "generators": ["conversion", "percent", "decimal"]
    }
  ],
  "glossary": [
    { "term": "Atom", "def": "The smallest unit of an element that retains its chemical properties. Composed of protons, neutrons, and electrons." },
    { "term": "Proton", "def": "Positively charged subatomic particle in the nucleus. Determines the element (atomic number)." },
    { "term": "Neutron", "def": "Neutral subatomic particle in the nucleus. Contributes to mass number and isotope identity." },
    { "term": "Electron", "def": "Negatively charged subatomic particle orbiting the nucleus. Determines chemical behavior." },
    { "term": "Valence Electron", "def": "An electron in the outermost shell of an atom. Responsible for bonding and reactivity." },
    { "term": "Atomic Number (Z)", "def": "Number of protons in the nucleus. Uniquely identifies the element." },
    { "term": "Mass Number (A)", "def": "Total number of protons and neutrons in the nucleus." },
    { "term": "Exothermic", "def": "A reaction that releases energy to the surroundings, causing a temperature increase." },
    { "term": "Neutralization", "def": "Reaction between an acid and a base producing water and a salt." }
  ]
}
```

### LaTeX in Questions

The app renders LaTeX via KaTeX. Use `$...$` for inline math and `$$...$$` for display math.

```json
{
  "q": "Solve for $x$: $2x + 5 = 13$",
  "correct": "$x = 4$",
  "wrong": ["$x = 3$", "$x = 9$", "$x = 6.5$"],
  "explanation": "Subtract 5 from both sides: $2x = 8$. Divide by 2: $x = 4$."
}
```

For multi-line equations in explanations:
```json
{
  "explanation": "Use the quadratic formula: $$x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$$ Substituting $a=1$, $b=-5$, $c=6$: $$x = \\frac{5 \\pm \\sqrt{25 - 24}}{2} = \\frac{5 \\pm 1}{2}$$ So $x = 3$ or $x = 2$."
}
```

---

## Multi-Pass Generation Strategy

When using an LLM to generate a project, a single prompt often produces adequate but not great output. Use this multi-pass approach for better results:

### Pass 1: Generate

Feed the source material verbatim — don't summarize it, as the LLM loses detail. Use the prompt template from the Quick Start section. Specify:
- The study agreement and source ledger; the model must generate only inside that agreed boundary
- Target number of questions per section (generate 2-3x your target, you'll filter later)
- Bloom's level distribution: "30% understand, 40% apply, 30% analyze"
- Require source citations in explanations when based on specific facts

### Pass 2: Critic

Take the generated JSON and ask the LLM to review it:

```
Review this study project JSON against these quality criteria.
For each question, check:
1. Is the correct answer actually correct?
2. Are the wrong answers plausible misconceptions (not random)?
3. Are all options similar in length and detail?
4. Does the explanation add value beyond restating the answer?
5. Is this a "remember" question that could be upgraded to "apply" or "analyze"?
6. Could the question be answered without knowing the material (e.g., by eliminating obviously wrong options)?
7. Does every item map to the study agreement, source ledger, and coverage matrix?
8. Are any relevant sources, PDFs, slides, images, chapters, pages, timestamps, or lecture objects skipped without a source-gap note?

List every issue found. Do not output corrected JSON yet.
```

### Pass 3: Revise

Feed the critic's output back and ask for a corrected version:

```
Fix every issue identified in the review. Also:
- Upgrade at least 30% of "remember" questions to higher Bloom's levels
- Ensure no two questions test the exact same fact
- Add flashcards for any concept that appears in questions but not in the flashcard deck
- Add glossary entries for any technical term used in questions
- For art history slide/image IDs, make sure every visual object has explicit style/movement/culture coverage
- Add or preserve a source-gap note for every relevant item that was inaccessible, unreadable, auth-blocked, or not converted

Output the complete corrected JSON.
```

### Pass 4: Validate

Verify the final JSON:
1. Paste it into a JSON validator (or run `JSON.parse()` in a browser console)
2. Check that every section has the required fields for its type
3. Save as `.json` and drop into the app to confirm it loads
4. Spot-check 5-10 questions for factual accuracy

---

## How to Load

1. Save your JSON as a `.json` file (any filename works)
2. Open the study tool in your browser
3. Either:
   - Click **"Open Project File (.json)"** and select the file, or
   - **Drag and drop** the `.json` file onto the drop zone on the launcher screen
4. The app validates the JSON and shows errors if anything is wrong
5. Once loaded, the project is stored in your browser's localStorage — you don't need the file again unless you clear browser data

Custom projects persist across browser sessions via localStorage (stored under the key `proj-data-{slug}` where the slug is derived from the project name). They also appear in your "Recent Projects" list on the launcher.
