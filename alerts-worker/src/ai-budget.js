// Conservative reservations for the existing llama-3.1-8b-instruct-fp8 model.
// Published rates: 13,778 input / 26,128 output neurons per million tokens.
// Use higher rates and a byte-based input bound; failed calls keep reservations.
const DAILY_NEURONS = 8000;
const MAX_INPUT_BYTES = 24000;
const MAX_OUTPUT_TOKENS = 1200;

export async function reserveResearchAi(env,messages,now=Date.now()) {
  const bytes = new TextEncoder().encode(JSON.stringify(messages)).length;
  if (!env.DB || bytes > MAX_INPUT_BYTES) return false;
  const reservation = Math.ceil((bytes + 4096) * .02 + MAX_OUTPUT_TOKENS * .04);
  const day = new Date(now).toISOString().slice(0,10);
  try {
    const result = await env.DB.prepare(`INSERT INTO research_ai_budget (day,reserved_neurons) VALUES (?,?)
      ON CONFLICT(day) DO UPDATE SET reserved_neurons=research_ai_budget.reserved_neurons+excluded.reserved_neurons
      WHERE research_ai_budget.reserved_neurons+excluded.reserved_neurons <= ?`)
      .bind(day,reservation,DAILY_NEURONS).run();
    return result.meta?.changes === 1;
  } catch {
    // Unknown quota state must use the existing deterministic fallback.
    return false;
  }
}
