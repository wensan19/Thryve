import type { ExerciseEstimate, ExerciseEstimateRequest, ExerciseIntensity } from "../../../shared/types.js";
import { estimateExerciseBurn } from "./calories.js";

interface GeminiExerciseResult {
  matchedExercise: string;
  estimatedCaloriesBurned: number;
  met: number;
  confidence: number;
  summary: string;
  exerciseCategory: string;
  usedWeightedContext: boolean;
  usedSetsRepsContext: boolean;
  usedSideRepContext: boolean;
}

const exerciseEstimateSchema = {
  type: "OBJECT",
  required: [
    "matchedExercise",
    "estimatedCaloriesBurned",
    "met",
    "confidence",
    "summary",
    "exerciseCategory",
    "usedWeightedContext",
    "usedSetsRepsContext",
    "usedSideRepContext"
  ],
  propertyOrdering: [
    "matchedExercise",
    "estimatedCaloriesBurned",
    "met",
    "confidence",
    "summary",
    "exerciseCategory",
    "usedWeightedContext",
    "usedSetsRepsContext",
    "usedSideRepContext"
  ],
  properties: {
    matchedExercise: { type: "STRING" },
    estimatedCaloriesBurned: { type: "NUMBER" },
    met: { type: "NUMBER" },
    confidence: { type: "NUMBER" },
    summary: { type: "STRING" },
    exerciseCategory: { type: "STRING" },
    usedWeightedContext: { type: "BOOLEAN" },
    usedSetsRepsContext: { type: "BOOLEAN" },
    usedSideRepContext: { type: "BOOLEAN" }
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
  const totalReps = getTotalReps(request);
  const weightedBoost = request.isWeighted && positiveOptionalNumber(request.weightUsed)
    ? Math.min(1.18, 1 + (normalizeWeightKg(request.weightUsed, request.weightUnit) / 220))
    : 1;
  const repsBoost = totalReps > 0 ? Math.min(1.14, 1 + totalReps / 900) : 1;
  const adjustedCalories = Math.round(estimate.caloriesBurned * weightedBoost * repsBoost);
  const category = inferExerciseCategory(estimate.matchedExercise);
  return {
    ...estimate,
    caloriesBurned: adjustedCalories,
    provider: "local",
    confidence: estimate.isCustom ? 0.48 : 0.72,
    summary: buildSummary(estimate.minutes, estimate.intensity, estimate.matchedExercise, request),
    exerciseCategory: category,
    usedWeightedContext: Boolean(request.isWeighted && positiveOptionalNumber(request.weightUsed)),
    usedSetsRepsContext: Boolean(request.sets || request.reps),
    usedSideRepContext: Boolean(request.useSideReps)
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
                `User input: exercise="${request.type}", duration=${request.minutes} minutes, intensity=${request.intensity}, bodyWeightKg=${request.bodyWeightKg ?? 70}, ` +
                `isWeighted=${Boolean(request.isWeighted)}, weightUsed=${request.weightUsed ?? 0} ${request.weightUnit ?? "kg"}, sets=${request.sets ?? 0}, reps=${request.reps ?? 0}, ` +
                `useSideReps=${Boolean(request.useSideReps)}, leftReps=${request.leftReps ?? 0}, rightReps=${request.rightReps ?? 0}. ` +
                `If weighted or sets/reps context is provided, use it as rough context for work performed, but keep calories realistic and conservative. ` +
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
    provider: "gemini",
    exerciseCategory: parsed.exerciseCategory || inferExerciseCategory(parsed.matchedExercise),
    usedWeightedContext: Boolean(parsed.usedWeightedContext),
    usedSetsRepsContext: Boolean(parsed.usedSetsRepsContext),
    usedSideRepContext: Boolean(parsed.usedSideRepContext)
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
  const weightUnit = body?.weightUnit === "lb" ? "lb" : "kg";
  const useSideReps = Boolean(body?.useSideReps);

  return {
    type: rawType.trim(),
    minutes: Number.isFinite(minutes) ? minutes : 25,
    intensity,
    bodyWeightKg: Number.isFinite(bodyWeightKg) && bodyWeightKg > 0 ? bodyWeightKg : fallbackWeightKg,
    isWeighted: Boolean(body?.isWeighted),
    weightUsed: optionalPositiveNumber(body?.weightUsed),
    weightUnit,
    sets: optionalPositiveNumber(body?.sets),
    reps: optionalPositiveNumber(body?.reps),
    useSideReps,
    leftReps: optionalPositiveNumber(body?.leftReps),
    rightReps: optionalPositiveNumber(body?.rightReps),
    caloriesBurnedOverride: optionalPositiveNumber(body?.caloriesBurnedOverride)
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

function getTotalReps(request: ExerciseEstimateRequest) {
  const sets = request.sets && request.sets > 0 ? request.sets : 1;
  if (request.useSideReps) {
    return sets * ((request.leftReps ?? 0) + (request.rightReps ?? 0));
  }
  return sets * (request.reps ?? 0);
}

function buildSummary(minutes: number, intensity: ExerciseEstimate["intensity"], exercise: string, request: ExerciseEstimateRequest) {
  const weighted = request.isWeighted && request.weightUsed ? `, ${request.weightUsed} ${request.weightUnit ?? "kg"}` : "";
  const reps = request.useSideReps
    ? `, ${request.sets ?? 1} sets x L${request.leftReps ?? 0}/R${request.rightReps ?? 0}`
    : request.reps ? `, ${request.sets ?? 1} sets x ${request.reps}` : "";
  return `${minutes} min ${intensity} ${exercise.toLowerCase()}${weighted}${reps}.`;
}

function inferExerciseCategory(label: string) {
  const normalized = label.toLowerCase();
  if (/run|walk|treadmill|cycling|swim|stair|elliptical|row/.test(normalized)) return "cardio";
  if (/yoga|pilates|stretch|mobility|plank/.test(normalized)) return "mobility";
  if (/curl|press|deadlift|squat|lunge|pull|push|dip|row|lat|barbell|dumbbell|machine/.test(normalized)) return "strength";
  return "general";
}

function normalizeWeightKg(weight: number | undefined, unit: "kg" | "lb" | undefined) {
  if (!weight) return 0;
  return unit === "lb" ? weight * 0.453592 : weight;
}

function optionalPositiveNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : undefined;
}

function positiveOptionalNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
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
