# Graph Report - Kuber  (2026-04-24)

## Corpus Check
- 251 files · ~41,477,511 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 834 nodes · 856 edges · 37 communities detected
- Extraction: 92% EXTRACTED · 8% INFERRED · 0% AMBIGUOUS · INFERRED: 67 edges (avg confidence: 0.8)
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
- [[_COMMUNITY_Community 18|Community 18]]
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_Community 20|Community 20]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 24|Community 24]]
- [[_COMMUNITY_Community 25|Community 25]]
- [[_COMMUNITY_Community 26|Community 26]]
- [[_COMMUNITY_Community 30|Community 30]]
- [[_COMMUNITY_Community 33|Community 33]]
- [[_COMMUNITY_Community 34|Community 34]]
- [[_COMMUNITY_Community 35|Community 35]]
- [[_COMMUNITY_Community 39|Community 39]]
- [[_COMMUNITY_Community 41|Community 41]]
- [[_COMMUNITY_Community 43|Community 43]]
- [[_COMMUNITY_Community 44|Community 44]]
- [[_COMMUNITY_Community 53|Community 53]]
- [[_COMMUNITY_Community 59|Community 59]]
- [[_COMMUNITY_Community 71|Community 71]]
- [[_COMMUNITY_Community 73|Community 73]]
- [[_COMMUNITY_Community 74|Community 74]]
- [[_COMMUNITY_Community 77|Community 77]]

## God Nodes (most connected - your core abstractions)
1. `set()` - 25 edges
2. `get()` - 20 edges
3. `main()` - 11 edges
4. `GeminiProvider` - 8 edges
5. `sendMail()` - 7 edges
6. `toDec()` - 7 edges
7. `runBackfill()` - 7 edges
8. `goTo()` - 7 edges
9. `rng()` - 6 edges
10. `amortizationSchedule()` - 6 edges

## Surprising Connections (you probably didn't know these)
- `metricsHandler()` --calls--> `set()`  [INFERRED]
  server\src\lib\metrics.ts → client\src\pages\transactions\components\ImportModal.tsx
- `getQuotes()` --calls--> `set()`  [INFERRED]
  server\src\lib\priceCache.ts → client\src\pages\transactions\components\ImportModal.tsx
- `get()` --calls--> `downloadTemplate()`  [INFERRED]
  server\src\routes\import.ts → client\src\pages\accounts\AccountBulkImportPage.tsx
- `applyFilters()` --calls--> `set()`  [INFERRED]
  client\src\pages\transactions\TransactionsPage.tsx → client\src\pages\transactions\components\ImportModal.tsx
- `setParam()` --calls--> `set()`  [INFERRED]
  client\src\pages\transactions\TransactionsPage.tsx → client\src\pages\transactions\components\ImportModal.tsx

## Communities

### Community 0 - "Community 0"
Cohesion: 0.04
Nodes (26): downloadTemplate(), buildGroupMap(), getBudgetContext(), getChatContext(), getSpendingContext(), registerJob(), triggerJob(), groupByDay() (+18 more)

### Community 1 - "Community 1"
Cohesion: 0.07
Nodes (17): batchAutoCategorize(), detectRuleSuggestions(), getBatchJobState(), pruneOldJobs(), startBatchAutoCategorize(), suggestCategory(), decrypt(), encrypt() (+9 more)

### Community 2 - "Community 2"
Cohesion: 0.08
Nodes (19): mergeDebitCredit(), parseAmount(), detectBankFormat(), hasAllRequiredFields(), mapRowToTransaction(), scoreFormat(), detectColumnMapping(), detectField() (+11 more)

### Community 3 - "Community 3"
Cohesion: 0.08
Nodes (18): fmtCurrency(), sendDigestEmail(), getResendClient(), getSmtpTransport(), sendAccountLockoutEmail(), sendMail(), sendPasswordResetEmail(), sendTestEmail() (+10 more)

### Community 4 - "Community 4"
Cohesion: 0.1
Nodes (4): fmtChange(), fmtCurrency(), fmtDate(), fmtPercent()

### Community 5 - "Community 5"
Cohesion: 0.15
Nodes (7): generatePendingLots(), nextRunDate(), fetchFromYahoo(), fetchPeriodReturn(), getQuote(), getQuotes(), periodStartDate()

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

### Community 18 - "Community 18"
Cohesion: 0.22
Nodes (2): computeDateRange(), fmtDate()

### Community 19 - "Community 19"
Cohesion: 0.22
Nodes (3): onDrop(), onInputChange(), handleFile()

### Community 20 - "Community 20"
Cohesion: 0.42
Nodes (5): addRecentSearch(), getRecentSearches(), handleKeyDown(), handleSubmit(), selectItem()

### Community 23 - "Community 23"
Cohesion: 0.39
Nodes (7): detectEmailSource(), parseAmazonEmail(), parseGenericEmail(), parsePayPalEmail(), parseReceiptEmail(), fetchReceiptEmails(), runImapCheckForAllHouseholds()

### Community 24 - "Community 24"
Cohesion: 0.39
Nodes (1): GeminiProvider

### Community 25 - "Community 25"
Cohesion: 0.56
Nodes (8): backfillAccounts(), backfillBudgets(), backfillGoals(), backfillLiabilities(), backfillManulAssets(), backfillTransactions(), runBackfill(), toDec()

### Community 26 - "Community 26"
Cohesion: 0.29
Nodes (2): buildPayload(), handleSubmit()

