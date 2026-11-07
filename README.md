# SEO/GEO Pulse

給 KOL 顧問客戶的加值服務 demo：把 organic search（GSC/GA4）跟品牌在 AI 搜尋引擎（ChatGPT/Gemini/Perplexity）中的能見度放在同一份儀表板，用一頁式機會摘要收尾。

## 現況：預設 demo data，可選串接 DataForSEO 真實資料

預設全部吃 `src/lib/mock-data.ts` 的示範資料（虛構品牌 GlowLab Skincare）。設定列勾選「Use live DataForSEO data」後，可選擇性串接 [DataForSEO](https://dataforseo.com) 按量計費 API：

- **AI Tracking** 的 Visibility / Share of Voice / Citations → DataForSEO LLM Mentions API（真實品牌在 ChatGPT/Gemini/Perplexity 等平台的提及率）；Queries 旁的 AI search volume → AI Keyword Data API
- **Organic Pulse** 的 Top queries「Position」欄 → DataForSEO SERP API（真實 Google 排名）

**仍是 demo data、尚未真實化的部分**：
- AI Tracking 的 Sentiment（DataForSEO 的提及資料不含情緒分數）
- Organic Pulse 的 Clicks/Impressions/CTR/流量趨勢（這些是 Google Search Console 自己的資料，DataForSEO 查不到；需要另外接 GSC API，見下方 `.env.example`）

要啟用 DataForSEO：申請帳號 → https://app.dataforseo.com/api-access 拿 login/password → 填入 `.env.local` 的 `DATAFORSEO_LOGIN` / `DATAFORSEO_PASSWORD`（參考 `.env.example`）。

## Tabs

| Tab | 內容 | 資料源 |
|---|---|---|
| Organic Pulse | KPI、流量趨勢、Top 關鍵字、Top 頁面 | Position 可選 live（DataForSEO SERP API）；其餘 demo（未來可接 GSC + GA4，兩者都免費） |
| AI Tracking | 品牌在 AI 平台的提及率、競品對照、引用來源 | Visibility/SOV/Citations 可選 live（DataForSEO LLM Mentions）；Sentiment 維持 demo |
| Opportunity Report | 可匯出的一頁式重點摘要 | 由前兩個 tab 資料組成 |

## 開發

```bash
npm install
npm run dev
```

開 http://localhost:3000

## 明確不做（現階段）

- Google Ads API
- 真實客戶 OAuth 授權流程（GSC/GA4）

詳見 plan：`~/.claude/plans/https-www-semrush-com-blog-claude-code-sorted-wadler.md`、`~/.claude/plans/hidden-splashing-crab.md`（DataForSEO 串接）
