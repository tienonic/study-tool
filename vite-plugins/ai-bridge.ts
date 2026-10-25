import { spawn } from 'child_process';
import { resolve } from 'path';
import { readFileSync } from 'fs';

const ALLOWED_CLAUDE_MODELS = new Set(['haiku', 'sonnet', 'opus']);

export function isAllowedClaudeModel(value: unknown): value is string {
  return typeof value === 'string' && ALLOWED_CLAUDE_MODELS.has(value);
}

function loadBridgeConfig() {
  try {
    const raw = readFileSync(resolve('ai-bridge.json'), 'utf-8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export function aiBridgePlugin() {
  return {
    name: 'ai-bridge',
    configureServer(server: any) {
      server.middlewares.use((req: any, res: any, next: any) => {
        if (req.method !== 'POST' || req.url !== '/api/ai') return next();

        let body = '';
        req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
        req.on('end', () => {
          let prompt: string;
          let requestModel: string | undefined;
          try {
            const parsed = JSON.parse(body);
            prompt = parsed.prompt;
            requestModel = parsed.model;
            if (typeof prompt !== 'string' || !prompt.trim()) throw new Error('missing prompt');
            if (requestModel !== undefined && !isAllowedClaudeModel(requestModel)) throw new Error('invalid model');
          } catch {
            res.writeHead(400, { 'Content-Type': 'text/plain' });
            res.end('Bad request: body must be { "prompt": "...", "model?": "..." }');
            return;
          }

          const config = loadBridgeConfig();
          const model = requestModel || config.model || 'sonnet';
          if (!isAllowedClaudeModel(model)) {
            res.writeHead(400, { 'Content-Type': 'text/plain' });
            res.end('Bad request: unsupported model');
            return;
          }
          const showOutput = config.showOutput !== false;

          const args = ['-p', '--output-format', 'text', '--model', model];
          if (config.systemPrompt) args.push('--system-prompt', config.systemPrompt);
          if (config.maxBudgetUsd) args.push('--max-budget-usd', String(config.maxBudgetUsd));
          if (config.effort) args.push('--effort', config.effort);
          if (config.verbose) args.push('--verbose');

          console.log(`\x1b[36m[ai-bridge]\x1b[0m model=\x1b[33m${model}\x1b[0m prompt=${prompt.length}chars`);

          res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
          });

          const child = spawn('claude', args, {
            shell: true,
            stdio: ['pipe', 'pipe', 'pipe'],
          });

          child.stdin.write(prompt);
          child.stdin.end();

          let stderrBuf = '';
          let stdoutTotal = 0;

          child.stdout.on('data', (chunk: Buffer) => {
            const text = chunk.toString();
            stdoutTotal += text.length;
            if (showOutput) process.stdout.write(`\x1b[2m${text}\x1b[0m`);
            res.write(`data: ${JSON.stringify({ text })}\n\n`);
          });

          child.stderr.on('data', (chunk: Buffer) => {
            stderrBuf += chunk.toString();
          });

          child.on('close', (code: number | null) => {
            if (showOutput && stdoutTotal > 0) process.stdout.write('\n');
            console.log(`\x1b[36m[ai-bridge]\x1b[0m done code=${code} ${stdoutTotal}b`);
            if (stderrBuf.trim()) console.log(`\x1b[31m[ai-bridge] stderr:\x1b[0m ${stderrBuf.trim().slice(0, 300)}`);
            if (code && code !== 0 && stderrBuf.trim()) {
              res.write(`data: ${JSON.stringify({ error: stderrBuf.trim() })}\n\n`);
            }
            res.write('data: [DONE]\n\n');
            res.end();
          });

          child.on('error', (err: Error) => {
            console.log(`\x1b[31m[ai-bridge] spawn error:\x1b[0m ${err.message}`);
            res.write(`data: ${JSON.stringify({ error: `Failed to spawn claude CLI: ${err.message}` })}\n\n`);
            res.write('data: [DONE]\n\n');
            res.end();
          });

          res.on('close', () => {
            child.kill();
          });
        });
      });
    },
  };
}
