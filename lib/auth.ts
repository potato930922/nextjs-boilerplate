// lib/auth.ts
import { createSigner, createVerifier } from 'fast-jwt';
import crypto from 'node:crypto';

const JWT_SECRET = process.env.JWT_SECRET!;
const sign = createSigner({ key: JWT_SECRET, expiresIn: '7d' });
const verify = createVerifier({ key: JWT_SECRET }); // 내부용

export type SessionPayload = {
  session_id: string;
  sub?: string; // 사용자 식별자(선택)
};

export function signToken(payload: SessionPayload) {
  return sign(payload);
}

export function verifyToken(token?: string | null): SessionPayload | null {
  if (!token) return null;
  try {
    return verify(token) as SessionPayload;
  } catch {
    return null;
  }
}

/** 서버에서 PIN 해시 만들 때 사용 (digest(SALT || PIN)) */
export function hashPin(pin: string) {
  const salt = process.env.PIN_SALT ?? '';
  return crypto.createHash('sha256').update(salt + pin).digest('hex');
}

/** 과거 코드 호환(혹시 남아있을 import { verify } 대비) */
export { verifyToken as verify };
