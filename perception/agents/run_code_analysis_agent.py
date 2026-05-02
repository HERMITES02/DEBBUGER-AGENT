import sys
import json
import os
from pathlib import Path
import tree_sitter_python as tspython
from tree_sitter import Language, Parser

sys.path.append(str(Path(__file__).resolve().parents[2]))

from shared.schema import DebugRequest, AgentMessage
from dotenv import load_dotenv
from anthropic import Anthropic, APIError, APITimeoutError
from redis import Redis
import subprocess

load_dotenv()

client = Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))

redis_client = Redis(
    host=os.getenv("REDIS_HOST", "localhost"),
    port=int(os.getenv("REDIS_PORT", 6379)),
    password=os.getenv("REDIS_PASSWORD", None),
    decode_responses=True
)

SYSTEM_PROMPT = """
You are a debugger agent.You are expert at code analysis, specialized in 
identifying bugs, errors and code quality issues.

You will receive:
- The original code submitted by the user
- Lint errors from Ruff (line numbers + error codes + messages)
- An AST summary from Tree-sitter (function names, structure)

Analyze all three and determine:
- What type of bug is this (ZeroDivisionError, TypeError, logic error etc.)
- Which function is affected
- How severe is it (high = crash, medium = wrong output, low = style issue)
- A brief explanation of why the bug is happening
- Your confidence in this analysis

you will give output in this json format:
{
  "bug_classification": "type of bug",
  "affected_functions": ["function1", "function2"],
  "severity": "high or medium or low",
  "explanation": "brief explanation of why bug occurs",
  "confidence": a float between 0.0 and 1.0
}

IMPORTANT: Return ONLY the JSON object. 
No explanation, no markdown, no backticks.

If no bugs are found, return JSON with null values ,
affected_functions as empty list [],
and confidence below 0.3.
"""

def setup_parser():
    PY_LANGUAGE = Language(tspython.language())
    parser = Parser(PY_LANGUAGE)
    return parser
parser = setup_parser() 

def run_ruff(code: str) -> str:
    temp_file = Path(os.getenv("TEMP", "C:/Windows/Temp")) / "temp_code.py"
    temp_file.write_text(code)

    result = subprocess.run(
        ["ruff", "check", str(temp_file), "--output-format", "text"],
        capture_output=True,
        text=True
    )
    temp_file.unlink(missing_ok=True)
    return result.stdout if result.stdout else "No lint errors found"

def run_treesitter(code:str):
    tree = parser.parse(code.encode("utf-8"))
    root = tree.root_node
    functions_list = []
    for node in root.children:
        if node.type == "function_definition":
            name_node = node.child_by_field_name("name")
            functions_list.append({
                "name": name_node.text.decode("utf-8"),
                "start_line": node.start_point[0],
                "end_line": node.end_point[0]
            })

    return {
    "total_lines": len(code.splitlines()),
    "functions": functions_list,
    "function_count": len(functions_list)
    }


def analyse_with_claude(ruff_output: str, ast_summary: dict, code: str) -> dict:
    
    try:
        response = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=500,
            system=SYSTEM_PROMPT,
            messages=[
                {
                "role": "user",
                "content": f"Here is the code:\n{code}\n\nRuff lint errors:\n{ruff_output}\n\nAST summary:\n{json.dumps(ast_summary)}"
                }
            ]
        )
        return json.loads(response.content[0].text)
    except (APIError, APITimeoutError) as e:
        print(f"Error communicating with Claude API: {e}")
        return {
        "bug_classification": None,
        "affected_functions": [],
        "severity": None,
        "explanation": "Claude API error",
        "confidence": 0.0
        }
        

async def run_code_analysis_agent(request: DebugRequest) -> dict:
    if not request.code:
        print("[run_code_analysis_agent] ⚠️ No code in request")
        return None
    
    ruff_output = run_ruff(request.code)
    ast_summary = run_treesitter(request.code)
    claude_result = analyse_with_claude(ruff_output, ast_summary, request.code)

    msg = AgentMessage(
        session_id=request.session_id,
        type="code_analysed",
        agent_id="code_analysis_agent",
        content= {
                "ruff_output": ruff_output,
                "ast_summary": ast_summary,
                "bug_classification": claude_result.get("bug_classification"),
                "affected_functions": claude_result.get("affected_functions"),
                "severity": claude_result.get("severity"),
                "explanation": claude_result.get("explanation")
            },
        confidence= claude_result["confidence"]
    )

    try:
        subscribers = redis_client.rpush(f"results:{request.session_id}:code", msg.model_dump_json())
        print(f"[code_analysis_agent] ✅ Published to Redis — {subscribers} subscribers listening")
    except Exception as e:
        print(f"[code_analysis_agent] ❌ Redis publish failed: {e}")

    return msg.model_dump()


if __name__ == "__main__":
    import asyncio
    
    test_request = DebugRequest(
        user_message="this crashes when i pass 0",
        code="def calc(a, b):\n    return a / b\n\nresult = calc(10, 0)",
        language="python",
        session_id="test-session-123"
    )
    
    result = asyncio.run(run_code_analysis_agent(test_request))
    print(result)