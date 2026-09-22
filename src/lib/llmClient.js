// picks which backend generateText() delegates to. LLM_PROVIDER=ollama routes
// to a local Ollama server (see ollamaClient.js) for local/dev use; anything
// else — including unset, the case on Render today — keeps using Gemini, so
// a deployment has to opt into local inference explicitly rather than
// silently losing the chatbot because no Ollama server is reachable there.
const gemini = require('./geminiClient');
const ollama = require('./ollamaClient');

// LLM_DEBUG=1 prints every prompt sent and reply received to stdout — off
// by default so Render's logs don't fill up with full task/sprint dumps on
// every chatbot message, but the thing to turn on locally when tuning
// SYSTEM_INSTRUCTION/buildChatbotContext against what the model actually
// received.
async function generateText(prompt) {
  const useOllama = process.env.LLM_PROVIDER === 'ollama';
  const impl = useOllama ? ollama : gemini;
  const debug = process.env.LLM_DEBUG === '1';
  const startedAt = Date.now();
  if (debug) {
    console.log(`\n[llm] → provider=${useOllama ? 'ollama' : 'gemini'} prompt (${prompt.length} ký tự):\n${prompt}\n`);
  }
  try {
    const reply = await impl.generateText(prompt);
    if (debug) {
      console.log(`[llm] ← trả lời (${Date.now() - startedAt}ms, ${reply.length} ký tự):\n${reply}\n`);
    }
    return reply;
  } catch (err) {
    if (debug) {
      console.log(`[llm] ✗ lỗi sau ${Date.now() - startedAt}ms: ${err.message}\n`);
    }
    throw err;
  }
}

// only Ollama implements tool-calling today (see ollamaClient.chatWithTools
// and chatbotTools.js) — Gemini support would need its own function-calling
// wiring (different request/response shape), not built yet. Callers (just
// chatbot.js) check this and fall back to the plain generateText +
// full-context-dump path when it's false, so Gemini/Render keeps working
// exactly as before.
function supportsTools() {
  return process.env.LLM_PROVIDER === 'ollama';
}

async function chatWithTools(messages, tools) {
  const debug = process.env.LLM_DEBUG === '1';
  const startedAt = Date.now();
  if (debug) {
    console.log(`\n[llm-tools] → ${messages.length} messages, ${tools.length} tools. Last message:\n${JSON.stringify(messages[messages.length - 1], null, 2)}\n`);
  }
  try {
    const reply = await ollama.chatWithTools(messages, tools);
    if (debug) {
      console.log(`[llm-tools] ← (${Date.now() - startedAt}ms):\n${JSON.stringify(reply, null, 2)}\n`);
    }
    return reply;
  } catch (err) {
    if (debug) {
      console.log(`[llm-tools] ✗ lỗi sau ${Date.now() - startedAt}ms: ${err.message}\n`);
    }
    throw err;
  }
}

module.exports = { generateText, supportsTools, chatWithTools };
