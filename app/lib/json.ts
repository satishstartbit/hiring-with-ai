/**
 * Tolerant JSON extraction for LLM output.
 *
 * llama-3.1-8b-instant (and small models in general) frequently emit:
 *   - Markdown code fences (```json ... ```)
 *   - Trailing commas before `]` / `}`
 *   - Leading/trailing prose around the JSON
 *   - Mismatched braces when the model is cut off near max_tokens
 *
 * `parseLooseJson` repairs the common cases before handing to JSON.parse.
 * It does NOT fix unescaped inner quotes — that needs a real repair lib.
 */

function stripCodeFences(s: string): string {
  return s.replace(/```(?:json|JSON)?\s*/g, "").replace(/```/g, "");
}

function extractBalancedObject(raw: string): string {
  const start = raw.indexOf("{");
  if (start === -1) {
    throw new Error("No JSON object found in LLM response");
  }

  let depth = 0;
  let inString = false;
  let escaped = false;
  let end = -1;

  for (let i = start; i < raw.length; i++) {
    const ch = raw[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }

  if (end === -1) {
    // Brace-mismatched — fall back to "first `{` through last `}`" so a
    // truncated tail string at least has a chance of parsing once trailing
    // commas are stripped.
    const last = raw.lastIndexOf("}");
    if (last > start) return raw.slice(start, last + 1);
    throw new Error("Unbalanced JSON braces in LLM response");
  }

  return raw.slice(start, end + 1);
}

function stripTrailingCommas(s: string): string {
  // Remove `,` immediately before `]` or `}` (only when not inside a string).
  let out = "";
  let inString = false;
  let escaped = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (escaped) {
      out += ch;
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      out += ch;
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      out += ch;
      continue;
    }
    if (!inString && ch === ",") {
      // Look ahead past whitespace for `]` or `}`.
      let j = i + 1;
      while (j < s.length && /\s/.test(s[j])) j++;
      if (s[j] === "]" || s[j] === "}") continue; // drop the comma
    }
    out += ch;
  }
  return out;
}

export function parseLooseJson<T = unknown>(raw: string): T {
  const cleaned = stripCodeFences(raw);
  const body = extractBalancedObject(cleaned);
  try {
    return JSON.parse(body) as T;
  } catch {
    const fixed = stripTrailingCommas(body);
    return JSON.parse(fixed) as T;
  }
}
