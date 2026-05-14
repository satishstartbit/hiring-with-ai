// Decodes the candidate's stored resume Buffer to a best-effort plain-text
// excerpt. Extraction is intentionally lossy — for PDFs / docx the bytes are
// already not pure UTF-8, but Groq still gets enough signal from the readable
// fragments (skills lists, headings, dates) to do useful resume analysis.
//
// Mirrors the logic in /api/jobs/[id]/screening/route.ts so screening and
// interview share the same notion of "resume text".

const MAX_TEXT = 6000;

export function cleanResumeText(text: string): string {
  return text
    .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, MAX_TEXT);
}

export function looksLikeUsefulResumeText(text: string): boolean {
  if (text.length < 120) return false;

  const words = text.split(/\s+/).filter(Boolean);
  const alphaWords = words.filter((word) => /[A-Za-z]{2,}/.test(word));
  const alphaRatio = alphaWords.length / Math.max(words.length, 1);
  const hasPdfNoise = /%PDF|endobj|stream|xref|obj\b/i.test(text);
  const hasZipNoise = /word\/document\.xml|_rels|\bpk\b/i.test(text);

  return alphaWords.length >= 40 && alphaRatio >= 0.55 && !hasPdfNoise && !hasZipNoise;
}

export function extractResumeText(
  buffer: Buffer | null | undefined,
  meta: { filename?: string; contentType?: string } = {}
): string {
  if (!buffer || buffer.length === 0) {
    return [
      `Resume filename: ${meta.filename ?? "unknown"}`,
      `Content type: ${meta.contentType ?? "unknown"}`,
      "No resume content available.",
    ].join("\n");
  }

  const decoded = cleanResumeText(buffer.toString("utf8"));
  if (looksLikeUsefulResumeText(decoded)) return decoded;

  return [
    `Resume filename: ${meta.filename ?? "unknown"}`,
    `Content type: ${meta.contentType ?? "unknown"}`,
    `File size: ${buffer.length} bytes`,
    "Text extraction failed - evaluate based on filename and candidate details only.",
  ].join("\n");
}
