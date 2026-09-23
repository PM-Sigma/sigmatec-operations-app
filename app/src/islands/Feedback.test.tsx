// @vitest-environment jsdom
// Render goldens for the 📣 feedback sheet (spec §7 Part F): the send path (incl. anonymous),
// the voice ladder's fallback leg, and the role matrix — the viewer MAY submit. Written before
// the island was wired into main.tsx (TDD); the pure rules themselves live in
// app/src/lib/feedback.test.ts.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor, act } from '@testing-library/react';

afterEach(cleanup);

const { mockSigma, inserted, sonner, speech, caps } = vi.hoisted(() => ({
  mockSigma: { role: 'viewer', admin: false, getRole: () => '', isAdmin: () => false, isViewer: () => true },
  inserted: [] as any[],
  sonner: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
  speech: {
    startLive: vi.fn(),
    startRecording: vi.fn(),
    uploadAndTranscribe: vi.fn(),
    pollRefineStatus: vi.fn(),
  },
  caps: { speechRecognition: false, mediaRecorder: true, forceOffLive: false },
}));

vi.mock('@/bridge', () => ({
  sigma: {
    getRole: () => mockSigma.role,
    isAdmin: () => mockSigma.admin,
    isViewer: () => mockSigma.role === 'viewer',
  },
  useCurrentUser: () => ({ name: 'ניתאי', role: mockSigma.role, isViewer: mockSigma.role === 'viewer' }),
  useSigmaEvent: () => {},
  // The §7n gate asks the bridge whether the sign-in is live; in a unit test it is.
  useEmsConnected: () => true,
}));

vi.mock('sonner', () => ({ toast: sonner }));

vi.mock('@/lib/query', () => ({
  SigmaProviders: ({ children }: any) => children,
  queryClient: {},
}));

vi.mock('@/islands', () => ({ mount: vi.fn(() => true) }));

vi.mock('@/lib/supabase', () => ({
  SB_URL: 'https://sb.test', SB_ANON: 'anon',
  getSupabase: async () => ({
    from: () => ({
      insert: (row: any) => { inserted.push(row); return { select: () => ({ single: async () => ({ data: { id: 'f1' }, error: null }) }) }; },
    }),
  }),
  sbWrite: async (run: any) => {
    const res = await run((await (globalThis as any).__sbStub?.()) ?? {
      from: () => ({
        insert: (row: any) => { inserted.push(row); return { select: () => ({ single: async () => ({ data: { id: 'f1' }, error: null }) }) }; },
      }),
    });
    if (res?.error) throw res.error;
    return res?.data ?? null;
  },
}));

vi.mock('@/lib/speech', () => ({
  speechCaps: () => caps,
  startLive: speech.startLive,
  startRecording: speech.startRecording,
  uploadAndTranscribe: speech.uploadAndTranscribe,
  pollRefineStatus: speech.pollRefineStatus,
  buildWhisperPrompt: (kibbutz: string, names: string[]) => [kibbutz, ...names].filter(Boolean).join(', '),
}));

const { Feedback, openFeedback } = await import('./Feedback');

const type = (value: string) => {
  const box = screen.getByPlaceholderText('מה קרה / מה היה עוזר לך?') as HTMLTextAreaElement;
  fireEvent.change(box, { target: { value } });
  return box;
};

beforeEach(() => {
  inserted.length = 0;
  mockSigma.role = 'viewer';
  caps.speechRecognition = false;
  caps.mediaRecorder = true;
  caps.forceOffLive = false;
  // The localStorage draft (round 2, Package D item 1) must never leak between tests — a
  // draft left over from one test would auto-load into the NEXT test's empty sheet and quietly
  // change its dirty-state / starting text.
  try { window.localStorage.clear(); } catch { /* n/a in this env */ }
  for (const fn of Object.values(sonner)) (fn as any).mockClear();
  speech.startLive.mockReset();
  speech.startRecording.mockReset();
  speech.uploadAndTranscribe.mockReset();
  (globalThis as any).fetch = vi.fn(async () => new Response('{}', { status: 200 }));
});

