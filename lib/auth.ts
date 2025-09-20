// lib/auth.ts
import { createSigner, createVerifier } from 'fast-jwt';
import crypto from 'node:crypto';

export type SessionPayload = { session_id: string; sub?: string };

let _signer: ReturnType<typeof createSigner> | null = null;
let _verifier: ReturnType<typeof createVerifier> | null = null;

function getSecret(): string {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error('JWT_SECRET is not set');
  return s;
}
function signer() {
  if (!_signer) _signer = createSigner({ key: getSecret(), expiresIn: '7d' });
  return _signer!;
}
function verifier() {
  if (!_verifier) _verifier = createVerifier({ key: getSecret() });
  return _verifier!;
}

// ✅ 항상 Promise<string>을 반환하도록
export async function signToken(payload: SessionPayload): Promise<string> {
  const maybe = signer()(payload);
  return await Promise.resolve(maybe as any);
}

export function verifyToken(token?: string | null): SessionPayload | null {
  if (!token) return null;
  try {
    return verifier()(token) as SessionPayload;
  } catch {
    return null;
  }
}

export function hashPin(pin: string) {
  const salt = process.env.PIN_SALT ?? '';
  return crypto.createHash('sha256').update(salt + pin).digest('hex');
}

// 과거 호환
export { verifyToken as verify };
