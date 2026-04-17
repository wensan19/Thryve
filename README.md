# Thryve

Thryve is a website-first food tracking prototype designed to prove the core product flow before a future native iPhone frontend.

## Architecture

- `src/` contains the mobile-first React web app.
- `server/` contains backend API routes and product logic stubs.
- `shared/` contains API contracts and data types intended to be reused by future clients.

## What Works Now

- Signup and login with bcrypt password hashing, stronger validation, and expiring token sessions.
- The Home page includes the Thryve logo in the top-left brand area.
- Versioned consent / terms gate before users can enter the app.
- Logged-in state persists in the browser with `localStorage`.
- Meals, exercises, and profile data are protected per user.
- User data is stored in `server/data/thryve.json` so it remains after refresh and server restart.
- Food photo selection with an instant frontend preview.
- Multipart upload from the web app to the backend meal analysis route.
- Structured editable meal analysis with a main food name plus ingredient rows.
- Users can add, remove, and correct ingredients, quantities, units, and calories per unit before saving.
- Manual food corrections update nutrition when Thryve recognizes the corrected food or ingredient name.
- The Ate page is the main daily meal-tracking surface, with the only scan entry point at the bottom of today's meals.
- Selecting or taking a food photo starts mock AI analysis automatically, then opens the editable review flow.
- Users can also start manual meal entry without uploading a photo.
- The dashboard stays lightweight and no longer includes the scan CTA or percentage ring.
- The review meal screen shows today's total calories and remaining calories before saving.
- Sweetness, spiciness, and saltiness use 0-100% scales.
- Calories recalculate live when portions or sweetness change.
- Meal logs can be saved, viewed, edited, and deleted.
- Profile picture upload, preview, save, replace, and remove.
- Profile fields can be edited and persisted in the file-backed user store.
- Exercise search, suggestions, forgiving matching, duration, intensity, backend calorie estimate, saved exercise logs, edit, and delete.
- Custom exercises such as curls, pushups, sit-ups, planks, squats, lunges, jumping jacks, burpees, presses, and deadlifts map to more relevant estimates.
- Meal uploads reject images over 8 MB and the frontend compresses large images before analysis when possible.
- Nature-wellness visual direction with soft sage, aqua, pearl, and translucent bubble-style panels.
- Friend search works from the Friends page and searches existing users by display name or email.
- Follow and unfollow relationships are stored per user.
- Followed users' saved meals and workouts appear together in the social feed, newest first.
- Feed cards show the author's profile picture or fallback avatar, plus meal/workout images when available.
- Workout feed cards group the workout image, short summary, duration, and calories burned in one unified post section.
- Feed reactions and comments work for meal and workout posts.
- API contracts live in `shared/` so another frontend, including SwiftUI, can reuse the same shapes.

## Commands

```bash
npm install
npm run dev
```

The web app runs at `http://localhost:5173`. The API runs at `http://localhost:8787`.

For production frontend deployments, set this Vercel environment variable:

```bash
VITE_API_BASE_URL=https://thryve-cffg.onrender.com
```

Local development falls back to `http://localhost:8787` when `VITE_API_BASE_URL` is not set. Production builds do not fall back to localhost.

For the Render backend, set a stable frontend origin and session secret:

```bash
CLIENT_ORIGIN=https://your-vercel-app.vercel.app
SESSION_SECRET=your_long_random_secret_here
```

The backend also allows localhost and Vercel preview domains. A stable `SESSION_SECRET` keeps signed auth tokens valid across backend redeploys.

You can also run each side separately:

```bash
npm run dev:web
npm run dev:api
```

## Phone Testing

The Vite frontend is configured with `--host 0.0.0.0`, so it can be opened from another device on the same Wi-Fi network.

1. Find your computer's local IP address.
   - Windows: run `ipconfig` and look for the IPv4 address on your Wi-Fi adapter.
2. Keep `npm run dev` running.
3. Open `http://YOUR_LOCAL_IP:5173` on your phone.

For phone testing, set `VITE_API_BASE_URL=http://YOUR_LOCAL_IP:8787` before starting the frontend so your phone can reach the backend. If Windows Firewall asks for permission, allow Node.js on your private network.

## Consent And Safety

Thryve now shows a required consent / terms gate before login or app access. Users must confirm that they are 18 or older, understand the app is a prototype/demo, and accept the terms before continuing.

