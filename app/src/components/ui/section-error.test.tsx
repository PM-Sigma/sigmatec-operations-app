// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { SectionError } from './section-error';

describe('SectionError', () => {
  // vitest runs without `globals: true` here, so RTL's auto-cleanup never registers itself —
  // without this a previous test's render stays in the document (same fix Usage.test.tsx notes).
  afterEach(cleanup);

  it('renders the text on an alert role', () => {
    render(<SectionError text="לא הצלחנו לטעון את השעות." />);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('לא הצלחנו לטעון את השעות.');
  });

  it('calls onRetry when the retry bubble is tapped', async () => {
    const onRetry = vi.fn();
    render(<SectionError text="שגיאה" onRetry={onRetry} />);
    fireEvent.click(screen.getByRole('button', { name: 'ניסיון נוסף' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('has no retry bubble when onRetry is omitted', () => {
    render(<SectionError text="שגיאה" />);
    expect(screen.queryByRole('button', { name: 'ניסיון נוסף' })).not.toBeInTheDocument();
  });
});
