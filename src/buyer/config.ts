/**
 * 구매자 페이지 설정.
 * APPS_SCRIPT_URL: scripts/apps-script/README.md 대로 배포한 웹 앱 주소 (…/exec)
 * 비어 있으면 주문·조회 페이지가 "준비 중"으로 보임.
 */
export const APPS_SCRIPT_URL = '';

export const BANK = { number: '3333373647928', bank: '카카오뱅크', holder: '이대규' };

export interface BuyerOption {
  /** 주문 관리 앱 제품명 (설정 products 와 똑같아야 함) */
  name: string;
  label: string;
  price: number;
}
export interface BuyerGroup {
  title: string;
  desc?: string;
  options: BuyerOption[];
}

/** 네이버 폼(Cybertruck 전용 액세서리) 1~9번 문항 그대로 */
export const CATALOG: BuyerGroup[] = [
  { title: '휴대폰 마운틴 거치대', desc: 'qi2 무선충전기는 미포함 입니다', options: [{ name: '휴대폰 마운트 거치대', label: '휴대폰 마운틴 거치대', price: 13000 }] },
  { title: '태블릿 마그네틱 거치대', desc: '모든 부속품 포함(마그네틱+링)', options: [{ name: '태블릿 마그네틱 거치대', label: '태블릿 거치대', price: 18000 }] },
  {
    title: 'DC콤보+J1772 거치대',
    options: [
      { name: 'DC콤보+J1772 거치대', label: 'DC콤보+J1772', price: 25000 },
      { name: 'DC콤보+J1772+아울렛', label: 'DC콤보+J1772+아울렛(V2L)', price: 30000 },
    ],
  },
  { title: '안전벨트 클립', options: [{ name: '안전벨트 클립 (뒷자석 3개)', label: '뒷자석 3개', price: 5000 }] },
  { title: '트럭 MAT', desc: '주문 후 최소 15일 주문 기간이 소요 됩니다.', options: [{ name: '트럭 MAT', label: '트럭 mat 48EA', price: 350000 }] },
  { title: '운전석/조수석 손잡이 커버', options: [{ name: '손잡이 커버', label: '손잡이 커버 1set', price: 8000 }] },
  { title: '견인고리 커버', desc: '기본색상은 레드 입니다. 원하시는 색상은 아래 요청사항에 적어 주세요.', options: [{ name: '견인고리 커버', label: '견인고리 커버', price: 8000 }] },
  { title: '사이버트럭 전면 번호판 로고', desc: '원하시는 색상으로 변경 가능. 아래 요청사항에 적어 주세요.', options: [{ name: '전면 번호판 로고', label: '번호판 로고', price: 50000 }] },
  { title: '사이버트럭 비스트 앰블럼', desc: '기본색상 레드&화이트. 원하시는 색상으로 변경 가능. 아래 요청사항에 적어 주세요.', options: [{ name: '비스트 앰블럼', label: '앰블럼', price: 5000 }] },
];
export const SHIPPING = { name: '우체국 택배', label: '우체국 택배', price: 4500 };

export function epostTrackUrl(no: string): string {
  return `https://service.epost.go.kr/trace.RetrieveDomRigiTraceList.comm?sid1=${encodeURIComponent(no.replace(/\D/g, ''))}`;
}
