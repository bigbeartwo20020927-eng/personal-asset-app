import { useAuth } from '../auth/AuthProvider';
import { useAction } from '../components/Toast';
import { Tabs } from '../components/ui';
import { useCol } from '../hooks';
import { commit, updateOp } from '../sync/write';
import type { CostMethod } from '../types';
import { APP_VERSION, BUILD_DATE } from '../version';
import CategoryManager from './CategoryManager';
import DeleteAccountCard from './DeleteAccountCard';
import ExportCard from './ExportCard';
import InviteManager from './InviteManager';

export default function SettingsPage() {
  const { state, logout } = useAuth();
  const settings = useCol('settings').find((s) => s.id === 'main');
  const act = useAction();
  const email = state.status === 'ready' ? state.user.email : '';
  const role = state.status === 'ready' ? state.role : null;

  const setMethod = (m: CostMethod) => {
    if (settings && settings.costMethod !== m) act(() => commit([updateOp('settings', settings, { costMethod: m })]), '已切換成本計算方法');
  };

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">設定</h1>

      <div className="card">
        <h2 className="mb-1 font-semibold">股票成本計算方法</h2>
        <p className="mb-3 text-sm text-slate-500">只影響已實現／未實現損益怎麼切分，總損益兩種方法相同。平均成本法和多數券商 APP 一致。</p>
        <Tabs
          value={settings?.costMethod ?? 'avg'}
          onChange={setMethod}
          items={[
            { key: 'avg', label: '平均成本法' },
            { key: 'fifo', label: '先進先出' },
          ]}
        />
        <label className="mt-4 flex items-start gap-3 border-t border-slate-100 pt-4">
          <input
            type="checkbox"
            className="mt-1 h-4 w-4 shrink-0 accent-teal-700"
            checked={settings?.dividendReducesCost ?? false}
            onChange={(e) => settings && act(() => commit([updateOp('settings', settings, { dividendReducesCost: e.target.checked })]), e.target.checked ? '已開啟含息成本' : '已關閉含息成本')}
          />
          <span>
            <span className="font-medium">現金股利扣減成本（含息成本）</span>
            <span className="block text-sm text-slate-500">
              開啟後，領到的股利會從除息日前持有的股票成本扣掉，成本均價變低，和永豐等券商 APP 的顯示一致。隨時可以切換，不會改動任何紀錄；總損益不變，只是股利改算在未實現／已實現損益裡。
            </span>
          </span>
        </label>
      </div>

      <CategoryManager />

      {role === 'admin' && <InviteManager />}

      <ExportCard />

      <div className="card flex items-center justify-between">
        <div className="text-sm">
          <div className="text-slate-500">目前登入{role === 'admin' ? '（管理者）' : ''}</div>
          <div>{email}</div>
        </div>
        <button className="btn" onClick={logout}>
          登出
        </button>
      </div>

      <DeleteAccountCard />

      <p className="pb-2 text-center text-xs text-slate-400">
        版本 {APP_VERSION} · 更新日期 {BUILD_DATE}
      </p>
    </div>
  );
}
