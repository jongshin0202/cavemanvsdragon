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
});
