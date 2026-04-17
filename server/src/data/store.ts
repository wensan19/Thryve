import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHmac, timingSafeEqual } from "node:crypto";
import { dirname, join } from "node:path";
import type { AuthUser, ExerciseLog, FeedComment, FeedPost, MealLog, ProfileSummary } from "../../../shared/types.js";

interface StoredUser extends AuthUser {
  passwordHash: string;
  profile: ProfileSummary;
  meals: MealLog[];
  exercises: ExerciseLog[];
  followingUserIds: string[];
}

interface SessionRecord {
  token: string;
  userId: string;
  createdAt: string;
  expiresAt: string;
}

interface DatabaseShape {
  users: StoredUser[];
  sessions: SessionRecord[];
  feedPosts: FeedPost[];
  socialReactions: SocialReaction[];
  socialComments: FeedComment[];
}

interface SocialReaction {
  postId: string;
  userId: string;
  reaction: string;
}

const databasePath = join(process.cwd(), "server", "data", "thryve.json");
const sessionDurationMs = 7 * 24 * 60 * 60 * 1000;
const signedTokenPrefix = "thryve.v1";

const defaultFeedPosts: FeedPost[] = [
  {
    id: "feed-1",
    type: "meal",
    author: "Lena",
    mealTitle: "Market salad bowl",
    photoUrl: "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=900&q=80",
    calories: 480,
    reactionCounts: {},
    commentCount: 0,
    reactions: 24,
    comment: "Sweet, crunchy, and not too heavy."
  },
  {
    id: "feed-2",
    type: "meal",
    author: "Noah",
    mealTitle: "Berry oats",
    photoUrl: "https://images.unsplash.com/photo-1511690743698-d9d85f2fbf38?auto=format&fit=crop&w=900&q=80",
    calories: 390,
    reactionCounts: {},
    commentCount: 0,
    reactions: 17,
    comment: "Good before a morning walk."
  }
];

let database: DatabaseShape | null = null;

export async function getDatabase() {
  if (database) {
    return database;
  }

  try {
    database = JSON.parse(await readFile(databasePath, "utf8")) as DatabaseShape;
    database.socialReactions ??= [];
    database.socialComments ??= [];
    database.users.forEach((user) => {
      user.followingUserIds ??= [];
      user.profile.targetWeightKg ??= user.profile.weightKg;
    });
    const sessionsBeforeCleanup = database.sessions?.length ?? 0;
    let addedExpiryToLegacySession = false;
    database.sessions = (database.sessions ?? []).filter((session) => {
      if (!session.expiresAt) {
        session.expiresAt = new Date(new Date(session.createdAt).getTime() + sessionDurationMs).toISOString();
        addedExpiryToLegacySession = true;
      }
      return new Date(session.expiresAt).getTime() > Date.now();
    });
    if (addedExpiryToLegacySession || database.sessions.length !== sessionsBeforeCleanup) {
      await saveDatabase();
    }
  } catch {
    database = { users: [], sessions: [], feedPosts: defaultFeedPosts, socialReactions: [], socialComments: [] };
    await saveDatabase();
  }

  return database;
}

export async function saveDatabase() {
  if (!database) {
    return;
  }

  await mkdir(dirname(databasePath), { recursive: true });
  await writeFile(databasePath, JSON.stringify(database, null, 2));
}

export async function findUserByEmail(email: string) {
  const db = await getDatabase();
  return db.users.find((user) => user.email.toLowerCase() === email.toLowerCase());
}

export async function findUserById(userId: string) {
  const db = await getDatabase();
  return db.users.find((user) => user.id === userId);
}

export async function createUser(name: string, email: string, passwordHash: string) {
  const db = await getDatabase();
  const user: StoredUser = {
    id: crypto.randomUUID(),
    name,
    email,
    passwordHash,
    profile: createDefaultProfile(name, email),
    meals: [],
    exercises: [],
    followingUserIds: []
  };

  db.users.push(user);
  await saveDatabase();
  return user;
}

export async function createSession(userId: string) {
  const db = await getDatabase();
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + sessionDurationMs);
  const token = createSignedToken(userId, createdAt, expiresAt);
  const session = {
    token,
    userId,
    createdAt: createdAt.toISOString(),
    expiresAt: expiresAt.toISOString()
  };

  db.sessions.push(session);
  await saveDatabase();
  return session.token;
}

export async function findUserByToken(token?: string) {
  if (!token) {
    return undefined;
  }

  const db = await getDatabase();
  const signedTokenUserId = verifySignedToken(token);
  if (signedTokenUserId) {
    return db.users.find((user) => user.id === signedTokenUserId);
  }

  const session = db.sessions.find((item) => item.token === token);
  if (session && new Date(session.expiresAt).getTime() <= Date.now()) {
    db.sessions = db.sessions.filter((item) => item.token !== token);
    await saveDatabase();
    return undefined;
  }

  return session ? db.users.find((user) => user.id === session.userId) : undefined;
}

