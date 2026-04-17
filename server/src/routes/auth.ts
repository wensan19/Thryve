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
  const error = validateAuthInput(name, email, password);

  if (error) {
    response.status(400).json({ message: error });
    return;
  }

  if (await findUserByEmail(email)) {
    response.status(409).json({ message: "An account with this email already exists." });
    return;
  }

  const user = await createUser(name.trim(), email.trim().toLowerCase(), hashPassword(password));
  const token = await createSession(user.id);
  const body: AuthResponse = { token, user: publicUser(user), profile: user.profile };
  response.status(201).json(body);
});

authRouter.post("/login", async (request, response) => {
  const { email, password } = request.body ?? {};
  const user = typeof email === "string" ? await findUserByEmail(email) : undefined;

  if (!user || typeof password !== "string" || !verifyPassword(password, user.passwordHash)) {
    response.status(401).json({ message: "Email or password is incorrect." });
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

function validateAuthInput(name: unknown, email: unknown, password: unknown) {
  if (typeof name !== "string" || name.trim().length < 2) {
    return "Enter a display name.";
  }

  if (typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return "Enter a valid email.";
  }

  if (typeof password !== "string" || password.length < 6) {
    return "Password must be at least 6 characters.";
  }

  return "";
}
