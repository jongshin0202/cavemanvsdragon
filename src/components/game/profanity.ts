// Lightweight profanity filter with leetspeak normalization.
// Self-contained (no dependency) so it ships in the APK too.
//
// Strategy:
//  1) Normalize candidate name: lowercase, strip non-alphanumerics, then
//     map common leet substitutions back to letters.
//  2) Check if any banned root appears as a substring of the normalized form.
//
// This catches: "shit", "Sh1t", "S H 1 T", "sh!t", "a55hole", "f*ck", etc.

const LEET_MAP: Record<string, string> = {
  '0': 'o',
  '1': 'i',
  '3': 'e',
  '4': 'a',
  '5': 's',
  '7': 't',
  '8': 'b',
  '9': 'g',
  '@': 'a',
  '$': 's',
  '!': 'i',
  '|': 'i',
  '+': 't',
};

// Common English profanity roots. Substring match after normalization.
// Keep roots short so variants ("fucking", "asshole") are caught.
const BANNED_ROOTS: string[] = [
  'fuck', 'fuk', 'phuck',
  'shit', 'sht',
  'bitch', 'biatch',
  'cunt', 'kunt',
  'dick', 'cock', 'kock',
  'pussy', 'pussi',
  'asshole', 'ahole',
  'bastard',
  'damn',
  'crap',
  'piss',
  'slut', 'whore', 'hoe',
  'fag', 'faggot',
  'nigger', 'nigga', 'niger',
  'retard', 'tard',
  'rape', 'rapist',
  'nazi', 'hitler',
  'porn', 'pron',
  'sex', 'sexy',
  'anal', 'anus',
  'penis', 'vagina', 'boob', 'tit',
  'jerk', 'jackass',
  'bullshit', 'bs',
  'douche',
  'twat',
  'wanker', 'wank',
  'arse',
  'bollock',
  'prick',
  'queer',
];

function normalize(input: string): string {
  const lower = input.toLowerCase();
  let out = '';
  for (const ch of lower) {
    const mapped = LEET_MAP[ch];
    if (mapped) {
      out += mapped;
    } else if (/[a-z0-9]/.test(ch)) {
      out += ch;
    }
    // anything else (spaces, punctuation) is dropped to defeat "s h i t" tricks
  }
  return out;
}

export function containsProfanity(name: string): boolean {
  if (!name) return false;
  const n = normalize(name);
  if (n.length === 0) return false;
  return BANNED_ROOTS.some((root) => n.includes(root));
}

// Allowed display characters for names: A-Z, a-z, 0-9, space.
export const NAME_ALLOWED_REGEX = /^[A-Za-z0-9 ]*$/;
export const NAME_MAX_LENGTH = 10;

export interface NameValidation {
  ok: boolean;
  error?: string;
}

export function validateName(raw: string): NameValidation {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return { ok: false, error: 'NAME REQUIRED' };
  if (trimmed.length > NAME_MAX_LENGTH) return { ok: false, error: `MAX ${NAME_MAX_LENGTH} CHARS` };
  if (!NAME_ALLOWED_REGEX.test(trimmed)) return { ok: false, error: 'LETTERS/NUMBERS ONLY' };
  if (containsProfanity(trimmed)) return { ok: false, error: 'NAME NOT ALLOWED' };
  return { ok: true };
}
