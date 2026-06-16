from langchain_anthropic import ChatAnthropic
from langchain_core.messages import HumanMessage
from agents.model_router import get_model_for_complexity, get_llm
from dotenv import load_dotenv
import os, re

load_dotenv()

# ── removed hardcoded llm here — model is chosen per-call now ─────────────────


def extract_diff(text: str) -> str:
    """Pull the unified diff block out of Claude's response."""
    match = re.search(r'```(?:diff|python)?\n(.*?)```', text, re.DOTALL)
    if match:
        return match.group(1).strip()
    lines = [
        l for l in text.splitlines()
        if l.startswith(('+', '-', '@@', '---', '+++'))
    ]
    return '\n'.join(lines) if lines else text.strip()


def extract_explanation(text: str) -> str:
    """Pull the plain-English explanation out of Claude's response."""
    match = re.search(r'EXPLANATION:\s*(.+?)(?=```|$)', text, re.DOTALL)
    if match:
        return match.group(1).strip()
    parts = text.split('```')
    return parts[0].strip() if parts else text.strip()


async def run_patch_agent(
    code:           str,
    root_cause:     str,
    language:       str  = "python",
    search_results: list = [],
    git_context:    list = [],   # ← added — git history from git_ops tool
) -> dict:
    """
    Generate a code fix for the identified bug.
    Routes to SMART model always (patch quality is critical).
    Returns a unified diff + plain-English explanation.
    """

    # ── model routing — patch always uses SMART ───────────────────────────────
    model = get_model_for_complexity(
        code=        code,
        error_type=  None,
        needs_patch= True,   # forces SMART regardless of code length
    )
    llm = get_llm("patch_agent", override_model=model)
    print(f"[patch_agent] model: {model}")

    # ── build context sections ────────────────────────────────────────────────
    search_context = ""
    if search_results:
        search_context = "\n\nRelevant solutions found online:\n" + "\n".join(
            f"- {s.get('title', '')}: {s.get('summary', '')[:200]}"
            for s in search_results[:3]
        )

    git_section = ""
    if git_context:
        git_section = "\n\nRecent git history for this file:\n" + "\n".join(
            f"- [{c.get('sha', '')}] {c.get('date', '')[:10]} "
            f"{c.get('author', '')}: {c.get('message', '')}"
            for c in git_context[:5]
        )

    prompt = f"""You are an expert {language} developer fixing a bug.

ORIGINAL CODE:
```{language}
{code}
```

ROOT CAUSE:
{root_cause}
{search_context}
{git_section}

Your task:
1. Fix the bug in the code above.
2. Return your response in EXACTLY this format:

EXPLANATION: <one sentence describing what you changed and why>

```diff
--- original
+++ fixed
@@ ... @@
<unified diff of the fix here>
```

Rules:
- Only change what is necessary to fix the bug
- Keep the same code style
- The diff must be valid unified diff format
- Lines removed start with -
- Lines added start with +
- Context lines (unchanged) start with a space
- Do not add imports or restructure the whole file"""

    try:
        response = await llm.ainvoke([HumanMessage(content=prompt)])
        raw = response.content

        diff        = extract_diff(raw)
        explanation = extract_explanation(raw)

        # Warn if diff looks empty — helps catch prompt failures early
        if not diff or ('+' not in diff and '-' not in diff):
            print(f"[patch_agent] WARNING: diff looks empty — raw response:\n{raw[:200]}")

        return {
            "agent_id":    "patch",
            "success":     True,
            "diff":        diff,
            "explanation": explanation,
            "model_used":  model,   # ← useful for debugging routing decisions
            "raw":         raw,
        }

    except Exception as e:
        print(f"[patch_agent] ERROR: {e}")
        return {
            "agent_id":    "patch",
            "success":     False,
            "diff":        "",
            "explanation": "",
            "model_used":  model if 'model' in locals() else "unknown",
            "error":       str(e),
        }