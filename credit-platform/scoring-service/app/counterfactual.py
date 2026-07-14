"""Training-anchored, mutable-field-only counterfactual candidate generation."""
from __future__ import annotations

import json
from itertools import product
from pathlib import Path
from typing import Any


MUTABLE_FIELDS = ("term_months", "gr_appv", "sba_appv")
REFERENCE_PATH = Path(__file__).resolve().parent / "artifacts" / "counterfactual_reference.json"


def load_reference() -> tuple[dict[str, Any], str]:
    if REFERENCE_PATH.exists():
        return json.loads(REFERENCE_PATH.read_text(encoding="utf-8")), "SBA_TRAINING_SPLIT_PROFILE"
    return {
        "term_months": {"values": [12, 36, 60, 84, 120, 180, 240, 300]},
        "gr_appv": {"quantiles": []},
        "sba_guar_ratio": {"quantiles": [0.5, 0.75, 0.8, 0.85, 0.9]},
    }, "DOMAIN_GRID_FALLBACK"


def build_candidates(raw: dict[str, Any], allowed_fields: list[str]) -> tuple[list[dict[str, Any]], str]:
    invalid = sorted(set(allowed_fields) - set(MUTABLE_FIELDS))
    if invalid:
        raise ValueError(f"fields are not mutable: {invalid}")

    reference, source = load_reference()
    original_term = int(raw["term_months"])
    original_gross = float(raw["gr_appv"])
    original_sba = float(raw["sba_appv"])
    original_ratio = original_sba / original_gross

    term_values = [original_term]
    if "term_months" in allowed_fields:
        term_values.extend(int(round(v)) for v in reference.get("term_months", {}).get("values", []))
        term_values = _unique(v for v in term_values if 1 <= v <= 600)

    gross_values = [original_gross]
    if "gr_appv" in allowed_fields:
        training_amounts = reference.get("gr_appv", {}).get("quantiles", [])
        gross_values.extend(float(v) for v in training_amounts if 0 < float(v) < original_gross)
        if source == "DOMAIN_GRID_FALLBACK":
            gross_values.extend(original_gross * factor for factor in (0.9, 0.8, 0.7, 0.6, 0.5))
        gross_values = _unique(round(v, 2) for v in gross_values if v > 0)

    ratio_values = [original_ratio]
    if "sba_appv" in allowed_fields:
        ratio_values.extend(float(v) for v in reference.get("sba_guar_ratio", {}).get("quantiles", []))
        ratio_values = _unique(round(v, 4) for v in ratio_values if 0 <= v <= 1)

    candidates: list[dict[str, Any]] = []
    seen: set[tuple[int, float, float]] = set()
    for term, gross, ratio in product(term_values, gross_values, ratio_values):
        candidate = dict(raw)
        candidate["term_months"] = int(term)
        candidate["gr_appv"] = float(gross)
        candidate["sba_appv"] = round(float(gross) * ratio, 2) if "sba_appv" in allowed_fields else original_sba
        if candidate["sba_appv"] > candidate["gr_appv"]:
            continue
        key = (candidate["term_months"], candidate["gr_appv"], candidate["sba_appv"])
        if key in seen:
            continue
        seen.add(key)
        candidates.append(candidate)
    return candidates, source


def describe_changes(original: dict[str, Any], candidate: dict[str, Any], allowed_fields: list[str]) -> list[dict[str, Any]]:
    changes: list[dict[str, Any]] = []
    for field in allowed_fields:
        before = float(original[field])
        after = float(candidate[field])
        if abs(before - after) < 1e-9:
            continue
        changes.append({
            "field": field,
            "from_value": before,
            "to_value": after,
            "percent_change": round(((after - before) / before) * 100, 2) if before else None,
        })
    return changes


def change_distance(original: dict[str, Any], candidate: dict[str, Any], fields: list[str]) -> float:
    return sum(
        abs(float(candidate[field]) - float(original[field])) / max(abs(float(original[field])), 1.0)
        for field in fields
    )


def _unique(values):
    return list(dict.fromkeys(values))
