import type { FoodItem, FoodUnit, MealGuess } from "../../../shared/types.js";
import { estimateMealCalories } from "./calories.js";

interface AnalyzeImageInput {
  file: Express.Multer.File;
  previewDataUrl?: string;
}

interface VisionIngredient {
  name: string;
  quantity: number;
  unit: FoodUnit;
  caloriesPerUnit: number;
  confidence: number;
}

interface VisionMealResult {
  mainFood: string;
  ingredients: VisionIngredient[];
  estimatedTotalCalories: number;
  sweetness: number;
  spiciness: number;
  saltiness: number;
  confidence: number;
  notes: string;
}

interface GeminiImagePayload {
  mimeType: string;
  data: string;
  bytes: number;
  source: "upload" | "normalized-preview";
  normalized: boolean;
  reason: string;
}

const foodVisionSchema = {
  type: "OBJECT",
  required: [
    "mainFood",
    "ingredients",
    "estimatedTotalCalories",
    "sweetness",
    "spiciness",
    "saltiness",
    "confidence",
    "notes"
  ],
  propertyOrdering: [
    "mainFood",
    "ingredients",
    "estimatedTotalCalories",
    "sweetness",
    "spiciness",
    "saltiness",
    "confidence",
    "notes"
  ],
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
          unit: {
            type: "STRING",
            enum: ["item", "piece", "serving", "bowl", "cup", "spoon", "gram", "slice"]
          },
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

export async function analyzeFoodImageWithGemini({ file, previewDataUrl }: AnalyzeImageInput): Promise<MealGuess> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  const model = process.env.GEMINI_FOOD_MODEL || "gemini-2.5-flash";
  const requestId = crypto.randomUUID();
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const imagePayload = resolveGeminiImagePayload(file, previewDataUrl);

  console.log(
    `[food-ai] provider=gemini requestId=${requestId} imageSource=${imagePayload.source} normalized=${imagePayload.normalized} ` +
    `reason="${imagePayload.reason}" originalMime=${file.mimetype} originalBytes=${file.size} geminiMime=${imagePayload.mimeType} geminiBytes=${imagePayload.bytes}`
  );

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "x-goog-api-key": apiKey,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [
            {
              text:
                "Analyze this food photo for a meal tracking app. Return JSON only according to the schema. Use the actual visible image content, not common defaults. Do not guess chicken, rice, salad, or any generic food unless those foods are clearly visible. Identify the main food as the whole dish when possible, and list visible ingredients separately. Distinguish mixed meals, rice dishes, noodle dishes, soups, drinks, desserts, snacks, sauces, and side items. If the image is blurry, cropped, dark, ambiguous, or not clearly food, use mainFood=\"Review food photo\", one ingredient named \"Visible meal portion\", and confidence <= 0.45. For uncertainty, lower both the overall confidence and the uncertain ingredient confidences instead of forcing a confident answer. Estimate practical portions and calories per unit. Prefer item, piece, serving, bowl, cup, spoon, or slice unless grams are more useful. The user will review and edit before saving."
            },
            {
              inlineData: {
                mimeType: imagePayload.mimeType,
                data: imagePayload.data
              }
            }
          ]
        }
      ],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: foodVisionSchema,
        temperature: 0.2,
        maxOutputTokens: 1400
      }
    })
  });

  const body = (await response.json()) as any;
  if (!response.ok) {
    throw new Error(body.error?.message ?? "Gemini food vision request failed");
  }

  const parsed = parseGeminiStructuredOutput(body);
  console.log(
    `[food-ai] provider=gemini status=complete requestId=${requestId} mainFood="${parsed.mainFood}" confidence=${clamp01(parsed.confidence).toFixed(2)}`
  );
  return mapVisionResultToMealGuess(parsed, requestId, previewDataUrl || `data:${file.mimetype};base64,${file.buffer.toString("base64")}`);
}

function parseGeminiStructuredOutput(body: any): VisionMealResult {
  const text = body.candidates?.[0]?.content?.parts?.find((part: any) => typeof part.text === "string")?.text;

  if (!text) {
    throw new Error("Gemini response did not include structured JSON text");
  }

  return JSON.parse(text) as VisionMealResult;
}

