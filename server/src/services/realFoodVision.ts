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
                "Analyze this meal photo for a food tracking app. Return JSON only according to the schema. Identify the most likely main food and visible ingredients. Estimate practical portions and calories per unit. Prefer item, piece, serving, bowl, cup, spoon, or slice unless grams are more useful. Be conservative when uncertain and lower confidence. The user will edit the result before saving."
            },
            {
              inlineData: {
                mimeType: file.mimetype,
                data: file.buffer.toString("base64")
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
    notes: result.notes || "Gemini image estimate. Review and edit before saving.",
    analysis: {
      provider: "real",
      status: "complete",
      summary: `Gemini-estimated from image with ${Math.round(clamp01(result.confidence) * 100)}% overall confidence. Review ingredients before saving.`,
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
