import type {
  AuthResponse,
  ExerciseEstimate,
  ExerciseEstimateRequest,
  ExerciseLog,
  FeedPost,
  FeedComment,
  FollowResponse,
  FriendSearchResult,
  MealGuess,
  MealLog,
  ProfileSummary
} from "../../shared/types";

export const authExpiredEvent = "thryve:auth-expired";

export class ApiClient {
  private baseUrl = getApiBaseUrl();
  private token = localStorage.getItem("thryve_token") ?? "";

  hasToken() {
    return Boolean(this.getStoredToken());
  }

  setToken(token: string) {
    this.token = token;
    localStorage.setItem("thryve_token", token);
  }

  clearToken() {
    this.token = "";
    localStorage.removeItem("thryve_token");
  }

  async signup(name: string, email: string, password: string): Promise<AuthResponse> {
    const auth = await this.request<AuthResponse>("/api/auth/signup", {
      method: "POST",
      body: JSON.stringify({ name, email, password })
    }, false);
    this.setToken(auth.token);
    return auth;
  }

  async login(email: string, password: string): Promise<AuthResponse> {
    const auth = await this.request<AuthResponse>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password })
    }, false);
    this.setToken(auth.token);
    return auth;
  }

  async me(): Promise<AuthResponse> {
    const auth = await this.request<AuthResponse>("/api/auth/me");
    this.setToken(auth.token);
    return auth;
  }

  async logout() {
    await this.request<void>("/api/auth/logout", { method: "POST" });
    this.clearToken();
  }

  async guessMeal(file: File | undefined, previewDataUrl: string): Promise<MealGuess> {
    const formData = new FormData();
    if (file) {
      formData.append("photo", file);
    }
    formData.append("previewDataUrl", previewDataUrl);

    return this.request<MealGuess>("/api/meals/guess", {
      method: "POST",
      body: formData,
      headers: {}
    });
  }

  async getMeals(): Promise<MealLog[]> {
    return this.request<MealLog[]>("/api/meals");
  }

  async saveMeal(meal: MealGuess): Promise<MealLog> {
    return this.request<MealLog>("/api/meals", {
      method: "POST",
      body: JSON.stringify(meal)
    });
  }

  async updateMeal(meal: MealLog): Promise<MealLog> {
    return this.request<MealLog>(`/api/meals/${meal.id}`, {
      method: "PUT",
      body: JSON.stringify(meal)
    });
  }

  async deleteMeal(id: string): Promise<void> {
    await this.request<void>(`/api/meals/${id}`, { method: "DELETE" });
  }

  async getProfile(): Promise<ProfileSummary> {
    return this.request<ProfileSummary>("/api/profile");
  }

  async updateProfile(profile: ProfileSummary): Promise<ProfileSummary> {
    return this.request<ProfileSummary>("/api/profile", {
      method: "PUT",
      body: JSON.stringify(profile)
    });
  }

  async getExercises(): Promise<ExerciseLog[]> {
    return this.request<ExerciseLog[]>("/api/exercise");
  }

  async estimateExercise(request: ExerciseEstimateRequest): Promise<ExerciseEstimate> {
    return this.request<ExerciseEstimate>("/api/exercise/estimate", {
      method: "POST",
      body: JSON.stringify(request)
    });
  }

  async saveExercise(request: ExerciseEstimateRequest): Promise<ExerciseLog> {
    return this.request<ExerciseLog>("/api/exercise", {
      method: "POST",
      body: JSON.stringify(request)
    });
  }

  async updateExercise(id: string, request: ExerciseEstimateRequest): Promise<ExerciseLog> {
    return this.request<ExerciseLog>(`/api/exercise/${id}`, {
      method: "PUT",
      body: JSON.stringify(request)
    });
  }

  async deleteExercise(id: string): Promise<void> {
    await this.request<void>(`/api/exercise/${id}`, { method: "DELETE" });
  }

  async getFeed(): Promise<FeedPost[]> {
    return this.request<FeedPost[]>("/api/feed");
  }

  async getFeedSummary(): Promise<{ followingCount: number }> {
    return this.request<{ followingCount: number }>("/api/feed/summary");
  }

  async searchFriends(query: string): Promise<FriendSearchResult[]> {
    return this.request<FriendSearchResult[]>(`/api/feed/friends/search?q=${encodeURIComponent(query)}`);
  }

  async followUser(userId: string): Promise<FollowResponse> {
    return this.request<FollowResponse>(`/api/feed/friends/${userId}/follow`, {
      method: "POST"
    });
  }

  async unfollowUser(userId: string): Promise<FollowResponse> {
    return this.request<FollowResponse>(`/api/feed/friends/${userId}/follow`, {
      method: "DELETE"
    });
  }

  async reactToPost(postId: string, reaction: string): Promise<Pick<FeedPost, "reactionCounts" | "myReaction" | "commentCount">> {
    return this.request<Pick<FeedPost, "reactionCounts" | "myReaction" | "commentCount">>(`/api/feed/posts/${postId}/reactions`, {
      method: "POST",
      body: JSON.stringify({ reaction })
    });
  }

  async getComments(postId: string): Promise<FeedComment[]> {
    return this.request<FeedComment[]>(`/api/feed/posts/${postId}/comments`);
  }

  async addComment(postId: string, text: string): Promise<FeedComment> {
    return this.request<FeedComment>(`/api/feed/posts/${postId}/comments`, {
      method: "POST",
      body: JSON.stringify({ text })
    });
  }

  private async request<T>(path: string, init: RequestInit = {}, includeAuth = true): Promise<T> {
    const headers = new Headers(init.headers);
    const isFormData = init.body instanceof FormData;

    if (!isFormData && init.body && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }

    const token = this.getStoredToken();
    if (includeAuth && token) {
      headers.set("Authorization", `Bearer ${token}`);
    }

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, { ...init, headers });
    } catch {
      throw new Error("Could not reach the Thryve server. Please try again.");
    }

    if (response.status === 204) {
      return undefined as T;
    }

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      if (response.status === 401 && includeAuth) {
        this.clearToken();
        window.dispatchEvent(new CustomEvent(authExpiredEvent));
      }
      throw new Error(data.message ?? "Request failed");
    }

    return data as T;
  }

  private getStoredToken() {
    const storedToken = localStorage.getItem("thryve_token") ?? "";
    if (storedToken !== this.token) {
      this.token = storedToken;
    }
    return this.token;
  }
}

function getApiBaseUrl() {
  const configuredUrl = import.meta.env.VITE_API_BASE_URL?.trim();

  if (configuredUrl) {
    return configuredUrl.replace(/\/$/, "");
  }

  if (import.meta.env.DEV) {
    return "http://localhost:8787";
  }

  return "";
}
