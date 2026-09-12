// server.js — Jarvis-style agent backend
// Brain: Groq's free API (open-source model). Hands: the functions in TOOLS below.

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const Groq = require("groq-sdk");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const REMINDERS_FILE = path.join(__dirname, "reminders.json");
const STUDY_TASKS_FILE = path.join(__dirname, "study_tasks.json");
const SCHEDULE_FILE = path.join(__dirname, "schedule.json");
const ROADMAP_FILE = path.join(__dirname, "roadmap.json");
const HISTORY_FILE = path.join(__dirname, "chat_history.json");

if (!fs.existsSync(REMINDERS_FILE)) fs.writeFileSync(REMINDERS_FILE, "[]");
if (!fs.existsSync(STUDY_TASKS_FILE)) fs.writeFileSync(STUDY_TASKS_FILE, "[]");
// schedule.json: { "Monday": [{ "time": "9:00 AM", "subject": "Data Structures" }], ... }
if (!fs.existsSync(SCHEDULE_FILE)) fs.writeFileSync(SCHEDULE_FILE, "{}");
// roadmap.json: [{ id, milestone, area, target_semester, done }]
if (!fs.existsSync(ROADMAP_FILE)) fs.writeFileSync(ROADMAP_FILE, "[]");
// chat_history.json: full conversation across sessions
if (!fs.existsSync(HISTORY_FILE)) fs.writeFileSync(HISTORY_FILE, "[]");

// Only the last N messages are sent to the model each turn, to keep requests fast
// and within context limits — but the full history is still saved and shown in the UI.
const MAX_HISTORY_FOR_MODEL = 30;

