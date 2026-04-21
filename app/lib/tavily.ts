import { tavily } from "@tavily/core";

/**
 * Run a web search via Tavily and return a plain-text summary of results.
 * Returns an empty string if the API key is missing or the search fails,
 * so callers can treat search context as optional enrichment.
 */
export async function webSearch(query: string, maxResults = 4): Promise<string> {
  const apiKey = process.env.TVLY_API_KEY?.trim();
  if (!apiKey) return "";

  try {
    const client = tavily({ apiKey });
    const response = await client.search(query, {
      maxResults,
      searchDepth: "basic",
    });

    return response.results
      .map((r) => `### ${r.title}\n${r.content}`)
      .join("\n\n");
  } catch {
    return "";
  }
}