describe('Feedback sheet — the role matrix', () => {
  it('opens for a viewer and sends (the viewer\'s one write surface)', async () => {
    render(<Feedback />);
    act(() => openFeedback());
    expect(await screen.findByText('📣 תיבת רעיונות ובאגים')).toBeTruthy();

    type('הרשימה לא זוכרת מה סימנתי בביקור הקודם');
    fireEvent.click(screen.getByText('שלח'));

    await waitFor(() => expect(inserted).toHaveLength(1));
    expect(inserted[0]).toMatchObject({ kind: 'idea', author: 'ניתאי', status: 'new' });
    expect(sonner.success).toHaveBeenCalled();
  });

  it('refuses to open before anyone is logged in', () => {
    mockSigma.role = '';
    render(<Feedback />);
    act(() => openFeedback());
    expect(screen.queryByText('📣 תיבת רעיונות ובאגים')).toBeNull();
    expect(sonner.error).toHaveBeenCalledWith('יש להתחבר כדי לשלוח');
  });
});

describe('Feedback sheet — the form', () => {
  it('sends the chosen kind', async () => {
    render(<Feedback />);
    act(() => openFeedback('bug'));
    type('הכפתור לא מגיב');
    fireEvent.click(screen.getByText('שלח'));
    await waitFor(() => expect(inserted[0]).toMatchObject({ kind: 'bug' }));
  });

  it('drops the author when the anonymous switch is on', async () => {
    render(<Feedback />);
    act(() => openFeedback());
    type('לא נוח לי לעבוד עם זה');
    fireEvent.click(screen.getByLabelText('שלח אנונימי'));
    fireEvent.click(screen.getByText('שלח'));
    await waitFor(() => expect(inserted).toHaveLength(1));
    expect(inserted[0].author).toBe(null);
  });

  it('refuses an empty box with the validator\'s own message and writes nothing', async () => {
    render(<Feedback />);
    act(() => openFeedback());
    fireEvent.click(screen.getByText('שלח'));
    await waitFor(() => expect(sonner.error).toHaveBeenCalledWith('כתוב או הקלט משהו'));
    expect(inserted).toHaveLength(0);
  });

  it('notifies the inbox owners through push-send, never with the author', async () => {
    render(<Feedback />);
    act(() => openFeedback('bug'));
    type('האפליקציה איטית בשטח');
    fireEvent.click(screen.getByLabelText('שלח אנונימי'));
    fireEvent.click(screen.getByText('שלח'));
    await waitFor(() => expect((globalThis as any).fetch).toHaveBeenCalled());
    const [url, init] = (globalThis as any).fetch.mock.calls[0];
    expect(url).toContain('/functions/v1/push-send');
    const sent = JSON.parse(init.body);
    expect(sent).toMatchObject({ mode: 'feedbackNew', kind: 'bug' });
    expect(sent.preview).toContain('האפליקציה איטית');
    expect(JSON.stringify(sent)).not.toContain('ניתאי');
  });
});

