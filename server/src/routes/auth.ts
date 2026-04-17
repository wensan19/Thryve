import { Router } from "express";
import type { AuthResponse } from "../../../shared/types.js";
import {
  createSession,
  createUser,
  deleteSession,
  findUserByEmail,
  findUserById,
  publicUser
} from "../data/store.js";
import { requireAuth } from "../middleware/auth.js";
import { hashPassword, verifyPassword } from "../services/passwords.js";

export const authRouter = Router();

authRouter.post("/signup", async (request, response) => {
  const { name, email, password } = request.body ?? {};
  const error = validateSignupInput(name, email, password);

  if (error) {
    response.status(400).json({ message: error });
    return;
  }

  if (await findUserByEmail(email)) {
    response.status(409).json({ message: "An account with this email already exists." });
    return;
  }

  const passwordHash = await hashPassword(password);
  const user = await createUser(name.trim(), email.trim().toLowerCase(), passwordHash);
  const token = await createSession(user.id);
  const body: AuthResponse = { token, user: publicUser(user), profile: user.profile };
  response.status(201).json(body);
});

authRouter.post("/login", async (request, response) => {
  const { email, password } = request.body ?? {};
  const error = validateLoginInput(email, password);

  if (error) {
    response.status(400).json({ message: error });
    return;
  }

  const user = await findUserByEmail(email.trim().toLowerCase());

  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    response.status(401).json({ message: "Invalid email or password." });
    return;
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

function validateSignupInput(name: unknown, email: unknown, password: unknown) {
  if (typeof name !== "string" || name.trim().length < 2) {
    return "Enter a display name.";
  }

  return validateEmailAndPassword(email, password);
}

function validateLoginInput(email: unknown, password: unknown) {
  if (typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return "Enter a valid email.";
  }

  if (typeof password !== "string" || password.length < 1) {
    return "Enter your password.";
  }

  return "";
}

function validateEmailAndPassword(email: unknown, password: unknown) {
  if (typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return "Enter a valid email.";
  }

  if (typeof password !== "string" || password.length < 8) {
    return "Password must be at least 8 characters.";
  }

  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    return "Password must include at least one letter and one number.";
  }

  return "";
}
