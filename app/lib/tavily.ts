import { tavily } from "@tavily/core";
import { traceable } from "langsmith/traceable";

// Hard cap so a slow/hanging Tavily call can't stall a request that only uses
// the search result as optional context.
const SEARCH_TIMEOUT_MS = 8000;

export const webSearch = traceable(
  async (query: string, maxResults = 4): Promise<string> => {
    const apiKey = process.env.TVLY_API_KEY?.trim();
    if (!apiKey) return "";

    try {
      const client = tavily({ apiKey });
      const timeout = new Promise<null>((resolve) =>
        setTimeout(() => resolve(null), SEARCH_TIMEOUT_MS)
      );
      const response = await Promise.race([
        client.search(query, { maxResults, searchDepth: "basic" }),
        timeout,
      ]);
      if (!response) return "";

      return response.results
        .map((r) => `### ${r.title}\n${r.content}`)
        .join("\n\n");
    } catch {
      return "";
    }
  },
  { name: "web_search", run_type: "tool", tags: ["search"] }
);
