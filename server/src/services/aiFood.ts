import type { MealGuess } from "../../../shared/types.js";
import { estimateMealCalories } from "./calories.js";
import type { MealTemplate } from "./foodTemplates.js";
import { mealTemplates } from "./foodTemplates.js";
import { analyzeFoodImageWithGemini } from "./realFoodVision.js";

interface GuessInput {
  file?: Express.Multer.File;
  previewDataUrl?: string;
  originalUpload?: {
    name?: string;
    mimetype?: string;
    size: number;
    userAgent: string;
  };
}

interface FoodAiProvider {
  analyze(input: GuessInput): Promise<MealGuess>;
}

export const mockFoodAiProvider: FoodAiProvider = {
  analyze: analyzeWithMockProvider
};

const geminiFoodProvider: FoodAiProvider = {
  async analyze(input) {
    if (!input.file) {
      throw new Error("Gemini provider requires an uploaded image file");
    }
    return analyzeFoodImageWithGemini({ file: input.file, previewDataUrl: input.previewDataUrl });
  }
};

export async function guessFoodFromImage(input: GuessInput): Promise<MealGuess> {
  const provider = selectFoodProvider();
  logFoodScanRequest(input, provider);

  if (provider === "gemini") {
    try {
      console.log("[food-ai] provider=gemini status=starting");
      return await geminiFoodProvider.analyze(input);
    } catch (error) {
      console.error("[food-ai] provider=gemini status=failed fallback=mock", error);
    }
  } else {
    console.log("[food-ai] provider=mock status=starting reason=gemini-not-configured");
  }

  return mockFoodAiProvider.analyze(input);
}

function selectFoodProvider() {
  const configuredProvider = process.env.FOOD_VISION_PROVIDER?.toLowerCase();
  const wantsGemini = configuredProvider === "gemini";
  const hasKey = Boolean(process.env.GEMINI_API_KEY);

  if (wantsGemini && hasKey) {
    return "gemini";
  }

  if (wantsGemini && !hasKey) {
    console.warn("[food-ai] FOOD_VISION_PROVIDER=gemini but GEMINI_API_KEY is missing; using mock provider");
  }

  if (configuredProvider === "openai") {
    console.warn("[food-ai] OpenAI provider is no longer active. Set FOOD_VISION_PROVIDER=gemini to use real image analysis.");
  }

  return "mock";
}

async function analyzeWithMockProvider({ file, previewDataUrl }: GuessInput): Promise<MealGuess> {
  const requestId = crypto.randomUUID();
  const fileName = file?.originalname ?? "sample-photo";
  const fileSize = file?.size ?? 0;
  const match = chooseTemplate(fileName);
  const items = match.items.map((item) => ({
    ...item,
    id: crypto.randomUUID(),
    confidence: Number(Math.max(0.34, item.confidence * match.confidenceMultiplier).toFixed(2))
  }));

  console.log(
    `[food-ai] provider=mock status=complete requestId=${requestId} file="${fileName}" bytes=${fileSize} mimetype=${file?.mimetype ?? "none"} matched="${match.title}" category="${match.category}" score=${match.score.toFixed(2)} fallback=${match.isFallback}`
  );

  return {
    id: requestId,
    photoUrl:
      previewDataUrl || "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=900&q=80",
    title: match.title,
    items,
    calories: estimateMealCalories(items, match.sweetness),
    sweetness: match.sweetness,
    spiciness: match.spiciness,
    saltiness: match.saltiness,
    notes: match.isFallback
      ? "Low-confidence fallback. The image could not be confidently matched, so review and edit before saving."
      : "Mock AI estimate from a structured food template database. Review and edit before saving.",
    analysis: {
      provider: "mock",
      status: "complete",
      summary: match.isFallback
        ? "Low confidence result — please review before saving. Gemini was unavailable or failed, and the local filename matcher did not find a reliable food hint."
        : `${match.summary} Matched ${match.category.toLowerCase()} template from filename hints; ingredients are AI-estimated and editable.`,
      requestId
    }
  };
}