export async function deleteSession(token: string) {
  const db = await getDatabase();
  db.sessions = db.sessions.filter((session) => session.token !== token);
  await saveDatabase();
}

function createSignedToken(userId: string, createdAt: Date, expiresAt: Date) {
  const payload = base64UrlEncode(JSON.stringify({
    sub: userId,
    iat: Math.floor(createdAt.getTime() / 1000),
    exp: Math.floor(expiresAt.getTime() / 1000)
  }));
  const signature = signTokenPayload(payload);
  return `${signedTokenPrefix}.${payload}.${signature}`;
}

function verifySignedToken(token: string) {
  const [prefix, version, payload, signature] = token.split(".");
  if (`${prefix}.${version}` !== signedTokenPrefix || !payload || !signature) {
    return "";
  }

  if (!constantTimeEqual(signature, signTokenPayload(payload))) {
    return "";
  }

  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { sub?: string; exp?: number };
    if (!parsed.sub || !parsed.exp || parsed.exp <= Math.floor(Date.now() / 1000)) {
      return "";
    }
    return parsed.sub;
  } catch {
    return "";
  }
}

function signTokenPayload(payload: string) {
  return createHmac("sha256", getSessionSecret()).update(payload).digest("base64url");
}

function getSessionSecret() {
  return process.env.SESSION_SECRET || process.env.GEMINI_API_KEY || "thryve-development-session-secret";
}

