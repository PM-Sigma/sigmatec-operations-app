// ═══════════════════════════════════════════════════════════════════════════
// §7p — a popup that holds unsaved input never closes on its own.
//
// ONE hook for every island Sheet/Dialog (task 31 fix round 3, F1/F2/F3/F13). The legacy
// twin is modalGuard() in js/src/00-guard.js; the two share the copy below so the app
// asks the same question whichever half of it you are in.
//
// Usage:
//   const guard = useUnsavedGuard({ dirty: () => text.trim() !== '', onSave: send, onDiscard: reset });
//   <Sheet open={open} onOpenChange={guard.onOpenChange(setOpen)}>
//     <SheetContent {...guard.contentProps}>
//       …
//       {guard.prompt}
//     </SheetContent>
//   </Sheet>
//
// What it wires:
//   · `onPointerDownOutside` / `onInteractOutside` — a backdrop tap,
//   · `onEscapeKeyDown`                            — Esc,
//   all three `preventDefault()`ed while dirty, replaced by the three-way prompt. A CLEAN
//   popup dismisses exactly as before — the guard is invisible until there is something to
//   lose.
//
// What it deliberately does NOT do: call `reset()`. Discarding is a choice the person makes
// in the prompt, never a side effect of a stray tap (F2/F3).
// ═══════════════════════════════════════════════════════════════════════════
import * as React from 'react';

export const UNSAVED_TITLE = 'יש שינויים שלא נשמרו';
// Round 2, Package B item 2: the phone's Back on a dirty sheet asks the SAME three things,
// in the person's words. The humanizer forbids " — " in new UI strings, so the body is a
// sentence. The legacy twin in js/src/00-guard.js carries the identical copy.
export const UNSAVED_BODY = 'אפשר לשמור טיוטה, לצאת בלי לשמור, או להמשיך לערוך.';
export const UNSAVED_SAVE = 'שמור טיוטה';
export const UNSAVED_DISCARD = 'לצאת בלי לשמור';
export const UNSAVED_KEEP = 'להמשיך';

// Round 5 V-L7 (grill round 2, "Drafts rule 2"), exact copy, additive: every other caller keeps the
// three-button save/keep/discard prompt above untouched — only `variant: 'visit'`/`'visitEdit'` switches
// to these two. 'visit' (a new/resumed draft, autosaved already — leaving never loses it): "לבטל ולחזור
// אחר כך" (leave, the draft stays) / "להמשיך לסיים" (stay). 'visitEdit' (editing a filed visit — there is
// no draft to keep, per V-L4b): "לצאת בלי לשמור" (leave, the edit is dropped) / "להמשיך לערוך" (stay).
export const VISIT_PROMPT_LEAVE_NEW = 'לבטל ולחזור אחר כך';
export const VISIT_PROMPT_STAY_NEW = 'להמשיך לסיים';
export const VISIT_PROMPT_LEAVE_EDIT = 'לצאת בלי לשמור';
export const VISIT_PROMPT_STAY_EDIT = 'להמשיך לערוך';

export interface UnsavedGuardOptions {
  /** Is there anything worth keeping right now? Called on every dismiss attempt. */
  dirty: () => boolean;
  /** "לשמור" — the popup's own save path. Omitted → the save button is not offered. */
  onSave?: () => void | Promise<unknown>;
  /** "לבטל" — throw the draft away and close. Defaults to just closing. */
  onDiscard?: () => void;
  /** Close the popup (both "לשמור" after a successful save and "לבטל" call it). */
  onClose?: () => void;
  /**
   * A BLOCKING gate (the 401 re-login sheet, F13): every dismiss path is refused and no
   * prompt is shown — there is nothing to decide, the person must sign in.
   */
  blocking?: boolean;
  /** The visit sheet's own two-button prompt (see the constants above). Every other caller omits this. */
  variant?: 'visit' | 'visitEdit';
}

export interface UnsavedGuard {
  /** Spread onto `<SheetContent>` / `<DialogContent>`. */
  contentProps: {
    onPointerDownOutside: (e: Event) => void;
    onInteractOutside: (e: Event) => void;
    onEscapeKeyDown: (e: KeyboardEvent) => void;
  };
  /** Wrap the popup's `onOpenChange` so a programmatic close is still guarded. */
  onOpenChange: (set: (v: boolean) => void) => (v: boolean) => void;
  /** Render inside the content. `null` until the prompt is asked for. */
  prompt: React.ReactNode;
  /** True while the prompt is on screen (tests, and to freeze other affordances). */
  asking: boolean;
  /** Ask by hand — e.g. from a "ביטול" button that must not silently drop a draft. */
  ask: () => void;
}

