// Thin Anthropic Messages call. Temperature 0 always; model from config with optional
// per-call override. Returns raw text + token usage so cost can be attributed.

import {
  ANTHROPIC_URL,
  ANTHROPIC_VERSION,
  MAX_TOKENS,
  MODEL,
  TEMPERATURE,
  costOf,
} from "./config.js";

export interface AnthropicResult {
  text: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUSD: number;
}

type ContentBlock =
  | { type: "text"; text: string }
  | { type: "image"; source: { type: "base64"; media_type: string; data: string } };

function dataUrlToImageBlock(dataUrl: string): ContentBlock {
  const m = dataUrl.match(/^data:(.*?);base64,(.*)$/s);
  const media_type = m ? m[1] : "image/jpeg";
  const data = m ? m[2] : dataUrl.replace(/^data:.*?,/, "");
  return { type: "image", source: { type: "base64", media_type, data } };
}

export async function callAnthropic(opts: {
  apiKey: string;
  model?: string;
  text: string;
  images: string[];
}): Promise<AnthropicResult> {
  const model = opts.model || MODEL;
  const content: ContentBlock[] = [
    ...opts.images.map(dataUrlToImageBlock),
    { type: "text", text: opts.text },
  ];

  const res = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": opts.apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model,
      max_tokens: MAX_TOKENS,
      temperature: TEMPERATURE,
      messages: [{ role: "user", content }],
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`anthropic ${res.status}: ${body.slice(0, 300)}`);
  }
  const data = (await res.json()) as {
    content?: { type: string; text?: string }[];
    usage?: { input_tokens?: number; output_tokens?: number };
    model?: string;
  };
  const text = (data.content || [])
    .filter((b) => b.type === "text")
    .map((b) => b.text || "")
    .join("\n");
  const inputTokens = data.usage?.input_tokens ?? 0;
  const outputTokens = data.usage?.output_tokens ?? 0;
  return {
    text,
    model: data.model || model,
    inputTokens,
    outputTokens,
    costUSD: costOf(data.model || model, inputTokens, outputTokens),
  };
}
