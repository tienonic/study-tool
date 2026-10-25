import { createSignal, batch } from 'solid-js';
import { useTimer } from '../../core/hooks/useTimer.ts';
import { activeProject } from '../../core/store/app.ts';
import { mathGenerators } from '../../data/math.ts';
import type { ProjectApi } from '../../core/hooks/useWorker.ts';
import type { MathProblem } from '../../data/math.ts';
import type { Section } from '../../projects/types.ts';

type MathState = 'answering' | 'revealed';

export interface MathSession {
  state: () => MathState;
  problem: () => MathProblem | null;
  category: () => string;
  streak: () => number;
  bestStreak: () => number;
  score: () => { correct: number; attempted: number };
  feedback: () => { text: string; type: 'correct' | 'wrong' | 'skip' } | null;
  showSteps: () => boolean;
  pendingSkip: () => boolean;

  generateProblem: () => void;
  checkAnswer: (val: string) => void;
  armSkip: () => void;
  skipProblem: () => void;
  nextProblem: () => void;
  setCategory: (cat: string) => void;
  resetSection: () => void;

  timer: { seconds: () => number; start: () => void; stop: () => number; reset: () => void; pause: () => void; resume: () => void; setSuspended: (value: boolean) => void; paused: () => boolean };
  paused: () => boolean;
  togglePause: () => void;
}

export function createMathSession(section: Section, api: ProjectApi): MathSession {
  const project = () => activeProject();

  const [state, setState] = createSignal<MathState>('answering');
  const [problem, setProblem] = createSignal<MathProblem | null>(null);
  const [category, setCategory] = createSignal('all');
  const [streak, setStreak] = createSignal(0);
  const [bestStreak, setBestStreak] = createSignal(0);
  const [score, setScore] = createSignal({ correct: 0, attempted: 0 });
  const [feedback, setFeedback] = createSignal<{ text: string; type: 'correct' | 'wrong' | 'skip' } | null>(null);
  const [showSteps, setShowSteps] = createSignal(false);
  const [pendingSkip, setPendingSkip] = createSignal(false);

  const timer = useTimer();

  function getGeneratorKeys(): string[] {
    const cat = category();
    if (cat === 'all') {
      return section.generators ?? Object.keys(mathGenerators);
    }
    return [cat];
  }

  function generateProblem() {
    const keys = getGeneratorKeys();
    const key = keys[Math.floor(Math.random() * keys.length)];
    const gen = mathGenerators[key];
    if (!gen) return;

    const p = gen();
    batch(() => {
      setProblem(p);
      setState('answering');
      setFeedback(null);
      setShowSteps(false);
      setPendingSkip(false);
    });
    timer.start();
  }

  function checkAnswer(val: string) {
    if (state() !== 'answering') return;

    const p = problem();
    if (!p) return;

    const parsed = parseFloat(val);
    if (isNaN(parsed)) return;

    timer.stop();

    const ans = p.a;
    const isCorrect = Math.abs(parsed - ans) <= Math.abs(ans) * 0.01 + 0.01;

    const s = score();

    if (isCorrect) {
      const newStreak = streak() + 1;
      batch(() => {
        setStreak(newStreak);
        if (newStreak > bestStreak()) setBestStreak(newStreak);
        setScore({ correct: s.correct + 1, attempted: s.attempted + 1 });
        setFeedback({ text: `Correct!${p.ex ? ' ' + p.ex : ''}`, type: 'correct' });
        setShowSteps(false);
        setState('revealed');
      });
    } else {
      batch(() => {
        setStreak(0);
        setScore({ correct: s.correct, attempted: s.attempted + 1 });
        setFeedback({
          text: `Incorrect. Answer: $${ans}$${p.u ? ' ' + p.u : ''}${p.ex ? ' — ' + p.ex : ''}`,
          type: 'wrong',
        });
        setShowSteps(p.steps.length > 0);
        setState('revealed');
      });
    }

    if (project()) {
      api.updateScore(section.id, isCorrect).catch(() => {});
    }
  }

  function armSkip() {
    if (state() !== 'answering') return;
    if (pendingSkip()) {
      skipProblem();
    } else {
      setPendingSkip(true);
    }
  }

  function skipProblem() {
    if (state() !== 'answering') return;
    timer.stop();

    const p = problem();
    if (!p) return;
    const s = score();

    batch(() => {
      setStreak(0);
      setScore({ correct: s.correct, attempted: s.attempted + 1 });
      setFeedback({
        text: `The answer is: $${p.a}$${p.u ? ' ' + p.u : ''}${p.ex ? ' — ' + p.ex : ''}`,
        type: 'skip',
      });
      setShowSteps(p.steps.length > 0);
      setState('revealed');
      setPendingSkip(false);
    });

    const proj = project();
    if (proj) {
      api.updateScore(section.id, false).catch(() => {});
    }
  }

  function nextProblem() {
    if (state() !== 'revealed') return;
    generateProblem();
  }

  function setCategoryAction(cat: string) {
    setCategory(cat);
    generateProblem();
  }

  function resetSectionAction() {
    batch(() => {
      setStreak(0);
      setBestStreak(0);
      setScore({ correct: 0, attempted: 0 });
      setFeedback(null);
      setShowSteps(false);
      setPendingSkip(false);
    });
    generateProblem();

    if (project()) {
      api.resetSection(section.id).catch(() => {});
    }
  }

  return {
    state,
    problem,
    category,
    streak,
    bestStreak,
    score,
    feedback,
    showSteps,
    pendingSkip,

    generateProblem,
    checkAnswer,
    armSkip,
    skipProblem,
    nextProblem,
    setCategory: setCategoryAction,
    resetSection: resetSectionAction,

    timer,
    paused: timer.paused,
    togglePause: timer.togglePause,
  };
}
