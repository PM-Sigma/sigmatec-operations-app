// The one number/date formatter (tools-and-motion §3.2). Every page imports this; nobody forks it.
const NUM = new Intl.NumberFormat('he-IL');
const DAYS = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];

export const fmtNumber = (n: number): string => NUM.format(n);
export const fmtUnit = (n: number, unit: string): string => `${fmtNumber(n)} ${unit}`;

export function fmtDuration(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  const h = Math.floor(m / 60), r = m % 60;
  if (!h) return `${r} ד׳`;
  return r ? `${h} ש׳ ${r} ד׳` : `${h} ש׳`;
}

export const fmtTime = (d: Date): string =>
  `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

export function fmtDay(d: Date, now: Date = new Date()): string {
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(now) - day(d)) / 86_400_000);
  if (diff === 0) return 'היום';
  if (diff === 1) return 'אתמול';
  if (diff > 1 && diff < 6) return `יום ${DAYS[d.getDay()]}`;
  const dm = `${d.getDate()}.${d.getMonth() + 1}`;
  return d.getFullYear() === now.getFullYear() ? dm : `${dm}.${String(d.getFullYear()).slice(2)}`;
}
