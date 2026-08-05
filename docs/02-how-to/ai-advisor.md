# Configuring the AI advisor

Kuber can answer questions about your own finances through an AI provider you
choose and pay for. It is **off by default** and entirely optional — every other
feature works without it.

Configure it under **Settings → Integrations**.

## Before you decide

Using a hosted provider means your financial data leaves your Instance. The
advisor sends a summary of your books — balances, spending by Category, and
similar aggregates — to whichever provider you configure, so that it can answer
about them. Self-hosting Kuber does not make that request private.

If that is not acceptable, you have two honest options: leave the advisor set to
**None (disabled)**, or point it at a model running on hardware you control via
the Ollama or Custom options below.

## Requirement: AI_ENCRYPTION_KEY

API keys are encrypted at rest with `AI_ENCRYPTION_KEY` from your environment. It
must be exactly 64 hex characters, and it is required in production:

```bash
openssl rand -hex 32
```

The same key also encrypts IMAP connector passwords and webhook signing secrets.
If you change it, previously stored secrets can no longer be decrypted.

## Choose a provider

| Option | Needs | Notes |
|---|---|---|
| **None (disabled)** | — | The default. |
| **Claude (Anthropic)** | API key from `console.anthropic.com` | |
| **OpenAI (GPT)** | API key from `platform.openai.com` | |
| **Google Gemini** | API key from `aistudio.google.com` | |
| **OpenRouter** | API key from `openrouter.ai/keys` | Routes to many models. |
| **Nvidia NIM** | API key from `build.nvidia.com` | |
| **Ollama (local)** | A base URL | No API key needed. Nothing leaves your network. |
| **Custom API endpoint** | A base URL | Any OpenAI-compatible API. Optional key and custom headers. |

Each provider carries a default model, which you can override. For Ollama the
base URL is typically `http://localhost:11434/v1`; note that from inside the
server container, `localhost` is the container, not your host.

Save, and the section reports **Configured** with the provider and model in use.

## Using it

**Ask Kuber** — the chat, reachable from the floating button, for questions about
your own books. Unconfigured, it says so and links to Settings.

**AI Budget Coach** — on the Budget page, analyses the current month. See
[Budgets](budget.md).

**AI Review** — under Money in the sidebar, proposes Categories for Transactions
that need review. Suggestions are proposals; nothing is applied until you accept
it.

Recurring AI work — proactive insights, investment intel and wealth analysis —
is off unless enabled under **Settings → System → AI Features**. These run on a schedule
and consume provider credit without you asking, so turn them on deliberately.

## Cost

You are billed by your provider, not by Kuber. The scheduled jobs above are the
ones that can run up a bill unattended.

## If it will not answer

- The section shows **Configured**, not None.
- `AI_ENCRYPTION_KEY` is set and 64 hex characters — without it, the key cannot
  be decrypted and every call fails.
- The model name is one your provider actually serves.
- For Ollama or a custom endpoint, the base URL is reachable *from the server
  container*.

## Verify

- Settings → Integrations shows "Configured" with your provider and model.
- Ask Kuber answers a question about your own data rather than showing the
  configure prompt.