### Community 30 - "Community 30"
Cohesion: 0.38
Nodes (3): handleCancel(), handleImportDone(), resetState()

### Community 33 - "Community 33"
Cohesion: 0.6
Nodes (5): advanceCursor(), getExpectedPeriodStart(), getPeriodKey(), isBillDueInPeriod(), matchBillsForTransaction()

### Community 34 - "Community 34"
Cohesion: 0.33
Nodes (1): AnthropicProvider

### Community 35 - "Community 35"
Cohesion: 0.4
Nodes (2): bucketLine(), fmt()

### Community 39 - "Community 39"
Cohesion: 0.5
Nodes (2): handleFileChange(), isValidFile()

### Community 41 - "Community 41"
Cohesion: 0.5
Nodes (2): fmtPct(), showTooltip()

### Community 43 - "Community 43"
Cohesion: 0.5
Nodes (2): buildRows(), emptyRow()

### Community 44 - "Community 44"
Cohesion: 0.7
Nodes (4): goToNext(), goToPrevious(), makeCurrent(), toggleClass()

### Community 53 - "Community 53"
Cohesion: 0.67
Nodes (2): fmtCurrency(), fmtCurrencyCompact()

### Community 59 - "Community 59"
Cohesion: 0.67
Nodes (2): buildSearchWhere(), parseSearchQuery()

### Community 71 - "Community 71"
Cohesion: 1.0
Nodes (2): advanceNextDate(), processRecurringItems()

### Community 73 - "Community 73"
Cohesion: 0.67
Nodes (1): OllamaProvider

### Community 74 - "Community 74"
Cohesion: 0.67
Nodes (1): OpenRouterProvider

### Community 77 - "Community 77"
Cohesion: 1.0
Nodes (2): computeGoalStatus(), formatGoal()

## Knowledge Gaps
- **Thin community `Community 8`** (13 nodes): `commit()`, `fmtCurrency()`, `goToNext()`, `goToPrev()`, `goToToday()`, `handleAsk()`, `handleKeyDown()`, `handleSubmit()`, `progressColor()`, `remainingColor()`, `savingsRateStyle()`, `startEdit()`, `BudgetPage.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 18`** (10 nodes): `ReportsPage.tsx`, `computeDateRange()`, `fmtC()`, `fmtCurrency()`, `fmtCurrencySigned()`, `fmtDate()`, `fmtPct()`, `merchantInitial()`, `netColor()`, `savingsColor()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 24`** (9 nodes): `GeminiProvider`, `.complete()`, `.completeStream()`, `.constructor()`, `.getFastGenerationConfig()`, `.getSystemInstruction()`, `.toGeminiHistory()`, `.validateApiKey()`, `gemini.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 26`** (8 nodes): `TaxAccountsSection.tsx`, `alertBg()`, `alertColor()`, `buildPayload()`, `fmtCad()`, `handleSubmit()`, `openEdit()`, `resetForm()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 34`** (6 nodes): `AnthropicProvider`, `.complete()`, `.completeStream()`, `.constructor()`, `.validateApiKey()`, `anthropic.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 35`** (6 nodes): `wealth.ts`, `bucketLine()`, `detectPrevMonthIncome()`, `fmt()`, `getGoalStatus()`, `getMonthRange()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 39`** (5 nodes): `DropZone.tsx`, `downloadSample()`, `handleFileChange()`, `handleParse()`, `isValidFile()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 41`** (5 nodes): `ReportsSankeyChart.tsx`, `fmtCurrency()`, `fmtPct()`, `layoutColumn()`, `showTooltip()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 43`** (5 nodes): `SplitTransactionModal.tsx`, `buildRows()`, `emptyRow()`, `fmtCurrency()`, `SplitTransactionModal()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 53`** (4 nodes): `fmtAxisDate()`, `fmtCurrency()`, `fmtCurrencyCompact()`, `CashFlowForecast.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 59`** (4 nodes): `buildSearchWhere()`, `parseSearchQuery()`, `resolveDateKeyword()`, `searchParser.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 71`** (3 nodes): `advanceNextDate()`, `processRecurringItems()`, `recurringJob.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 73`** (3 nodes): `OllamaProvider`, `.constructor()`, `ollama.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 74`** (3 nodes): `OpenRouterProvider`, `.constructor()`, `openrouter.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 77`** (3 nodes): `computeGoalStatus()`, `formatGoal()`, `goals.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `set()` connect `Community 0` to `Community 1`, `Community 2`, `Community 3`, `Community 5`, `Community 6`, `Community 19`?**
  _High betweenness centrality (0.039) - this node is a cross-community bridge._
- **Why does `get()` connect `Community 0` to `Community 1`, `Community 2`, `Community 3`, `Community 5`?**
  _High betweenness centrality (0.033) - this node is a cross-community bridge._
- **Why does `buildGroupMap()` connect `Community 0` to `Community 4`?**
  _High betweenness centrality (0.014) - this node is a cross-community bridge._
- **Are the 24 inferred relationships involving `set()` (e.g. with `buildGroupMap()` and `buildUrl()`) actually correct?**
  _`set()` has 24 INFERRED edges - model-reasoned connections that need verification._
- **Are the 18 inferred relationships involving `get()` (e.g. with `downloadTemplate()` and `buildGroupMap()`) actually correct?**
  _`get()` has 18 INFERRED edges - model-reasoned connections that need verification._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.04 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.07 - nodes in this community are weakly interconnected._