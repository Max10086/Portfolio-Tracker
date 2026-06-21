import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

type Provider = 'deepseek' | 'gemini' | 'kimi';

interface RequestBody {
  mode?: 'review' | 'title';
  provider?: Provider;
  model?: string;
  userNotes?: string;
  promptTemplate?: string;
  timeRange?: '7d' | '30d' | '90d' | '365d';
  summary?: unknown;
  reviewOutput?: string;
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Unknown error';
}

async function fetchJsonWithRetry(
  input: string,
  init: RequestInit,
  options?: { retries?: number; timeoutMs?: number; retryDelayMs?: number }
) {
  const retries = options?.retries ?? 2;
  const timeoutMs = options?.timeoutMs ?? 90000;
  const retryDelayMs = options?.retryDelayMs ?? 1000;
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(input, {
        ...init,
        signal: controller.signal,
      });
      clearTimeout(timeout);
      const payload = await response.json().catch(() => ({}));
      return { response, payload };
    } catch (error) {
      clearTimeout(timeout);
      lastError = error;
      if (attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs * attempt));
      }
    }
  }

  throw new Error(`Upstream request failed after retries: ${errorMessage(lastError)}`);
}

const DEFAULT_PROMPT_TEMPLATE = `
你是极其严苛且洞察力极强的资深交易教练与行为金融分析师。
我将提供我近期的完整交易历史（包含盈亏记录）。请不要给我任何关于具体点位、指标或微观操作的战术建议，我需要的是极其冷酷、一针见血的深度行为复盘，以打破我的认知盲区并引发深度反思。

分析核心与视角：

非受迫性失误（可避免的亏损）： 穿透数据，指出哪些亏损纯粹是由于操作变形、情绪化或违背常识造成的低级错误。

利润敞口（可放大的盈利）： 找出那些方向正确但因为过早下车、仓位管理怯懦等行为，导致未能实现利润最大化的交易，并剖析背后的心理或逻辑成因。

致命行为模式： 从近期盈亏分布中，提炼出我当前最危险的 1-2 个下意识交易习惯。

输出原则：

拒绝啰嗦与安抚： 语言要求极度精炼、客观、甚至刺耳。不需要泛泛而谈的废话。

用数据打脸： 每一个反思结论，必须直接引用我提供的数据记录作为核心证据。

指明战略方向： 不需要给我设定具体的“触发条件”或“检查清单”，只需给我极简的、宏观层面的纠偏方向。

请严格按照以下格式输出：

1. 交易者行为画像与盈亏归因
（用 1-2 句话，基于数据一针见血地概括本周期内的核心交易状态与盈亏本质）

2. 必须斩断的非受迫性失误
错误模式 A： （描述错误） | 数据证据： （如：X月X日某笔交易） | 反思刺透： （为什么会犯这个错）

错误模式 B： （描述错误） | 数据证据： （如：X笔连续亏损） | 反思刺透： （潜意识在害怕或贪婪什么）

3. 被自我扼杀的利润扩张点
错失的杠杆： （指出哪类交易本可以赚更多）

行为变形点： （分析是因为盯盘太紧、拿不住单，还是仓位错配等原因）

4. 下阶段战略纠偏方向
（只给 1-3 条最核心的思维或系统调整方向，极简，不需要具体战术步骤）`;

function buildPrompt(summary: unknown, promptTemplate: string, userNotes: string) {
  return `请遵循以下数据使用规则：
1) historical_context = 长期背景，用于识别习惯/风格/性格与结构性偏差。
2) focus_context = 本次复盘主焦点，必须优先分析该窗口内 trades_in_range 的具体交易。
3) 结论中请明确区分“长期背景判断”和“本次窗口判断”。

${promptTemplate}

附加用户说明（可为空）：
${userNotes || '无'}

结构化摘要：
${JSON.stringify(summary, null, 2)}
`;
}

