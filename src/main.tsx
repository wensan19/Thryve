import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Activity,
  Camera,
  Heart,
  Home,
  MessageCircle,
  Salad,
  Search,
  Sparkles,
  User,
  Users
} from "lucide-react";
import type {
  AuthUser,
  ExerciseEstimate,
  ExerciseIntensity,
  ExerciseLog,
  FeedComment,
  FeedPost,
  FoodItem,
  FriendSearchResult,
  MealGuess,
  MealLog,
  ProfileSummary
} from "../shared/types";
import {
  applyFoodNutritionToItem,
  applyMainFoodCorrection,
  estimateMealCalories,
  getExerciseSuggestions
} from "../shared/nutrition";
import { ApiClient } from "./services/api";
import "./styles.css";

type Screen = "home" | "scan" | "edit" | "ate" | "exercise" | "profile" | "friends";
type AsyncState = "idle" | "loading" | "success" | "error";

const api = new ApiClient();
const samplePhoto = "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=900&q=80";
const maxUploadBytes = 8 * 1024 * 1024;
const consentVersion = "2026-04-17";
const consentStorageKey = "thryve.consent.version";

const initialProfile: ProfileSummary = {
  name: "Maya",
  email: "maya@example.com",
  photoUrl: "",
  age: 24,
  goal: "Feel lighter and stronger",
  heightCm: 166,
  weightKg: 58,
  calorieTarget: 1850
};

function App() {
  const [screen, setScreen] = useState<Screen>("home");
  const [consentAccepted, setConsentAccepted] = useState(hasAcceptedConsent);
  const [booting, setBooting] = useState(api.hasToken() && consentAccepted);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [profile, setProfile] = useState<ProfileSummary>(initialProfile);
  const [mealDraft, setMealDraft] = useState<MealGuess | MealLog | null>(null);
  const [mealLogs, setMealLogs] = useState<MealLog[]>([]);
  const [exerciseLogs, setExerciseLogs] = useState<ExerciseLog[]>([]);
  const [feedPosts, setFeedPosts] = useState<FeedPost[]>([]);
  const [followingCount, setFollowingCount] = useState(0);
  const [appError, setAppError] = useState("");

  useEffect(() => {
    if (!consentAccepted) {
      setBooting(false);
      return;
    }

    if (!api.hasToken()) {
      setBooting(false);
      return;
    }

    api
      .me()
      .then((auth) => {
        setUser(auth.user);
        setProfile(auth.profile);
        return loadAppData();
      })
      .catch(() => {
        api.clearToken();
        setUser(null);
      })
      .finally(() => setBooting(false));
  }, [consentAccepted]);

  const totals = useMemo(() => {
    const eaten = totalMealCaloriesForDay(mealLogs);
    const burned = exerciseLogs.reduce((sum, log) => sum + log.caloriesBurned, 0);
    return { eaten, burned, remaining: profile.calorieTarget - eaten + burned };
  }, [exerciseLogs, mealLogs, profile.calorieTarget]);

  async function loadAppData() {
    const [loadedProfile, meals, exercises, feed, feedSummary] = await Promise.all([
      api.getProfile(),
      api.getMeals(),
      api.getExercises(),
      api.getFeed(),
      api.getFeedSummary()
    ]);
    setProfile(loadedProfile);
    setMealLogs(meals);
    setExerciseLogs(exercises);
    setFeedPosts(feed);
    setFollowingCount(feedSummary.followingCount);
  }

  async function handleAuth(mode: "login" | "signup", name: string, email: string, password: string) {
    const auth = mode === "signup" ? await api.signup(name, email, password) : await api.login(email, password);
    setUser(auth.user);
    setProfile(auth.profile);
    await loadAppData();
    setScreen("home");
  }

  async function logout() {
    await api.logout().catch(() => undefined);
    setUser(null);
    setMealLogs([]);
    setExerciseLogs([]);
    setFeedPosts([]);
  }

  async function scanImage(file: File | undefined, previewDataUrl: string) {
    const result = await api.guessMeal(file, previewDataUrl);
    setMealDraft(result);
    return result;
  }

  async function saveMeal(meal: MealGuess | MealLog) {
    const saved = "eatenAt" in meal ? await api.updateMeal(meal) : await api.saveMeal(meal);
    setMealLogs((current) => {
      const exists = current.some((item) => item.id === saved.id);
      return exists ? current.map((item) => (item.id === saved.id ? saved : item)) : [saved, ...current];
    });
    setMealDraft(null);
    setScreen("ate");
  }

  async function deleteMeal(id: string) {
    await api.deleteMeal(id);
    setMealLogs((current) => current.filter((meal) => meal.id !== id));
  }

  async function saveProfile(nextProfile: ProfileSummary) {
    const saved = await api.updateProfile(nextProfile);
    setProfile(saved);
    setUser((current) => current ? { ...current, name: saved.name } : current);
    return saved;
  }

  async function saveExercise(type: string, minutes: number, intensity: ExerciseIntensity, editingId?: string, imageUrl?: string) {
    const request = { type, minutes, intensity, bodyWeightKg: profile.weightKg, imageUrl };
    const saved = editingId ? await api.updateExercise(editingId, request) : await api.saveExercise(request);
    setExerciseLogs((current) => {
      const exists = current.some((log) => log.id === saved.id);
      return exists ? current.map((log) => (log.id === saved.id ? saved : log)) : [saved, ...current];
    });
    return saved;
  }

  async function deleteExercise(id: string) {
    await api.deleteExercise(id);
    setExerciseLogs((current) => current.filter((log) => log.id !== id));
  }

  async function followUser(targetUserId: string) {
    const response = await api.followUser(targetUserId);
    setFollowingCount(response.followingUserIds.length);
    setFeedPosts(await api.getFeed());
    return response;
  }

  async function unfollowUser(targetUserId: string) {
    const response = await api.unfollowUser(targetUserId);
    setFollowingCount(response.followingUserIds.length);
    setFeedPosts(await api.getFeed());
    return response;
  }

  async function reactToPost(postId: string, reaction: string) {
    const social = await api.reactToPost(postId, reaction);
    setFeedPosts((current) => current.map((post) => post.id === postId ? { ...post, ...social, reactions: Object.values(social.reactionCounts).reduce((sum, count) => sum + count, 0) } : post));
  }

  function acceptConsent() {
    localStorage.setItem(consentStorageKey, consentVersion);
    setConsentAccepted(true);
    setBooting(api.hasToken());
  }

  if (!consentAccepted) {
    return <Shell><ConsentGate onAccept={acceptConsent} /></Shell>;
  }

  if (booting) {
    return <Shell><section className="screen login-screen"><Header title="Thryve" subtitle="Loading your space..." /></section></Shell>;
  }

  if (!user) {
    return <Shell><LoginScreen onSubmit={handleAuth} /></Shell>;
  }

  return (
    <Shell nav={<BottomNav active={screen} onNavigate={setScreen} />}>
      {appError && <div className="toast">{appError}</div>}
      {screen === "home" && (
        <HomeScreen totals={totals} profile={profile} mealLogs={mealLogs} onNavigate={setScreen} />
      )}
      {screen === "scan" && (
        <ScanScreen
          onAnalyze={scanImage}
          onComplete={(meal) => {
            setMealDraft(meal);
            setScreen("edit");
          }}
        />
      )}
      {screen === "edit" && mealDraft && (
        <EditMealScreen
          meal={mealDraft}
          mealLogs={mealLogs}
          calorieTarget={profile.calorieTarget}
          onChange={setMealDraft}
          onSave={saveMeal}
        />
      )}
      {screen === "ate" && (
        <WhatIAteScreen
          mealLogs={mealLogs}
          onScan={() => setScreen("scan")}
          onEdit={(meal) => {
            setMealDraft(meal);
            setScreen("edit");
          }}
          onDelete={(id) => deleteMeal(id).catch((error) => setAppError(error.message))}
        />
      )}
      {screen === "exercise" && (
        <ExerciseScreen logs={exerciseLogs} profile={profile} onSave={saveExercise} onDelete={deleteExercise} />
      )}
      {screen === "profile" && (
        <ProfileScreen profile={profile} totals={totals} onSave={saveProfile} onLogout={logout} />
      )}
      {screen === "friends" && (
        <FriendsScreen
          posts={feedPosts}
          followingCount={followingCount}
          onFollow={followUser}
          onUnfollow={unfollowUser}
          onReact={reactToPost}
        />
      )}
    </Shell>
  );
}