describe('Feedback sheet — the voice ladder', () => {
  it('records + transcribes where Web Speech is missing (iOS Safari PWA)', async () => {
    const stop = vi.fn(async () => ({ blob: new Blob(['x']), mime: 'audio/mp4', ms: 4000 }));
    speech.startRecording.mockResolvedValue({ stop, cancel: vi.fn() });
    speech.uploadAndTranscribe.mockResolvedValue({ text: 'תמלול מהשרת', engine: 'groq', ms: 900, path: 'a.m4a' });

    render(<Feedback />);
    act(() => openFeedback());
    fireEvent.click(screen.getByLabelText('הקלט'));

    await waitFor(() => expect(speech.startRecording).toHaveBeenCalled());
    expect(speech.startLive).not.toHaveBeenCalled();
    expect(await screen.findByText('מקליט…')).toBeTruthy();

    fireEvent.click(screen.getByLabelText('עצור הקלטה'));
    await waitFor(() => expect(speech.uploadAndTranscribe).toHaveBeenCalled());
    await waitFor(() =>
      expect((screen.getByPlaceholderText('מה קרה / מה היה עוזר לך?') as HTMLTextAreaElement).value)
        .toContain('תמלול מהשרת'));
  });

  it('keeps the audio path on the row so a failed transcription can be retried', async () => {
    speech.startRecording.mockResolvedValue({
      stop: async () => ({ blob: new Blob(['x']), mime: 'audio/webm', ms: 3000 }), cancel: vi.fn(),
    });
    speech.uploadAndTranscribe.mockResolvedValue({ text: 'הוקלט', engine: 'self', ms: 500, path: 'u1.webm' });

    render(<Feedback />);
    act(() => openFeedback('bug'));
    fireEvent.click(screen.getByLabelText('הקלט'));
    await waitFor(() => expect(speech.startRecording).toHaveBeenCalled());
    fireEvent.click(screen.getByLabelText('עצור הקלטה'));
    await waitFor(() => expect(speech.uploadAndTranscribe).toHaveBeenCalled());

    fireEvent.click(screen.getByText('שלח'));
    await waitFor(() => expect(inserted).toHaveLength(1));
    expect(inserted[0].audio_path).toBe('u1.webm');
  });

  it('uses the live path when Web Speech is there, and stops it on a second tap', async () => {
    caps.speechRecognition = true;
    const stop = vi.fn();
    speech.startLive.mockImplementation(() => ({ stop }));

    render(<Feedback />);
    act(() => openFeedback());
    fireEvent.click(screen.getByLabelText('הקלט'));
    await waitFor(() => expect(speech.startLive).toHaveBeenCalled());
    expect(await screen.findByText('מקליט ומתמלל…')).toBeTruthy();

    fireEvent.click(screen.getByLabelText('עצור הקלטה'));
    expect(stop).toHaveBeenCalled();
  });

  it('honours ?speech=0 by going straight to the recorder', async () => {
    caps.speechRecognition = true;
    caps.forceOffLive = true;
    speech.startRecording.mockResolvedValue({ stop: async () => null, cancel: vi.fn() });

    render(<Feedback />);
    act(() => openFeedback());
    fireEvent.click(screen.getByLabelText('הקלט'));
    await waitFor(() => expect(speech.startRecording).toHaveBeenCalled());
    expect(speech.startLive).not.toHaveBeenCalled();
  });

  it('falls back to the recorder when live recognition errors (denied mic)', async () => {
    caps.speechRecognition = true;
    speech.startRecording.mockResolvedValue({ stop: async () => null, cancel: vi.fn() });
    speech.startLive.mockImplementation((h: any) => {
      setTimeout(() => h.onError('denied', 'not-allowed'), 0);
      return { stop: vi.fn() };
    });

    render(<Feedback />);
    act(() => openFeedback());
    fireEvent.click(screen.getByLabelText('הקלט'));
    await waitFor(() => expect(speech.startRecording).toHaveBeenCalled());
  });

  // עידן 20.9: an unreachable transcription is not a failed recording. The recording is HELD,
  // one line says so, and the ↻ re-sends THAT blob — so there is exactly one retry on screen
  // (the machine's own "ההקלטה נכשלה" banner steps aside while a recording is held).
  it('holds the recording and shows one retry when the transcription is unavailable', async () => {
    const blob = new Blob(['x']);
    speech.startRecording.mockResolvedValue({
      stop: async () => ({ blob, mime: 'audio/webm', ms: 3000 }), cancel: vi.fn(),
    });
    speech.uploadAndTranscribe.mockRejectedValue(new Error('התמלול נכשל'));

    render(<Feedback />);
    act(() => openFeedback());
    fireEvent.click(screen.getByLabelText('הקלט'));
    await waitFor(() => expect(speech.startRecording).toHaveBeenCalled());
    fireEvent.click(screen.getByLabelText('עצור הקלטה'));

    expect(await screen.findByTestId('transcribe-retry')).toBeTruthy();
    expect(screen.getByText('התמלול לא זמין כרגע. נסה שוב מאוחר יותר')).toBeTruthy();
    expect(screen.queryByText('ההקלטה נכשלה')).toBeNull();
    expect(screen.getAllByText('נסה שוב')).toHaveLength(1);

    // The ↻ re-sends the SAME blob — that is the whole point of holding it.
    speech.uploadAndTranscribe.mockResolvedValue({ text: 'מה שנאמר', engine: 'self', ms: 10, path: 'p', refined: true });
    fireEvent.click(screen.getByTestId('transcribe-retry-btn'));
    await waitFor(() => expect(speech.uploadAndTranscribe).toHaveBeenCalledTimes(2));
    expect(speech.uploadAndTranscribe.mock.calls[1][0].blob).toBe(blob);
    await waitFor(() => expect(screen.queryByTestId('transcribe-retry')).toBeNull());
  });

  it('says so instead of failing silently when the browser has no voice path at all', async () => {
    caps.speechRecognition = false;
    caps.mediaRecorder = false;

    render(<Feedback />);
    act(() => openFeedback());
    fireEvent.click(screen.getByLabelText('הקלט'));
    expect(sonner.error).toHaveBeenCalledWith('הדפדפן הזה לא תומך בהקלטה. אפשר להקליד');
    expect(speech.startRecording).not.toHaveBeenCalled();
  });
});