async function callDeepSeek(prompt: string, model: string, apiKey: string) {
  const { response, payload } = await fetchJsonWithRetry(
    'https://api.deepseek.com/chat/completions',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: 'You are a professional quant trading review assistant.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.2,
        max_tokens: 1800,
      }),
    },
    { retries: 2, timeoutMs: 90000 }
  );
  if (!response.ok) throw new Error(payload?.error?.message || 'DeepSeek request failed');
  return payload?.choices?.[0]?.message?.content || '';
}

async function callKimi(prompt: string, model: string, apiKey: string) {
  // kimi-k2.6 currently expects default temperature behavior; passing custom
  // temperature can return "only 1 is allowed".
  const { response, payload } = await fetchJsonWithRetry(
    'https://api.moonshot.cn/v1/chat/completions',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'system',
            content:
              'You are a professional quant trading review assistant. Return final answer directly in Chinese, do not output internal thinking steps.',
          },
          { role: 'user', content: prompt },
        ],
        thinking: { type: 'disabled' },
        max_tokens: 3000,
      }),
    },
    { retries: 3, timeoutMs: 120000 }
  );
  if (!response.ok) throw new Error(payload?.error?.message || 'Kimi request failed');
  const message = payload?.choices?.[0]?.message || {};
  const content = typeof message?.content === 'string' ? message.content.trim() : '';
  const reasoningContent =
    typeof message?.reasoning_content === 'string' ? message.reasoning_content.trim() : '';
  const output = content || reasoningContent;
  if (!output) {
    throw new Error(
      `Kimi returned empty output (finish_reason: ${payload?.choices?.[0]?.finish_reason || 'unknown'})`
    );
  }
  return output;
}

