// api/scan-invoice.js
// Vercel serverless function — proxies invoice image to Claude API.
// Keeps the Anthropic API key server-side (set as ANTHROPIC_API_KEY in Vercel env vars).
// Called from the Finance portal browser with a base64 image payload.

export default async function handler(req, res) {
  // CORS — only allow the Finance portal origin
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { image_base64, media_type } = req.body;

  if (!image_base64 || !media_type) {
    return res.status(400).json({ error: 'image_base64 and media_type are required' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured in Vercel environment variables' });
  }

  const prompt = `Extract invoice data and return ONLY valid JSON (no markdown, no explanation, no extra text):
{
  "supplier_name": "...",
  "invoice_number": "...",
  "invoice_date": "YYYY-MM-DD",
  "invoice_month": "Mon-YY",
  "description": "...",
  "hours": null,
  "rate_per_hour": null,
  "sub_total": 0,
  "vat_rate": 0,
  "vat_amount": 0,
  "total_amount": 0,
  "payment_terms": 30
}

Rules:
- invoice_date must be YYYY-MM-DD format
- invoice_month like "Aug-26" (3-letter month + 2-digit year)
- hours and rate_per_hour: null if not shown
- payment_terms: 30 unless explicitly stated otherwise
- vat_rate: percentage number (0 or 5), not a string
- All amounts as plain numbers, no currency symbols
- Return ONLY the JSON object, nothing else`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1000,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: media_type,
                  data: image_base64,
                },
              },
              {
                type: 'text',
                text: prompt,
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return res.status(response.status).json({ error: `Claude API error: ${errText}` });
    }

    const data = await response.json();
    const rawText = data.content?.[0]?.text || '{}';

    // Strip any accidental markdown fences
    const clean = rawText.replace(/```json|```/g, '').trim();

    let parsed;
    try {
      parsed = JSON.parse(clean);
    } catch (e) {
      return res.status(200).json({ error: 'Claude returned non-JSON: ' + rawText, raw: rawText });
    }

    return res.status(200).json({ result: parsed });

  } catch (err) {
    return res.status(500).json({ error: err.message || String(err) });
  }
}
