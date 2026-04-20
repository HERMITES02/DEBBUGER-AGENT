from tavily import TavilyClient
from dotenv import load_dotenv
import os

load_dotenv()

client = TavilyClient(api_key=os.getenv("TAVILY_API_KEY"))

async def run_search_agent(
    error_message: str,
    language: str = "python",
    max_results: int = 3
) -> dict:
    """
    Search Stack Overflow, GitHub, and docs for solutions
    to the given error. Returns top results with summaries.
    """
    query = (
        f"{error_message} {language} fix"
        " site:stackoverflow.com OR site:github.com"
    )

    try:
        results = client.search(
            query=query,
            max_results=max_results,
            search_depth="advanced",
        )

        sources = [
            {
                "url":     r["url"],
                "title":   r.get("title", ""),
                "summary": r["content"][:400],
            }
            for r in results.get("results", [])
        ]

        return {
            "agent_id": "search",
            "success":  True,
            "query":    query,
            "sources":  sources,
        }

    except Exception as e:
        return {
            "agent_id": "search",
            "success":  False,
            "query":    query,
            "sources":  [],
            "error":    str(e),
        }