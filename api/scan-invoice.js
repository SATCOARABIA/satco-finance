export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { image_base64, media_type } = req.body;
  if (!image_base64 || !media_type) return res.status(400).json({ error: 'Missing fields' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not set in Vercel' });

  const prompt = `Extract invoice data and return ONLY valid JSON:\n{"supplier_name":"...","invoice_number":"...","invoice_date":"YYYY-MM-DD","invoice_month":"Mon-YY","description":"...","hours":null,"rate_per_hour":null,"sub_total":0,"vat_rate":0,"vat_amount":0,"total_amount":0,"payment_terms":30}\nRules: invoice_date=YYYY-MM-DD, invoice_month like Aug-26, vat_rate is a number (0 or 5), all amounts plain numbers, return ONLY the JSON.`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6', max_tokens: 1000,
        messages: [{ role: 'user', content: [
          { type: 'image', source: { type: 'base64', media_type, data: image_base64 } },
          { type: 'text', text: prompt }
        ]}]
      })
    });
    if (!response.ok) { const e = await response.text(); return res.status(response.status).json({ error: e }); }
    const data = await response.json();
    const raw = data.content?.[0]?.text || '{}';
    try { return res.status(200).json({ result: JSON.parse(raw.replace(/```json|```/g,'').trim()) }); }
    catch { return res.status(200).json({ error: 'Bad JSON: ' + raw }); }
  } catch (err) { return res.status(500).json({ error: err.message }); }
}
