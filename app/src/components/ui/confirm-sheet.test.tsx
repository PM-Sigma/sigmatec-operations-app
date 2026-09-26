// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { ConfirmSheet } from './confirm-sheet';

describe('ConfirmSheet', () => {
  it('lists the given lines and the title', () => {
    render(
      <ConfirmSheet
        open
        title="למחוק את השורה?"
        lines={['09:00–11:30', 'קיבוץ דפנה']}
        confirmLabel="מחיקה"
        danger
        onConfirm={() => {}}
        onOpenChange={() => {}}
      />,
    );
    expect(screen.getByText('למחוק את השורה?')).toBeInTheDocument();
    expect(screen.getByText('09:00–11:30')).toBeInTheDocument();
    expect(screen.getByText('קיבוץ דפנה')).toBeInTheDocument();
  });

  it('calls onConfirm once even on a double tap (disabled while the promise runs)', async () => {
    let resolve!: () => void;
    const onConfirm = vi.fn(() => new Promise<void>(r => { resolve = r; }));
    render(
      <ConfirmSheet
        open
        title="אישור"
        confirmLabel="אישור"
        onConfirm={onConfirm}
        onOpenChange={() => {}}
      />,
    );
    const button = screen.getByRole('button', { name: 'אישור' });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    resolve();
    await waitFor(() => expect(button).not.toBeDisabled());
  });

  it('calls onOpenChange(false) from the cancel button', async () => {
    const onOpenChange = vi.fn();
    render(
      <ConfirmSheet
        open
        title="אישור"
        confirmLabel="אישור"
        onConfirm={() => {}}
        onOpenChange={onOpenChange}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'ביטול' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
