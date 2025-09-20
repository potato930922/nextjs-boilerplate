// lib/auth.ts
import { createSigner, createVerifier } from 'fast-jwt';
import crypto from 'node:crypto';

export type SessionPayload = {
  session_id: string;
  sub?: string;
};

// fast-jwt가 sync/async 둘 다 가능한 형태라, 안전하게 넓은 타입으로 정의
type SignerFn = (payload: any) => string | Promise<string>;
type VerifierFn = (token: string) => any;

let _signer: SignerFn | null = null;
let _verifier: VerifierFn | null = null;

function getSecret(): string {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error('JWT_SECRET is not set');
  return s;
}

function signer(): SignerFn {
  if (!_signer) {
    // key는 문자열(비밀키)로, 만료 7일
    _signer = createSigner({ key: getSecret(), expiresIn: '7d' }) as unknown as SignerFn;
  }
  return _signer!;
}

function verifier(): VerifierFn {
  if (!_verifier) {
    _verifier = createVerifier({ key: getSecret() }) as unknown as VerifierFn;
  }
  return _verifier!;
}

// 항상 Promise<string>을 반환하도록 표준화
export async function signToken(payload: SessionPayload): Promise<string> {
  const out = signer()(payload);
  return Promise.resolve(out as any);
}

export function verifyToken(token?: string | null): SessionPayload | null {
  if (!token) return null;
  try {
    const out = verifier()(token);
    return out as SessionPayload;
  } catch {
    return null;
  }
}

// PIN 해시 (서버 전용)
export function hashPin(pin: string) {
  const salt = process.env.PIN_SALT ?? '';
  return crypto.createHash('sha256').update(salt + pin).digest('hex');
}

// 과거 호환(import { verify } ...)
export { verifyToken as verify };