function Shell({ children, nav }: { children: React.ReactNode; nav?: React.ReactNode }) {
  return (
    <div className="app-shell">
      <div className="phone-frame">
        <main className="app-main">{children}</main>
        {nav}
      </div>
    </div>
  );
}

function ConsentGate({ onAccept }: { onAccept: () => void }) {
  const [checked, setChecked] = useState(false);
  const [declined, setDeclined] = useState(false);
  const [expanded, setExpanded] = useState(false);

  if (declined) {
    return (
      <section className="screen consent-screen">
        <div className="consent-card">
          <p className="eyebrow">Consent required</p>
          <h1>Access paused</h1>
          <p>
            Thryve can only be used after you confirm that you are 18 or older and accept the prototype terms.
          </p>
          <button className="secondary-button full" onClick={() => setDeclined(false)}>Review terms again</button>
        </div>
      </section>
    );
  }

  return (
    <section className="screen consent-screen">
      <div className="consent-card">
        <div>
          <p className="eyebrow">Before you continue</p>
          <h1>Use Thryve with care</h1>
          <p>
            Thryve is a prototype wellness tracker. AI estimates can be wrong, and this app is not medical advice.
          </p>
        </div>

        <div className="consent-summary">
          <span>AI can be inaccurate.</span>
          <span>Not medical or nutrition advice.</span>
          <span>For users 18+ only.</span>
          <span>Review and edit your own results.</span>
        </div>

        <button className="terms-toggle" type="button" onClick={() => setExpanded((value) => !value)}>
          {expanded ? "Hide full terms" : "View full terms"}
        </button>

        <div className={`terms-box ${expanded ? "expanded" : ""}`}>
          <h3>Consent and prototype terms</h3>
          <p>
            Thryve is a prototype/demo wellness app provided for informational and personal tracking purposes only. It is not a medical, nutritional, legal, fitness, or other professional service.
          </p>
          <p>
            Thryve includes AI-assisted features. Meal analysis, ingredient detection, portion estimates, calorie estimates, and exercise estimates may be inaccurate or incomplete. AI-generated results should always be reviewed, corrected, and confirmed by you before you rely on them for tracking.
          </p>
          <p>
            During development and app functionality, Thryve may use tools or services such as ChatGPT/OpenAI, Codex, and Gemini API where applicable. Depending on configuration, uploaded images and entered data may be processed by third-party AI services.
          </p>
          <p>
            Thryve does not provide medical advice, diagnosis, treatment, or professional nutrition guidance. Do not use it for health-critical decisions. Speak with a qualified professional for medical, nutrition, or fitness guidance.
          </p>
          <p>
            You are responsible for reviewing and correcting meal, calorie, workout, profile, and social information. You use Thryve at your own discretion and risk.
          </p>
          <p>
            Prototype storage may be local, limited, and not production-grade. Do not upload highly sensitive personal information, private documents, or images you would not want processed by development systems.
          </p>
          <p>
            You confirm that you are 18 years or older. Thryve is not directed to people under 18.
          </p>
          <p>
            To the fullest extent reasonable for a prototype, Thryve and its creators are not responsible for decisions, losses, health outcomes, data issues, or other harm arising from use of the app or reliance on its estimates. By continuing, you understand that the app is experimental and informational.
          </p>
        </div>

        <label className="consent-check">
          <input type="checkbox" checked={checked} onChange={(event) => setChecked(event.target.checked)} />
          <span>
            I am 18 or older, I understand Thryve is a prototype, AI may be wrong, it is not medical advice, and I agree to review my own results before use.
          </span>
        </label>

        <div className="consent-actions">
          <button className="primary-button" disabled={!checked} onClick={onAccept}>I Agree and Continue</button>
          <button className="secondary-button full" onClick={() => setDeclined(true)}>Decline</button>
        </div>
        <p className="tiny">Consent version {consentVersion}. Future terms updates may ask you to accept again.</p>
      </div>
    </section>
  );
}

