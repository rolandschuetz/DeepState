type OllamaClientOptions = {
  baseUrl: string;
  fetch: typeof globalThis.fetch;
  model: string;
  timeoutMs: number;
};

export type OllamaProbeResult = {
  checkedAt: string;
  message: string;
  model: string;
  status: "down" | "ok";
  url: string;
};

type AmbiguityHintInput = {
  activeApps: string[];
  keywords: string[];
  taskTitles: string[];
  urls: string[];
  windowTitles: string[];
};

const buildAmbiguityPrompt = (input: AmbiguityHintInput): string =>
  [
    "You help a focus coaching app classify ambiguous computer activity.",
    "Return one short plain-text sentence only, under 140 characters.",
    "Do not use markdown, bullets, or JSON.",
    "Mention the most likely interpretation of the current activity and the strongest clue.",
    `Tasks: ${input.taskTitles.join(" | ") || "none"}`,
    `Active apps: ${input.activeApps.join(" | ") || "none"}`,
    `Window titles: ${input.windowTitles.join(" | ") || "none"}`,
    `URLs: ${input.urls.join(" | ") || "none"}`,
    `Keywords: ${input.keywords.join(" | ") || "none"}`,
  ].join("\n\n");

const sanitizeSingleLine = (value: string): string =>
  value.replace(/\s+/g, " ").trim().slice(0, 140);

export const createOllamaClient = ({
  baseUrl,
  fetch,
  model,
  timeoutMs,
}: OllamaClientOptions) => {
  const normalizedBaseUrl = baseUrl.replace(/\/+$/, "");

  const withTimeout = async <T>(run: (signal: AbortSignal) => Promise<T>): Promise<T> => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      return await run(controller.signal);
    } finally {
      clearTimeout(timeout);
    }
  };

  return {
    async probe(): Promise<OllamaProbeResult> {
      const checkedAt = new Date().toISOString();
      const url = `${normalizedBaseUrl}/api/tags`;

      try {
        const response = await withTimeout((signal) =>
          fetch(url, {
            method: "GET",
            signal,
          }));

        if (!response.ok) {
          return {
            checkedAt,
            message: `Ollama probe returned HTTP ${response.status}.`,
            model,
            status: "down",
            url,
          };
        }

        return {
          checkedAt,
          message: `Ollama reachable for model ${model}.`,
          model,
          status: "ok",
          url,
        };
      } catch (error) {
        return {
          checkedAt,
          message: error instanceof Error ? error.message : "Unknown Ollama probe failure.",
          model,
          status: "down",
          url,
        };
      }
    },

    async generateAmbiguityHint(input: AmbiguityHintInput): Promise<string | null> {
      const url = `${normalizedBaseUrl}/api/generate`;
      const response = await withTimeout((signal) =>
        fetch(url, {
          body: JSON.stringify({
            model,
            options: {
              num_predict: 80,
              temperature: 0.1,
            },
            prompt: buildAmbiguityPrompt(input),
            stream: false,
          }),
          headers: {
            "content-type": "application/json",
          },
          method: "POST",
          signal,
        }));

      if (!response.ok) {
        throw new Error(`Ollama generate returned HTTP ${response.status}.`);
      }

      const payload = (await response.json()) as { response?: string };
      const text = payload.response?.trim() ?? "";

      if (text.length === 0) {
        return null;
      }

      return sanitizeSingleLine(text);
    },
  };
};