// ───────────── fix round 1, finding #2 — at the component level ─────────────
describe('Feedback sheet — one microphone, always', () => {
  it('starts the recorder ONCE when live errors while the 3 s timer is still pending', async () => {
    vi.useFakeTimers();
    caps.speechRecognition = true;
    speech.startRecording.mockResolvedValue({ stop: async () => null, cancel: vi.fn() });
    speech.startLive.mockImplementation((h: any) => {
      setTimeout(() => h.onError('failed', 'network'), 100);   // dies well before the 3 s timer
      return { stop: vi.fn() };
    });

    render(<Feedback />);
    act(() => openFeedback());
    fireEvent.click(screen.getByLabelText('הקלט'));

    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });   // past LIVE_NO_RESULT_MS
    vi.useRealTimers();

    // The old code armed the timer and never cleared it on the error path: the error started a
    // recorder and the timer then started a SECOND one, orphaning the first stream.
    expect(speech.startRecording).toHaveBeenCalledTimes(1);
  });

  it('cancels the session of a recorder the user stopped while it was still starting', async () => {
    caps.speechRecognition = false;
    const cancel = vi.fn();
    let resolveStart: (v: any) => void = () => {};
    speech.startRecording.mockReturnValue(new Promise(res => { resolveStart = res; }));

    render(<Feedback />);
    act(() => openFeedback());
    fireEvent.click(screen.getByLabelText('הקלט'));          // the start is now pending
    fireEvent.click(screen.getByLabelText('עצור הקלטה'));    // stopped before it resolved

    await act(async () => { resolveStart({ stop: async () => null, cancel }); });

    expect(cancel).toHaveBeenCalled();                        // the stream is released at once
    expect(speech.uploadAndTranscribe).not.toHaveBeenCalled();
  });

  it('releases the microphone when the sheet closes mid-recording', async () => {
    caps.speechRecognition = false;
    const cancel = vi.fn();
    speech.startRecording.mockResolvedValue({ stop: async () => null, cancel });

    render(<Feedback />);
    act(() => openFeedback());
    fireEvent.click(screen.getByLabelText('הקלט'));
    await waitFor(() => expect(speech.startRecording).toHaveBeenCalled());

    fireEvent.keyDown(document, { key: 'Escape' });           // Radix closes the sheet
    await waitFor(() => expect(cancel).toHaveBeenCalled());
  });

  it('gives up on a microphone that never opens, and shows a retry', async () => {
    vi.useFakeTimers();
    caps.speechRecognition = false;
    const cancel = vi.fn();
    let resolveStart: (v: any) => void = () => {};
    speech.startRecording.mockReturnValue(new Promise(res => { resolveStart = res; }));

    render(<Feedback />);
    act(() => openFeedback());
    fireEvent.click(screen.getByLabelText('הקלט'));

    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });   // MIC_START_TIMEOUT_MS

    expect(sonner.error).toHaveBeenCalledWith('המיקרופון לא נפתח. נסה שוב או הקלד');
    expect(screen.getByText('ההקלטה נכשלה')).toBeTruthy();
    expect(screen.getByText('נסה שוב')).toBeTruthy();

    // and a session that lands after we gave up is released rather than left recording
    await act(async () => { resolveStart({ stop: async () => null, cancel }); });
    vi.useRealTimers();
    expect(cancel).toHaveBeenCalled();
  });

  it('does not fire the watchdog once the recorder actually started', async () => {
    vi.useFakeTimers();
    caps.speechRecognition = false;
    speech.startRecording.mockResolvedValue({ stop: async () => null, cancel: vi.fn() });

    render(<Feedback />);
    act(() => openFeedback());
    fireEvent.click(screen.getByLabelText('הקלט'));
    await act(async () => { await vi.advanceTimersByTimeAsync(15_000); });
    vi.useRealTimers();

    expect(screen.getByText('מקליט…')).toBeTruthy();          // still recording, not failed
    expect(sonner.error).not.toHaveBeenCalled();
  });
});

