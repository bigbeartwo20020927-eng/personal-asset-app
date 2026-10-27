import { useEffect, useMemo, useState } from 'react';
import Modal from '../../components/Modal';
import { useAction, useToast } from '../../components/Toast';
import { Money } from '../../components/ui';
import { useAccountsData } from '../../data/useData';
import { brokerOfAccount } from '../../data/useInvestments';
import { addDays, today } from '../../domain/dates';
import { brokerFee, tradeValue, transactionTax } from '../../domain/fees';
import { subBalanceProblem } from '../../domain/guards';
import { replayPortfolio, validateTrades } from '../../domain/holdings';
import { fetchDividends, type DividendInfo } from '../../market/sources';
import { settleDateOf, tradeCashFlow } from '../../domain/trades';
import { weekdayLabel } from '../../format';
import { isETFOf, useSymbols } from '../../market/useMarket';
import { commit, createOp, deleteOp, updateOp } from '../../sync/write';
import type { DocData, Trade, TradeKind } from '../../types';
import { canAutoFocus } from '../../touchFocus';

const KINDS: { key: TradeKind; label: string }[] = [
  { key: 'buy', label: '買進' },
  { key: 'sell', label: '賣出' },
  { key: 'dayTrade', label: '當沖' },
  { key: 'cashDividend', label: '現金股利' },
  { key: 'stockDividend', label: '股票股利' },
];

