# UX loading patterns — ONE pattern per case

Binding for every new screen and every fix round. Written by Task 31 audit D (dimension 13)
against spec §6, §7k #10 (stale-while-revalidate) and §7p. A screen that deviates is a finding.

The rule behind all six patterns: **within 100 ms of a tap the UI must change**, and **no wait is
open-ended** — every network call has a timeout, a Hebrew message and a way to try again.

---

## The six cases

| # | Case | The ONE pattern | Library component |
|---|---|---|---|
| 1 | **List / screen load, no cache** | `Skeleton` rows matching the real row height (3–5 of them), never a spinner, never an empty screen | `@/components/ui/skeleton` → `<Skeleton className="h-16 rounded-xl" />` |
| 2 | **List / screen load, cache present** | Paint the cached rows instantly, refresh silently — **no skeleton** | TanStack Query `initialData` from the persisted cache (`app/src/lib/query.ts`), `isFetching` for #3 |
| 3 | **Background sync / revalidate** | A subtle indicator only: the header dot or a 2 px brand-gradient hairline under the header while `isFetching && !isPending`. Never blocks, never moves layout | `useIsFetching()` + the existing header hairline |
| 4 | **Mutation from a button** | The button itself is the pending state: `disabled` + `<Loader2 className="animate-spin" />` + the label kept as text, and a `toast.promise` for the outcome | `@/components/ui/button` + `lucide-react` `Loader2` + `sonner` `toast.promise(p, { loading, success, error })` |
| 5 | **Long job (Whisper refine, Gemini day-log/order parse)** | An inline progress row with the elapsed/ETA text and a **בטל** button wired to an `AbortController`; the form stays editable throughout | `Loader2` + `AbortController` (see `app/src/islands/DayLog.tsx:88`) |
| 6 | **Offline / queued write** | An optimistic row plus a **🕒 בתור** chip on the affected item, and a header counter "N פעולות ממתינות" that clears on flush | the EMS queue in `js/src/13-ems.js` (`emsWriteOrQueue`, `emsQueueFlush`) + a `Badge` |

## Rules that apply to all six

1. **100 ms rule.** `setSending(true)` / `setBtnLoading(btn, true)` is the FIRST statement after
   validation, before any `await`. Validation that can fail synchronously runs before it.
2. **Every call has a timeout.** EMS already does (20 s, `emsProxyCall` in `js/src/12-reports.js`,
   Hebrew "תם הזמן — השרת לא הגיב"). Supabase writes (`sbWrite`) and the `github` /
   `push-send` edge-function calls must get the same: `AbortSignal.timeout(20_000)` and, on
   abort, `toast.error('תם הזמן — נסה שוב')` with a retry action.
3. **Errors are Hebrew and actionable**, with a retry affordance:
   `toast.error(msg, { action: { label: 'נסה שוב', onClick: retry } })`. Never a raw
   `alert()`, never an English exception string.
4. **The button label never disappears.** While pending, render
   `{pending && <Loader2 className="size-4 animate-spin" />}{label}` — swapping the label for a
   bare spinner drops the button's accessible name and makes the pending state untestable.
   Every such button carries a stable `data-testid`.
5. **No disabled-only pending state.** Disabling without a spinner or label change reads as a
   broken button on a slow phone.
6. **Legacy parity.** Legacy buttons use the ONE helper `setBtnLoading(btn, true|false)`; it takes
   the pending label as an argument (`'שומר…'` / `'שולח…'` / `'מנתח…'`) instead of hard-coding
   "שומר..." for every action, and it lives in a shared util, not in `js/src/05-meeting-returns.js`.
7. **A popup with input never closes on its own** (§7p) — see `docs/click-map.md` §2 and the
   audit report's popup table. Pending work inside a popup disables the close buttons, not the
   whole sheet.
8. **`prefers-reduced-motion`** disables the shimmer; the Skeleton keeps its shape.

## Anti-patterns (each is a finding)

- `alert('שגיאה: ' + e.message)` as the only feedback for a failed write.
- A spinner where a Skeleton belongs (case 1), or a Skeleton where cached data exists (case 2).
- `await` before the pending flag is set.
- A fetch with no timeout (any Supabase write, the `github` edge fn, `push-send` today).
- A queued-offline write that reports success, or that reports nothing at all.
- A long job with no cancel.