The consent gate explains that Thryve is for informational and personal tracking only. It is not medical advice, diagnosis, treatment, or professional nutrition guidance.

AI-assisted outputs may be inaccurate. Meal detection, ingredients, calories, portions, and exercise estimates remain editable because users are responsible for reviewing and correcting results before saving or relying on them.

Uploaded images and entered data may be processed by third-party AI services depending on configuration, including Gemini API and development tools such as ChatGPT/OpenAI or Codex where applicable. Prototype storage is local/limited and not production-grade, so users should not upload highly sensitive personal information.

Consent is stored in browser `localStorage` with a consent version key. Updating the consent version in the app can require users to accept again.

## Mock AI

Food detection is provider-based in `server/src/services/aiFood.ts`. If `FOOD_VISION_PROVIDER=gemini` and `GEMINI_API_KEY` are configured, the backend sends the uploaded image content to Gemini from `server/src/services/realFoodVision.ts` and maps the structured response into Thryve's editable meal review shape.

If Gemini is not configured or the Gemini request fails, Thryve falls back to the mock food template provider. The mock provider accepts the uploaded image, logs each analysis request in the backend console, and returns structured recipe-style estimates based on filename and hint matching. Results include a main food name, editable ingredient rows, practical units, confidence values, flavor levels, ingredient-based calories, and a request ID for development checks.

The structured mock food database lives in `server/src/services/foodTemplates.ts`. It covers rice meals, noodle meals, breakfast foods, drinks, desserts, snacks, fast food, and common Asian / Singapore-style meals such as chicken rice, nasi lemak, laksa, char kway teow, mee goreng, fishball noodles, kaya toast, roti prata, sushi, rice bowls, fried rice, ramen, pasta, salad bowls, pizza, burgers, fried chicken, bubble tea, smoothies, cake, ice cream, and snack plates.

All AI results remain editable because food detection and portion estimation can be wrong.

## Gemini Vision Setup

Create or update `.env` in the project root:

```bash
GEMINI_API_KEY=your_gemini_api_key_here
FOOD_VISION_PROVIDER=gemini
```

Optional:

```bash
GEMINI_FOOD_MODEL=gemini-2.5-flash
```

The API key is read by the Express backend only. The React frontend never receives or stores it.

To confirm which provider is active, watch the backend console:

- Gemini path: `[food-ai] using Gemini image provider`
- Mock fallback path: `[food-ai] using mock provider`
- Gemini failure fallback: `[food-ai] Gemini provider failed; falling back to mock provider`

The Gemini provider uses the uploaded image content and requests structured JSON that maps to the existing review fields: main food, ingredients, quantity, unit, calories per unit, estimated calories, confidence, and flavor sliders. The provider can later be replaced by another vision service as long as it returns the same `MealGuess` shape.

OpenAI variables such as `OPENAI_API_KEY` and `OPENAI_FOOD_MODEL` are no longer used by the active food vision path.

## Exercise Recognition

Exercise estimates use a backend provider layer in `server/src/services/exerciseAi.ts`. When `FOOD_VISION_PROVIDER=gemini` and `GEMINI_API_KEY` are configured, the backend asks Gemini to interpret the typed exercise, duration, intensity, and body weight, then returns structured JSON with matched exercise, calories burned, confidence, and a short summary.

If Gemini is unavailable or fails, Thryve logs the fallback and uses the local estimator in `shared/nutrition.ts`. The local fallback recognizes common activities such as walking, running, jogging, treadmill, cycling, swimming, skipping, stairs, yoga, pilates, stretching, strength training, weight lifting, HIIT, dance, badminton, tennis, basketball, football, volleyball, hiking, rowing, elliptical, curls, pull-ups, pushups, sit-ups, planks, squats, lunges, jumping jacks, burpees, mountain climbers, shoulder press, bench press, deadlift, stairmaster, and incline walking.

Backend logs show the active estimator:

- Gemini path: `[exercise-ai] using Gemini provider`
- Local fallback: `[exercise-ai] using local fallback`
- Gemini failure fallback: `[exercise-ai] Gemini failed; falling back to local estimator`

The exercise estimate route remains authenticated because it is part of the logged-in app and may use profile data such as body weight. If the deployed backend returns `401`, the frontend clears the stale token and asks the user to log in again. Render redeploys or expired sessions can invalidate old browser tokens.

