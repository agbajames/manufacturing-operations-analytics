# Data dictionary

## Dim Date

Continuous calendar covering the source date range. `date_key` is an integer in `YYYYMMDD` form and is the primary key for all fact-table date relationships.

## Dim Product

| Column | Meaning |
|---|---|
| `product_key` | Stable analytical key such as `P03L` |
| `product_type_l` | Container capacity in litres |
| `product_name` | Human-readable product label |
| `volume_litres_per_unit` | Litres represented by one unit |

## Fact Daily Production

Grain: one row per production date and product size.

| Column | Meaning |
|---|---|
| `production_units` | Containers produced |
| `liters_produced` | Total volume; validated as units × container size |
| `production_start_ts`, `production_end_ts` | Production window |
| `published_efficiency` | Efficiency supplied by the dataset |
| `calculated_efficiency` | Operating hours ÷ monitored hours |
| `published_gallons_per_hour` | Source-published field retained without relabelling |
| `monitored_hours` | Total monitored interval |
| `operating_hours` | Effective runtime |
| `downtime_hours` | Paused/non-operating time reported by the source |
| `time_reconciliation_variance_h` | Monitored − operating − downtime |
| `litres_reconciliation_variance` | Published litres − units × product size |

## Fact Hourly Performance

Grain: one row per date and hour-start value after aggregation of duplicate operational records.

`source_coverage` identifies whether a date-hour key appeared in both source sheets, only the output sheet, or only the operations sheet. `operation_record_count` preserves evidence of aggregated raw observations.

## Fact Downtime Events

Grain: one downtime event.

Reported event duration is converted to minutes. A second duration is independently calculated from start and end timestamps, with the difference retained as `duration_variance_seconds`.

## Data Quality Report

Each row is an auditable validation rule. `REVIEW` does not automatically mean the data is wrong; it means an analyst should understand and document the condition before interpretation.
