// 🔔 the push-permission prompt — pure copy per mode (round 5, L6). The actual permission
// request, subscribe and the legacy DOM fallback stay in `js/src/22-push.js`
// (`sigmaPushEnable`, `showEnablePrompt`); this file only decides what the sheet says.
export type PushPromptMode = 'default' | 'denied';

export interface PushPromptCopy {
  title: string;
  body: string;
  primary: string;
  secondary: string;
}

export function promptCopy(mode: PushPromptMode): PushPromptCopy {
  return {
    title: 'התראות כבויות',
    body: mode === 'denied'
      ? 'ההתראות חסומות במכשיר הזה. אפשר להפעיל אותן בהגדרות האתר בדפדפן, ואז לרענן.'
      : 'כדי לקבל עדכונים על הזמנות ונוכחות צריך לאפשר התראות במכשיר הזה.',
    primary: mode === 'denied' ? 'רענון' : 'הפעלת התראות',
    secondary: 'לא עכשיו',
  };
}