function LoginScreen({
  onSubmit
}: {
  onSubmit: (mode: "login" | "signup", name: string, email: string, password: string) => Promise<void>;
}) {
  const [mode, setMode] = useState<"login" | "signup">("signup");
  const [name, setName] = useState("Maya");
  const [email, setEmail] = useState("maya@example.com");
  const [password, setPassword] = useState("thryve1");
  const [status, setStatus] = useState<AsyncState>("idle");
  const [message, setMessage] = useState("Use this test account or create your own.");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setStatus("loading");
    setMessage(mode === "signup" ? "Creating your account..." : "Signing you in...");

    try {
      await onSubmit(mode, name, email, password);
      setStatus("success");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Could not continue.");
    }
  }

  return (
    <section className="screen login-screen">
      <img className="brand-mark logo-mark" src="/logo.jpeg" alt="Thryve logo" />
      <div>
        <p className="eyebrow">Thryve</p>
        <h1>Track meals with a lighter touch.</h1>
        <p className="subtle">Your meals, movement, and goals stay with your account.</p>
      </div>
      <form className="auth-panel" onSubmit={submit}>
        <div className="segmented">
          <button type="button" className={mode === "login" ? "active" : ""} onClick={() => setMode("login")}>Login</button>
          <button type="button" className={mode === "signup" ? "active" : ""} onClick={() => setMode("signup")}>Sign up</button>
        </div>
        {mode === "signup" && <FormField label="Name" value={name} onChange={setName} />}
        <FormField label="Email" value={email} onChange={setEmail} type="email" />
        <FormField label="Password" value={password} onChange={setPassword} type="password" />
        <button className="primary-button" disabled={status === "loading"}>
          {status === "loading" ? "Please wait..." : mode === "signup" ? "Create account" : "Login"}
        </button>
        <StatusLine status={status} text={message} />
      </form>
    </section>
  );
}

function hasAcceptedConsent() {
  return localStorage.getItem(consentStorageKey) === consentVersion;
}

function HomeScreen({
  totals,
  profile,
  mealLogs,
  onNavigate
}: {
  totals: { eaten: number; burned: number; remaining: number };
  profile: ProfileSummary;
  mealLogs: MealLog[];
  onNavigate: (screen: Screen) => void;
}) {
  const latest = mealLogs[0];

  return (
    <section className="screen">
      <Header title={`Hi, ${profile.name}`} subtitle="A steady day beats a perfect one." />
      <div className="hero-card">
        <div>
          <span className="pill">Today</span>
          <h2>{Math.max(totals.remaining, 0)} cal left</h2>
          <p>{totals.eaten} eaten / {totals.burned} burned</p>
        </div>
      </div>
      <div className="section-heading">
        <h3>Latest meal</h3>
        <button onClick={() => onNavigate("ate")}>View all</button>
      </div>
      {latest ? <MealRow meal={latest} /> : <EmptyState text="Saved meals will appear here." />}
    </section>
  );
}

function ScanScreen({
  onAnalyze,
  onComplete
}: {
  onAnalyze: (file: File | undefined, previewDataUrl: string) => Promise<MealGuess>;
  onComplete: (meal: MealGuess) => void;
}) {
  const [file, setFile] = useState<File>();
  const [preview, setPreview] = useState(samplePhoto);
  const [status, setStatus] = useState<AsyncState>("idle");
  const [message, setMessage] = useState("Choose a photo or start with manual entry.");

  async function handleFile(nextFile?: File) {
    if (!nextFile) return;
    if (!nextFile.type.startsWith("image/")) {
      setStatus("error");
      setMessage("Choose an image file.");
      return;
    }
    if (nextFile.size > maxUploadBytes) {
      setStatus("error");
      setMessage("Choose an image under 8 MB.");
      return;
    }

    setStatus("loading");
    setMessage("Preparing image...");

    const preparedFile = await prepareImageForUpload(nextFile);
    setFile(preparedFile);
    const dataUrl = await fileToDataUrl(preparedFile);
    setPreview(dataUrl);
    setMessage("Reading the meal estimate...");

    try {
      const meal = await onAnalyze(preparedFile, dataUrl);
      setStatus("success");
      onComplete(meal);
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Analysis failed.");
    }
  }

  return (
    <section className="screen">
      <Header title="Add meal" subtitle="Take a photo, upload one, or enter it yourself." />
      <div className="photo-stage">
        <img src={preview} alt="Food preview" />
        <div className={`scan-badge ${status}`}><Sparkles size={16} /> {statusLabel(status)}</div>
      </div>
      <StatusLine status={status} text={message} />
      <label className="upload-control">
        <Camera size={22} />
        <span>{file ? "Choose another photo" : "Take or upload photo"}</span>
        <input type="file" accept="image/*" capture="environment" onChange={(event) => handleFile(event.target.files?.[0])} />
      </label>
      <button className="secondary-button full" disabled={status === "loading"} onClick={() => onComplete(makeManualMeal())}>
        Enter meal manually
      </button>
    </section>
  );
}