async function callGemini(prompt: string, model: string, apiKey: string) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const { response, payload } = await fetchJsonWithRetry(
    url,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
      }),
    },
    { retries: 2, timeoutMs: 90000 }
  );
  if (!response.ok) throw new Error(payload?.error?.message || 'Gemini request failed');
  const text = payload?.candidates?.[0]?.content?.parts?.[0]?.text;
  return text || '';
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as RequestBody;
    const mode = body.mode || 'review';
    const provider: Provider = body.provider || 'deepseek';
    const userNotes = body.userNotes?.trim() || '';
    const promptTemplate = body.promptTemplate?.trim() || DEFAULT_PROMPT_TEMPLATE;
    const timeRange = body.timeRange || '30d';
    let analysis = '';
    let model = body.model || '';

    if (provider === 'deepseek') {
      const apiKey = process.env.DEEPSEEK_API_KEY;
      if (!apiKey) {
        return NextResponse.json(
          { error: 'Missing DEEPSEEK_API_KEY in environment variables.' },
          { status: 400 }
        );
      }
      model = model || 'deepseek-v4-flash';
      if (mode === 'title') {
        const source = (body.reviewOutput || '').slice(0, 4000);
        const titlePrompt = `请根据以下交易复盘内容，生成一个非常简短的中文标题（不超过12个字），仅返回标题本身，不要标点，不要解释。\n\n复盘内容：\n${source}`;
        analysis = await callDeepSeek(titlePrompt, model, apiKey);
      } else {
        const hasInlineSummary =
          body.summary !== null && typeof body.summary === 'object' && !Array.isArray(body.summary);
        let summaryPayload: unknown = body.summary;
        if (!hasInlineSummary) {
          const summaryUrl = new URL('/api/analytics/llm-summary', request.url);
          summaryUrl.searchParams.set('timeRange', timeRange);
          const summaryResponse = await fetch(summaryUrl.toString(), {
            cache: 'no-store',
            headers: { 'Cache-Control': 'no-cache' },
          });
          summaryPayload = await summaryResponse.json().catch(() => ({}));
          if (!summaryResponse.ok) {
            return NextResponse.json(
              {
                error: 'Failed to load analytics summary',
                details:
                  (summaryPayload as { error?: string })?.error || `HTTP ${summaryResponse.status}`,
              },
              { status: 500 }
            );
          }
        }
        const prompt = buildPrompt(summaryPayload, promptTemplate, userNotes);
        analysis = await callDeepSeek(prompt, model, apiKey);
        return NextResponse.json({
          provider,
          model,
          timeRange,
          generatedAt: new Date().toISOString(),
          analysis,
          summary: summaryPayload,
        });
      }
    } else if (provider === 'gemini') {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return NextResponse.json(
          { error: 'Missing GEMINI_API_KEY in environment variables.' },
          { status: 400 }
        );
      }
      model = model || 'gemini-3.5-flash';
      if (mode === 'title') {
        const source = (body.reviewOutput || '').slice(0, 4000);
        const titlePrompt = `请根据以下交易复盘内容，生成一个非常简短的中文标题（不超过12个字），仅返回标题本身，不要标点，不要解释。\n\n复盘内容：\n${source}`;
        analysis = await callGemini(titlePrompt, model, apiKey);
      } else {
        const hasInlineSummary =
          body.summary !== null && typeof body.summary === 'object' && !Array.isArray(body.summary);
        let summaryPayload: unknown = body.summary;
        if (!hasInlineSummary) {
          const summaryUrl = new URL('/api/analytics/llm-summary', request.url);
          summaryUrl.searchParams.set('timeRange', timeRange);
          const summaryResponse = await fetch(summaryUrl.toString(), {
            cache: 'no-store',
            headers: { 'Cache-Control': 'no-cache' },
          });
          summaryPayload = await summaryResponse.json().catch(() => ({}));
          if (!summaryResponse.ok) {
            return NextResponse.json(
              {
                error: 'Failed to load analytics summary',
                details:
                  (summaryPayload as { error?: string })?.error || `HTTP ${summaryResponse.status}`,
              },
              { status: 500 }
            );
          }
        }
        const prompt = buildPrompt(summaryPayload, promptTemplate, userNotes);
        analysis = await callGemini(prompt, model, apiKey);
        return NextResponse.json({
          provider,
          model,
          timeRange,
          generatedAt: new Date().toISOString(),
          analysis,
          summary: summaryPayload,
        });
      }
    } else {
      const apiKey = process.env.KIMI_API_KEY;
      if (!apiKey) {
        return NextResponse.json(
          { error: 'Missing KIMI_API_KEY in environment variables.' },
          { status: 400 }
        );
      }
      model = model || 'kimi-k2.6';
      if (mode === 'title') {
        const source = (body.reviewOutput || '').slice(0, 4000);
        const titlePrompt = `请根据以下交易复盘内容，生成一个非常简短的中文标题（不超过12个字），仅返回标题本身，不要标点，不要解释。\n\n复盘内容：\n${source}`;
        analysis = await callKimi(titlePrompt, model, apiKey);
      } else {
        const hasInlineSummary =
          body.summary !== null && typeof body.summary === 'object' && !Array.isArray(body.summary);
        let summaryPayload: unknown = body.summary;
        if (!hasInlineSummary) {
          const summaryUrl = new URL('/api/analytics/llm-summary', request.url);
          summaryUrl.searchParams.set('timeRange', timeRange);
          const summaryResponse = await fetch(summaryUrl.toString(), {
            cache: 'no-store',
            headers: { 'Cache-Control': 'no-cache' },
          });
          summaryPayload = await summaryResponse.json().catch(() => ({}));
          if (!summaryResponse.ok) {
            return NextResponse.json(
              {
                error: 'Failed to load analytics summary',
                details:
                  (summaryPayload as { error?: string })?.error || `HTTP ${summaryResponse.status}`,
              },
              { status: 500 }
            );
          }
        }
        const prompt = buildPrompt(summaryPayload, promptTemplate, userNotes);
        analysis = await callKimi(prompt, model, apiKey);
        return NextResponse.json({
          provider,
          model,
          timeRange,
          generatedAt: new Date().toISOString(),
          analysis,
          summary: summaryPayload,
        });
      }
    }

    return NextResponse.json({
      provider,
      model,
      generatedAt: new Date().toISOString(),
      title: analysis.replace(/[。！!?.\n\r]/g, '').trim().slice(0, 20),
    });
  } catch (error) {
    console.error('[ai-review] failed to generate review:', error);
    return NextResponse.json(
      {
        error: 'AI review generation failed',
        details: errorMessage(error),
      },
      { status: 500 }
    );
  }
}