function mapVisionResultToMealGuess(result: VisionMealResult, requestId: string, photoUrl: string): MealGuess {
  const items = normalizeIngredients(result.ingredients);
  const confidence = clamp01(result.confidence);
  const calculatedCalories = estimateMealCalories(items, result.sweetness);
  const blendedCalories = Number.isFinite(result.estimatedTotalCalories)
    ? Math.round((calculatedCalories * 0.65) + (result.estimatedTotalCalories * 0.35))
    : calculatedCalories;

  return {
    id: requestId,
    photoUrl,
    title: result.mainFood || "AI-estimated meal",
    items,
    calories: blendedCalories,
    sweetness: clampPercent(result.sweetness),
    spiciness: clampPercent(result.spiciness),
    saltiness: clampPercent(result.saltiness),
    notes: result.notes || (confidence < 0.5 ? "Low confidence result. Review and edit before saving." : "Gemini image estimate. Review and edit before saving."),
    analysis: {
      provider: "real",
      status: "complete",
      summary: confidence < 0.5
        ? `Low confidence result — please review before saving. Gemini image confidence was ${Math.round(confidence * 100)}%.`
        : `Gemini-estimated from image with ${Math.round(confidence * 100)}% overall confidence. Review ingredients before saving.`,
      requestId
    }
  };
}

function normalizeIngredients(ingredients: VisionIngredient[]): FoodItem[] {
  const safeIngredients = ingredients.length > 0 ? ingredients : [{
    name: "Visible meal portion",
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

function positiveNumber(value: number, fallback: number) {
  return Number.isFinite(value) && value > 0 ? Number(value.toFixed(2)) : fallback;
}

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, Math.round(Number.isFinite(value) ? value : 0)));
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0.5));
}

function resolveGeminiImagePayload(file: Express.Multer.File, previewDataUrl?: string): GeminiImagePayload {
  const preview = parseImageDataUrl(previewDataUrl);
  const uploadMimeType = normalizeImageMimeType(file.mimetype, file.originalname);
  const canUseUpload = isGeminiImageMimeType(uploadMimeType);
  const previewIsNormalized = Boolean(
    preview &&
    isGeminiImageMimeType(preview.mimeType) &&
    preview.mimeType !== uploadMimeType &&
    !isHeicLike(preview.mimeType)
  );
  const shouldPreferPreview =
    Boolean(preview && isGeminiImageMimeType(preview.mimeType)) &&
    (!canUseUpload || (isHeicLike(uploadMimeType) && previewIsNormalized) || preview!.bytes < file.size * 0.85);

  if (preview && isGeminiImageMimeType(preview.mimeType) && shouldPreferPreview) {
    return {
      mimeType: preview.mimeType,
      data: preview.data,
      bytes: preview.bytes,
      source: "normalized-preview",
      normalized: true,
      reason: !canUseUpload
        ? "unsupported-upload-mimetype"
        : isHeicLike(uploadMimeType)
          ? "heic-heif-converted-client-side"
          : "client-resized-upload"
    };
  }

  if (!canUseUpload && preview && isGeminiImageMimeType(preview.mimeType)) {
    return {
      mimeType: preview.mimeType,
      data: preview.data,
      bytes: preview.bytes,
      source: "normalized-preview",
      normalized: true,
      reason: "fallback-to-preview-data-url"
    };
  }

  return {
    mimeType: canUseUpload ? uploadMimeType : "image/jpeg",
    data: file.buffer.toString("base64"),
    bytes: file.size,
    source: "upload",
    normalized: false,
    reason: canUseUpload ? "upload-supported" : "upload-mimetype-unknown"
  };
}

function parseImageDataUrl(dataUrl?: string) {
  const match = dataUrl?.match(/^data:(image\/[a-z0-9.+-]+);base64,([a-z0-9+/=]+)$/i);
  if (!match) {
    return undefined;
  }

  const mimeType = normalizeImageMimeType(match[1]);
  const data = match[2];
  return {
    mimeType,
    data,
    bytes: Buffer.byteLength(data, "base64")
  };
}

function normalizeImageMimeType(mimeType = "", fileName = "") {
  const lowered = mimeType.toLowerCase();
  if (lowered === "image/jpg") return "image/jpeg";
  if (lowered.startsWith("image/")) return lowered;
  if (/\.(heic)$/i.test(fileName)) return "image/heic";
  if (/\.(heif)$/i.test(fileName)) return "image/heif";
  if (/\.(jpe?g)$/i.test(fileName)) return "image/jpeg";
  if (/\.(png)$/i.test(fileName)) return "image/png";
  if (/\.(webp)$/i.test(fileName)) return "image/webp";
  return lowered;
}

function isGeminiImageMimeType(mimeType: string) {
  return ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"].includes(mimeType);
}

function isHeicLike(mimeType: string) {
  return mimeType === "image/heic" || mimeType === "image/heif";
}
