import type { NextFunction, Request, Response } from "express";
import { findUserByToken } from "../data/store.js";

declare global {
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

export async function requireAuth(request: Request, response: Response, next: NextFunction) {
  const header = request.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : undefined;
  const user = await findUserByToken(token);

  if (!user) {
    response.status(401).json({ message: "Please log in again." });
    return;
  }

  request.userId = user.id;
  next();
}
