import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ControllerPasswordKeyboard from '@/components/game/ControllerPasswordKeyboard';

describe('ControllerPasswordKeyboard', () => {
  it('starts uppercase and SHIFT changes both the keys and entered letters to lowercase', () => {
    let password = '';
    const onPasswordChange = vi.fn((value: string) => { password = value; });
    const view = render(
      <ControllerPasswordKeyboard
        login
        password={password}
        confirmation=""
        busy={false}
        error=""
        onPasswordChange={onPasswordChange}
        onConfirmationChange={vi.fn()}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'A' })).toHaveTextContent('A');
    fireEvent.pointerDown(screen.getByRole('button', { name: 'SHIFT' }));
    expect(screen.getByRole('button', { name: 'A' })).toHaveTextContent('a');

    fireEvent.pointerDown(screen.getByRole('button', { name: 'A' }));
    expect(onPasswordChange).toHaveBeenLastCalledWith('a');

    view.rerender(
      <ControllerPasswordKeyboard
        login
        password="a"
        confirmation=""
        busy={false}
        error=""
        onPasswordChange={onPasswordChange}
        onConfirmationChange={vi.fn()}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByText('•')).toBeInTheDocument();
  });

  it('keeps 0 through 9 together before punctuation and enters both slashes', () => {
    const onPasswordChange = vi.fn();
    render(
      <ControllerPasswordKeyboard
        login
        password=""
        confirmation=""
        busy={false}
        error=""
        onPasswordChange={onPasswordChange}
        onConfirmationChange={vi.fn()}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    const labels = screen.getAllByRole('button').map((button) => button.getAttribute('aria-label'));
    expect(labels.indexOf('6')).toBe(labels.indexOf('5') + 1);
    expect(labels.indexOf('9')).toBeLessThan(labels.indexOf('!'));
    expect(labels.indexOf('/')).toBeGreaterThan(labels.indexOf('$'));
    expect(labels.indexOf('\\')).toBeGreaterThan(labels.indexOf('$'));

    fireEvent.pointerDown(screen.getByRole('button', { name: '/' }));
    expect(onPasswordChange).toHaveBeenLastCalledWith('/');
    fireEvent.pointerDown(screen.getByRole('button', { name: '\\' }));
    expect(onPasswordChange).toHaveBeenLastCalledWith('\\');
  });
});
