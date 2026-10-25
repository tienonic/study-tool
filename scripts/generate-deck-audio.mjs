import { randomUUID } from 'node:crypto';
import { existsSync, statSync } from 'node:fs';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { audioCacheDescriptor, audioCacheKey, edgeTtsRateArgument, normalizeAudioText } from './lib/audio-cache-key.mjs';

function usage() {
  console.error('Usage: node scripts/generate-deck-audio.mjs <deck.json> --output-deck <deck.json> [--cache-root <dir>] [--namespace <slug>] [--engine-command <path>] [--concurrency N] [--dry-run]');
}

function slugify(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/gu, '-').replace(/^-|-$/gu, '');
}

function parseArgs(argv) {
  const values = { deckPath: '', outputDeck: '', cacheRoot: 'audio-cache', namespace: '', engineCommand: 'edge-tts', concurrency: 3, dryRun: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--output-deck') values.outputDeck = argv[++index] ?? '';
    else if (arg === '--cache-root') values.cacheRoot = argv[++index] ?? '';
    else if (arg === '--namespace') values.namespace = argv[++index] ?? '';
    else if (arg === '--engine-command') values.engineCommand = argv[++index] ?? '';
    else if (arg === '--concurrency') values.concurrency = Number(argv[++index]);
    else if (arg === '--dry-run') values.dryRun = true;
    else if (!arg.startsWith('-') && !values.deckPath) values.deckPath = arg;
    else throw new Error(`Unknown or incomplete argument: ${arg}`);
  }
  if (!values.deckPath) throw new Error('A deck path is required');
  if (!values.dryRun && !values.outputDeck) throw new Error('--output-deck is required unless --dry-run is used');
  if (!values.cacheRoot) throw new Error('--cache-root must not be empty');
  if (!Number.isInteger(values.concurrency) || values.concurrency < 1 || values.concurrency > 8) throw new Error('--concurrency must be an integer from 1 to 8');
  return values;
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', code => {
      if (code === 0) resolve({ stdout: stdout.trim(), stderr: stderr.trim() });
      else reject(new Error(`${command} exited ${code}: ${(stderr || stdout).trim()}`));
    });
  });
}

async function mapConcurrent(items, limit, worker) {
  let cursor = 0;
  const results = new Array(items.length);
  async function consume() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, consume));
  return results;
}

let args;
try {
  args = parseArgs(process.argv.slice(2));
} catch (error) {
  usage();
  console.error(error.message);
  process.exit(1);
}

const sourcePath = path.resolve(args.deckPath);
const outputPath = args.outputDeck ? path.resolve(args.outputDeck) : '';
if (outputPath && outputPath === sourcePath) {
  console.error('Refusing to overwrite the source deck; choose a different --output-deck path');
  process.exit(1);
}

let deck;
try {
  deck = JSON.parse(await readFile(sourcePath, 'utf8'));
} catch (error) {
  console.error(`Could not read valid deck JSON: ${error.message}`);
  process.exit(1);
}

const listening = deck?.config?.listening;
if (listening?.enabled !== true) {
  console.error('Deck listening must be enabled before audio generation');
  process.exit(1);
}
if (listening.provider !== 'cached-audio' && listening.provider !== 'auto') {
  console.error('Deck listening provider must be cached-audio or auto');
  process.exit(1);
}
const voice = normalizeAudioText(listening.voice);
const engineVersion = normalizeAudioText(listening.engine_version);
const rate = Number(listening.rate ?? 1);
if (!voice || !engineVersion || !Number.isFinite(rate) || rate < 0.5 || rate > 2) {
  console.error('Deck listening requires voice, engine_version, and a rate from 0.5 to 2');
  process.exit(1);
}
let actualEngineVersion;
try {
  const versionResult = await run(args.engineCommand, ['--version']);
  actualEngineVersion = normalizeAudioText(versionResult.stdout || versionResult.stderr);
} catch (error) {
  console.error(`Could not run the configured TTS engine: ${error.message}`);
  process.exit(1);
}
if (actualEngineVersion !== engineVersion) {
  console.error(`Deck engine_version is "${engineVersion}", but the installed engine reports "${actualEngineVersion}"`);
  process.exit(1);
}

const namespace = args.namespace || slugify(deck.name);
if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(namespace)) {
  console.error('Audio namespace must be a lowercase hyphenated slug');
  process.exit(1);
}
const cards = deck.sections.flatMap(section => Array.isArray(section.flashcards) ? section.flashcards : []);
const missingText = cards.filter(card => !normalizeAudioText(card.pronunciation_override || card.audio_text));
if (missingText.length > 0) {
  console.error(`${missingText.length} cards are missing pronunciation_override/audio_text`);
  process.exit(1);
}

const cacheRoot = path.resolve(args.cacheRoot);
const namespaceDir = path.resolve(cacheRoot, namespace);
if (!namespaceDir.startsWith(cacheRoot + path.sep)) {
  console.error('Invalid audio namespace path');
  process.exit(1);
}
const jobs = cards.map(card => {
  const text = normalizeAudioText(card.pronunciation_override || card.audio_text);
  const descriptor = audioCacheDescriptor({
    text,
    voice,
    rate,
    pronunciationOverride: card.pronunciation_override || '',
    engineVersion,
    provider: 'edge-tts',
  });
  const key = audioCacheKey(descriptor);
  card.audio_src = `${namespace}/${key}.mp3`;
  return { cardId: card.id, text, descriptor, key, relativePath: card.audio_src, output: path.resolve(namespaceDir, `${key}.mp3`) };
});
const uniqueJobs = [...new Map(jobs.map(job => [job.key, job])).values()];

if (args.dryRun) {
  console.log(JSON.stringify({ result: 'DRY_RUN', cards: jobs.length, uniqueCacheKeys: uniqueJobs.length, namespace }, null, 2));
  process.exit(0);
}

await mkdir(namespaceDir, { recursive: true });
let generated = 0;
let reused = 0;
await mapConcurrent(uniqueJobs, args.concurrency, async job => {
  if (existsSync(job.output) && statSync(job.output).size > 0) {
    reused += 1;
    return;
  }
  const partial = `${job.output}.${randomUUID()}.partial`;
  try {
    await run(args.engineCommand, [
      '--text', job.text,
      '--voice', voice,
      edgeTtsRateArgument(rate),
      '--write-media', partial,
    ]);
    if (!existsSync(partial) || statSync(partial).size === 0) throw new Error('TTS engine produced an empty file');
    await rename(partial, job.output);
    generated += 1;
  } finally {
    await rm(partial, { force: true });
  }
});

const manifest = {
  schema_version: 1,
  generated_at: new Date().toISOString(),
  source_deck: sourcePath,
  provider: 'edge-tts',
  engine_version: actualEngineVersion,
  voice,
  rate,
  namespace,
  cards: jobs.map(job => ({ card_id: job.cardId, cache_key: job.key, audio_src: job.relativePath, descriptor: job.descriptor })),
};
await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(path.resolve(namespaceDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
await writeFile(outputPath, `${JSON.stringify(deck, null, 2)}\n`);
console.log(JSON.stringify({ result: 'PASS', cards: jobs.length, uniqueCacheKeys: uniqueJobs.length, generated, reused, namespace, outputDeck: outputPath, cacheDirectory: namespaceDir }, null, 2));
