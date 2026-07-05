from typing import TypedDict, Annotated, List
from langgraph.graph import StateGraph, END
from langchain_anthropic import ChatAnthropic
from langchain_core.messages import HumanMessage, AIMessage
import operator, os, httpx, re
import asyncio
from tools.redis_publisher import publish_agent_event
from agents.model_router import get_model_for_agent, get_model_for_complexity, get_llm

from dotenv import load_dotenv
from agents.search_agent import run_search_agent
from agents.patch_agent import run_patch_agent
from agents.test_agent import run_test_agent
load_dotenv()


class AgentState(TypedDict):
    messages:          Annotated[List, operator.add]
    user_request:      str
    root_cause:        str
    patch:             str
    done:              bool
    session_id:        str | None
    code:              str | None
    logs:              str | None
    language:          str
    images:            list
    modalities:        list | None
    search_results:    list | None
    sandbox_result:    dict | None
    patch_diff:        str | None
    patch_explanation: str | None
    test_code:         str | None
    tests_passed:      bool | None
    test_output:       str | None
    vision_result:     dict | None
    code_analysis:     dict | None
    context_summary:   str | None
    user_id:           str | None
    user_context:      str | None
    confidence:        float | None


# ── confidence scoring ────────────────────────────────────────────────────────

def calculate_confidence(state: dict) -> float:
    score   = 0.0
    factors = {}
    has_images = bool(state.get("images"))

    # Factor 1: Claude self-reported confidence (30%)
    root_cause = state.get("root_cause", "")
    try:
        match = re.search(r"CONFIDENCE:\s*([0-9.]+)", root_cause)
        claude_conf = float(match.group(1)) if match else 0.5
        claude_conf = max(0.0, min(1.0, claude_conf))
    except Exception:
        claude_conf = 0.5
    score += claude_conf * 0.30
    factors["claude_analysis"] = claude_conf

    # Factor 2: Tests passed (25%)
    has_code  = bool(state.get("code"))
    has_patch = bool(state.get("patch_diff"))
    if state.get("tests_passed") is True:
        score += 0.25
        factors["tests_passed"] = 1.0
    elif state.get("tests_passed") is False:
        score += 0.05   # partial credit — sandbox may have issues
        factors["tests_passed"] = 0.0
    else:
        if not has_code:
            score += 0.10
        elif not has_patch:
            score += 0.05
        else:
            score += 0.12
        factors["tests_passed"] = "skipped"

    # Factor 3: Patch quality (20% or 25%)
    patch        = state.get("patch_diff", "") or ""
    patch_weight = 0.25 if not has_images else 0.20
    # Skip diff headers (--- and +++) when counting real changes
    real_lines   = [l for l in patch.splitlines()
                    if not l.startswith("---") and not l.startswith("+++")
                    and not l.startswith("@@")]
    added_lines   = len([l for l in real_lines if l.startswith("+")])
    removed_lines = len([l for l in real_lines if l.startswith("-")])
    changed_lines = added_lines + removed_lines
    if changed_lines >= 2:
        score += patch_weight
        factors["patch_quality"] = 1.0
    elif changed_lines >= 1:
        score += patch_weight * 0.7
        factors["patch_quality"] = 0.7
    else:
        factors["patch_quality"] = 0.0

    # Factor 4: Search evidence (5%)
    sources = state.get("search_results") or []
    if len(sources) >= 2:
        score += 0.05
        factors["search_evidence"] = 1.0
    elif len(sources) == 1:
        score += 0.03
        factors["search_evidence"] = 0.5
    else:
        score += 0.02   # partial credit — no search ≠ wrong answer
        factors["search_evidence"] = 0.2

    # Factor 5: Vision confidence (5%, only with images)
    if has_images:
        vision      = state.get("vision_result") or {}
        vision_conf = float(vision.get("confidence", 0.0))
        vision_conf = max(0.0, min(1.0, vision_conf))
        score += vision_conf * 0.05
        factors["vision_confidence"] = vision_conf
    else:
        factors["vision_confidence"] = "n/a"

    # Factor 6: Root cause quality (10%)
    rc_text  = ""
    rc_match = re.search(r"ROOT_CAUSE:\s*(.+)", root_cause)
    if rc_match:
        rc_text = rc_match.group(1).strip()
    vague_phrases = {"unknown", "unclear", "not provided", "n/a", "error occurred", "none"}
    is_vague = len(rc_text) < 15 or any(p in rc_text.lower() for p in vague_phrases)
    if rc_text and not is_vague:
        score += 0.10
        factors["root_cause_quality"] = 1.0
    elif rc_text:
        score += 0.04
        factors["root_cause_quality"] = 0.4
    else:
        factors["root_cause_quality"] = 0.0

    # Cross-penalty: confident but tests failed (reduced from 0.4 to 0.2)
    if claude_conf > 0.8 and state.get("tests_passed") is False:
        penalty = (claude_conf - 0.8) * 0.2
        score  -= penalty
        factors["corroboration_penalty"] = -round(penalty, 2)
        print(f"[confidence] penalty applied: -{penalty:.2f}")

    final = round(max(0.0, min(score, 1.0)), 2)
    print(f"[confidence] final={final} factors={factors}")
    return final


