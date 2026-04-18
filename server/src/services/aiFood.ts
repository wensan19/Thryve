import type { FoodItem, FoodUnit, MealGuess } from "../../../shared/types.js";
import { lookupFoodNutrition } from "../../../shared/nutrition.js";
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

interface TextGuessInput {
  text: string;
}

interface TextMealIngredient {
  name: string;
  quantity: number;
  unit: FoodUnit;
  caloriesPerUnit: number;
  confidence: number;
}

interface TextMealResult {
  mainFood: string;
  ingredients: TextMealIngredient[];
  estimatedTotalCalories: number;
  sweetness: number;
  spiciness: number;
  saltiness: number;
  confidence: number;
  notes: string;
}

const typedMealSchema = {
  type: "OBJECT",
  required: ["mainFood", "ingredients", "estimatedTotalCalories", "sweetness", "spiciness", "saltiness", "confidence", "notes"],
  propertyOrdering: ["mainFood", "ingredients", "estimatedTotalCalories", "sweetness", "spiciness", "saltiness", "confidence", "notes"],
  properties: {
    mainFood: { type: "STRING" },
    ingredients: {
      type: "ARRAY",
      minItems: 1,
      maxItems: 8,
      items: {
        type: "OBJECT",
        required: ["name", "quantity", "unit", "caloriesPerUnit", "confidence"],
        propertyOrdering: ["name", "quantity", "unit", "caloriesPerUnit", "confidence"],
        properties: {
          name: { type: "STRING" },
          quantity: { type: "NUMBER" },
          unit: { type: "STRING", enum: ["item", "piece", "serving", "bowl", "cup", "spoon", "gram", "slice"] },
          caloriesPerUnit: { type: "NUMBER" },
          confidence: { type: "NUMBER" }
        }
      }
    },
    estimatedTotalCalories: { type: "NUMBER" },
    sweetness: { type: "NUMBER" },
    spiciness: { type: "NUMBER" },
    saltiness: { type: "NUMBER" },
    confidence: { type: "NUMBER" },
    notes: { type: "STRING" }
  }
};

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

export async function guessFoodFromText(input: TextGuessInput): Promise<MealGuess> {
  const requestId = crypto.randomUUID();
  const mealText = input.text.trim();

  if (!mealText) {
    throw new Error("Meal description is required");
  }

  if (selectFoodProvider() === "gemini") {
    try {
      console.log(`[food-ai] provider=gemini input=text status=starting requestId=${requestId}`);
      const result = await analyzeTypedMealWithGemini(mealText);
      console.log(`[food-ai] provider=gemini input=text status=complete requestId=${requestId} mainFood="${result.mainFood}" confidence=${clamp01(result.confidence).toFixed(2)}`);
      return mapTextMealResultToGuess(result, requestId, "real");
    } catch (error) {
      console.error("[food-ai] provider=gemini input=text status=failed fallback=mock", error);
    }
  } else {
    console.log(`[food-ai] provider=mock input=text status=starting requestId=${requestId} reason=gemini-not-configured`);
  }

  return analyzeTextWithLocalFallback(mealText, requestId);
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

async function analyzeTypedMealWithGemini(text: string): Promise<TextMealResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  const model = process.env.GEMINI_FOOD_MODEL || "gemini-2.5-flash";
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "x-goog-api-key": apiKey,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      contents: [{
        role: "user",
        parts: [{
          text:
            `Turn this typed meal description into an editable food-tracking estimate: "${text}". ` +
            "Return JSON only according to the schema. Identify the whole main meal, visible or implied ingredients, practical units, calories per unit, and confidence. " +
            "Use common portion assumptions for phrases like 2 eggs, toast, chicken rice, bubble tea with pearls, or grilled salmon with broccoli and rice. " +
            "When details are missing, be conservative, lower confidence, and keep the result easy for the user to edit."
        }]
      }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: typedMealSchema,
        temperature: 0.2,
        maxOutputTokens: 1400
      }
    })
  });

  const body = (await response.json()) as any;
  if (!response.ok) {
    throw new Error(body.error?.message ?? "Gemini typed meal request failed");
  }

  const json = body.candidates?.[0]?.content?.parts?.find((part: any) => typeof part.text === "string")?.text;
  if (!json) {
    throw new Error("Gemini typed meal response did not include JSON text");
  }

  return JSON.parse(json) as TextMealResult;
}

function analyzeTextWithLocalFallback(text: string, requestId: string): MealGuess {
  const match = chooseTemplate(text);
  const matchedTemplate = !match.isFallback && match.score >= 0.72 && hasStrongTemplatePhrase(text, match);
  const guessedItems = matchedTemplate ? match.items : inferItemsFromText(text);
  const items = guessedItems.map((item) => ({
    ...item,
    id: crypto.randomUUID(),
    confidence: matchedTemplate ? Math.max(0.5, item.confidence * 0.9) : item.confidence
  }));
  const title = matchedTemplate ? match.title : titleCase(text);
  const sweetness = matchedTemplate ? match.sweetness : inferFlavor(text, "sweetness");
  const spiciness = matchedTemplate ? match.spiciness : inferFlavor(text, "spiciness");
  const saltiness = matchedTemplate ? match.saltiness : 28;

  console.log(
    `[food-ai] provider=mock input=text status=complete requestId=${requestId} text="${text.slice(0, 80)}" matched="${match.title}" score=${match.score.toFixed(2)} fallback=${!matchedTemplate}`
  );

  return {
    id: requestId,
    photoUrl: "/logo.jpeg",
    title,
    items,
    calories: estimateMealCalories(items, sweetness),
    sweetness,
    spiciness,
    saltiness,
    notes: matchedTemplate
      ? "Typed meal estimate from local food templates. Review and edit before saving."
      : "Typed meal estimate from local nutrition matches. Review and edit before saving.",
    analysis: {
      provider: "mock",
      status: "complete",
      summary: matchedTemplate
        ? `${match.summary} Estimated from typed meal text using local templates.`
        : "Estimated from typed meal text using local nutrition matches and safe fallback portions.",
      requestId
    }
  };
}

