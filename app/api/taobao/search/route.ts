import { NextRequest, NextResponse } from 'next/server';

type Mode = 'low' | 'alt';
type Item = {
  img_url: string;
  promo_price: number | null;
  price: number | null;
  sales: string | null;
  seller: string | null;
  detail_url: string;
};

// RapidAPI 엔드포인트
const URL_LOW = 'https://taobao-advanced.p.rapidapi.com/item_image_search'; // 저지연
const URL_ALT = 'https://taobao-advanced.p.rapidapi.com/api';               // 일반(내부에 api=item_image_search 파라미터)

const HOST = 'taobao-advanced.p.rapidapi.com';

// 환경변수(Ver cel → Project → Settings → Environment Variables 에 설정)
const KEY_LOW = process.env.RAPIDAPI_TAOBAO_KEY_LOW || ''; // 저지연 키
const KEY_ALT = process.env.RAPIDAPI_TAOBAO_KEY_ALT || ''; // 일반 키

// 스키마 없는 url 보정 + 필요 referer 헤더 판단
const https = (u: string) => (u?.startsWith('//') ? `https:${u}` : u || '');
const referer = (u: string) =>
  u.includes('tmall') ? 'https://detail.tmall.com/' : 'https://item.taobao.com/';

// RapidAPI 호출 공통
async function callRapidAPI(img: string, mode: Mode) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 15_000);

  try {
    if (mode === 'low') {
      if (!KEY_LOW) throw new Error('no_low_key');
      const res = await fetch(`${URL_LOW}?img=${encodeURIComponent(img)}`, {
        method: 'GET',
        headers: {
          'x-rapidapi-key': KEY_LOW,
          'x-rapidapi-host': HOST,
        },
        signal: controller.signal,
        cache: 'no-store',
      });
      return res;
    } else {
      if (!KEY_ALT) throw new Error('no_alt_key');
      const url = `${URL_ALT}?api=item_image_search&img=${encodeURIComponent(img)}`;
      const res = await fetch(url, {
        method: 'GET',
        headers: {
          'x-rapidapi-key': KEY_ALT,
          'x-rapidapi-host': HOST,
        },
        signal: controller.signal,
        cache: 'no-store',
      });
      return res;
    }
  } finally {
    clearTimeout(t);
  }
}

// 응답 → 공통 item 배열로 맵핑
function parseItems(json: any): Item[] {
  // 두 엔드포인트가 서로 다른 위치에 담아줄 수 있어서 둘 다 조회
  const list = json?.result?.item ?? json?.data ?? [];
  const toF = (v: any) =>
    v === null || v === undefined || v === '' || v === 'null' ? null : Number(v);

  const items: Item[] = (Array.isArray(list) ? list : []).slice(0, 8).map((i: any) => ({
    img_url: https(i?.pic ?? ''),
    promo_price: toF(i?.promotion_price),
    price: toF(i?.price),
    sales: i?.sales ?? null,
    seller: i?.seller_nick ?? null,
    detail_url: https(i?.detail_url ?? ''),
  }));

  // 8개 미만이면 빈 슬롯 채우기
  while (items.length < 8) {
    items.push({
      img_url: '',
      promo_price: null,
      price: null,
      sales: null,
      seller: null,
      detail_url: '',
    });
  }
  return items;
}

// 간단 재시도(429, 5xx)
async function fetchWithRetry(img: string, mode: Mode, max = 2) {
  let lastErr: any = null;
  for (let n = 0; n <= max; n++) {
    try {
      const res = await callRapidAPI(img, mode);
      if (!res.ok) {
        // Quota 초과, 미구독 등 메시지를 그대로 넘기기
        const text = await res.text();
        // console.error('[taobao] bad status', res.status, text);
        return { ok: false, status: res.status, error: text || 'bad_status' };
      }
      const json = await res.json();
      const items = parseItems(json);
      return { ok: true, items };
    } catch (e: any) {
      lastErr = e?.name === 'AbortError' ? 'timeout' : (e?.message || 'fetch_failed');
      // 1회 대기 후 재시도
      await new Promise(r => setTimeout(r, 350));
    }
  }
  return { ok: false, error: lastErr || 'fetch_failed' };
}

export async function POST(req: NextRequest) {
  try {
    const { img, mode = 'low' } = (await req.json()) as { img: string; mode?: Mode };

    if (!img) {
      return NextResponse.json({ ok: false, error: 'no_img' }, { status: 400 });
    }
    if (mode !== 'low' && mode !== 'alt') {
      return NextResponse.json({ ok: false, error: 'bad_mode' }, { status: 400 });
    }
    if (mode === 'low' && !KEY_LOW) {
      return NextResponse.json({ ok: false, error: 'no_low_key' }, { status: 500 });
    }
    if (mode === 'alt' && !KEY_ALT) {
      return NextResponse.json({ ok: false, error: 'no_alt_key' }, { status: 500 });
    }

    const imgUrl = https(img);

    // 이미지 요청 쪽에서 referer 를 쓰는 케이스 대비(썸네일 프록시는 여기서 처리하지 않고 클라이언트 <img>가 직접 받음)
    // 필요 시 여기서 프록시 라우트를 추가해도 됨.

    const out = await fetchWithRetry(imgUrl, mode);
    if (!out.ok) {
      return NextResponse.json({ ok: false, error: out.error, status: out['status'] ?? 500 }, { status: 502 });
    }
    return NextResponse.json({ ok: true, items: out.items }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? 'server_error' }, { status: 500 });
  }
}