function EditMealScreen({
  meal,
  mealLogs,
  calorieTarget,
  onChange,
  onSave
}: {
  meal: MealGuess | MealLog;
  mealLogs: MealLog[];
  calorieTarget: number;
  onChange: (meal: MealGuess | MealLog) => void;
  onSave: (meal: MealGuess | MealLog) => Promise<void>;
}) {
  const [status, setStatus] = useState<AsyncState>("idle");
  const [message, setMessage] = useState("");

  function withCalories(nextMeal: MealGuess | MealLog) {
    return { ...nextMeal, calories: estimateMealCalories(nextMeal.items, nextMeal.sweetness) };
  }

  function updateItem(id: string, patch: Partial<FoodItem>) {
    const items = meal.items.map((item) => (item.id === id ? { ...item, ...patch } : item));
    onChange(withCalories({ ...meal, items }));
  }

  function renameItem(id: string, name: string) {
    const items = meal.items.map((item) => (item.id === id ? applyFoodNutritionToItem(item, name) : item));
    onChange(withCalories({ ...meal, items }));
  }

  function updateFlavor(key: "sweetness" | "spiciness" | "saltiness", value: number) {
    onChange(withCalories({ ...meal, [key]: value }));
  }

  const persistedToday = totalMealCaloriesForDay(
    "eatenAt" in meal ? mealLogs.filter((savedMeal) => savedMeal.id !== meal.id) : mealLogs
  );
  const totalToday = persistedToday + meal.calories;
  const remainingToday = calorieTarget - totalToday;

  async function save() {
    if (meal.items.some((item) => !item.name.trim() || item.quantity <= 0)) {
      setStatus("error");
      setMessage("Check food names and portions.");
      return;
    }

    setStatus("loading");
    try {
      await onSave(meal);
      setStatus("success");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Could not save meal.");
    }
  }

  return (
    <section className="screen">
      <Header title={"eatenAt" in meal ? "Edit meal" : "Review meal"} subtitle="Adjust the AI result before saving." />
      <div className="result-summary">
        <img src={meal.photoUrl} alt={meal.title} />
        <div>
          <p className="eyebrow">Main food</p>
          <input className="title-input" value={meal.title} onChange={(event) => onChange(applyMainFoodCorrection(meal, event.target.value))} />
          <p>{meal.calories} calories now</p>
        </div>
      </div>
      <div className="daily-summary">
        <span>Total today: {totalToday} cal</span>
        <strong>{Math.max(remainingToday, 0)} cal remaining</strong>
      </div>
      <div className="section-heading">
        <h3>Ingredients</h3>
        <button onClick={() => onChange(withCalories({ ...meal, items: [...meal.items, makeIngredient()] }))}>Add ingredient</button>
      </div>
      <div className="food-list">
        {meal.items.map((item) => (
          <div className="food-editor" key={item.id}>
            <div>
              <input value={item.name} onChange={(event) => renameItem(item.id, event.target.value)} />
              <span>{Math.round(item.confidence * 100)}% AI confidence</span>
            </div>
            <div className="ingredient-controls">
              <button onClick={() => updateItem(item.id, { quantity: Math.max(0.25, item.quantity - 0.5) })}>-</button>
              <input className="quantity-input" type="number" step="0.25" min="0.25" value={item.quantity} onChange={(event) => updateItem(item.id, { quantity: Number(event.target.value) || 0.25 })} />
              <select value={item.unit} onChange={(event) => updateItem(item.id, { unit: event.target.value as FoodItem["unit"] })}>
                <option value="item">item</option>
                <option value="piece">piece</option>
                <option value="serving">serving</option>
                <option value="bowl">bowl</option>
                <option value="spoon">spoon</option>
                <option value="cup">cup</option>
                <option value="gram">gram</option>
                <option value="slice">slice</option>
              </select>
              <input className="calorie-input" type="number" min="0" value={item.calories} onChange={(event) => updateItem(item.id, { calories: Number(event.target.value) || 0 })} aria-label="Calories per unit" />
              <button onClick={() => updateItem(item.id, { quantity: item.quantity + 0.5 })}>+</button>
              <button className="remove-chip" onClick={() => onChange(withCalories({ ...meal, items: meal.items.filter((ingredient) => ingredient.id !== item.id) }))}>Remove</button>
            </div>
          </div>
        ))}
      </div>
      <Slider label="Sweet" value={meal.sweetness} onChange={(value) => updateFlavor("sweetness", value)} />
      <Slider label="Spicy" value={meal.spiciness} onChange={(value) => updateFlavor("spiciness", value)} />
      <Slider label="Salty" value={meal.saltiness} onChange={(value) => updateFlavor("saltiness", value)} />
      <button className="primary-button" disabled={status === "loading"} onClick={save}>
        {status === "loading" ? "Saving..." : "Save meal"}
      </button>
      {message && <StatusLine status={status} text={message} />}
    </section>
  );
}

