import { Router } from "express";
import type { ProfileSummary } from "../../../shared/types.js";
import { findUserById, persistUserChange } from "../data/store.js";

export const profileRouter = Router();

profileRouter.get("/", async (request, response) => {
  const user = await findUserById(request.userId!);
  if (!user) {
    response.status(404).json({ message: "User not found." });
    return;
  }
  response.json(withBmi(user.profile));
});

profileRouter.put("/", async (request, response) => {
  const user = await findUserById(request.userId!);
  const nextProfile = request.body ?? {};
  const validationError = validateProfile(nextProfile);

  if (!user) {
    response.status(404).json({ message: "User not found." });
    return;
  }

  if (validationError) {
    response.status(400).json({ message: validationError });
    return;
  }

  user.profile = {
    ...user.profile,
    name: String(nextProfile.name).trim(),
    email: user.email,
    photoUrl: typeof nextProfile.photoUrl === "string" ? nextProfile.photoUrl : user.profile.photoUrl,
    age: Number(nextProfile.age),
    goal: String(nextProfile.goal ?? user.profile.goal).trim(),
    heightCm: Number(nextProfile.heightCm),
    weightKg: Number(nextProfile.weightKg),
    targetWeightKg: Number(nextProfile.targetWeightKg ?? nextProfile.weightKg),
    calorieTarget: Number(nextProfile.calorieTarget)
  };
  user.name = user.profile.name;

  await persistUserChange();
  response.json(withBmi(user.profile));
});

function withBmi(profile: ProfileSummary) {
  const bmi = profile.weightKg / Math.pow(profile.heightCm / 100, 2);
  return { ...profile, bmi: Number(bmi.toFixed(1)) };
}

function validateProfile(profile: Record<string, unknown>) {
  if (typeof profile.name !== "string" || profile.name.trim().length < 2) {
    return "Enter a display name.";
  }

  if (!Number.isFinite(Number(profile.age)) || Number(profile.age) < 13 || Number(profile.age) > 100) {
    return "Age should be between 13 and 100.";
  }

  if (!Number.isFinite(Number(profile.heightCm)) || Number(profile.heightCm) < 90) {
    return "Enter a valid height.";
  }

  if (!Number.isFinite(Number(profile.weightKg)) || Number(profile.weightKg) < 25) {
    return "Enter a valid weight.";
  }

  if (
    !Number.isFinite(Number(profile.targetWeightKg ?? profile.weightKg)) ||
    Number(profile.targetWeightKg ?? profile.weightKg) < 25 ||
    Number(profile.targetWeightKg ?? profile.weightKg) > 300
  ) {
    return "Enter a valid target weight.";
  }

  if (!Number.isFinite(Number(profile.calorieTarget)) || Number(profile.calorieTarget) < 800) {
    return "Enter a realistic calorie goal.";
  }

  if (
    typeof profile.photoUrl === "string" &&
    profile.photoUrl.length > 0 &&
    (!profile.photoUrl.startsWith("data:image/") || profile.photoUrl.length > 750_000)
  ) {
    return "Choose a smaller image file.";
  }

  return "";
}
