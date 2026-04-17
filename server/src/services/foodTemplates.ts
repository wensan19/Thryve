import type { FoodItem } from "../../../shared/types.js";

export interface MealTemplate {
  title: string;
  category: string;
  terms: string[];
  sweetness: number;
  spiciness: number;
  saltiness: number;
  summary: string;
  items: Omit<FoodItem, "id">[];
}

export const mealTemplates: MealTemplate[] = [
  {
    title: "Chicken rice",
    category: "Singapore-style rice meal",
    terms: ["chicken rice", "hainanese", "hainan", "steam chicken", "roast chicken rice"],
    sweetness: 8,
    spiciness: 22,
    saltiness: 42,
    summary: "Detected a Singapore-style chicken rice meal.",
    items: [
      { name: "Chicken rice", quantity: 1, unit: "bowl", calories: 360, confidence: 0.82 },
      { name: "Roasted or steamed chicken", quantity: 120, unit: "gram", calories: 2.05, confidence: 0.76 },
      { name: "Chili sauce", quantity: 1, unit: "spoon", calories: 18, confidence: 0.55 }
    ]
  },
  {
    title: "Nasi lemak",
    category: "Singapore-style rice meal",
    terms: ["nasi lemak", "coconut rice", "ikan bilis", "sambal"],
    sweetness: 16,
    spiciness: 58,
    saltiness: 58,
    summary: "Detected nasi lemak with common sides.",
    items: [
      { name: "Coconut rice", quantity: 1, unit: "bowl", calories: 330, confidence: 0.8 },
      { name: "Fried egg", quantity: 1, unit: "item", calories: 95, confidence: 0.7 },
      { name: "Sambal", quantity: 1.5, unit: "spoon", calories: 45, confidence: 0.64 },
      { name: "Anchovies and peanuts", quantity: 1, unit: "serving", calories: 150, confidence: 0.58 }
    ]
  },
  {
    title: "Laksa",
    category: "Singapore-style noodle meal",
    terms: ["laksa", "curry noodles", "curry noodle"],
    sweetness: 10,
    spiciness: 62,
    saltiness: 54,
    summary: "Detected laksa-style noodles.",
    items: [
      { name: "Rice noodles", quantity: 1.25, unit: "cup", calories: 190, confidence: 0.72 },
      { name: "Coconut curry broth", quantity: 1, unit: "serving", calories: 220, confidence: 0.72 },
      { name: "Fish cake", quantity: 3, unit: "piece", calories: 35, confidence: 0.56 },
      { name: "Prawns", quantity: 3, unit: "piece", calories: 18, confidence: 0.52 }
    ]
  },
  {
    title: "Char kway teow",
    category: "Singapore-style noodle meal",
    terms: ["char kway teow", "kway teow", "fried noodles", "fried noodle"],
    sweetness: 18,
    spiciness: 24,
    saltiness: 62,
    summary: "Detected stir-fried flat noodles.",
    items: [
      { name: "Flat rice noodles", quantity: 1.5, unit: "cup", calories: 210, confidence: 0.76 },
      { name: "Egg", quantity: 1, unit: "item", calories: 78, confidence: 0.62 },
      { name: "Chinese sausage", quantity: 0.5, unit: "serving", calories: 110, confidence: 0.48 },
      { name: "Oil and sauce", quantity: 2, unit: "spoon", calories: 90, confidence: 0.62 }
    ]
  },
  {
    title: "Mee goreng",
    category: "Asian noodle meal",
    terms: ["mee goreng", "mi goreng", "maggie goreng", "fried mee"],
    sweetness: 18,
    spiciness: 50,
    saltiness: 58,
    summary: "Detected spicy fried noodles.",
    items: [
      { name: "Yellow noodles", quantity: 1.5, unit: "cup", calories: 220, confidence: 0.72 },
      { name: "Egg", quantity: 1, unit: "item", calories: 78, confidence: 0.58 },
      { name: "Sweet chili sauce", quantity: 2, unit: "spoon", calories: 45, confidence: 0.58 },
      { name: "Oil", quantity: 1, unit: "spoon", calories: 120, confidence: 0.56 }
    ]
  },
  {
    title: "Fishball noodle soup",
    category: "Asian noodle meal",
    terms: ["fishball", "fish ball", "noodle soup", "soup noodle", "ban mian"],
    sweetness: 6,
    spiciness: 8,
    saltiness: 48,
    summary: "Detected noodle soup with fishballs.",
    items: [
      { name: "Noodles", quantity: 1.25, unit: "cup", calories: 210, confidence: 0.7 },
      { name: "Fishball", quantity: 5, unit: "piece", calories: 35, confidence: 0.68 },
      { name: "Clear broth", quantity: 1, unit: "serving", calories: 45, confidence: 0.58 }
    ]
  },
  {
    title: "Rice chicken bowl",
    category: "Rice meal",
    terms: ["rice", "teriyaki", "grain bowl", "donburi", "bibimbap", "rice bowl"],
    sweetness: 22,
    spiciness: 18,
    saltiness: 48,
    summary: "Detected a rice bowl with protein.",
    items: [
      { name: "Cooked rice", quantity: 1, unit: "cup", calories: 205, confidence: 0.79 },
      { name: "Chicken", quantity: 110, unit: "gram", calories: 1.65, confidence: 0.68 },
      { name: "Sauce", quantity: 1, unit: "spoon", calories: 35, confidence: 0.55 },
      { name: "Vegetables", quantity: 0.5, unit: "cup", calories: 35, confidence: 0.52 }
    ]
  },
  {
    title: "Fried rice",
    category: "Rice meal",
    terms: ["fried rice", "egg rice", "yangzhou"],
    sweetness: 8,
    spiciness: 12,
    saltiness: 52,
    summary: "Detected fried rice.",
    items: [
      { name: "Fried rice", quantity: 1.5, unit: "cup", calories: 250, confidence: 0.78 },
      { name: "Egg", quantity: 1, unit: "item", calories: 78, confidence: 0.62 },
      { name: "Oil", quantity: 1, unit: "spoon", calories: 120, confidence: 0.54 }
    ]
  },
  {
    title: "Pasta with tomato sauce",
    category: "Noodle meal",
    terms: ["pasta", "spaghetti", "linguine", "penne", "macaroni"],
    sweetness: 16,
    spiciness: 20,
    saltiness: 42,
    summary: "Detected a pasta dish.",
    items: [
      { name: "Cooked pasta", quantity: 1.5, unit: "cup", calories: 200, confidence: 0.8 },
      { name: "Tomato sauce", quantity: 0.5, unit: "cup", calories: 70, confidence: 0.66 },
      { name: "Cheese", quantity: 1, unit: "spoon", calories: 22, confidence: 0.48 }
    ]
  },
  {
    title: "Ramen bowl",
    category: "Noodle meal",
    terms: ["ramen", "instant noodles", "instant noodle", "udon", "soba"],
    sweetness: 8,
    spiciness: 28,
    saltiness: 66,
    summary: "Detected a noodle soup bowl.",
    items: [
      { name: "Noodles", quantity: 1.5, unit: "cup", calories: 220, confidence: 0.74 },
      { name: "Broth", quantity: 1, unit: "serving", calories: 90, confidence: 0.58 },
      { name: "Egg", quantity: 1, unit: "item", calories: 78, confidence: 0.52 },
      { name: "Pork or chicken slices", quantity: 60, unit: "gram", calories: 2.2, confidence: 0.46 }
    ]
  },
  {
    title: "Egg and avocado plate",
    category: "Breakfast",
    terms: ["egg", "breakfast", "sample", "avocado", "toast"],
    sweetness: 12,
    spiciness: 18,
    saltiness: 34,
    summary: "Detected a simple breakfast plate.",
    items: [
      { name: "Egg", quantity: 2, unit: "item", calories: 78, confidence: 0.82 },
      { name: "Avocado", quantity: 0.5, unit: "item", calories: 160, confidence: 0.74 },
      { name: "Toast", quantity: 1, unit: "slice", calories: 95, confidence: 0.58 }
    ]
  },
  {
    title: "Oatmeal bowl",
    category: "Breakfast",
    terms: ["oatmeal", "porridge", "overnight oats", "oat", "oats"],
    sweetness: 42,
    spiciness: 0,
    saltiness: 6,
    summary: "Detected an oat breakfast bowl.",
    items: [
      { name: "Cooked oats", quantity: 1, unit: "cup", calories: 155, confidence: 0.78 },
      { name: "Banana", quantity: 0.5, unit: "item", calories: 53, confidence: 0.54 },
      { name: "Nut butter", quantity: 1, unit: "spoon", calories: 95, confidence: 0.42 }
    ]
  },
  {
    title: "Kaya toast set",
    category: "Singapore-style breakfast",
    terms: ["kaya", "kopi", "toast set", "soft boiled", "soft-boiled"],
    sweetness: 58,
    spiciness: 0,
    saltiness: 28,
    summary: "Detected a kaya toast breakfast set.",
    items: [
      { name: "Kaya toast", quantity: 2, unit: "slice", calories: 150, confidence: 0.74 },
      { name: "Soft-boiled egg", quantity: 2, unit: "item", calories: 70, confidence: 0.62 },
      { name: "Kopi or tea", quantity: 1, unit: "cup", calories: 90, confidence: 0.46 }
    ]
  },
  {
    title: "Roti prata",
    category: "Singapore-style breakfast",
    terms: ["roti prata", "prata", "roti canai"],
    sweetness: 8,
    spiciness: 32,
    saltiness: 42,
    summary: "Detected roti prata with curry.",
    items: [
      { name: "Roti prata", quantity: 2, unit: "piece", calories: 170, confidence: 0.78 },
      { name: "Curry gravy", quantity: 0.25, unit: "cup", calories: 80, confidence: 0.6 }
    ]
  },
  {
    title: "Chicken salad bowl",
    category: "Salad",
    terms: ["salad", "greens", "chicken bowl"],
    sweetness: 14,
    spiciness: 12,
    saltiness: 36,
    summary: "Detected a protein salad bowl.",
    items: [
      { name: "Mixed greens", quantity: 2, unit: "cup", calories: 12, confidence: 0.82 },
      { name: "Grilled chicken", quantity: 120, unit: "gram", calories: 1.65, confidence: 0.76 },
      { name: "Dressing", quantity: 1.5, unit: "spoon", calories: 55, confidence: 0.62 }
    ]
  },
  {
    title: "Sushi set",
    category: "Asian meal",
    terms: ["sushi", "maki", "roll", "sashimi"],
    sweetness: 18,
    spiciness: 10,
    saltiness: 46,
    summary: "Detected sushi pieces.",
    items: [
      { name: "Sushi roll", quantity: 6, unit: "piece", calories: 45, confidence: 0.76 },
      { name: "Soy sauce", quantity: 1, unit: "spoon", calories: 8, confidence: 0.45 }
    ]
  },
  {
    title: "Burger and fries",
    category: "Fast food",
    terms: ["burger", "fries", "chips", "mcdonald", "mcdonalds", "kfc", "fast food"],
    sweetness: 10,
    spiciness: 15,
    saltiness: 62,
    summary: "Detected a fast-food meal.",
    items: [
      { name: "Burger", quantity: 1, unit: "serving", calories: 520, confidence: 0.78 },
      { name: "Fries", quantity: 1, unit: "serving", calories: 320, confidence: 0.7 }
    ]
  },
  {
    title: "Pizza slices",
    category: "Fast food",
    terms: ["pizza", "pepperoni", "domino", "slice"],
    sweetness: 8,
    spiciness: 18,
    saltiness: 55,
    summary: "Detected pizza slices.",
    items: [
      { name: "Pizza", quantity: 2, unit: "slice", calories: 285, confidence: 0.84 }
    ]
  },
  {
    title: "Fried chicken meal",
    category: "Fast food",
    terms: ["fried chicken", "chicken wing", "wings", "nuggets", "nugget"],
    sweetness: 8,
    spiciness: 26,
    saltiness: 60,
    summary: "Detected fried chicken.",
    items: [
      { name: "Fried chicken", quantity: 2, unit: "piece", calories: 230, confidence: 0.78 },
      { name: "Dipping sauce", quantity: 1, unit: "spoon", calories: 45, confidence: 0.42 }
    ]
  },
  {
    title: "Yogurt berry bowl",
    category: "Breakfast dessert",
    terms: ["yogurt", "berry", "berries", "granola"],
    sweetness: 68,
    spiciness: 0,
    saltiness: 10,
    summary: "Detected a sweet breakfast bowl.",
    items: [
      { name: "Greek yogurt", quantity: 0.75, unit: "cup", calories: 120, confidence: 0.78 },
      { name: "Berries", quantity: 0.5, unit: "cup", calories: 42, confidence: 0.74 },
      { name: "Granola", quantity: 0.25, unit: "cup", calories: 120, confidence: 0.62 }
    ]
  },
  {
    title: "Pancakes with syrup",
    category: "Dessert breakfast",
    terms: ["pancake", "waffle", "syrup"],
    sweetness: 78,
    spiciness: 0,
    saltiness: 14,
    summary: "Detected a sweet breakfast plate.",
    items: [
      { name: "Pancake", quantity: 3, unit: "piece", calories: 90, confidence: 0.8 },
      { name: "Maple syrup", quantity: 2, unit: "spoon", calories: 52, confidence: 0.66 }
    ]
  },
  {
    title: "Cake slice",
    category: "Dessert",
    terms: ["cake", "cheesecake", "brownie", "tiramisu"],
    sweetness: 82,
    spiciness: 0,
    saltiness: 8,
    summary: "Detected a dessert slice.",
    items: [
      { name: "Cake", quantity: 1, unit: "slice", calories: 360, confidence: 0.78 },
      { name: "Cream or frosting", quantity: 1, unit: "spoon", calories: 80, confidence: 0.42 }
    ]
  },
  {
    title: "Ice cream",
    category: "Dessert",
    terms: ["ice cream", "gelato", "soft serve", "sundae"],
    sweetness: 88,
    spiciness: 0,
    saltiness: 6,
    summary: "Detected ice cream.",
    items: [
      { name: "Ice cream", quantity: 1, unit: "cup", calories: 270, confidence: 0.78 },
      { name: "Topping", quantity: 1, unit: "spoon", calories: 55, confidence: 0.36 }
    ]
  },
  {
    title: "Bubble tea",
    category: "Drink",
    terms: ["bubble tea", "boba", "milk tea", "pearl milk", "kopi", "teh"],
    sweetness: 78,
    spiciness: 0,
    saltiness: 4,
    summary: "Detected a sweet drink.",
    items: [
      { name: "Milk tea", quantity: 1, unit: "cup", calories: 230, confidence: 0.76 },
      { name: "Tapioca pearls", quantity: 1, unit: "serving", calories: 150, confidence: 0.62 }
    ]
  },
  {
    title: "Smoothie",
    category: "Drink",
    terms: ["smoothie", "juice", "fruit drink", "shake"],
    sweetness: 72,
    spiciness: 0,
    saltiness: 4,
    summary: "Detected a fruit drink.",
    items: [
      { name: "Fruit smoothie", quantity: 1, unit: "cup", calories: 220, confidence: 0.72 },
      { name: "Added yogurt or milk", quantity: 0.5, unit: "cup", calories: 75, confidence: 0.4 }
    ]
  },
  {
    title: "Snack plate",
    category: "Snack",
    terms: ["snack", "chips", "crackers", "biscuit", "cookies", "nuts"],
    sweetness: 35,
    spiciness: 8,
    saltiness: 42,
    summary: "Detected a snack plate.",
    items: [
      { name: "Snack portion", quantity: 1, unit: "serving", calories: 220, confidence: 0.58 }
    ]
  }
];
