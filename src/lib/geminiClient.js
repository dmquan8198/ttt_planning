// thin wrapper around Gemini's REST API (no SDK dependency — Node 18+ has
// global fetch, and this is the only call site, so pulling in
// @google/generative-ai for one request wasn't worth the extra dependency).
// Flash is free-tier eligible and plenty for an occasional manual click.
// (older Flash generations, e.g. 2.5, return 404 "no longer available to
// new users" on freshly-created API keys — verified empirically against a
// real key rather than trusted from training data, since Google retires
// model names faster than that data stays current.)
const GEMINI_MODEL = 'gemini-3.6-flash';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

// generates text from a single prompt. Throws with a message safe to show
// the user (no key/internal detail leakage) on missing config or API error.
async function generateText(prompt) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('Chưa cấu hình GEMINI_API_KEY trên server.');
  }

  const res = await fetch(`${GEMINI_URL}?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = body.error && body.error.message ? body.error.message : `HTTP ${res.status}`;
    throw new Error('Gemini API lỗi: ' + detail);
  }

  const text = body.candidates &&
    body.candidates[0] &&
    body.candidates[0].content &&
    body.candidates[0].content.parts &&
    body.candidates[0].content.parts[0] &&
    body.candidates[0].content.parts[0].text;
  if (!text) {
    throw new Error('Gemini không trả về nội dung (có thể bị chặn bởi safety filter).');
  }
  return text;
}

module.exports = { generateText };
