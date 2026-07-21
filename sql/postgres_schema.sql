-- PostgreSQL analytical schema for the manufacturing operations portfolio project.

CREATE SCHEMA IF NOT EXISTS manufacturing_analytics;
SET search_path TO manufacturing_analytics;

CREATE TABLE dim_date (
    date_key integer PRIMARY KEY,
    date date NOT NULL UNIQUE,
    year smallint NOT NULL,
    quarter varchar(2) NOT NULL,
    month_number smallint NOT NULL CHECK (month_number BETWEEN 1 AND 12),
    month_name varchar(12) NOT NULL,
    year_month char(7) NOT NULL,
    day_of_week_number smallint NOT NULL CHECK (day_of_week_number BETWEEN 1 AND 7),
    day_of_week varchar(10) NOT NULL,
    is_weekend boolean NOT NULL
);

CREATE TABLE dim_product (
    product_key varchar(8) PRIMARY KEY,
    product_type_l numeric(6,2) NOT NULL,
    product_name varchar(80) NOT NULL,
    volume_litres_per_unit numeric(6,2) NOT NULL
);

CREATE TABLE fact_daily_production (
    date_key integer NOT NULL REFERENCES dim_date(date_key),
    date date NOT NULL,
    product_key varchar(8) NOT NULL REFERENCES dim_product(product_key),
    product_type_l numeric(6,2) NOT NULL,
    production_units integer NOT NULL CHECK (production_units >= 0),
    liters_produced integer NOT NULL CHECK (liters_produced >= 0),
    production_start_ts timestamp,
    production_end_ts timestamp,
    published_efficiency numeric(12,8),
    calculated_efficiency numeric(12,8),
    published_gallons_per_hour numeric(14,6),
    monitored_hours numeric(14,8) NOT NULL,
    operating_hours numeric(14,8) NOT NULL,
    downtime_hours numeric(14,8) NOT NULL,
    time_reconciliation_variance_h numeric(14,8),
    litres_reconciliation_variance numeric(14,4),
    PRIMARY KEY (date_key, product_key)
);

CREATE TABLE fact_hourly_performance (
    hour_key bigint PRIMARY KEY,
    date_key integer NOT NULL REFERENCES dim_date(date_key),
    date date NOT NULL,
    hour_start smallint NOT NULL,
    hour_end smallint NOT NULL,
    hour_start_ts timestamp NOT NULL,
    hour_end_ts timestamp NOT NULL,
    production_units_reported numeric(14,4),
    operation_record_count integer,
    monitored_time_h numeric(14,8),
    operation_time_h numeric(14,8),
    downtime_h numeric(14,8),
    published_efficiency numeric(12,8),
    calculated_efficiency numeric(12,8),
    time_reconciliation_variance_h numeric(14,8),
    source_coverage varchar(20) NOT NULL
);

CREATE TABLE fact_downtime_events (
    downtime_id varchar(30) PRIMARY KEY,
    date_key integer NOT NULL REFERENCES dim_date(date_key),
    date date NOT NULL,
    downtime_start_ts timestamp NOT NULL,
    downtime_end_ts timestamp NOT NULL,
    start_hour smallint NOT NULL,
    reported_duration_minutes numeric(14,6) NOT NULL CHECK (reported_duration_minutes >= 0),
    calculated_duration_minutes numeric(14,6) NOT NULL,
    duration_variance_seconds numeric(14,6) NOT NULL,
    duration_band varchar(20) NOT NULL
);

CREATE INDEX ix_daily_date ON fact_daily_production(date_key);
CREATE INDEX ix_hourly_date ON fact_hourly_performance(date_key);
CREATE INDEX ix_event_date ON fact_downtime_events(date_key);
CREATE INDEX ix_event_start_hour ON fact_downtime_events(start_hour);

CREATE OR REPLACE VIEW vw_monthly_performance AS
SELECT
    d.year_month,
    COUNT(DISTINCT f.date_key) AS production_days,
    SUM(f.production_units) AS production_units,
    SUM(f.liters_produced) AS litres_produced,
    SUM(f.monitored_hours) AS monitored_hours,
    SUM(f.operating_hours) AS operating_hours,
    SUM(f.downtime_hours) AS downtime_hours,
    SUM(f.operating_hours) / NULLIF(SUM(f.monitored_hours), 0) AS operational_efficiency,
    SUM(f.production_units) / NULLIF(SUM(f.operating_hours), 0) AS units_per_operating_hour
FROM fact_daily_production f
JOIN dim_date d ON d.date_key = f.date_key
GROUP BY d.year_month;

CREATE OR REPLACE VIEW vw_downtime_profile AS
SELECT
    duration_band,
    COUNT(*) AS event_count,
    SUM(reported_duration_minutes) AS total_downtime_minutes,
    AVG(reported_duration_minutes) AS average_downtime_minutes,
    MAX(reported_duration_minutes) AS maximum_downtime_minutes
FROM fact_downtime_events
GROUP BY duration_band;
