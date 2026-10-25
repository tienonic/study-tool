export type MathCategory = 'decimal' | 'average' | 'percent' | 'conversion';
export interface WorkbookMathProblem {
  id: string;
  category: MathCategory;
  question: string;
  answer: number;
  unit: string;
  steps: string[];
  hint: string;
  reasoning: string;
  commonErrors: { answer: number; feedback: string }[];
}

const round = (number: number) => Math.round(number * 100) / 100;

export function makeWorkbookMath(category: MathCategory, difficulty: 1 | 2 | 3, seed: number): WorkbookMathProblem {
  const index = Math.abs(Math.trunc(seed));
  const a = 2 + index % 11;
  const b = 3 + Math.floor(index / 11) % 7;
  const base = { id: `${category}:${difficulty}:${index}`, category };
  if (category === 'percent') {
    const total = [20, 40, 80, 125, 160, 250][index % (difficulty === 1 ? 3 : 6)];
    const count = Math.min(total - 1, a * difficulty);
    const fraction = count / total;
    return { ...base, question: `Of $${total}$ samples, $${count}$ meet the criterion. What percentage meet it? Round to two decimal places.`,
      answer: round(fraction * 100), unit: '%', hint: 'Identify the part and the whole. A percentage expresses the ratio per hundred.',
      reasoning: 'Why is the total the denominator? Explain what a result above 100% would mean here.',
      steps: [`Identify the part, $${count}$, and the whole, $${total}$.`, `Form the ratio $\\frac{${count}}{${total}}$.`, `Convert to percent $\\frac{${count}}{${total}}\\times100=${round(fraction * 100)}\\%$.`],
      commonErrors: [{ answer: round(fraction), feedback: 'You found the proportion. Multiply it by 100 to express a percentage.' }, { answer: round(total / count * 100), feedback: 'The part and whole are reversed. Divide the matching samples by all samples.' }],
    };
  }
  if (category === 'average') {
    const values = Array.from({ length: difficulty + 2 }, (_, offset) => round((a + offset * b) / (difficulty === 1 ? 1 : 10)));
    const total = round(values.reduce((sum, value) => sum + value, 0));
    return { ...base, question: `Find the mean of $${values.join(', ')}$. Round to two decimal places.`, answer: round(total / values.length), unit: '',
      hint: 'The mean redistributes the total equally across all observations.', reasoning: 'Show why the mean must lie between the smallest and largest observation. What would one unusually large observation change?',
      steps: [`Count $${values.length}$ observations.`, `Add the observations $${values.join('+')}=${total}$.`, `Divide by the count $\\frac{${total}}{${values.length}}=${round(total / values.length)}$.`],
      commonErrors: [{ answer: total, feedback: 'This is the total. Divide it by the number of observations to find the mean.' }],
    };
  }
  if (category === 'conversion') {
    const factor = difficulty === 3 ? 5280 : 16;
    const large = difficulty === 3 ? 'mi' : 'lb';
    const small = difficulty === 3 ? 'ft' : 'oz';
    const quantity = difficulty === 1 ? a : a / 4;
    const reverse = index % 2 === 1;
    const start = reverse ? quantity * factor : quantity;
    const answer = reverse ? quantity : quantity * factor;
    return { ...base, question: `Convert $${start}$ ${reverse ? small : large} to ${reverse ? large : small}. Use $1$ ${large} $=${factor}$ ${small}.`, answer, unit: reverse ? large : small,
      hint: 'Write a conversion ratio so the starting unit cancels and the requested unit remains.', reasoning: 'Write both possible conversion ratios. Explain which one cancels the starting unit and whether the numeric result should grow or shrink.',
      steps: [`Start with $${start}$ ${reverse ? small : large}.`, `Use the ratio $${reverse ? `\\frac{1}{${factor}}` : factor}$ ${reverse ? `${large}/${small}` : `${small}/${large}`}.`, `$${start}${reverse ? '\\div' : '\\times'}${factor}=${answer}$ ${reverse ? large : small}.`],
      commonErrors: [{ answer: reverse ? start * factor : start / factor, feedback: 'The conversion ratio is inverted. Cancel the starting unit before calculating.' }],
    };
  }
  const first = round(a + b / 10);
  const second = round((b + difficulty) / (difficulty === 1 ? 10 : 100));
  const multiply = difficulty === 3;
  return { ...base, question: `$${first}${multiply ? '\\times' : '+'}${second}=?$ Round to two decimal places.`, answer: round(multiply ? first * second : first + second), unit: '',
    hint: multiply ? 'Multiply the values, then check the decimal place by estimating the product.' : 'Align the decimal points so each place value matches.',
    reasoning: multiply ? 'Estimate the product before calculating. Explain why multiplying by a number below one reduces this positive value.' : 'Explain how place value determines which digits you add. Estimate before calculating.',
    steps: [multiply ? `Multiply $${first}\\times${second}$.` : `Align the decimal places in $${first}$ and $${second}$.`, `$${first}${multiply ? '\\times' : '+'}${second}=${round(multiply ? first * second : first + second)}$.`], commonErrors: [],
  };
}

export function checkWorkbookMath(problem: WorkbookMathProblem, input: string): { kind: 'invalid' | 'correct' | 'incorrect'; message: string } {
  const trimmed = input.trim();
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(trimmed) || !Number.isFinite(Number(trimmed))) {
    return { kind: 'invalid', message: 'Enter one finite number. Put the unit in your reasoning.' };
  }
  const value = Number(trimmed);
  if (Math.abs(value - problem.answer) < 0.0051) return { kind: 'correct', message: 'The numeric answer is correct. Compare your reasoning with the worked steps.' };
  const error = problem.commonErrors.find(error => Math.abs(value - error.answer) < 0.0051);
  return { kind: 'incorrect', message: error?.feedback ?? 'Recheck the setup, arithmetic, and units. Compare your work with the steps, then try another example.' };
}
