# Graph Report - Kuber  (2026-04-25)

## Corpus Check
- 265 files · ~41,495,365 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 865 nodes · 910 edges · 35 communities detected
- Extraction: 89% EXTRACTED · 11% INFERRED · 0% AMBIGUOUS · INFERRED: 104 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_Community 20|Community 20]]
- [[_COMMUNITY_Community 21|Community 21]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 25|Community 25]]
- [[_COMMUNITY_Community 26|Community 26]]
- [[_COMMUNITY_Community 30|Community 30]]
- [[_COMMUNITY_Community 33|Community 33]]
- [[_COMMUNITY_Community 34|Community 34]]
- [[_COMMUNITY_Community 38|Community 38]]
- [[_COMMUNITY_Community 40|Community 40]]
- [[_COMMUNITY_Community 42|Community 42]]
- [[_COMMUNITY_Community 43|Community 43]]
- [[_COMMUNITY_Community 52|Community 52]]
- [[_COMMUNITY_Community 58|Community 58]]
- [[_COMMUNITY_Community 71|Community 71]]
- [[_COMMUNITY_Community 72|Community 72]]
- [[_COMMUNITY_Community 75|Community 75]]

## God Nodes (most connected - your core abstractions)
1. `set()` - 25 edges
2. `get()` - 20 edges
3. `update()` - 19 edges
4. `update()` - 18 edges
5. `main()` - 11 edges
6. `GeminiProvider` - 8 edges
7. `toDec()` - 8 edges
8. `sendMail()` - 7 edges
9. `runBackfill()` - 7 edges
10. `goTo()` - 7 edges

## Surprising Connections (you probably didn't know these)
- `set()` --calls--> `metricsHandler()`  [INFERRED]
  client\src\pages\transactions\components\ImportModal.tsx → server\src\lib\metrics.ts
- `toDecimalPlaces()` --calls--> `toDec()`  [INFERRED]
  server\src\test-setup.ts → server\src\scripts\backfill-decimals.ts
- `downloadTemplate()` --calls--> `get()`  [INFERRED]
  client\src\pages\accounts\AccountBulkImportPage.tsx → server\src\routes\import.ts
- `AiPage()` --calls--> `update()`  [INFERRED]
  client\src\pages\settings\system\AiPage.tsx → client\src\pages\settings\system\IntegrationsPage.tsx
- `update()` --calls--> `seedCategoryBuckets()`  [INFERRED]
  client\src\pages\settings\system\AutomationPage.tsx → server\prisma\seed.ts

## Communities

### Community 0 - "Community 0"
Cohesion: 0.03
Nodes (33): downloadTemplate(), buildGroupMap(), getBudgetContext(), getChatContext(), getSpendingContext(), registerJob(), triggerJob(), groupByDay() (+25 more)

### Community 1 - "Community 1"
Cohesion: 0.08
Nodes (14): batchAutoCategorize(), detectRuleSuggestions(), getBatchJobState(), pruneOldJobs(), startBatchAutoCategorize(), suggestCategory(), convertCurrency(), getCurrencySnapshot() (+6 more)

### Community 2 - "Community 2"
Cohesion: 0.08
Nodes (19): mergeDebitCredit(), parseAmount(), detectBankFormat(), hasAllRequiredFields(), mapRowToTransaction(), scoreFormat(), detectColumnMapping(), detectField() (+11 more)

### Community 3 - "Community 3"
Cohesion: 0.11
Nodes (23): AiPage(), requireAuth(), update(), backfillAccounts(), backfillBudgets(), backfillGoals(), backfillLiabilities(), backfillManulAssets() (+15 more)

### Community 4 - "Community 4"
Cohesion: 0.1
Nodes (14): getResendClient(), getSmtpTransport(), sendAccountLockoutEmail(), sendMail(), sendPasswordResetEmail(), sendTestEmail(), metricsHandler(), applyActionsToTransaction() (+6 more)

### Community 5 - "Community 5"
Cohesion: 0.1
Nodes (4): fmtChange(), fmtCurrency(), fmtDate(), fmtPercent()

### Community 6 - "Community 6"
Cohesion: 0.27
Nodes (11): addMonths(), main(), maybe(), pick(), randomBetween(), randomInt(), rng(), roundCents() (+3 more)

