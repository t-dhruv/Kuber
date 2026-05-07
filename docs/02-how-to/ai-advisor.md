# How-to: Configure AI Advisor

## Goal
Set up Kuber's AI Advisor to chat about your finances using your choice of AI provider.

## Supported Providers

| Provider | Best For | Notes |
|----------|----------|-------|
| **Claude (Anthropic)** | High-quality financial reasoning | Requires API key from console.anthropic.com |
| **OpenAI** | Fast responses, widely supported | Requires API key from platform.openai.com |
| **Google Gemini** | Generous free tier | Requires API key from ai.google.dev |
| **OpenRouter** | Access to dozens of models via one API | Requires API key from openrouter.ai |
| **Ollama** | Fully local, no data leaves server | Requires Ollama installed on your server |

> **Don't want AI?** You can disable this feature entirely — go to Settings → Integrations → AI Advisor → Disable.

---

## Steps (Cloud Provider)

### 1. Get Your API Key

Go to your chosen provider's dashboard and create an API key:

- **Claude:** [console.anthropic.com](https://console.anthropic.com)
- **OpenAI:** [platform.openai.com](https://platform.openai.com)
- **Gemini:** [ai.google.dev](https://ai.google.dev)
- **OpenRouter:** [openrouter.ai](https://openrouter.ai)

### 2. Configure in Kuber

1. Log in to Kuber
2. Go to **Settings → Integrations → AI Advisor**
3. Select your **Provider** from the dropdown
4. Paste your **API Key**
5. (Optional) Select a specific **Model** (recommended: `claude-sonnet-4-6` for Claude, `gpt-4o` for OpenAI)
6. Click **Save & Test**

If the test succeeds, you're ready to chat!

---

## Steps (Local Ollama)

### 1. Install Ollama on Your Server

```bash
curl -fsSL https://ollama.com/install.sh | sh
```

### 2. Pull a Model

```bash
ollama pull llama3.2        # General purpose
ollama pull mistral         # Fast and efficient
```

### 3. Configure in Kuber

1. Go to **Settings → Integrations → AI Advisor**
2. Select **Ollama** as provider
3. Enter your server's URL: `http://your-server-ip:11434` (default Ollama port)
4. Select a model from the dropdown
5. Click **Save & Test**

---

## Using the AI Advisor

1. Click **Advisor** in the sidebar
2. Type a question, for example:
   - "How much did I spend on food last month?"
   - "What's my savings rate?"
   - "Should I increase my emergency fund?"
3. The AI reads your accounts, transactions, budgets, and goals to give contextual advice
4. Start a **New Conversation** anytime to reset the context

---

## Privacy & Security

- Your API key is stored **encrypted** in the Kuber database
- The key is **never logged** or transmitted anywhere except to your chosen provider
- Ollama runs **entirely on your server** — no data leaves your machine
- Custom API endpoints receive your prompt and financial context. Kuber blocks private/reserved network targets server-side, but you should only configure endpoints you operate or trust.
- You can **disable or delete** the AI Advisor configuration at any time

---

## Confirmation

- AI Advisor shows as **Configured** in Settings → Integrations
- Clicking **Test Connection** returns success
- You can chat with the Advisor and get responses based on your financial data

## Troubleshooting

| Problem | Solution |
|----------|----------|
| **"Connection failed" error** | Check that your API key is correct and has sufficient credits/quota with the provider. |
| **Responses are slow** | Claude and OpenAI may take a few seconds. For faster responses, try a smaller model. |
| **Ollama not connecting** | Ensure Ollama is running: `curl http://localhost:11434/api/tags`. Check firewall allows the port. |
| **AI gives wrong info about my finances** | The AI has read-only access to your data. If it's wrong, check that your transactions and accounts are up to date. |
