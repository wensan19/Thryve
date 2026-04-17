import type { ExerciseEstimateRequest, FoodItem } from "./types.js";

export interface FoodNutritionMatch {
  name: string;
  unit: FoodItem["unit"];
  calories: number;
  terms: string[];
}

export function estimateMealCalories(items: FoodItem[], sweetness = 0) {
  const baseCalories = items.reduce((sum, item) => sum + item.calories * item.quantity, 0);
  const hasSweetIngredient = items.some((item) =>
    /sugar|honey|syrup|jam|cream|chocolate|cake|cookie|dessert|fruit|berry|banana|mango|sweet/i.test(item.name)
  );
  const sweetnessBoost = hasSweetIngredient && sweetness > 55 ? baseCalories * ((sweetness - 55) / 100) * 0.1 : 0;

  return Math.round(baseCalories + sweetnessBoost);
}

export function lookupFoodNutrition(foodName: string): FoodNutritionMatch | undefined {
  const normalized = normalizeFood(foodName);
  if (!normalized) return undefined;

  const ranked = foodNutritionCatalog
    .map((food) => ({ food, score: scoreFoodMatch(normalized, food.terms.map(normalizeFood)) }))
    .sort((a, b) => b.score - a.score);
  const best = ranked[0];

  return best && best.score >= 0.52 ? best.food : undefined;
}

export function applyFoodNutritionToItem(item: FoodItem, foodName: string): FoodItem {
  const match = lookupFoodNutrition(foodName);
  if (!match) {
    return { ...item, name: foodName };
  }

  return {
    ...item,
    name: foodName,
    unit: match.unit,
    calories: match.calories,
    confidence: Math.max(item.confidence, 0.62)
  };
}

export function applyMainFoodCorrection<T extends { title: string; items: FoodItem[]; sweetness: number; calories: number }>(
  meal: T,
  title: string
): T {
  const match = lookupFoodNutrition(title);
  const items = match
    ? [
        {
          id: meal.items[0]?.id ?? crypto.randomUUID(),
          name: match.name,
          quantity: meal.items[0]?.quantity && meal.items[0].quantity > 0 ? meal.items[0].quantity : 1,
          unit: match.unit,
          calories: match.calories,
          confidence: Math.max(meal.items[0]?.confidence ?? 0, 0.65)
        },
        ...meal.items.slice(1)
      ]
    : meal.items;

  return { ...meal, title, items, calories: estimateMealCalories(items, meal.sweetness) };
}

export function estimateExerciseBurn({
  type,
  minutes,
  intensity,
  bodyWeightKg = 70
}: ExerciseEstimateRequest) {
  const match = matchExercise(type);

  const intensityMultiplier = {
    low: 0.82,
    medium: 1,
    high: 1.22
  }[intensity];

  const met = Number((match.met * intensityMultiplier).toFixed(1));
  const caloriesBurned = Math.round((met * 3.5 * bodyWeightKg * minutes) / 200);

  return {
    type,
    matchedExercise: match.label,
    isCustom: match.isCustom,
    minutes,
    intensity,
    caloriesBurned,
    met
  };
}

const exerciseCatalog = [
  { label: "Walking", met: 3.3, terms: ["walking", "walk", "brisk walk", "stroll"] },
  { label: "Running", met: 8.8, terms: ["running", "run", "jogging", "jog", "treadmill", "tread mill"] },
  { label: "Cycling", met: 7.5, terms: ["cycling", "cycle", "bike", "biking", "stationary bike", "spin", "spinning"] },
  { label: "Swimming", met: 6.0, terms: ["swimming", "swim", "laps", "pool"] },
  { label: "Skipping Rope", met: 11.0, terms: ["skipping", "jump rope", "jumprope", "rope"] },
  { label: "Stair Climbing", met: 8.8, terms: ["stairs", "stair", "stair climbing", "step machine", "steps"] },
  { label: "Yoga", met: 2.5, terms: ["yoga", "vinyasa", "hatha"] },
  { label: "Pilates", met: 3.0, terms: ["pilates", "reformer"] },
  { label: "Stretching", met: 2.3, terms: ["stretch", "stretching", "mobility", "warm up", "cool down"] },
  { label: "Strength Training", met: 5.0, terms: ["strength", "weights", "weight lifting", "weightlifting", "lifting", "resistance", "gym workout"] },
  { label: "HIIT", met: 8.0, terms: ["hiit", "interval", "intervals", "circuit", "tabata"] },
  { label: "Dance", met: 5.5, terms: ["dance", "dancing", "zumba"] },
  { label: "Badminton", met: 5.5, terms: ["badminton", "shuttle"] },
  { label: "Tennis", met: 7.0, terms: ["tennis", "racket"] },
  { label: "Basketball", met: 6.5, terms: ["basketball", "hoops"] },
  { label: "Football", met: 7.0, terms: ["football", "soccer", "futsal"] },
  { label: "Volleyball", met: 4.0, terms: ["volleyball", "beach volleyball"] },
  { label: "Hiking", met: 6.0, terms: ["hiking", "hike", "trail", "trek"] },
  { label: "Rowing", met: 7.0, terms: ["rowing", "row", "rower", "erg"] },
  { label: "Elliptical", met: 5.0, terms: ["elliptical", "cross trainer", "crosstrainer"] }
  ,
  { label: "Bicep Curls", met: 3.5, terms: ["curl", "curls", "bicep curl", "biceps curl", "dumbbell curl"] },
  { label: "Pushups", met: 4.0, terms: ["pushup", "push up", "push-up", "press up"] },
  { label: "Sit-ups", met: 3.8, terms: ["situp", "sit up", "sit-up", "crunch", "crunches"] },
  { label: "Plank", met: 3.0, terms: ["plank", "planks", "side plank"] },
  { label: "Squats", met: 5.0, terms: ["squat", "squats", "bodyweight squat", "goblet squat"] },
  { label: "Lunges", met: 4.5, terms: ["lunge", "lunges", "walking lunge"] },
  { label: "Jumping Jacks", met: 8.0, terms: ["jumping jack", "jumping jacks", "star jump"] },
  { label: "Burpees", met: 8.5, terms: ["burpee", "burpees"] },
  { label: "Mountain Climbers", met: 8.0, terms: ["mountain climber", "mountain climbers"] },
  { label: "Shoulder Press", met: 4.0, terms: ["shoulder press", "overhead press", "military press"] },
  { label: "Bench Press", met: 3.8, terms: ["bench press", "chest press"] },
  { label: "Deadlift", met: 6.0, terms: ["deadlift", "dead lift", "romanian deadlift", "rdl"] },
  { label: "Stairmaster", met: 8.8, terms: ["stairmaster", "stair master", "stepmill"] },
  { label: "Incline Walk", met: 5.2, terms: ["incline walk", "incline walking", "incline treadmill"] }
];

