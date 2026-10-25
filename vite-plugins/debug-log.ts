import { resolve } from 'path';
import { writeFileSync } from 'fs';

export function debugLogPlugin() {
  const logLines: string[] = [];
  return {
    name: 'debug-log',
    configureServer(server: any) {
      server.middlewares.use((req: any, res: any, next: any) => {
        if (req.method === 'POST' && req.url === '/__debug-log') {
          let body = '';
          req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
          req.on('end', () => {
            try {
              const { msg } = JSON.parse(body);
              logLines.push(msg);
              if (logLines.length > 500) logLines.splice(0, logLines.length - 500);
              writeFileSync(resolve('debug.log'), logLines.join('\n'), 'utf-8');
            } catch {}
            res.statusCode = 200;
            res.end('ok');
          });
          return;
        }
        if (req.method === 'GET' && req.url === '/__debug-log') {
          res.writeHead(200, { 'Content-Type': 'text/plain' });
          res.end(logLines.join('\n'));
          return;
        }
        if (req.method === 'DELETE' && req.url === '/__debug-log') {
          logLines.length = 0;
          try { writeFileSync(resolve('debug.log'), '', 'utf-8'); } catch {}
          res.statusCode = 200;
          res.end('cleared');
          return;
        }
        next();
      });
    },
  };
}
