import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { getAiClient, getAiClientForHousehold } from '../lib/ai';
import { getChatContext } from '../lib/ai/context';
import { chatSystemPrompt } from '../lib/ai/prompts';
import type { AiMessage } from '../lib/ai/types';

const router = Router();

const chatBodySchema = z.object({
  message: z.string().min(1, 'message is required'),
  conversationId: z.string().optional(),
});

// ─── POST /api/v1/advisor/chat/stream ─────────────────────────────────────────

router.post('/chat/stream', async (req: AuthRequest, res: Response) => {
  const parse = chatBodySchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: parse.error.issues[0]?.message ?? 'Invalid request' });
    return;
  }

  const { message, conversationId } = parse.data;
  const householdId = req.householdId!;
  const userId = req.userId!;

  // SSE headers — disable all proxy/CDN buffering so tokens reach client immediately
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // disables nginx proxy_buffering for this response
  res.flushHeaders();

  const controller = new AbortController();
  let aborted = false;

  req.on('close', () => {
    aborted = true;
    controller.abort();
  });

  // SSE keepalive — prevents proxy timeouts during long AI responses
  const keepalive = setInterval(() => {
    if (!aborted) res.write(':keepalive\n\n');
  }, 15_000);

  const cleanup = () => clearInterval(keepalive);

  try {
    // 1. Check AI config first — fail fast before building context
    const aiConfig = await prisma.aiConfig.findUnique({ where: { householdId } });
    if (!aiConfig || aiConfig.provider === 'none') {
      res.write(`data: ${JSON.stringify({ error: "I'm not configured yet. Go to Settings → AI Advisor to choose your AI provider (Claude, OpenAI, Gemini, Ollama, or OpenRouter) and add your API key." })}\n\n`);
      cleanup();
      res.end();
      return;
    }
    const client = getAiClient(aiConfig);

    // 2. Get or create conversation
    let conversation = conversationId
      ? await prisma.conversation.findFirst({ where: { id: conversationId, householdId } })
      : null;

    if (!conversation) {
      conversation = await prisma.conversation.create({
        data: { householdId, userId, title: message.slice(0, 60) },
      });
    }

    const convId = conversation.id;

    // 3. Fetch last 20 messages for history + financial context in parallel
    const [history, ctx] = await Promise.all([
      prisma.conversationMessage.findMany({
        where: { conversationId: convId },
        orderBy: { createdAt: 'asc' },
        take: 20,
      }),
      getChatContext(prisma, householdId),
    ]);

    // 4. Build messages array
    const systemPrompt = chatSystemPrompt(ctx);
    const historyMessages: AiMessage[] = history.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));
    const messages: AiMessage[] = [
      ...historyMessages,
      { role: 'user', content: message },
    ];

    // 5. Stream AI response — accumulate tokens via onToken callback
    let responseContent = '';
    const streamTimeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('AI request timed out after 60s')), 60_000)
    );
    await Promise.race([
      client.completeStream(
        { messages, systemPrompt, maxTokens: 2048, temperature: 0.7, signal: controller.signal },
        (token: string) => {
          if (aborted) return;
          responseContent += token;
          res.write(`data: ${JSON.stringify({ token })}\n\n`);
        },
      ),
      streamTimeout,
    ]);

    if (aborted) { cleanup(); return; }

    // 6. Save messages to DB — wrapped so a DB error doesn't crash the SSE response
    try {
      await prisma.conversationMessage.createMany({
        data: [
          { conversationId: convId, role: 'user', content: message },
          { conversationId: convId, role: 'assistant', content: responseContent },
        ],
      });

      // Update conversation timestamp / title
      if (!conversationId) {
        await prisma.conversation.update({
          where: { id: convId },
          data: { title: message.slice(0, 60), updatedAt: new Date() },
        });
      } else {
        await prisma.conversation.update({
          where: { id: convId },
          data: { updatedAt: new Date() },
        });
      }
    } catch (dbErr) {
      console.error('[advisor/chat/stream] DB save error:', dbErr);
    }

    // 7. Get the saved assistant message id for the client
    const savedMsg = await prisma.conversationMessage.findFirst({
      where: { conversationId: convId, role: 'assistant' },
      orderBy: { createdAt: 'desc' },
    }).catch(() => null);

    res.write(`data: ${JSON.stringify({ done: true, conversationId: convId, messageId: savedMsg?.id })}\n\n`);
    cleanup();
    res.end();
  } catch (err) {
    console.error('[advisor/chat/stream]', err);
    cleanup();
    if (!aborted) {
      res.write(`data: ${JSON.stringify({ error: 'Internal server error' })}\n\n`);
      res.end();
    }
  }
});

