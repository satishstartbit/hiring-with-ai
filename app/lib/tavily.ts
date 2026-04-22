import { tavily } from "@tavily/core";
import { traceable } from "langsmith/traceable";

export const webSearch = traceable(
  async (query: string, maxResults = 4): Promise<string> => {
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
  },
  { name: "web_search", run_type: "tool", tags: ["search"] }
);
