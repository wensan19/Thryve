export type FoodUnit = "item" | "piece" | "serving" | "bowl" | "cup" | "spoon" | "gram" | "slice";
export type ExerciseIntensity = "low" | "medium" | "high";

export interface FoodItem {
  id: string;
  name: string;
  quantity: number;
  unit: FoodUnit;
  calories: number;
  confidence: number;
}

export interface MealGuess {
  id: string;
  photoUrl: string;
  title: string;
  items: FoodItem[];
  calories: number;
  sweetness: number;
  spiciness: number;
  saltiness: number;
  notes: string;
  analysis: {
    provider: "mock" | "real";
    status: "complete";
    summary: string;
    requestId: string;
  };
}

export interface MealLog extends MealGuess {
  eatenAt: string;
  shared: boolean;
}

export interface ExerciseLog {
  id: string;
  type: string;
  minutes: number;
  intensity: ExerciseIntensity;
  caloriesBurned: number;
  loggedAt: string;
  imageUrl?: string;
  notes?: string;
  isWeighted?: boolean;
  weightUsed?: number;
  weightUnit?: "kg" | "lb";
  sets?: number;
  reps?: number;
  useSideReps?: boolean;
  leftReps?: number;
  rightReps?: number;
  estimatedCaloriesBurned?: number;
  caloriesManuallyOverridden?: boolean;
}

export interface ProfileSummary {
  name: string;
  email?: string;
  photoUrl?: string;
  age: number;
  goal: string;
  heightCm: number;
  weightKg: number;
  calorieTarget: number;
}

export interface ExerciseEstimateRequest {
  type: string;
  minutes: number;
  intensity: ExerciseIntensity;
  bodyWeightKg?: number;
  isWeighted?: boolean;
  weightUsed?: number;
  weightUnit?: "kg" | "lb";
  sets?: number;
  reps?: number;
  useSideReps?: boolean;
  leftReps?: number;
  rightReps?: number;
  caloriesBurnedOverride?: number;
  imageUrl?: string;
  notes?: string;
}

export interface ExerciseEstimate {
  type: string;
  matchedExercise: string;
  isCustom: boolean;
  minutes: number;
  intensity: ExerciseIntensity;
  caloriesBurned: number;
  met: number;
  confidence?: number;
  summary?: string;
  provider?: "gemini" | "local";
  exerciseCategory?: string;
  usedWeightedContext?: boolean;
  usedSetsRepsContext?: boolean;
  usedSideRepContext?: boolean;
}

export interface FeedPost {
  id: string;
  type: "meal" | "workout";
  author: string;
  authorId?: string;
  authorPhotoUrl?: string;
  mealTitle: string;
  photoUrl: string;
  calories: number;
  eatenAt?: string;
  ingredientsSummary?: string;
  durationMinutes?: number;
  intensity?: ExerciseIntensity;
  caloriesBurned?: number;
  reactionCounts: Record<string, number>;
  myReaction?: string;
  commentCount: number;
  reactions: number;
  comment: string;
}

export interface FriendSearchResult {
  id: string;
  name: string;
  email: string;
  photoUrl?: string;
  goal?: string;
  isFollowing: boolean;
}

export interface FollowResponse {
  followingUserIds: string[];
}

export interface FeedComment {
  id: string;
  postId: string;
  authorId: string;
  authorName: string;
  authorPhotoUrl?: string;
  text: string;
  createdAt: string;
}

export interface AuthUser {
  id: string;
  name: string;
  email: string;
}

export interface AuthResponse {
  token: string;
  user: AuthUser;
  profile: ProfileSummary;
}

export interface AppDataResponse {
  profile: ProfileSummary;
  meals: MealLog[];
  exercises: ExerciseLog[];
  feed: FeedPost[];
}
