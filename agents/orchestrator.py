from typing import TypedDict, Annotated, List
from langgraph.graph import StateGraph, END
from langchain_anthropic import ChatAnthropic
from langchain_core.messages import HumanMessage, AIMessage
from langchain_core.callbacks import StdOutCallbackHandler
import operator, os, httpx
import asyncio
from tools.redis_publisher import publish_agent_event

from dotenv import load_dotenv
from agents.search_agent import run_search_agent
from agents.patch_agent import run_patch_agent
from agents.test_agent  import run_test_agent
load_dotenv()

class AgentState(TypedDict):
    messages:        Annotated[List, operator.add]
    user_request:    str
    root_cause:      str
    patch:           str
    done:            bool
    session_id:      str | None
    code:            str | None
    logs:            str | None
    language:        str
    images:          list
    modalities:      list | None
    search_results:  list | None
    sandbox_result:  dict | None
    patch_diff:      str | None   # ← new
    patch_explanation: str | None # ← new
    test_code:       str | None   # ← new
    tests_passed:    bool | None  # ← new
    test_output:     str | None   # ← new
    vision_result:     dict | None  # ← new — from Dev 1 vision agent
    code_analysis:     dict | None  # ← new — from Dev 1 code agent
    context_summary:   str | None

load_dotenv_once = __import__('dotenv').load_dotenv()

llm = ChatAnthropic(
    model="claude-sonnet-4-20250514",
    api_key=os.getenv("ANTHROPIC_API_KEY"),
    max_tokens=2048,
    verbose=False,
    callbacks=[StdOutCallbackHandler()],
)

async def call_router_node(state: AgentState) -> AgentState:
    sid = state.get("session_id") or "default-session"
    await publish_agent_event(sid, "router", "thinking", "Classifying input...")

    async with httpx.AsyncClient() as client:
        try:
            response = await client.post(
                "http://localhost:8001/route",
                json={
                    "session_id":   sid,
                    "user_message": state["user_request"],
                    "language":     state.get("language", "python"),
                    "code":         state.get("code"),
                    "logs":         state.get("logs"),
                    "images":       state.get("images", []),
                },
                timeout=30.0
            )
            router_result = response.json()
            modalities     = router_result.get("modalities_detected", [])
            vision_result  = router_result.get("vision_result")
            code_analysis  = router_result.get("code_result")
            context_summary= router_result.get("context", {}).get("summary", "")

        except httpx.ConnectError:
            print("[orchestrator] WARNING: router not reachable")
            modalities, vision_result, code_analysis, context_summary = [], None, None, ""

    await publish_agent_event(sid, "router", "result", f"Detected: {modalities}")

    return {
        **state,
        "modalities":      modalities,
        "vision_result":   vision_result,
        "code_analysis":   code_analysis,
        "context_summary": context_summary,
        "messages": state["messages"] + [
            AIMessage(content=f"Router: {modalities}, vision: {'yes' if vision_result else 'no'}")
        ]
    }
from agents.search_agent import run_search_agent

async def search_node(state: AgentState) -> AgentState:
    """Search for known solutions to the error."""
    print("[orchestrator] running search agent...")

    result = await run_search_agent(
        error_message=state["user_request"],
        language=state.get("language", "python"),
    )

    sources_summary = "\n".join(
        f"- {s['title']}: {s['url']}"
        for s in result.get("sources", [])
    )

    return {
        "search_results": result.get("sources", []),
        "messages": state["messages"] + [
            AIMessage(content=f"Search found:\n{sources_summary}")
        ],
    }

