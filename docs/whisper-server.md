# Whisper on the office server — runbook (the free transcription path)

**Why:** every voice note in the app (📣 feedback box, later the free-text day log) is transcribed
by the Edge Function `transcribe`. Its chain is **the office server first, Groq only as insurance**
(spec §7i, "Free-first decision", עידן 18.9): free, Hebrew-tuned, and the audio never leaves
equipment we own. Groq `whisper-large-v3` stays wired as the fallback so nothing breaks while the
server is down or before it exists.

> **This page is the one MANUAL step of Task 6.** Everything else (function, client, DB, bucket)
> is deployed. Until the two secrets below are set, `transcribe` answers with `engine:"groq"` —
> which works, and costs fractions of a cent per minute.

---

## 1. Run the server (עידן's machine)

`fedirz/faster-whisper-server` is an OpenAI-compatible HTTP API around `faster-whisper`
(CTranslate2). Model: **`ivrit-ai/whisper-large-v3-turbo-ct2`** — a Hebrew fine-tune, int8, near
real-time on a modern CPU and ~4× faster on any NVIDIA GPU.

**CPU (any machine):**

```bash
docker run -d --name whisper --restart unless-stopped \
  -p 8000:8000 \
  -v whisper-cache:/root/.cache/huggingface \
  -e WHISPER__MODEL=ivrit-ai/whisper-large-v3-turbo-ct2 \
  -e WHISPER__INFERENCE_DEVICE=cpu \
  -e WHISPER__COMPUTE_TYPE=int8 \
  -e WHISPER__TTL=-1 \
  fedirz/faster-whisper-server:latest-cpu
```

**NVIDIA GPU (same image, `-cuda` tag):**

```bash
docker run -d --name whisper --restart unless-stopped --gpus all \
  -p 8000:8000 \
  -v whisper-cache:/root/.cache/huggingface \
  -e WHISPER__MODEL=ivrit-ai/whisper-large-v3-turbo-ct2 \
  -e WHISPER__COMPUTE_TYPE=float16 \
  -e WHISPER__TTL=-1 \
  fedirz/faster-whisper-server:latest-cuda
```

Notes
- `WHISPER__TTL=-1` keeps the model resident; with the default TTL the first request after an
  idle period pays the load time again (and the function gives up after 25 s).
- The volume caches the weights (~1.5 GB) so a container restart does not re-download them.
- A second model can be pulled on demand for comparison, e.g. `Systran/faster-whisper-large-v3`.

**Health check (on the server):**

```bash
curl http://localhost:8000/health
curl -F file=@note.ogg \
     -F model=ivrit-ai/whisper-large-v3-turbo-ct2 \
     -F language=he \
     http://localhost:8000/v1/audio/transcriptions
```

**Start / stop / swap the model**

```bash
docker stop whisper && docker start whisper          # restart
docker logs -f whisper                               # what it is doing
docker rm -f whisper                                 # then re-run with a different WHISPER__MODEL
```

---

## 2. Publish it over HTTPS (Cloudflare Tunnel, free)

The PWA is HTTPS (GitHub Pages), and so is Supabase — an Edge Function cannot call a plain-HTTP
home address. The browser never talks to the server directly either: **only `transcribe` does**.

**Prototype — quick tunnel (one command, random hostname, no account):**

```bash
cloudflared tunnel --url http://localhost:8000
# → https://<random-words>.trycloudflare.com
```

**Production — named tunnel (stable hostname, survives restarts):**

```bash
cloudflared tunnel login                        # once, in a browser
cloudflared tunnel create sigmatec-whisper
cloudflared tunnel route dns sigmatec-whisper whisper.sigmatec-energy.com
# ~/.cloudflared/config.yml:
#   tunnel: sigmatec-whisper
#   credentials-file: /root/.cloudflared/<uuid>.json
#   ingress:
#     - hostname: whisper.sigmatec-energy.com
#       service: http://localhost:8000
#     - service: http_status:404
cloudflared service install                     # run it as a service
```

### The bearer token

`faster-whisper-server` has no auth of its own, so the tunnel must not be open to the world.
Either is fine, both give the function one `Authorization: Bearer …` value:

1. **Cloudflare Access service token** — Zero Trust → Access → Service Auth. Protect the hostname
   with a policy that only accepts that token. (Access wants `CF-Access-Client-Id` +
   `CF-Access-Client-Secret`, so front the server with a tiny reverse proxy that maps `Bearer` →
   those two headers, or use option 2.)
2. **A proxy that checks the bearer itself** — e.g. Caddy in front of the container:

   ```
   whisper.sigmatec-energy.com {
     @authed header Authorization "Bearer {env.WHISPER_TOKEN}"
     handle @authed { reverse_proxy localhost:8000 }
     respond 401
   }
   ```

Generate the token with `openssl rand -hex 32`. **Rotate it** by setting the new value on the
server first, then updating the Supabase secret (step 3) — the function fails over to Groq during
the seconds in between, so nobody notices.

---

## 3. Point the function at it (Supabase → Edge Functions → Secrets)

| Secret | Value |
|---|---|
| `SELF_WHISPER_URL` | `https://whisper.sigmatec-energy.com` (the `/v1/audio/transcriptions` suffix is optional — the function normalises it) |
| `SELF_WHISPER_TOKEN` | the bearer from step 2 |
| `GROQ_API_KEY` | already set (shared with `parse-order`) |
| `GROQ_FALLBACK` | leave unset / anything but `off`. `off` disables the paid path entirely. |

Both self-hosted secrets must be present or the leg is skipped (`chain.ts:enginePlan`). No
redeploy is needed after setting them.

**Verify from anywhere** (the app's own path; needs an EMS login so Storage accepts the upload):
record a note in 📣 → the text comes back → then

```sql
select engine, ms, ok, audio_sec, created_at from transcribe_log order by created_at desc limit 5;
```

`engine = 'self'` means the office server answered. `'groq'` means it did not — check
`docker logs whisper` and the tunnel.

---

## 4. Accuracy check (the comparison עידן asked for)

Take **three real WhatsApp voice notes** with kibbutz and product names in them and run both
models through the same endpoint:

```bash
for m in ivrit-ai/whisper-large-v3-turbo-ct2 Systran/faster-whisper-large-v3; do
  echo "== $m"; for f in note1.ogg note2.ogg note3.ogg; do
    /usr/bin/time -f "%e s" curl -s -F file=@$f -F model=$m -F language=he \
      http://localhost:8000/v1/audio/transcriptions
  done
done
```

Record, per note: seconds per audio minute, and by ear how the proper nouns came out
(דפנה / חוקוק / כפר עזה / מונה / כופל / מאזן אנרגיה). The fine-tune is expected to win on the
Hebrew names; if it does not, set `WHISPER__MODEL` to the base model and re-run the container —
the function passes whatever model name `chain.ts:SELF_MODEL` holds, so changing the default there
is a one-line code change plus a deploy.

---

## 5. Recordings and retention

- Bucket **`feedback-audio`** — private, 25 MB per object, audio mime types only
  (`db/feedback.sql`). Insert-only for the `authenticated` pass; nothing can read it from a
  browser.
- `transcribe` **deletes the object as soon as it has the text**. A FAILED transcription keeps it
  for the retry window (7 days), which is the only reason an object ever lingers.
- Storage has no TTL, so the sweep is manual (or a pg_cron job):

  ```sql
  delete from storage.objects
   where bucket_id = 'feedback-audio' and created_at < now() - interval '7 days';
  ```

- Every transcript is editable in the textarea before it is sent — the model is never the last word.
