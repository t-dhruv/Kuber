/**
 * emailParser.ts
 * Parses Amazon order confirmation and PayPal receipt emails into transaction records.
 */

export interface ParsedEmailTransaction {
  description: string;
  amount: number;
  date: string;
  source: 'amazon' | 'paypal' | 'generic';
  reference?: string;
}

/**
 * Detect email source from sender address and subject.
 */
export function detectEmailSource(from: string, subject: string): 'amazon' | 'paypal' | 'generic' {
  const f = from.toLowerCase();
  const s = subject.toLowerCase();
  if (f.includes('amazon.com') || f.includes('amazon.ca') || s.includes('amazon order')) return 'amazon';
  if (f.includes('paypal.com') || s.includes('paypal')) return 'paypal';
  return 'generic';
}

/**
 * Parse Amazon order confirmation email HTML/text.
 * Extracts: order total, order date, order number.
 */
export function parseAmazonEmail(text: string, html: string): ParsedEmailTransaction | null {
  const content = html || text;

  // Order total — various Amazon formats
  const totalPatterns = [
    /order total[:\s]*\$?([\d,]+\.?\d{0,2})/i,
    /grand total[:\s]*\$?([\d,]+\.?\d{0,2})/i,
    /total[:\s]*(?:cad|usd|can)?\s*\$?([\d,]+\.?\d{0,2})/i,
    /charged[:\s]*\$?([\d,]+\.?\d{0,2})/i,
  ];

  let amount: number | null = null;
  for (const pattern of totalPatterns) {
    const match = content.match(pattern);
    if (match) {
      amount = parseFloat(match[1].replace(/,/g, ''));
      if (amount > 0) break;
    }
  }
  if (!amount) return null;

  // Order number
  const orderMatch = content.match(/order[#\s]*(?:number)?[:\s#]*([0-9-]{10,})/i);
  const reference = orderMatch?.[1];

  // Date — look for "Placed on" or "Order date"
  const datePatterns = [
    /(?:placed on|order date)[:\s]*([\w]+ \d{1,2},? \d{4})/i,
    /(\w+ \d{1,2}, \d{4})/,
  ];
  let date = new Date().toISOString().slice(0, 10);
  for (const pattern of datePatterns) {
    const match = content.match(pattern);
    if (match) {
      const parsed = new Date(match[1]);
      if (!isNaN(parsed.getTime())) {
        date = parsed.toISOString().slice(0, 10);
        break;
      }
    }
  }

  return {
    description: `Amazon Order${reference ? ` #${reference}` : ''}`,
    amount: -amount, // expense
    date,
    source: 'amazon',
    reference,
  };
}

/**
 * Parse PayPal receipt email HTML/text.
 * Extracts: payment amount, recipient, date, transaction ID.
 */
export function parsePayPalEmail(text: string, html: string): ParsedEmailTransaction | null {
  const content = html || text;

  // Amount patterns
  const amountPatterns = [
    /you (?:sent|paid)[^$]*\$?([\d,]+\.?\d{0,2})/i,
    /amount[:\s]*(?:usd|cad)?\s*\$?([\d,]+\.?\d{0,2})/i,
    /payment of[:\s]*\$?([\d,]+\.?\d{0,2})/i,
    /total[:\s]*\$?([\d,]+\.?\d{0,2})/i,
  ];

  let amount: number | null = null;
  for (const pattern of amountPatterns) {
    const match = content.match(pattern);
    if (match) {
      amount = parseFloat(match[1].replace(/,/g, ''));
      if (amount > 0) break;
    }
  }
  if (!amount) return null;

  // Recipient
  const recipientMatch = content.match(/(?:to|sent to|paid to)[:\s]+([A-Za-z][^\n<]{2,40})/i);
  const recipient = recipientMatch?.[1]?.trim().replace(/<.*>/, '').trim();

  // Transaction ID
  const txnIdMatch = content.match(/transaction (?:id|number)[:\s#]*([A-Z0-9]{10,})/i);
  const reference = txnIdMatch?.[1];

  // Date
  const dateMatch = content.match(/(\w+ \d{1,2}, \d{4})/);
  let date = new Date().toISOString().slice(0, 10);
  if (dateMatch) {
    const parsed = new Date(dateMatch[1]);
    if (!isNaN(parsed.getTime())) date = parsed.toISOString().slice(0, 10);
  }

  return {
    description: `PayPal${recipient ? ` — ${recipient}` : ' Payment'}`,
    amount: -amount,
    date,
    source: 'paypal',
    reference,
  };
}

/**
 * Generic email transaction parser — tries to extract any dollar amount.
 */
export function parseGenericEmail(subject: string, text: string): ParsedEmailTransaction | null {
  const content = text;
  const match = content.match(/\$\s*([\d,]+\.?\d{0,2})/);
  if (!match) return null;
  const amount = parseFloat(match[1].replace(/,/g, ''));
  if (!amount || amount > 50000) return null;

  return {
    description: subject.slice(0, 100) || 'Email transaction',
    amount: -amount,
    date: new Date().toISOString().slice(0, 10),
    source: 'generic',
  };
}

/**
 * Main entry point — detect source and parse accordingly.
 */
export function parseReceiptEmail(
  from: string,
  subject: string,
  text: string,
  html: string
): ParsedEmailTransaction | null {
  const source = detectEmailSource(from, subject);
  if (source === 'amazon') return parseAmazonEmail(text, html);
  if (source === 'paypal') return parsePayPalEmail(text, html);
  return parseGenericEmail(subject, text);
}
