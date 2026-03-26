import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { getAiClientForHousehold } from '../lib/ai';
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

  // SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  let aborted = false;
  req.on('close', () => {
    aborted = true;
  });

  try {
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

    // 5. Call AI with streaming
    let responseContent = '';
    try {
      const client = await getAiClientForHousehold(householdId, prisma);

      const result = await client.completeStream(
        { messages, systemPrompt, maxTokens: 1024, temperature: 0.7 },
        (token: string) => {
          if (aborted) return;
          responseContent += token;
          res.write(`data: ${JSON.stringify({ token })}\n\n`);
        },
      );

      // Use the full result content as the canonical saved text (provider may differ slightly)
      responseContent = result.content;
    } catch (aiErr: unknown) {
      const errMsg = aiErr instanceof Error ? aiErr.message : String(aiErr);
      const isNotConfigured =
        errMsg.includes('not configured') || errMsg.includes('provider not configured');

      responseContent = isNotConfigured
        ? "I'm not configured yet. Go to Settings → AI Advisor to choose your AI provider (Claude, OpenAI, Gemini, Ollama, or OpenRouter) and add your API key."
        : 'I encountered an error processing your request. Please try again.';

      if (!isNotConfigured) {
        console.error('[advisor/chat/stream] AI error:', errMsg);
      }

      if (!aborted) {
        res.write(`data: ${JSON.stringify({ error: responseContent })}\n\n`);
        res.end();
        return;
      }
      return;
    }

    if (aborted) return;

    // 6. Save messages to DB
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

    // 7. Get the saved assistant message id for the client
    const savedMsg = await prisma.conversationMessage.findFirst({
      where: { conversationId: convId, role: 'assistant' },
      orderBy: { createdAt: 'desc' },
    });

    res.write(`data: ${JSON.stringify({ done: true, conversationId: convId, messageId: savedMsg?.id })}\n\n`);
    res.end();
  } catch (err) {
    console.error('[advisor/chat/stream]', err);
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
