/**
 * Unified AI client — routes to Anthropic (Claude) or Google (Gemini)
 * based on the model string prefix.
 *
 * All callers use callAiWithPdf() or callAiText() and receive a
 * normalised AiResponse regardless of which provider handles the request.
 */

import Anthropic from '@anthropic-ai/sdk'
import { GoogleGenerativeAI } from '@google/generative-ai'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AiResponse {
  text:  string
  usage: { inputTokens: number; outputTokens: number }
}

// ── Routing helper ────────────────────────────────────────────────────────────

export function isGeminiModel(model: string): boolean {
  return model.startsWith('gemini-')
}

// ── Model catalogue (used by Settings UI and pricing) ─────────────────────────

export const AI_MODELS: { value: string; label: string; provider: 'anthropic' | 'google' }[] = [
  { value: 'claude-sonnet-4-6',         label: 'Claude Sonnet 4.6 — empfohlen',       provider: 'anthropic' },
  { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5 — schnell & günstig', provider: 'anthropic' },
  { value: 'gemini-3-flash-preview',     label: 'Gemini 3 Flash — Google, schnell',         provider: 'google' },
  { value: 'gemini-3.1-pro-preview',    label: 'Gemini 3.1 Pro — Google, leistungsstark',  provider: 'google' },
]

// ── PDF analysis ──────────────────────────────────────────────────────────────

export async function callAiWithPdf(params: {
  model:        string
  systemPrompt: string
  userPrompt:   string
  pdfBase64:    string
  maxTokens?:   number
}): Promise<AiResponse> {
  return isGeminiModel(params.model)
    ? geminiWithPdf(params)
    : anthropicWithPdf(params)
}

// ── Multi-PDF analysis (two or more documents in one call) ───────────────────

export async function callAiWithMultiplePdfs(params: {
  model:        string
  systemPrompt: string
  userPrompt:   string
  pdfsBase64:   string[]   // array of base64-encoded PDFs, sent as separate document blocks
  maxTokens?:   number
}): Promise<AiResponse> {
  // Gemini: send each PDF as an inlineData part
  if (isGeminiModel(params.model)) {
    const genAI = getGeminiClient()
    const geminiModel = genAI.getGenerativeModel({
      model:             params.model,
      systemInstruction: params.systemPrompt,
    })
    const parts = [
      ...params.pdfsBase64.map(b64 => ({ inlineData: { data: b64, mimeType: 'application/pdf' as const } })),
      { text: params.userPrompt },
    ]
    const result = await geminiModel.generateContent({
      contents: [{ role: 'user', parts }],
      generationConfig: { maxOutputTokens: params.maxTokens ?? 8192 },
    })
    const meta = result.response.usageMetadata
    return {
      text:  result.response.text(),
      usage: { inputTokens: meta?.promptTokenCount ?? 0, outputTokens: meta?.candidatesTokenCount ?? 0 },
    }
  }

  // Anthropic: each PDF becomes a separate 'document' content block
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
  const content: Anthropic.MessageParam['content'] = [
    ...params.pdfsBase64.map(b64 => ({
      type: 'document' as const,
      source: { type: 'base64' as const, media_type: 'application/pdf' as const, data: b64 },
    })),
    { type: 'text' as const, text: params.userPrompt },
  ]
  const res = await client.messages.create({
    model:      params.model,
    max_tokens: params.maxTokens ?? 8192,
    system:     params.systemPrompt,
    messages:   [{ role: 'user', content }],
  })
  return {
    text:  res.content[0].type === 'text' ? res.content[0].text : '',
    usage: { inputTokens: res.usage.input_tokens, outputTokens: res.usage.output_tokens },
  }
}

// ── Text-only analysis (no PDF) ───────────────────────────────────────────────

export async function callAiText(params: {
  model:      string
  prompt:     string
  maxTokens?: number
}): Promise<AiResponse> {
  return isGeminiModel(params.model)
    ? geminiText(params)
    : anthropicText(params)
}

// ── Anthropic implementation ──────────────────────────────────────────────────

async function anthropicWithPdf(params: {
  model: string; systemPrompt: string; userPrompt: string; pdfBase64: string; maxTokens?: number
}): Promise<AiResponse> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
  const res = await client.messages.create({
    model:      params.model,
    max_tokens: params.maxTokens ?? 8192,
    system:     params.systemPrompt,
    messages: [{
      role: 'user',
      content: [
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: params.pdfBase64 } },
        { type: 'text', text: params.userPrompt },
      ],
    }],
  })
  return {
    text:  res.content[0].type === 'text' ? res.content[0].text : '',
    usage: { inputTokens: res.usage.input_tokens, outputTokens: res.usage.output_tokens },
  }
}

async function anthropicText(params: {
  model: string; prompt: string; maxTokens?: number
}): Promise<AiResponse> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
  const res = await client.messages.create({
    model:      params.model,
    max_tokens: params.maxTokens ?? 2048,
    messages: [{ role: 'user', content: params.prompt }],
  })
  return {
    text:  res.content[0].type === 'text' ? res.content[0].text : '',
    usage: { inputTokens: res.usage.input_tokens, outputTokens: res.usage.output_tokens },
  }
}

// ── Gemini implementation ─────────────────────────────────────────────────────

function getGeminiClient() {
  const key = process.env.GEMINI_API_KEY
  if (!key) throw new Error('GEMINI_API_KEY is not set. Please add it to your environment variables.')
  return new GoogleGenerativeAI(key)
}

async function geminiWithPdf(params: {
  model: string; systemPrompt: string; userPrompt: string; pdfBase64: string; maxTokens?: number
}): Promise<AiResponse> {
  const genAI = getGeminiClient()
  const model = genAI.getGenerativeModel({
    model:             params.model,
    systemInstruction: params.systemPrompt,
  })
  const result = await model.generateContent({
    contents: [{
      role: 'user',
      parts: [
        { inlineData: { data: params.pdfBase64, mimeType: 'application/pdf' } },
        { text: params.userPrompt },
      ],
    }],
    generationConfig: { maxOutputTokens: params.maxTokens ?? 8192 },
  })
  const meta = result.response.usageMetadata
  return {
    text:  result.response.text(),
    usage: {
      inputTokens:  meta?.promptTokenCount     ?? 0,
      outputTokens: meta?.candidatesTokenCount ?? 0,
    },
  }
}

async function geminiText(params: {
  model: string; prompt: string; maxTokens?: number
}): Promise<AiResponse> {
  const genAI = getGeminiClient()
  const model = genAI.getGenerativeModel({ model: params.model })
  const result = await model.generateContent({
    contents: [{ role: 'user', parts: [{ text: params.prompt }] }],
    generationConfig: { maxOutputTokens: params.maxTokens ?? 2048 },
  })
  const meta = result.response.usageMetadata
  return {
    text:  result.response.text(),
    usage: {
      inputTokens:  meta?.promptTokenCount     ?? 0,
      outputTokens: meta?.candidatesTokenCount ?? 0,
    },
  }
}
