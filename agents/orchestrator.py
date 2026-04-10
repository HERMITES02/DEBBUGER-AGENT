from typing import TypedDict, Annotated, List
from langgraph.graph import StateGraph, END
from langchain_anthropic import ChatAnthropic
from langchain_core.messages import HumanMessage, AIMessage
import operator, os
import httpx

# 1. Define the agent state
class AgentState(TypedDict):
    messages: Annotated[List, operator.add]
    user_request: str
    root_cause: str
    patch: str
    done: bool

# 2. Init Claude
llm = ChatAnthropic(
    model="claude-sonnet-4-20250514",
    api_key=os.getenv("ANTHROPIC_API_KEY"),
    max_tokens=2048,
)

# 3. Node: analyse the bug
async def analyse_node(state: AgentState) -> AgentState:
    prompt = f"""You are a code debugging expert.
Analyse this bug report and identify the root cause.

Request: {state['user_request']}

Respond in this exact format:
ROOT_CAUSE: <one sentence explanation>
CONFIDENCE: <0.0 to 1.0>
NEEDS_MORE_INFO: <yes/no>"""
    response = await llm.ainvoke([HumanMessage(content=prompt)])
    return {
        "messages": [response],
        "root_cause": response.content,
        "done": True,
    }

# 4. Node: decide if we need more tools
def router_node(state: AgentState) -> str:
    # Simple router — always go to done for now
    # Week 2: add "search", "execute", "patch" routes
    if state.get("done"):
        return "done"
    return "analyse"

async def call_router_node(state: AgentState) -> AgentState:
    """First node — send request to Dev 1's input router."""
    async with httpx.AsyncClient() as client:
        response = await client.post(
            "http://localhost:8001/route",
            json={
                "session_id": state["session_id"],
                "user_message": state["user_request"],
                "language": state.get("language", "python"),
                "code": state.get("code"),
                "logs": state.get("logs"),
                "images": state.get("images", []),
            },
            timeout=30.0
        )
        router_result = response.json()

    return {
        **state,
        "modalities": router_result["modalities_detected"],
        "messages": state["messages"] + [
            AIMessage(content=f"Router detected: {router_result['modalities_detected']}")
        ]
    }

# 5. Build the graph
def build_graph():
    graph = StateGraph(AgentState)

    graph.add_node("call_router", call_router_node)   # NEW — first node
    graph.add_node("analyse", analyse_node)

    graph.set_entry_point("call_router")              # starts here now
    graph.add_edge("call_router", "analyse")          # then analyse

    graph.add_conditional_edges("analyse", router_node, {
        "done": END,
        "analyse": "analyse",
    })
    return graph.compile()

orchestrator = build_graph()