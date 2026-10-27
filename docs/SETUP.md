# Firebase 設定教學

全程免費，不需要信用卡。預計 10～15 分鐘。
（Firebase 後台的按鈕名稱偶爾會調整，如果和下面寫的不完全一樣，找意思相近的就可以。）

---

## 1. 建立專案
1. 用你的 Google 帳號打開 <https://console.firebase.google.com>
2. 按「**建立專案**」（或「新增專案」）
3. 專案名稱輸入例如 `personal-asset-app` → 繼續
4. **Google Analytics 可以關閉**（用不到）→ 建立專案 → 等它跑完 → 繼續

## 2. 開啟登入方式
1. 左側選單「**建構 (Build)**」→「**Authentication**」→「開始使用」
2. 上方分頁「**登入方式 (Sign-in method)**」
3. 點「**Google**」→ 開啟「啟用」→ 選擇「專案支援電子郵件」（選你自己的 Gmail）→ 儲存
4. 點「新增供應商」→「**電子郵件/密碼**」→ 開啟第一個「啟用」（第二個「電子郵件連結」**不用**開）→ 儲存

> `localhost` 預設已經在「已授權網域」裡，本機測試不用另外設定。

## 3. 建立 Firestore 資料庫
1. 左側選單「建構」→「**Firestore Database**」→「建立資料庫」
2. 位置選 **`asia-east1 (Taiwan)`**（建立後無法更改）
3. 模式選「**以正式版模式啟動 (production mode)**」→ 建立

## 4. 貼上安全規則
1. 在 Firestore 頁面上方點「**規則 (Rules)**」分頁
2. 把編輯器裡原本的內容**全部刪掉**
3. 打開專案資料夾裡的 `firestore.rules`，把內容**全部複製貼上**
4. 按「**發布 (Publish)**」

## 5. 設定白名單
1. Firestore 上方點「**資料 (Data)**」分頁 →「+ 開始集合 (Start collection)」
2. 集合 ID 輸入 `config` → 下一步
3. 文件 ID 輸入 `allowlist`
4. 新增欄位：
   - 欄位名稱：`emails`
   - 類型：**array**
   - 在陣列裡新增一個 **string**，值是你要登入的 Email，**全部小寫**，例如 `bigbeartwo20020927@gmail.com`
5. 儲存

> 之後要讓家人朋友使用，就回到這份文件，在 `emails` 陣列裡多加一個值即可。

## 6. 取得網頁設定值
1. 左上角齒輪 ⚙ →「**專案設定**」→「一般」分頁
2. 往下捲到「你的應用程式」→ 點網頁圖示 **`</>`**
3. 應用程式暱稱輸入 `web` →（Firebase Hosting **先不要勾**）→ 註冊應用程式
4. 畫面會出現一段 `const firebaseConfig = { ... }`，裡面的值等一下會用到

## 7. 填入 `.env.local`
在專案資料夾裡，把 `.env.example` 複製一份並改名成 `.env.local`，依照下面的對應填入：

| `.env.local` | firebaseConfig 裡的 |
|---|---|
| `VITE_FIREBASE_API_KEY` | `apiKey` |
| `VITE_FIREBASE_AUTH_DOMAIN` | `authDomain` |
| `VITE_FIREBASE_PROJECT_ID` | `projectId` |
| `VITE_FIREBASE_STORAGE_BUCKET` | `storageBucket` |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | `messagingSenderId` |
| `VITE_FIREBASE_APP_ID` | `appId` |

> 這些值是網頁版 Firebase 的公開識別碼，不是密碼；真正保護資料的是第 4 步的安全規則和第 5 步的白名單。
> 你也可以直接把 firebaseConfig 那一段貼給 Claude，由它幫你填。

## 8. 啟動
```bash
npm run dev
```
打開 <http://localhost:5173>，用 Google 或 Email 登入。第一次登入時會自動建立預設分類。

## 9. 部署（讓手機也能用）
第一次需要登入 Firebase（會打開瀏覽器，用建立專案的那個 Google 帳號登入）：
```bash
npx firebase login
```
之後每次要更新線上版本：
```bash
npm run deploy
```
完成後網址是 <https://personal-asset-app.web.app>。手機用瀏覽器打開，選「加入主畫面」就像 APP 一樣使用。

修改了 `firestore.rules` 後，也可以用指令發布，不必到後台貼上：
```bash
npm run deploy:rules
```

---

## 常見問題
- **顯示「尚未取得使用權限」**：檢查第 5 步的 Email 是否完全一致（全部小寫）、欄位類型是否為 array。
- **用 Email 註冊後卡在「請驗證你的 Email」**：去信箱點驗證連結（可能在垃圾郵件匣），再按「我已經驗證了」。
- **規則修改後沒有生效**：規則發布後最多需要約 1 分鐘才會生效。
