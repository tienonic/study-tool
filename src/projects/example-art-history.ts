import type { ProjectData } from './types.ts';

export function buildExampleArtHistoryProject(): ProjectData {
  return {
    name: 'Example Art History Drill',
    version: 1,
    config: {
      desired_retention: 0.9,
      new_per_session: 8,
      imageSearchSuffix: 'art history',
    },
    sections: [
      {
        id: 'styles-and-terms',
        name: 'Styles and Terms',
        type: 'mc-quiz',
        questions: [
          {
            q: 'Which term describes a painting style focused on everyday subjects and social reality?',
            correct: 'Realism',
            wrong: ['Rococo', 'Neoclassicism', 'Pointillism'],
            explanation: 'Realism rejects idealized heroic subjects and gives ordinary life serious attention.',
          },
          {
            q: 'Which term best matches decorative curves, shells, and aristocratic leisure?',
            correct: 'Rococo',
            wrong: ['Realism', 'Romanticism', 'Neoclassicism'],
            explanation: 'Rococo is associated with ornament, pleasure, interiors, and elite leisure.',
          },
          {
            q: 'Which term describes optical color mixing through small dots of paint?',
            correct: 'Pointillism',
            wrong: ['Aquatint', 'Tenebrism', 'Chinoiserie'],
            explanation: "Pointillism uses separated dots of color that blend in the viewer's perception.",
          },
          {
            q: 'Which term describes art based on antique models, restraint, and civic virtue?',
            correct: 'Neoclassicism',
            wrong: ['Rococo', 'Realism', 'Impressionism'],
            explanation: 'Neoclassicism looks to antiquity for clarity, moral seriousness, and public virtue.',
          },
        ],
      },
      {
        id: 'compare-pairs',
        name: 'Compare Pairs',
        type: 'passage-quiz',
        scenarios: [
          {
            passage: '<strong>Rococo vs Neoclassicism</strong><br>Rococo often emphasizes ornament, softness, leisure, and elite interiors. Neoclassicism turns toward antique models, restraint, clarity, and moral seriousness.',
            questions: [
              {
                q: 'What is the strongest contrast?',
                correct: 'Leisure vs civic virtue',
                wrong: ['Ink vs brushwork', 'Motion vs sequence', 'Labor vs realism'],
                explanation: 'The style contrast is about values as much as visual form.',
              },
            ],
          },
          {
            passage: '<strong>Photography and modern painting</strong><br>Early photography made mechanical capture and visual evidence newly important. Modern painters responded by rethinking perception, motion, and painted surfaces.',
            questions: [
              {
                q: 'Why does photography matter for modern painting?',
                correct: 'It changes visual evidence',
                wrong: ['It revives palace ritual', 'It defines porcelain trade', 'It creates rocaille ornament'],
                explanation: 'Photography shifts what images can prove and what painting has to do differently.',
              },
            ],
          },
        ],
      },
    ],
    glossary: [
      { term: 'Rococo', def: 'Decorative eighteenth-century style associated with ornament, softness, and elite leisure.' },
      { term: 'Neoclassicism', def: 'Style based on antique models, clarity, restraint, and civic virtue.' },
      { term: 'Realism', def: 'Nineteenth-century focus on ordinary subjects, labor, and social fact.' },
      { term: 'Pointillism', def: 'Painting method using small dots of color for optical mixing.' },
    ],
  };
}
