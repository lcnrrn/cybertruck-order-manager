import { useEffect, useState } from 'react';
import type { FilamentState } from './filament';
import type { Order } from './types';
import type { Product } from './products';
import { expenseLines, expenseTotals, lastBalance, loadExpenses, type BalanceRecord, type ExpenseState } from './expenses';
import { orderAmount } from './production';
import { SETTINGS_APPLIED_EVENT } from './settingsMeta';

export interface DepositLine {
  id: string;
  name: string;
  at: number;
  amount: number;
}

export interface BalanceEstimate {
  base: BalanceRecord;
  deposits: DepositLine[];
  depositSum: number;
  /** 기준 잔고 입력 뒤에 늘어난 지출 합계 (누적 지출 − 입력 당시 누적 지출) */
  spent: number;
  expected: number;
  /** 옛 방식(누적 입금 − 입력 당시 누적 입금)과 다르면 그 차이 (이전 주문 금액·입금을 고쳤을 때) */
  mismatch: number;
}

/**
 * 예상 통장 잔고 = 마지막 실제 잔고 + (그 시각 뒤에 입금 체크된 주문 금액) − (그 뒤 늘어난 지출)
 * 입금은 주문별 입금 시각(paidAt) 기준이라 예전 주문 금액을 고쳐도 흔들리지 않음.
 */
export function estimateBalance(exp: ExpenseState, orders: Order[], products: Product[], filament: FilamentState | null): BalanceEstimate | null {
  const base = lastBalance(exp);
  if (!base) return null;
  const deposits: DepositLine[] = [];
  let paidAll = 0;
  for (const o of orders) {
    if (!o.paid) continue;
    const amount = orderAmount(o, products);
    paidAll += amount;
    // 입금 시각이 없는 옛 주문은 기준 시점 이전으로 봄
    if ((o.paidAt || 0) > base.at && amount > 0) deposits.push({ id: o.id, name: o.name, at: o.paidAt || 0, amount });
  }
  deposits.sort((a, b) => a.at - b.at);
  const depositSum = deposits.reduce((s, d) => s + d.amount, 0);
  const expAll = expenseTotals(expenseLines(exp, filament)).total;
  const spent = expAll - base.expTotal;
  const mismatch = paidAll - base.paidTotal - depositSum;
  return { base, deposits, depositSum, spent, expected: base.amount + depositSum - spent, mismatch };
}

/** 지출 설정(잔고 기록 포함) 불러오고, 다른 기기 동기화가 반영되면 다시 읽음 */
export function useExpenseState(): ExpenseState {
  const [s, setS] = useState<ExpenseState>(() => loadExpenses());
  useEffect(() => {
    const re = () => setS(loadExpenses());
    window.addEventListener(SETTINGS_APPLIED_EVENT, re);
    return () => window.removeEventListener(SETTINGS_APPLIED_EVENT, re);
  }, []);
  return s;
}
