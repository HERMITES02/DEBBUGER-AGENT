from langchain_anthropic import ChatAnthropic
from langchain_core.messages import HumanMessage
from agents.model_router import get_model_for_agent
from tools.sandbox import execute_code
from dotenv import load_dotenv
import os, re

load_dotenv()



def extract_code_block(text: str) -> str:
    """Extract the first ```python block from Claude's response."""
    match = re.search(r'```(?:python)?\n(.*?)```', text, re.DOTALL)
    return match.group(1).strip() if match else text.strip()

async def generate_tests(
    original_code: str,
    fixed_code: str,
    root_cause: str,
    language: str = "python",
) -> str:
    """Ask Claude to write pytest tests for the fix."""
    prompt = f"""You are a {language} testing expert.

ORIGINAL BUGGY CODE:
```{language}
{original_code}
```

FIXED CODE:
```{language}
{fixed_code}
```

ROOT CAUSE OF BUG:
{root_cause}

Write pytest test cases that:
1. Test the fixed code works correctly
2. Test the edge case that caused the original bug
3. Test at least one happy path

Return ONLY a ```python code block containing the complete test file.
Include the fixed function definition at the top so tests are self-contained.
Use simple assert statements. No mocking needed."""
    
    response = await llm.ainvoke([HumanMessage(content=prompt)])
    llm = ChatAnthropic(
    model=      get_model_for_agent("test_agent"),   # → haiku
    api_key=    os.getenv("ANTHROPIC_API_KEY"),
    max_tokens= 512,
)
    return extract_code_block(response.content)

async def run_test_agent(
    original_code: str,
    fixed_code: str,
    root_cause: str,
    language: str = "python",
) -> dict:
    """
    Generate tests for the fix and run them in the E2B sandbox.
    Returns generated test code + sandbox execution result.
    """
    try:
        # Step 1: Generate test cases with Claude
        test_code = await generate_tests(
            original_code, fixed_code, root_cause, language
        )

        # Step 2: Run tests in E2B sandbox
        # Prepend pytest import since sandbox runs raw Python
        runnable = f"""
import sys

{test_code}

# Run all test functions
test_fns = [v for k, v in list(locals().items()) if k.startswith('test_')]
passed, failed = 0, 0
for fn in test_fns:
    try:
        fn()
        print(f"PASS: {{fn.__name__}}")
        passed += 1
    except Exception as e:
        print(f"FAIL: {{fn.__name__}} — {{e}}")
        failed += 1

print(f"\\nResults: {{passed}} passed, {{failed}} failed")
if failed > 0:
    sys.exit(1)
"""
        sandbox_result = await execute_code(runnable, language)

        return {
            "agent_id":      "test",
            "success":       sandbox_result["success"],
            "test_code":     test_code,
            "stdout":        sandbox_result["stdout"],
            "stderr":        sandbox_result["stderr"],
            "tests_passed":  "passed" in sandbox_result["stdout"],
        }

    except Exception as e:
        return {
            "agent_id":      "test",
            "success":       False,
            "test_code":     "",
            "stdout":        "",
            "stderr":        "",
            "tests_passed":  False,
            "error":         str(e),
        }

