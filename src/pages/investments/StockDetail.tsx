import { useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import Modal from '../../components/Modal';
import { GranularityPicker } from '../../components/SeriesChart';
import { useAction } from '../../components/Toast';
import { Empty, Money } from '../../components/ui';
import { combineRows, useInvestments } from '../../data/useInvestments';
import { portfolioCashFlows, portfolioSeries } from '../../domain/portfolio';
import { sampleDates, type Granularity } from '../../domain/series';
import { sortTrades } from '../../domain/trades';
import { valueLot } from '../../domain/valuation';
import { xirr } from '../../domain/xirr';
import { fmtPct } from '../../format';
import { setManualClose } from '../../market/priceStore';
import type { Trade } from '../../types';
import { ToggleLines, type MetricDef } from './charts';
import { PriceStatus, TradeRows } from './InvestmentsPage';
import TradeForm from './TradeForm';

const STOCK_METRICS: MetricDef[] = [
  { key: 'marketValue', name: '市值', color: '#0f766e' },
  { key: 'cost', name: '投入成本', color: '#64748b' },
  { key: 'netPnL', name: '淨損益', color: '#d97706' },
  { key: 'realizedPlusDiv', name: '已實現＋股利', color: '#2563eb' },
  { key: 'dayTrade', name: '當沖損益', color: '#db2777' },
];

const ALL = 'all';

export default function StockDetail() {
  const { symbol = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const inv = useInvestments();
  const act = useAction();
  const [gran, setGran] = useState<Granularity>('1M');
  const [form, setForm] = useState<{ edit?: Trade } | null>(null);
  const [manual, setManual] = useState(false);
  const [mDate, setMDate] = useState(inv.today);
  const [mClose, setMClose] = useState('');

  // 這支股票在各券商的持股；可以切換「全部」或某一家券商
  const rows = useMemo(() => inv.holdings.filter((x) => x.symbol === symbol), [inv.holdings, symbol]);
  const requested = params.get('broker') ?? ALL;
  const broker = rows.some((r) => r.accountId === requested) ? requested : ALL;
  const brokerId = broker === ALL ? undefined : broker;
  const setBroker = (b: string) => setParams(b === ALL ? {} : { broker: b }, { replace: true });

  const trades = useMemo(
    () => sortTrades(inv.trades.filter((t) => t.symbol === symbol && (!brokerId || t.accountId === brokerId))),
    [inv.trades, symbol, brokerId],
  );
  const points = useMemo(
    () => (trades.length ? portfolioSeries(inv.trades, inv.costOpts, inv.ctx, sampleDates(trades[0].tradeDate, inv.today, gran), symbol, brokerId) : []),
    [inv.trades, inv.costOpts, inv.ctx, trades, inv.today, gran, symbol, brokerId],
  );
  const names = useMemo(() => new Map([...inv.symbols.values()].map((s) => [s.code, s.name])), [inv.symbols]);

  const view = useMemo(() => {
    if (rows.length === 0) return null;
    if (brokerId) {
      const r = rows.find((x) => x.accountId === brokerId)!;
      return { position: r.position, valuation: r.valuation, xirr: r.xirr, rows: [r] };
    }
    const c = combineRows(rows, symbol);
    const terminal = c.position.shares > 0 ? c.valuation.marketValue - c.valuation.estSellFee - c.valuation.estTax : 0;
    return { ...c, xirr: xirr(portfolioCashFlows(inv.trades, terminal, inv.today, symbol)), rows };
  }, [rows, brokerId, symbol, inv.trades, inv.today]);

  if (!view) return <Empty>沒有 {symbol} 的紀錄</Empty>;
  const { position: p, valuation: v } = view;
  const first = rows[0];

  const saveManual = async () => {
    const c = Number(mClose);
    if (!(c > 0)) return;
    if (await act(() => setManualClose(symbol, mDate, c), '已儲存股價')) setManual(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Link to="/investments" className="hover:text-teal-700">
          投資
        </Link>
        <span>›</span>
        <span>
          {symbol} {first.name}
        </span>
      </div>
      <PriceStatus inv={inv} />

      {rows.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {[{ id: ALL, name: '全部券商' }, ...rows.map((r) => ({ id: r.accountId, name: r.brokerName }))].map((b) => (
            <button
              key={b.id}
              onClick={() => setBroker(b.id)}
              className={`rounded-full px-3 py-1 text-sm ${broker === b.id ? 'bg-teal-700 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200'}`}
            >
              {b.name}
            </button>
          ))}
        </div>
      )}

      <div className="card">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-sm text-slate-500">
              {symbol} {first.name}
              {brokerId ? ` · ${view.rows[0].brokerName}` : rows.length === 1 ? ` · ${first.brokerName}` : ' · 全部券商'}
            </div>
            <div className="mt-1 text-2xl font-semibold">
              <Money value={v.marketValue} />
            </div>
            <div className="text-sm text-slate-500">
              收盤 {first.close ?? '—'} {first.closeDate && `（${first.closeDate}）`}
            </div>
          </div>
          <button className="btn-primary" onClick={() => setForm({})}>
            ＋ 交易
          </button>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <Stat label="持有股數" value={p.shares.toLocaleString('zh-TW')} />
          <Stat label="均價（含手續費）" value={v.avgPrice.toFixed(2)} />
          <Stat label="投入成本" value={<Money value={p.cost} />} />
          <Stat
            label="淨未實現損益"
            value={
              <>
                <Money value={v.netUnrealized} colored /> <span className="text-xs text-slate-500">{fmtPct(v.returnPct)}</span>
              </>
            }
          />
          <Stat label="已實現損益" value={<Money value={p.realized} colored />} />
          <Stat label="股利" value={<Money value={p.dividends} colored />} />
          <Stat label="當沖損益" value={<Money value={p.dayTrade} colored />} />
          <Stat label="含息報酬率" value={fmtPct(v.totalReturnPct)} />
          <Stat label="年化報酬率（XIRR）" value={view.xirr == null ? '—' : fmtPct(view.xirr)} />
          {p.shares > 0 && <Stat label="預估賣出成本" value={<Money value={v.estSellFee + v.estTax} />} />}
        </div>
      </div>

      <div className="card">
        <div className="mb-2 flex justify-end">
          <GranularityPicker value={gran} onChange={setGran} />
        </div>
        <ToggleLines points={points} metrics={STOCK_METRICS} granularity={gran} />
      </div>

      {inv.method === 'fifo' && p.shares > 0 && first.close != null && (
        <div className="card">
          <h2 className="mb-1 font-semibold">明細</h2>
          <p className="mb-2 text-xs text-slate-500">
            每一批分別估算賣出手續費與證交稅{inv.costOpts.dividendReducesCost ? '；成本已扣除除息前領到的股利' : ''}
          </p>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs text-slate-500">
                <th className="py-1.5 text-left font-normal">成交日</th>
                <th className="text-right font-normal">股數／成本單價</th>
                <th className="text-right font-normal">現值／損益</th>
              </tr>
            </thead>
            <tbody>
              {view.rows.flatMap((row) =>
                row.position.lots.map((lot) => {
                  const r = valueLot(lot, first.close!, inv.ctx.brokerOf(row.accountId), inv.ctx.isETF(symbol), symbol, inv.today);
                  return (
                    <tr key={`${row.accountId}|${lot.tradeId}`} className="border-b border-slate-100">
                      <td className="py-2">
                        {lot.date}
                        {view.rows.length > 1 && <div className="text-xs text-indigo-700">{row.brokerName}</div>}
                      </td>
                      <td className="text-right">
                        {lot.shares.toLocaleString('zh-TW')}
                        <div className="text-xs text-slate-500">{r.unitCost.toFixed(2)}</div>
                      </td>
                      <td className="text-right">
                        <Money value={Math.round(r.netValue)} />
                        <div className="text-xs">
                          <Money value={Math.round(r.pnl)} colored />
                        </div>
                      </td>
                    </tr>
                  );
                }),
              )}
            </tbody>
          </table>
        </div>
      )}

      <div className="card">
        <h2 className="mb-2 font-semibold">交易紀錄</h2>
        <TradeRows trades={[...trades].reverse()} names={names} onEdit={(t) => setForm({ edit: t })} />
      </div>

      <button className="btn w-full" onClick={() => setManual(true)}>
        手動輸入股價
      </button>

      <Modal open={manual} onClose={() => setManual(false)} title={`手動輸入 ${symbol} 收盤價`}>
        <p className="mb-3 text-sm text-slate-500">自動抓取失敗時使用。輸入的股價會存進共用的股價資料，其他使用者也看得到。</p>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="label">日期</label>
            <input className="input" type="date" value={mDate} onChange={(e) => setMDate(e.target.value)} />
          </div>
          <div>
            <label className="label">收盤價</label>
            <input className="input" type="number" inputMode="decimal" step="any" value={mClose} onChange={(e) => setMClose(e.target.value)} />
          </div>
        </div>
        <button className="btn-primary mt-3 w-full" onClick={saveManual}>
          儲存
        </button>
      </Modal>

      {form && <TradeForm edit={form.edit} defaultSymbol={symbol} onClose={() => setForm(null)} />}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-slate-500">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
  );
}
