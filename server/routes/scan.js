const express = require('express');
const router = express.Router();

const EXTRACTION_PROMPT = `Extract the following fields from this business card image and return them as JSON only, no other text:
{
  "first_name": "",
  "last_name": "",
  "company_name": "",
  "title": "",
  "email": "",
  "phone": "",
  "mobile": "",
  "website": "",
  "linkedin_url": ""
}
If a field is not visible on the card, return an empty string for that field. Return only valid JSON.`;

// POST /api/scan/business-card
// Sends a base64 card photo to the Anthropic vision API and returns the
// extracted contact fields. The frontend pre-populates a Research Queue
// record with these for human review — nothing is saved to the CRM here.
router.post('/business-card', async (req, res) => {
  try {
    const { image, mediaType } = req.body;

    if (!image) {
      return res.status(400).json({ success: false, error: 'No image provided' });
    }
    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(500).json({ success: false, error: 'ANTHROPIC_API_KEY is not configured on the server' });
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-opus-4-20250514',
        max_tokens: 500,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mediaType || 'image/jpeg',
                data: image,
              },
            },
            { type: 'text', text: EXTRACTION_PROMPT },
          ],
        }],
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      console.error('[SCAN] Anthropic API error', response.status, detail);
      return res.status(502).json({ success: false, error: 'Failed to extract card data' });
    }

    const data = await response.json();
    const text = data.content?.[0]?.text || '';
    const clean = text.replace(/```json|```/g, '').trim();
    const extracted = JSON.parse(clean);

    res.json({ success: true, data: extracted });
  } catch (err) {
    console.error('[SCAN] Failed to extract card data:', err.message);
    res.status(500).json({ success: false, error: 'Failed to extract card data' });
  }
});

module.exports = router;
