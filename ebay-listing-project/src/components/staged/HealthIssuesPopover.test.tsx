import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import HealthIssuesPopover from './HealthIssuesPopover';

describe('HealthIssuesPopover', () => {
  it('renders nothing when open=false', () => {
    render(
      <HealthIssuesPopover open={false} score={60} issues={['bad title']} color="#f00" onDismiss={() => {}} />,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('renders nothing when issues is empty even if open=true', () => {
    render(
      <HealthIssuesPopover open={true} score={100} issues={[]} color="#0f0" onDismiss={() => {}} />,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('renders score header + every issue when open', () => {
    render(
      <HealthIssuesPopover open={true} score={45} issues={['no images', 'no description']} color="#f00" onDismiss={() => {}} />,
    );
    expect(screen.getByText(/Health: 45\/100 — 2 issues/)).toBeInTheDocument();
    expect(screen.getByText(/no images/)).toBeInTheDocument();
    expect(screen.getByText(/no description/)).toBeInTheDocument();
  });

  it('fires onDismiss when the backdrop is clicked but not when the panel is clicked', () => {
    const onDismiss = vi.fn();
    render(
      <HealthIssuesPopover open={true} score={60} issues={['x']} color="#f00" onDismiss={onDismiss} />,
    );
    // Clicking inside the dialog should NOT dismiss.
    fireEvent.click(screen.getByRole('dialog'));
    expect(onDismiss).not.toHaveBeenCalled();
    // Clicking the surrounding backdrop layer DOES dismiss.
    const backdrop = screen.getByRole('presentation');
    fireEvent.click(backdrop);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('fires onDismiss on Escape', () => {
    const onDismiss = vi.fn();
    render(
      <HealthIssuesPopover open={true} score={60} issues={['x']} color="#f00" onDismiss={onDismiss} />,
    );
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('uses singular vs plural "issue" depending on count', () => {
    const { rerender } = render(
      <HealthIssuesPopover open={true} score={70} issues={['only one']} color="#f0f" onDismiss={() => {}} />,
    );
    expect(screen.getByText(/1 issue\b/)).toBeInTheDocument();
    rerender(
      <HealthIssuesPopover open={true} score={70} issues={['a', 'b', 'c']} color="#f0f" onDismiss={() => {}} />,
    );
    expect(screen.getByText(/3 issues/)).toBeInTheDocument();
  });
});