export function getExerciseSuggestions(query: string, limit = 5) {
  const normalized = normalizeExercise(query);
  if (!normalized) {
    return exerciseCatalog.slice(0, limit).map((item) => item.label);
  }

  return exerciseCatalog
    .map((item) => ({ item, score: bestExerciseScore(normalized, item.terms) }))
    .filter(({ score }) => score >= 0.34)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ item }) => item.label);
}

function matchExercise(type: string) {
  const normalized = normalizeExercise(type);
  const ranked = exerciseCatalog
    .map((item) => ({ item, score: bestExerciseScore(normalized, item.terms) }))
    .sort((a, b) => b.score - a.score);

  const winner = ranked[0];
  if (winner && winner.score >= 0.42) {
    return { label: winner.item.label, met: winner.item.met, isCustom: false };
  }

  return { label: type.trim() || "Custom exercise", met: 4.2, isCustom: true };
}

function bestExerciseScore(query: string, terms: string[]) {
  return Math.max(...terms.map((term) => scoreExerciseMatch(query, normalizeExercise(term))));
}

function scoreExerciseMatch(query: string, term: string) {
  if (!query) return 0;
  if (query === term) return 1;
  if (term.includes(query) || query.includes(term)) return 0.82;

  const distance = levenshtein(query, term);
  return Math.max(0, 1 - distance / Math.max(query.length, term.length, 1));
}

function normalizeExercise(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
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

const foodNutritionCatalog: FoodNutritionMatch[] = [
  { name: "Chicken rice", unit: "serving", calories: 650, terms: ["chicken rice", "hainanese chicken rice"] },
  { name: "Fried rice", unit: "cup", calories: 250, terms: ["fried rice"] },
  { name: "Cooked rice", unit: "cup", calories: 205, terms: ["rice", "white rice", "cooked rice"] },
  { name: "Nasi lemak", unit: "serving", calories: 650, terms: ["nasi lemak"] },
  { name: "Laksa", unit: "serving", calories: 620, terms: ["laksa"] },
  { name: "Char kway teow", unit: "serving", calories: 740, terms: ["char kway teow", "kway teow"] },
  { name: "Mee goreng", unit: "serving", calories: 660, terms: ["mee goreng", "mi goreng"] },
  { name: "Roti prata", unit: "piece", calories: 170, terms: ["roti prata", "prata"] },
  { name: "Egg", unit: "item", calories: 78, terms: ["egg", "boiled egg", "fried egg"] },
  { name: "Carrot", unit: "gram", calories: 0.41, terms: ["carrot", "carrots"] },
  { name: "Broccoli", unit: "gram", calories: 0.35, terms: ["broccoli"] },
  { name: "Mixed vegetables", unit: "cup", calories: 80, terms: ["vegetables", "mixed vegetables", "veg"] },
  { name: "Chicken breast", unit: "gram", calories: 1.65, terms: ["chicken", "chicken breast", "grilled chicken"] },
  { name: "Beef", unit: "gram", calories: 2.5, terms: ["beef", "steak"] },
  { name: "Salmon", unit: "gram", calories: 2.08, terms: ["salmon"] },
  { name: "Tofu", unit: "gram", calories: 0.8, terms: ["tofu"] },
  { name: "Noodles", unit: "cup", calories: 220, terms: ["noodle", "noodles", "ramen", "pasta"] },
  { name: "Bread", unit: "slice", calories: 95, terms: ["bread", "toast"] },
  { name: "Pizza", unit: "slice", calories: 285, terms: ["pizza"] },
  { name: "Burger", unit: "serving", calories: 520, terms: ["burger", "hamburger"] },
  { name: "Fries", unit: "serving", calories: 320, terms: ["fries", "chips"] },
  { name: "Apple", unit: "item", calories: 95, terms: ["apple"] },
  { name: "Banana", unit: "item", calories: 105, terms: ["banana"] },
  { name: "Milk tea", unit: "cup", calories: 230, terms: ["milk tea", "bubble tea", "boba"] },
  { name: "Cake", unit: "slice", calories: 360, terms: ["cake", "cheesecake"] }
];

function normalizeFood(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}

function scoreFoodMatch(query: string, terms: string[]) {
  return Math.max(
    ...terms.map((term) => {
      if (query === term) return 1;
      if (term.includes(query) || query.includes(term)) return 0.86;
      return Math.max(0, 1 - levenshtein(query, term) / Math.max(query.length, term.length, 1));
    })
  );
}