function WhatIAteScreen({
  mealLogs,
  onScan,
  onEdit,
  onDelete
}: {
  mealLogs: MealLog[];
  onScan: () => void;
  onEdit: (meal: MealLog) => void;
  onDelete: (id: string) => Promise<void> | void;
}) {
  const [selectedId, setSelectedId] = useState("");
  const [status, setStatus] = useState<AsyncState>("idle");
  const todayMeals = mealLogs.filter(isTodayMeal);
  const earlierMeals = mealLogs.filter((meal) => !isTodayMeal(meal));
  const selected = mealLogs.find((meal) => meal.id === selectedId);

  async function remove(id: string) {
    setStatus("loading");
    await onDelete(id);
    setSelectedId("");
    setStatus("success");
  }

  return (
    <section className="screen">
      <Header title="What I ate" subtitle="Saved meals stay with your account." />
      {todayMeals.length === 0 ? (
        <EmptyState text="Save your first scan to begin the food diary." />
      ) : (
        <div className="stack">
          {todayMeals.map((meal) => (
            <button className="row-button" key={meal.id} onClick={() => setSelectedId(meal.id)}>
              <MealRow meal={meal} />
            </button>
          ))}
        </div>
      )}
      <button className="scan-cta compact" onClick={onScan}>
        <Camera size={20} />
        <span>Scan a meal</span>
      </button>
      {earlierMeals.length > 0 && (
        <>
          <div className="section-heading subdued-heading"><h3>Earlier</h3></div>
          <div className="stack">
            {earlierMeals.map((meal) => (
              <button className="row-button" key={meal.id} onClick={() => setSelectedId(meal.id)}>
                <MealRow meal={meal} />
              </button>
            ))}
          </div>
        </>
      )}
      {selected && (
        <div className="detail-panel">
          <img src={selected.photoUrl} alt={selected.title} />
          <p className="eyebrow">{selected.eatenAt}</p>
          <h2>{selected.title}</h2>
          <p>{selected.items.map((item) => `${item.quantity} ${item.unit} ${item.name}`).join(" / ")}</p>
          <strong>{selected.calories} calories</strong>
          <div className="inline-actions">
            <button className="secondary-button" onClick={() => onEdit(selected)}>Edit</button>
            <button className="secondary-button danger" disabled={status === "loading"} onClick={() => remove(selected.id)}>Delete</button>
          </div>
          {status === "success" && <StatusLine status="success" text="Meal deleted." />}
        </div>
      )}
    </section>
  );
}

