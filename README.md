# 魂夜輪迴

《魂夜輪迴》是一款原創像素風、三關重複循環的瀏覽器生存遊戲。玩家以鍵盤移動引魂者、用滑鼠控制瞄準方向，並透過自動攻擊和冒險內升級持續迎戰敵群。

目前 repository 提供可操作的 Phaser 玩家核心；其餘玩法系統會依 [共享規格](docs/spec/README.md) 與 GitHub Issues 分階段實作。

## 環境需求

- Node.js `>=22.12.0 <23`（建議使用 `.nvmrc` 指定的版本）
- npm 10 或更新版本
- Playwright Chromium（只在執行瀏覽器測試時需要）

## 乾淨安裝

```bash
git clone https://github.com/holysi/soulrun.git
cd soulrun
npm ci
npx playwright install chromium
```

使用 `npm ci` 依 lockfile 重建相同的 dependency tree。Linux CI 若缺少瀏覽器系統套件，請改執行 `npx playwright install --with-deps chromium`。

## 開發與驗證

```bash
npm run dev          # 啟動 Vite 開發伺服器
npm run format:check # 檢查 Prettier 格式
npm run lint         # 執行 ESLint 靜態檢查
npm run typecheck    # 執行嚴格 TypeScript 型別檢查
npm test             # 執行 Vitest 單元測試
npm run test:e2e     # 以 Chromium 執行 Playwright smoke test
npm run test:e2e:firefox # 以 Firefox 執行同一組 smoke test
npm run test:e2e:preview # 驗證正式建置能正確提供必要 PNG 素材
npm run art:build    # 從原創 ImageGen 母稿重建像素素材與預覽
npm run art:validate # 驗證素材 schema、尺寸、動畫、色盤與透明度
npm run build        # 型別檢查並產生 dist/ 正式建置
npm run build:test   # 產生含 deterministic test API 的 dist-test/ 測試建置
npm run preview      # 在本機預覽正式建置
```

遊戲使用 `480×270` 邏輯解析度、16:9 等比例縮放和 nearest-neighbor 像素呈現。開發時以最新版 Chrome、Edge 或 Firefox 手動驗證；自動 smoke test 使用 `960×540` Chromium viewport。

開發伺服器或 test-mode 建置可用 `?test=1&seed=smoke-seed-001` 啟用版本化的
`window.__SOULRUN_TEST__` deterministic test API。正式建置會完全移除該 API；固定測試種子定義在 `tests/fixtures/seeds.ts`。

## 目錄

- `src/game/`：Phaser 設定、場景與後續遊戲系統。
- `tests/unit/`：Vitest 純邏輯測試。
- `tests/e2e/`：Playwright 瀏覽器流程測試。
- `assets/`：原創像素圖、音訊與地圖資料（後續 Issue 提供）。
- `docs/spec/`：凍結的跨系統契約。
- `docs/adr/`：架構決策紀錄。

貢獻前請閱讀 [AGENTS.md](AGENTS.md)，並在 PR 說明中連結 Issue、列出驗證命令及剩餘風險。
