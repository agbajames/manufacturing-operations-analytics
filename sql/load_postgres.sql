-- Run from psql at the repository root after creating the schema.
SET search_path TO manufacturing_analytics;

\copy dim_date FROM 'data/processed/dim_date.csv' WITH (FORMAT csv, HEADER true)
\copy dim_product FROM 'data/processed/dim_product.csv' WITH (FORMAT csv, HEADER true)
\copy fact_daily_production FROM 'data/processed/fact_daily_production.csv' WITH (FORMAT csv, HEADER true)
\copy fact_hourly_performance FROM 'data/processed/fact_hourly_performance.csv' WITH (FORMAT csv, HEADER true)
\copy fact_downtime_events FROM 'data/processed/fact_downtime_events.csv' WITH (FORMAT csv, HEADER true)
