/**
 * 빌드 버전 확인 — 예전 버전 앱(아이폰 홈 화면 앱이 옛 캐시로 뜬 경우)이 시트에 쓰지 못하게 막고 새로고침.
 * 배포마다 dist/version.json 에 빌드 id 가 들어감. 앱 안에는 같은 id 가 __BUILD_ID__ 로 박혀 있음.
 */
declare const __BUILD_ID__: string;
export const BUILD_ID: string = typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : 'dev';
const RELOAD_KEY = 'cybertruck-reloaded-for';

export async function fetchLatestBuild(): Promise<string | null> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return null;
    const j = (await res.json()) as { build?: unknown };
    return typeof j.build === 'string' ? j.build : null;
  } catch {
    return null; // 오프라인 등: 판단 불가 → 막지 않음
  }
}

export const UPDATE_EVENT = 'cybertruck-update-available';
let knownLatest: string | null = null;
export function latestBuild(): string | null {
  return knownLatest;
}

/** true = 이 앱이 옛 버전 (시트 쓰기 금지 = 읽기 전용). 새 버전 안내 배너를 띄움 */
export async function checkOutdated(): Promise<boolean> {
  if (BUILD_ID === 'dev') return false;
  const latest = await fetchLatestBuild();
  if (!latest || latest === BUILD_ID) return false;
  if (latest < BUILD_ID) return false; // 캐시된 옛 version.json — 내가 더 새것
  if (knownLatest !== latest) {
    knownLatest = latest;
    try {
      window.dispatchEvent(new CustomEvent(UPDATE_EVENT, { detail: latest }));
    } catch {
      /* ignore */
    }
  }
  return true;
}

/** 새 버전으로 바꾸기: 서비스워커 갱신 → 옛 캐시 화면 없이 새로 불러오기. 무한 새로고침 방지(같은 버전 2번까지) */
export async function applyUpdate(latest: string | null = knownLatest): Promise<boolean> {
  const key = latest || 'x';
  let tries = 0;
  try {
    tries = Number(sessionStorage.getItem(`${RELOAD_KEY}:${key}`)) || 0;
    sessionStorage.setItem(`${RELOAD_KEY}:${key}`, String(tries + 1));
  } catch {
    /* ignore */
  }
  if (tries >= 2) return false;
  try {
    const regs = (await navigator.serviceWorker?.getRegistrations?.()) || [];
    await Promise.all(
      regs.map(async (r) => {
        await r.update().catch(() => undefined);
        r.waiting?.postMessage({ type: 'SKIP_WAITING' });
      }),
    );
  } catch {
    /* ignore */
  }
  const url = `${import.meta.env.BASE_URL}?v=${encodeURIComponent(key)}`;
  window.location.replace(url);
  return true;
}
