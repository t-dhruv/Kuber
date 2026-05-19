import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import adviceRouter from '../../src/routes/advice';
import { prisma } from '../../src/lib/prisma';

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    adviceTopic: {
      findMany: vi.fn(),
    },
    adviceTask: {
      findFirst: vi.fn(),
    },
    userAdviceProgress: {
      findUnique: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    req.householdId = 'hh-1';
    req.log = { error: vi.fn(), child: () => req.log };
    next();
  });
  app.use('/advice', adviceRouter);
  return app;
}

describe('advice routes', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns topics with household completion state', async () => {
    vi.mocked(prisma.adviceTopic.findMany).mockResolvedValue([
      {
        id: 'topic-1',
        slug: 'emergency-fund',
        title: 'Emergency fund',
        description: 'Build a cash buffer',
        category: 'basics',
        icon: 'shield',
        sortOrder: 1,
        tasks: [
          { id: 'task-1', title: 'Open savings', description: 'Create the account', sortOrder: 1 },
          { id: 'task-2', title: 'Save first $100', description: 'Start small', sortOrder: 2 },
        ],
        progress: [{ taskId: 'task-2', completedAt: new Date('2026-05-01T00:00:00.000Z') }],
      },
    ] as any);

    const res = await request(makeApp()).get('/advice/topics');

    expect(res.status).toBe(200);
    expect(prisma.adviceTopic.findMany).toHaveBeenCalledWith(expect.objectContaining({
      include: expect.objectContaining({
        progress: { where: { householdId: 'hh-1' } },
      }),
    }));
    expect(res.body[0]).toMatchObject({
      id: 'topic-1',
      completedCount: 1,
      totalTasks: 2,
    });
    expect(res.body[0].tasks[1].completedAt).toBe('2026-05-01T00:00:00.000Z');
  });

  it('completes an advice task when no progress exists', async () => {
    vi.mocked(prisma.adviceTask.findFirst).mockResolvedValue({ id: 'task-1', topicId: 'topic-1' } as any);
    vi.mocked(prisma.userAdviceProgress.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.userAdviceProgress.create).mockResolvedValue({
      completedAt: new Date('2026-05-02T00:00:00.000Z'),
    } as any);

    const res = await request(makeApp()).put('/advice/topics/topic-1/tasks/task-1');

    expect(res.status).toBe(200);
    expect(prisma.userAdviceProgress.create).toHaveBeenCalledWith({
      data: { householdId: 'hh-1', topicId: 'topic-1', taskId: 'task-1' },
    });
    expect(res.body).toEqual({ completed: true, completedAt: '2026-05-02T00:00:00.000Z' });
  });

  it('rejects toggles for tasks outside the topic', async () => {
    vi.mocked(prisma.adviceTask.findFirst).mockResolvedValue(null);

    const res = await request(makeApp()).put('/advice/topics/topic-1/tasks/missing-task');

    expect(res.status).toBe(404);
    expect(prisma.userAdviceProgress.create).not.toHaveBeenCalled();
    expect(prisma.userAdviceProgress.delete).not.toHaveBeenCalled();
  });

  it('uncompletes an existing advice task for the household', async () => {
    vi.mocked(prisma.adviceTask.findFirst).mockResolvedValue({ id: 'task-1', topicId: 'topic-1' } as any);
    vi.mocked(prisma.userAdviceProgress.findUnique).mockResolvedValue({ id: 'progress-1' } as any);
    vi.mocked(prisma.userAdviceProgress.delete).mockResolvedValue({} as any);

    const res = await request(makeApp()).put('/advice/topics/topic-1/tasks/task-1');

    expect(res.status).toBe(200);
    expect(prisma.userAdviceProgress.delete).toHaveBeenCalledWith({
      where: { householdId_taskId: { householdId: 'hh-1', taskId: 'task-1' } },
    });
    expect(res.body).toEqual({ completed: false, completedAt: null });
  });
});


