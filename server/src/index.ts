import "dotenv/config";
import cors from "cors";
import express from "express";
import { authRouter } from "./routes/auth.js";
import { exerciseRouter } from "./routes/exercise.js";
import { feedRouter } from "./routes/feed.js";
import { mealRouter } from "./routes/meals.js";
import { profileRouter } from "./routes/profile.js";
import { requireAuth } from "./middleware/auth.js";

const app = express();
const port = Number(process.env.PORT ?? 8787);

const corsOptions: cors.CorsOptions = {
  origin(origin, callback) {
    if (!origin || isAllowedOrigin(origin)) {
      callback(null, true);
      return;
    }

    callback(new Error(`Origin not allowed by CORS: ${origin}`));
  },
  allowedHeaders: ["Content-Type", "Authorization"],
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"]
};

app.use(cors(corsOptions));
app.use(express.json({ limit: "8mb" }));

app.get("/", (_request, response) => {
  response.json({ message: "Thryve API is running" });
});

app.get("/api/health", (_request, response) => {
  response.json({ status: "ok" });
});

app.use("/api/auth", authRouter);
app.use("/api/meals", requireAuth, mealRouter);
app.use("/api/exercise", requireAuth, exerciseRouter);
app.use("/api/profile", requireAuth, profileRouter);
app.use("/api/feed", requireAuth, feedRouter);

app.use((error: Error, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  console.error("[api] unhandled error", error.message);
  response.status(500).json({ message: "Server error. Please try again." });
});

app.listen(port, () => {
  console.log(`Thryve API listening on http://0.0.0.0:${port}`);
});

function isAllowedOrigin(origin: string) {
  const configuredOrigins = (process.env.CLIENT_ORIGIN || process.env.FRONTEND_ORIGIN || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  if (configuredOrigins.includes(origin)) {
    return true;
  }

  return /^https?:\/\/localhost:\d+$/.test(origin) ||
    /^https?:\/\/127\.0\.0\.1:\d+$/.test(origin) ||
    /^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(origin);
}
