"""
Module 2: KPI Analysis
Reads hotel.db, computes all core metrics, writes output/kpi_data.json.
"""

import json
import os
import sqlite3

import numpy as np
import pandas as pd
from sklearn.linear_model import LinearRegression

# ── Paths ─────────────────────────────────────────────────────────────────────
BASE_DIR    = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH     = os.path.join(BASE_DIR, "data", "hotel.db")
OUTPUT_PATH = os.path.join(BASE_DIR, "output", "kpi_data.json")

MONTH_ORDER = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
]


# ── Load data ─────────────────────────────────────────────────────────────────
def load_df() -> pd.DataFrame:
    conn = sqlite3.connect(DB_PATH)
    df = pd.read_sql_query("SELECT * FROM bookings", conn)
    conn.close()
    # year-month label for grouping, e.g. "2015-07"
    df["ym"] = df["arrival_date"].str[:7]
    return df


# ── 1. Monthly KPIs ───────────────────────────────────────────────────────────
def compute_monthly_kpis(df: pd.DataFrame) -> list:
    groups = df.groupby("ym")

    records = []
    for ym, g in groups:
        total_bookings    = len(g)
        canceled          = g["is_canceled"].sum()
        cancellation_rate = canceled / total_bookings if total_bookings else 0
        occupancy_rate    = (1 - cancellation_rate) * 100

        completed         = g[g["is_canceled"] == 0]
        n_completed       = len(completed)
        adr_mean          = float(completed["adr"].mean()) if n_completed else 0.0
        total_revenue     = float(completed["total_revenue"].sum())

        # RevPAR = total revenue / number of non-canceled bookings
        revpar = total_revenue / n_completed if n_completed else 0.0

        records.append({
            "month":             ym,
            "total_bookings":    int(total_bookings),
            "canceled":          int(canceled),
            "cancellation_rate": round(cancellation_rate * 100, 2),   # %
            "occupancy_rate":    round(occupancy_rate, 2),             # %
            "adr":               round(adr_mean, 2),
            "total_revenue":     round(total_revenue, 2),
            "revpar":            round(revpar, 2),
        })

    records.sort(key=lambda r: r["month"])
    return records


# ── 2. Channel analysis ───────────────────────────────────────────────────────
def compute_channel_analysis(df: pd.DataFrame) -> list:
    records = []
    for channel, g in df.groupby("distribution_channel"):
        total     = len(g)
        canceled  = g["is_canceled"].sum()
        completed = g[g["is_canceled"] == 0]
        records.append({
            "channel":           channel,
            "order_count":       int(total),
            "avg_adr":           round(float(completed["adr"].mean()), 2) if len(completed) else 0.0,
            "total_revenue":     round(float(completed["total_revenue"].sum()), 2),
            "cancellation_rate": round(canceled / total * 100, 2) if total else 0.0,
        })
    records.sort(key=lambda r: r["order_count"], reverse=True)
    return records


# ── 3. Room-type heatmap (reserved_room_type × month) ────────────────────────
def compute_room_type_heatmap(df: pd.DataFrame) -> list:
    records = []
    for (room, ym), g in df.groupby(["reserved_room_type", "ym"]):
        total     = len(g)
        canceled  = g["is_canceled"].sum()
        completed = g[g["is_canceled"] == 0]
        records.append({
            "room_type":         room,
            "month":             ym,
            "avg_adr":           round(float(completed["adr"].mean()), 2) if len(completed) else 0.0,
            "occupancy_rate":    round((1 - canceled / total) * 100, 2) if total else 0.0,
            "booking_count":     int(total),
        })
    records.sort(key=lambda r: (r["room_type"], r["month"]))
    return records


# ── 4. Price elasticity ───────────────────────────────────────────────────────
def compute_price_elasticity(monthly_kpis: list) -> dict:
    adr_vals  = np.array([r["adr"]           for r in monthly_kpis]).reshape(-1, 1)
    occ_vals  = np.array([r["occupancy_rate"] for r in monthly_kpis])

    model = LinearRegression()
    model.fit(adr_vals, occ_vals)
    r2    = model.score(adr_vals, occ_vals)

    return {
        "coefficient": round(float(model.coef_[0]), 6),   # % occupancy change per $1 ADR
        "intercept":   round(float(model.intercept_), 4),
        "r_squared":   round(float(r2), 4),
        "interpretation": (
            f"For every $1 increase in ADR, occupancy rate changes by "
            f"{model.coef_[0]:.4f} percentage points (R²={r2:.4f})."
        ),
    }


# ── Main ──────────────────────────────────────────────────────────────────────
def main():
    print(f"Loading data from: {DB_PATH}")
    df = load_df()
    print(f"  Rows loaded: {len(df):,}")

    print("  Computing monthly KPIs …")
    monthly_kpis = compute_monthly_kpis(df)

    print("  Computing channel analysis …")
    channel_analysis = compute_channel_analysis(df)

    print("  Computing room-type heatmap …")
    room_type_heatmap = compute_room_type_heatmap(df)

    print("  Computing price elasticity …")
    price_elasticity = compute_price_elasticity(monthly_kpis)

    result = {
        "monthly_kpis":       monthly_kpis,
        "channel_analysis":   channel_analysis,
        "room_type_heatmap":  room_type_heatmap,
        "price_elasticity":   price_elasticity,
        "pricing_recommendations": [],   # filled by Module 3
    }

    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
    with open(OUTPUT_PATH, "w") as f:
        json.dump(result, f, indent=2)

    print()
    print("=" * 60)
    print(f"  Monthly KPI periods  : {len(monthly_kpis)}")
    print(f"  Distribution channels: {len(channel_analysis)}")
    print(f"  Heatmap cells        : {len(room_type_heatmap)}")
    print(f"  Price elasticity β   : {price_elasticity['coefficient']}")
    print(f"  Price elasticity R²  : {price_elasticity['r_squared']}")
    print(f"  Output               : {OUTPUT_PATH}")
    print("=" * 60)


if __name__ == "__main__":
    main()