// ─── POST /api/v1/advisor/chat ────────────────────────────────────────────────

router.post('/chat', async (req: AuthRequest, res: Response) => {
  try {
    const parse = chatBodySchema.safeParse(req.body);
    if (!parse.success) {
      return res.status(400).json({ error: parse.error.issues[0]?.message ?? 'Invalid request' });
    }
    const { message, conversationId } = parse.data;
    const householdId = req.householdId!;
    const userId = req.userId!;

    // 1. Get or create conversation
    let conversation = conversationId
      ? await prisma.conversation.findFirst({
          where: { id: conversationId, householdId },
        })
      : null;

    if (!conversation) {
      conversation = await prisma.conversation.create({
        data: {
          householdId,
          userId,
          title: message.slice(0, 60),
        },
      });
    }

    const convId = conversation.id;

    // 2. Fetch last 20 messages for history
    const history = await prisma.conversationMessage.findMany({
      where: { conversationId: convId },
      orderBy: { createdAt: 'asc' },
      take: 20,
    });

    // 3. Build financial context
    const ctx = await getChatContext(prisma, householdId);

    // 4. Build messages array
    const systemPrompt = chatSystemPrompt(ctx);
    const historyMessages: AiMessage[] = history.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));
    const messages: AiMessage[] = [
      ...historyMessages,
      { role: 'user', content: message },
    ];

    // 5 & 6. Try to get AI client — return friendly message if not configured
    let responseContent: string;
    try {
      const client = await getAiClientForHousehold(householdId, prisma);

      // 7. Call AI
      const result = await client.complete({
        messages,
        systemPrompt,
        maxTokens: 1024,
        temperature: 0.7,
      });
      responseContent = result.content;
    } catch (aiErr: unknown) {
      const errMsg = aiErr instanceof Error ? aiErr.message : String(aiErr);
      const isNotConfigured =
        errMsg.includes('not configured') || errMsg.includes('provider not configured');

      if (isNotConfigured) {
        responseContent =
          "I'm not configured yet. Go to Settings → AI Advisor to choose your AI provider (Claude, OpenAI, Gemini, Ollama, or OpenRouter) and add your API key.";
      } else {
        console.error('[advisor/chat] AI error:', errMsg);
        responseContent = 'I encountered an error processing your request. Please try again.';
      }
    }

    // 8. Save user message and assistant response
    await prisma.conversationMessage.createMany({
      data: [
        { conversationId: convId, role: 'user', content: message },
        { conversationId: convId, role: 'assistant', content: responseContent },
      ],
    });

    // Update conversation title if it was just created (use first user message)
    if (!conversationId) {
      await prisma.conversation.update({
        where: { id: convId },
        data: { title: message.slice(0, 60), updatedAt: new Date() },
      });
    } else {
      await prisma.conversation.update({
        where: { id: convId },
        data: { updatedAt: new Date() },
      });
    }

    // 9. Return response
    return res.json({
      conversationId: convId,
      message: responseContent,
    });
  } catch (err) {
    console.error('[advisor/chat]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── POST /api/v1/advisor/conversations ──────────────────────────────────────
// List conversations for the household

router.get('/conversations', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;

    const conversations = await prisma.conversation.findMany({
      where: { householdId },
      orderBy: { updatedAt: 'desc' },
      take: 50,
      include: {
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    const result = conversations.map((c) => ({
      id: c.id,
      title: c.title,
      updatedAt: c.updatedAt.toISOString(),
      lastMessage: c.messages[0]?.content.slice(0, 100) ?? '',
    }));

    return res.json(result);
  } catch (err) {
    console.error('[advisor/conversations]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── GET /api/v1/advisor/conversations/:id/messages ──────────────────────────

router.get('/conversations/:id/messages', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const { id } = req.params;

    // Verify conversation belongs to household
    const conversation = await prisma.conversation.findFirst({
      where: { id, householdId },
    });

    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    const messages = await prisma.conversationMessage.findMany({
      where: { conversationId: id },
      orderBy: { createdAt: 'asc' },
    });

    return res.json(
      messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        createdAt: m.createdAt.toISOString(),
      }))
    );
  } catch (err) {
    console.error('[advisor/conversations/:id/messages]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── DELETE /api/v1/advisor/conversations/:id ─────────────────────────────────

// ─── POST /api/v1/advisor/budget-coach/stream ─────────────────────────────────
// Streaming budget coach: receives current month's budget data and asks for advice.
// Uses the same SSE pattern as /chat/stream but without conversation persistence.

const budgetCoachSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/, 'month must be YYYY-MM'),
  question: z.string().max(500).optional(),
});

router.post('/budget-coach/stream', async (req: AuthRequest, res: Response) => {
  const parse = budgetCoachSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: parse.error.issues[0]?.message ?? 'Invalid request' });
    return;
  }

  const { month, question } = parse.data;
  const householdId = req.householdId!;

  // SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  let aborted = false;
  req.on('close', () => { aborted = true; });

  try {
    const aiConfig = await prisma.aiConfig.findUnique({ where: { householdId } });
    if (!aiConfig || aiConfig.provider === 'none') {
      res.write(`data: ${JSON.stringify({ error: "I'm not configured yet. Go to Settings → AI Advisor to choose your AI provider." })}\n\n`);
      res.end();
      return;
    }
    const client = getAiClient(aiConfig);

    // Fetch budget data for the requested month
    const [year, mon] = month.split('-').map(Number);
    const startDate = new Date(year, mon - 1, 1);
    const endDate = new Date(year, mon, 0, 23, 59, 59);

    const [budgets, transactions, categories] = await Promise.all([
      prisma.budget.findMany({
        where: { householdId },
        include: { category: { select: { name: true, emoji: true } } },
      }),
      prisma.transaction.findMany({
        where: { householdId, date: { gte: startDate, lte: endDate }, isHidden: false },
        select: { amount: true, categoryId: true, description: true },
      }),
      prisma.category.findMany({
        where: { householdId },
        select: { id: true, name: true, type: true },
      }),
    ]);

    // Aggregate actuals per category
    const actualMap = new Map<string, number>();
    for (const t of transactions) {
      if (t.categoryId) {
        actualMap.set(t.categoryId, (actualMap.get(t.categoryId) ?? 0) + Math.abs(t.amount));
      }
    }

    const totalIncome = transactions.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0);
    const totalSpent = transactions.filter((t) => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);

    const budgetSummary = budgets.map((b) => {
      const actual = actualMap.get(b.categoryId ?? '') ?? 0;
      const over = actual > b.amount;
      return `${b.category?.emoji ?? ''} ${b.category?.name ?? 'Unknown'}: budgeted $${b.amount.toFixed(0)}, spent $${actual.toFixed(0)}${over ? ' ⚠️ OVER' : ''}`;
    }).join('\n');

    const uncategorized = transactions.filter((t) => !t.categoryId && t.amount < 0).length;

    const systemPrompt = `You are a helpful personal finance coach. Be concise, warm, and actionable. Focus on the most important 2-3 insights.`;
    const userMsg = question
      ? `${question}\n\nBudget for ${month}:\nIncome: $${totalIncome.toFixed(0)}\nTotal spent: $${totalSpent.toFixed(0)}\n${budgetSummary}\nUncategorized transactions: ${uncategorized}`
      : `Review my ${month} budget and give me 2-3 specific, actionable tips:\nIncome: $${totalIncome.toFixed(0)}\nTotal spent: $${totalSpent.toFixed(0)}\n${budgetSummary}\nUncategorized transactions: ${uncategorized}`;

    const messages: AiMessage[] = [{ role: 'user', content: userMsg }];

    const budgetStreamTimeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('AI request timed out after 30s')), 30_000)
    );
    await Promise.race([
      client.completeStream(
        { messages, systemPrompt, maxTokens: 512, temperature: 0.7 },
        (token: string) => {
          if (aborted) return;
          res.write(`data: ${JSON.stringify({ token })}\n\n`);
        },
      ),
      budgetStreamTimeout,
    ]);

    if (!aborted) {
      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    }
    res.end();
  } catch (err) {
    console.error('[advisor/budget-coach/stream]', err);
    if (!aborted) {
      res.write(`data: ${JSON.stringify({ error: 'AI request failed. Please try again.' })}\n\n`);
      res.end();
    }
  }
});

router.delete('/conversations/:id', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const { id } = req.params;

    const conversation = await prisma.conversation.findFirst({
      where: { id, householdId },
    });

    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    await prisma.conversation.delete({ where: { id } });

    return res.json({ message: 'Deleted' });
  } catch (err) {
    console.error('[advisor/conversations/:id delete]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
