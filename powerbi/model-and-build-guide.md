# Power BI model and build guide

## Import

Import these files from `data/processed/` and rename the tables as shown:

| File | Power BI table |
|---|---|
| `dim_date.csv` | Dim Date |
| `dim_product.csv` | Dim Product |
| `fact_daily_production.csv` | Fact Daily Production |
| `fact_hourly_performance.csv` | Fact Hourly Performance |
| `fact_downtime_events.csv` | Fact Downtime Events |
| `data_quality_report.csv` | Data Quality Report |

Set date and timestamp columns to Date or Date/Time, key and count columns to Whole Number, and duration/efficiency columns to Decimal Number. Mark `Dim Date` as the date table using its `date` column.

## Relationships

Create single-direction, one-to-many relationships:

```text
Dim Date[date_key] 1 ─── * Fact Daily Production[date_key]
Dim Date[date_key] 1 ─── * Fact Hourly Performance[date_key]
Dim Date[date_key] 1 ─── * Fact Downtime Events[date_key]
Dim Product[product_key] 1 ─── * Fact Daily Production[product_key]
```

Do not relate the three fact tables directly. Hide foreign keys from report view after relationships are validated.

Sort `Dim Date[month_name]` by `month_number`, and sort downtime duration bands with a small manual sort table if you want the natural order `<1`, `1–5`, `5–15`, `15–60`, `60+`.

## Measures

Create a dedicated empty Measures table and add every measure from `measures.dax`. Format:

- Efficiency and rates: Percentage, one decimal place
- Units and events: Whole number with thousands separator
- Hours and minutes: Decimal, one decimal place
- Month-over-month change: Percentage, one decimal place

Operational Efficiency is a weighted ratio of operating to monitored hours. Do not average the row-level efficiency percentages.

## Report pages

### 1 — Executive overview

Top cards: Total Production Units, Total Litres Produced, Operational Efficiency, Downtime Hours, Units per Operating Hour.

Visuals:

- Line and clustered-column chart: production units and operational efficiency by year-month
- Stacked column chart: operating hours versus downtime hours by year-month
- Bar chart: units and litres by product
- Table: highest and lowest efficiency production dates with output and downtime

Slicers: date, product.

### 2 — Production performance

- Matrix: date × product with production units, litres, efficiency and units per operating hour
- Line chart: hourly reported output by hour of day
- Heatmap matrix: day of week × hour of day, coloured by calculated efficiency
- Scatter plot: downtime hours versus production units, sized by monitored hours
- Decomposition tree: production units by year-month, product, weekday and hour

### 3 — Downtime analysis

- Cards: Downtime Events, Event Downtime Minutes, Average Event Duration, Median Event Duration, Long Stop Event Rate
- Column chart: downtime minutes by duration band
- Line chart: event count and downtime minutes by date
- Heatmap: event count by weekday and start hour
- Detail table: event ID, start, end, duration and duration band

The public source has no downtime reason codes. Do not label time bands or hours as root causes.

### 4 — Data quality and governance

- Card: Quality Checks Requiring Review
- Table: check, severity, status, affected rows, affected percentage and rule
- Card: Hourly Source Match Rate
- Column chart: hourly source coverage
- Narrative explaining the six duplicated raw hourly rows, 16 unmatched hour records, and daily time-reconciliation warnings

## Tooltips and interactions

Create a production-day tooltip containing output, efficiency, downtime, start/end time and product. Keep cross-highlighting enabled between trend and product visuals, but disable it for the data-quality table.

## Important terminology

The dataset supports operational efficiency, throughput and downtime analysis. It does **not** contain the quality and ideal-cycle components needed for full Overall Equipment Effectiveness. Do not present Operational Efficiency as OEE.
