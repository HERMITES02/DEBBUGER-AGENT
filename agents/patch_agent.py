from langchain_anthropic import ChatAnthropic
from langchain_core.messages import HumanMessage
from dotenv import load_dotenv
import os, re

load_dotenv()

llm = ChatAnthropic(
    model="claude-sonnet-4-20250514",
    api_key=os.getenv("ANTHROPIC_API_KEY"),
    max_tokens=2048,
)

def extract_diff(text: str) -> str:
    """Pull the unified diff block out of Claude's response."""
    # Try to find a fenced diff block first
    match = re.search(
        r'```(?:diff|python)?\n(.*?)```',
        text, re.DOTALL
    )
    if match:
        return match.group(1).strip()
    # Fall back to lines starting with +/- if no fences
    lines = [
        l for l in text.splitlines()
        if l.startswith(('+', '-', '@@', '---', '+++'))
    ]
    return '\n'.join(lines) if lines else text.strip()

def extract_explanation(text: str) -> str:
    """Pull the plain-English explanation out of Claude's response."""
    match = re.search(r'EXPLANATION:\s*(.+?)(?:\n|$)', text, re.DOTALL)
    if match:
        return match.group(1).strip()
    # Return everything before the diff block
    parts = text.split('```')
    return parts[0].strip() if parts else text.strip()

async def run_patch_agent(
    code: str,
    root_cause: str,
    language: str = "python",
    search_results: list = [],
) -> dict:
    """
    Generate a code fix for the identified bug.
    Returns a unified diff + plain-English explanation.
    """

    search_context = ""
    if search_results:
        search_context = "\n\nRelevant solutions found online:\n" + "\n".join(
            f"- {s.get('title','')}: {s.get('summary','')[:200]}"
            for s in search_results[:3]
        )

    prompt = f"""You are an expert {language} developer fixing a bug.

ORIGINAL CODE:
```{language}
{code}
```

ROOT CAUSE:
{root_cause}
{search_context}

Your task:
1. Fix the bug in the code above.
2. Return your response in EXACTLY this format:

EXPLANATION: 

```diff
--- original
+++ fixed
@@ ... @@

```

Rules:
- Only change what is necessary to fix the bug
- Keep the same code style
- The diff must be valid unified diff format
- Lines removed start with -
- Lines added start with +
- Context lines (unchanged) start with a space"""

    try:
        response = await llm.ainvoke([HumanMessage(content=prompt)])
        raw = response.content

        return {
            "agent_id":    "patch",
            "success":     True,
            "diff":        extract_diff(raw),
            "explanation": extract_explanation(raw),
            "raw":         raw,
        }

    except Exception as e:
        return {
            "agent_id":    "patch",
            "success":     False,
            "diff":        "",
            "explanation": "",
            "error":       str(e),
        }