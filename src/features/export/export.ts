import { workerApi } from '../../core/hooks/useWorker.ts';
import type { Project, Section, Question } from '../../projects/types.ts';
import { cleanAnswerLabel, cleanFlashBack, cleanFlashFront, cleanQuestionPrompt } from '../../projects/studyCopy.ts';

interface ReviewLogEntry {
  id: string;
  card_id: string;
  project_id: string;
  section_id: string;
  rating: number;
  review_time: string;
}

interface EnrichedEntry {
  cardId: string;
  rating: number;
  reviewTime: string;
  sectionId: string;
  question: string;
  correctAnswer: string;
  cardType: 'mcq' | 'passage' | 'flashcard';
}

function enrichEntry(entry: ReviewLogEntry, sectionMap: Map<string, Section>): EnrichedEntry {
  const section = sectionMap.get(entry.section_id);
  let question = entry.card_id;
  let correctAnswer = '';
  let cardType: 'mcq' | 'passage' | 'flashcard' = 'mcq';

  if (section) {
    const id = entry.card_id;
    const prefix = section.id + '-';

    if (id.startsWith(prefix + 'flash-')) {
      cardType = 'flashcard';
      const idx = parseInt(id.slice(prefix.length + 'flash-'.length), 10);
      const fc = section.flashcards?.[idx];
      if (fc) {
        question = cleanFlashFront(fc.front) ?? fc.front;
        correctAnswer = cleanFlashBack(fc.back) ?? fc.back;
      }
    } else if (section.type === 'passage-quiz' && section.scenarios) {
      cardType = 'passage';
      const rest = id.slice(prefix.length);
      const parts = rest.split('-');
      if (parts.length === 2) {
        const scenarioIdx = parseInt(parts[0], 10);
        const questionIdx = parseInt(parts[1], 10);
        const q = section.scenarios[scenarioIdx]?.questions[questionIdx];
        if (q) {
          question = cleanQuestionPrompt(q.q) ?? q.q;
          correctAnswer = cleanAnswerLabel(q.correct) ?? q.correct;
        }
      }
    } else if (section.type === 'mc-quiz' && section.questions) {
      const idx = parseInt(id.slice(prefix.length), 10);
      const q: Question | undefined = section.questions[idx];
      if (q) {
        question = cleanQuestionPrompt(q.q) ?? q.q;
        correctAnswer = cleanAnswerLabel(q.correct) ?? q.correct;
      }
    }
  }

  return {
    cardId: entry.card_id,
    rating: entry.rating,
    reviewTime: entry.review_time,
    sectionId: entry.section_id,
    question,
    correctAnswer,
    cardType,
  };
}

export async function exportProjectData(project: Project): Promise<boolean> {
  const pid = project.slug;

  try {
    const [reviewLog, cards, scores, activity] = await Promise.all([
      workerApi.getReviewLog(pid),
      workerApi.getPerformanceCards(pid),
      workerApi.getScores(pid),
      workerApi.getActivity(pid),
    ]);

    const sectionMap = new Map<string, Section>();
    for (const s of project.sections) sectionMap.set(s.id, s);

    const enrichedLog = (reviewLog || []).map(e => enrichEntry(e, sectionMap));

    const now = new Date();
    const ts = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const fileName = `export-${ts}.json`;

    const payload = {
      project: project.name,
      slug: pid,
      exportedAt: now.toISOString(),
      reviewLog: enrichedLog,
      cards: cards || [],
      scores: scores || [],
      activity: activity || [],
    };

    const res = await fetch('/api/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: pid, fileName, data: payload }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
