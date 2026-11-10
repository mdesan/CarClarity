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

// Sends one request to Gemini and returns its JSON, which must contain a list under `listField`.
async function askGemini(env, systemPrompt, schema, userMessage, listField) {
  let response;
  try {
    response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/" + env.GEMINI_MODEL + ":generateContent",
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
        signal: AbortSignal.timeout(30000)
      }
    );
  } catch (error) {
    const timedOut = error?.name === "TimeoutError";
    return Response.json(
      { error: timedOut ? "Gemini took too long to respond." : "Couldn't reach Gemini." },
      { status: timedOut ? 504 : 502 }
    );
  }
  if (!response.ok) {
    // 429 means the free-tier limit was hit.
    const detail = await response.json().catch(() => null);
    return Response.json({
      error: "Gemini request failed.",
      geminiStatus: response.status,
      geminiMessage: detail?.error?.message ?? null
    }, { status: 502 });
  }

  try {
    const data = await response.json();
    const result = JSON.parse(data.candidates[0].content.parts[0].text);
    if (!Array.isArray(result[listField])) throw new Error("Missing " + listField);
    return Response.json(result);
  } catch {
    return Response.json({ error: "Gemini returned an unexpected response." }, { status: 502 });
  }
}
