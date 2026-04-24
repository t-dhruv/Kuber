# Graph Report - .  (2026-04-23)

## Corpus Check
- 238 files · ~352,395 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 723 nodes · 767 edges · 33 communities detected
- Extraction: 93% EXTRACTED · 7% INFERRED · 0% AMBIGUOUS · INFERRED: 55 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Bulk Import UI|Bulk Import UI]]
- [[_COMMUNITY_CSV Amount Parser|CSV Amount Parser]]
- [[_COMMUNITY_Auto-Categorization Engine|Auto-Categorization Engine]]
- [[_COMMUNITY_Audit & Email|Audit & Email]]
- [[_COMMUNITY_Accounts Page|Accounts Page]]
- [[_COMMUNITY_Investment Holdings|Investment Holdings]]
- [[_COMMUNITY_Database Seed|Database Seed]]
- [[_COMMUNITY_Coverage Report UI|Coverage Report UI]]
- [[_COMMUNITY_Transaction Splits|Transaction Splits]]
- [[_COMMUNITY_Budget Page|Budget Page]]
- [[_COMMUNITY_Investments Page|Investments Page]]
- [[_COMMUNITY_Loan Amortization|Loan Amortization]]
- [[_COMMUNITY_Code Prettifier|Code Prettifier]]
- [[_COMMUNITY_Reports Page|Reports Page]]
- [[_COMMUNITY_Import & OCR Modal|Import & OCR Modal]]
- [[_COMMUNITY_Email Parser|Email Parser]]
- [[_COMMUNITY_Gemini AI Provider|Gemini AI Provider]]
- [[_COMMUNITY_Decimal Backfill Migration|Decimal Backfill Migration]]
- [[_COMMUNITY_Community 20|Community 20]]
- [[_COMMUNITY_Community 24|Community 24]]
- [[_COMMUNITY_Community 27|Community 27]]
- [[_COMMUNITY_Community 28|Community 28]]
- [[_COMMUNITY_Community 29|Community 29]]
- [[_COMMUNITY_Community 32|Community 32]]
- [[_COMMUNITY_Community 33|Community 33]]
- [[_COMMUNITY_Community 36|Community 36]]
- [[_COMMUNITY_Community 40|Community 40]]
- [[_COMMUNITY_Community 42|Community 42]]
- [[_COMMUNITY_Community 44|Community 44]]
- [[_COMMUNITY_Community 54|Community 54]]
- [[_COMMUNITY_Community 58|Community 58]]
- [[_COMMUNITY_Community 59|Community 59]]
- [[_COMMUNITY_Community 62|Community 62]]

## God Nodes (most connected - your core abstractions)
1. `set()` - 24 edges
2. `get()` - 19 edges
3. `main()` - 11 edges
4. `GeminiProvider` - 8 edges
5. `sendMail()` - 7 edges
6. `toDec()` - 7 edges
7. `runBackfill()` - 7 edges
8. `rng()` - 6 edges
9. `amortizationSchedule()` - 6 edges
10. `round2()` - 6 edges

## Surprising Connections (you probably didn't know these)
- `metricsHandler()` --calls--> `set()`  [INFERRED]
  C:\_Code\_selfHosted\Kuber\server\src\lib\metrics.ts → C:\_Code\_selfHosted\Kuber\client\src\pages\transactions\components\ImportModal.tsx
- `getQuotes()` --calls--> `set()`  [INFERRED]
  C:\_Code\_selfHosted\Kuber\server\src\lib\priceCache.ts → C:\_Code\_selfHosted\Kuber\client\src\pages\transactions\components\ImportModal.tsx
- `main()` --calls--> `set()`  [INFERRED]
  C:\_Code\_selfHosted\Kuber\server\prisma\seed.ts → C:\_Code\_selfHosted\Kuber\client\src\pages\transactions\components\ImportModal.tsx
- `getBatchJobState()` --calls--> `get()`  [INFERRED]
  C:\_Code\_selfHosted\Kuber\server\src\lib\autoCategorize.ts → C:\_Code\_selfHosted\Kuber\server\src\routes\import.ts
- `startBatchAutoCategorize()` --calls--> `set()`  [INFERRED]
  C:\_Code\_selfHosted\Kuber\server\src\lib\autoCategorize.ts → C:\_Code\_selfHosted\Kuber\client\src\pages\transactions\components\ImportModal.tsx

## Communities

### Community 0 - "Bulk Import UI"
Cohesion: 0.04
Nodes (23): downloadTemplate(), getBudgetContext(), getChatContext(), getSpendingContext(), groupByDay(), seedDefaultCategories(), buildUrl(), handleDownload() (+15 more)

