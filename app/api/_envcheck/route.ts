export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';

export async function GET() {
  const env = process.env.VERCEL_ENV || 'unknown';
  const hasJwt = !!process.env.JWT_SECRET;
  const hasSalt = !!process.env.PIN_SALT;
  const hasUrl = !!process.env.SUPABASE_URL;
  const hasKey = !!process.env.SUPABASE_SERVICE_ROLE;

  return NextResponse.json({
    ok: true,
    vercelEnv: env,
    JWT_SECRET_present: hasJwt,
    PIN_SALT_present: hasSalt,
    SUPABASE_URL_present: hasUrl,
    SUPABASE_SERVICE_ROLE_present: hasKey,
  });
}