// ---------- 1. Define the tools the model is allowed to call ----------
const tools = [
  {
    type: "function",
    function: {
      name: "web_search",
      description: "Search the web for current information (news, facts, prices, etc).",
      parameters: {
        type: "object",
        properties: { query: { type: "string", description: "search query" } },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_current_datetime",
      description: "Get the current date and time.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "add_reminder",
      description: "Save a general (non-study) reminder for the user.",
      parameters: {
        type: "object",
        properties: {
          text: { type: "string", description: "what to remember" },
          when: { type: "string", description: "optional date/time, plain text" },
        },
        required: ["text"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_reminders",
      description: "List all saved general reminders.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "add_study_task",
      description: "Add a study task — an assignment, topic to revise, or exam to prepare for.",
      parameters: {
        type: "object",
        properties: {
          subject: { type: "string", description: "e.g. Data Structures, Maths, Physics" },
          topic: { type: "string", description: "what needs to be studied or done" },
          deadline: { type: "string", description: "due date, plain text (e.g. 'Friday', '2026-09-20')" },
          priority: { type: "string", enum: ["low", "medium", "high"] },
        },
        required: ["subject", "topic"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_study_tasks",
      description: "List study tasks. Use filter='pending' by default to see what's outstanding.",
      parameters: {
        type: "object",
        properties: {
          filter: { type: "string", enum: ["pending", "done", "all"] },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "complete_study_task",
      description: "Mark a study task as done. Match by subject and/or topic text.",
      parameters: {
        type: "object",
        properties: {
          match_text: { type: "string", description: "text to find the task by (subject or topic)" },
        },
        required: ["match_text"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "set_schedule_entry",
      description: "Add or update a recurring weekly schedule entry (class, study block, etc).",
      parameters: {
        type: "object",
        properties: {
          day: { type: "string", enum: ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"] },
          time: { type: "string", description: "e.g. '9:00 AM'" },
          subject: { type: "string", description: "class name or activity" },
        },
        required: ["day", "time", "subject"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_schedule",
      description: "Get the weekly schedule. Pass a day to get just that day, or omit for the whole week.",
      parameters: {
        type: "object",
        properties: {
          day: { type: "string", enum: ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"] },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_roadmap_milestone",
      description: "Add a long-term engineering roadmap milestone — a skill to learn, a subject area to master, or a project/certification target, tied to a semester or timeframe.",
      parameters: {
        type: "object",
        properties: {
          area: { type: "string", description: "e.g. 'Data Structures & Algorithms', 'Web Development', 'DBMS'" },
          milestone: { type: "string", description: "the specific goal, e.g. 'Complete 100 LeetCode problems'" },
          target: { type: "string", description: "target timeframe, e.g. 'Semester 3', 'by Dec 2026'" },
        },
        required: ["area", "milestone"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_roadmap",
      description: "List roadmap milestones. Use filter='pending' by default.",
      parameters: {
        type: "object",
        properties: {
          filter: { type: "string", enum: ["pending", "done", "all"] },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "complete_roadmap_milestone",
      description: "Mark a roadmap milestone as achieved. Match by area or milestone text.",
      parameters: {
        type: "object",
        properties: {
          match_text: { type: "string", description: "text to find the milestone by" },
        },
        required: ["match_text"],
      },
    },
  },
];

// ---------- 2. Implement what each tool actually does ----------
function readJSON(file) { return JSON.parse(fs.readFileSync(file)); }
function writeJSON(file, data) { fs.writeFileSync(file, JSON.stringify(data, null, 2)); }

async function runTool(name, input) {
  switch (name) {
    case "web_search": {
      const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(input.query)}&format=json&no_html=1&skip_disambig=1`;
      try {
        const res = await fetch(url);
        const data = await res.json();
        const summary = data.AbstractText || (data.RelatedTopics && data.RelatedTopics[0]?.Text) || "No direct summary found.";
        return { result: summary };
      } catch (e) {
        return { result: "Search failed: " + e.message };
      }
    }

    case "get_current_datetime":
      return { result: new Date().toString() };

    case "add_reminder": {
      const reminders = readJSON(REMINDERS_FILE);
      reminders.push({ text: input.text, when: input.when || null, created: new Date().toISOString() });
      writeJSON(REMINDERS_FILE, reminders);
      return { result: "Reminder saved." };
    }

    case "list_reminders":
      return { result: JSON.stringify(readJSON(REMINDERS_FILE)) };

    case "add_study_task": {
      const tasks = readJSON(STUDY_TASKS_FILE);
      tasks.push({
        id: Date.now().toString(36),
        subject: input.subject,
        topic: input.topic,
        deadline: input.deadline || null,
        priority: input.priority || "medium",
        done: false,
        created: new Date().toISOString(),
      });
      writeJSON(STUDY_TASKS_FILE, tasks);
      return { result: "Study task added." };
    }

    case "list_study_tasks": {
      const tasks = readJSON(STUDY_TASKS_FILE);
      const filter = input.filter || "pending";
      const filtered =
        filter === "all" ? tasks :
        filter === "done" ? tasks.filter((t) => t.done) :
        tasks.filter((t) => !t.done);
      return { result: JSON.stringify(filtered) };
    }

    case "complete_study_task": {
      const tasks = readJSON(STUDY_TASKS_FILE);
      const needle = input.match_text.toLowerCase();
      const task = tasks.find(
        (t) => !t.done && (t.subject.toLowerCase().includes(needle) || t.topic.toLowerCase().includes(needle))
      );
      if (!task) return { result: "No matching pending task found." };
      task.done = true;
      writeJSON(STUDY_TASKS_FILE, tasks);
      return { result: `Marked "${task.topic}" (${task.subject}) as done.` };
    }

    case "set_schedule_entry": {
      const schedule = readJSON(SCHEDULE_FILE);
      if (!schedule[input.day]) schedule[input.day] = [];
      schedule[input.day].push({ time: input.time, subject: input.subject });
      schedule[input.day].sort((a, b) => a.time.localeCompare(b.time));
      writeJSON(SCHEDULE_FILE, schedule);
      return { result: `Added to ${input.day}'s schedule.` };
    }

    case "get_schedule": {
      const schedule = readJSON(SCHEDULE_FILE);
      if (input.day) return { result: JSON.stringify(schedule[input.day] || []) };
      return { result: JSON.stringify(schedule) };
    }

    case "add_roadmap_milestone": {
      const roadmap = readJSON(ROADMAP_FILE);
      roadmap.push({
        id: Date.now().toString(36),
        area: input.area,
        milestone: input.milestone,
        target: input.target || null,
        done: false,
        created: new Date().toISOString(),
      });
      writeJSON(ROADMAP_FILE, roadmap);
      return { result: "Roadmap milestone added." };
    }

    case "list_roadmap": {
      const roadmap = readJSON(ROADMAP_FILE);
      const filter = input.filter || "pending";
      const filtered =
        filter === "all" ? roadmap :
        filter === "done" ? roadmap.filter((r) => r.done) :
        roadmap.filter((r) => !r.done);
      return { result: JSON.stringify(filtered) };
    }

    case "complete_roadmap_milestone": {
      const roadmap = readJSON(ROADMAP_FILE);
      const needle = input.match_text.toLowerCase();
      const item = roadmap.find(
        (r) => !r.done && (r.area.toLowerCase().includes(needle) || r.milestone.toLowerCase().includes(needle))
      );
      if (!item) return { result: "No matching pending milestone found." };
      item.done = true;
      writeJSON(ROADMAP_FILE, roadmap);
      return { result: `Marked "${item.milestone}" (${item.area}) as achieved.` };
    }

    default:
      return { result: "Unknown tool." };
  }
}

// Safety net: if the model forgets $ delimiters but still writes raw LaTeX
// commands inside plain [ ] or ( ), wrap them so the frontend can render them anyway.
function fixMathDelimiters(text) {
  if (!text) return text;
  // [ ...latex... ] with no nested brackets, containing a backslash command -> $$ ... $$
  text = text.replace(/\[\s*([^\[\]]*\\[a-zA-Z][^\[\]]*)\]/g, "$$$$ $1 $$$$");
  // ( ...latex... ) with no nested parens, containing a backslash command -> $ ... $
  text = text.replace(/\(\s*([^()]*\\[a-zA-Z][^()]*)\)/g, "$$$1$$");
  return text;
}

// ---------- 3. The agent loop: model thinks, calls tools, thinks again ----------
function buildSystemPrompt() {
  const today = new Date().toLocaleDateString("en-US", { weekday: "long" });
  let pendingTasks = [];
  let todaySchedule = [];
  let pendingRoadmap = [];
  try { pendingTasks = readJSON(STUDY_TASKS_FILE).filter((t) => !t.done); } catch {}
  try { todaySchedule = readJSON(SCHEDULE_FILE)[today] || []; } catch {}
  try { pendingRoadmap = readJSON(ROADMAP_FILE).filter((r) => !r.done); } catch {}

  return `You are Jarvis, a helpful personal AI assistant and study companion for a college student
(B.Tech IT, Panimalar Engineering College).
Be concise and direct. Use tools when they'd give a better, more current, or more accurate answer
than your own knowledge — especially for study tasks, schedule, reminders, and the roadmap.
Proactively mention overdue or urgent study tasks when relevant, but don't nag about them in every reply.

You can explain any engineering/CS concept directly using your own knowledge — no tool needed for that,
just teach it clearly with examples suited to a B.Tech IT student.
MATH FORMATTING RULE: never use LaTeX code (no \lambda, \det, \begin{bmatrix}, \[, \(, $ etc).
Write scalar math using plain Unicode symbols directly, the way a person would type it in a text
message: λ for lambda, Σ for sum, √ for square root, × for multiply, ² ³ for powers, ≈ ≤ ≥ ≠ → as needed.
For MATRICES specifically, always format them as an aligned grid inside a fenced code block (triple
backticks) so columns line up, like this:
\`\`\`
[ 2  1 ]
[ 1  2 ]
\`\`\`
Never write a matrix inline in a sentence like [2 1; 1 2] — always use the boxed code-block grid style
above, on its own lines, even for small 2x2 matrices.
Example of correct overall style: "An eigenvector v satisfies Av = λv. For the matrix
\`\`\`
[ 2  1 ]
[ 1  2 ]
\`\`\`
solving det(A - λI) = 0 gives (2-λ)² - 1 = 0, so λ = 1 or λ = 3."

If the user asks for a "roadmap" or "study plan" for their engineering course/a subject/a skill, generate
a clear one directly (semesters, topics in order, suggested resources or projects), and then ask if they
want it saved to their tracked roadmap using add_roadmap_milestone so you can follow up on it over time.

Today is ${today}.
Today's schedule: ${todaySchedule.length ? JSON.stringify(todaySchedule) : "nothing scheduled yet — help the user set it up with set_schedule_entry"}.
Pending study tasks (${pendingTasks.length}): ${pendingTasks.length ? JSON.stringify(pendingTasks) : "none yet"}.
Pending roadmap milestones (${pendingRoadmap.length}): ${pendingRoadmap.length ? JSON.stringify(pendingRoadmap) : "none saved yet"}.`;
}

app.get("/api/history", (req, res) => {
  try {
    res.json({ history: readJSON(HISTORY_FILE) });
  } catch (err) {
    res.json({ history: [] });
  }
});

app.post("/api/clear-history", (req, res) => {
  writeJSON(HISTORY_FILE, []);
  res.json({ result: "cleared" });
});

app.post("/api/chat", async (req, res) => {
  try {
    const { messages } = req.body; // full conversation so far, from the frontend
    // Only send the most recent messages to the model to keep it fast & in context limits
    const recent = messages.slice(-MAX_HISTORY_FOR_MODEL);
    let conversation = [{ role: "system", content: buildSystemPrompt() }, ...recent];

    while (true) {
      const response = await groq.chat.completions.create({
        model: "openai/gpt-oss-20b",
        max_tokens: 1024,
        tools,
        messages: conversation,
      });

      const choice = response.choices[0];
      const msg = choice.message;

      if (choice.finish_reason !== "tool_calls") {
        const finalConvo = [...conversation, msg].filter((m) => m.role !== "system");
        const cleanReply = fixMathDelimiters(msg.content) || "";

        // Persist the full conversation (not just the trimmed window sent to the model)
        const fullHistory = [...messages, { role: "assistant", content: cleanReply }];
        writeJSON(HISTORY_FILE, fullHistory);

        return res.json({ reply: cleanReply, conversation: fullHistory });
      }

      conversation.push(msg);

      for (const call of msg.tool_calls) {
        const args = JSON.parse(call.function.arguments || "{}");
        const output = await runTool(call.function.name, args);
        conversation.push({
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify(output),
        });
      }
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => console.log(`Jarvis running on http://localhost:${PORT}`));
