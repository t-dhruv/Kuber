CREATE TABLE "advice_topics" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "icon" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "advice_topics_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "advice_topics_slug_key" ON "advice_topics"("slug");

CREATE TABLE "advice_tasks" (
    "id" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "advice_tasks_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "advice_tasks" ADD CONSTRAINT "advice_tasks_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "advice_topics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "user_advice_progress" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "user_advice_progress_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "user_advice_progress_householdId_taskId_key" ON "user_advice_progress"("householdId", "taskId");
ALTER TABLE "user_advice_progress" ADD CONSTRAINT "user_advice_progress_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "advice_topics"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_advice_progress" ADD CONSTRAINT "user_advice_progress_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "advice_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
