import { createSignal, batch } from 'solid-js';
import type { Project } from '../../projects/types.ts';

interface GlossaryEntry {
  term: string;
  def: string;
  hasImage?: boolean;
}

const [entries, setEntries] = createSignal<GlossaryEntry[]>([]);
const [questionContext, setQuestionContext] = createSignal('');
const [searchQuery, setSearchQuery] = createSignal('');

export { entries, searchQuery, setSearchQuery, setQuestionContext };

export function buildGlossary(project: Project) {
  const sorted = [...project.glossary].sort((a, b) => a.term.localeCompare(b.term));
  batch(() => { setEntries(sorted); setQuestionContext(''); setSearchQuery(''); });
}

export function getRelevantTerms(): GlossaryEntry[] {
  const ctx = questionContext().toLowerCase();
  if (!ctx) return [];

  const scored = entries()
    .map(t => {
      const term = t.term.toLowerCase();
      const words = term.split(/\s+/).filter(w => w.length >= 3);
      let score = 0;
      if (ctx.includes(term)) score += 10;
      for (const w of words) {
        if (ctx.includes(w)) score += 3;
      }
      return { entry: t, score };
    })
    .filter(s => s.score > 0);

  scored.sort((a, b) => b.score - a.score || a.entry.term.localeCompare(b.entry.term));
  return scored.slice(0, 6).map(s => s.entry);
}

export function filteredEntries(): GlossaryEntry[] {
  const q = searchQuery().toLowerCase();
  if (!q) return [];
  return entries().filter(
    t => t.term.toLowerCase().includes(q) || t.def.toLowerCase().includes(q)
  );
}