## Food Correction And Upload Limits

The meal editor keeps AI output fully editable. When a user renames the main food or an ingredient, Thryve checks a shared nutrition lookup and updates calories, units, and calorie-per-unit values when it recognizes the corrected food. Unknown foods keep the user's current calorie value so the meal can still be saved and adjusted manually.

Meal image uploads are limited to 8 MB on both frontend and backend. The frontend attempts to resize/compress images larger than roughly 1.5 MB before sending them to the backend, while preserving enough quality for analysis. Oversized or non-image files return user-friendly errors.

## Profile Pictures

Profile pictures are stored as small image data URLs inside the local profile record for this prototype. The profile page supports image preview before saving, replacing an existing photo, and removing it to return to the default avatar.

Current limitation: local JSON storage is fine for prototyping, but production should upload images to object storage and save only image URLs in the database.

## Auth And Persistence

Passwords are hashed with bcrypt before being saved, and login uses bcrypt comparison. Signup validates display name, email format, and password strength. Login returns a generic invalid-credentials message so it does not reveal whether the email or password was wrong.

Auth sessions are token-based and expire after 7 days. Expired sessions are removed from the local store and require the user to log in again. The frontend clears an expired token when the backend returns an auth failure.

New sessions use signed expiring bearer tokens, so token validation no longer depends only on the in-memory/local JSON session list. Set `SESSION_SECRET` in production so signed tokens remain valid across backend restarts and redeploys. If Render storage is reset and user records are lost, users still need to sign up again because the prototype does not yet use a production database.

The frontend checks the stored token shape and expiry before calling `/api/auth/me`. Clearly stale prototype tokens are cleared locally and treated as signed out, which avoids unnecessary startup auth noise. A backend `401` can still happen if a signed token was issued with a different `SESSION_SECRET` or its user record no longer exists; in that case the app clears the token and asks the user to log in again.

Migration note: earlier prototype users saved with the old SHA-256 password helper can log in once with the correct password and are migrated to bcrypt immediately. If Render storage was reset and the user record no longer exists, recreate the account or move to a production database.

This is more realistic than the first prototype, but still uses local JSON storage. For production, replace it with a real database, HTTPS-only secure cookies or hardened bearer-token handling, rate limiting, email verification, and a proper password reset flow.

The storage code lives in `server/src/data/store.ts`. The route layer already reads and writes through that store, which keeps the future database migration contained.

## Visual Direction

Thryve now uses a calmer nature-wellness visual language: soft greens, sage, misty aqua, pearl surfaces, gentle gradients, and translucent iridescent bubble-style cards. The styling is intentionally subtle so the app still feels clean, readable, and mobile-first rather than decorative.

## Friends

The Friends page includes a working search input. It calls:

```bash
GET /api/feed/friends/search?q=search_term
```

The route is authenticated and searches existing users by display name, profile name, or email while excluding the current user. Results show the user's avatar/photo, display name, and email. If no match exists, the app shows a clean empty state.

Following a user calls:

```bash
POST /api/feed/friends/:targetUserId/follow
```

Unfollowing uses:

```bash
DELETE /api/feed/friends/:targetUserId/follow
```

The backend prevents following yourself, duplicate follow relationships, and invalid unfollow actions. The social feed is built from saved meals and saved workouts belonging to users you follow, sorted newest first:

```bash
GET /api/feed
```

Feed reactions work on both meal and workout posts:

```bash
POST /api/feed/posts/:postId/reactions
DELETE /api/feed/posts/:postId/reactions
```

Comments work on both meal and workout posts:

```bash
GET /api/feed/posts/:postId/comments
POST /api/feed/posts/:postId/comments
```

Meal posts reuse the saved meal image when one exists. Workout logs can include an optional lightweight image from the exercise screen, and that image appears in the feed.

Current social limitations: follow is one-way, reactions are limited to like/support/fire, comments cannot be deleted yet, and prototype images are stored as local data URLs rather than production media assets.

## Product Stages

- Stage 1: image upload, AI meal guess, manual corrections, calorie estimate, save meal.
- Stage 2: BMI, calorie target, exercise log, profile.
- Stage 3: shared food feed, friends, comments, reactions.
- Stage 4: reuse backend, accounts, databases, and product flows for SwiftUI.
