// lib/route15.ts
import { cookies } from 'next/headers';

// Next 15: route context.params는 Promise
export type ParamCtx<K extends string = 'id'> = { params: Promise<Record<K, string>> };

// 안전한 토큰 추출 (cookies가 환경에 따라 Promise인 케이스 가림)
export async function getToken(name = 's_token') {
  const jar = await cookies();
  return jar.get(name)?.value ?? null;
}

// 안전한 파라미터 추출
export async function getParam<K extends string = 'id'>(ctx: ParamCtx<K>, key: K) {
  const p = await ctx.params;
  return p[key];
}