export default function TradeForm({ edit, defaultSymbol, onClose }: { edit?: Trade; defaultSymbol?: string; onClose: () => void }) {
  const data = useAccountsData();
  const symbols = useSymbols();
  const act = useAction();
  const toast = useToast();
  const brokers = data.accounts.filter((a) => a.isBroker && (!a.archived || a.id === edit?.accountId));

  const [kind, setKind] = useState<TradeKind>(edit?.kind ?? 'buy');
  const [symbolText, setSymbolText] = useState(edit?.symbol ?? defaultSymbol ?? '');
  const [accountId, setAccountId] = useState(edit?.accountId ?? brokers[0]?.id ?? '');
  const [date, setDate] = useState(edit?.tradeDate ?? today());
  const [shares, setShares] = useState(edit ? String(edit.shares || '') : '');
  const [price, setPrice] = useState(edit ? String(edit.price || '') : '');
  const [sellPrice, setSellPrice] = useState(edit?.sellPrice != null ? String(edit.sellPrice) : '');
  const [amount, setAmount] = useState(edit?.amount != null ? String(edit.amount) : '');
  const [fee, setFee] = useState(edit ? String(edit.fee) : '');
  const [sellFee, setSellFee] = useState(edit ? String(edit.sellFee) : '');
  const [tax, setTax] = useState(edit ? String(edit.tax) : '');
  // 使用者手動改過手續費或稅，就不再自動覆蓋
  const [touched, setTouched] = useState(!!edit);
  const [note, setNote] = useState(edit?.note ?? '');
  const [busy, setBusy] = useState(false);

  // 表單剛打開時帳戶資料可能還沒讀到，讀到後自動帶入第一個券商帳戶
  const firstBroker = brokers[0]?.id ?? '';
  useEffect(() => {
    if (!accountId && firstBroker) setAccountId(firstBroker);
  }, [accountId, firstBroker]);

  const symbol = symbolText.trim().split(/\s+/)[0].toUpperCase();
  const info = symbols.get(symbol);
  const account = data.accountById.get(accountId);
  const isETF = isETFOf(symbols, symbol);
  const isDividend = kind === 'cashDividend' || kind === 'stockDividend';

  // 現金股利：除息日（從資料來源自動帶入），以及「每股股利 × 除息前持股」的建議金額
  const [exDate, setExDate] = useState(edit?.exDate ?? '');
  const [divFee, setDivFee] = useState(edit?.kind === 'cashDividend' && edit.fee ? String(edit.fee) : '');
  const [divInfo, setDivInfo] = useState<DividendInfo[]>([]);
  useEffect(() => {
    if (kind !== 'cashDividend' || !/^[0-9A-Z]{4,6}$/.test(symbol)) return;
    let alive = true;
    const timer = setTimeout(() => {
      fetchDividends(symbol)
        .then((list) => alive && setDivInfo(list))
        .catch(() => alive && setDivInfo([]));
    }, 400);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [kind, symbol]);
  // 找出這次入帳對應的除息：優先找發放日相同的，否則找入帳日之前最近一次除息
  const matchedDiv = useMemo(
    () => divInfo.find((d) => d.payDate === date) ?? divInfo.find((d) => d.exDate <= date) ?? null,
    [divInfo, date],
  );
  useEffect(() => {
    if (!edit && matchedDiv) setExDate(matchedDiv.exDate);
  }, [edit, matchedDiv]);
  const heldBeforeEx = useMemo(() => {
    if (kind !== 'cashDividend' || !exDate || !symbol || !accountId) return 0;
    const others = data.trades.filter((x) => x.id !== edit?.id);
    // 只算同一家券商的持股
    return replayPortfolio(others, 'avg', addDays(exDate, -1)).get(symbol, accountId).shares;
  }, [kind, exDate, symbol, data.trades, edit, accountId]);
  const perShare = matchedDiv && matchedDiv.exDate === exDate ? matchedDiv.perShare : null;
  const suggested = perShare != null && heldBeforeEx > 0 ? Math.floor(perShare * heldBeforeEx) : null;

  // 依券商設定試算手續費與證交稅
  const estimate = useMemo(() => {
    if (!account || (kind !== 'buy' && kind !== 'sell' && kind !== 'dayTrade')) return null;
    const n = Number(shares);
    const p = Number(price);
    const broker = brokerOfAccount(account);
    if (kind === 'buy') return { fee: brokerFee(tradeValue(n, p), n, broker), sellFee: 0, tax: 0 };
    if (kind === 'sell') return { fee: brokerFee(tradeValue(n, p), n, broker), sellFee: 0, tax: transactionTax(tradeValue(n, p), isETF, false, symbol, date) };
    const sp = Number(sellPrice);
    return {
      fee: brokerFee(tradeValue(n, p), n, broker),
      sellFee: brokerFee(tradeValue(n, sp), n, broker),
      tax: transactionTax(tradeValue(n, sp), isETF, true, symbol, date),
    };
  }, [account, shares, price, sellPrice, kind, isETF, symbol, date]);

  // 沒有手動改過時自動帶入試算結果
  useEffect(() => {
    if (touched || !estimate) return;
    setFee(String(estimate.fee));
    setSellFee(String(estimate.sellFee));
    setTax(String(estimate.tax));
  }, [touched, estimate]);

  // 手動輸入（或舊紀錄）的手續費、證交稅和試算不同時提示
  const differs =
    touched &&
    estimate != null &&
    (Math.round(Number(fee) || 0) !== estimate.fee ||
      (kind === 'dayTrade' && Math.round(Number(sellFee) || 0) !== estimate.sellFee) ||
      (kind !== 'buy' && Math.round(Number(tax) || 0) !== estimate.tax));

  const options = useMemo(() => [...symbols.values()].sort((a, b) => a.code.localeCompare(b.code)), [symbols]);

  const build = (): DocData<Trade> | string => {
    if (!symbol) return '請輸入股票代號';
    if (!account) return '請選擇券商帳戶';
    const n = Number(shares);
    if (kind !== 'cashDividend' && !(n > 0 && Number.isInteger(n))) return '請輸入股數（整數）';
    if ((kind === 'buy' || kind === 'sell' || kind === 'dayTrade') && !(Number(price) > 0)) return '請輸入成交價';
    if (kind === 'dayTrade' && !(Number(sellPrice) > 0)) return '請輸入賣出價';
    if (kind === 'cashDividend' && !(Number(amount) > 0)) return '請輸入股利金額';
    if (kind === 'cashDividend' && exDate && exDate > date) return '除息日不能晚於入帳日';
    if (kind === 'cashDividend' && (Number(divFee) || 0) >= Number(amount)) return '入帳手續費不能大於股利金額';
    const settle = isDividend ? date : settleDateOf(date);
    return {
      kind,
      symbol,
      shares: kind === 'cashDividend' ? 0 : n,
      price: isDividend ? 0 : Number(price),
      sellPrice: kind === 'dayTrade' ? Number(sellPrice) : null,
      fee: kind === 'cashDividend' ? Math.round(Number(divFee) || 0) : kind === 'stockDividend' ? 0 : Math.round(Number(fee) || 0),
      sellFee: kind === 'dayTrade' ? Math.round(Number(sellFee) || 0) : 0,
      tax: kind === 'sell' || kind === 'dayTrade' ? Math.round(Number(tax) || 0) : 0,
      tradeDate: date,
      settleDate: settle,
      accountId,
      // 交割從哪個子帳戶：新增時依帳戶設定帶入，之後改設定不影響過去的紀錄
      subAccountId: edit && edit.accountId === accountId ? edit.subAccountId : (account.settleSubAccountId ?? null),
      amount: kind === 'cashDividend' ? Math.round(Number(amount)) : null,
      exDate: kind === 'cashDividend' && exDate ? exDate : null,
      createdAt: edit?.createdAt ?? Date.now(),
      note: note.trim(),
    };
  };

  /** 防呆：不能讓後面的賣出變成「賣出沒有的股票」，也不能讓子帳戶變成負數 */
  const guard = (next: Trade[]): string | null => {
    const before = new Set(validateTrades(data.trades).map((p) => p.tradeId));
    const added = validateTrades(next).filter((p) => !before.has(p.tradeId));
    if (added.length) return `${added[0].message}。請先刪除或修改那筆賣出。`;
    const base = { accounts: data.accounts, transactions: data.transactions, allocations: data.allocations };
    return subBalanceProblem({ ...base, trades: data.trades }, { ...base, trades: next }, (id) => data.subById.get(id)?.name ?? '子帳戶');
  };

  const preview = (() => {
    const d = build();
    if (typeof d === 'string') return null;
    return { cash: tradeCashFlow({ ...d, id: '', version: 0, updatedAt: 0, deleted: false }), settle: d.settleDate };
  })();

  const save = async () => {
    const d = build();
    if (typeof d === 'string') return toast(d, 'error');
    const others = data.trades.filter((x) => x.id !== edit?.id);
    const problem = guard([...others, { ...(edit ?? { id: 'new', version: 0, updatedAt: 0, deleted: false }), ...d }]);
    if (problem) return toast(problem, 'error');
    setBusy(true);
    const ok = await act(() => commit([edit ? updateOp('trades', edit, d) : createOp('trades', d)]), edit ? '已更新' : '已記錄');
    setBusy(false);
    if (ok) onClose();
  };

  const remove = async () => {
    if (!edit) return;
    const problem = guard(data.trades.filter((x) => x.id !== edit.id));
    if (problem) return toast(problem, 'error');
    if (!confirm('確定刪除這筆紀錄？持股、損益、交割和曲線都會回到記錄之前的狀態。')) return;
    setBusy(true);
    const ok = await act(() => commit([deleteOp('trades', edit)]), '已刪除');
    setBusy(false);
    if (ok) onClose();
  };

  const num = (v: string, set: (s: string) => void, fees = false) => ({
    value: v,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
      set(e.target.value);
      if (fees) setTouched(true);
    },
    type: 'number',
    inputMode: 'decimal' as const,
    step: 'any',
    min: '0',
    className: 'input',
  });

  return (
    <Modal open title={edit ? '編輯交易' : '新增交易'} onClose={onClose}>
      {brokers.length === 0 ? (
        <p className="text-sm text-slate-600">請先到「帳戶」編輯一個銀行帳戶，勾選「同時為券商」，才能記錄股票交易。</p>
      ) : (
        <>
          <div className="mb-3 grid grid-cols-5 rounded-lg bg-slate-100 p-0.5 text-xs sm:text-sm">
            {KINDS.map((k) => (
              <button
                key={k.key}
                onClick={() => {
                  setKind(k.key);
                  if (!edit) setTouched(false);
                }}
                className={`rounded-md py-1.5 ${kind === k.key ? 'bg-white font-medium shadow-sm' : 'text-slate-500'}`}
              >
                {k.label}
              </button>
            ))}
          </div>

          <div className="space-y-3">
            <div>
              <label className="label">股票代號</label>
              <input className="input" list="symbol-options" value={symbolText} onChange={(e) => setSymbolText(e.target.value)} placeholder="輸入代號或名稱，例如 2330" autoFocus={canAutoFocus && !edit} />
              <datalist id="symbol-options">
                {options.map((s) => (
                  <option key={s.code} value={`${s.code} ${s.name}`} />
                ))}
              </datalist>
              {symbol && (
                <p className="mt-1 text-xs text-slate-500">
                  {info ? `${info.name} · ${info.market === 'TWSE' ? '上市' : '上櫃'}${info.isETF ? ' · ETF' : ''}` : '清單中找不到這個代號（仍可記錄）'}
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="label">券商帳戶</label>
                <select className="input" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                  <option value="">請選擇…</option>
                  {brokers.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">{isDividend ? (kind === 'cashDividend' ? '入帳日' : '配股日') : '成交日'}</label>
                <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
            </div>

            {kind === 'cashDividend' ? (
              <div className="space-y-3">
                <div>
                  <label className="label">除息日</label>
                  <input className="input" type="date" value={exDate} max={date} onChange={(e) => setExDate(e.target.value)} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="label">股利金額（扣費前）</label>
                    <input {...num(amount, setAmount)} />
                  </div>
                  <div>
                    <label className="label">入帳手續費（選填）</label>
                    <input {...num(divFee, setDivFee)} placeholder="例如匯費 10" />
                  </div>
                </div>
                {suggested != null && (
                  <button
                    type="button"
                    onClick={() => setAmount(String(suggested))}
                    className="w-full rounded-lg bg-teal-50 px-3 py-2 text-left text-sm text-teal-800 hover:bg-teal-100"
                  >
                    每股 {perShare} 元 × 除息前持有 {heldBeforeEx.toLocaleString('zh-TW')} 股 = <b>{suggested.toLocaleString('zh-TW')}</b>　點一下帶入
                  </button>
                )}
                <p className="text-xs text-slate-500">
                  股利金額請填<b>扣手續費之前</b>的金額；帳戶實際收到「股利 − 手續費」。除息日會自動帶入。開啟「含息成本」時，股利全額會扣到<b>除息日前</b>買進的股票成本。
                  {heldBeforeEx === 0 && exDate && ' 你在除息日前沒有持股，請確認日期。'}
                </p>
              </div>
            ) : (
              <div className={`grid gap-2 ${kind === 'dayTrade' ? 'grid-cols-3' : kind === 'stockDividend' ? 'grid-cols-1' : 'grid-cols-2'}`}>
                <div>
                  <label className="label">{kind === 'stockDividend' ? '配發股數' : '股數'}</label>
                  <input {...num(shares, setShares)} inputMode="numeric" step="1" />
                </div>
                {kind !== 'stockDividend' && (
                  <div>
                    <label className="label">{kind === 'dayTrade' ? '買進價' : '成交價'}</label>
                    <input {...num(price, setPrice)} />
                  </div>
                )}
                {kind === 'dayTrade' && (
                  <div>
                    <label className="label">賣出價</label>
                    <input {...num(sellPrice, setSellPrice)} />
                  </div>
                )}
              </div>
            )}

            {(kind === 'buy' || kind === 'sell' || kind === 'dayTrade') && (
              <div className="rounded-lg bg-slate-50 p-3">
                <div className={`grid gap-2 ${kind === 'buy' ? 'grid-cols-1' : kind === 'sell' ? 'grid-cols-2' : 'grid-cols-3'}`}>
                  <div>
                    <label className="label">{kind === 'dayTrade' ? '買進手續費' : '手續費'}</label>
                    <input {...num(fee, setFee, true)} />
                  </div>
                  {kind === 'dayTrade' && (
                    <div>
                      <label className="label">賣出手續費</label>
                      <input {...num(sellFee, setSellFee, true)} />
                    </div>
                  )}
                  {kind !== 'buy' && (
                    <div>
                      <label className="label">證交稅</label>
                      <input {...num(tax, setTax, true)} />
                    </div>
                  )}
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  依券商設定自動試算（{account ? `${+(account.feeDiscount * 10).toFixed(2)} 折` : ''}），可以手動修改。
                  {touched && (
                    <button className="ml-1 text-teal-700 underline" onClick={() => setTouched(false)}>
                      重新試算
                    </button>
                  )}
                </p>
                {differs && estimate && (
                  <p className="mt-1 rounded bg-amber-50 px-2 py-1 text-xs text-amber-800">
                    和試算結果不同：試算為手續費 {estimate.fee}
                    {kind === 'dayTrade' && `、賣出手續費 ${estimate.sellFee}`}
                    {kind !== 'buy' && `、證交稅 ${estimate.tax}`}。如果券商實際收的就是這個數字，可以忽略。
                  </p>
                )}
              </div>
            )}

            <div>
              <label className="label">備註</label>
              <input className="input" value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
          </div>

          {preview && kind !== 'stockDividend' && (
            <div className="mt-3 rounded-lg border border-slate-200 p-3 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">{isDividend ? '入帳' : `交割日 ${preview.settle.slice(5).replace('-', '/')}（${weekdayLabel(preview.settle)}）`}</span>
                <Money value={preview.cash} colored className="font-semibold" />
              </div>
              {!isDividend && <p className="mt-1 text-xs text-slate-400">交割前會先預扣（圈存），到交割日才從帳戶扣款或入帳</p>}
            </div>
          )}

          <button className="btn-primary mt-4 w-full py-2.5" disabled={busy} onClick={save}>
            儲存
          </button>
        </>
      )}
      {edit && (
        <button className="btn-danger mt-3 w-full" disabled={busy} onClick={remove}>
          刪除這筆紀錄
        </button>
      )}
    </Modal>
  );
}
