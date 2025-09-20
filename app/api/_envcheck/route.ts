export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';

export async function GET() {
  const env = process.env.VERCEL_ENV || 'unknown'; // 'production' | 'preview' | 'development'
  const hasJwt = !!(process.env.JWT_SECRET && process.env.JWT_SECRET.length);
  const hasSalt = !!(process.env.PIN_SALT && process.env.PIN_SALT.length);
  const hasSupabaseUrl = !!(process.env.SUPABASE_URL && process.env.SUPABASE_URL.length);
  const hasSupabaseKey = !!(process.env.SUPABASE_SERVICE_ROLE && process.env.SUPABASE_SERVICE_ROLE.length);

  return NextResponse.json({
    ok: true,
    vercelEnv: env,
    JWT_SECRET_present: hasJwt,
    PIN_SALT_present: hasSalt,
    SUPABASE_URL_present: hasSupabaseUrl,
    SUPABASE_SERVICE_ROLE_present: hasSupabaseKey,
  });
}
