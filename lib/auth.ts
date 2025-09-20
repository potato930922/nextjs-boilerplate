// lib/auth.ts
import { createSigner, createVerifier } from 'fast-jwt';
import { createHash } from 'crypto';
export { verifyToken as verify };

const JWT_SECRET = process.env.JWT_SECRET!;
if (!JWT_SECRET) throw new Error('Missing env JWT_SECRET');

export const sign = createSigner({
  key: JWT_SECRET,
  expiresIn: '7d',
});

const _verify = createVerifier({ key: JWT_SECRET }); // 동기
export function verifyToken(token?: string | null) {
  if (!token) return null;
  try {
    return _verify(token) as { session_id: string };
  } catch {
    return null;
  }
}

export function hashPin(pin: string) {
  const salt = process.env.PIN_SALT || '';
  return createHash('sha256').update(salt + pin).digest('hex');
}
