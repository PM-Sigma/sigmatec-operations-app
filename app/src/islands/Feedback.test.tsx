// @vitest-environment jsdom
// Render goldens for the 📣 feedback sheet (spec §7 Part F): the send path (incl. anonymous),
// the voice ladder's fallback leg, and the role matrix — the viewer MAY submit. Written before
// the island was wired into main.tsx (TDD); the pure rules themselves live in
// app/src/lib/feedback.test.ts.
import * as React from 'react';
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
    expect(await screen.findByText('📣 רעיון או תלונה')).toBeTruthy();

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
    expect(screen.queryByText('📣 רעיון או תלונה')).toBeNull();
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
    act(() => openFeedback('complaint'));
    type('האפליקציה איטית בשטח');
    fireEvent.click(screen.getByLabelText('שלח אנונימי'));
    fireEvent.click(screen.getByText('שלח'));
    await waitFor(() => expect((globalThis as any).fetch).toHaveBeenCalled());
    const [url, init] = (globalThis as any).fetch.mock.calls[0];
    expect(url).toContain('/functions/v1/push-send');
    const sent = JSON.parse(init.body);
    expect(sent).toMatchObject({ mode: 'feedbackNew', kind: 'complaint' });
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

  it('shows a retry when the transcription failed', async () => {
    speech.startRecording.mockResolvedValue({
      stop: async () => ({ blob: new Blob(['x']), mime: 'audio/webm', ms: 3000 }), cancel: vi.fn(),
    });
    speech.uploadAndTranscribe.mockRejectedValue(new Error('התמלול נכשל'));

    render(<Feedback />);
    act(() => openFeedback());
    fireEvent.click(screen.getByLabelText('הקלט'));
    await waitFor(() => expect(speech.startRecording).toHaveBeenCalled());
    fireEvent.click(screen.getByLabelText('עצור הקלטה'));
    expect(await screen.findByText('ההקלטה נכשלה')).toBeTruthy();
    expect(screen.getByText('נסה שוב')).toBeTruthy();
  });

  it('says so instead of failing silently when the browser has no voice path at all', async () => {
    caps.speechRecognition = false;
    caps.mediaRecorder = false;

    render(<Feedback />);
    act(() => openFeedback());
    fireEvent.click(screen.getByLabelText('הקלט'));
    expect(sonner.error).toHaveBeenCalledWith('הדפדפן הזה לא תומך בהקלטה — אפשר להקליד');
    expect(speech.startRecording).not.toHaveBeenCalled();
  });
});