### Community 7 - "Community 7"
Cohesion: 0.27
Nodes (11): addSortIndicators(), enableUI(), getNthColumn(), getTable(), getTableBody(), getTableHeader(), loadColumns(), loadData() (+3 more)

### Community 8 - "Community 8"
Cohesion: 0.17
Nodes (2): commit(), handleKeyDown()

### Community 9 - "Community 9"
Cohesion: 0.18
Nodes (3): handleCreate(), handleSubmit(), validate()

### Community 11 - "Community 11"
Cohesion: 0.22
Nodes (8): formatMerchantName(), formatTx(), parseAmount(), parseDate(), parseImportRows(), getTransactionSplitDetails(), mapDbSplitsToLegacyDetails(), normalizeLegacySplitDetails()

### Community 12 - "Community 12"
Cohesion: 0.24
Nodes (8): ensureUserExists(), login(), tryLogin(), globalSetup(), getFirstAccountName(), goTo(), loginAsDemo(), register()

### Community 13 - "Community 13"
Cohesion: 0.26
Nodes (9): computeAutoBudgetAmount(), getPreviousPeriodKey(), runAutoBudget(), computeRolloverAmount(), getISOWeek(), getPeriodKey(), parsePeriodKey(), recalcSpentAmount() (+1 more)

### Community 14 - "Community 14"
Cohesion: 0.35
Nodes (9): amortizationSchedule(), buildAmortizationSummary(), calcPayment(), monthlyRate(), payoffSimulator(), resolveVariableRate(), round2(), triggerRate() (+1 more)

### Community 15 - "Community 15"
Cohesion: 0.17
Nodes (4): addTx(), addBudget(), addRecurring(), waitForToast()

### Community 16 - "Community 16"
Cohesion: 0.35
Nodes (8): a(), B(), D(), g(), i(), k(), Q(), y()

### Community 17 - "Community 17"
Cohesion: 0.25
Nodes (7): advanceCursor(), getExpectedPeriodStart(), getPeriodKey(), isBillDueInPeriod(), matchBillsForTransaction(), toDecimalPlaces(), toNumber()

### Community 19 - "Community 19"
Cohesion: 0.22
Nodes (2): computeDateRange(), fmtDate()

### Community 20 - "Community 20"
Cohesion: 0.22
Nodes (3): onDrop(), onInputChange(), handleFile()

### Community 21 - "Community 21"
Cohesion: 0.33
Nodes (7): detectEmailSource(), parseAmazonEmail(), parseGenericEmail(), parsePayPalEmail(), parseReceiptEmail(), fetchReceiptEmails(), runImapCheckForAllHouseholds()

### Community 22 - "Community 22"
Cohesion: 0.42
Nodes (5): addRecentSearch(), getRecentSearches(), handleKeyDown(), handleSubmit(), selectItem()

### Community 25 - "Community 25"
Cohesion: 0.39
Nodes (1): GeminiProvider

### Community 26 - "Community 26"
Cohesion: 0.29
Nodes (2): buildPayload(), handleSubmit()

### Community 30 - "Community 30"
Cohesion: 0.38
Nodes (3): handleCancel(), handleImportDone(), resetState()

### Community 33 - "Community 33"
Cohesion: 0.33
Nodes (1): AnthropicProvider

### Community 34 - "Community 34"
Cohesion: 0.4
Nodes (2): bucketLine(), fmt()

### Community 38 - "Community 38"
Cohesion: 0.5
Nodes (2): handleFileChange(), isValidFile()

### Community 40 - "Community 40"
Cohesion: 0.5
Nodes (2): fmtPct(), showTooltip()

### Community 42 - "Community 42"
Cohesion: 0.5
Nodes (2): buildRows(), emptyRow()

### Community 43 - "Community 43"
Cohesion: 0.7
Nodes (4): goToNext(), goToPrevious(), makeCurrent(), toggleClass()

### Community 52 - "Community 52"
Cohesion: 0.67
Nodes (2): fmtCurrency(), fmtCurrencyCompact()

### Community 58 - "Community 58"
Cohesion: 0.67
Nodes (2): buildSearchWhere(), parseSearchQuery()