def _apply_patch_to_code(original_code: str, patch_diff: str) -> str:
    if not original_code or not patch_diff:
        return original_code
    try:
        import re
        original_lines = original_code.splitlines()
        result_lines   = list(original_lines)

        current_idx = 0
        for line in patch_diff.splitlines():
            if line.startswith("---") or line.startswith("+++"):
                continue
            if line.startswith("@@"):
                m = re.match(r"@@\s*-(\d+)", line)
                if m:
                    orig_start = int(m.group(1))
                    current_idx = max(0, orig_start - 1)
                continue
            if line.startswith("-"):
                target = line[1:]
                if current_idx < len(result_lines) and result_lines[current_idx].rstrip() == target.rstrip():
                    result_lines.pop(current_idx)
                else:
                    found = -1
                    for i, l in enumerate(result_lines):
                        if l.rstrip() == target.rstrip():
                            found = i
                            break
                    if found != -1:
                        result_lines.pop(found)
                        current_idx = found
            elif line.startswith("+"):
                result_lines.insert(current_idx, line[1:])
                current_idx += 1
            elif line.startswith(" ") or not line.startswith(("-", "+", "@")):
                target = line[1:] if line.startswith(" ") else line
                if current_idx < len(result_lines) and result_lines[current_idx].rstrip() == target.rstrip():
                    current_idx += 1
                else:
                    for i in range(current_idx, len(result_lines)):
                        if result_lines[i].rstrip() == target.rstrip():
                            current_idx = i + 1
                            break

        return "\n".join(result_lines)
    except Exception as e:
        print(f"[orchestrator] patch apply failed: {e} — using original")
        return original_code


# ── graph nodes ───────────────────────────────────────────────────────────────

