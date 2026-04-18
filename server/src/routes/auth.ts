import { Router } from "express";
import type { AuthResponse } from "../../../shared/types.js";
import {
  createSession,
  createUser,
  deleteSession,
  findUserByEmail,
  findUserById,
  findUserByUsername,
  persistUserChange,
  publicUser
} from "../data/store.js";
import { requireAuth } from "../middleware/auth.js";
import { hashPassword, verifyLegacyPassword, verifyPassword } from "../services/passwords.js";

export const authRouter = Router();

authRouter.post("/signup", async (request, response) => {
  const { username, email = "", password } = request.body ?? {};
  const error = validateSignupInput(username, email, password);

  if (error) {
    response.status(400).json({ message: error });
    return;
  }

  if (await findUserByUsername(username)) {
    response.status(409).json({ message: "Username is already taken." });
    return;
  }

  const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
  if (normalizedEmail && await findUserByEmail(normalizedEmail)) {
    response.status(409).json({ message: "An account with this email already exists." });
    return;
  }

  const passwordHash = await hashPassword(password);
  const user = await createUser(username, normalizedEmail, passwordHash);
  const token = await createSession(user.id);
  const body: AuthResponse = { token, user: publicUser(user), profile: user.profile };
  response.status(201).json(body);
});

authRouter.post("/login", async (request, response) => {
  const { username, password } = request.body ?? {};
  const error = validateLoginInput(username, password);

  if (error) {
    response.status(400).json({ message: error });
    return;
  }

  const user = await findUserByUsername(username);

  if (!user) {
    response.status(401).json({ message: "Invalid username or password." });
    return;
  }

  const passwordMatches = await verifyPassword(password, user.passwordHash);
  const legacyPasswordMatches = !passwordMatches && verifyLegacyPassword(password, user.passwordHash);

  if (!passwordMatches && !legacyPasswordMatches) {
    response.status(401).json({ message: "Invalid username or password." });
    return;
  }

  if (legacyPasswordMatches) {
    user.passwordHash = await hashPassword(password);
    await persistUserChange();
  }

  const token = await createSession(user.id);
  const body: AuthResponse = { token, user: publicUser(user), profile: user.profile };
  response.json(body);
});

authRouter.get("/me", requireAuth, async (request, response) => {
  const user = await findUserById(request.userId!);

  if (!user) {
    response.status(404).json({ message: "User not found." });
    return;
  }

  const body: AuthResponse = {
    token: request.get("authorization")!.slice("Bearer ".length),
    user: publicUser(user),
    profile: user.profile
  };
  response.json(body);
});

authRouter.post("/logout", requireAuth, async (request, response) => {
  const token = request.get("authorization")!.slice("Bearer ".length);
  await deleteSession(token);
  response.status(204).end();
});

function validateSignupInput(username: unknown, email: unknown, password: unknown) {
  const usernameError = validateUsername(username);
  if (usernameError) {
    return usernameError;
  }

  if (typeof email === "string" && email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    return "Enter a valid email.";
  }

  return validatePassword(password);
}

function validateLoginInput(username: unknown, password: unknown) {
  if (typeof username !== "string" || !username.trim()) {
    return "Enter your username.";
  }

  if (typeof password !== "string" || password.length < 1) {
    return "Enter your password.";
  }

  return "";
}

function validateUsername(username: unknown) {
  if (typeof username !== "string" || !username.trim()) {
    return "Enter a username.";
  }

  if (!/^[a-z0-9._-]{2,30}$/i.test(username.trim())) {
    return "Use 2-30 letters, numbers, dots, dashes, or underscores.";
  }

  return "";
}

function validatePassword(password: unknown) {
  if (typeof password !== "string" || password.length < 8) {
    return "Password must be at least 8 characters.";
  }

  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    return "Password must include at least one letter and one number.";
  }

  return "";
}
