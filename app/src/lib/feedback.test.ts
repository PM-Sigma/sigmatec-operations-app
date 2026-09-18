import { describe, it, expect } from 'vitest';
import {
  FEEDBACK_MIN, KIND_LABEL, KIND_PUSH_TITLE, LIVE_NO_RESULT_MS, RECORD_CAP_MS,
  canSeeFeedbackInbox, canSubmitFeedback, feedbackPreview, feedbackRow, feedbackValidate,
  issueBody, issueTitle, speechLadder, type FeedbackKind,
} from './feedback';

describe('feedbackValidate', () => {
  it('accepts a real idea', () => {
    expect(feedbackValidate({ kind: 'idea', text: 'כפתור "כמו בביקור האחרון" בסיכום ביקור' })).toEqual([]);
  });

  it('rejects text shorter than the minimum, after trimming', () => {
    expect(feedbackValidate({ kind: 'idea', text: '   ' })).toEqual(['כתוב או הקלט משהו']);
    expect(feedbackValidate({ kind: 'bug', text: ' אב ' })).toEqual(['כתוב או הקלט משהו']);
    expect(FEEDBACK_MIN).toBe(3);
  });

  it('accepts exactly the minimum length', () => {
    expect(feedbackValidate({ kind: 'bug', text: 'באג!' })).toEqual([]);
  });

  it('rejects an unknown kind', () => {
    expect(feedbackValidate({ kind: 'praise', text: 'נהדר, עובד מצוין' })).toEqual(['בחר סוג: רעיון / באג']);
  });

  it('reports both errors at once', () => {
    expect(feedbackValidate({ kind: '', text: '' })).toEqual([
      'בחר סוג: רעיון / באג',
      'כתוב או הקלט משהו',
    ]);
  });

  it('knows the two kinds and their Hebrew labels (עידן ruling, 18.9: no complaint)', () => {
    expect(Object.keys(KIND_LABEL)).toEqual(['idea', 'bug']);
    expect(KIND_LABEL.bug).toBe('🐞 באג / שיפור');
    expect(KIND_PUSH_TITLE).toEqual({
      idea: '💡 רעיון חדש', bug: '🐞 באג / שיפור חדש',
    });
  });
});

describe('feedbackPreview', () => {
  const long =
    'כשאני פותח סיכום ביקור בשטח, רשימת הפריטים שהוצאתי מהמלאי לא זוכרת מה סימנתי בביקור הקודם באותו קיבוץ, וזה מבזבז לי המון זמן';

  it('returns short text untouched', () => {
    expect(feedbackPreview('המונה בדפנה לא מסונכרן')).toBe('המונה בדפנה לא מסונכרן');
  });

  it('never returns more than 80 characters', () => {
    expect(feedbackPreview(long).length).toBeLessThanOrEqual(80);
  });

  it('cuts on a word boundary, never mid-word', () => {
    const out = feedbackPreview(long);
    expect(out.endsWith('…')).toBe(true);
    const words = out.replace(/…$/, '').trimEnd();
    // every word in the preview is a whole word of the source
    expect(long.startsWith(words)).toBe(true);
    expect(long[words.length] === ' ' || words.length === long.length).toBe(true);
  });

  it('collapses newlines and runs of whitespace into single spaces', () => {
    expect(feedbackPreview('שורה ראשונה\n\nשורה   שנייה')).toBe('שורה ראשונה שורה שנייה');
  });

  it('falls back to a hard cut when there is no space to cut on', () => {
    const wall = 'א'.repeat(200);
    const out = feedbackPreview(wall);
    expect(out.length).toBe(80);
    expect(out.endsWith('…')).toBe(true);
  });

  it('honours a custom max', () => {
    expect(feedbackPreview(long, 20).length).toBeLessThanOrEqual(20);
  });

  it('is empty for empty input', () => {
    expect(feedbackPreview('   ')).toBe('');
  });
});

describe('feedbackRow', () => {
  it('builds the insert payload with the author', () => {
    expect(feedbackRow({ kind: 'idea', text: '  רעיון טוב  ', anon: false, user: 'ניתאי' })).toEqual({
      author: 'ניתאי', kind: 'idea', text: 'רעיון טוב', audio_path: null, status: 'new',
    });
  });

  it('drops the author when anonymous', () => {
    expect(feedbackRow({ kind: 'bug', text: 'לא נוח', anon: true, user: 'ניתאי' }).author).toBe(null);
  });

  it('has a null author when there is no user at all', () => {
    expect(feedbackRow({ kind: 'bug', text: 'נפל', anon: false, user: '' }).author).toBe(null);
  });

  it('keeps the audio path when the text came from a recording', () => {
    expect(feedbackRow({ kind: 'bug', text: 'נפל', anon: false, user: 'עידן', audioPath: 'a/b.webm' }).audio_path)
      .toBe('a/b.webm');
  });
});