### Community 71 - "Community 71"
Cohesion: 0.67
Nodes (1): OllamaProvider

### Community 72 - "Community 72"
Cohesion: 0.67
Nodes (1): OpenRouterProvider

### Community 75 - "Community 75"
Cohesion: 1.0
Nodes (2): computeGoalStatus(), formatGoal()

## Knowledge Gaps
- **Thin community `Community 8`** (13 nodes): `commit()`, `fmtCurrency()`, `goToNext()`, `goToPrev()`, `goToToday()`, `handleAsk()`, `handleKeyDown()`, `handleSubmit()`, `progressColor()`, `remainingColor()`, `savingsRateStyle()`, `startEdit()`, `BudgetPage.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 19`** (10 nodes): `ReportsPage.tsx`, `computeDateRange()`, `fmtC()`, `fmtCurrency()`, `fmtCurrencySigned()`, `fmtDate()`, `fmtPct()`, `merchantInitial()`, `netColor()`, `savingsColor()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 25`** (9 nodes): `GeminiProvider`, `.complete()`, `.completeStream()`, `.constructor()`, `.getFastGenerationConfig()`, `.getSystemInstruction()`, `.toGeminiHistory()`, `.validateApiKey()`, `gemini.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 26`** (8 nodes): `TaxAccountsSection.tsx`, `alertBg()`, `alertColor()`, `buildPayload()`, `fmtCad()`, `handleSubmit()`, `openEdit()`, `resetForm()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 33`** (6 nodes): `AnthropicProvider`, `.complete()`, `.completeStream()`, `.constructor()`, `.validateApiKey()`, `anthropic.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 34`** (6 nodes): `wealth.ts`, `bucketLine()`, `detectPrevMonthIncome()`, `fmt()`, `getGoalStatus()`, `getMonthRange()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 38`** (5 nodes): `DropZone.tsx`, `downloadSample()`, `handleFileChange()`, `handleParse()`, `isValidFile()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 40`** (5 nodes): `ReportsSankeyChart.tsx`, `fmtCurrency()`, `fmtPct()`, `layoutColumn()`, `showTooltip()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 42`** (5 nodes): `SplitTransactionModal.tsx`, `buildRows()`, `emptyRow()`, `fmtCurrency()`, `SplitTransactionModal()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 52`** (4 nodes): `fmtAxisDate()`, `fmtCurrency()`, `fmtCurrencyCompact()`, `CashFlowForecast.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 58`** (4 nodes): `buildSearchWhere()`, `parseSearchQuery()`, `resolveDateKeyword()`, `searchParser.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 71`** (3 nodes): `OllamaProvider`, `.constructor()`, `ollama.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 72`** (3 nodes): `OpenRouterProvider`, `.constructor()`, `openrouter.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 75`** (3 nodes): `computeGoalStatus()`, `formatGoal()`, `goals.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `set()` connect `Community 0` to `Community 1`, `Community 2`, `Community 4`, `Community 6`, `Community 20`?**
  _High betweenness centrality (0.042) - this node is a cross-community bridge._
- **Why does `get()` connect `Community 0` to `Community 1`, `Community 2`?**
  _High betweenness centrality (0.034) - this node is a cross-community bridge._
- **Why does `update()` connect `Community 3` to `Community 2`, `Community 13`, `Community 6`?**
  _High betweenness centrality (0.018) - this node is a cross-community bridge._
- **Are the 24 inferred relationships involving `set()` (e.g. with `buildGroupMap()` and `buildUrl()`) actually correct?**
  _`set()` has 24 INFERRED edges - model-reasoned connections that need verification._
- **Are the 18 inferred relationships involving `get()` (e.g. with `downloadTemplate()` and `buildGroupMap()`) actually correct?**
  _`get()` has 18 INFERRED edges - model-reasoned connections that need verification._
- **Are the 18 inferred relationships involving `update()` (e.g. with `AiPage()` and `seedCategoryBuckets()`) actually correct?**
  _`update()` has 18 INFERRED edges - model-reasoned connections that need verification._
- **Are the 17 inferred relationships involving `update()` (e.g. with `seedCategoryBuckets()` and `recalcSpentAmount()`) actually correct?**
  _`update()` has 17 INFERRED edges - model-reasoned connections that need verification._