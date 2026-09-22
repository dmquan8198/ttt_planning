// thin wrapper around a local Ollama server — mirrors geminiClient's
// generateText(prompt) => Promise<string> interface exactly, so llmClient.js
// can swap between them with no change to the callers (chatbot/ai-assessments/
// ai-suggestions routes). OLLAMA_URL points at Ollama directly for same-machine
// use (e.g. local dev), or at scripts/ollama-bridge.js's public URL when the
// caller (e.g. a Render deployment) is remote — see that script for why a
// bridge sits in front of Ollama instead of exposing it directly.
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'qwen2.5:7b-instruct';
// only relevant when OLLAMA_URL points at the bridge — sent as a header,
// ignored by Ollama itself when calling it directly, so this is safe to
// leave set even for same-machine use.
const BRIDGE_SECRET = process.env.OLLAMA_BRIDGE_SECRET;
// Ollama defaults num_ctx to 4096 tokens regardless of what the model can
// actually handle — a chatbot prompt here (whole task/sprint/SOP dump, see
// buildChatbotContext.js) runs 15-20k+ tokens, so without this override
// most of it silently falls off the front of the context window before
// the model ever sees it (confirmed via `ollama ps` showing CONTEXT: 4096
// while a real prompt logged at 75k+ chars).
//
// 16384 was chosen empirically, not from KV-cache math: 32768 reproducibly
// HUNG this Ollama build (0.23.0) on this machine when loading a real
// ~75k-char prompt (had to `brew services restart ollama` to recover, twice
// — `ollama stop` alone wouldn't even unwedge it), while 16384 completed
// reliably (~3 min). Widening the window is a stopgap regardless of the
// number — even the successful 16384 run still miscounted tasks (confused
// SOP entries for tasks), so this doesn't fix accuracy, only reduces
// truncation. The real fix is sending less data per question (tool-calling
// plan), not chasing a bigger window.
const NUM_CTX = Number(process.env.OLLAMA_NUM_CTX) || 16384;

async function generateText(prompt) {
  let res;
  try {
    const headers = { 'Content-Type': 'application/json' };
    if (BRIDGE_SECRET) headers['X-Bridge-Secret'] = BRIDGE_SECRET;
    res = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ model: OLLAMA_MODEL, prompt, stream: false, options: { num_ctx: NUM_CTX } })
    });
  } catch (err) {
    throw new Error(`Không kết nối được Ollama tại ${OLLAMA_URL} — đã chạy \`ollama serve\` chưa?`);
  }

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = body.error || `HTTP ${res.status}`;
    throw new Error(`Ollama lỗi: ${detail} (model "${OLLAMA_MODEL}" đã pull chưa? chạy: ollama pull ${OLLAMA_MODEL})`);
  }
  if (!body.response) {
    throw new Error('Ollama không trả về nội dung.');
  }
  return body.response;
}

// one turn of tool-calling chat: sends the running message list (+ tool
// defs) and returns whatever Ollama replied with — either final text
// (message.content, tool_calls empty/absent) or a request to run one or
// more tools (message.tool_calls). The chatbot route (src/routes/chatbot.js)
// owns the loop: it appends the returned message, executes any tool_calls
// via chatbotTools.js, appends the results as role:"tool" messages, and
// calls this again — repeating until a turn comes back with no tool_calls.
async function chatWithTools(messages, tools) {
  let res;
  try {
    const headers = { 'Content-Type': 'application/json' };
    if (BRIDGE_SECRET) headers['X-Bridge-Secret'] = BRIDGE_SECRET;
    res = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ model: OLLAMA_MODEL, messages, tools, stream: false, options: { num_ctx: NUM_CTX } })
    });
  } catch (err) {
    throw new Error(`Không kết nối được Ollama tại ${OLLAMA_URL} — đã chạy \`ollama serve\` chưa?`);
  }

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = body.error || `HTTP ${res.status}`;
    throw new Error(`Ollama lỗi: ${detail} (model "${OLLAMA_MODEL}" đã pull chưa? chạy: ollama pull ${OLLAMA_MODEL})`);
  }
  if (!body.message) {
    throw new Error('Ollama không trả về nội dung.');
  }
  return body.message;
}

module.exports = { generateText, chatWithTools };
