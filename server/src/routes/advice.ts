import { Router, Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';

const router = Router();

// GET /api/v1/advice/topics
// Returns all topics with tasks and per-household completion status
router.get('/topics', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;

    const topics = await prisma.adviceTopic.findMany({
      orderBy: { sortOrder: 'asc' },
      include: {
        tasks: {
          orderBy: { sortOrder: 'asc' },
        },
        progress: {
          where: { householdId },
        },
      },
    });

    const result = topics.map((topic) => {
      const completedTaskIds = new Set(topic.progress.map((p) => p.taskId));
      return {
        id: topic.id,
        slug: topic.slug,
        title: topic.title,
        description: topic.description,
        category: topic.category,
        icon: topic.icon,
        sortOrder: topic.sortOrder,
        tasks: topic.tasks.map((task) => {
          const progressEntry = topic.progress.find((p) => p.taskId === task.id);
          return {
            id: task.id,
            title: task.title,
            description: task.description,
            sortOrder: task.sortOrder,
            completedAt: progressEntry ? progressEntry.completedAt.toISOString() : null,
          };
        }),
        completedCount: completedTaskIds.size,
        totalTasks: topic.tasks.length,
      };
    });

    res.json(result);
  } catch (err) {
    console.error('[advice] GET /topics error:', err);
    res.status(500).json({ error: 'Failed to load advice topics' });
  }
});

// PUT /api/v1/advice/topics/:topicId/tasks/:taskId
// Toggle task completion
router.put('/topics/:topicId/tasks/:taskId', async (req: AuthRequest, res: Response) => {
  try {
    const { topicId, taskId } = req.params;
    const householdId = req.householdId!;

    // Verify the task belongs to the topic
    const task = await prisma.adviceTask.findFirst({
      where: { id: taskId, topicId },
    });
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const existing = await prisma.userAdviceProgress.findUnique({
      where: { householdId_taskId: { householdId, taskId } },
    });

    if (existing) {
      // Uncomplete
      await prisma.userAdviceProgress.delete({
        where: { householdId_taskId: { householdId, taskId } },
      });
      return res.json({ completed: false, completedAt: null });
    } else {
      // Complete
      const progress = await prisma.userAdviceProgress.create({
        data: { householdId, topicId, taskId },
      });
      return res.json({ completed: true, completedAt: progress.completedAt.toISOString() });
    }
  } catch (err) {
    console.error('[advice] PUT /topics/:topicId/tasks/:taskId error:', err);
    res.status(500).json({ error: 'Failed to toggle task' });
  }
});

export default router;