describe('the draft (round 2, Package D item 1)', () => {
  beforeEach(() => { window.localStorage.clear(); });

  it('does not crash on closing the sheet, and the draft comes back on reopen', async () => {
    vi.useFakeTimers();
    render(<Feedback />);
    act(() => openFeedback());
    type('לא לאבד את זה כשסוגרים');
    // Flush the 500 ms debounce that writes the draft to localStorage.
    await act(async () => { await vi.advanceTimersByTimeAsync(600); });

    // Close via the X — no confirmation is expected (the draft survives regardless), and this
    // must never throw (the reported crash). Sheet's close button is labelled "סגירה" (design
    // system round 5, spec 2026-09-23-design-system-design.md), not the old "Close".
    const closeBtn = screen.getByText('סגירה').closest('button')!;
    expect(() => fireEvent.click(closeBtn)).not.toThrow();
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    vi.useRealTimers();
    expect(screen.queryByText('📣 תיבת רעיונות ובאגים')).toBeNull();

    // A brand-new sheet instance (simulating a reload) reads the same localStorage draft back.
    cleanup();
    render(<Feedback />);
    act(() => openFeedback());
    expect((screen.getByPlaceholderText('מה קרה / מה היה עוזר לך?') as HTMLTextAreaElement).value)
      .toBe('לא לאבד את זה כשסוגרים');
  });

  it('a successful send clears the draft — nothing comes back on the next open', async () => {
    vi.useFakeTimers();
    mockSigma.role = 'viewer';
    render(<Feedback />);
    act(() => openFeedback());
    type('נשלח ולא אמור לחזור');
    await act(async () => { await vi.advanceTimersByTimeAsync(600); });
    expect(window.localStorage.getItem('sigma-feedback-draft')).toBeTruthy();

    fireEvent.click(screen.getByText('שלח'));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    vi.useRealTimers();
    await waitFor(() => expect(inserted).toHaveLength(1));
    expect(window.localStorage.getItem('sigma-feedback-draft')).toBeNull();

    cleanup();
    render(<Feedback />);
    act(() => openFeedback());
    expect((screen.getByPlaceholderText('מה קרה / מה היה עוזר לך?') as HTMLTextAreaElement).value).toBe('');
  });

  it('a real crash card prefill is never clobbered by a stale draft', async () => {
    window.localStorage.setItem('sigma-feedback-draft', JSON.stringify({
      kind: 'idea', text: 'טיוטה ישנה', anon: false, savedAt: '2026-01-01T00:00:00Z',
    }));
    render(<Feedback />);
    act(() => openFeedback('bug', 'שגיאה: X — דווח אוטומטי'));
    expect((screen.getByPlaceholderText('מה קרה / מה היה עוזר לך?') as HTMLTextAreaElement).value)
      .toBe('שגיאה: X — דווח אוטומטי');
  });

  it('a corrupt draft in localStorage is ignored, not thrown', async () => {
    window.localStorage.setItem('sigma-feedback-draft', '{not json');
    expect(() => { render(<Feedback />); act(() => openFeedback()); }).not.toThrow();
    expect((screen.getByPlaceholderText('מה קרה / מה היה עוזר לך?') as HTMLTextAreaElement).value).toBe('');
  });
});

describe('the voice UI (round 2, Package D item 2)', () => {
  it('shows ONE mic button labelled 🎤 דיבור לטקסט — no separate record affordance', () => {
    render(<Feedback />);
    act(() => openFeedback());
    expect(screen.getByText('🎤 דיבור לטקסט')).toBeTruthy();
    // The old always-on waveform is gone entirely.
    expect(document.querySelector('[aria-hidden] > i')).toBeNull();
  });
});

describe('the anonymous switch RTL thumb (round 2, Package D item 3)', () => {
  it('moves the thumb toward the START (left) when checked — not the LTR default direction', () => {
    render(<Feedback />);
    act(() => openFeedback());
    const sw = screen.getByRole('switch', { name: 'שלח אנונימי' });
    const thumb = sw.querySelector('span') as HTMLElement;
    expect(thumb.className).not.toMatch(/data-\[state=checked\]:translate-x-5(?!\])/);
    fireEvent.click(sw);
    expect(sw.getAttribute('data-state')).toBe('checked');
    expect(thumb.className).toContain('-translate-x-5');
  });
});