async def call_router_node(state: AgentState) -> AgentState:
    sid = state.get("session_id") or "default-session"
    await publish_agent_event(sid, "router", "thinking", "Classifying input modalities...")

    modalities      = [{"type": "code", "language": state.get("language", "python")}]
    vision_result   = None
    code_analysis   = None
    context_summary = ""

    # Build router URL — Render's fromService gives bare hostname, local dev gives full URL
    _router_raw = os.getenv("ROUTER_SERVICE_URL", "http://localhost:8001")
    _router_base = _router_raw if "://" in _router_raw else f"https://{_router_raw}"

    async with httpx.AsyncClient() as client:
        try:
            response = await client.post(
                _router_base + "/route",
                json={
                    "session_id":   sid,
                    "user_message": state["user_request"],
                    "language":     state.get("language", "python"),
                    "code":         state.get("code"),
                    "logs":         state.get("logs"),
                    "images":       state.get("images", []),
                },
                timeout=90.0,
            )

            if response.status_code == 200:
                router_result = response.json()
                print(f"[orchestrator] router_result keys: {list(router_result.keys()) if router_result else 'None'}")

                if router_result is not None:
                    modalities    = router_result.get("modalities_detected", modalities)

                    # ── vision_result now top-level from fixed router ──────────
                    vision_result = router_result.get("vision_result")
                    code_analysis = router_result.get("code_result")

                    # ── context summary from context_builder output ────────────
                    context_raw = router_result.get("context")
                    if isinstance(context_raw, dict):
                        content = context_raw.get("content", {})
                        if isinstance(content, dict):
                            context_summary = (
                                content.get("assembled_prompt", "") or
                                content.get("bug_summary", "") or ""
                            )

                    print(f"[orchestrator] vision_result: {vision_result}")
                    print(f"[orchestrator] code_analysis: {code_analysis}")
                    print(f"[orchestrator] context_summary: {context_summary[:80] if context_summary else 'empty'}")
            else:
                print(f"[orchestrator] router returned {response.status_code}")

        except httpx.ConnectError:
            print("[orchestrator] WARNING: router not reachable — using defaults")
        except httpx.TimeoutException:
            print("[orchestrator] WARNING: router timed out — using defaults")
        except Exception as e:
            print(f"[orchestrator] router error: {type(e).__name__}: {e}")

    await publish_agent_event(sid, "router", "result", f"Detected: {modalities}")

    return {
        **state,
        "modalities":      modalities,
        "vision_result":   vision_result,
        "code_analysis":   code_analysis,
        "context_summary": context_summary,
        "messages": state["messages"] + [
            AIMessage(content=f"Router: {modalities}, vision: {'yes — ' + str(vision_result.get('error_type')) if vision_result else 'no'}")
        ],
    }

async def search_node(state: AgentState) -> AgentState:
    sid = state.get("session_id") or "default-session"
    await publish_agent_event(sid, "search", "thinking", "Searching for known solutions...")
    print("[orchestrator] running search agent...")

    result = await run_search_agent(
        error_message=state["user_request"],
        language=state.get("language", "python"),
    )

    sources_summary = "\n".join(
        f"- {s['title']}: {s['url']}"
        for s in result.get("sources", [])
    )
    await publish_agent_event(
        sid, "search", "result",
        f"Found {len(result.get('sources', []))} sources"
    )

    return {
        "search_results": result.get("sources", []),
        "messages": state["messages"] + [
            AIMessage(content=f"Search:\n{sources_summary}")
        ],
    }


async def analyse_node(state: AgentState) -> AgentState:
    sid = state.get("session_id") or "default-session"
    await publish_agent_event(sid, "analyse", "thinking", "Identifying root cause...")

    # ── model routing: pick model based on problem complexity ─────────────────
    error_type = None
    if state.get("code_analysis"):
        error_type = state["code_analysis"].get("bug_classification")

    model = get_model_for_complexity(
        code=        state.get("code"),
        error_type=  error_type,
        needs_patch= False,
    )
    print(f"[analyse_node] model selected: {model} (error_type={error_type})")

    # ── get routed LLM instance ───────────────────────────────────────────────
    llm = get_llm("analyse_node", override_model=model)

    # ── build prompt ──────────────────────────────────────────────────────────
    vision_section = ""
    if state.get("vision_result"):
        v = state["vision_result"]
        vision_section = f"""
Screenshot analysis (extracted by vision agent):
- Error type: {v.get('error_type')}
- Error summary: {v.get('error_summary')}
- File: {v.get('error_filename')} line {v.get('error_linenumber')}
- Stack trace: {v.get('stack_trace')}
- Vision confidence: {v.get('confidence')}

Use this vision data as the PRIMARY source if no code is provided."""

    code_context = ""
    if state.get("code_analysis"):
        c = state["code_analysis"]
        code_context = f"""
Static analysis:
- Suspicious line: {c.get('suspicious_line')}
- Error type: {c.get('error_type')}
- Lint issues: {c.get('lint_issues')}"""

    search_context = ""
    if state.get("search_results"):
        search_context = "\n\nRelevant solutions:\n" + "\n".join(
            f"- {s['title']}: {s.get('summary', '')[:200]}"
            for s in state["search_results"]
        )

    user_context = ""
    if state.get("user_context"):
        user_context = f"\n\nUser's recent debug history:\n{state['user_context']}"

    # In analyse_node
    image_note = ""
    if state.get("images") and not state.get("vision_result"):
        image_note = "\nNote: User submitted a screenshot but vision extraction returned no data. Ask user to also paste the code as text."

    prompt = f"""You are a code debugging expert.

    User message: {state['user_request']}
    Language: {state.get('language', 'python')}
    Code: {(state.get('code') or 'not provided — user submitted a screenshot')[:800]}
    Logs: {(state.get('logs') or 'not provided')[:300]}
    {vision_section}
    {image_note}
    {code_context}
    {search_context}
    {user_context}

    Respond in this EXACT format:
    ROOT_CAUSE: <one clear sentence>
    CONFIDENCE: <0.0 to 1.0>
    NEEDS_MORE_INFO: <yes/no>
    FIX_APPROACH: <one sentence>"""

    response = await llm.ainvoke([HumanMessage(content=prompt)])
    await publish_agent_event(sid, "analyse", "result", response.content[:150])

    return {
        "messages":   [response],
        "root_cause": response.content,
        "done":       True,
    }


