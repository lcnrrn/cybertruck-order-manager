import { useEffect, useState } from 'react';
import { SETTING_LS_KEYS, SETTINGS_APPLIED_EVENT, markSettingChanged } from './settingsMeta';

/**
 * 제품 사진 — 작은 썸네일(dataURL)을 설정 탭 'productImages' 행 하나에 {제품명: dataURL} 로 저장.
 * 구글 시트 셀 한 칸은 5만 자까지라서, 사진은 작게(기본 96px JPEG) 만들고 전체 크기를 제한함.
 */
const LS = SETTING_LS_KEYS.productImages;
export const IMAGES_CHANGED_EVENT = 'cybertruck-product-images-changed';
/** 셀 한 칸 한도(50,000자)보다 여유 있게 */
export const MAX_IMAGES_JSON = 44000;

export type ProductImages = Record<string, string>;

let cacheRaw: string | null = null;
let cacheVal: ProductImages = {};
export function loadProductImages(): ProductImages {
  try {
    const raw = localStorage.getItem(LS);
    if (!raw) return {};
    if (raw === cacheRaw) return cacheVal;
    const v = JSON.parse(raw) as unknown;
    if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
    const out: ProductImages = {};
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
      if (typeof x === 'string' && /^data:image\/(jpeg|png|webp);base64,/.test(x)) out[k] = x;
    }
    cacheRaw = raw;
    cacheVal = out;
    return out;
  } catch {
    return {};
  }
}

function save(next: ProductImages): void {
  localStorage.setItem(LS, JSON.stringify(next));
  markSettingChanged('productImages');
  try {
    window.dispatchEvent(new CustomEvent(IMAGES_CHANGED_EVENT));
  } catch {
    /* ignore */
  }
}

export function imagesSize(map: ProductImages): number {
  return JSON.stringify(map).length;
}

/** 저장. 너무 크면 false (아무것도 안 바꿈) */
export function setProductImage(name: string, dataUrl: string | null): boolean {
  const cur = loadProductImages();
  const next = { ...cur };
  if (dataUrl) next[name] = dataUrl;
  else delete next[name];
  if (imagesSize(next) > MAX_IMAGES_JSON) return false;
  try {
    save(next);
    return true;
  } catch {
    return false;
  }
}

export function renameProductImage(from: string, to: string): void {
  const cur = loadProductImages();
  if (!cur[from] || from === to) return;
  const next = { ...cur, [to]: cur[from] };
  delete next[from];
  try {
    save(next);
  } catch {
    /* ignore */
  }
}

/** 파일 → 가운데를 정사각형으로 잘라 size px JPEG dataURL (크기 예산에 맞게 품질 자동 조절) */
export async function fileToThumb(file: File, size = 88, maxChars = 3500): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error('사진을 열 수 없어요'));
      i.src = url;
    });
    const s = Math.min(img.naturalWidth, img.naturalHeight);
    const sx = (img.naturalWidth - s) / 2;
    const sy = (img.naturalHeight - s) / 2;
    let px = size;
    for (let attempt = 0; attempt < 6; attempt++) {
      const c = document.createElement('canvas');
      c.width = px;
      c.height = px;
      const ctx = c.getContext('2d');
      if (!ctx) throw new Error('canvas');
      ctx.fillStyle = '#111';
      ctx.fillRect(0, 0, px, px);
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, sx, sy, s, s, 0, 0, px, px);
      for (const q of [0.78, 0.66, 0.55, 0.45]) {
        const d = c.toDataURL('image/jpeg', q);
        if (d.length <= maxChars) return d;
      }
      px = Math.round(px * 0.82);
    }
    throw new Error('사진이 너무 커요');
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** 다른 기기에서 사진이 동기화되어 들어올 때도 다시 읽도록 */
export function onImagesChanged(cb: () => void): () => void {
  window.addEventListener(IMAGES_CHANGED_EVENT, cb);
  window.addEventListener(SETTINGS_APPLIED_EVENT, cb);
  return () => {
    window.removeEventListener(IMAGES_CHANGED_EVENT, cb);
    window.removeEventListener(SETTINGS_APPLIED_EVENT, cb);
  };
}

export function useProductImages(): ProductImages {
  const [imgs, setImgs] = useState<ProductImages>(() => loadProductImages());
  useEffect(() => onImagesChanged(() => setImgs(loadProductImages())), []);
  return imgs;
}
