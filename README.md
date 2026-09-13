# Jarvis — Personal AI Agent

A minimal but real "Jarvis": an open-source AI model as the brain, a small set of tools
as its hands, and a browser chat/voice UI as the face.

## How it works
- `server.js` — talks to Groq's free API (running an open-source model). When you ask
  something, the model decides whether to just answer, or call a **tool** (web search,
  save a reminder, check the time, track study tasks, etc). If it calls a tool, the
  server runs the real code for that tool and hands the result back to the model, which
  then gives you the final answer. This loop is the whole trick behind "agents."
- `public/index.html` — chat UI. The 🎤 button uses your browser's built-in speech
  recognition (Chrome/Android work best); replies are read aloud with the browser's
  text-to-speech. Also installable as a real app icon (see below).

## Setup (10 minutes) — completely free

1. **Install Node.js** (v18+) from nodejs.org if you don't have it.
2. **Get a free Groq API key**: console.groq.com → sign up (no credit card needed) →
   API Keys → Create Key.
3. In this folder:
   ```bash
   npm install
   cp .env.example .env
   ```
   Open `.env` and paste your key into `GROQ_API_KEY=`.
4. **Run it**:
   ```bash
   npm start
   ```
   Open `http://localhost:3000` in your browser.
5. **Use it from your phone on the same WiFi**: find your laptop's local IP (Windows:
   `ipconfig`, Mac/Linux: `ifconfig`), e.g. `192.168.1.42`. On your phone (same WiFi),
   visit `http://192.168.1.42:3000`.

## What it can already do
- Answer questions using the model
- Search the web for current info (`web_search` tool — free DuckDuckGo API, basic)
- Save and list general reminders (`add_reminder`, `list_reminders`)
- **Track study tasks** by subject, topic, deadline, and priority (`add_study_task`,
  `list_study_tasks`, `complete_study_task`) — e.g. "add a study task: Data Structures,
  revise linked lists, due Friday, high priority"
- **Keep a weekly class/study schedule** (`set_schedule_entry`, `get_schedule`) — e.g.
  "add Data Structures class Monday 9:00 AM to my schedule"
- Jarvis automatically knows today's day, today's schedule, and your pending study
  tasks in every conversation — it doesn't need to be asked to "check," it just knows
- Tell you the current date/time
- Take voice input and speak replies back
- **Explain any engineering/CS concept** directly — just ask, no setup needed
- **Generate and track a long-term roadmap** for your engineering course or a specific
  skill (`add_roadmap_milestone`, `list_roadmap`, `complete_roadmap_milestone`) — ask for
  a roadmap and it'll offer to save the milestones so it can follow up on your progress
  over time instead of just answering once and forgetting
- **Remembers your conversation across sessions** — close the tab, come back tomorrow,
  and your chat history is still there. Use the 🗑 button to wipe it if you want a fresh start.

