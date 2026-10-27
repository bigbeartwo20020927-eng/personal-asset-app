# 個人資產 APP

帳戶、投資、負債一次掌握的個人資產管理網頁 APP（PWA），手機和電腦都能使用。

線上版：https://personal-asset-app.web.app

## 功能
- **帳戶與記帳**：現金、銀行、電子支付；子帳戶與劃撥、存錢目標；兩層分類、預算、標籤、常用範本；跨幣別轉帳
- **投資（台股）**：買賣、當沖、股利；T+2 交割行事曆；平均成本／先進先出、含息成本；自動抓收盤價；持股依券商分開
- **負債**：借款與還款（本金／利息）、剩餘本金曲線
- **總覽**：淨資產、各種曲線（1D／1M／3M／1Y）、資產組成、本月收支與預算提醒
- 多裝置即時同步、邀請碼加入、匯出資料、刪除帳號

## 技術
React + TypeScript + Vite + Tailwind CSS + Recharts，Firebase（Auth、Firestore、Hosting）。

## 開發
```bash
npm install
npm run dev      # 本機開發：http://localhost:5173
npm test         # 單元測試
npm run deploy   # 建置並部署到 Firebase Hosting
```
Firebase 設定請參考 [docs/SETUP.md](docs/SETUP.md)，把設定值填入 `.env.local`（不會被提交）。

文件：[使用手冊](docs/使用手冊.pdf)、[交接與待辦](docs/交接與待辦.md)
