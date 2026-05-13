import { Router, Response } from 'express';
import PDFDocument from 'pdfkit';
import ExcelJS from 'exceljs';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { buildCashFlowSummary } from '../lib/reportCashFlow';

const router = Router();

const exportQuerySchema = z.object({
  type: z.enum(['spending', 'cashflow', 'tax']),
  from: z.string().optional(),
  to: z.string().optional(),
  year: z.string().optional(),
});

function parseDateRange(from: string | undefined, to: string | undefined): { start: Date; end: Date } | null {
  if (!from || !to) return null;
  const start = new Date(from);
  const end = new Date(to);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return null;
  return { start, end };
}

function fmtCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

// ─── Data fetchers ────────────────────────────────────────────────────────────

async function getSpendingData(householdId: string, start: Date, end: Date) {
  const transactions = await prisma.transactionJournal.findMany({
    where: { householdId, date: { gte: start, lte: end }, transactionType: 'withdrawal', isHidden: false, isDeleted: false },
    include: { category: { select: { name: true, icon: true } } },
  });

  const categoryMap = new Map<string, { name: string; icon: string | null; amount: number }>();
  let total = 0;
  for (const t of transactions) {
    const abs = Math.abs(Number(t.amountDecimal));
    total += abs;
    const key = t.categoryId ?? '__uncategorized__';
    const name = t.category?.name ?? 'Uncategorized';
    const icon = t.category?.icon ?? null;
    const existing = categoryMap.get(key);
    if (existing) {
      existing.amount += abs;
    } else {
      categoryMap.set(key, { name, icon, amount: abs });
    }
  }

  const items = Array.from(categoryMap.values()).sort((a, b) => b.amount - a.amount);
  return { items, total };
}

async function getCashFlowData(householdId: string, start: Date, end: Date) {
  const transactions = await prisma.transactionJournal.findMany({
    where: { householdId, date: { gte: start, lte: end }, isHidden: false, isDeleted: false },
  });
  const summary = buildCashFlowSummary(transactions.map((t) => ({ amount: Number(t.amountDecimal), type: t.transactionType === 'deposit' ? 'income' : 'expense' })));
  const net = summary.income - summary.expense;
  const savingsRate = summary.income > 0 ? Math.round((net / summary.income) * 100) : 0;
  return { income: summary.income, expenses: summary.expense, net, savingsRate };
}

async function getTaxData(householdId: string, year: number) {
  const start = new Date(year, 0, 1);
  const end = new Date(year, 11, 31, 23, 59, 59);

  const transactions = await prisma.transactionJournal.findMany({
    where: {
      householdId,
      isHidden: false,
      date: { gte: start, lte: end },
      category: { isTaxDeductible: true },
      isDeleted: false,
    },
    include: { category: { select: { id: true, name: true, icon: true } } },
  });

  const categoryMap = new Map<string, { name: string; icon: string | null; amount: number; transactionCount: number }>();
  for (const t of transactions) {
    if (!t.category) continue;
    const key = t.category.id;
    const existing = categoryMap.get(key);
    if (existing) {
      existing.amount += Math.abs(Number(t.amountDecimal));
      existing.transactionCount += 1;
    } else {
      categoryMap.set(key, { name: t.category.name, icon: t.category.icon ?? null, amount: Math.abs(Number(t.amountDecimal)), transactionCount: 1 });
    }
  }

  const categories = Array.from(categoryMap.values()).sort((a, b) => b.amount - a.amount);
  const totalDeductible = categories.reduce((sum, c) => sum + c.amount, 0);
  return { year, categories, totalDeductible };
}

// ─── PDF export: GET /api/v1/reports/export/pdf ───────────────────────────────

