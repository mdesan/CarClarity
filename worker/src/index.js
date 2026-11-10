// CarClarity Worker: sits between the extension and Gemini so the API key stays secret.
// GET                → health check.
// POST /             → { year, make, model, mileageMiles?, titleStatus?, description } → { issues: [...] }
// POST /repair-costs → { year, make, model, mileageMiles?, problems: [{ name, detail? }] } → { estimates: [...] }
import { SYSTEM_PROMPT, RESPONSE_SCHEMA, REPAIR_PROMPT, REPAIR_SCHEMA } from "./prompt.js";

const MAX_DESCRIPTION_LENGTH = 6000;
const MAX_PROBLEMS = 30;

// Lets the extension read responses. Each unpacked copy has a different ID, so any origin is allowed.
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

export default {
  async fetch(request, env) {
    // The browser asks with OPTIONS before sending the real POST.
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }
    const response = await handleRequest(request, env);
    for (const [name, value] of Object.entries(CORS_HEADERS)) {
      response.headers.set(name, value);
    }
    return response;
  }
};

async function handleRequest(request, env) {
  if (request.method === "GET") {
    return Response.json({ ok: true, message: "CarClarity worker is running" });
  }
  if (request.method !== "POST") {
    return Response.json({ error: "Use POST." }, { status: 405 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body must be JSON." }, { status: 400 });
  }
  const { year, make, model, mileageMiles = null } = body ?? {};
  if (!Number.isInteger(year) || typeof make !== "string" || !make.trim() ||
      typeof model !== "string" || !model.trim()) {
    return Response.json({ error: "year, make, and model are required." }, { status: 400 });
  }
  const car = { year, make, model, mileageMiles };

  const path = new URL(request.url).pathname;
  if (path === "/") return explainIssues(car, body, env);
  if (path === "/repair-costs") return estimateRepairs(car, body, env);
  return Response.json({ error: "Unknown address." }, { status: 404 });
}

async function explainIssues(car, { titleStatus = null, description }, env) {
  if (typeof description !== "string" || !description.trim()) {
    return Response.json({ error: "description is required." }, { status: 400 });
  }
  if (description.length > MAX_DESCRIPTION_LENGTH) {
    return Response.json({ error: "description is too long." }, { status: 413 });
  }
  const userMessage = "Car: " + JSON.stringify({ ...car, titleStatus }) +
    "\n\nSeller's description:\n" + description;
  return askGemini(env, SYSTEM_PROMPT, RESPONSE_SCHEMA, userMessage, "issues");
}

async function estimateRepairs(car, { problems }, env) {
  const valid = Array.isArray(problems) && problems.length > 0 && problems.length <= MAX_PROBLEMS &&
    problems.every((problem) =>
      typeof problem?.name === "string" && problem.name.trim() && problem.name.length <= 200 &&
      (problem.detail == null || (typeof problem.detail === "string" && problem.detail.length <= 600)));
  if (!valid) {
    return Response.json({ error: "problems must be a list of 1 to " + MAX_PROBLEMS + " named problems." }, { status: 400 });
  }
  const list = problems.map(({ name, detail }) => ({ name, detail: detail ?? null }));
  const userMessage = "Car: " + JSON.stringify(car) + "\n\nProblems to price:\n" + JSON.stringify(list, null, 2);
  return askGemini(env, REPAIR_PROMPT, REPAIR_SCHEMA, userMessage, "estimates");
}

// Errors that usually go away on their own: busy (503), too many requests (429), server error (500).
const RETRY_STATUSES = [429, 500, 503];
// The extension stops waiting after 35 seconds, so every attempt must finish before then.
const TOTAL_TIME_MS = 28000;
const ATTEMPT_TIME_MS = 15000;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Asks each model in GEMINI_MODELS in order. A busy model gets one retry, then the next model is tried.
// Returns Gemini's JSON, which must contain a list under `listField`.
async function askGemini(env, systemPrompt, schema, userMessage, listField) {
  const models = env.GEMINI_MODELS.split(",").map((model) => model.trim()).filter(Boolean);
  const deadline = Date.now() + TOTAL_TIME_MS;
  let failure = Response.json({ error: "Gemini is busy right now." }, { status: 503 });

  for (const model of models) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      const timeLeft = deadline - Date.now();
      if (timeLeft < 2000) return failure;

      let response;
      try {
        response = await fetch(
          "https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent",
          {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_KEY },
            body: JSON.stringify({
              systemInstruction: { parts: [{ text: systemPrompt }] },
              contents: [{ role: "user", parts: [{ text: userMessage }] }],
              generationConfig: {
                responseMimeType: "application/json",
                responseSchema: schema,
                // These tasks don't need much thinking; keeps responses fast.
                thinkingConfig: { thinkingLevel: "low" }
              }
            }),
            signal: AbortSignal.timeout(Math.min(ATTEMPT_TIME_MS, timeLeft))
          }
        );
      } catch (error) {
        // A slow or unreachable model goes straight to the next one.
        const timedOut = error?.name === "TimeoutError";
        failure = Response.json(
          { error: timedOut ? "Gemini took too long to respond." : "Couldn't reach Gemini.", model },
          { status: timedOut ? 504 : 502 }
        );
        break;
      }

      if (!response.ok) {
        const detail = await response.json().catch(() => null);
        failure = Response.json({
          error: "Gemini request failed.",
          model,
          geminiStatus: response.status,
          geminiMessage: detail?.error?.message ?? null
        }, { status: 502 });
        // Other errors, like a bad key, won't be fixed by trying again.
        if (!RETRY_STATUSES.includes(response.status)) return failure;
        if (attempt === 1) await wait(1000);
        continue;
      }

      try {
        const data = await response.json();
        const result = JSON.parse(data.candidates[0].content.parts[0].text);
        if (!Array.isArray(result[listField])) throw new Error("Missing " + listField);
        // Shows which model answered, for checking in the browser's Network tab.
        return Response.json(result, { headers: { "X-Gemini-Model": model } });
      } catch {
        failure = Response.json({ error: "Gemini returned an unexpected response.", model }, { status: 502 });
        break;
      }
    }
  }
  return failure;
}
