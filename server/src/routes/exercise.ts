import { Router } from "express";
import type { ExerciseLog } from "../../../shared/types.js";
import { findUserById, persistUserChange } from "../data/store.js";
import {
  estimateExerciseWithProvider,
  normalizeExerciseEstimateRequest,
  validateExerciseEstimateRequest
} from "../services/exerciseAi.js";

export const exerciseRouter = Router();

exerciseRouter.get("/", async (request, response) => {
  const user = await findUserById(request.userId!);
  response.json(user?.exercises ?? []);
});

exerciseRouter.post("/estimate", async (request, response) => {
  try {
    const user = await findUserById(request.userId!);
    const estimateRequest = normalizeExerciseEstimateRequest(request.body, user?.profile.weightKg ?? 70);
    const validationError = validateExerciseEstimateRequest(estimateRequest);

    if (validationError) {
      response.status(400).json({ message: validationError });
      return;
    }

    const estimate = await estimateExerciseWithProvider(estimateRequest);

    response.json(estimate);
  } catch (error) {
    console.error("[exercise-ai] estimate route failed", error instanceof Error ? error.message : error);
    response.status(500).json({ message: "Could not estimate this exercise. Please try again." });
  }
});

exerciseRouter.post("/", async (request, response) => {
  const user = await findUserById(request.userId!);
  const estimateRequest = normalizeExerciseEstimateRequest(request.body, user?.profile.weightKg ?? 70);
  const { imageUrl = "", notes = "" } = request.body ?? {};
  const validationError = validateExerciseEstimateRequest(estimateRequest);

  if (validationError) {
    response.status(400).json({ message: validationError });
    return;
  }

  if (!user) {
    response.status(404).json({ message: "User not found." });
    return;
  }

  const estimate = await estimateExerciseWithProvider(estimateRequest);
  const log: ExerciseLog = {
    id: crypto.randomUUID(),
    type: estimate.type,
    minutes: estimate.minutes,
    intensity: estimate.intensity,
    caloriesBurned: estimate.caloriesBurned,
    loggedAt: new Date().toISOString(),
    imageUrl: typeof imageUrl === "string" ? imageUrl : "",
    notes: typeof notes === "string" ? notes : ""
  };

  user.exercises.unshift(log);
  await persistUserChange();
  response.status(201).json(log);
});

exerciseRouter.put("/:id", async (request, response) => {
  const user = await findUserById(request.userId!);
  const index = user?.exercises.findIndex((log) => log.id === request.params.id) ?? -1;
  const { imageUrl, notes } = request.body ?? {};
  const estimateRequest = normalizeExerciseEstimateRequest(request.body, user?.profile.weightKg ?? 70);
  const validationError = validateExerciseEstimateRequest(estimateRequest);

  if (!user || index < 0) {
    response.status(404).json({ message: "Exercise not found." });
    return;
  }

  if (validationError) {
    response.status(400).json({ message: validationError });
    return;
  }

  const estimate = await estimateExerciseWithProvider(estimateRequest);

  const updated: ExerciseLog = {
    ...user.exercises[index],
    type: estimate.type,
    minutes: estimate.minutes,
    intensity: estimate.intensity,
    caloriesBurned: estimate.caloriesBurned,
    imageUrl: typeof imageUrl === "string" ? imageUrl : user.exercises[index].imageUrl,
    notes: typeof notes === "string" ? notes : user.exercises[index].notes
  };

  user.exercises[index] = updated;
  await persistUserChange();
  response.json(updated);
});

exerciseRouter.delete("/:id", async (request, response) => {
  const user = await findUserById(request.userId!);
  const before = user?.exercises.length ?? 0;

  if (!user) {
    response.status(404).json({ message: "User not found." });
    return;
  }

  user.exercises = user.exercises.filter((log) => log.id !== request.params.id);

  if (user.exercises.length === before) {
    response.status(404).json({ message: "Exercise not found." });
    return;
  }

  await persistUserChange();
  response.status(204).end();
});
