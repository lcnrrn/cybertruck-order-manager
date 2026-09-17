import type { Order } from './types';

/** 허구 샘플만 — 실제 고객 데이터 아님 */
export const SAMPLE_ORDERS: Order[] = [
  {
    id: 'sample-1',
    name: '김민수',
    items: '사이드미러 커버 실버 1개',
    address: '서울특별시 강남구 테헤란로 123 101동 202호',
    phone: '01012345678',
    group: '스마트스토어',
    status: '대기',
    priority: true,
    createdAt: Date.now() - 86400000 * 2,
    updatedAt: Date.now() - 86400000 * 2,
  },
  {
    id: 'sample-2',
    name: '이서연',
    items: '휠 센터캡 블랙 4개 / 도어핸들 커버',
    address: '부산광역시 해운대구 센텀중앙로 45 오피스텔 1203호',
    phone: '01098765432',
    group: '인스타',
    status: '제작중',
    priority: false,
    createdAt: Date.now() - 86400000,
    updatedAt: Date.now() - 3600000,
  },
  {
    id: 'sample-3',
    name: '박준호',
    items: '프론트 범퍼 가드 매트블랙',
    address: '경기도 성남시 분당구 판교역로 235',
    phone: '01055551234',
    group: '오픈채팅',
    status: '완료',
    priority: false,
    createdAt: Date.now() - 86400000 * 5,
    updatedAt: Date.now() - 86400000,
  },
];
