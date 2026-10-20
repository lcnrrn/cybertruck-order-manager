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

/** true = 이 앱이 옛 버전 (쓰기 금지). 새 버전을 받아 한 번 새로고침함 */
export async function checkOutdated(): Promise<boolean> {
  if (BUILD_ID === 'dev') return false;
  const latest = await fetchLatestBuild();
  if (!latest || latest === BUILD_ID) return false;
  if (latest < BUILD_ID) return false; // 캐시된 옛 version.json — 내가 더 새것
  try {
    const regs = (await navigator.serviceWorker?.getRegistrations?.()) || [];
    await Promise.all(regs.map((r) => r.update().catch(() => undefined)));
  } catch {
    /* ignore */
  }
  let already = false;
  try {
    already = sessionStorage.getItem(RELOAD_KEY) === latest;
    sessionStorage.setItem(RELOAD_KEY, latest);
  } catch {
    /* ignore */
  }
  if (!already) {
    window.setTimeout(() => window.location.reload(), 800);
  }
  return true;
}
