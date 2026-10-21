// 우체국 전송 대기 목록 출력.
// 사용: npx tsx scripts/epost-queue.mts <values.json>   (또는 stdin)
// 입력: Sheets API values.get('주문!A:R') 응답 JSON ({values:[[...]]}) 또는 행 배열 [[...]].
// 출력: 전송 대기(requested) 발송건 JSON 배열 — row(시트 행 번호), orderId, shipmentId, no, name, phone, address, items.
// 접수 완료 표시: 해당 행 R열 JSON 의 sh[] 에서 id 가 같은 항목에
//   postStatus:'registered', registeredAt:<ms>, receiptNo:'…', trackingNumber:'…'(있으면), updatedAt:<ms> 로 바꾸고
//   I열(updatedAt)도 같은 <ms> 로 올려서 다시 씀. (A열 id 와 R열 i 가 일치하는지 꼭 확인)
import { readFileSync } from 'node:fs';

const raw = JSON.parse(readFileSync(process.argv[2] || 0, 'utf8'));
const rows: string[][] = Array.isArray(raw) ? raw : raw.values || [];
const out: unknown[] = [];
rows.forEach((r, idx) => {
  const id = (r[0] || '').trim();
  if (!id || id === 'id' || !r[17]) return;
  let j: { i?: string; sh?: { id: string; no: number; items: Record<string, number>; postStatus: string; requestedAt: number }[] };
  try { j = JSON.parse(r[17]); } catch { return; }
  if (j.i !== id) return; // 밀린 행은 무시
  for (const s of j.sh || []) {
    if (s.postStatus !== 'requested') continue;
    out.push({
      row: idx + 1,
      orderId: id,
      shipmentId: s.id,
      no: s.no,
      name: r[1],
      phone: r[4],
      address: r[3],
      items: s.items,
      requestedAt: new Date(s.requestedAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }),
    });
  }
});
console.log(JSON.stringify(out, null, 2));
console.error(`전송 대기 ${out.length}건`);