describe('role matrix', () => {
  it('lets every role submit feedback — the viewer included', () => {
    expect(canSubmitFeedback('idan')).toBe(true);
    expect(canSubmitFeedback('team')).toBe(true);
    expect(canSubmitFeedback('viewer')).toBe(true);
  });

  it('does not offer the box before anyone is logged in', () => {
    expect(canSubmitFeedback('')).toBe(false);
  });

  it('opens the inbox to admins only', () => {
    expect(canSeeFeedbackInbox(true, false)).toBe(true);
    expect(canSeeFeedbackInbox(false, false)).toBe(false);
  });

  it('never opens the inbox to a viewer, even one the bridge calls admin', () => {
    expect(canSeeFeedbackInbox(true, true)).toBe(false);
  });
});

describe('issueTitle — Git Ticket System rules', () => {
  it('is [מודול] | [תת-תחום] | [תיאור] taken from the chosen parent', () => {
    expect(issueTitle('bug', 'ההתראות לא נשלחות בשבת', 'התראות | הגדרות וסינון')).toBe(
      'התראות | הגדרות וסינון | ההתראות לא נשלחות בשבת',
    );
  });

  it('strips a leading issue number from the parent title', () => {
    expect(issueTitle('bug', 'נפל', '#104 התראות | הגדרות וסינון')).toBe('התראות | הגדרות וסינון | נפל');
  });

  it('uses the kind as the sub-field when the parent has only a module', () => {
    expect(issueTitle('idea', 'כפתור כמו בביקור האחרון', 'ביקורים')).toBe('ביקורים | רעיון | כפתור כמו בביקור האחרון');
    expect(issueTitle('bug', 'איטי', 'מלאי')).toBe('מלאי | באג | איטי');
  });

  it('falls back to the app module when no parent was picked', () => {
    expect(issueTitle('bug', 'נפל')).toBe('אפליקציית תפעול | באג | נפל');
  });

  it('uses only the first line of the feedback and never a newline', () => {
    const t = issueTitle('bug', 'הכפתור לא מגיב\nוגם ההתראה לא נשלחה', 'התראות | הגדרות וסינון');
    expect(t).toBe('התראות | הגדרות וסינון | הכפתור לא מגיב');
    expect(t).not.toContain('\n');
  });

  it('clips a very long description on a word boundary', () => {
    const long = 'מילה '.repeat(40);
    const t = issueTitle('idea', long, 'ביקורים');
    expect(t.length).toBeLessThanOrEqual(120);
    expect(t.endsWith('…')).toBe(true);
  });
});

describe('issueBody', () => {
  it('carries the full text, the author and the date', () => {
    const b = issueBody({ kind: 'bug', text: 'שורה 1\nשורה 2', author: 'אביאם', createdAt: '2026-09-18T07:05:00Z' });
    expect(b).toContain('שורה 1\nשורה 2');
    expect(b).toContain('אביאם');
    expect(b).toContain('18.9.26');
    expect(b).toContain('🐞 באג / שיפור');
  });

  it('says אנונימי when there is no author', () => {
    expect(issueBody({ kind: 'idea', text: 'רעיון', author: null, createdAt: '2026-09-18T07:05:00Z' }))
      .toContain('אנונימי');
  });
});

describe('speechLadder', () => {
  const full = { speechRecognition: true, mediaRecorder: true };

  it('uses the live Web Speech path when it is supported', () => {
    expect(speechLadder({ phase: 'idle' }, full)).toBe('live');
  });

  it('records + transcribes when Web Speech is unsupported (iOS Safari PWA)', () => {
    expect(speechLadder({ phase: 'idle' }, { speechRecognition: false, mediaRecorder: true })).toBe('record');
  });

  it('records when the live recognition was denied or failed — not platform detection', () => {
    expect(speechLadder({ phase: 'idle', deniedLive: true }, full)).toBe('record');
    expect(speechLadder({ phase: 'idle', liveFailed: true }, full)).toBe('record');
  });

  it('falls back after 3 s of listening with no result (Android weak signal)', () => {
    expect(speechLadder({ phase: 'listening', liveResults: 0, msSinceStart: 2999 }, full)).toBe('live');
    expect(speechLadder({ phase: 'listening', liveResults: 0, msSinceStart: 3000 }, full)).toBe('record');
    expect(LIVE_NO_RESULT_MS).toBe(3000);
  });

  it('stays live once a result arrived, however long it listens', () => {
    expect(speechLadder({ phase: 'listening', liveResults: 1, msSinceStart: 60_000 }, full)).toBe('live');
  });

  it('honours the ?speech=0 override and goes straight to recording', () => {
    expect(speechLadder({ phase: 'idle' }, { ...full, forceOffLive: true })).toBe('record');
  });

  it('has no voice path at all when neither API exists', () => {
    expect(speechLadder({ phase: 'idle' }, { speechRecognition: false, mediaRecorder: false })).toBe('none');
    expect(speechLadder({ phase: 'idle', deniedLive: true }, { speechRecognition: true, mediaRecorder: false }))
      .toBe('none');
  });

  it('caps a recording at 3 minutes', () => {
    expect(RECORD_CAP_MS).toBe(180_000);
  });
});

describe('kinds are exhaustive', () => {
  it('every kind has a label, a push title and a sub-field', () => {
    const kinds: FeedbackKind[] = ['idea', 'bug'];
    for (const k of kinds) {
      expect(KIND_LABEL[k]).toBeTruthy();
      expect(KIND_PUSH_TITLE[k]).toBeTruthy();
      expect(issueTitle(k, 'טקסט')).toContain('|');
    }
  });
});
