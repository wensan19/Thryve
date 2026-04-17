import { Router } from "express";
import type { ExerciseIntensity, ExerciseLog } from "../../../shared/types.js";
import { findUserById, persistUserChange } from "../data/store.js";
import { estimateExerciseBurn } from "../services/calories.js";

export const exerciseRouter = Router();

exerciseRouter.get("/", async (request, response) => {
  const user = await findUserById(request.userId!);
  response.json(user?.exercises ?? []);
});

exerciseRouter.post("/estimate", (request, response) => {
  const { type = "Walking", minutes = 25, intensity = "medium", bodyWeightKg = 70 } = request.body ?? {};
  const validationError = validateExerciseInput(type, minutes, intensity);

  if (validationError) {
    response.status(400).json({ message: validationError });
    return;
  }

  const estimate = estimateExerciseBurn({
    type,
    minutes: Number(minutes),
    intensity: intensity as ExerciseIntensity,
    bodyWeightKg: Number(bodyWeightKg)
  });

  response.json(estimate);
});

exerciseRouter.post("/", async (request, response) => {
  const { type = "Walking", minutes = 25, intensity = "medium", bodyWeightKg = 70, imageUrl = "", notes = "" } = request.body ?? {};
  const validationError = validateExerciseInput(type, minutes, intensity);

  if (validationError) {
    response.status(400).json({ message: validationError });
    return;
  }

  const user = await findUserById(request.userId!);
  if (!user) {
    response.status(404).json({ message: "User not found." });
    return;
  }

  const estimate = estimateExerciseBurn({
    type,
    minutes: Number(minutes),
    intensity: intensity as ExerciseIntensity,
    bodyWeightKg: Number(bodyWeightKg)
  });
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
  const { type, minutes, intensity, bodyWeightKg = user?.profile.weightKg ?? 70, imageUrl, notes } = request.body ?? {};
  const validationError = validateExerciseInput(type, minutes, intensity);

  if (!user || index < 0) {
    response.status(404).json({ message: "Exercise not found." });
    return;
  }

  if (validationError) {
    response.status(400).json({ message: validationError });
    return;
  }

  const estimate = estimateExerciseBurn({
    type,
    minutes: Number(minutes),
    intensity: intensity as ExerciseIntensity,
    bodyWeightKg: Number(bodyWeightKg)
  });

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

function validateExerciseInput(type: unknown, minutes: unknown, intensity: unknown) {
  if (typeof type !== "string" || type.trim().length < 2) {
    return "Enter an exercise type.";
  }

  if (!Number.isFinite(Number(minutes)) || Number(minutes) < 1 || Number(minutes) > 600) {
    return "Duration should be 1 to 600 minutes.";
  }

  if (!["low", "medium", "high"].includes(String(intensity))) {
    return "Choose a valid intensity.";
  }

  return "";
}
