import { describe, it, expect } from 'vitest';
import { useRef } from 'react';
import { render, fireEvent, act } from '@testing-library/react';
import { useFocusTrap } from './useFocusTrap';

function Modal({ enabled = true }: { enabled?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref, enabled);
  return (
    <div ref={ref} data-testid="modal">
      <button data-testid="first">First</button>
      <input data-testid="middle" />
      <button data-testid="last">Last</button>
    </div>
  );
}

describe('useFocusTrap', () => {
  it('focuses the first focusable element on mount', () => {
    render(<Modal />);
    expect(document.activeElement?.getAttribute('data-testid')).toBe('first');
  });

  it('wraps Tab from the last element back to the first', () => {
    const { getByTestId } = render(<Modal />);
    const last = getByTestId('last');
    act(() => { last.focus(); });
    expect(document.activeElement).toBe(last);
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement?.getAttribute('data-testid')).toBe('first');
  });

  it('wraps Shift+Tab from the first element back to the last', () => {
    const { getByTestId } = render(<Modal />);
    const first = getByTestId('first');
    act(() => { first.focus(); });
    expect(document.activeElement).toBe(first);
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(document.activeElement?.getAttribute('data-testid')).toBe('last');
  });

  it('does not interfere with other keys', () => {
    const { getByTestId } = render(<Modal />);
    const middle = getByTestId('middle');
    act(() => { middle.focus(); });
    fireEvent.keyDown(document, { key: 'Enter' });
    expect(document.activeElement).toBe(middle);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(document.activeElement).toBe(middle);
  });

  it('does not run while disabled', () => {
    // Pre-focus a body-level button to confirm initial focus isn't moved.
    const outside = document.createElement('button');
    outside.textContent = 'outside';
    document.body.appendChild(outside);
    outside.focus();
    render(<Modal enabled={false} />);
    expect(document.activeElement).toBe(outside);
    document.body.removeChild(outside);
  });

  it('restores focus to the element that was focused before the modal opened', () => {
    const outside = document.createElement('button');
    outside.textContent = 'outside';
    document.body.appendChild(outside);
    outside.focus();
    const { unmount } = render(<Modal />);
    // Focus moved into the modal.
    expect(document.activeElement?.getAttribute('data-testid')).toBe('first');
    unmount();
    expect(document.activeElement).toBe(outside);
    document.body.removeChild(outside);
  });
});
