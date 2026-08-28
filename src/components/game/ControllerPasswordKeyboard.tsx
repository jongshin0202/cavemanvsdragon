import { useCallback, useEffect, useState } from 'react';

type Field = 'password' | 'confirmation';

interface ControllerPasswordKeyboardProps {
  login: boolean;
  password: string;
  confirmation: string;
  busy: boolean;
  error: string;
  onPasswordChange: (value: string) => void;
  onConfirmationChange: (value: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
}

const ROWS = [
  ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'],
  ['I', 'J', 'K', 'L', 'M', 'N', 'O', 'P'],
  ['Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X'],
  ['Y', 'Z', '0', '1', '2', '3', '4', '5'],
  ['!', '@', '#', '$', '%', '-', '_', '.'],
  ['6', '7', '8', '9', 'SHIFT', 'DEL'],
  ['CANCEL', 'NEXT', 'DONE'],
] as const;

const MAX_PASSWORD_LENGTH = 128;

export default function ControllerPasswordKeyboard({
  login,
  password,
  confirmation,
  busy,
  error,
  onPasswordChange,
  onConfirmationChange,
  onSubmit,
  onCancel,
}: ControllerPasswordKeyboardProps) {
  const [row, setRow] = useState(0);
  const [col, setCol] = useState(0);
  // Match the name-entry keyboard: start with capitals, then SHIFT toggles to
  // lowercase. The visible key labels always reflect what will be entered.
  const [shifted, setShifted] = useState(true);
  const [field, setField] = useState<Field>('password');

  const value = field === 'password' ? password : confirmation;
  const setValue = field === 'password' ? onPasswordChange : onConfirmationChange;

  const activate = useCallback((token: string) => {
    if (busy) return;
    if (token === 'SHIFT') {
      setShifted((current) => !current);
      return;
    }
    if (token === 'DEL') {
      setValue(value.slice(0, -1));
      return;
    }
    if (token === 'CANCEL') {
      onCancel();
      return;
    }
    if (token === 'NEXT') {
      if (login) onSubmit();
      else setField((current) => current === 'password' ? 'confirmation' : 'password');
      return;
    }
    if (token === 'DONE') {
      if (!login && field === 'password') setField('confirmation');
      else onSubmit();
      return;
    }
    if (value.length >= MAX_PASSWORD_LENGTH) return;
    const character = /^[A-Z]$/.test(token) && !shifted ? token.toLowerCase() : token;
    setValue(value + character);
  }, [busy, field, login, onCancel, onSubmit, setValue, shifted, value]);

  const move = useCallback((key: string) => {
    if (key === 'ArrowUp') {
      setRow((current) => {
        const next = (current - 1 + ROWS.length) % ROWS.length;
        setCol((currentCol) => Math.min(currentCol, ROWS[next].length - 1));
        return next;
      });
    } else if (key === 'ArrowDown') {
      setRow((current) => {
        const next = (current + 1) % ROWS.length;
        setCol((currentCol) => Math.min(currentCol, ROWS[next].length - 1));
        return next;
      });
    } else if (key === 'ArrowLeft') {
      setCol((current) => (current - 1 + ROWS[row].length) % ROWS[row].length);
    } else if (key === 'ArrowRight') {
      setCol((current) => (current + 1) % ROWS[row].length);
    }
  }, [row]);

  useEffect(() => {
    const onControllerKey = (event: Event) => {
      const detail = (event as CustomEvent<{ key?: string; down?: boolean }>).detail;
      if (!detail?.down || !detail.key) return;
      if (detail.key.startsWith('Arrow')) move(detail.key);
      else if (detail.key === ' ') activate(ROWS[row][col]);
      else if (detail.key === 'Start') {
        if (!login && field === 'password') setField('confirmation');
        else onSubmit();
      }
    };
    window.addEventListener('cvd-native-controller-key', onControllerKey);
    return () => window.removeEventListener('cvd-native-controller-key', onControllerKey);
  }, [activate, col, field, login, move, onSubmit, row]);

  const masked = value.length ? '•'.repeat(value.length) : '_';

  return (
    <div className="fixed inset-0 z-[70] flex flex-col overflow-y-auto bg-black px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-[max(0.5rem,env(safe-area-inset-top))] font-mono text-white">
      <div className="mx-auto mb-1 text-center text-sm font-bold text-accent">
        {login ? 'ENTER PASSWORD' : field === 'password' ? 'CREATE PASSWORD' : 'CONFIRM PASSWORD'}
      </div>
      <div className="mx-auto mb-1 min-h-9 w-full max-w-xl rounded border-2 border-white bg-neutral-900 px-2 py-1 text-center text-xl font-bold tracking-widest">
        {masked}
      </div>
      <div className="mb-1 text-center text-[10px]">D-PAD: MOVE &nbsp; A: SELECT &nbsp; START: NEXT / DONE</div>
      <div className={`mb-1 min-h-4 text-center text-[10px] font-bold text-red-400 ${error ? '' : 'invisible'}`} role="alert">
        {error || '_'}
      </div>
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-1">
        {ROWS.map((tokens, rowIndex) => (
          <div key={rowIndex} className="flex justify-center gap-1">
            {tokens.map((token, colIndex) => {
              const selected = row === rowIndex && col === colIndex;
              const label = token === 'DEL'
                ? '⌫'
                : token === 'SHIFT'
                  ? (shifted ? 'SHIFT' : 'shift')
                  : /^[A-Z]$/.test(token) && !shifted ? token.toLowerCase() : token;
              return (
                <button
                  key={token}
                  type="button"
                  aria-label={token}
                  onPointerDown={(event) => {
                    event.preventDefault();
                    setRow(rowIndex);
                    setCol(colIndex);
                    activate(token);
                  }}
                  className={`min-h-9 min-w-0 flex-1 rounded border-2 px-1 text-xs font-bold ${
                    selected ? 'scale-105 border-accent bg-white text-black' : 'border-neutral-500 bg-neutral-900 text-white'
                  } ${rowIndex === ROWS.length - 1 ? 'max-w-48' : ''}`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
