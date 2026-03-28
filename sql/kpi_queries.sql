-- Hotel Revenue Intelligence Platform
-- KPI SQL Queries (reference / audit trail for analysis.py logic)
-- Run against: data/hotel.db


-- ── 1. Monthly KPIs ───────────────────────────────────────────────────────────
-- RevPAR = total revenue / non-canceled bookings (no real inventory field)
SELECT
    substr(arrival_date, 1, 7)                                      AS month,
    COUNT(*)                                                         AS total_bookings,
    SUM(is_canceled)                                                 AS canceled,
    ROUND(SUM(is_canceled) * 100.0 / COUNT(*), 2)                   AS cancellation_rate_pct,
    ROUND((1.0 - SUM(is_canceled) * 1.0 / COUNT(*)) * 100, 2)       AS occupancy_rate_pct,
    ROUND(AVG(CASE WHEN is_canceled = 0 THEN adr END), 2)            AS adr,
    ROUND(SUM(total_revenue), 2)                                     AS total_revenue,
    ROUND(
        SUM(total_revenue) * 1.0
        / NULLIF(SUM(CASE WHEN is_canceled = 0 THEN 1 ELSE 0 END), 0),
        2
    )                                                                AS revpar
FROM bookings
GROUP BY substr(arrival_date, 1, 7)
ORDER BY month;


-- ── 2. Channel analysis ───────────────────────────────────────────────────────
SELECT
    distribution_channel                                             AS channel,
    COUNT(*)                                                         AS order_count,
    ROUND(AVG(CASE WHEN is_canceled = 0 THEN adr END), 2)            AS avg_adr,
    ROUND(SUM(total_revenue), 2)                                     AS total_revenue,
    ROUND(SUM(is_canceled) * 100.0 / COUNT(*), 2)                   AS cancellation_rate_pct
FROM bookings
GROUP BY distribution_channel
ORDER BY order_count DESC;


-- ── 3. Room-type heatmap (reserved_room_type × month) ─────────────────────────
SELECT
    reserved_room_type,
    substr(arrival_date, 1, 7)                                      AS month,
    COUNT(*)                                                         AS booking_count,
    ROUND(AVG(CASE WHEN is_canceled = 0 THEN adr END), 2)            AS avg_adr,
    ROUND((1.0 - SUM(is_canceled) * 1.0 / COUNT(*)) * 100, 2)       AS occupancy_rate_pct
FROM bookings
GROUP BY reserved_room_type, substr(arrival_date, 1, 7)
ORDER BY reserved_room_type, month;


-- ── 4. Overall summary ────────────────────────────────────────────────────────
SELECT
    COUNT(*)                                                         AS total_bookings,
    SUM(is_canceled)                                                 AS total_canceled,
    ROUND(SUM(is_canceled) * 100.0 / COUNT(*), 2)                   AS overall_cancellation_rate_pct,
    ROUND(AVG(CASE WHEN is_canceled = 0 THEN adr END), 2)            AS overall_adr,
    ROUND(SUM(total_revenue), 2)                                     AS overall_revenue
FROM bookings;


-- ── 5. High lead-time cancellation pattern ────────────────────────────────────
SELECT
    CASE
        WHEN lead_time < 30  THEN '0-29 days'
        WHEN lead_time < 90  THEN '30-89 days'
        WHEN lead_time < 180 THEN '90-179 days'
        ELSE '180+ days'
    END                                                              AS lead_time_bucket,
    COUNT(*)                                                         AS bookings,
    ROUND(SUM(is_canceled) * 100.0 / COUNT(*), 2)                   AS cancellation_rate_pct
FROM bookings
GROUP BY lead_time_bucket
ORDER BY MIN(lead_time);
