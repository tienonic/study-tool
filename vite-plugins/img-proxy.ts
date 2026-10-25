import https from 'https';
import http from 'http';
import dns from 'node:dns';
import { isIP } from 'node:net';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const API_UA = 'DrillStudyTool/2.0 (study-tool@localhost)';

const WIKI_THUMB_RE = /^https:\/\/upload\.wikimedia\.org\/wikipedia\/(\w+)\/thumb\/\w+\/\w+\/([^/]+)\/(\d+)px-[^/]+$/;
const BLOCKED_HOSTS = new Set(['localhost', '0.0.0.0', '::', '::1']);

const imageCache = new Map<string, { buf: Buffer; ct: string }>();
// Cache resolved API URLs so we don't re-query
const urlCache = new Map<string, string | null>();

function isPrivateIpv4(hostname: string): boolean {
  const parts = hostname.split('.').map(part => Number(part));
  if (parts.length !== 4 || parts.some(part => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [a, b] = parts;
  return a === 0 || a === 10 || a === 127 || a >= 224
    || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 168 || b === 0))
    || (a === 198 && (b === 18 || b === 19));
}

function isBlockedHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, '').replace(/^\[|\]$/g, '');
  const isIpv6 = host.includes(':');
  return BLOCKED_HOSTS.has(host)
    || host.endsWith('.localhost')
    || isPrivateIpv4(host)
    || (isIpv6 && !/^[23][0-9a-f]{3}:/.test(host));
}

export function publicImageLookup(hostname: string, options: { all?: boolean }, callback: (...args: any[]) => void): void {
  dns.lookup(hostname, { all: true }, (error, addresses) => {
    if (error) { callback(error); return; }
    if (!addresses.length || addresses.some(({ address }) => !isIP(address) || isBlockedHostname(address))) {
      callback(new Error('Image host resolves to a private or reserved address'));
      return;
    }
    if (options.all) callback(null, addresses);
    else callback(null, addresses[0].address, addresses[0].family);
  });
}

function parseTargetUrl(target: string): string | null {
  try {
    const parsed = new URL(target);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
    if (isBlockedHostname(parsed.hostname)) return null;
    return parsed.href;
  } catch {
    return null;
  }
}

function extractWikiFilename(url: string): { filename: string; width: number } | null {
  const m = url.match(WIKI_THUMB_RE);
  if (!m) return null;
  return { filename: decodeURIComponent(m[2]), width: parseInt(m[3], 10) || 600 };
}

// Use the Wikimedia API to get the actual current thumbnail URL
function resolveViaApi(filename: string, width: number): Promise<string | null> {
  const cached = urlCache.get(filename);
  if (cached !== undefined) return Promise.resolve(cached);

  return new Promise((resolve) => {
    const apiUrl = `https://commons.wikimedia.org/w/api.php?action=query&titles=File:${encodeURIComponent(filename)}&prop=imageinfo&iiprop=url&iiurlwidth=${width}&format=json`;
    https.get(apiUrl, { headers: { 'User-Agent': API_UA } }, (res) => {
      let d = '';
      res.on('data', (c: Buffer) => d += c);
      res.on('end', () => {
        try {
          const j = JSON.parse(d);
          const pages = j.query?.pages;
          if (!pages) { urlCache.set(filename, null); resolve(null); return; }
          const page = Object.values(pages)[0] as any;
          const thumbUrl = page?.imageinfo?.[0]?.thumburl ?? null;
          urlCache.set(filename, thumbUrl);
          resolve(thumbUrl);
        } catch { urlCache.set(filename, null); resolve(null); }
      });
    }).on('error', () => { resolve(null); });
  });
}

function sendCached(res: any, entry: { buf: Buffer; ct: string }) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.setHeader('Content-Type', entry.ct);
  res.setHeader('Content-Security-Policy', "sandbox; default-src 'none'");
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Length', entry.buf.length);
  res.statusCode = 200;
  res.end(entry.buf);
}

function fetchImage(url: string, cacheKey: string, maxRedirects: number, res: any): void {
  if (!parseTargetUrl(url)) { res.statusCode = 400; res.end('Invalid image url'); return; }
  const parsed = new URL(url);
  const lib = parsed.protocol === 'https:' ? https : http;

  const headers: Record<string, string> = { 'User-Agent': UA };
  if (url.includes('wikimedia.org')) headers['Referer'] = 'https://commons.wikimedia.org/';

  lib.get(url, { headers, lookup: publicImageLookup }, (upstream) => {
    const status = upstream.statusCode ?? 200;

    if ((status === 301 || status === 302 || status === 307 || status === 308) && upstream.headers.location && maxRedirects > 0) {
      upstream.resume();
      try {
        const next = new URL(upstream.headers.location, url).href;
        fetchImage(next, cacheKey, maxRedirects - 1, res);
      } catch { res.statusCode = 400; res.end('Invalid image redirect'); }
      return;
    }

    if (status === 429 && maxRedirects > 0) {
      upstream.resume();
      setTimeout(() => fetchImage(url, cacheKey, maxRedirects - 1, res), 2000);
      return;
    }

    const ct = upstream.headers['content-type'] ?? 'application/octet-stream';

    if (status === 200 && ct.startsWith('image/')) {
      const chunks: Buffer[] = [];
      upstream.on('data', (c: Buffer) => chunks.push(c));
      upstream.on('end', () => {
        const buf = Buffer.concat(chunks);
        imageCache.set(cacheKey, { buf, ct });
        sendCached(res, { buf, ct });
      });
    } else {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      res.setHeader('Cache-Control', 'no-cache');
      res.statusCode = status;
      upstream.resume();
      res.end();
    }
  }).on('error', () => { res.statusCode = 502; res.end('Proxy error'); });
}

export function imgProxyPlugin() {
  return {
    name: 'img-proxy',
    configureServer(server: any) {
      server.middlewares.use(async (req: any, res: any, next: any) => {
        if (!req.url?.startsWith('/__img?')) return next();

        const url = new URL(req.url, 'http://localhost');
        const target = url.searchParams.get('url');
        if (!target) { res.statusCode = 400; res.end('Missing url'); return; }
        const targetUrl = parseTargetUrl(target);
        if (!targetUrl) { res.statusCode = 400; res.end('Invalid image url'); return; }

        const cached = imageCache.get(targetUrl);
        if (cached) { sendCached(res, cached); return; }

        const wiki = extractWikiFilename(targetUrl);
        if (wiki) {
          const resolved = await resolveViaApi(wiki.filename, wiki.width);
          if (resolved) {
            fetchImage(resolved, targetUrl, 5, res);
          } else {
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
            res.statusCode = 404;
            res.end();
          }
        } else {
          fetchImage(targetUrl, targetUrl, 5, res);
        }
      });
    },
  };
}