function base64UrlEncode(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function constantTimeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function publicUser(user: StoredUser): AuthUser {
  return { id: user.id, name: user.name, email: user.email };
}

export async function getFeedPosts() {
  const db = await getDatabase();
  return db.feedPosts;
}

export async function searchUsers(query: string, currentUserId: string) {
  const db = await getDatabase();
  const currentUser = db.users.find((user) => user.id === currentUserId);
  const normalized = query.trim().toLowerCase();

  if (normalized.length < 2) {
    return [];
  }

  return db.users
    .filter((user) => user.id !== currentUserId)
    .filter((user) =>
      user.name.toLowerCase().includes(normalized) ||
      user.email.toLowerCase().includes(normalized) ||
      user.profile.name.toLowerCase().includes(normalized)
    )
    .slice(0, 8)
    .map((user) => ({
      id: user.id,
      name: user.profile.name || user.name,
      email: user.email,
      photoUrl: user.profile.photoUrl,
      goal: user.profile.goal,
      isFollowing: currentUser?.followingUserIds?.includes(user.id) ?? false
    }));
}

export async function followUser(currentUserId: string, targetUserId: string) {
  const db = await getDatabase();
  const currentUser = db.users.find((user) => user.id === currentUserId);
  const targetUser = db.users.find((user) => user.id === targetUserId);

  if (!currentUser) {
    return { error: "User not found." };
  }

  if (!targetUser) {
    return { error: "Friend not found." };
  }

  if (currentUserId === targetUserId) {
    return { error: "You cannot follow yourself." };
  }

  currentUser.followingUserIds ??= [];

  if (!currentUser.followingUserIds.includes(targetUserId)) {
    currentUser.followingUserIds.push(targetUserId);
    await saveDatabase();
  }

  return { followingUserIds: currentUser.followingUserIds };
}

export async function unfollowUser(currentUserId: string, targetUserId: string) {
  const db = await getDatabase();
  const currentUser = db.users.find((user) => user.id === currentUserId);
  const targetUser = db.users.find((user) => user.id === targetUserId);

  if (!currentUser) {
    return { error: "User not found." };
  }

  if (!targetUser) {
    return { error: "Friend not found." };
  }

  if (currentUserId === targetUserId) {
    return { error: "You cannot unfollow yourself." };
  }

  currentUser.followingUserIds ??= [];
  const before = currentUser.followingUserIds.length;
  currentUser.followingUserIds = currentUser.followingUserIds.filter((id) => id !== targetUserId);

  if (currentUser.followingUserIds.length === before) {
    return { error: "You are not following this user." };
  }

  await saveDatabase();
  return { followingUserIds: currentUser.followingUserIds };
}

export async function getFollowingActivityPosts(currentUserId: string) {
  const db = await getDatabase();
  const currentUser = db.users.find((user) => user.id === currentUserId);
  const followingIds = currentUser?.followingUserIds ?? [];

  const posts = db.users
    .filter((user) => followingIds.includes(user.id))
    .flatMap((user) => {
      const mealPosts: FeedPost[] = user.meals.map((meal) => withSocialMeta({
        id: `meal-${meal.id}`,
        type: "meal" as const,
        author: user.profile.name || user.name,
        authorId: user.id,
        authorPhotoUrl: user.profile.photoUrl,
        mealTitle: meal.title,
        photoUrl: meal.photoUrl,
        calories: meal.calories,
        eatenAt: meal.eatenAt,
        ingredientsSummary: meal.items.map((item) => item.name).slice(0, 4).join(", "),
        reactionCounts: {},
        commentCount: 0,
        reactions: 0,
        comment: meal.notes || "Logged a meal today."
      }, currentUserId, db));

      const workoutPosts: FeedPost[] = user.exercises.map((exercise) => withSocialMeta({
        id: `workout-${exercise.id}`,
        type: "workout" as const,
        author: user.profile.name || user.name,
        authorId: user.id,
        authorPhotoUrl: user.profile.photoUrl,
        mealTitle: exercise.type,
        photoUrl: exercise.imageUrl || "",
        calories: exercise.caloriesBurned,
        eatenAt: exercise.loggedAt,
        ingredientsSummary: `${exercise.minutes} min / ${exercise.intensity} intensity`,
        durationMinutes: exercise.minutes,
        intensity: exercise.intensity,
        caloriesBurned: exercise.caloriesBurned,
        reactionCounts: {},
        commentCount: 0,
        reactions: 0,
        comment: exercise.notes || "Logged a workout."
      }, currentUserId, db));

      return [...mealPosts, ...workoutPosts];
    });

  return posts.sort((a, b) => getPostTime(b.eatenAt) - getPostTime(a.eatenAt));
}

export async function getFollowingCount(currentUserId: string) {
  const user = await findUserById(currentUserId);
  return user?.followingUserIds?.length ?? 0;
}

export async function setPostReaction(currentUserId: string, postId: string, reaction: string) {
  const db = await getDatabase();
  const allowed = ["like", "support", "fire"];

  if (!allowed.includes(reaction)) {
    return { error: "Unsupported reaction." };
  }

  const existing = db.socialReactions.find((item) => item.postId === postId && item.userId === currentUserId);

  if (existing?.reaction === reaction) {
    db.socialReactions = db.socialReactions.filter((item) => !(item.postId === postId && item.userId === currentUserId));
  } else if (existing) {
    existing.reaction = reaction;
  } else {
    db.socialReactions.push({ postId, userId: currentUserId, reaction });
  }

  await saveDatabase();
  return getPostSocialState(postId, currentUserId, db);
}

export async function removePostReaction(currentUserId: string, postId: string) {
  const db = await getDatabase();
  db.socialReactions = db.socialReactions.filter((item) => !(item.postId === postId && item.userId === currentUserId));
  await saveDatabase();
  return getPostSocialState(postId, currentUserId, db);
}

export async function getPostComments(postId: string) {
  const db = await getDatabase();
  return db.socialComments
    .filter((comment) => comment.postId === postId)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}

export async function addPostComment(currentUserId: string, postId: string, text: string) {
  const db = await getDatabase();
  const user = db.users.find((item) => item.id === currentUserId);
  const trimmed = text.trim();

  if (!user) {
    return { error: "User not found." };
  }

  if (trimmed.length < 1 || trimmed.length > 280) {
    return { error: "Comment should be 1 to 280 characters." };
  }

  const comment: FeedComment = {
    id: crypto.randomUUID(),
    postId,
    authorId: currentUserId,
    authorName: user.profile.name || user.name,
    authorPhotoUrl: user.profile.photoUrl,
    text: trimmed,
    createdAt: new Date().toISOString()
  };

  db.socialComments.push(comment);
  await saveDatabase();
  return comment;
}

function withSocialMeta(post: FeedPost, currentUserId: string, db: DatabaseShape): FeedPost {
  const socialState = getPostSocialState(post.id, currentUserId, db);
  return { ...post, ...socialState, reactions: Object.values(socialState.reactionCounts).reduce((sum, count) => sum + count, 0) };
}

function getPostSocialState(postId: string, currentUserId: string, db: DatabaseShape) {
  const reactions = db.socialReactions.filter((reaction) => reaction.postId === postId);
  const reactionCounts = reactions.reduce<Record<string, number>>((counts, item) => {
    counts[item.reaction] = (counts[item.reaction] ?? 0) + 1;
    return counts;
  }, {});

  return {
    reactionCounts,
    myReaction: reactions.find((reaction) => reaction.userId === currentUserId)?.reaction,
    commentCount: db.socialComments.filter((comment) => comment.postId === postId).length
  };
}

function getPostTime(value?: string) {
  if (!value || value === "Just now") return Date.now();
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

export async function persistUserChange() {
  await saveDatabase();
}

function createDefaultProfile(name: string, email: string): ProfileSummary {
  return {
    name,
    email,
    photoUrl: "",
    age: 24,
    goal: "Feel lighter and stronger",
    heightCm: 166,
    weightKg: 58,
    targetWeightKg: 56,
    calorieTarget: 1850
  };
}
