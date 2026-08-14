const { Router } = require('express');
const { asyncHandler } = require('../lib/asyncHandler');

// hardcoded for now — the user plans to add a configurable "prompt system"
// later, so this stays a single well-named builder function rather than
// something inlined, to make that swap-in straightforward when it comes.
// Output follows the classic User Story / Connextra template ("Là ..., tôi
// muốn ..., để ...") per the user's explicit choice of framework — forces
// the model to name a role and a benefit instead of just paraphrasing the
// task name back as prose.
function buildWhyPrompt({ name, category, platform }) {
  return (
    'Bạn là trợ lý PM cho dự án "Túi Thần Tài" (tích hợp ví điện tử/ngân hàng, các bên liên quan TVAM/VCB/MoMo). ' +
    'Viết lý do/mục tiêu của nghiệp vụ sau đây theo ĐÚNG format User Story (Connextra), bằng tiếng Việt, CHỈ MỘT CÂU DUY NHẤT theo cấu trúc:\n' +
    '"Là [vai trò], tôi muốn [mục tiêu], để [lý do/lợi ích]."\n\n' +
    'Tự suy luận vai trò phù hợp nhất từ ngữ cảnh nghiệp vụ (có thể là khách hàng dùng app/ví, đội vận hành/CS, đội kỹ thuật, ' +
    'đối tác ngân hàng/ví điện tử...) — không dùng "người dùng" chung chung nếu có vai trò cụ thể hơn phù hợp hơn. ' +
    'Không lặp lại y nguyên tên nghiệp vụ, không thêm tiêu đề, markdown, hay giải thích gì khác ngoài đúng 1 câu theo format trên.\n\n' +
    `Tên nghiệp vụ: ${name}\n` +
    (category ? `Category: ${category}\n` : '') +
    (platform ? `Platform: ${platform}\n` : '')
  );
}

// generateFn: (prompt: string) => Promise<string> — same DI shape as
// aiAssessmentsRouter, so tests never make a real network call.
function aiSuggestionsRouter(generateFn) {
  const router = Router();

  // no role gate: compute-only, writes nothing — the drawer's own save
  // flow is what actually persists a task, and that already requires
  // editor+ (see tasks.js). Matches ai-assessments/generate's convention.
  router.post('/why', asyncHandler(async (req, res) => {
    const name = (req.body.name || '').trim();
    if (!name) {
      return res.status(400).json({ error: 'Tên nghiệp vụ không được để trống' });
    }
    const category = (req.body.category || '').trim();
    const platform = (req.body.platform || '').trim();
    const prompt = buildWhyPrompt({ name, category, platform });

    let content;
    try {
      content = await generateFn(prompt);
    } catch (err) {
      return res.status(502).json({ error: err.message || 'Không gọi được LLM.' });
    }
    res.json({ content: content.trim() });
  }));

  return router;
}

module.exports = aiSuggestionsRouter;
