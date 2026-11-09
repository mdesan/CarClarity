// CarClarity Worker: sits between the extension and Gemini so the API key stays secret.
// GET  → health check.
// POST → { year, make, model, mileageMiles?, titleStatus?, description } → { issues: [...] }
import { SYSTEM_PROMPT, RESPONSE_SCHEMA } from "./prompt.js";

const MAX_DESCRIPTION_LENGTH = 6000;

export default {
  async fetch(request, env) {
    if (request.method === "GET") {
      return Response.json({ ok: true, message: "CarClarity worker is running" });
    }
    if (request.method !== "POST") {
      return Response.json({ error: "Use POST." }, { status: 405 });
    }

    let listing;
    try {
      listing = await request.json();
    } catch {
      return Response.json({ error: "Body must be JSON." }, { status: 400 });
    }
    const { year, make, model, mileageMiles = null, titleStatus = null, description } = listing ?? {};
    if (!Number.isInteger(year) || typeof make !== "string" || !make.trim() ||
        typeof model !== "string" || !model.trim()) {
      return Response.json({ error: "year, make, and model are required." }, { status: 400 });
    }
    if (typeof description !== "string" || !description.trim()) {
      return Response.json({ error: "description is required." }, { status: 400 });
    }
    if (description.length > MAX_DESCRIPTION_LENGTH) {
      return Response.json({ error: "description is too long." }, { status: 413 });
    }

    const car = { year, make, model, mileageMiles, titleStatus };
    const userMessage = "Car: " + JSON.stringify(car) + "\n\nSeller's description:\n" + description;

    let response;
    try {
      response = await fetch(
        "https://generativelanguage.googleapis.com/v1beta/models/" + env.GEMINI_MODEL + ":generateContent",
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_KEY },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
            contents: [{ role: "user", parts: [{ text: userMessage }] }],
            generationConfig: {
              responseMimeType: "application/json",
              responseSchema: RESPONSE_SCHEMA,
              // Reading one listing doesn't need much thinking; keeps responses fast.
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
      if (!Array.isArray(result.issues)) throw new Error("Missing issues");
      return Response.json(result);
    } catch {
      return Response.json({ error: "Gemini returned an unexpected response." }, { status: 502 });
    }
  }
};
