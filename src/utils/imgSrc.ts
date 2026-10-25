const isDev = import.meta.env.DEV;

export function imgSrc(url: string | undefined): string | undefined {
  if (!url) return undefined;
  if (!isDev) return url;
  if (url.startsWith('/') || url.startsWith('data:')) return url;
  return '/__img?url=' + encodeURIComponent(url);
}