export function useUnsavedGuard(opts: UnsavedGuardOptions): UnsavedGuard {
  const { onSave, variant } = opts;   // the rest is read through the ref below, so it is never stale
  const [asking, setAsking] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  // Kept in a ref so the handlers below never go stale between renders.
  const ref = React.useRef(opts);
  ref.current = opts;

  const block = React.useCallback((e: Event) => {
    const o = ref.current;
    if (o.blocking) { e.preventDefault(); return; }
    if (!o.dirty()) return;               // clean → the normal dismiss runs
    e.preventDefault();
    setAsking(true);
  }, []);

  const contentProps = React.useMemo(() => ({
    onPointerDownOutside: block,
    onInteractOutside: block,
    onEscapeKeyDown: block as unknown as (e: KeyboardEvent) => void,
  }), [block]);

  const onOpenChange = React.useCallback((set: (v: boolean) => void) => (v: boolean) => {
    const o = ref.current;
    if (v) { set(true); return; }
    if (o.blocking) return;               // a gate only closes from its own button
    set(false);                           // the draft SURVIVES — no reset() here (F2/F3)
  }, []);

  const close = React.useCallback(() => {
    setAsking(false);
    (ref.current.onClose ?? (() => {}))();
  }, []);

  const doDiscard = React.useCallback(() => {
    setAsking(false);
    const o = ref.current;
    o.onDiscard?.();
    o.onClose?.();
  }, []);

  const doSave = React.useCallback(async () => {
    const o = ref.current;
    if (!o.onSave) { close(); return; }
    setSaving(true);
    try { await o.onSave(); setAsking(false); }
    finally { setSaving(false); }
  }, [close]);

  const prompt = asking ? (
    <div
      // Inside the popup's own portal on purpose: a second Radix layer would fight the
      // sheet's focus trap, and this question belongs to the sheet it interrupts.
      className="absolute inset-0 z-[70] grid place-items-center rounded-[inherit] bg-black/60 p-4"
      role="alertdialog"
      aria-modal="true"
      aria-label={UNSAVED_TITLE}
      data-testid="unsaved-guard"
      dir="rtl"
    >
      <div className="w-full max-w-sm rounded-2xl border border-border bg-background p-4 shadow-lg">
        <div className="text-[15px] font-extrabold text-foreground">{UNSAVED_TITLE}</div>
        {!variant && <p className="mt-1 text-[13px] text-muted-foreground">{UNSAVED_BODY}</p>}
        <div className="mt-4 flex flex-col gap-2">
          {variant ? (
            <>
              <button
                type="button"
                data-testid="unsaved-keep"
                onClick={() => setAsking(false)}
                className="min-h-[44px] w-full rounded-xl s-brand text-[15px] font-bold"
              >
                {variant === 'visitEdit' ? VISIT_PROMPT_STAY_EDIT : VISIT_PROMPT_STAY_NEW}
              </button>
              <button
                type="button"
                data-testid="unsaved-discard"
                // 'visit' (a new/resumed draft): "לבטל ולחזור אחר כך" means the draft survives, so
                // this persists (onSave, e.g. saveAndClose) before closing — closing alone could
                // race the 800 ms autosave debounce and lose the last few keystrokes. 'visitEdit'
                // has no draft to persist: leaving just closes, per the ruling ("לצאת בלי לשמור").
                onClick={variant === 'visitEdit' ? close : () => void doSave()}
                className="min-h-[40px] w-full rounded-xl text-[13px] font-bold text-muted-foreground hover:bg-muted"
              >
                {variant === 'visitEdit' ? VISIT_PROMPT_LEAVE_EDIT : VISIT_PROMPT_LEAVE_NEW}
              </button>
            </>
          ) : (
            <>
              {onSave && (
                <button
                  type="button"
                  data-testid="unsaved-save"
                  disabled={saving}
                  onClick={() => void doSave()}
                  className="min-h-[44px] w-full rounded-xl s-brand text-[15px] font-bold disabled:opacity-50"
                >
                  {UNSAVED_SAVE}
                </button>
              )}
              <button
                type="button"
                data-testid="unsaved-keep"
                onClick={() => setAsking(false)}
                className="min-h-[44px] w-full rounded-xl border border-border text-[15px] font-bold hover:bg-muted"
              >
                {UNSAVED_KEEP}
              </button>
              <button
                type="button"
                data-testid="unsaved-discard"
                onClick={doDiscard}
                className="min-h-[40px] w-full rounded-xl text-[13px] font-bold text-destructive hover:bg-destructive/10"
              >
                {UNSAVED_DISCARD}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  ) : null;

  return {
    contentProps,
    onOpenChange,
    prompt,
    asking,
    ask: React.useCallback(() => { if (ref.current.dirty()) setAsking(true); else ref.current.onClose?.(); }, []),
  };
}

/** Void the `onDiscard` of a popup that has nothing to throw away. */
export const NO_DISCARD = () => {};
