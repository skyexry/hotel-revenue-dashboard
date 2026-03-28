"""
Module 3: Dynamic Pricing Rule Engine
Reads monthly KPIs from kpi_data.json, applies occupancy-based pricing rules,
appends pricing_recommendations back into the same JSON file.

Rules:
  occupancy > 85%      → INCREASE  +15%
  60% ≤ occupancy ≤ 85% → HOLD      ±0%
  occupancy < 60%      → DECREASE  -10%
"""

import json
import os

# ── Paths ─────────────────────────────────────────────────────────────────────
BASE_DIR    = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUTPUT_PATH = os.path.join(BASE_DIR, "output", "kpi_data.json")

# ── Thresholds ────────────────────────────────────────────────────────────────
INCREASE_THRESHOLD = 85.0   # occupancy_rate > this → INCREASE
DECREASE_THRESHOLD = 60.0   # occupancy_rate < this → DECREASE

INCREASE_FACTOR = 1.15
DECREASE_FACTOR = 0.90


def apply_rules(monthly_kpis: list) -> list:
    recommendations = []

    for row in monthly_kpis:
        month         = row["month"]
        current_adr   = row["adr"]
        occupancy     = row["occupancy_rate"]
        total_revenue = row["total_revenue"]

        if occupancy > INCREASE_THRESHOLD:
            action                   = "INCREASE"
            recommended_adr          = round(current_adr * INCREASE_FACTOR, 2)
            expected_revenue_chg_pct = 15.0
            rationale                = f"Occupancy {occupancy:.1f}% > {INCREASE_THRESHOLD}% — strong demand, room to raise rates."

        elif occupancy >= DECREASE_THRESHOLD:
            action                   = "HOLD"
            recommended_adr          = round(current_adr, 2)
            expected_revenue_chg_pct = 0.0
            rationale                = f"Occupancy {occupancy:.1f}% within {DECREASE_THRESHOLD}–{INCREASE_THRESHOLD}% — balanced market, maintain pricing."

        else:
            action                   = "DECREASE"
            recommended_adr          = round(current_adr * DECREASE_FACTOR, 2)
            expected_revenue_chg_pct = -10.0
            rationale                = f"Occupancy {occupancy:.1f}% < {DECREASE_THRESHOLD}% — demand soft, stimulate bookings by lowering rates."

        revenue_delta = round(
            total_revenue * (expected_revenue_chg_pct / 100), 2
        )

        recommendations.append({
            "month":                      month,
            "current_adr":                round(current_adr, 2),
            "occupancy_rate":             round(occupancy, 2),
            "action":                     action,
            "recommended_adr":            recommended_adr,
            "adr_change_pct":             round((recommended_adr - current_adr) / current_adr * 100, 2) if current_adr else 0,
            "expected_revenue_change_pct": expected_revenue_chg_pct,
            "estimated_revenue_delta":    revenue_delta,
            "rationale":                  rationale,
        })

    return recommendations


def main():
    print(f"Reading: {OUTPUT_PATH}")
    with open(OUTPUT_PATH) as f:
        data = json.load(f)

    monthly_kpis = data["monthly_kpis"]
    print(f"  Monthly KPI periods: {len(monthly_kpis)}")

    recommendations = apply_rules(monthly_kpis)

    # ── Summary ───────────────────────────────────────────────────────────────
    action_counts = {"INCREASE": 0, "HOLD": 0, "DECREASE": 0}
    for r in recommendations:
        action_counts[r["action"]] += 1

    print()
    print("  Pricing recommendations:")
    print(f"    INCREASE  : {action_counts['INCREASE']} months")
    print(f"    HOLD      : {action_counts['HOLD']} months")
    print(f"    DECREASE  : {action_counts['DECREASE']} months")
    print()
    print(f"  {'Month':<10} {'Occ%':>6}  {'Curr ADR':>9}  {'Rec ADR':>8}  {'Action'}")
    print(f"  {'-'*10} {'-'*6}  {'-'*9}  {'-'*8}  {'-'*8}")
    for r in recommendations:
        print(
            f"  {r['month']:<10} {r['occupancy_rate']:>5.1f}%  "
            f"${r['current_adr']:>8.2f}  ${r['recommended_adr']:>7.2f}  {r['action']}"
        )

    # ── Write back ────────────────────────────────────────────────────────────
    data["pricing_recommendations"] = recommendations
    with open(OUTPUT_PATH, "w") as f:
        json.dump(data, f, indent=2)

    print()
    print("=" * 60)
    print(f"  pricing_recommendations written → {OUTPUT_PATH}")
    print("=" * 60)


if __name__ == "__main__":
    main()
