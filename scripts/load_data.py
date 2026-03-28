"""
Module 1: Data Ingestion
Reads hotel_bookings.csv, cleans data, computes derived fields, loads into SQLite.
"""

import os
import sqlite3
import pandas as pd

# ── Paths ─────────────────────────────────────────────────────────────────────
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CSV_PATH = os.path.join(os.path.dirname(BASE_DIR), "hotel_bookings.csv")
DB_PATH  = os.path.join(BASE_DIR, "data", "hotel.db")

MONTH_MAP = {
    "January": 1, "February": 2, "March": 3, "April": 4,
    "May": 5, "June": 6, "July": 7, "August": 8,
    "September": 9, "October": 10, "November": 11, "December": 12,
}

def load_and_clean():
    print(f"Reading CSV from: {CSV_PATH}")
    df = pd.read_csv(CSV_PATH)
    raw_count = len(df)
    print(f"  Raw rows: {raw_count:,}")

    # ── Fill missing values ───────────────────────────────────────────────────
    df["children"] = df["children"].fillna(0).astype(int)
    df["country"]  = df["country"].fillna("Unknown")
    df["agent"]    = df["agent"].fillna(0).astype(int)
    df["company"]  = df["company"].fillna(0).astype(int)

    # ── Drop anomalous ADR ────────────────────────────────────────────────────
    bad_adr = df[(df["adr"] < 0) | (df["adr"] > 5000)]
    dropped = len(bad_adr)
    df = df[(df["adr"] >= 0) & (df["adr"] <= 5000)].copy()
    print(f"  Dropped {dropped:,} rows with adr < 0 or adr > 5000")

    # ── Derived fields ────────────────────────────────────────────────────────
    df["total_nights"] = df["stays_in_weekend_nights"] + df["stays_in_week_nights"]

    df["total_revenue"] = df.apply(
        lambda r: r["adr"] * r["total_nights"] if r["is_canceled"] == 0 else 0.0,
        axis=1,
    )

    # Parse arrival_date: month is a string (e.g. "July")
    df["arrival_month_num"] = df["arrival_date_month"].map(MONTH_MAP)
    df["arrival_date"] = pd.to_datetime(
        dict(
            year=df["arrival_date_year"],
            month=df["arrival_month_num"],
            day=df["arrival_date_day_of_month"],
        ),
        errors="coerce",
    ).dt.strftime("%Y-%m-%d")

    # Drop helper column
    df.drop(columns=["arrival_month_num"], inplace=True)

    print(f"  Clean rows ready to import: {len(df):,}")
    return df, raw_count, dropped


def write_schema(conn):
    conn.execute("DROP TABLE IF EXISTS bookings")
    conn.execute("""
        CREATE TABLE bookings (
            -- Original columns
            hotel                           TEXT,
            is_canceled                     INTEGER,
            lead_time                       INTEGER,
            arrival_date_year               INTEGER,
            arrival_date_month              TEXT,
            arrival_date_week_number        INTEGER,
            arrival_date_day_of_month       INTEGER,
            stays_in_weekend_nights         INTEGER,
            stays_in_week_nights            INTEGER,
            adults                          INTEGER,
            children                        INTEGER,
            babies                          INTEGER,
            meal                            TEXT,
            country                         TEXT,
            market_segment                  TEXT,
            distribution_channel            TEXT,
            is_repeated_guest               INTEGER,
            previous_cancellations          INTEGER,
            previous_bookings_not_canceled  INTEGER,
            reserved_room_type              TEXT,
            assigned_room_type              TEXT,
            booking_changes                 INTEGER,
            deposit_type                    TEXT,
            agent                           INTEGER,
            company                         INTEGER,
            days_in_waiting_list            INTEGER,
            customer_type                   TEXT,
            adr                             REAL,
            required_car_parking_spaces     INTEGER,
            total_of_special_requests       INTEGER,
            reservation_status              TEXT,
            reservation_status_date         TEXT,
            -- Derived columns
            total_nights                    INTEGER,
            total_revenue                   REAL,
            arrival_date                    TEXT
        )
    """)
    conn.commit()


def ingest(df):
    conn = sqlite3.connect(DB_PATH)
    write_schema(conn)
    df.to_sql("bookings", conn, if_exists="append", index=False)
    conn.commit()
    row_count = conn.execute("SELECT COUNT(*) FROM bookings").fetchone()[0]
    conn.close()
    return row_count


def main():
    df, raw_count, dropped = load_and_clean()
    row_count = ingest(df)

    db_size_kb = os.path.getsize(DB_PATH) / 1024
    print()
    print("=" * 50)
    print(f"  Rows imported  : {row_count:,}")
    print(f"  Rows dropped   : {dropped:,}")
    print(f"  Database size  : {db_size_kb:,.1f} KB  →  {DB_PATH}")
    print("=" * 50)


if __name__ == "__main__":
    main()