async def patch_node(state: AgentState) -> AgentState:
    sid = state.get("session_id") or "default-session"
    await publish_agent_event(sid, "patch", "thinking", "Generating fix...")
    print("[orchestrator] running patch agent...")

    if not state.get("code"):
        print("[orchestrator] no code — skipping patch")
        await publish_agent_event(sid, "patch", "result", "No code to patch")
        return {"patch_diff": None, "patch_explanation": None}

    result = await run_patch_agent(
        code=           state["code"],
        root_cause=     state["root_cause"],
        language=       state.get("language", "python"),
        search_results= state.get("search_results") or [],
    )

    await publish_agent_event(
        sid, "patch", "result",
        result.get("explanation", "")[:100]
    )

    return {
        "patch_diff":        result.get("diff", ""),
        "patch_explanation": result.get("explanation", ""),
        "messages": state["messages"] + [
            AIMessage(content=f"Patch: {result.get('explanation', '')}")
        ],
    }


async def test_node(state: AgentState) -> AgentState:
    sid = state.get("session_id") or "default-session"
    await publish_agent_event(sid, "test", "thinking", "Running tests in sandbox...")
    print("[orchestrator] running test agent...")

    if not state.get("code") or not state.get("patch_diff"):
        print("[orchestrator] no code/patch — skipping tests")
        await publish_agent_event(sid, "test", "result", "Skipped — no patch")
        return {"tests_passed": None, "test_code": None, "test_output": None}

    fixed_code = _apply_patch_to_code(state["code"], state["patch_diff"])

    result = await run_test_agent(
        original_code= state["code"],
        fixed_code=    fixed_code,
        root_cause=    state["root_cause"],
        language=      state.get("language", "python"),
    )

    passed = result["tests_passed"]
    await publish_agent_event(
        sid, "test", "result",
        f"{'PASSED' if passed else 'FAILED'}: {result['stdout'][:80]}"
    )

    return {
        "tests_passed": passed,
        "test_code":    result["test_code"],
        "test_output":  result["stdout"],
        "messages": state["messages"] + [
            AIMessage(content=f"Tests {'passed' if passed else 'failed'}: {result['stdout'][:200]}")
        ],
    }


async def score_node(state: AgentState) -> AgentState:
    sid        = state.get("session_id") or "default-session"
    confidence = calculate_confidence(state)
    await publish_agent_event(
        sid, "test", "result",
        f"Confidence: {int(confidence * 100)}%"
    )
    return {"confidence": confidence}


# ── graph ─────────────────────────────────────────────────────────────────────

def build_graph():
    graph = StateGraph(AgentState)

    graph.add_node("call_router", call_router_node)
    graph.add_node("search",      search_node)
    graph.add_node("analyse",     analyse_node)
    graph.add_node("patch",       patch_node)
    graph.add_node("test",        test_node)
    graph.add_node("score",       score_node)

    graph.set_entry_point("call_router")
    graph.add_edge("call_router", "search")
    graph.add_edge("search",      "analyse")
    graph.add_edge("analyse",     "patch")
    graph.add_edge("patch",       "test")
    graph.add_edge("test",        "score")
    graph.add_edge("score",       END)

    return graph.compile()

orchestrator = build_graph()