function mapTextMealResultToGuess(result: TextMealResult, requestId: string, provider: "real" | "mock"): MealGuess {
  const items = normalizeTextIngredients(result.ingredients);
  const calculatedCalories = estimateMealCalories(items, result.sweetness);
  const calories = Number.isFinite(result.estimatedTotalCalories)
    ? Math.round((calculatedCalories * 0.65) + (result.estimatedTotalCalories * 0.35))
    : calculatedCalories;
  const confidence = clamp01(result.confidence);

  return {
    id: requestId,
    photoUrl: "/logo.jpeg",
    title: result.mainFood || "Typed meal",
    items,
    calories,
    sweetness: clampPercent(result.sweetness),
    spiciness: clampPercent(result.spiciness),
    saltiness: clampPercent(result.saltiness),
    notes: result.notes || "Typed meal estimate. Review and edit before saving.",
    analysis: {
      provider,
      status: "complete",
      summary: confidence < 0.5
        ? `Low confidence typed-meal estimate — please review before saving. Confidence was ${Math.round(confidence * 100)}%.`
        : `Typed-meal estimate with ${Math.round(confidence * 100)}% confidence. Review ingredients before saving.`,
      requestId
    }
  };
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

function hasStrongTemplatePhrase(text: string, match: { title: string; category: string }) {
  const normalizedText = normalize(text);
  const template = mealTemplates.find((item) => item.title === match.title);
  const phrases = [match.title, ...(template?.terms ?? [])]
    .map(normalize)
    .filter((term) => term.split(" ").length > 1);

  return phrases.some((phrase) => normalizedText.includes(phrase));
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

function normalizeTextIngredients(ingredients: TextMealIngredient[]): FoodItem[] {
  const safeIngredients = ingredients.length > 0 ? ingredients : [{
    name: "Typed meal portion",
    quantity: 1,
    unit: "serving" as const,
    caloriesPerUnit: 450,
    confidence: 0.35
  }];

  return safeIngredients.slice(0, 8).map((ingredient) => ({
    id: crypto.randomUUID(),
    name: ingredient.name || "Ingredient",
    quantity: positiveNumber(ingredient.quantity, 1),
    unit: ingredient.unit,
    calories: positiveNumber(ingredient.caloriesPerUnit, 50),
    confidence: clamp01(ingredient.confidence)
  }));
}

function inferItemsFromText(text: string): Omit<FoodItem, "id">[] {
  const candidates = splitTypedMeal(text);
  const items = candidates
    .map((part) => {
      const quantity = inferQuantity(part);
      const match = lookupFoodNutrition(part);
      if (match) {
        return {
          name: match.name,
          quantity,
          unit: match.unit,
          calories: match.calories,
          confidence: 0.62
        };
      }

      return undefined;
    })
    .filter((item): item is Omit<FoodItem, "id"> => Boolean(item));

  if (items.length > 0) {
    return items.slice(0, 8);
  }

  const wholeMeal = lookupFoodNutrition(text);
  if (wholeMeal) {
    return [{
      name: wholeMeal.name,
      quantity: 1,
      unit: wholeMeal.unit,
      calories: wholeMeal.calories,
      confidence: 0.58
    }];
  }

  return [{
    name: titleCase(text) || "Typed meal portion",
    quantity: 1,
    unit: "serving",
    calories: 450,
    confidence: 0.3
  }];
}

function splitTypedMeal(text: string) {
  return text
    .replace(/\bwith\b/gi, " and ")
    .replace(/\bplus\b/gi, " and ")
    .split(/\s*(?:,|&|\band\b)\s*/i)
    .map((part) => part.trim())
    .filter(Boolean);
}

function inferQuantity(text: string) {
  const number = Number(text.match(/\b\d+(?:\.\d+)?\b/)?.[0]);
  return Number.isFinite(number) && number > 0 ? number : 1;
}

function inferFlavor(text: string, flavor: "sweetness" | "spiciness") {
  const normalized = normalize(text);
  if (flavor === "sweetness") {
    return /bubble tea|boba|cake|ice cream|smoothie|dessert|sweet|syrup|pancake/.test(normalized) ? 72 : 12;
  }
  return /spicy|chili|curry|laksa|prata|mee goreng/.test(normalized) ? 55 : 10;
}

function titleCase(value: string) {
  return value
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function positiveNumber(value: number, fallback: number) {
  return Number.isFinite(value) && value > 0 ? Number(value.toFixed(2)) : fallback;
}

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, Math.round(Number.isFinite(value) ? value : 0)));
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0.5));
}
