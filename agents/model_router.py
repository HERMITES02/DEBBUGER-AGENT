"""
agents/model_router.py

Central model routing for all agents.
Controls which LLM each agent uses based on task complexity.
Change MODEL_FAST / MODEL_SMART / MODEL_VISION in .env to swap models
without touching any agent code.
"""

import os
from enum import Enum
from langchain_anthropic import ChatAnthropic
from dotenv import load_dotenv

load_dotenv()


class ModelTier(Enum):
    FAST   = "fast"    # cheap + quick — classification, formatting, summaries
    SMART  = "smart"   # expensive — reasoning, code generation, complex analysis
    VISION = "vision"  # multimodal — needs image support


# ── Model registry — controlled entirely by .env ──────────────────────────────
MODEL_MAP = {
    ModelTier.FAST:   os.getenv("MODEL_FAST",   "claude-haiku-4-5"),
    ModelTier.SMART:  os.getenv("MODEL_SMART",  "claude-sonnet-4-20250514"),
    ModelTier.VISION: os.getenv("MODEL_VISION", "claude-sonnet-4-20250514"),
}

# ── Max tokens per tier — haiku doesn't need 2048 for simple tasks ────────────
MAX_TOKENS_MAP = {
    ModelTier.FAST:   512,
    ModelTier.SMART:  1024,
    ModelTier.VISION: 500,
}

# ── Agent → tier mapping ───────────────────────────────────────────────────────
# Only analyse_node and patch_agent genuinely need SMART.
# Everything else is formatting, classification, or structured extraction.
AGENT_TIERS: dict[str, ModelTier] = {
    "input_router":          ModelTier.FAST,
    "vision_agent":          ModelTier.VISION,
    "code_analysis_agent":   ModelTier.FAST,
    "context_builder_agent": ModelTier.FAST,
    "search_agent":          ModelTier.FAST,
    "analyse_node":          ModelTier.SMART,   # root cause reasoning
    "patch_agent":           ModelTier.SMART,   # code generation quality matters
    "test_agent":            ModelTier.FAST,    # test templates are formulaic
    "score_node":            ModelTier.FAST,
}


def get_model_for_agent(agent_name: str) -> str:
    """Return the configured model string for a named agent."""
    tier = AGENT_TIERS.get(agent_name, ModelTier.FAST)
    model = MODEL_MAP[tier]
    print(f"[model_router] {agent_name} → {tier.value} → {model}")
    return model


def get_model_for_complexity(
    code:        str | None,
    error_type:  str | None,
    needs_patch: bool = False,
) -> str:
    """
    Dynamic routing based on problem complexity.
    Called by analyse_node to decide model before the LLM call.

    Rules (in priority order):
    1. Patch generation always → SMART (quality critical)
    2. Known simple errors + short code → FAST
    3. Long code (>500 chars) → SMART
    4. Unknown error type → SMART (can't risk misdiagnosis)
    5. Default → SMART
    """
    # Rule 1: patch always needs best model
    if needs_patch:
        model = MODEL_MAP[ModelTier.SMART]
        print(f"[model_router] patch → SMART → {model}")
        return model

    # Rule 2: simple well-known errors on short code → FAST
    simple_errors = {
        "SyntaxError", "IndentationError", "NameError",
        "ImportError", "ModuleNotFoundError", "ZeroDivisionError",
        "TypeError", "AttributeError", "KeyError", "IndexError",
        "ValueError", "FileNotFoundError", "PermissionError",
    }
    is_simple_error = error_type and any(e in error_type for e in simple_errors)
    is_short_code   = code and len(code.strip()) < 200

    if is_simple_error and is_short_code:
        model = MODEL_MAP[ModelTier.FAST]
        print(f"[model_router] simple+short → FAST → {model}")
        return model

    # Rule 3: long code → SMART (needs more context window + reasoning)
    if code and len(code.strip()) > 500:
        model = MODEL_MAP[ModelTier.SMART]
        print(f"[model_router] long code ({len(code)} chars) → SMART → {model}")
        return model

    # Rule 4: unknown error type with code → SMART
    if code and not error_type:
        model = MODEL_MAP[ModelTier.SMART]
        print(f"[model_router] unknown error → SMART → {model}")
        return model

    # Rule 5: default SMART for safety
    model = MODEL_MAP[ModelTier.SMART]
    print(f"[model_router] default → SMART → {model}")
    return model


def get_llm(
    agent_name:     str,
    override_model: str | None = None,
) -> ChatAnthropic:

    # ── re-read key at call time, not at import time ──────────────────────────
    api_key = os.getenv("ANTHROPIC_API_KEY")

    if not api_key:
        raise ValueError(
            f"[model_router] ANTHROPIC_API_KEY is not set. "
            f"Check your .env file is in the project root and load_dotenv() is called."
        )

    if override_model:
        model = override_model
        tier  = ModelTier.SMART if model == MODEL_MAP[ModelTier.SMART] else ModelTier.FAST
    else:
        tier  = AGENT_TIERS.get(agent_name, ModelTier.FAST)
        model = MODEL_MAP[tier]

    max_tokens = MAX_TOKENS_MAP.get(tier, 512)

    print(f"[model_router] get_llm({agent_name}) → {model} (max_tokens={max_tokens})")

    return ChatAnthropic(
        model=      model,
        api_key=    api_key,    # ← explicit, never None
        max_tokens= max_tokens,
    )

def log_routing_summary(agent_name: str, model: str, reason: str = "") -> None:
    """Optional — call this to log routing decisions to console."""
    print(f"[model_router] {agent_name:30s} → {model} {f'({reason})' if reason else ''}")