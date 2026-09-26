// "רגעים שסומנו" (M-U2): the moments marked this meeting, shown once before the session ends —
// `momentLine` rows (`meetingSession.ts`), newest last (the order they were marked in).
export function MomentsList({ lines }: { lines: string[] }) {
  if (!lines.length) return null;
  return (
    <div data-testid="presenter-moments-list" className="mt-3">
      <div className="mb-1 text-[13px] font-extrabold text-muted-foreground">רגעים שסומנו</div>
      <ul className="flex flex-col gap-1">
        {lines.map((l, i) => (
          <li key={i} className="text-[14px] text-foreground"><bdi>{l}</bdi></li>
        ))}
      </ul>
    </div>
  );
}