### Community 1 - "CSV Amount Parser"
Cohesion: 0.08
Nodes (19): mergeDebitCredit(), parseAmount(), detectBankFormat(), hasAllRequiredFields(), mapRowToTransaction(), scoreFormat(), detectColumnMapping(), detectField() (+11 more)

### Community 2 - "Auto-Categorization Engine"
Cohesion: 0.08
Nodes (14): batchAutoCategorize(), detectRuleSuggestions(), getBatchJobState(), pruneOldJobs(), startBatchAutoCategorize(), suggestCategory(), decrypt(), encrypt() (+6 more)

### Community 3 - "Audit & Email"
Cohesion: 0.1
Nodes (11): fmtCurrency(), sendDigestEmail(), getResendClient(), getSmtpTransport(), sendAccountLockoutEmail(), sendMail(), sendPasswordResetEmail(), sendTestEmail() (+3 more)

### Community 4 - "Accounts Page"
Cohesion: 0.1
Nodes (5): buildGroupMap(), fmtChange(), fmtCurrency(), fmtDate(), fmtPercent()

### Community 5 - "Investment Holdings"
Cohesion: 0.15
Nodes (7): generatePendingLots(), nextRunDate(), fetchFromYahoo(), fetchPeriodReturn(), getQuote(), getQuotes(), periodStartDate()

### Community 6 - "Database Seed"
Cohesion: 0.27
Nodes (11): addMonths(), main(), maybe(), pick(), randomBetween(), randomInt(), rng(), roundCents() (+3 more)

### Community 7 - "Coverage Report UI"
Cohesion: 0.27
Nodes (11): addSortIndicators(), enableUI(), getNthColumn(), getTable(), getTableBody(), getTableHeader(), loadColumns(), loadData() (+3 more)

### Community 8 - "Transaction Splits"
Cohesion: 0.22
Nodes (8): formatMerchantName(), formatTx(), parseAmount(), parseDate(), parseImportRows(), getTransactionSplitDetails(), mapDbSplitsToLegacyDetails(), normalizeLegacySplitDetails()

### Community 9 - "Budget Page"
Cohesion: 0.17
Nodes (2): commit(), handleKeyDown()

### Community 10 - "Investments Page"
Cohesion: 0.18
Nodes (3): handleCreate(), handleSubmit(), validate()

### Community 12 - "Loan Amortization"
Cohesion: 0.35
Nodes (9): amortizationSchedule(), buildAmortizationSummary(), calcPayment(), monthlyRate(), payoffSimulator(), resolveVariableRate(), round2(), triggerRate() (+1 more)

### Community 13 - "Code Prettifier"
Cohesion: 0.35
Nodes (8): a(), B(), D(), g(), i(), k(), Q(), y()

### Community 15 - "Reports Page"
Cohesion: 0.22
Nodes (2): computeDateRange(), fmtDate()

### Community 16 - "Import & OCR Modal"
Cohesion: 0.22
Nodes (3): onDrop(), onInputChange(), handleFile()

### Community 17 - "Email Parser"
Cohesion: 0.39
Nodes (7): detectEmailSource(), parseAmazonEmail(), parseGenericEmail(), parsePayPalEmail(), parseReceiptEmail(), fetchReceiptEmails(), runImapCheckForAllHouseholds()

### Community 18 - "Gemini AI Provider"
Cohesion: 0.39
Nodes (1): GeminiProvider

### Community 19 - "Decimal Backfill Migration"
Cohesion: 0.56
Nodes (8): backfillAccounts(), backfillBudgets(), backfillGoals(), backfillLiabilities(), backfillManulAssets(), backfillTransactions(), runBackfill(), toDec()

### Community 20 - "Community 20"
Cohesion: 0.42
Nodes (5): addRecentSearch(), getRecentSearches(), handleKeyDown(), handleSubmit(), selectItem()

### Community 24 - "Community 24"
Cohesion: 0.29
Nodes (2): buildPayload(), handleSubmit()

### Community 27 - "Community 27"
Cohesion: 0.38
Nodes (3): handleCancel(), handleImportDone(), resetState()

### Community 28 - "Community 28"
Cohesion: 0.33
Nodes (1): AnthropicProvider

### Community 29 - "Community 29"
Cohesion: 0.4
Nodes (2): bucketLine(), fmt()

### Community 32 - "Community 32"
Cohesion: 0.7
Nodes (4): goToNext(), goToPrevious(), makeCurrent(), toggleClass()

### Community 33 - "Community 33"
Cohesion: 0.6
Nodes (3): applyActionsToTransaction(), applyActiveRulesToTransaction(), ruleMatches()

### Community 36 - "Community 36"
Cohesion: 0.6
Nodes (3): convertCurrency(), getCurrencySnapshot(), getFxRates()

