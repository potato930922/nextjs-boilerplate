// lib/auth.ts
import { createSigner, createVerifier } from 'fast-jwt';
import crypto from 'node:crypto';

export type SessionPayload = {
  session_id: string;
  sub?: string;
};

// 지연 초기화: 실제 호출 시에만 환경변수 체크
let _signer: ReturnType<typeof createSigner> | null = null;
let _verifier: ReturnType<typeof createVerifier> | null = null;

function getSecret(): string {
  const s = process.env.JWT_SECRET;
  if (!s) {
    // 빌드 단계에서 실행되지 않도록, 실제 호출 시에만 에러
    throw new Error('JWT_SECRET is not set');
  }
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

// 과거 코드 호환(import { verify } …)
export { verifyToken as verify };
