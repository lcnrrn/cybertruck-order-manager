/** requested: 전송 대기, registered: 우체국 접수 완료(재전송 불가), cancelled: 요청 취소(동기화용 기록) */
export type PostStatus = 'requested' | 'registered' | 'cancelled';

export interface Shipment {
  id: string;
  /** 1차, 2차 … */
  no: number;
  /** {제품명: 수량} */
  items: Record<string, number>;
  postStatus: PostStatus;
  /** 접수 방식: counter=창구(기본), visit=방문(집 픽업) */
  mode?: 'counter' | 'visit';
  requestedAt: number;
  registeredAt?: number;
  receiptNo?: string;
  trackingNumber?: string;
  /** 우체국 요금(원) — 봇이 접수/예약조회에서 채움 (매출 화면 택배비) */
  fee?: number;
  /** 사전결제(카드) 여부 — 봇이 기록 */
  prepaid?: boolean;
  /** 발송안내 문자 보냄 체크 */
  smsSent?: boolean;
  smsSentAt?: number;
  /** 배달 완료 (봇이 우체국 배송조회로 채움, 한 번 true면 유지) */
  delivered?: boolean;
  deliveredAt?: number;
  updatedAt: number;
}

export type OrderStatus = '대기' | '제작중' | '완료';

export interface Order {
  id: string;
  name: string;
  items: string;
  address: string;
  phone: string;
  /** (옛 주문 경로 열 — 화면에선 안 쓰지만 시트 D 열 호환을 위해 유지) */
  group?: string;
  status: OrderStatus;
  priority: boolean;
  /** 우체국 등기(송장)번호 — 기존 저장분에는 없을 수 있음 */
  trackingNumber?: string;
  /** 금액(원) 직접 입력값 — 없으면 제품 판매가 × 수량으로 자동 계산 */
  amount?: number;
  /** 입금 완료 여부 */
  paid?: boolean;
  /** 입금일 (ms) */
  paidAt?: number;
  /** 완료 처리 시 차감된 필라멘트(g) — 값이 있으면 이미 차감됨(중복 차감 방지) */
  filamentG?: number;
  /** 필라멘트 차감 시각 (ms) */
  filamentAt?: number;
  /** 완료 시 종류별 차감량(g) {filamentTypeId: g} */
  filamentUse?: Record<string, number>;
  /** 제작 체크 즉시 차감의 기준점: 차감 추적을 시작할 때 이미 만들어져 있던 개수(doneMap 사본, '~' 표식 포함). 이 값 이하로 만든 건 다시 차감하지 않음 */
  filamentBase?: Record<string, number>;
  /** 제품 구성별 필라멘트 종류 선택 {'제품명#순번': filamentTypeId} */
  filamentPick?: Record<string, string>;
  /** 사용자가 정한 제작 순번 (대기/제작중만 의미 있음) */
  seq?: number;
  /** 품목별 제작 완료 개수 {itemKey: doneCount} */
  doneMap?: Record<string, number>;
  /** 품목별 단가 직접 지정(원) {제품명: 단가} — 0이면 서비스(무료) */
  prices?: Record<string, number>;
  /** 이 주문만의 필라멘트 사용량 직접 지정 {'제품명#순번': 그 줄 총 g(수량 전체)} */
  filamentGrams?: Record<string, number>;
  /** 우체국 전송(분할 발송) 목록 — 1차/2차 … 각각 송장 따로 */
  shipments?: Shipment[];
  createdAt: number;
  updatedAt: number;
  /** (동기화 중에만) 시트 행의 L~R 열이 다른 주문 것으로 밀려 있어 믿을 수 없음 — 저장 안 됨 */
  _partial?: true;
  /** 시트 R 열이 옛 형식(v 없음) — 빈 세부값은 '모름' */
  _legacy?: true;
}

/** 작업중 = 대기 + 제작중 (기본 작업 큐) */
export type StatusFilter = '작업중' | '전체' | '미입금' | OrderStatus;

export const STATUS_OPTIONS: OrderStatus[] = ['대기', '제작중', '완료'];
export const FILTER_OPTIONS: StatusFilter[] = ['작업중', '대기', '제작중', '완료', '미입금', '전체'];

export type PeriodPreset = 'this_month' | 'last_month' | 'all' | 'custom';

export interface PeriodRange {
  preset: PeriodPreset;
  /** YYYY-MM-DD — custom only */
  from?: string;
  /** YYYY-MM-DD — custom only */
  to?: string;
}

export const STORAGE_KEY = 'cybertruck-orders-v1';
export const STATUS_FILTER_KEY = 'cybertruck-status-filter';
export const PERIOD_FILTER_KEY = 'cybertruck-period-filter';
