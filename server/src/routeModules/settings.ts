import { Router, Response } from 'express';
import { z } from 'zod';
import { AuthRequest, requireHouseholdRole } from '../middleware/auth';
import * as settingsService from '../services/settingsService';

const router = Router();
const requireHouseholdAdmin = requireHouseholdRole(['owner', 'admin']);

// GET /api/v1/settings/profile
router.get('/profile', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const profile = await settingsService.getProfile(userId);
    return res.json(profile);
  } catch (err) {
    req.log.error({ err }, 'settings/profile GET');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/v1/settings/profile
router.put('/profile', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { firstName, lastName, timezone } = req.body;
    const profile = await settingsService.updateProfile(userId, { firstName, lastName, timezone });
    return res.json(profile);
  } catch (err) {
    req.log.error({ err }, 'settings/profile PUT');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/v1/settings/household
router.get('/household', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const household = await settingsService.getHousehold(householdId);
    return res.json(household);
  } catch (err) {
    req.log.error({ err }, 'settings/household GET');
    if (err instanceof Error && err.message.includes('not found')) {
      return res.status(404).json({ error: err.message });
    }
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/v1/settings/household
router.put('/household', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const userId = req.userId!;
    const { name, currency } = req.body;
    const household = await settingsService.updateHousehold(householdId, userId, { name, currency });
    return res.json(household);
  } catch (err) {
    req.log.error({ err }, 'settings/household PUT');
    if (err instanceof Error && err.message.includes('Only owners')) {
      return res.status(403).json({ error: err.message });
    }
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/v1/settings/household/invite
router.post('/household/invite', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const userId = req.userId!;
    const { email, role = 'member' } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'email is required' });
    }

    const result = await settingsService.inviteMember(householdId, userId, email, role);
    return res.json(result);
  } catch (err) {
    req.log.error({ err }, 'settings/household/invite POST');
    if (err instanceof Error) {
      if (err.message.includes('role must be')) return res.status(400).json({ error: err.message });
      if (err.message.includes('Only owners')) return res.status(403).json({ error: err.message });
      if (err.message.includes('already a member')) return res.status(409).json({ error: err.message });
    }
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/v1/settings/household/members/:id
router.delete('/household/members/:id', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const userId = req.userId!;
    const { id: targetUserId } = req.params;

    const result = await settingsService.removeMember(householdId, userId, targetUserId);
    return res.json(result);
  } catch (err) {
    req.log.error({ err }, 'settings/household/members DELETE');
    if (err instanceof Error) {
      if (err.message.includes('Only the owner')) return res.status(403).json({ error: err.message });
      if (err.message.includes('cannot remove themselves')) return res.status(400).json({ error: err.message });
      if (err.message.includes('not found')) return res.status(404).json({ error: err.message });
    }
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/v1/settings/household/members/:id/disable-2fa
router.post('/household/members/:id/disable-2fa', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const userId = req.userId!;
    const { id: targetUserId } = req.params;

    const result = await settingsService.disableMember2fa(householdId, userId, targetUserId);
    return res.json(result);
  } catch (err) {
    req.log.error({ err }, 'settings/household/members/disable-2fa POST');
    if (err instanceof Error) {
      if (err.message.includes('Only the owner')) return res.status(403).json({ error: err.message });
      if (err.message.includes('Use your Security')) return res.status(400).json({ error: err.message });
      if (err.message.includes('not found')) return res.status(404).json({ error: err.message });
    }
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/v1/settings/categories
router.get('/categories', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const categories = await settingsService.getCategories(householdId);
    return res.json(categories);
  } catch (err) {
    req.log.error({ err }, 'settings/categories GET');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/v1/settings/categories
router.post('/categories', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const { name, groupId, icon, type = 'expense', bucketType } = req.body;

    const category = await settingsService.createCategory(householdId, { name, groupId, icon, type, bucketType });
    return res.status(201).json(category);
  } catch (err) {
    req.log.error({ err }, 'settings/categories POST');
    if (err instanceof Error) {
      if (err.message.includes('name is required')) return res.status(400).json({ error: err.message });
      if (err.message.includes('not found')) return res.status(400).json({ error: err.message });
    }
    return res.status(500).json({ error: 'Internal server error' });
  }
});

const categoryUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  icon: z.string().optional(),
  groupId: z.string().optional().nullable(),
  isTaxDeductible: z.boolean().optional(),
  excludeFromReports: z.boolean().optional(),
  bucketType: z.enum(['needs', 'wants', 'savings', 'uncategorized']).optional(),
  type: z.enum(['income', 'expense', 'transfer']).optional(),
});

// PUT /api/v1/settings/categories/:id
router.put('/categories/:id', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const { id } = req.params;

    const parsed = categoryUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.errors[0]?.message ?? 'Invalid request' });
    }
    const { name, icon, groupId, isTaxDeductible, excludeFromReports, bucketType, type } = parsed.data;

    const category = await settingsService.updateCategory(householdId, id, {
      name,
      icon,
      groupId,
      isTaxDeductible,
      excludeFromReports,
      bucketType,
      type,
    });
    return res.json(category);
  } catch (err) {
    req.log.error({ err }, 'settings/categories PUT');
    if (err instanceof Error && err.message.includes('not found')) {
      return res.status(404).json({ error: err.message });
    }
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/v1/settings/categories/:id
router.delete('/categories/:id', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const { id } = req.params;

    const result = await settingsService.deleteCategory(householdId, id);
    return res.json(result);
  } catch (err) {
    req.log.error({ err }, 'settings/categories DELETE');
    if (err instanceof Error) {
      if (err.message.includes('not found')) return res.status(404).json({ error: err.message });
      if (err.message.includes('Cannot delete')) return res.status(400).json({ error: err.message });
    }
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Category Groups ──────────────────────────────────────────────────────────

// GET /api/v1/settings/category-groups
router.get('/category-groups', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const groups = await settingsService.getCategoryGroups(householdId);
    return res.json(groups);
  } catch (err) {
    req.log.error({ err }, 'settings/category-groups GET');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/v1/settings/category-groups
router.post('/category-groups', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const { name, type = 'expense' } = req.body;

    const group = await settingsService.createCategoryGroup(householdId, { name, type });
    return res.status(201).json(group);
  } catch (err) {
    req.log.error({ err }, 'settings/category-groups POST');
    if (err instanceof Error) {
      if (err.message.includes('name is required')) return res.status(400).json({ error: err.message });
      if (err.message.includes('type must be')) return res.status(400).json({ error: err.message });
      if (err.message.includes('already exists')) return res.status(409).json({ error: err.message });
    }
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/v1/settings/category-groups/:id
router.delete('/category-groups/:id', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const { id } = req.params;

    const result = await settingsService.deleteCategoryGroup(householdId, id);
    return res.json(result);
  } catch (err) {
    req.log.error({ err }, 'settings/category-groups DELETE');
    if (err instanceof Error) {
      if (err.message.includes('not found')) return res.status(404).json({ error: err.message });
      if (err.message.includes('Cannot delete')) return res.status(400).json({ error: err.message });
    }
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/v1/settings/tags
router.get('/tags', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const tags = await settingsService.getTags(householdId);
    return res.json(tags);
  } catch (err) {
    req.log.error({ err }, 'settings/tags GET');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/v1/settings/tags
router.post('/tags', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const { name, color } = req.body;

    const tag = await settingsService.createTag(householdId, { name, color });
    return res.status(201).json(tag);
  } catch (err) {
    req.log.error({ err }, 'settings/tags POST');
    if (err instanceof Error && err.message.includes('name is required')) {
      return res.status(400).json({ error: err.message });
    }
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/v1/settings/tags/:id
router.put('/tags/:id', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const { id } = req.params;
    const { name, color } = req.body;

    const tag = await settingsService.updateTag(householdId, id, { name, color });
    return res.json(tag);
  } catch (err) {
    req.log.error({ err }, 'settings/tags PUT');
    if (err instanceof Error) {
      if (err.message.includes('not found')) return res.status(404).json({ error: err.message });
      if (err.message.includes('must be')) return res.status(400).json({ error: err.message });
    }
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/v1/settings/tags/:id
router.delete('/tags/:id', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const { id } = req.params;

    const result = await settingsService.deleteTag(householdId, id);
    return res.json(result);
  } catch (err) {
    req.log.error({ err }, 'settings/tags DELETE');
    if (err instanceof Error && err.message.includes('not found')) {
      return res.status(404).json({ error: err.message });
    }
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Merchants ────────────────────────────────────────────────────────────────

// GET /api/v1/settings/merchants?order=TRANSACTION_COUNT|NAME
router.get('/merchants', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const order = req.query.order === 'NAME' ? 'NAME' : 'TRANSACTION_COUNT';
    const merchants = await settingsService.getMerchants(householdId, order);
    return res.json(merchants);
  } catch (err) {
    req.log.error({ err }, 'settings/merchants GET');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/v1/settings/merchants/:id
router.put('/merchants/:id', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const { id } = req.params;
    const { displayName } = req.body;

    const updated = await settingsService.updateMerchant(householdId, id, { displayName });
    return res.json(updated);
  } catch (err) {
    req.log.error({ err }, 'settings/merchants PUT');
    if (err instanceof Error) {
      if (err.message.includes('required')) return res.status(400).json({ error: err.message });
      if (err.message.includes('100 characters')) return res.status(400).json({ error: err.message });
      if (err.message.includes('not found')) return res.status(404).json({ error: err.message });
    }
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/v1/settings/merchants/:id
router.delete('/merchants/:id', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const { id } = req.params;

    const result = await settingsService.deleteMerchant(householdId, id);
    return res.json(result);
  } catch (err) {
    req.log.error({ err }, 'settings/merchants DELETE');
    if (err instanceof Error && err.message.includes('not found')) {
      return res.status(404).json({ error: err.message });
    }
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/v1/settings/notifications
router.get('/notifications', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const result = await settingsService.getNotificationPrefs(userId);
    return res.json(result);
  } catch (err) {
    req.log.error({ err }, 'settings/notifications GET');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/v1/settings/notifications
router.put('/notifications', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { preferences, lowBalanceThreshold } = req.body;

    const result = await settingsService.updateNotificationPrefs(userId, { preferences, lowBalanceThreshold });
    return res.json(result);
  } catch (err) {
    req.log.error({ err }, 'settings/notifications PUT');
    if (err instanceof Error && err.message.includes('must be an object')) {
      return res.status(400).json({ error: err.message });
    }
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/v1/settings/password
router.put('/password', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { currentPassword, newPassword } = req.body;

    const result = await settingsService.updatePassword(userId, currentPassword, newPassword);
    return res.json(result);
  } catch (err) {
    req.log.error({ err }, 'settings/password PUT');
    if (err instanceof Error) {
      if (err.message.includes('required')) return res.status(400).json({ error: err.message });
      if (err.message.includes('8 characters')) return res.status(400).json({ error: err.message });
      if (err.message.includes('not found')) return res.status(404).json({ error: err.message });
      if (err.message.includes('incorrect')) return res.status(400).json({ error: err.message });
    }
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Dashboard Layout ─────────────────────────────────────────────────────────

// GET /api/v1/settings/dashboard-layout
router.get('/dashboard-layout', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const layout = await settingsService.getDashboardLayout(userId);
    return res.json(layout);
  } catch (err) {
    req.log.error({ err }, 'settings/dashboard-layout GET');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/v1/settings/dashboard-layout
router.put('/dashboard-layout', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { layout } = req.body;

    const result = await settingsService.updateDashboardLayout(userId, layout);
    return res.json(result);
  } catch (err) {
    req.log.error({ err }, 'settings/dashboard-layout PUT');
    if (err instanceof Error) {
      if (err.message.includes('must be an array')) return res.status(400).json({ error: err.message });
      if (err.message.includes('Each layout item')) return res.status(400).json({ error: err.message });
    }
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── AI Config ────────────────────────────────────────────────────────────────

const aiConfigSchema = z.object({
  provider: z.enum(['anthropic', 'openai', 'gemini', 'openrouter', 'ollama', 'nvidia', 'custom', 'none']),
  model: z.string().optional(),
  apiKey: z.string().optional(),
  baseUrl: z.string().optional(),
  headers: z.string().optional(), // JSON string: {"Authorization": "Bearer ..."}
});

// GET /api/v1/settings/ai-config
router.get('/ai-config', requireHouseholdAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const config = await settingsService.getAiConfig(householdId);
    return res.json(config);
  } catch (err) {
    req.log.error({ err }, 'settings/ai-config GET');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/v1/settings/ai-config
router.put('/ai-config', requireHouseholdAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const parsed = aiConfigSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.errors[0]?.message ?? 'Invalid request' });
    }
    const { provider, model, apiKey, baseUrl, headers } = parsed.data;

    const config = await settingsService.updateAiConfig(householdId, { provider, model, apiKey, baseUrl, headers });
    return res.json(config);
  } catch (err) {
    req.log.error({ err }, 'settings/ai-config PUT');
    if (err instanceof Error) {
      if (err.message.includes('Unsafe') || err.message.includes('Headers')) {
        return res.status(400).json({ error: err.message });
      }
    }
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/v1/settings/ai-config/test
router.post('/ai-config/test', requireHouseholdAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const result = await settingsService.testAiConfig(householdId);
    return res.json(result);
  } catch (err) {
    req.log.error({ err }, 'settings/ai-config/test POST');
    return res.json({ valid: false, error: 'Connection test failed' });
  }
});

// GET /api/v1/settings/watch-tickers
router.get('/watch-tickers', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const result = await settingsService.getWatchTickers(userId);
    return res.json(result);
  } catch (err) {
    req.log.error({ err }, 'settings/watch-tickers GET');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/v1/settings/watch-tickers
router.put('/watch-tickers', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { tickers } = req.body;

    const result = await settingsService.updateWatchTickers(userId, tickers);
    return res.json(result);
  } catch (err) {
    req.log.error({ err }, 'settings/watch-tickers PUT');
    if (err instanceof Error && err.message.includes('Invalid')) {
      return res.status(400).json({ error: err.message });
    }
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/v1/settings/account — self-service account deletion
router.delete('/account', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const householdId = req.householdId!;

    const deleteSchema = z.object({ confirmPassword: z.string().min(1) });
    const parse = deleteSchema.safeParse(req.body);
    if (!parse.success) return res.status(400).json({ error: 'confirmPassword is required' });

    const result = await settingsService.deleteAccount(userId, householdId, parse.data.confirmPassword);
    res.clearCookie('refreshToken');
    return res.json(result);
  } catch (err) {
    req.log.error({ err }, 'settings/account DELETE');
    if (err instanceof Error) {
      if (err.message.includes('required')) return res.status(400).json({ error: err.message });
      if (err.message.includes('not found')) return res.status(404).json({ error: err.message });
      if (err.message.includes('Incorrect')) return res.status(400).json({ error: err.message });
      if (err.message.includes('Transfer ownership')) return res.status(400).json({ error: err.message });
    }
    return res.status(500).json({ error: 'Failed to delete account' });
  }
});

// GET /api/v1/settings/export — full data export as multi-sheet Excel workbook
router.get('/export', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const workbook = await settingsService.exportHouseholdData(householdId);

    // Stream the workbook
    const fileName = `kuber-export-${new Date().toISOString().split('T')[0]}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    await workbook.xlsx.write(res);
    return res.end();
  } catch (err) {
    req.log.error({ err }, 'settings/export GET');
    return res.status(500).json({ error: 'Failed to generate export' });
  }
});

// ─── Email Config ─────────────────────────────────────────────────────────────

const emailConfigSchema = z.object({
  provider: z.enum(['resend', 'smtp', 'none']),
  resendApiKey: z.string().optional(),
  resendFrom: z.string().optional(),
  smtpHost: z.string().optional(),
  smtpPort: z.number().int().min(1).max(65535).optional(),
  smtpUser: z.string().optional(),
  smtpPass: z.string().optional(),
  smtpFrom: z.string().optional(),
});

// GET /api/v1/settings/email-config
router.get('/email-config', requireHouseholdAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const config = await settingsService.getEmailConfig();
    return res.json(config);
  } catch (err) {
    req.log.error({ err }, 'settings/email-config GET');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/v1/settings/email-config
router.put('/email-config', requireHouseholdAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const parsed = emailConfigSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0]?.message ?? 'Invalid request' });
    const { provider, resendApiKey, resendFrom, smtpHost, smtpPort, smtpUser, smtpPass, smtpFrom } = parsed.data;

    const config = await settingsService.updateEmailConfig({
      provider,
      resendApiKey,
      resendFrom,
      smtpHost,
      smtpPort,
      smtpUser,
      smtpPass,
      smtpFrom,
    });
    return res.json(config);
  } catch (err) {
    req.log.error({ err }, 'settings/email-config PUT');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/v1/settings/email/test
router.post('/email/test', requireHouseholdAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const result = await settingsService.testEmailConfig(userId);
    return res.json(result);
  } catch (err) {
    req.log.error({ err }, 'settings/email/test');
    if (err instanceof Error && err.message.includes('not found')) {
      return res.status(404).json({ error: err.message });
    }
    return res.status(500).json({ error: 'Failed to send test email. Check your email configuration.' });
  }
});

export default router;
