# 個人資產 APP

帳戶、投資、負債一次掌握的個人資產管理網頁 APP（PWA），手機和電腦都能使用，可「加入主畫面」像原生 APP 一樣開啟。

🔗 **線上版**：https://personal-asset-app.web.app（採邀請制，需管理者白名單或邀請碼才能登入）

## 專案亮點

- **完整上線的產品**：從需求規劃、開發、測試到部署，實際每天使用中
- **Serverless 架構**：不自架伺服器，以 Firebase 提供登入、資料庫與網站託管，零成本營運（Spark 免費方案）
- **嚴謹的資料權限**：自行撰寫 Firestore Security Rules，依登入者 UID 隔離資料、Email 驗證、白名單＋邀請碼、欄位格式驗證
- **離線優先的多裝置同步**：本機 IndexedDB 保存完整副本，以增量同步＋樂觀鎖（版本號）＋刪除標記處理多裝置衝突
- **串接第三方 API**：從 FinMind 與台灣證交所（TWSE）取得台股股價與股利，失敗時自動切換資料來源，結果快取共用
- **計算邏輯有測試保護**：持股成本、手續費、交割、淨值等計算集中在 `src/domain/`，有 51 個 Vitest 單元測試

## 功能

- **帳戶與記帳**：現金、銀行、電子支付；子帳戶與劃撥、存錢目標；兩層分類、預算、標籤、常用範本；跨幣別轉帳
- **投資（台股）**：買賣、當沖、股利；T+2 交割行事曆；平均成本／先進先出、含息成本；自動抓收盤價；持股依券商分開
- **負債**：借款與還款（本金／利息）、剩餘本金曲線
- **總覽**：淨資產、各種曲線（1D／1M／3M／1Y）、資產組成、本月收支與預算提醒
- 多裝置即時同步、邀請碼加入、匯出資料、刪除帳號

## 技術架構

| 層級 | 技術 |
|---|---|
| 前端 | React 19、TypeScript、Vite、Tailwind CSS、React Router、Recharts |
| PWA | vite-plugin-pwa（可安裝、自動更新） |
| 登入 | Firebase Authentication（Google／Email） |
| 資料庫 | Cloud Firestore（NoSQL）＋ Security Rules |
| 本機儲存 | IndexedDB（Dexie） |
| 外部 API | FinMind、台灣證交所 TWSE（瀏覽器 `fetch`） |
| 部署 | Firebase Hosting |
| 測試 | Vitest |

```
瀏覽器（React APP）
 ├─ IndexedDB 本機資料 ⇄ 同步引擎 ⇄ Cloud Firestore（Security Rules 把關）
 ├─ Firebase Authentication 登入
 └─ fetch → FinMind / TWSE 股價 API
```

## 專案結構

```
src/
├─ pages/      各頁面（總覽、帳戶、投資、負債、設定）
├─ components/ 共用元件（表單、圖表、列表）
├─ domain/     純計算邏輯與單元測試（持股、手續費、交割、淨值、XIRR）
├─ sync/       本機資料庫與雲端同步引擎
├─ market/     股價與股利 API 串接
└─ auth/       登入、邀請碼、刪除帳號
firestore.rules  資料存取權限規則
```

## 本機開發

```bash
npm install
npm run dev      # 本機開發：http://localhost:5173
npm test         # 單元測試
npm run deploy   # 建置並部署到 Firebase Hosting
```

Firebase 設定請參考 [docs/SETUP.md](docs/SETUP.md)，把設定值填入 `.env.local`（不會被提交）。

文件：[使用手冊](docs/使用手冊.pdf)

## 開發方式

本專案使用 AI 程式助理（Claude Code）協作開發；需求規劃、功能設計、測試驗收與部署由作者負責。