## Setting up your schedule and study tasks
Just talk to it naturally:
- "Add Physics lab every Wednesday at 2 PM to my schedule"
- "Add a study task: revise Unit 3 thermodynamics before Monday's test"
- "What's my schedule today?"
- "What study tasks do I still have pending?"
- "Mark the thermodynamics task as done"
- "Give me a roadmap to master DSA for placements" (it'll generate one, then offer to save the milestones)
- "What's on my roadmap?" / "Mark the LeetCode milestone as done"
- "Explain how hashing works" (answered directly, no saving involved)

Everything is stored in `schedule.json` and `study_tasks.json` in the project folder —
you can also open and edit these by hand if you prefer typing out a whole week at once.

## Installing it as a real app icon on your phone (PWA)
This supports "Add to Home Screen" as a proper installable app (not just a browser
bookmark) — it opens full-screen with its own icon, no browser bar.
1. Open the site on your phone in Chrome (Android) or Safari (iPhone).
2. Android/Chrome: tap the ⋮ menu → "Add to Home screen" / "Install app".
   iPhone/Safari: tap Share → "Add to Home Screen".
3. Open it from your home screen from now on — it behaves like a real app.

## Deploying so it works anywhere (not just home WiFi) — free
Right now the server only works when your phone and laptop share the same WiFi. To make
it reachable from anywhere (mobile data included), deploy it to Render's free tier:

1. **Create a free GitHub account** if you don't have one (github.com).
2. **Push this project to a new GitHub repo** (run these inside the jarvis-agent folder):
   ```bash
   git init
   git add .
   git commit -m "Jarvis agent"
   ```
   Create a new empty repo on github.com (don't add a README/license there), then:
   ```bash
   git remote add origin https://github.com/YOUR_USERNAME/jarvis-agent.git
   git branch -M main
   git push -u origin main
   ```
   (`.env` is excluded automatically via `.gitignore` — your API key never gets uploaded.)
3. **Sign up free at render.com** (no card required for the free tier).
4. Click **New -> Web Service**, connect your GitHub account, and pick the `jarvis-agent` repo.
5. Set:
   - Build command: `npm install`
   - Start command: `npm start`
6. Under **Environment**, add a variable: `GROQ_API_KEY` = your key from console.groq.com.
7. Click **Create Web Service**. Render builds and deploys it, then gives you a public URL
   like `https://jarvis-agent-xyz.onrender.com`.
8. Open that URL on your phone (any network — WiFi or mobile data) and install it via
   "Add to Home Screen" as above.

**Note:** Render's free tier "sleeps" the server after ~15 minutes of no use, so the first
message after a while takes 20-30 seconds to wake back up — after that it's instant. Fine
for personal use; nothing to worry about right now.

## Password-protecting it (recommended once deployed publicly)
Once deployed on Render, anyone with the URL could use it and burn through your free
Groq quota. To stop that:
1. In your `.env` file (locally) and in Render's **Environment Variables**, set
   `APP_PASSWORD` to any password you choose (e.g. `APP_PASSWORD=mysecret123`).
2. Restart the server (locally) or redeploy (on Render).
3. Next time you open the app, it will prompt for that password once and remember it
   in that browser from then on.
4. If you leave `APP_PASSWORD` unset, no password is required.

## Real web search (Google results via Serper.dev — free)
The DuckDuckGo fallback is weak. For real Google search results:
1. Sign up free at serper.dev (no credit card needed, generous free query allowance).
2. Copy your API key from their dashboard.
3. Add to .env (and to Render's Environment Variables): SERPER_API_KEY=your_key_here
4. Restart/redeploy. Jarvis will automatically use real Google results from then on —
   no code changes needed, it auto-detects the key.
If SERPER_API_KEY isn't set, it silently falls back to the basic DuckDuckGo search.

## Real alerts & notifications
Jarvis now checks every minute (while the app is open) for:
- Classes starting within the next 15 minutes (from your schedule)
- Study tasks whose deadline is today (matches "today", the weekday name, or the date)
- Reminders whose "when" field matches today
When something is due, you get a real browser/phone notification — even if Jarvis is in
the background, as long as the tab/app is still open. The first time you open the app,
your browser will ask for notification permission — allow it for this to work.
Note: this only fires while the app is open somewhere (tab or installed PWA) — it does
not wake up your phone if the app is fully closed. That would need push notifications
with a more involved setup (VAPID keys + a push server) — possible as a future upgrade
if you want it, but not included here.

## How to extend it further

1. **Real calendar** — add a `create_event` tool that calls the Google Calendar API
   (needs OAuth setup — ask me for this next and I'll build it in).
2. **Coding help** — add a `run_code` tool using Node's `child_process` to execute
   short JS/Python snippets sandboxed, so Jarvis can test code for you.
3. **Push notifications when the app is fully closed** — needs VAPID keys and a push
   server; the current alerts only fire while the tab/app is open.

## About the free tier
Groq's free tier gives generous daily limits (plenty for personal use — thousands of
messages a day). This is genuinely free indefinitely for a personal assistant like this.

## Notes
- The DuckDuckGo search tool is intentionally basic — good enough to prove the concept,
  not good enough to rely on for real research. Upgrade it first if research quality matters.
- Reminders currently just get listed when asked — there's no notification/alarm system
  yet. That's a good next feature once the core loop feels solid.
