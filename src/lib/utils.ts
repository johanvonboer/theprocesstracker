export function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function calendarDiff(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number);
  const entry = new Date(y, m - 1, d);
  const now = new Date();
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((todayMidnight.getTime() - entry.getTime()) / 86_400_000);
}

export function fmtDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function daysSince(dateStr: string | null): string {
  if (!dateStr) return 'Never done';
  const diff = calendarDiff(dateStr);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return `${diff} days ago`;
}

export function urgencyColor(lastDate: string | null, yellowAfterDays: number, redAfterDays: number): string {
  const days = lastDate ? calendarDiff(lastDate) : redAfterDays + 1;
  if (days <= 0) return 'hsl(120, 75%, 45%)';
  if (days >= redAfterDays) return 'hsl(0, 75%, 45%)';
  if (days <= yellowAfterDays) {
    const hue = 120 - (days / yellowAfterDays) * 60;
    return `hsl(${hue.toFixed(1)}, 75%, 45%)`;
  }
  const hue = 60 - ((days - yellowAfterDays) / (redAfterDays - yellowAfterDays)) * 60;
  return `hsl(${hue.toFixed(1)}, 75%, 45%)`;
}
