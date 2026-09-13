import type { CalcInput, CalcMode, CalcResult, DaysSource, Tone } from '../core/calc-models';

/**
 * 历史记录持久化。对应安卓版的 Room（RecordEntity / RecordDao / RecordRepository）。
 *
 * 用 IndexedDB 而不是 localStorage：记录是结构化数据且会增长，
 * localStorage 只有 5MB 且是同步 API。
 *
 * 数值一律以字符串存原始输入（与安卓版一致），避免 8 位净值被浮点吃掉精度。
 */

const DB_NAME = 'finance_calc';
const DB_VERSION = 1;
const STORE = 'calc_record';

export interface RecordRow {
  id?: number;
  mode: CalcMode;
  buyAmount: string | null;
  earnAmount: string | null;
  buyNav: string | null;
  currentNav: string | null;
  buyDate: string | null;
  currentDate: string | null;
  days: number;
  daysSource: DaysSource;
  returnRateText: string;
  annualText: string;
  note: string | null;
  createdAt: number;
}

/** 列表用的轻量视图模型，对应安卓版的 RecordSummary。 */
export interface RecordSummary {
  id: number;
  mode: CalcMode;
  title: string;
  primaryAnnual: string;
  tone: Tone;
  subtitle: string;
  note: string | null;
  createdAt: number;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const os = db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
        os.createIndex('createdAt', 'createdAt');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = fn(t.objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
        t.oncomplete = () => db.close();
      }),
  );
}

function formatMoneyString(raw: string): string {
  // 与核心的 MoneyFormat.amount 同规则：两位小数 + 千分位
  const n = Number(raw);
  if (!Number.isFinite(n)) return raw;
  const fixed = n.toFixed(2);
  const neg = fixed.startsWith('-');
  const [i, d] = (neg ? fixed.slice(1) : fixed).split('.');
  return `${neg ? '-' : ''}${i.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${d}`;
}

export function toRecordRow(
  input: CalcInput,
  result: CalcResult,
  note: string | null,
  createdAt: number,
): RecordRow {
  const returnRateText =
    result.metrics.find((m) => m.label === '区间收益率')?.value ?? result.primaryAnnual;
  const base = {
    days: result.days,
    daysSource: result.daysSource,
    returnRateText,
    annualText: result.primaryAnnual,
    note,
    createdAt,
  };
  if (input.kind === 'amount') {
    return {
      ...base,
      mode: 'AMOUNT',
      buyAmount: input.buyAmount.trim(),
      earnAmount: input.earnAmount.trim(),
      buyNav: null,
      currentNav: null,
      buyDate: input.buyDate,
      currentDate: input.currentDate,
    };
  }
  return {
    ...base,
    mode: 'NAV',
    buyAmount: null,
    earnAmount: null,
    buyNav: input.buyNav.trim(),
    currentNav: input.currentNav.trim(),
    buyDate: input.buyDate,
    currentDate: input.currentDate,
  };
}

export function toSummary(r: RecordRow): RecordSummary {
  const isAmount = r.mode === 'AMOUNT';
  const subtitle = isAmount
    ? `${formatMoneyString(r.buyAmount ?? '0')} 元 · ${r.days} 天`
    : `净值 ${r.buyNav} → ${r.currentNav} · ${r.days} 天`;
  return {
    id: r.id ?? 0,
    mode: r.mode,
    title: isAmount ? '金额计算法' : '净值计算法',
    primaryAnnual: r.annualText,
    tone: r.annualText.startsWith('-') ? 'LOSS' : 'GAIN',
    subtitle,
    note: r.note,
    createdAt: r.createdAt,
  };
}

export async function addRecord(row: RecordRow): Promise<number> {
  const id = await tx<IDBValidKey>('readwrite', (s) => s.add(row));
  return Number(id);
}

export async function listRecords(): Promise<RecordRow[]> {
  const all = await tx<RecordRow[]>('readonly', (s) => s.getAll() as IDBRequest<RecordRow[]>);
  return all.sort((a, b) => b.createdAt - a.createdAt);
}

export async function listSummaries(): Promise<RecordSummary[]> {
  return (await listRecords()).map(toSummary);
}

export async function deleteRecord(id: number): Promise<void> {
  await tx('readwrite', (s) => s.delete(id));
}

export async function setNote(id: number, note: string | null): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const t = db.transaction(STORE, 'readwrite');
    const store = t.objectStore(STORE);
    const getReq = store.get(id);
    getReq.onsuccess = () => {
      const row = getReq.result as RecordRow | undefined;
      if (!row) return;
      row.note = note && note.trim() !== '' ? note.trim() : null;
      store.put(row);
    };
    t.oncomplete = () => {
      db.close();
      resolve();
    };
    t.onerror = () => reject(t.error);
  });
}

export async function clearRecords(): Promise<void> {
  await tx('readwrite', (s) => s.clear());
}

/** 申请持久化存储。iOS 上尤其重要：不申请的话系统可能回收脚本可写存储。 */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (navigator.storage?.persist) return await navigator.storage.persist();
  } catch {
    /* 不支持就返回 false */
  }
  return false;
}
