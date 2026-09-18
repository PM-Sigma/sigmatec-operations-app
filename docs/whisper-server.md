# Whisper on the office server — pointer (the free transcription path)

**Why:** every voice note in the app (📣 feedback box, later the free-text day log) is transcribed
by the Edge Function `transcribe`. Its chain is **the office server first, Groq only as insurance**
(spec §7i, "Free-first decision", עידן 18.9): free, Hebrew-tuned, and the audio never leaves
equipment we own. Groq `whisper-large-v3` stays wired as the fallback so nothing breaks while the
server is down.

> **This is now a LIVE server**, not a Docker runbook to follow — a small self-updating service on
> עידן's machine, with a fast pass on GPU and a background refine pass on CPU. Its own setup/ops
> runbook lives OUTSIDE this repo:
>
> **`C:/Users/idann/Projects IdanHomeServer/whisper-server/docs/whisper-server.md`**
>
> Go there for how the server itself is built, run, and updated. This page only documents the
> contract `transcribe` (this repo) talks to it with.

---

## The live facts (task 6b, spec §7i)

| | |
|---|---|
| Base URL | `https://idanhomepc.tail9e880d.ts.net` — permanent Tailscale Funnel hostname, hard-coded as `DEFAULT_SELF_WHISPER_URL` in `supabase/functions/transcribe/index.ts`; `SELF_WHISPER_URL` overrides it if the server ever moves |
| Auth | `Authorization: Bearer <SELF_WHISPER_TOKEN>` — a Supabase secret; **may be unset** in any given environment, and the function must simply fall back to Groq (`engine:'groq'` in `transcribe_log`), not error |
| Fast pass | `ivrit-ai/whisper-large-v3-turbo-ggml` on GPU |
| Refine pass | `ivrit-ai/whisper-large-v3-ct2` on CPU, ~0.7× realtime (a 60 s note ≈ 82 s to refine, 3 min ≈ 4 min) |
| `/health` | open, unauthenticated — reveals nothing, used for the settings health chip (`{health:true}` mode on `transcribe` → `{ok, engine}`) |
| Server-side logging | **none** — the server keeps no transcript; only `transcribe_log` (engine/ms/ok) is written, by `transcribe` itself |

## The two-call contract

**1. `POST /v1/audio/transcriptions`** — multipart `file`, `model`, **`language=he` always**,
`response_format=json` →

```json
{ "text": "...", "refined": false, "job_id": "...", "refine_eta_seconds": 8 }
```

`transcribeChain` (`supabase/functions/transcribe/chain.ts`) retries this call **once, 2 s later,
on a network error or 5xx** — never on a 4xx (400/401/413/429 fail straight to Groq) — before
giving up on the self leg. Timeout stays 25 s (`SELF_TIMEOUT_MS`).

**2. `GET /v1/audio/transcriptions/{job_id}`** →

```json
{ "text": "...", "status": "refining" | "done" | "failed", "refined": true, "seconds_remaining": 4 }
```

Job TTL is **1 hour**. The client never calls this directly — it posts `{ token, job_id }` back to
`transcribe`, which proxies the GET with the bearer (`pollRefine` in `chain.ts`) so
`SELF_WHISPER_TOKEN` never reaches the browser. The app's poll loop
(`app/src/lib/speech.ts` `pollRefineStatus`) is driven by the island: every
`min(seconds_remaining, 5)` s while the field is open and untouched, stopped on close/unmount/the
1 h TTL. Whether the refined text actually replaces the field is `refineMerge`
(`app/src/lib/feedback.ts`): untouched → replace + "עודכן" chip with undo; edited or already sent
→ discard.

## Verify from the app

Record a note in 📣 → the fast text comes back at once (editable) → if `engine:'self'`, the
"עודכן" chip appears a few seconds later once the refine pass lands. Then:

```sql
select engine, ms, ok, audio_sec, created_at from transcribe_log order by created_at desc limit 5;
```

`engine = 'self'` means the office server answered the fast pass. `'groq'` means it did not (no
token configured, or the chain fell all the way through after its retry) — check the server's own
runbook (path above) for `/health` and its logs.

## Recordings and retention (unchanged)

- Bucket **`feedback-audio`** — private, 25 MB per object, audio mime types only
  (`db/feedback.sql`). Insert-only for the `authenticated` pass; nothing can read it from a
  browser.
- `transcribe` **deletes the object as soon as it has the fast text**. A FAILED transcription keeps
  it for the retry window (7 days).
- Every transcript is editable in the textarea before it is sent — the model, fast or refined, is
  never the last word.
