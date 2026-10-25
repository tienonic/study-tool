import { describe, expect, it } from 'vitest';
import { normalizeProjectData, normalizeTextEncoding } from './textNormalization.ts';

describe('text normalization', () => {
  it('repairs common UTF-8 decoded as Windows-1252 sequences', () => {
    expect(normalizeTextEncoding('Cash â€” Accounts Receivable')).toBe('Cash — Accounts Receivable');
    expect(normalizeTextEncoding('Revenues âˆ’ Expenses âˆ’ Dividends')).toBe('Revenues − Expenses − Dividends');
    expect(normalizeTextEncoding('journal â†’ ledger')).toBe('journal → ledger');
    expect(normalizeTextEncoding('debits â‰  credits')).toBe('debits ≠ credits');
  });

  it('leaves already valid text alone', () => {
    expect(normalizeTextEncoding('Château — Revenues − Expenses')).toBe('Château — Revenues − Expenses');
  });

  it('normalizes nested project strings before they reach renderers', () => {
    const project = normalizeProjectData({
      name: 'MGT 011A â€” Accounting',
      sections: [{
        id: 's',
        name: 'Equations',
        type: 'passage-quiz',
        scenarios: [{
          passage: 'Assets = Revenues âˆ’ Expenses',
          questions: [{
            q: 'journal â†’ ledger?',
            correct: 'Yes â€” posted',
            wrong: ['No â€” skipped', 'Maybe', 'Never'],
          }],
        }],
      }],
    });

    expect(project.name).toBe('MGT 011A — Accounting');
    expect(project.sections[0].scenarios?.[0].passage).toBe('Assets = Revenues − Expenses');
    expect(project.sections[0].scenarios?.[0].questions[0].correct).toBe('Yes — posted');
  });
});
