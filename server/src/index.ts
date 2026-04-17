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

app.use(cors({ origin: true }));
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

app.listen(port, () => {
  console.log(`Thryve API listening on http://0.0.0.0:${port}`);
});