router.get('/pdf', async (req: AuthRequest, res: Response) => {
  try {
    const parsed = exportQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.errors[0]?.message ?? 'Invalid query' });
    }
    const { type, from, to, year: yearStr } = parsed.data;
    const householdId = req.householdId!;

    const doc = new PDFDocument({ margin: 50 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="kuber-${type}-report.pdf"`);
    doc.pipe(res);

    const ACCENT = '#E5622A';
    const GRAY = '#666666';

    function addTitle(title: string) {
      doc.fontSize(20).fillColor(ACCENT).text(title, { align: 'left' });
      doc.moveDown(0.5);
      doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#EEEEEE').stroke();
      doc.moveDown(0.5);
    }

    function addRow(label: string, value: string, bold = false) {
      const y = doc.y;
      doc.fontSize(10)
        .fillColor(bold ? '#000000' : '#333333')
        .font(bold ? 'Helvetica-Bold' : 'Helvetica')
        .text(label, 50, y, { width: 300 })
        .text(value, 350, y, { width: 200, align: 'right' });
      doc.moveDown(0.4);
    }

    if (type === 'spending') {
      const range = parseDateRange(from, to);
      if (!range) { doc.end(); return res.status(400).json({ error: 'from and to are required for spending export' }); }
      const { items, total } = await getSpendingData(householdId, range.start, range.end);

      addTitle(`Spending Report: ${from} – ${to}`);
      doc.fontSize(10).fillColor(GRAY).text(`Generated ${new Date().toLocaleDateString()}`, { align: 'right' });
      doc.moveDown(1);

      // Header row
      doc.font('Helvetica-Bold').fontSize(10).fillColor('#000000');
      doc.text('Category', 50, doc.y, { width: 300 });
      doc.text('Amount', 350, doc.y, { width: 100, align: 'right' });
      doc.text('% of Total', 450, doc.y, { width: 95, align: 'right' });
      doc.moveDown(0.3);
      doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#DDDDDD').stroke();
      doc.moveDown(0.3);

      for (const item of items) {
        const pct = total > 0 ? Math.round((item.amount / total) * 100) : 0;
        const label = item.icon ? `${item.icon}  ${item.name}` : item.name;
        const y = doc.y;
        doc.font('Helvetica').fontSize(10).fillColor('#333333')
          .text(label, 50, y, { width: 295 })
          .text(fmtCurrency(item.amount), 350, y, { width: 100, align: 'right' })
          .text(`${pct}%`, 450, y, { width: 95, align: 'right' });
        doc.moveDown(0.4);
      }

      doc.moveDown(0.3);
      doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#AAAAAA').stroke();
      doc.moveDown(0.3);
      addRow('Total', fmtCurrency(total), true);

    } else if (type === 'cashflow') {
      const range = parseDateRange(from, to);
      if (!range) { doc.end(); return res.status(400).json({ error: 'from and to are required for cashflow export' }); }
      const data = await getCashFlowData(householdId, range.start, range.end);

      addTitle(`Cash Flow: ${from} – ${to}`);
      doc.fontSize(10).fillColor(GRAY).text(`Generated ${new Date().toLocaleDateString()}`, { align: 'right' });
      doc.moveDown(1);

      addRow('Total Income', fmtCurrency(data.income));
      addRow('Total Expenses', fmtCurrency(data.expenses));
      doc.moveDown(0.3);
      doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#AAAAAA').stroke();
      doc.moveDown(0.3);
      addRow('Net', fmtCurrency(data.net), true);
      addRow('Savings Rate', `${data.savingsRate}%`);

    } else if (type === 'tax') {
      const year = yearStr ? parseInt(yearStr, 10) : new Date().getFullYear();
      const data = await getTaxData(householdId, year);

      addTitle(`Tax Summary: ${year}`);
      doc.fontSize(10).fillColor(GRAY).text(`Generated ${new Date().toLocaleDateString()}`, { align: 'right' });
      doc.moveDown(1);

      // Header
      doc.font('Helvetica-Bold').fontSize(10).fillColor('#000000');
      doc.text('Category', 50, doc.y, { width: 300 });
      doc.text('Transactions', 350, doc.y, { width: 100, align: 'right' });
      doc.text('Amount', 450, doc.y, { width: 95, align: 'right' });
      doc.moveDown(0.3);
      doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#DDDDDD').stroke();
      doc.moveDown(0.3);

      for (const cat of data.categories) {
        const label = cat.icon ? `${cat.icon}  ${cat.name}` : cat.name;
        const y = doc.y;
        doc.font('Helvetica').fontSize(10).fillColor('#333333')
          .text(label, 50, y, { width: 295 })
          .text(String(cat.transactionCount), 350, y, { width: 100, align: 'right' })
          .text(fmtCurrency(cat.amount), 450, y, { width: 95, align: 'right' });
        doc.moveDown(0.4);
      }

      doc.moveDown(0.3);
      doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#AAAAAA').stroke();
      doc.moveDown(0.3);
      addRow('Total Deductible', fmtCurrency(data.totalDeductible), true);
    }

    doc.end();
  } catch (err) {
    req.log.error({ err }, 'exports/pdf GET');
    if (!res.headersSent) res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Excel export: GET /api/v1/reports/export/excel ──────────────────────────

router.get('/excel', async (req: AuthRequest, res: Response) => {
  try {
    const parsed = exportQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.errors[0]?.message ?? 'Invalid query' });
    }
    const { type, from, to, year: yearStr } = parsed.data;
    const householdId = req.householdId!;

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Kuber';
    workbook.created = new Date();

    const headerFill: ExcelJS.Fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE5622A' },
    };
    const headerFont: Partial<ExcelJS.Font> = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };

    function styleHeaderRow(ws: ExcelJS.Worksheet, headers: string[], widths: number[]) {
      const row = ws.addRow(headers);
      row.eachCell((cell) => {
        cell.fill = headerFill;
        cell.font = headerFont;
        cell.alignment = { vertical: 'middle' };
      });
      ws.columns.forEach((col, i) => {
        col.width = widths[i] ?? 20;
      });
    }

    if (type === 'spending') {
      const range = parseDateRange(from, to);
      if (!range) return res.status(400).json({ error: 'from and to are required for spending export' });
      const { items, total } = await getSpendingData(householdId, range.start, range.end);

      const ws = workbook.addWorksheet('Spending Report');
      styleHeaderRow(ws, ['Category', 'Amount', '% of Total'], [35, 20, 15]);

      for (const item of items) {
        const pct = total > 0 ? Math.round((item.amount / total) * 100) : 0;
        ws.addRow([item.name, item.amount, pct / 100]);
        const row = ws.lastRow!;
        (row.getCell(2) as ExcelJS.Cell).numFmt = '$#,##0.00';
        (row.getCell(3) as ExcelJS.Cell).numFmt = '0%';
      }

      // Totals row
      const totalRow = ws.addRow(['Total', total, 1]);
      totalRow.font = { bold: true };
      (totalRow.getCell(2) as ExcelJS.Cell).numFmt = '$#,##0.00';
      (totalRow.getCell(3) as ExcelJS.Cell).numFmt = '0%';

      ws.addRow([]);
      ws.addRow([`Period: ${from} – ${to}`]);
      ws.addRow([`Generated: ${new Date().toLocaleDateString()}`]);

    } else if (type === 'cashflow') {
      const range = parseDateRange(from, to);
      if (!range) return res.status(400).json({ error: 'from and to are required for cashflow export' });
      const data = await getCashFlowData(householdId, range.start, range.end);

      const ws = workbook.addWorksheet('Cash Flow');
      styleHeaderRow(ws, ['Metric', 'Amount'], [30, 20]);

      const rows = [
        ['Total Income', data.income],
        ['Total Expenses', data.expenses],
        ['Net', data.net],
        ['Savings Rate', data.savingsRate / 100],
      ];

      rows.forEach(([label, value], i) => {
        ws.addRow([label, value]);
        const row = ws.lastRow!;
        if (i < 3) {
          (row.getCell(2) as ExcelJS.Cell).numFmt = '$#,##0.00';
        } else {
          (row.getCell(2) as ExcelJS.Cell).numFmt = '0%';
        }
        if (i === 2) row.font = { bold: true };
      });

      ws.addRow([]);
      ws.addRow([`Period: ${from} – ${to}`]);
      ws.addRow([`Generated: ${new Date().toLocaleDateString()}`]);

    } else if (type === 'tax') {
      const year = yearStr ? parseInt(yearStr, 10) : new Date().getFullYear();
      const data = await getTaxData(householdId, year);

      const ws = workbook.addWorksheet('Tax Summary');
      styleHeaderRow(ws, ['Category', 'Transactions', 'Amount'], [35, 18, 20]);

      for (const cat of data.categories) {
        ws.addRow([cat.name, cat.transactionCount, cat.amount]);
        const row = ws.lastRow!;
        (row.getCell(3) as ExcelJS.Cell).numFmt = '$#,##0.00';
      }

      const totalRow = ws.addRow(['Total Deductible', '', data.totalDeductible]);
      totalRow.font = { bold: true };
      (totalRow.getCell(3) as ExcelJS.Cell).numFmt = '$#,##0.00';

      ws.addRow([]);
      ws.addRow([`Tax Year: ${data.year}`]);
      ws.addRow([`Generated: ${new Date().toLocaleDateString()}`]);
    }

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="kuber-${type}-report.xlsx"`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    req.log.error({ err }, 'exports/excel GET');
    if (!res.headersSent) res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