function chooseTemplate(fileName: string) {
  const hints = tokenizeHints(fileName);
  const ranked = mealTemplates
    .map((template) => ({ template, score: scoreTemplate(hints, template) }))
    .sort((a, b) => b.score - a.score);
  const best = ranked[0];

  if (best && best.score >= 0.48) {
    return {
      title: best.template.title,
      category: best.template.category,
      summary: best.template.summary,
      items: best.template.items,
      sweetness: best.template.sweetness,
      spiciness: best.template.spiciness,
      saltiness: best.template.saltiness,
      score: best.score,
      confidenceMultiplier: Math.min(1.08, 0.82 + best.score * 0.24),
      isFallback: false
    };
  }

  return {
    title: "Review food photo",
    category: "Unclear meal",
    summary: "The uploaded image could not be matched confidently.",
    items: [{
      name: "Visible meal portion",
      quantity: 1,
      unit: "serving" as const,
      calories: 450,
      confidence: 0.32
    }],
    sweetness: 0,
    spiciness: 0,
    saltiness: 20,
    score: 0.12,
    confidenceMultiplier: 1,
    isFallback: true
  };
}

function logFoodScanRequest(input: GuessInput, provider: "gemini" | "mock") {
  const file = input.file;
  const original = input.originalUpload;
  const looksMobile = /iphone|ipad|android|mobile/i.test(original?.userAgent ?? "");
  const normalizedByClient = Boolean(
    file &&
    original &&
    (file.mimetype !== original.mimetype || file.size !== original.size || file.originalname !== original.name)
  );

  console.log(
    `[food-ai] request provider=${provider} uploadName="${file?.originalname ?? "none"}" uploadMime=${file?.mimetype ?? "none"} uploadBytes=${file?.size ?? 0} ` +
    `originalName="${original?.name ?? "unknown"}" originalMime=${original?.mimetype ?? "unknown"} originalBytes=${original?.size ?? 0} ` +
    `normalizedByClient=${normalizedByClient} client=${looksMobile ? "mobile" : "desktop-or-unknown"} userAgent="${(original?.userAgent ?? "").slice(0, 120)}"`
  );
}

function scoreTemplate(hints: string[], template: MealTemplate) {
  const searchableTerms = [template.title, template.category, ...template.terms].map(normalize);
  let best = 0;

  for (const hint of hints) {
    for (const term of searchableTerms) {
      if (!hint || !term) continue;
      const specificity = Math.min(0.18, term.split(" ").length * 0.04);
      if (hint === term) best = Math.max(best, 1 + specificity);
      else if (term.includes(hint) || hint.includes(term)) best = Math.max(best, 0.84 + specificity);
      else best = Math.max(best, fuzzyScore(hint, term));
    }
  }

  const phrase = hints.join(" ");
  for (const term of searchableTerms) {
    if (phrase.includes(term)) best = Math.max(best, 0.96 + Math.min(0.18, term.split(" ").length * 0.04));
  }

  return best;
}

function tokenizeHints(fileName: string) {
  const normalized = normalize(fileName.replace(/\.[a-z0-9]+$/i, ""));
  const words = normalized.split(" ").filter(Boolean);
  const pairs = words.slice(0, -1).map((word, index) => `${word} ${words[index + 1]}`);
  const triples = words.slice(0, -2).map((word, index) => `${word} ${words[index + 1]} ${words[index + 2]}`);
  return [normalized, ...triples, ...pairs, ...words].filter(Boolean);
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function fuzzyScore(a: string, b: string) {
  const distance = levenshtein(a, b);
  return Math.max(0, 1 - distance / Math.max(a.length, b.length, 1));
}

function levenshtein(a: string, b: string) {
  const dp = Array.from({ length: a.length + 1 }, () => Array<number>(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i += 1) dp[i][0] = i;
  for (let j = 0; j <= b.length; j += 1) dp[0][j] = j;

  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }

  return dp[a.length][b.length];
}
