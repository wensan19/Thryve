import { Router } from "express";
import multer from "multer";
import type { MealGuess, MealLog } from "../../../shared/types.js";
import { findUserById, persistUserChange } from "../data/store.js";
import { estimateMealCalories } from "../services/calories.js";
import { guessFoodFromImage } from "../services/aiFood.js";

export const mealRouter = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_request, file, callback) => {
    if (!file.mimetype.startsWith("image/")) {
      callback(new Error("Choose an image file."));
      return;
    }
    callback(null, true);
  }
});

mealRouter.post("/guess", (request, response, next) => {
  upload.single("photo")(request, response, (error) => {
    if (!error) {
      next();
      return;
    }

    const message = error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE"
      ? "Image is too large. Choose one under 8 MB."
      : error.message || "Image upload failed.";
    response.status(400).json({ message });
  });
}, async (request, response) => {
  try {
    const guess = await guessFoodFromImage({
      file: request.file,
      previewDataUrl: typeof request.body.previewDataUrl === "string" ? request.body.previewDataUrl : undefined
    });
    response.json(guess);
  } catch (error) {
    console.error("[food-ai] analysis failed", error);
    response.status(500).json({ message: "Food analysis failed. Try another image or enter manually." });
  }
});

mealRouter.get("/", (_request, response) => {
  findUserById(_request.userId!).then((user) => response.json(user?.meals ?? []));
});

mealRouter.get("/:id", async (request, response) => {
  const user = await findUserById(request.userId!);
  const meal = user?.meals.find((item) => item.id === request.params.id);

  if (!meal) {
    response.status(404).json({ message: "Meal not found." });
    return;
  }

  response.json(meal);
});

mealRouter.post("/", async (request, response) => {
  const meal = request.body as MealGuess;
  const validationError = validateMeal(meal);

  if (validationError) {
    response.status(400).json({ message: validationError });
    return;
  }

  const user = await findUserById(request.userId!);
  if (!user) {
    response.status(404).json({ message: "User not found." });
    return;
  }

  const savedMeal: MealLog = {
    ...meal,
    id: crypto.randomUUID(),
    calories: estimateMealCalories(meal.items, meal.sweetness),
    eatenAt: new Date().toISOString(),
    shared: false
  };

  user.meals.unshift(savedMeal);
  await persistUserChange();
  response.status(201).json(savedMeal);
});

mealRouter.put("/:id", async (request, response) => {
  const user = await findUserById(request.userId!);
  const index = user?.meals.findIndex((meal) => meal.id === request.params.id) ?? -1;

  if (!user || index < 0) {
    response.status(404).json({ message: "Meal not found." });
    return;
  }

  const meal = request.body as MealLog;
  const validationError = validateMeal(meal);

  if (validationError) {
    response.status(400).json({ message: validationError });
    return;
  }

  const updatedMeal: MealLog = {
    ...user.meals[index],
    ...meal,
    id: request.params.id,
    calories: estimateMealCalories(meal.items, meal.sweetness)
  };

  user.meals[index] = updatedMeal;
  await persistUserChange();
  response.json(updatedMeal);
});

mealRouter.delete("/:id", async (request, response) => {
  const user = await findUserById(request.userId!);
  const before = user?.meals.length ?? 0;

  if (!user) {
    response.status(404).json({ message: "User not found." });
    return;
  }

  user.meals = user.meals.filter((meal) => meal.id !== request.params.id);

  if (user.meals.length === before) {
    response.status(404).json({ message: "Meal not found." });
    return;
  }

  await persistUserChange();
  response.status(204).end();
});

function validateMeal(meal: Partial<MealGuess>) {
  if (!meal.title || meal.title.trim().length < 2) {
    return "Meal needs a title.";
  }

  if (!meal.items?.length) {
    return "Meal needs at least one food.";
  }

  if (meal.items.some((item) => !item.name || item.quantity <= 0 || item.calories < 0)) {
    return "Check food names, portions, and calories.";
  }

  return "";
}
