import { Router, Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { getAiClientForHousehold } from '../lib/ai';
import { getChatContext } from '../lib/ai/context';
import { chatSystemPrompt } from '../lib/ai/prompts';
import type { AiMessage } from '../lib/ai/types';

const router = Router();

// ─── POST /api/v1/advisor/chat ────────────────────────────────────────────────

router.post('/chat', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const userId = req.userId!;
    const { message, conversationId } = req.body as { message?: string; conversationId?: string };

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'message is required' });
    }

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
