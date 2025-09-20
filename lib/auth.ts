// lib/auth.ts
import { createSigner, createVerifier, type SignerSync, type VerifierSync } from 'fast-jwt';
import crypto from 'node:crypto';

export type SessionPayload = {
  session_id: string;
  sub?: string;
};

let _signer: SignerSync | null = null;
let _verifier: VerifierSync | null = null;

function getSecret(): string {
  const s = process.env.JWT_SECRET;
  if (!s) {
    // 빌드 시에는 호출되지 않으면 통과. 호출 시에만 에러를 던지도록.
    throw new Error('JWT_SECRET is not set');
  }
  return s;
}
function signer(): SignerSync {
  if (!_signer) _signer = createSigner({ key: getSecret(), expiresIn: '7d' });
  return _signer;
}
function verifier(): VerifierSync {
  if (!_verifier) _verifier = createVerifier({ key: getSecret() });
  return _verifier;
}

export function signToken(payload: SessionPayload) {
  return signer()(payload);
}

export function verifyToken(token?: string | null): SessionPayload | null {
  if (!token) return null;
  try {
    return verifier()(token) as SessionPayload;
  } catch {
    return null;
  }
}

/** 서버에서 PIN 해시 만들 때 사용 (digest(SALT || PIN)) */
export function hashPin(pin: string) {
  const salt = process.env.PIN_SALT ?? '';
  return crypto.createHash('sha256').update(salt + pin).digest('hex');
}

// 과거 import { verify } 호환
export { verifyToken as verify };
