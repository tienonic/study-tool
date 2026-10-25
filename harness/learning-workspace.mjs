import { createHash as createHash2 } from "node:crypto";

import { createHash } from "node:crypto";
var evidenceTextHash = (text) => createHash("sha256").update(text).digest("hex");
var independentCheckHash = (check) => evidenceTextHash(JSON.stringify(check));
var practiceTarget = (target) => typeof target === "number" && Number.isFinite(target) && target > 0 && target <= 100 ? Math.max(80, target) : 80;
var sourceName = (source) => source.trim().replaceAll("\\", "/").toLowerCase();
var familyKey = (item) => `${item.document}
${item.question}`;
var itemKey = (item) => `${familyKey(item)}
${item.part ?? ""}`;
function citedPdfPages(text, explicitOnly = false) {
  const explicit = [...text.matchAll(/\bPDF\s+(?:p(?:age)?s?\.?\s*)?(\d+)\b/gi)];
  const matches = explicit.length || explicitOnly ? explicit : [...text.matchAll(/\b(?:p(?:age)?\.?\s*)(\d+)\b/gi)];
  return new Set(matches.map((page) => Number(page[1])));
}
function citedItems(text, source, explicitPdfPage) {
  const items = [];
  const questionPattern = /\b(?:q(?:uestion)?|problem|exercise|example|ex\.?)\s*#?\s*(\d+)(?!\d)/gi;
  for (const match of text.matchAll(questionPattern)) {
    const prefix = text.slice(0, match.index);
    const season = [...prefix.matchAll(/\b(winter|spring|summer|fall)\s*(20\d{2})?/gi)].at(-1);
    const chapter = [...prefix.matchAll(/\bchapter\s*(\d+)\s*(?:homework)?/gi)].at(-1);
    const homework = chapter && /homework/i.test(prefix.slice(chapter.index));
    const exam = [...prefix.matchAll(/\bmidterm\s*(\d+)|\b(final)\b/gi)].at(-1) ?? [...source.matchAll(/\bmidterm\s*(\d+)|\b(final)\b/gi)].at(-1);
    const originalText = `${prefix} ${text.slice(match.index + match[0].length).split(/\bkey\b/i)[0]}`;
    const pageNumbers = citedPdfPages(originalText);
    const pdfPage = explicitPdfPage ?? (pageNumbers.size === 1 ? [...pageNumbers][0] : void 0);
    if (/\.pdf(?:$|[#?])/i.test(source) && !pdfPage) continue;
    const document = /\.pdf(?:$|[#?])/i.test(source) ? `source:${sourceName(source)}#page-${pdfPage}` : homework ? `${season ? `${season[1].toLowerCase()}-${season[2] ?? "unknown"}/` : sourceName(source) + "/"}chapter-${Number(chapter[1])}-homework` : season ? `${season[1].toLowerCase()}-${season[2] ?? "unknown"}/${exam ? exam[2] ? "final" : `midterm-${Number(exam[1])}` : "exam"}` : `source:${sourceName(source)}`;
    const tail = text.slice(match.index + match[0].length);
    const letter = tail.match(/^\s*(?:\(([a-z])\)|part\s+([a-z])\b)/i);
    const cell = tail.match(/^\s*(20\d{2})\s*(real|nominal)\s*gdp\s*cell/i);
    items.push({
      document,
      question: `q${Number(match[1])}`,
      ...letter ? { part: (letter[1] ?? letter[2]).toLowerCase() } : cell ? { part: `${cell[1]}-${cell[2].toLowerCase()}-gdp` } : {}
    });
  }
  return items;
}
function normalizedLearningPrompt(value) {
  return value.normalize("NFKC").replace(/^\s*(?:#{1,6}\s*)?[*_`~]*practice(?:\s*[.:]\s*|\s*\n\s*)[*_`~]*\s*/i, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
function sourceItemFor(attempt) {
  if (!attempt.source?.trim()) return;
  const pdf = /\.pdf(?:$|[#?])/i.test(attempt.source);
  const explicitPages = pdf ? citedPdfPages(`${attempt.sourceLocator ?? ""}
${attempt.prompt ?? ""}`, true) : /* @__PURE__ */ new Set();
  if (explicitPages.size > 1) return;
  const explicitPdfPage = [...explicitPages][0];
  const locator = citedItems(attempt.sourceLocator ?? "", attempt.source, explicitPdfPage);
  const prompt = citedItems(attempt.prompt ?? "", attempt.source, explicitPdfPage);
  if (/\.(?:pdf|md|txt)(?:$|[#?])/i.test(attempt.source) && !locator.length && !prompt.length) {
    const locatorText = attempt.sourceLocator ?? "";
    const opening = locatorText.match(/\b(?:opening|begins(?:\s+with)?)\s*:\s*["“]([^"”]+)["”]/i)?.[1];
    if (opening) {
      const normalized = normalizedLearningPrompt(opening), words = normalized.split(/\s+/);
      const pages = explicitPages.size ? explicitPages : citedPdfPages(locatorText.split(/\bkey\b/i)[0]);
      if (words.length < 8 || pdf && (pages.size !== 1 || [...pages][0] <= 0) || attempt.prompt && !`${normalizedLearningPrompt(attempt.prompt)} `.startsWith(`${normalized} `)) return;
      const item2 = {
        document: `source:${sourceName(attempt.source)}${pdf ? `#page-${[...pages][0]}` : ""}`,
        question: `opening-${evidenceTextHash(words.slice(0, 8).join(" ")).slice(0, 16)}`
      };
      if (attempt.sourceItem && (attempt.sourceItem.document !== item2.document || attempt.sourceItem.question !== item2.question || attempt.sourceItem.part)) return;
      return item2;
    }
  }
  if (new Set([...locator, ...prompt].map((item2) => item2.question)).size > 1) return;
  const named = [...locator, ...prompt].filter((item2) => !item2.document.startsWith("source:"));
  const cited = named.length ? named : [...locator, ...prompt];
  const specific = cited.filter((item2) => !item2.document.includes("-unknown/"));
  const candidates = specific.length ? cited.map((item2) => item2.document.includes("-unknown/") ? specific.find((other) => other.question === item2.question && other.document.split("-")[0] === item2.document.split("-")[0]) ?? item2 : item2) : cited;
  if (!candidates.length || new Set(candidates.map(familyKey)).size !== 1) return;
  const parts = new Set(candidates.flatMap((item2) => item2.part ? [item2.part] : []));
  if (parts.size > 1) return;
  const item = { ...candidates[0], ...parts.size ? { part: [...parts][0] } : {} };
  if (attempt.sourceItem && (attempt.sourceItem.document !== item.document || attempt.sourceItem.question !== item.question || attempt.sourceItem.part !== item.part)) return;
  return item;
}
function validateIndependentCheck(check) {
  if (!check || check.version !== 1 || ![
    check.id,
    check.conceptId,
    check.source,
    check.sourceLocator,
    check.sourceRevision,
    check.rubricLocator,
    check.allowedResources
  ].every((value) => typeof value === "string" && value.trim()) || !Number.isFinite(Date.parse(check.startedAt)) || !["whole_question", "subpart"].includes(check.scope) || !["calculation", "explanation", "mixed", "choice"].includes(check.taskType) || !["instructor", "practice"].includes(check.rubricBasis) || typeof check.promptComplete !== "boolean" || typeof check.figureAccessible !== "boolean" || !Array.isArray(check.criteria) || !check.criteria.length || check.criteria.some((criterion) => !criterion || typeof criterion.id !== "string" || !criterion.id.trim() || typeof criterion.description !== "string" || !criterion.description.trim() || !Number.isFinite(criterion.possible) || criterion.possible <= 0) || new Set(check.criteria.map((criterion) => criterion.id)).size !== check.criteria.length || !Number.isFinite(check.criteria.reduce((sum, criterion) => sum + criterion.possible, 0))) {
    throw new Error("An independent check needs an original question, source revision, complete rubric and valid points.");
  }
  if (check.purpose !== void 0 && !["teaching", "diagnostic", "exam_sample"].includes(check.purpose)) {
    throw new Error("Choose teaching, diagnostic, or exam_sample before presenting the check.");
  }
  if (check.purpose === "exam_sample" && (!check.primaryDomain?.trim() || !check.examItem || !Number.isFinite(check.examItem.possible) || check.examItem.possible <= 0 || !["choice", "select_all", "written"].includes(check.examItem.format) || !check.examItem.representativeSource?.trim() || check.examItem.difficulty !== "source_comparable" || !["official", "practice_all_or_nothing"].includes(check.examItem.scoringRule))) {
    throw new Error("An exam sample needs its domain, source-comparable difficulty, original format and fixed exam-item scoring rule before the answer.");
  }
  const identity = sourceItemFor(check);
  if (!identity) throw new Error("An independent check needs one confirmed original question citation and the original page for a PDF; unnumbered items need a quoted opening of eight or more original words.");
  if (check.scope === "whole_question" && identity.part) throw new Error("A whole-question check cannot cite only a source subpart.");
}
function validateExamAssessment(exam) {
  if (!exam || typeof exam !== "object") throw new Error("An exam assessment needs a registered independent check.");
  validateIndependentCheck(exam.check);
  if (!Array.isArray(exam.earned) || exam.earned.length !== exam.check.criteria.length || new Set(exam.earned.map((item) => item?.id)).size !== exam.earned.length || exam.earned.some((item) => !item || !Number.isFinite(item.points) || item.points < 0 || !exam.check.criteria.some((criterion) => criterion.id === item.id && item.points <= criterion.possible)) || typeof exam.committedBeforeFeedback !== "boolean" || typeof exam.solutionComplete !== "boolean" || !["explained", "partial", "missing", "not_required"].includes(exam.reasoning)) {
    throw new Error("Grade every declared rubric criterion, including zero for omitted work, with points within its original maximum.");
  }
}
var day = 864e5;
var shortReturn = 10 * 6e4;
var graded = (attempt) => ["correct", "partial", "incorrect"].includes(attempt.assessment);
var percent = (earned, possible) => possible ? Math.round(earned / possible * 1e3) / 10 : null;
var successful = (observation, target) => observation.possible > 0 && observation.earned / observation.possible * 100 >= practiceTarget(target);
function hasBoundIndependentGrade(attempt, check = attempt.exam?.check) {
  const evaluation = attempt.independentEvaluation, result = evaluation?.result;
  const text = (value) => typeof value === "string" && value.trim().length > 0;
  const hash = (value) => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
  return Boolean(check && evaluation && typeof evaluation === "object" && !Array.isArray(evaluation) && evaluation.version === 1 && text(evaluation.id) && evaluation.status === "graded" && evaluation.independent === true && text(evaluation.checkId) && hash(evaluation.checkHash) && hash(evaluation.promptHash) && hash(evaluation.answerHash) && evaluation.checkId === check.id && evaluation.checkHash === independentCheckHash(check) && (!attempt.independentCheck || independentCheckHash(attempt.independentCheck) === independentCheckHash(check)) && text(attempt.prompt) && text(attempt.answer) && evaluation.promptHash === evidenceTextHash(attempt.prompt) && evaluation.answerHash === evidenceTextHash(attempt.answer) && text(evaluation.evaluator) && result && typeof result === "object" && !Array.isArray(result) && ["exam", "prerequisite", "advanced", "unknown"].includes(result.representativeness) && Number.isFinite(result.earned) && Number.isFinite(result.possible) && result.possible > 0 && result.earned >= 0 && result.earned <= result.possible && Array.isArray(result.grounds) && result.grounds.length > 0 && result.grounds.every(text));
}
function observations(all) {
  const seen = /* @__PURE__ */ new Set(), seenPrompts = /* @__PURE__ */ new Set();
  return all.map((attempt, index) => {
    const identity = sourceItemFor(attempt), key = identity && familyKey(identity);
    const prompt = normalizedLearningPrompt(attempt.prompt ?? "");
    const fresh = Boolean(key && !seen.has(key) && (!prompt || !seenPrompts.has(prompt)) && !attempt.priorExposure && !(attempt.independentCheck ?? attempt.exam?.check)?.previouslyExposed);
    if (key) seen.add(key);
    if (prompt) seenPrompts.add(prompt);
    let valid = false;
    try {
      if (attempt.exam) {
        validateExamAssessment(attempt.exam);
        const check = attempt.exam.check;
        const checkedIdentity = sourceItemFor(check);
        valid = check.conceptId === attempt.conceptId && sourceName(check.source) === sourceName(attempt.source) && Boolean(identity && checkedIdentity && itemKey(identity) === itemKey(checkedIdentity)) && Date.parse(check.startedAt) <= Date.parse(attempt.at) && check.promptComplete && check.figureAccessible;
      }
    } catch {
    }
    const independent = valid && hasBoundIndependentGrade(attempt) && graded(attempt) && attempt.assistance === "independent" && attempt.exam.committedBeforeFeedback;
    return {
      attempt,
      index,
      identity,
      fresh,
      valid,
      time: Date.parse(attempt.at),
      independent,
      whole: independent && attempt.exam.check.scope === "whole_question",
      earned: valid ? attempt.exam.earned.reduce((sum, item) => sum + item.points, 0) : 0,
      possible: valid ? attempt.exam.check.criteria.reduce((sum, item) => sum + item.possible, 0) : 0
    };
  });
}
function examProgressionFor(conceptId, attempts) {
  const latest = observations(attempts).filter((item) => item.attempt.conceptId === conceptId && item.whole && item.fresh && item.attempt.independentEvaluation?.result?.representativeness === "exam").at(-1);
  const ready = Boolean(latest && latest.attempt.assessment === "correct" && latest.attempt.exam.solutionComplete && successful(latest, 100));
  return {
    readyForOtherScope: ready,
    ...latest ? { evidenceCheckId: latest.attempt.exam.check.id } : {},
    reason: ready ? "A fresh representative question was answered independently. Move to other scope; preserve specific gaps and use a later mixed return. This is not a guarantee about the whole topic or exam." : "A successful fresh representative independent answer is not established. Teach the missing link, use one new check, then move to other scope and retain any unresolved gap for a bounded return."
  };
}
function evidenceFor(conceptId, all, now = Date.now(), requirements = {}, targetPercent = 100) {
  const progression = examProgressionFor(conceptId, all);
  const meetsTarget = (item) => successful(item, targetPercent);
  const observed = observations(all), own = observed.filter((item) => item.attempt.conceptId === conceptId);
  const latest = own.filter((item) => graded(item.attempt)).at(-1);
  const revisions = new Map(own.filter((item) => item.valid).map((item) => [sourceName(item.attempt.source), item.attempt.exam.check.sourceRevision]));
  const current = own.filter((item) => item.valid && item.attempt.exam.check.sourceRevision === revisions.get(sourceName(item.attempt.source)));
  const transfer = current.filter((item) => item.whole && item.fresh).slice(-5);
  const independent = own.filter((item) => item.independent);
  const earned = transfer.reduce((sum, item) => sum + item.earned, 0);
  const possible = transfer.reduce((sum, item) => sum + item.possible, 0);
  const score = percent(earned, possible);
  const unresolved = /* @__PURE__ */ new Map();
  for (const item of own) {
    if (!graded(item.attempt)) continue;
    const key = item.identity ? itemKey(item.identity) : `unknown:${item.index}`;
    const page = item.identity?.document.match(/#page-(\d+)$/)?.[1];
    const label = item.identity ? `${item.identity.question.startsWith("opening-") ? "original unnumbered item" : item.identity.question}${item.identity.part ? `/${item.identity.part}` : ""}${page ? ` (page ${page})` : ""}` : "unknown original item";
    if (item.attempt.assessment !== "correct" || item.independent && !meetsTarget(item)) unresolved.set(key, label);
    else if (item.independent) {
      unresolved.delete(key);
      if (item.whole && item.identity) {
        const family = familyKey(item.identity);
        for (const prior of own.slice(0, own.indexOf(item))) {
          if (prior.identity && familyKey(prior.identity) === family) unresolved.delete(itemKey(prior.identity));
        }
      }
    }
  }
  const completeSolutions = transfer.filter((item) => meetsTarget(item) && item.attempt.exam.solutionComplete && item.attempt.exam.earned.every((criterion) => criterion.points > 0));
  const fullSolutions = completeSolutions.length;
  const calculations = completeSolutions.filter((item) => ["calculation", "mixed"].includes(item.attempt.exam.check.taskType)).length;
  const mechanisms = completeSolutions.filter((item) => item.attempt.exam.reasoning === "explained").length;
  const delayed = current.filter((item) => {
    if (!item.whole) return false;
    const previous = own.filter((prior) => graded(prior.attempt) && prior.index < item.index).at(-1);
    return Boolean(previous?.whole && item.time - previous.time >= day);
  });
  const retention = current.filter((item) => item.whole && (!item.fresh || delayed.includes(item)));
  const delayedSuccesses = delayed.filter(meetsTarget);
  const sourceLimited = own.filter((item) => !item.valid || item.attempt.assistance === "independent" && !hasBoundIndependentGrade(item.attempt)).length;
  const confidence = transfer.length >= 3 && fullSolutions >= 2 && mechanisms >= 1 && (!requirements.calculation || calculations >= 1) && delayedSuccesses.length > 0 && !unresolved.size ? "supported" : transfer.length ? "limited" : "insufficient";
  const lastIndependent = independent.at(-1);
  let review = { due: false, dueAt: null, kind: "none", reason: "No independent result has been recorded." };
  const lastRelevant = own.filter((item) => graded(item.attempt)).at(-1);
  if (lastRelevant && Number.isFinite(lastRelevant.time)) {
    const failed = !lastRelevant.independent || !meetsTarget(lastRelevant);
    if (failed) {
      const intervening = observed.some((item) => item.index > lastRelevant.index && graded(item.attempt) && (!lastRelevant.identity || !item.identity || familyKey(item.identity) !== familyKey(lastRelevant.identity)));
      const dueAt = lastRelevant.time + shortReturn;
      review = {
        due: intervening || now >= dueAt,
        dueAt: new Date(dueAt).toISOString(),
        kind: "transfer",
        reason: "Use a fresh whole question after teaching, another question, or about ten minutes."
      };
    } else {
      let streak = 0;
      for (const item of own) {
        if (!graded(item.attempt)) continue;
        if (!item.whole || !meetsTarget(item)) streak = 0;
        else if (delayed.includes(item)) streak++;
      }
      const interval = streak >= 2 ? 7 * day : streak === 1 ? 3 * day : day;
      const dueAt = lastRelevant.time + interval;
      review = {
        due: now >= dueAt,
        dueAt: new Date(dueAt).toISOString(),
        kind: "retention",
        reason: "Return without hints after the saved independent work. Intervals are local practice defaults."
      };
    }
  }
  const status = !own.length ? "unassessed" : score === null ? "independent check needed" : review.due ? "review due" : score < practiceTarget(targetPercent) ? "below target" : confidence === "supported" ? "supported" : "provisional";
  const task = requirements.calculation ? "whole calculation with your setup, working, units and final result" : "whole source question with your explanation and final answer";
  const nextAction = progression.readyForOtherScope && !review.due ? progression.reason : unresolved.size ? `Repair the first missing link, then use one fresh ${task}. Preserve unresolved skills and continue other scope before a later mixed return; do not repeat until every detail is perfect.` : review.due ? `Do an independent ${review.kind === "retention" ? "return question" : "fresh transfer question"}; ${review.reason}` : confidence !== "supported" ? `Attempt a fresh independent ${task}.` : `Continue other scope; return after ${review.dueAt ?? "the next study interval"}.`;
  return {
    progression,
    score,
    percent: score,
    earned,
    possible,
    status,
    label: status,
    confidence,
    independentQuestions: transfer.length,
    fullSolutions,
    calculations,
    mechanisms,
    assistedAttempts: own.filter((item) => ["hinted", "worked"].includes(item.attempt.assistance ?? "")).length,
    attempts: own.length,
    lastIndependentAt: lastIndependent?.attempt.at ?? null,
    sourceLimited,
    unresolvedItems: unresolved.size,
    unresolvedQuestions: [...unresolved.values()],
    retentionScore: percent(retention.reduce((sum, item) => sum + item.earned, 0), retention.reduce((sum, item) => sum + item.possible, 0)),
    retentionQuestions: retention.length,
    review,
    nextAction,
    latest: latest?.attempt.assessment ?? "none",
    assessmentCorrect: latest?.attempt.assessment === "correct",
    independentItems: independent.length,
    independentFamilies: transfer.length,
    identityLimitedAttempts: own.filter((item) => !item.identity).length,
    checks: { checked: transfer.length > 0, varied: transfer.length >= 3, applied: fullSolutions > 0, retained: delayedSuccesses.length > 0 }
  };
}
function assessedPracticeConceptIds(concepts, blueprint) {
  const required = blueprint?.domains?.flatMap((domain) => domain.requiredConceptIds) ?? [];
  return blueprint?.scopeConfirmed && blueprint.scopeSource?.trim() && required.length && new Set(required).size === required.length ? required.filter((id) => concepts.some((concept) => concept.id === id)) : concepts.map((concept) => concept.id);
}
function observedPrerequisiteBlocker(prerequisiteId, dependentId, attempts) {
  const latest = (id) => attempts.filter((attempt) => attempt.conceptId === id && graded(attempt)).at(-1);
  const prerequisite = latest(prerequisiteId), dependent = latest(dependentId);
  return Boolean(prerequisite && dependent && ["partial", "incorrect"].includes(prerequisite.assessment) && ["partial", "incorrect"].includes(dependent.assessment));
}
function practiceDomainWeights(blueprint) {
  if (!blueprint?.scopeConfirmed || !blueprint.scopeSource?.trim() || !blueprint.domains?.length || !blueprint.weighting) return;
  if (blueprint.weighting.kind === "fixed") {
    const weights = blueprint.weighting.weights;
    return blueprint.domains.every((domain) => Number.isFinite(weights[domain.id]) && weights[domain.id] > 0) && Math.abs(Object.values(weights).reduce((sum, value) => sum + value, 0) - 1) < 1e-6 ? weights : void 0;
  }
  const { total, count, countedDomain } = blueprint.weighting;
  if (blueprint.domains.length !== 2 || !total || !count || total.min <= count.max || count.min <= 0) return;
  const counted = (count.min / total.max + count.max / total.min) / 2;
  return Object.fromEntries(blueprint.domains.map((domain) => [domain.id, domain.id === countedDomain ? counted : 1 - counted]));
}
function recommendPractice(concepts, attempts, mode, now = Date.now(), policy = {}) {
  if (!concepts.length) return;
  const byId = new Map(concepts.map((concept2) => [concept2.id, evidenceFor(concept2.id, attempts, now, concept2.assessmentRequirements, practiceTarget(policy.targetPercent))]));
  const practiced = /* @__PURE__ */ new Map();
  for (const attempt of attempts.filter(graded)) {
    const own = practiced.get(attempt.conceptId) ?? [];
    own.push(attempt);
    practiced.set(attempt.conceptId, own);
  }
  const lastPractice = (id) => Date.parse(practiced.get(id)?.at(-1)?.at ?? "1970-01-01");
  const ready = concepts.filter((concept2) => practiced.has(concept2.id) || concept2.dependsOn.every((id) => practiced.has(id)));
  const assessed = new Set(assessedPracticeConceptIds(concepts, policy.examBlueprint));
  const examConcepts = concepts.filter((concept2) => assessed.has(concept2.id));
  if (mode === "exam" && !examConcepts.length) return;
  let pool = mode === "exam" ? examConcepts : ready.length ? ready : concepts;
  let priorityReason = "";
  if (mode === "exam") {
    if (examConcepts.every((concept2) => byId.get(concept2.id).progression.readyForOtherScope && !byId.get(concept2.id).review.due)) {
      return {
        conceptId: examConcepts[0].id,
        kind: "retention",
        passComplete: true,
        dueAt: byId.get(examConcepts[0].id).review.dueAt,
        reason: "The current representative-check pass has independent successes across its mapped areas. More immediate repetitions are not required.",
        action: "Stop this pass or choose another useful scope. Retain unresolved subskills and planned mixed returns; this does not establish complete course coverage or a predicted grade."
      };
    }
    const recent2 = attempts.filter((row) => graded(row) && Boolean(row.exam));
    const repeated = recent2.at(-1)?.conceptId === recent2.at(-2)?.conceptId ? recent2.at(-1)?.conceptId : void 0;
    if (repeated && pool.some((concept2) => concept2.id !== repeated)) {
      pool = pool.filter((concept2) => concept2.id !== repeated);
      priorityReason = "One repair and a new check are enough for this turn. Keep the gap for a later mixed return and cover another area.";
    }
    const useful = pool.filter((concept2) => !byId.get(concept2.id).progression.readyForOtherScope || byId.get(concept2.id).review.due);
    if (useful.length) pool = useful;
  }
  const weights = mode === "exam" ? practiceDomainWeights(policy.examBlueprint) : void 0;
  if (mode === "exam" && !weights) {
    const last2 = attempts.filter(graded).at(-1);
    const dependent = pool.find((concept2) => concept2.id === last2?.conceptId);
    const blocker = dependent && concepts.find((concept2) => dependent.dependsOn.includes(concept2.id) && observedPrerequisiteBlocker(concept2.id, dependent.id, attempts));
    if (blocker) return {
      conceptId: blocker.id,
      kind: "teaching",
      dueAt: null,
      reason: "The learner's work shows difficulty in this prerequisite and the assessed question that uses it.",
      action: "Use one focused prerequisite repair, then return to a fresh question in the assessed category."
    };
  }
  if (weights) {
    const domains = policy.examBlueprint.domains;
    const domainOf = (id) => domains.find((domain2) => domain2.requiredConceptIds.includes(id));
    const turns = [];
    let previousKey = "";
    for (const row of attempts.filter(graded)) {
      const identity = sourceItemFor(row);
      const key = row.exam?.check.id ?? `${row.conceptId}/${identity ? familyKey(identity) : "teaching"}`;
      if (key !== previousKey && domainOf(row.conceptId)) turns.push(row);
      previousKey = key;
    }
    const recent2 = turns.slice(-8);
    const domain = domains.filter((item) => pool.some((concept2) => item.requiredConceptIds.includes(concept2.id))).sort((a, b) => weights[b.id] * (recent2.length + 1) - recent2.filter((row) => domainOf(row.conceptId)?.id === b.id).length - (weights[a.id] * (recent2.length + 1) - recent2.filter((row) => domainOf(row.conceptId)?.id === a.id).length))[0];
    const domainPool = pool.filter((concept2) => domain?.requiredConceptIds.includes(concept2.id));
    if (domainPool.length) {
      const previous = recent2.at(-1)?.conceptId;
      const repeated = recent2.length >= 2 && previous === recent2.at(-2)?.conceptId ? previous : void 0;
      const weakPrerequisites = concepts.filter((concept2) => domainPool.some((candidate) => candidate.dependsOn.includes(concept2.id) && observedPrerequisiteBlocker(concept2.id, candidate.id, attempts)) && concept2.id !== repeated);
      pool = weakPrerequisites.length ? weakPrerequisites : domainPool;
      if (repeated && pool.some((concept2) => concept2.id !== repeated)) {
        pool = pool.filter((concept2) => concept2.id !== repeated);
      }
      const dependsOn = (candidate, id, seen = /* @__PURE__ */ new Set()) => {
        if (seen.has(candidate.id)) return false;
        seen.add(candidate.id);
        return candidate.dependsOn.includes(id) || candidate.dependsOn.some((parent) => {
          const prerequisite = concepts.find((concept2) => concept2.id === parent);
          return prerequisite ? dependsOn(prerequisite, id, seen) : false;
        });
      };
      const reach = (id) => concepts.filter((candidate) => dependsOn(candidate, id)).length;
      pool.sort((a, b) => {
        const left = byId.get(a.id), right = byId.get(b.id);
        const weak = (id) => ["incorrect", "partial"].includes(practiced.get(id)?.at(-1)?.assessment ?? "");
        return Number(weak(b.id) && reach(b.id) > 0) - Number(weak(a.id) && reach(a.id) > 0) || Number(right.score !== null && right.score < practiceTarget(policy.targetPercent)) - Number(left.score !== null && left.score < practiceTarget(policy.targetPercent)) || Number(weak(b.id)) - Number(weak(a.id)) || lastPractice(a.id) - lastPractice(b.id) || reach(b.id) - reach(a.id);
      });
      priorityReason = [priorityReason, weakPrerequisites.length ? "Strengthen the prerequisite that the last answer showed was difficult." : `Local practice scheduling favors ${domain.title} using the sourced exam proportions, while mixing questions and due returns.`].filter(Boolean).join(" ");
    }
  }
  const unseen = pool.filter((concept2) => !attempts.some((attempt) => attempt.conceptId === concept2.id && graded(attempt)));
  const unscored = pool.filter((concept2) => byId.get(concept2.id).score === null && !unseen.includes(concept2)).sort((a, b) => weights ? pool.indexOf(a) - pool.indexOf(b) : lastPractice(b.id) - lastPractice(a.id) || (practiced.get(a.id)?.length ?? 0) - (practiced.get(b.id)?.length ?? 0));
  const fresh = [...unseen, ...unscored];
  if (weights) fresh.sort((a, b) => pool.indexOf(a) - pool.indexOf(b));
  const due = pool.filter((concept2) => byId.get(concept2.id).review.due).sort((a, b) => {
    const left = byId.get(a.id), right = byId.get(b.id);
    return (weights ? pool.indexOf(a) - pool.indexOf(b) : 0) || Number(right.score !== null) - Number(left.score !== null) || (left.score !== null ? Date.parse(left.review.dueAt) - Date.parse(right.review.dueAt) : Number(["partial", "incorrect"].includes(right.latest)) - Number(["partial", "incorrect"].includes(left.latest)) || lastPractice(b.id) - lastPractice(a.id));
  });
  const recent = attempts.filter((attempt) => graded(attempt));
  const last = recent.at(-1);
  const lastWasReturn = Boolean(last && attempts.some((prior) => prior !== last && prior.conceptId === last.conceptId));
  let concept = due.length && (!fresh.length || !lastWasReturn) ? due[0] : fresh[0];
  concept ??= due[0] ?? [...pool].sort((a, b) => {
    const left = byId.get(a.id), right = byId.get(b.id);
    return (weights ? pool.indexOf(a) - pool.indexOf(b) : 0) || Number(right.unresolvedItems > 0) - Number(left.unresolvedItems > 0) || (left.score ?? -1) - (right.score ?? -1) || Date.parse(left.lastIndependentAt ?? "1970-01-01") - Date.parse(right.lastIndependentAt ?? "1970-01-01");
  })[0];
  const evidence = byId.get(concept.id);
  const kind = evidence.review.due ? evidence.review.kind === "retention" ? "retention" : "transfer" : "fresh";
  const reason = evidence.review.due ? evidence.review.reason : evidence.score === null ? practiced.has(concept.id) ? "Continue prior work in this category with a whole source question; earlier practice remains recorded." : mode === "exam" ? "Try a representative source question in this assessed category. Diagnose a prerequisite only when the answer shows a blocker." : "Try a whole source question in the next category after prior prerequisite practice." : "This ready category needs stronger independent evidence.";
  return { conceptId: concept.id, kind, reason: [priorityReason, reason].filter(Boolean).join(" "), action: evidence.nextAction, dueAt: evidence.review.dueAt };
}

function buildAdaptiveLearningRoute(topic, attempts, mode, now = Date.now()) {
  const targetPercent = practiceTarget(topic.practicePolicy?.targetPercent);
  const assessedConceptIds = mode === "exam" ? assessedPracticeConceptIds(topic.concepts, topic.examBlueprint) : topic.concepts.map((concept) => concept.id);
  const assessed = new Set(assessedConceptIds);
  return {
    version: 1,
    goal: { targetPercent, strategy: mode === "exam" ? "Aim for the highest practical exam score with the least unnecessary work. Sample assessed categories, repair demonstrated blockers, then use mixed returns." : "Build connected understanding from the current gap. Use prerequisites to explain causes and test transfer when useful." },
    scope: {
      assessedConceptIds,
      prerequisiteOnlyIds: topic.concepts.filter((concept) => !assessed.has(concept.id)).map((concept) => concept.id),
      confirmed: Boolean(topic.examBlueprint?.scopeConfirmed && topic.examBlueprint.scopeSource?.trim() && topic.examBlueprint.domains.flatMap((domain) => domain.requiredConceptIds).every((id) => topic.concepts.some((concept) => concept.id === id)))
    },
    next: recommendPractice(topic.concepts, attempts, mode, now, { ...topic.practicePolicy, targetPercent, examBlueprint: topic.examBlueprint }) ?? null,
    graph: {
      nodes: topic.concepts.map((concept) => {
        const evidence = evidenceFor(concept.id, attempts, now, concept.assessmentRequirements, targetPercent);
        return {
          id: concept.id,
          title: concept.title,
          scope: assessed.has(concept.id) ? "assessed" : "prerequisite",
          evidence: evidence.score !== null ? "independent" : evidence.retentionQuestions ? "recall" : evidence.assistedAttempts ? "coached" : evidence.attempts ? "recorded" : "unassessed",
          score: evidence.score,
          attemptCount: evidence.attempts,
          independentQuestions: evidence.independentQuestions,
          assistedAttempts: evidence.assistedAttempts,
          recallScore: evidence.retentionScore,
          recallQuestions: evidence.retentionQuestions
        };
      }),
      edges: topic.concepts.flatMap((concept) => concept.dependsOn.filter((id) => topic.concepts.some((candidate) => candidate.id === id)).map((id) => ({
        from: id,
        to: concept.id,
        kind: "prerequisite",
        observedBlocker: observedPrerequisiteBlocker(id, concept.id, attempts)
      })))
    }
  };
}
var publicSourceUrl = (value) => {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password ? url.href : void 0;
  } catch {
    return;
  }
};
function buildLearningWorkspace(input) {
  const { topic } = input;
  const generatedAt = input.generatedAt ?? (/* @__PURE__ */ new Date()).toISOString();
  const adaptiveRoute = buildAdaptiveLearningRoute(topic, input.attempts, input.mode, Date.parse(generatedAt));
  const reference = new URL("/learning/reading", input.referenceBaseUrl ?? "http://127.0.0.1:8766");
  reference.searchParams.set("topic", topic.id);
  reference.searchParams.set("view", "reading");
  const sectionIds = new Set(input.sectionIds ?? []);
  const topics = topic.concepts.map((concept) => {
    const sources = [...concept.sourceRefs ?? [], ...topic.sourceRefs ?? []].flatMap((ref) => {
      const url = publicSourceUrl(ref.path);
      return url ? [{ label: ref.label, url, ...ref.locator ? { locator: ref.locator } : {} }] : [];
    });
    sources.push({ label: "Saved readings and source links", url: reference.href });
    const section = concept.id;
    return {
      id: concept.id,
      title: concept.title,
      section_ids: sectionIds.has(section) ? [section] : [],
      requires: concept.dependsOn,
      ...concept.expectedWork ? { reference: concept.expectedWork } : {},
      source_refs: sources.map((source) => source.url),
      sources
    };
  });
  return {
    version: 1,
    mode: input.mode === "exam" ? "exam" : "depth",
    topic_id: topic.id,
    title: topic.title,
    ...input.projectName ? { project_slug: input.projectName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") } : {},
    goal: `${adaptiveRoute.goal.strategy} Minimum practice target ${adaptiveRoute.goal.targetPercent}%.`,
    generatedAt,
    sourceRevision: createHash2("sha256").update(JSON.stringify([topic.id, topic.concepts, topic.examBlueprint, topic.practicePolicy])).digest("hex"),
    revisionBasis: "Topic configuration. Source contents and reviewed coverage remain with the source owner.",
    topics,
    adaptiveRoute
  };
}
function learningWorkspaceUrl(input) {
  const url = new URL("/", input.baseUrl);
  url.searchParams.set("view", input.view);
  url.searchParams.set("learningFile", `${input.topic.id}.json`);
  url.searchParams.set("learningTopic", input.topic.id);
  url.searchParams.set("learningTopicLabel", input.topic.title);
  url.searchParams.set("learningMode", input.mode === "exam" ? "exam" : "depth");
  if (input.projectFile) url.searchParams.set("projectFile", input.projectFile);
  if (input.sectionId) url.searchParams.set("section", input.sectionId);
  return url.href;
}
export {
  buildAdaptiveLearningRoute,
  buildLearningWorkspace,
  learningWorkspaceUrl
};
