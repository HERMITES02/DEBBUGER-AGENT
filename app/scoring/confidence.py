def calculate_confidence(state: dict) -> float:
    """
    Multi-factor confidence score.
    Each factor contributes a weighted score.
    Final score is 0.0 - 1.0.
    """
    score = 0.0
    factors = {}

    # Factor 1: Claude's own confidence from analyse_node (30%)
    root_cause = state.get("root_cause", "")
    try:
        import re
        match = re.search(r"CONFIDENCE:\s*([0-9.]+)", root_cause)
        claude_conf = float(match.group(1)) if match else 0.5
    except:
        claude_conf = 0.5
    score += claude_conf * 0.30
    factors["claude_analysis"] = claude_conf

    # Factor 2: Tests passed in sandbox (35% — strongest signal)
    if state.get("tests_passed") is True:
        score += 0.35
        factors["tests_passed"] = 1.0
    elif state.get("tests_passed") is False:
        score += 0.0
        factors["tests_passed"] = 0.0
    else:
        score += 0.15   # tests not run — partial credit
        factors["tests_passed"] = 0.5

    # Factor 3: Patch diff exists and is non-empty (15%)
    patch = state.get("patch_diff", "") or ""
    if "+" in patch and "-" in patch:
        score += 0.15
        factors["patch_quality"] = 1.0
    elif patch:
        score += 0.07
        factors["patch_quality"] = 0.5
    else:
        factors["patch_quality"] = 0.0

    # Factor 4: Search results found relevant sources (10%)
    sources = state.get("search_results") or []
    if len(sources) >= 2:
        score += 0.10
        factors["search_evidence"] = 1.0
    elif len(sources) == 1:
        score += 0.05
        factors["search_evidence"] = 0.5
    else:
        factors["search_evidence"] = 0.0

    # Factor 5: Vision agent high confidence on screenshot (10%)
    vision = state.get("vision_result") or {}
    vision_conf = vision.get("confidence", 0.0) if vision else 0.0
    if state.get("images"):   # only score if images were provided
        score += vision_conf * 0.10
        factors["vision_confidence"] = vision_conf
    else:
        score += 0.10   # no image expected — full credit
        factors["vision_confidence"] = 1.0

    final = round(min(score, 1.0), 2)
    print(f"[confidence] score={final} factors={factors}")
    return final