function ExerciseScreen({
  logs,
  profile,
  onSave,
  onDelete
}: {
  logs: ExerciseLog[];
  profile: ProfileSummary;
  onSave: (type: string, minutes: number, intensity: ExerciseIntensity, editingId?: string, imageUrl?: string) => Promise<ExerciseLog>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [editingId, setEditingId] = useState("");
  const [type, setType] = useState("Walking");
  const [minutes, setMinutes] = useState(25);
  const [intensity, setIntensity] = useState<ExerciseIntensity>("medium");
  const [estimate, setEstimate] = useState<ExerciseEstimate>();
  const [status, setStatus] = useState<AsyncState>("idle");
  const [message, setMessage] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const suggestions = getExerciseSuggestions(type, 4);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      api.estimateExercise({ type, minutes, intensity, bodyWeightKg: profile.weightKg }).then(setEstimate).catch(() => undefined);
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [intensity, minutes, profile.weightKg, type]);

  function edit(log: ExerciseLog) {
    setEditingId(log.id);
    setType(log.type);
    setMinutes(log.minutes);
    setIntensity(log.intensity);
    setImageUrl(log.imageUrl ?? "");
  }

  async function save() {
    setStatus("loading");
    setMessage("");
    try {
      await onSave(type, minutes, intensity, editingId || undefined, imageUrl);
      setEditingId("");
      setStatus("success");
      setMessage("Exercise saved.");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Could not save exercise.");
    }
  }

  async function remove(id: string) {
    setStatus("loading");
    await onDelete(id);
    setStatus("success");
    setMessage("Exercise deleted.");
  }

  async function chooseWorkoutImage(file?: File) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setStatus("error");
      setMessage("Choose an image file.");
      return;
    }
    if (file.size > 650_000) {
      setStatus("error");
      setMessage("Choose an image under 650 KB for now.");
      return;
    }
    setImageUrl(await fileToDataUrl(file));
    setStatus("idle");
    setMessage("Workout image ready.");
  }

  return (
    <section className="screen">
      <Header title="Exercise" subtitle="Estimate burn and keep a simple movement log." />
      <div className="simple-form">
        <label>
          <span>Exercise</span>
          <input value={type} list="exercise-types" onChange={(event) => setType(event.target.value)} />
          <datalist id="exercise-types">
            <option value="Walking" /><option value="Running" /><option value="Jogging" />
            <option value="Treadmill" /><option value="Cycling" /><option value="Swimming" />
            <option value="Skipping Rope" /><option value="Stair Climbing" /><option value="Yoga" />
            <option value="Pilates" /><option value="Stretching" /><option value="Strength Training" />
            <option value="Weight Lifting" /><option value="HIIT" /><option value="Dance" />
            <option value="Badminton" /><option value="Tennis" /><option value="Basketball" />
            <option value="Football" /><option value="Volleyball" /><option value="Hiking" />
            <option value="Rowing" /><option value="Elliptical" />
          </datalist>
        </label>
        <div className="quick-picks">
          {suggestions.map((suggestion) => (
            <button key={suggestion} onClick={() => setType(suggestion)}>{suggestion}</button>
          ))}
        </div>
        <div className="form-grid">
          <label><span>Minutes</span><input type="number" min="1" value={minutes} onChange={(event) => setMinutes(Number(event.target.value))} /></label>
          <label>
            <span>Intensity</span>
            <select value={intensity} onChange={(event) => setIntensity(event.target.value as ExerciseIntensity)}>
              <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option>
            </select>
          </label>
        </div>
        <div className="calorie-estimate">
          <span>{estimate?.isCustom ? "Custom estimate" : `Matched: ${estimate?.matchedExercise ?? "Exercise"}`}</span>
          <strong>{estimate?.caloriesBurned ?? 0} cal</strong>
        </div>
        <div className="avatar-edit">
          <label className="secondary-button">
            Add image
            <input type="file" accept="image/*" onChange={(event) => chooseWorkoutImage(event.target.files?.[0])} />
          </label>
          {imageUrl && <button className="secondary-button danger" onClick={() => setImageUrl("")}>Remove image</button>}
        </div>
        <button className="primary-button" onClick={save} disabled={status === "loading"}>
          {editingId ? "Update exercise" : "Save exercise"}
        </button>
        {message && <StatusLine status={status} text={message} />}
      </div>
      {logs.length === 0 ? (
        <EmptyState text="Saved workouts will appear here." />
      ) : (
        <div className="stack">
          {logs.map((log) => (
            <div className="plain-row editable-row" key={log.id}>
              <Activity size={20} />
              <div>
                <strong>{log.type}</strong>
                <span>{log.minutes} min / {log.intensity} intensity / {log.caloriesBurned} calories burned</span>
              </div>
              <div className="mini-actions">
                <button onClick={() => edit(log)}>Edit</button>
                <button onClick={() => remove(log.id)}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function ProfileScreen({
  profile,
  totals,
  onSave,
  onLogout
}: {
  profile: ProfileSummary;
  totals: { eaten: number; burned: number; remaining: number };
  onSave: (profile: ProfileSummary) => Promise<ProfileSummary>;
  onLogout: () => Promise<void>;
}) {
  const [draft, setDraft] = useState(profile);
  const [status, setStatus] = useState<AsyncState>("idle");
  const [message, setMessage] = useState("");
  const [photoPreview, setPhotoPreview] = useState(profile.photoUrl ?? "");
  const bmi = draft.weightKg / Math.pow(draft.heightCm / 100, 2);

  useEffect(() => {
    setDraft(profile);
    setPhotoPreview(profile.photoUrl ?? "");
  }, [profile]);

  function update<K extends keyof ProfileSummary>(key: K, value: ProfileSummary[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  async function save() {
    setStatus("loading");
    setMessage("");
    try {
      await onSave(draft);
      setStatus("success");
      setMessage("Profile saved.");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Could not save profile.");
    }
  }

  async function choosePhoto(file?: File) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setStatus("error");
      setMessage("Choose an image file.");
      return;
    }
    if (file.size > 650_000) {
      setStatus("error");
      setMessage("Choose an image under 650 KB for now.");
      return;
    }

    const dataUrl = await fileToDataUrl(file);
    setPhotoPreview(dataUrl);
    update("photoUrl", dataUrl);
    setStatus("idle");
    setMessage("Preview ready. Save profile to keep it.");
  }

  return (
    <section className="screen">
      <Header title="Profile" subtitle={draft.goal} />
      <div className="profile-card">
        <Avatar name={draft.name} photoUrl={photoPreview} />
        <div><h2>{draft.name}</h2><p>{draft.email}</p></div>
      </div>
      <div className="metric-grid">
        <Metric label="BMI" value={bmi.toFixed(1)} />
        <Metric label="Target" value={`${draft.calorieTarget}`} />
        <Metric label="Left" value={`${Math.max(totals.remaining, 0)}`} />
      </div>
      <div className="simple-form">
        <div className="avatar-edit">
          <label className="secondary-button">
            Replace photo
            <input type="file" accept="image/*" onChange={(event) => choosePhoto(event.target.files?.[0])} />
          </label>
          {photoPreview && <button className="secondary-button danger" onClick={() => { setPhotoPreview(""); update("photoUrl", ""); }}>Remove photo</button>}
        </div>
        <FormField label="Name" value={draft.name} onChange={(value) => update("name", value)} />
        <FormField label="Goal" value={draft.goal} onChange={(value) => update("goal", value)} />
        <div className="form-grid">
          <FormField label="Age" value={draft.age} onChange={(value) => update("age", Number(value))} type="number" />
          <FormField label="Height" value={draft.heightCm} onChange={(value) => update("heightCm", Number(value))} type="number" />
        </div>
        <div className="form-grid">
          <FormField label="Weight" value={draft.weightKg} onChange={(value) => update("weightKg", Number(value))} type="number" />
          <FormField label="Calories" value={draft.calorieTarget} onChange={(value) => update("calorieTarget", Number(value))} type="number" />
        </div>
        <button className="primary-button" disabled={status === "loading"} onClick={save}>Save profile</button>
        <button className="secondary-button full" onClick={onLogout}>Log out</button>
        {message && <StatusLine status={status} text={message} />}
      </div>
    </section>
  );
}

function FriendsScreen({
  posts,
  followingCount,
  onFollow,
  onUnfollow,
  onReact
}: {
  posts: FeedPost[];
  followingCount: number;
  onFollow: (userId: string) => Promise<unknown>;
  onUnfollow: (userId: string) => Promise<unknown>;
  onReact: (postId: string, reaction: string) => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FriendSearchResult[]>([]);
  const [status, setStatus] = useState<AsyncState>("idle");
  const [followStatus, setFollowStatus] = useState<Record<string, AsyncState>>({});
  const [openComments, setOpenComments] = useState("");
  const [comments, setComments] = useState<Record<string, FeedComment[]>>({});
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [localCommentCounts, setLocalCommentCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setStatus("idle");
      return;
    }

    setStatus("loading");
    const timeout = window.setTimeout(() => {
      api
        .searchFriends(trimmed)
        .then((matches) => {
          setResults(matches);
          setStatus("success");
        })
        .catch(() => {
          setResults([]);
          setStatus("error");
        });
    }, 220);

    return () => window.clearTimeout(timeout);
  }, [query]);

  async function follow(friend: FriendSearchResult) {
    setFollowStatus((current) => ({ ...current, [friend.id]: "loading" }));
    try {
      await onFollow(friend.id);
      setResults((current) => current.map((result) => result.id === friend.id ? { ...result, isFollowing: true } : result));
      setFollowStatus((current) => ({ ...current, [friend.id]: "success" }));
    } catch {
      setFollowStatus((current) => ({ ...current, [friend.id]: "error" }));
    }
  }

  async function unfollow(friend: FriendSearchResult) {
    setFollowStatus((current) => ({ ...current, [friend.id]: "loading" }));
    try {
      await onUnfollow(friend.id);
      setResults((current) => current.map((result) => result.id === friend.id ? { ...result, isFollowing: false } : result));
      setFollowStatus((current) => ({ ...current, [friend.id]: "success" }));
    } catch {
      setFollowStatus((current) => ({ ...current, [friend.id]: "error" }));
    }
  }

  async function toggleComments(postId: string) {
    const nextOpen = openComments === postId ? "" : postId;
    setOpenComments(nextOpen);
    if (nextOpen && !comments[postId]) {
      setComments((current) => ({ ...current, [postId]: [] }));
      const loaded = await api.getComments(postId);
      setComments((current) => ({ ...current, [postId]: loaded }));
    }
  }

  async function addComment(postId: string) {
    const text = commentDrafts[postId]?.trim();
    if (!text) return;
    const comment = await api.addComment(postId, text);
    setComments((current) => ({ ...current, [postId]: [...(current[postId] ?? []), comment] }));
    setCommentDrafts((current) => ({ ...current, [postId]: "" }));
    setLocalCommentCounts((current) => ({ ...current, [postId]: (current[postId] ?? 0) + 1 }));
  }

  function socialBlock(post: FeedPost) {
    return (
      <>
        <div className="post-actions">
          {["like", "support", "fire"].map((reaction) => (
            <button
              key={reaction}
              className={post.myReaction === reaction ? "active-reaction" : ""}
              onClick={() => onReact(post.id, reaction)}
            >
              {reactionLabel(reaction)} {post.reactionCounts?.[reaction] ?? 0}
            </button>
          ))}
          <button onClick={() => toggleComments(post.id)}><MessageCircle size={16} /> {post.commentCount + (localCommentCounts[post.id] ?? 0)}</button>
        </div>
        {openComments === post.id && (
          <div className="comments-panel">
            {(comments[post.id] ?? []).length === 0 ? <p>No comments yet.</p> : comments[post.id].map((comment) => (
              <div className="comment-row" key={comment.id}>
                <Avatar name={comment.authorName} photoUrl={comment.authorPhotoUrl} />
                <div>
                  <strong>{comment.authorName}</strong>
                  <span>{comment.text}</span>
                  <small>{formatMealDate(comment.createdAt)}</small>
                </div>
              </div>
            ))}
            <div className="comment-form">
              <input
                value={commentDrafts[post.id] ?? ""}
                onChange={(event) => setCommentDrafts((current) => ({ ...current, [post.id]: event.target.value }))}
                placeholder="Add a kind note"
              />
              <button onClick={() => addComment(post.id)}>Send</button>
            </div>
          </div>
        )}
      </>
    );
  }

  return (
    <section className="screen">
      <Header title="Friends" subtitle={followingCount > 0 ? `Following ${followingCount} ${followingCount === 1 ? "person" : "people"}` : "Find friends and see their meals."} />
      <label className="search-bar">
        <Search size={18} />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find friends" />
      </label>
      {query.trim().length >= 2 && (
        <div className="friend-results">
          {status === "loading" && <StatusLine status="loading" text="Searching..." />}
          {status === "error" && <StatusLine status="error" text="Could not search right now." />}
          {status === "success" && results.length === 0 && <EmptyState text="No matching friends yet." />}
          {results.map((friend) => (
            <div className="friend-row" key={friend.id}>
              <Avatar name={friend.name} photoUrl={friend.photoUrl} />
              <div>
                <strong>{friend.name}</strong>
                <span>{friend.email}</span>
              </div>
              <button
                disabled={followStatus[friend.id] === "loading"}
                onClick={() => friend.isFollowing ? unfollow(friend) : follow(friend)}
              >
                {followStatus[friend.id] === "loading" ? "..." : friend.isFollowing ? "Unfollow" : "Follow"}
              </button>
            </div>
          ))}
        </div>
      )}
      {posts.length === 0 ? <EmptyState text={followingCount === 0 ? "Follow someone to see their meals here." : "Followed users have not logged meals yet."} /> : (
        <div className="stack">
          {posts.map((post) => (
            <article className="feed-post" key={post.id}>
              <div className="feed-author">
                <Avatar name={post.author} photoUrl={post.authorPhotoUrl} />
                <div>
                  <strong>{post.author}</strong>
                  <span>{post.eatenAt ? formatMealDate(post.eatenAt) : "Meal log"}</span>
                </div>
              </div>
              {post.type === "workout" ? (
                <div className={`workout-content ${post.photoUrl ? "" : "no-image"}`}>
                  {post.photoUrl && <img className="workout-image" src={post.photoUrl} alt={post.mealTitle} />}
                  <div className="feed-body workout-details">
                    <p className="eyebrow">Workout</p>
                    <h3>{post.mealTitle}</h3>
                    <div className="workout-summary">
                      <p>{workoutDescription(post)}</p>
                      <strong>{post.caloriesBurned ?? post.calories} cal burned</strong>
                      {post.durationMinutes ? <span>{post.durationMinutes} min</span> : null}
                    </div>
                    {socialBlock(post)}
                  </div>
                </div>
              ) : (
                <>
                  {post.photoUrl && <img src={post.photoUrl} alt={post.mealTitle} />}
                  <div className="feed-body">
                    <p className="eyebrow">Meal</p>
                    <h3>{post.mealTitle}</h3>
                    <p>{post.ingredientsSummary || post.comment}</p>
                    {socialBlock(post)}
                  </div>
                </>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function reactionLabel(reaction: string) {
  return { like: "Like", support: "Support", fire: "Fire" }[reaction] ?? reaction;
}

function workoutDescription(post: FeedPost) {
  const note = post.comment?.trim();
  if (note && note !== "Logged a workout.") return note;

  const minutes = post.durationMinutes ? `${post.durationMinutes} min` : "Quick";
  const intensity = post.intensity === "high" ? "energetic" : post.intensity === "low" ? "light" : "moderate";
  return `${minutes} ${intensity} ${post.mealTitle.toLowerCase()} session`;
}

function Avatar({ name, photoUrl }: { name: string; photoUrl?: string }) {
  return photoUrl ? <img className="avatar avatar-photo" src={photoUrl} alt={`${name} profile`} /> : <div className="avatar">{name.slice(0, 1).toUpperCase()}</div>;
}

function BottomNav({ active, onNavigate }: { active: Screen; onNavigate: (screen: Screen) => void }) {
  const items: Array<{ screen: Screen; label: string; icon: React.ReactNode }> = [
    { screen: "home", label: "Home", icon: <Home size={20} /> },
    { screen: "ate", label: "Ate", icon: <Salad size={20} /> },
    { screen: "exercise", label: "Move", icon: <Activity size={20} /> },
    { screen: "friends", label: "Social", icon: <Users size={20} /> },
    { screen: "profile", label: "Me", icon: <User size={20} /> }
  ];

  return (
    <nav className="bottom-nav">
      {items.map((item) => (
        <button key={item.screen} className={active === item.screen ? "active" : ""} onClick={() => onNavigate(item.screen)}>
          {item.icon}<span>{item.label}</span>
        </button>
      ))}
    </nav>
  );
}

function Header({ title, subtitle }: { title: string; subtitle: string }) {
  return <header className="screen-header"><h1>{title}</h1><p>{subtitle}</p></header>;
}

function FormField({
  label,
  value,
  onChange,
  type = "text"
}: {
  label: string;
  value: string | number;
  onChange: (value: string) => void;
  type?: string;
}) {
  return <label><span>{label}</span><input type={type} value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}

function Slider({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <label className="slider-row">
      <span>{label}</span>
      <input type="range" min="0" max="100" value={value} onChange={(event) => onChange(Number(event.target.value))} />
      <strong>{value}%</strong>
    </label>
  );
}

function StatusLine({ status, text }: { status: AsyncState; text: string }) {
  return <p className={`status-line ${status}`}>{text}</p>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="metric"><span>{label}</span><strong>{value}</strong></div>;
}

function MealRow({ meal }: { meal: MealLog }) {
  return (
    <div className="meal-row">
      <img src={meal.photoUrl} alt={meal.title} />
      <div><strong>{meal.title}</strong><span>{meal.items.map((item) => `${item.quantity} ${item.unit} ${item.name}`).join(" / ")}</span></div>
      <b>{meal.calories}</b>
    </div>
  );
}

function EmptyState({ text, action, onAction }: { text: string; action?: string; onAction?: () => void }) {
  return <div className="empty-state"><p>{text}</p>{action && <button className="secondary-button" onClick={onAction}>{action}</button>}</div>;
}

function statusLabel(status: AsyncState) {
  return { idle: "Ready", loading: "Reading", success: "Done", error: "Retry" }[status];
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not preview image"));
    reader.readAsDataURL(file);
  });
}

async function prepareImageForUpload(file: File) {
  if (file.size <= 1.5 * 1024 * 1024) {
    return file;
  }

  try {
    return await resizeImage(file, 1400, 0.82);
  } catch {
    return file;
  }
}

function resizeImage(file: File, maxDimension: number, quality: number) {
  return new Promise<File>((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(file);
    image.onload = () => {
      const scale = Math.min(1, maxDimension / Math.max(image.width, image.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      const context = canvas.getContext("2d");
      if (!context) {
        URL.revokeObjectURL(url);
        reject(new Error("Could not resize image"));
        return;
      }
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        (blob) => {
          URL.revokeObjectURL(url);
          if (!blob) {
            reject(new Error("Could not compress image"));
            return;
          }
          resolve(new File([blob], file.name.replace(/\.[^.]+$/, ".jpg"), { type: "image/jpeg" }));
        },
        "image/jpeg",
        quality
      );
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not load image"));
    };
    image.src = url;
  });
}

function makeIngredient(): FoodItem {
  return {
    id: crypto.randomUUID(),
    name: "New ingredient",
    quantity: 1,
    unit: "item",
    calories: 50,
    confidence: 0
  };
}

function makeManualMeal(): MealGuess {
  const items = [makeIngredient()];
  return {
    id: crypto.randomUUID(),
    photoUrl: samplePhoto,
    title: "Manual meal",
    items,
    calories: estimateMealCalories(items, 0),
    sweetness: 0,
    spiciness: 0,
    saltiness: 20,
    notes: "Manual entry. Add and adjust ingredients before saving.",
    analysis: {
      provider: "mock",
      status: "complete",
      summary: "Manual meal entry started.",
      requestId: crypto.randomUUID()
    }
  };
}

function totalMealCaloriesForDay(meals: MealLog[], date = new Date()) {
  return meals.filter((meal) => isSameCalendarDay(meal.eatenAt, date)).reduce((sum, meal) => sum + meal.calories, 0);
}

function isTodayMeal(meal: MealLog) {
  return isSameCalendarDay(meal.eatenAt, new Date());
}

function isSameCalendarDay(value: string, date: Date) {
  const mealDate = value === "Just now" ? new Date() : new Date(value);
  if (Number.isNaN(mealDate.getTime())) {
    return false;
  }

  return (
    mealDate.getFullYear() === date.getFullYear() &&
    mealDate.getMonth() === date.getMonth() &&
    mealDate.getDate() === date.getDate()
  );
}

function formatMealDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

createRoot(document.getElementById("root")!).render(<App />);
