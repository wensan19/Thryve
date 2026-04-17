import type { ExerciseEstimate, ExerciseEstimateRequest, ExerciseIntensity } from "../../../shared/types.js";
import { estimateExerciseBurn } from "./calories.js";

interface GeminiExerciseResult {
  matchedExercise: string;
  estimatedCaloriesBurned: number;
  met: number;
  confidence: number;
  summary: string;
}

const exerciseEstimateSchema = {
  type: "OBJECT",
  required: ["matchedExercise", "estimatedCaloriesBurned", "met", "confidence", "summary"],
  propertyOrdering: ["matchedExercise", "estimatedCaloriesBurned", "met", "confidence", "summary"],
  properties: {
    matchedExercise: { type: "STRING" },
    estimatedCaloriesBurned: { type: "NUMBER" },
    met: { type: "NUMBER" },
    confidence: { type: "NUMBER" },
    summary: { type: "STRING" }
  }
};

export async function estimateExerciseWithProvider(request: ExerciseEstimateRequest): Promise<ExerciseEstimate> {
  if (process.env.FOOD_VISION_PROVIDER !== "gemini" || !process.env.GEMINI_API_KEY) {
    console.log("[exercise-ai] using local fallback");
    return localEstimate(request);
  }

  try {
    console.log("[exercise-ai] using Gemini provider");
    return await estimateExerciseWithGemini(request);
  } catch (error) {
    console.warn("[exercise-ai] Gemini failed; falling back to local estimator", error instanceof Error ? error.message : error);
    return localEstimate(request);
  }
}

function localEstimate(request: ExerciseEstimateRequest): ExerciseEstimate {
  const estimate = estimateExerciseBurn(request);
  return {
    ...estimate,
    provider: "local",
    confidence: estimate.isCustom ? 0.48 : 0.72,
    summary: `${estimate.minutes} min ${estimate.intensity} ${estimate.matchedExercise.toLowerCase()} estimate.`
  };
}

async function estimateExerciseWithGemini(request: ExerciseEstimateRequest): Promise<ExerciseEstimate> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  const model = process.env.GEMINI_EXERCISE_MODEL || process.env.GEMINI_FOOD_MODEL || "gemini-2.5-flash";
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const local = estimateExerciseBurn(request);

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
                `Estimate calories burned for a wellness app. Return JSON only according to the schema. ` +
                `Interpret the typed exercise carefully and do not map distinct movements incorrectly. ` +
                `For example, pull ups are not pushups, incline walking is not running, and curls are strength training. ` +
                `User input: exercise="${request.type}", duration=${request.minutes} minutes, intensity=${request.intensity}, bodyWeightKg=${request.bodyWeightKg ?? 70}. ` +
                `A local fallback estimate is matchedExercise="${local.matchedExercise}", met=${local.met}, calories=${local.caloriesBurned}; use it only as a sanity check. ` +
                `Keep the summary under 90 characters.`
            }
          ]
        }
      ],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: exerciseEstimateSchema,
        temperature: 0.15,
        maxOutputTokens: 500
      }
    })
  });

  const body = (await response.json()) as any;
  if (!response.ok) {
    throw new Error(body.error?.message ?? "Gemini exercise request failed");
  }

  const parsed = parseGeminiStructuredOutput(body);
  const caloriesBurned = positiveInteger(parsed.estimatedCaloriesBurned, local.caloriesBurned);
  const met = positiveNumber(parsed.met, local.met);

  return {
    type: request.type,
    matchedExercise: cleanLabel(parsed.matchedExercise, local.matchedExercise),
    isCustom: false,
    minutes: request.minutes,
    intensity: request.intensity,
    caloriesBurned,
    met,
    confidence: clamp01(parsed.confidence),
    summary: parsed.summary || `${request.minutes} min ${request.intensity} ${request.type.trim()} estimate.`,
    provider: "gemini"
  };
}

function parseGeminiStructuredOutput(body: any): GeminiExerciseResult {
  const text = body.candidates?.[0]?.content?.parts?.find((part: any) => typeof part.text === "string")?.text;
  if (!text) {
    throw new Error("Gemini response did not include structured JSON text");
  }
  return JSON.parse(text) as GeminiExerciseResult;
}

export function normalizeExerciseEstimateRequest(body: any, fallbackWeightKg = 70): ExerciseEstimateRequest {
  const rawType = firstString(body?.type, body?.exercise, body?.exerciseType, body?.name, body?.matchedExercise);
  const rawIntensity = typeof body?.intensity === "string" ? body.intensity.toLowerCase() : "medium";
  const intensity = ["low", "medium", "high"].includes(rawIntensity) ? rawIntensity as ExerciseIntensity : "medium";
  const minutes = Number(body?.minutes);
  const bodyWeightKg = Number(body?.bodyWeightKg);

  return {
    type: rawType.trim(),
    minutes: Number.isFinite(minutes) ? minutes : 25,
    intensity,
    bodyWeightKg: Number.isFinite(bodyWeightKg) && bodyWeightKg > 0 ? bodyWeightKg : fallbackWeightKg
  };
}

function firstString(...values: unknown[]) {
  return values.find((value): value is string => typeof value === "string") ?? "";
}

export function validateExerciseEstimateRequest(request: ExerciseEstimateRequest) {
  if (request.type.trim().length < 2) {
    return "Enter an exercise type.";
  }

  if (!Number.isFinite(request.minutes) || request.minutes < 1 || request.minutes > 600) {
    return "Duration should be 1 to 600 minutes.";
  }

  if (!["low", "medium", "high"].includes(request.intensity)) {
    return "Choose a valid intensity.";
  }

  return "";
}

function cleanLabel(value: string, fallback: string) {
  const label = value.trim();
  return label.length > 1 ? label : fallback;
}

function positiveInteger(value: number, fallback: number) {
  return Number.isFinite(value) && value >= 0 ? Math.round(value) : fallback;
}

function positiveNumber(value: number, fallback: number) {
  return Number.isFinite(value) && value > 0 ? Number(value.toFixed(1)) : fallback;
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0.6));
}
