export function nextMenuIndex(key: string, current: number, count: number): number | null {
  if (count <= 0) return null;
  if (key === 'ArrowDown') return (Math.max(current, -1) + 1) % count;
  if (key === 'ArrowUp') return current <= 0 ? count - 1 : current - 1;
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  return null;
}
export function typeaheadMenuIndex(labels: string[], query: string, current: number): number | null {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized || labels.length === 0) return null;
  for (let offset = 1; offset <= labels.length; offset += 1) {
    const index = (Math.max(current, -1) + offset) % labels.length;
    if (labels[index].trim().toLocaleLowerCase().startsWith(normalized)) return index;
  }
  return null;
}