async def analyse_node(state: AgentState) -> AgentState:
    sid = state.get("session_id") or "default-session"
    await publish_agent_event(sid, "analyse", "thinking", "Identifying root cause...")

    # Build vision context from Dev 1's vision agent output
    vision_context = ""
    if state.get("vision_result"):
        v = state["vision_result"]
        vision_context = f"""
Screenshot analysis:
- Error type: {v.get('error_type')}
- Error summary: {v.get('error_summary')}
- File: {v.get('error_filename')} line {v.get('error_linenumber')}
- Stack trace: {v.get('stack_trace')}
- Vision confidence: {v.get('confidence')}"""

    # Build code analysis context from Dev 1's code agent
    code_context = ""
    if state.get("code_analysis"):
        c = state["code_analysis"]
        code_context = f"""
Static analysis:
- Suspicious line: {c.get('suspicious_line')}
- Error type: {c.get('error_type')}
- Lint issues: {c.get('lint_issues')}"""

    # Search context
    search_context = ""
    if state.get("search_results"):
        search_context = "\n\nRelevant solutions:\n" + "\n".join(
            f"- {s['title']}: {s['summary'][:200]}"
            for s in state["search_results"]
        )

    prompt = f"""You are a code debugging expert.

User message: {state['user_request']}
Language: {state.get('language', 'python')}
Code: {state.get('code') or 'not provided'}
Logs: {state.get('logs') or 'not provided'}
{vision_context}
{code_context}
{search_context}

Respond in this exact format:
ROOT_CAUSE: <one sentence>
CONFIDENCE: <0.0 to 1.0>
NEEDS_MORE_INFO: <yes/no>"""

    response = await llm.ainvoke([HumanMessage(content=prompt)])
    await publish_agent_event(sid, "analyse", "result", response.content[:150])
    return {"messages": [response], "root_cause": response.content, "done": True}

async def patch_node(state: AgentState) -> AgentState:
    """Generate a code fix based on the root cause."""
    print("[orchestrator] running patch agent...")

    if not state.get("code"):
        print("[orchestrator] no code provided — skipping patch")
        return {"patch_diff": None, "patch_explanation": None}

    result = await run_patch_agent(
        code=state["code"],
        root_cause=state["root_cause"],
        language=state.get("language", "python"),
        search_results=state.get("search_results") or [],
    )

    return {
        "patch_diff":       result.get("diff", ""),
        "patch_explanation": result.get("explanation", ""),
        "messages": state["messages"] + [
            AIMessage(content=f"Patch generated: {result.get('explanation','')}")
        ],
    }
async def test_node(state: AgentState) -> AgentState:
    """Generate and run tests to verify the patch."""
    print("[orchestrator] running test agent...")

    if not state.get("code") or not state.get("patch_diff"):
        print("[orchestrator] no code/patch — skipping tests")
        return {"tests_passed": None, "test_code": None, "test_output": None}

    # Build the fixed code by applying the patch manually
    # For now we ask Claude to reconstruct it from diff + original
    fixed_code = f"""# Fixed version (patch applied)
# Original: {state['code']}
# Patch:
{state['patch_diff']}"""

    result = await run_test_agent(
        original_code=state["code"],
        fixed_code=state["patch_diff"],  # agent reads both
        root_cause=state["root_cause"],
        language=state.get("language", "python"),
    )

    return {
        "tests_passed": result["tests_passed"],
        "test_code":    result["test_code"],
        "test_output":  result["stdout"],
        "messages": state["messages"] + [
            AIMessage(content=f"Tests {'passed' if result['tests_passed'] else 'failed'}: {result['stdout'][:200]}")
        ],
    }


def search_context_from(state: AgentState) -> str:
    if not state.get("search_results"):
        return ""
    return "\n\nRelevant search results:\n" + "\n".join(
        f"- {s['title']}: {s['summary']}"
        for s in state["search_results"]
    )

def router_node(state: AgentState) -> str:
    if state.get("done"):
        return "done"
    return "analyse"

async def parallel_node(state: AgentState) -> AgentState:
    """Run search agent and wait — analyse uses results."""
    sid = state.get("session_id") or "default"
    await publish_agent_event(sid, "search", "thinking", "Searching docs...")

    result = await run_search_agent(
        state["user_request"],
        state.get("language", "python")
    )
    await publish_agent_event(sid, "search", "result", f"Found {len(result.get('sources',[]))} results")
    return {"search_results": result.get("sources", [])}

def build_graph():
    graph = StateGraph(AgentState)

    graph.add_node("call_router", call_router_node)
    graph.add_node("search",      search_node)
    graph.add_node("analyse",     analyse_node)
    graph.add_node("patch",       patch_node)    # ← new
    graph.add_node("test",        test_node)     # ← new

    graph.set_entry_point("call_router")
    graph.add_edge("call_router", "search")
    graph.add_edge("search",      "analyse")
    graph.add_edge("analyse",     "patch")       # ← new
    graph.add_edge("patch",       "test")        # ← new
    graph.add_edge("test",        END)            # ← replaces conditional

    return graph.compile()

orchestrator = build_graph()