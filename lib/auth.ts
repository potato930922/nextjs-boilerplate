import { createSigner, createVerifier } from 'fast-jwt';
import crypto from 'crypto';

const secret = process.env.SESSION_JWT_SECRET!;
const pinSalt = process.env.PIN_SALT!;

export const sign = createSigner({ key: secret, expiresIn: '7d' });
export const verify = createVerifier({ key: secret });

export function hashPin(pin: string) {
  return crypto.createHash('sha256').update(pinSalt + pin).digest('hex');
}