### Community 40 - "Community 40"
Cohesion: 0.5
Nodes (2): handleFileChange(), isValidFile()

### Community 42 - "Community 42"
Cohesion: 0.5
Nodes (2): fmtPct(), showTooltip()

### Community 44 - "Community 44"
Cohesion: 0.5
Nodes (2): buildRows(), emptyRow()

### Community 54 - "Community 54"
Cohesion: 0.67
Nodes (2): fmtCurrency(), fmtCurrencyCompact()

### Community 58 - "Community 58"
Cohesion: 0.67
Nodes (1): OllamaProvider

### Community 59 - "Community 59"
Cohesion: 0.67
Nodes (1): OpenRouterProvider

### Community 62 - "Community 62"
Cohesion: 1.0
Nodes (2): computeGoalStatus(), formatGoal()

## Knowledge Gaps
- **Thin community `Budget Page`** (13 nodes): `commit()`, `fmtCurrency()`, `goToNext()`, `goToPrev()`, `goToToday()`, `handleAsk()`, `handleKeyDown()`, `handleSubmit()`, `progressColor()`, `remainingColor()`, `savingsRateStyle()`, `startEdit()`, `BudgetPage.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Reports Page`** (10 nodes): `ReportsPage.tsx`, `computeDateRange()`, `fmtC()`, `fmtCurrency()`, `fmtCurrencySigned()`, `fmtDate()`, `fmtPct()`, `merchantInitial()`, `netColor()`, `savingsColor()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Gemini AI Provider`** (9 nodes): `GeminiProvider`, `.complete()`, `.completeStream()`, `.constructor()`, `.getFastGenerationConfig()`, `.getSystemInstruction()`, `.toGeminiHistory()`, `.validateApiKey()`, `gemini.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 24`** (8 nodes): `TaxAccountsSection.tsx`, `alertBg()`, `alertColor()`, `buildPayload()`, `fmtCad()`, `handleSubmit()`, `openEdit()`, `resetForm()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 28`** (6 nodes): `AnthropicProvider`, `.complete()`, `.completeStream()`, `.constructor()`, `.validateApiKey()`, `anthropic.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 29`** (6 nodes): `wealth.ts`, `bucketLine()`, `detectPrevMonthIncome()`, `fmt()`, `getGoalStatus()`, `getMonthRange()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 40`** (5 nodes): `DropZone.tsx`, `downloadSample()`, `handleFileChange()`, `handleParse()`, `isValidFile()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 42`** (5 nodes): `ReportsSankeyChart.tsx`, `fmtCurrency()`, `fmtPct()`, `layoutColumn()`, `showTooltip()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 44`** (5 nodes): `SplitTransactionModal.tsx`, `buildRows()`, `emptyRow()`, `fmtCurrency()`, `SplitTransactionModal()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 54`** (4 nodes): `fmtAxisDate()`, `fmtCurrency()`, `fmtCurrencyCompact()`, `CashFlowForecast.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 58`** (3 nodes): `OllamaProvider`, `.constructor()`, `ollama.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 59`** (3 nodes): `OpenRouterProvider`, `.constructor()`, `openrouter.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 62`** (3 nodes): `computeGoalStatus()`, `formatGoal()`, `goals.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `set()` connect `Bulk Import UI` to `CSV Amount Parser`, `Auto-Categorization Engine`, `Audit & Email`, `Accounts Page`, `Investment Holdings`, `Database Seed`, `Import & OCR Modal`?**
  _High betweenness centrality (0.047) - this node is a cross-community bridge._
- **Why does `get()` connect `Bulk Import UI` to `CSV Amount Parser`, `Auto-Categorization Engine`, `Audit & Email`, `Accounts Page`, `Investment Holdings`?**
  _High betweenness centrality (0.039) - this node is a cross-community bridge._
- **Why does `buildGroupMap()` connect `Accounts Page` to `Bulk Import UI`?**
  _High betweenness centrality (0.018) - this node is a cross-community bridge._
- **Are the 23 inferred relationships involving `set()` (e.g. with `main()` and `startBatchAutoCategorize()`) actually correct?**
  _`set()` has 23 INFERRED edges - model-reasoned connections that need verification._
- **Are the 17 inferred relationships involving `get()` (e.g. with `getBatchJobState()` and `detectRuleSuggestions()`) actually correct?**
  _`get()` has 17 INFERRED edges - model-reasoned connections that need verification._
- **Should `Bulk Import UI` be split into smaller, more focused modules?**
  _Cohesion score 0.04 - nodes in this community are weakly interconnected._
- **Should `CSV Amount Parser` be split into smaller, more focused modules?**
  _Cohesion score 0.08 - nodes in this community are weakly interconnected._