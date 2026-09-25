import { config } from "../config/app-config.js";

const COHERE_BASE = "https://api.cohere.com";

interface CohereChatResponse {
  message?: {
    content?: Array<{ type: string; text: string }>;
  };
  text?: string;
}

interface CohereRerankResponse {
  results: Array<{
    index: number;
    relevance_score: number;
  }>;
}

class CohereClient {
  private static instance: CohereClient;
  private apiKey: string;

  private constructor() {
    this.apiKey = config.chatbot.cohereApiKey;
  }

  public static getInstance(): CohereClient {
    if (!CohereClient.instance) {
      CohereClient.instance = new CohereClient();
    }
    return CohereClient.instance;
  }

  public async chat(
    message: string,
    model: string = "command-a-03-2025",
    options?: {
      preamble?: string;
      temperature?: number;
      maxTokens?: number;
    },
  ): Promise<string> {
    // API v2 (/v2/chat): array `messages`; el rol `system` reemplaza al `preamble`.
    const v2Messages: Array<{ role: string; content: string }> = [
      ...(options?.preamble ? [{ role: "system", content: options.preamble }] : []),
      { role: "user", content: message },
    ];

    const res = await fetch(`${COHERE_BASE}/v2/chat`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: v2Messages,
        temperature: options?.temperature ?? 0.3,
        max_tokens: options?.maxTokens ?? 1000,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Cohere Chat error ${res.status}: ${err}`);
    }

    const json = await res.json() as CohereChatResponse;
    return json.message?.content?.[0]?.text ?? json.text ?? "";
  }

  public async chatWithHistory(
    messages: Array<{ role: "user" | "assistant"; content: string }>,
    options?: {
      preamble?: string;
      temperature?: number;
      maxTokens?: number;
      signal?: AbortSignal;
    },
  ): Promise<string> {
    if (messages.length === 0) return "";

    // API v2 (/v2/chat): un único array `messages` con roles system/user/assistant.
    // El rol `system` reemplaza al viejo `preamble` de v1. command-a-03-2025 se
    // sirve en v2 (el /v1/chat con este modelo dejó de funcionar). El historial
    // ya viene con roles user/assistant válidos para v2.
    const v2Messages: Array<{ role: string; content: string }> = [
      ...(options?.preamble ? [{ role: "system", content: options.preamble }] : []),
      ...messages.map((m) => ({ role: m.role, content: m.content })),
    ];

    const res = await fetch(`${COHERE_BASE}/v2/chat`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      signal: options?.signal,
      body: JSON.stringify({
        model: "command-a-03-2025",
        messages: v2Messages,
        temperature: options?.temperature ?? 0.3,
        max_tokens: options?.maxTokens ?? 1000,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Cohere Chat error ${res.status}: ${err}`);
    }

    const json = await res.json() as CohereChatResponse;
    return json.message?.content?.[0]?.text ?? json.text ?? "";
  }

  public async rerank(
    query: string,
    documents: string[],
    topN: number = 10,
  ): Promise<Array<{ index: number; score: number }>> {
    if (documents.length === 0) return [];

    const res = await fetch(`${COHERE_BASE}/v2/rerank`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "rerank-multilingual-v3.0",
        query,
        documents,
        top_n: topN,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Cohere Rerank error ${res.status}: ${err}`);
    }

    const json = await res.json() as CohereRerankResponse;
    return json.results.map((r) => ({
      index: r.index,
      score: r.relevance_score,
    }));
  }

  public async generateTitle(question: string): Promise<string> {
    const prompt = `Genera un titulo breve (maximo 100 caracteres) en espanol para una conversacion de chatbot academico que empieza con esta pregunta: "${question}". Responde solo con el titulo, sin comillas ni explicaciones.`;

    const res = await fetch(`${COHERE_BASE}/v2/chat`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "command-a-03-2025",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7,
        max_tokens: 50,
      }),
    });

    if (!res.ok) {
      throw new Error(`Cohere title generation failed: ${res.status}`);
    }

    const json = await res.json() as CohereChatResponse;
    const title = (json.message?.content?.[0]?.text ?? json.text ?? "Nueva conversacion").trim();
    return title.length > 100 ? title.substring(0, 97) + "..." : title;
  }
}

export const cohereClient = CohereClient.getInstance();
