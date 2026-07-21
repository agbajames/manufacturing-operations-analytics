"""Build analytics-ready manufacturing tables from the public Zenodo workbook."""

from __future__ import annotations

import argparse
import hashlib
import json
import sqlite3
from pathlib import Path

import numpy as np
import pandas as pd


EXPECTED_MD5 = "d9c095d5eba8706ac7dda92af63f5c35"
SOURCE_URL = "https://zenodo.org/records/18146866"


def file_md5(path: Path) -> str:
    digest = hashlib.md5()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def combine_date_time(date_series: pd.Series, time_series: pd.Series) -> pd.Series:
    dates = pd.to_datetime(date_series, errors="coerce").dt.normalize()
    times = pd.to_timedelta(time_series.astype(str), errors="coerce")
    return dates + times


def date_key(series: pd.Series) -> pd.Series:
    return pd.to_datetime(series).dt.strftime("%Y%m%d").astype("int64")


def build_date_dimension(min_date: pd.Timestamp, max_date: pd.Timestamp) -> pd.DataFrame:
    dates = pd.date_range(min_date.normalize(), max_date.normalize(), freq="D")
    frame = pd.DataFrame({"date": dates})
    frame["date_key"] = date_key(frame["date"])
    frame["year"] = frame["date"].dt.year
    frame["quarter"] = "Q" + frame["date"].dt.quarter.astype(str)
    frame["month_number"] = frame["date"].dt.month
    frame["month_name"] = frame["date"].dt.month_name()
    frame["year_month"] = frame["date"].dt.strftime("%Y-%m")
    frame["day_of_week_number"] = frame["date"].dt.dayofweek + 1
    frame["day_of_week"] = frame["date"].dt.day_name()
    frame["is_weekend"] = frame["date"].dt.dayofweek >= 5
    return frame[
        [
            "date_key",
            "date",
            "year",
            "quarter",
            "month_number",
            "month_name",
            "year_month",
            "day_of_week_number",
            "day_of_week",
            "is_weekend",
        ]
    ]


def quality_row(check: str, severity: str, affected: int, total: int, rule: str) -> dict:
    return {
        "check_name": check,
        "severity": severity,
        "status": "PASS" if affected == 0 else "REVIEW",
        "affected_rows": int(affected),
        "rows_tested": int(total),
        "affected_pct": float(affected / total) if total else 0.0,
        "rule": rule,
    }


def build_project(source_path: Path, output_dir: Path, sqlite_path: Path) -> dict:
    actual_md5 = file_md5(source_path)
    if actual_md5 != EXPECTED_MD5:
        raise ValueError(
            f"Source checksum mismatch: expected {EXPECTED_MD5}, got {actual_md5}"
        )

    sheets = pd.read_excel(source_path, sheet_name=None)
    expected_sheets = {
        "processed_hourly",
        "daily_operation_summary",
        "hourly_operation_breakdown",
        "downtime_event_log",
    }
    missing = expected_sheets.difference(sheets)
    if missing:
        raise ValueError(f"Missing required worksheets: {sorted(missing)}")

    raw_output = sheets["processed_hourly"].copy()
    raw_daily = sheets["daily_operation_summary"].copy()
    raw_hourly = sheets["hourly_operation_breakdown"].copy()
    raw_events = sheets["downtime_event_log"].copy()

    # Daily production fact.
    daily = raw_daily.copy()
    daily["date"] = pd.to_datetime(daily["date"]).dt.normalize()
    daily["date_key"] = date_key(daily["date"])
    daily["product_key"] = daily["product_type_l"].map(lambda value: f"P{int(value):02d}L")
    daily["production_start_ts"] = combine_date_time(
        daily["date"], daily["production_start_time"]
    )
    daily["production_end_ts"] = combine_date_time(
        daily["date"], daily["production_end_time"]
    )
    daily["calculated_efficiency"] = np.where(
        daily["monitored_time_dec"] > 0,
        daily["operation_time_dec"] / daily["monitored_time_dec"],
        np.nan,
    )
    daily["time_reconciliation_variance_h"] = (
        daily["monitored_time_dec"]
        - daily["operation_time_dec"]
        - daily["pause_time_dec"]
    )
    daily["litres_reconciliation_variance"] = (
        daily["liters_produced"]
        - daily["production_units"] * daily["product_type_l"]
    )
    daily = daily[
        [
            "date_key",
            "date",
            "product_key",
            "product_type_l",
            "production_units",
            "liters_produced",
            "production_start_ts",
            "production_end_ts",
            "efficiency",
            "calculated_efficiency",
            "gallons_per_hour",
            "monitored_time_dec",
            "operation_time_dec",
            "pause_time_dec",
            "time_reconciliation_variance_h",
            "litres_reconciliation_variance",
        ]
    ].rename(
        columns={
            "efficiency": "published_efficiency",
            "gallons_per_hour": "published_gallons_per_hour",
            "monitored_time_dec": "monitored_hours",
            "operation_time_dec": "operating_hours",
            "pause_time_dec": "downtime_hours",
        }
    )

    # Hourly fact: retain unmatched observations to make missingness visible.
    output = raw_output.copy()
    output["date"] = pd.to_datetime(output["date"]).dt.normalize()
    output = output.rename(columns={"production_gallons": "production_units_reported"})

    hourly = raw_hourly.copy()
    hourly["date"] = pd.to_datetime(hourly["date"]).dt.normalize()
    hourly["operation_record_count"] = 1
    hourly = (
        hourly.groupby(["date", "hour_start", "hour_end"], as_index=False)
        .agg(
            monitored_time_h=("monitored_time_h", "sum"),
            operation_time_h=("operation_time_h", "sum"),
            downtime_h=("downtime_h", "sum"),
            operation_record_count=("operation_record_count", "sum"),
        )
    )
    hourly["published_efficiency"] = np.where(
        hourly["monitored_time_h"] > 0,
        hourly["operation_time_h"] / hourly["monitored_time_h"],
        np.nan,
    )

    hourly_fact = output.merge(
        hourly,
        on=["date", "hour_start", "hour_end"],
        how="outer",
        indicator=True,
        validate="one_to_one",
    )
    hourly_fact["date_key"] = date_key(hourly_fact["date"])
    hourly_fact["hour_key"] = (
        hourly_fact["date"].dt.strftime("%Y%m%d")
        + hourly_fact["hour_start"].astype(int).astype(str).str.zfill(2)
    ).astype("int64")
    hourly_fact["hour_start_ts"] = hourly_fact["date"] + pd.to_timedelta(
        hourly_fact["hour_start"], unit="h"
    )
    hourly_fact["hour_end_ts"] = hourly_fact["date"] + pd.to_timedelta(
        hourly_fact["hour_end"], unit="h"
    )
    hourly_fact["calculated_efficiency"] = np.where(
        hourly_fact["monitored_time_h"] > 0,
        hourly_fact["operation_time_h"] / hourly_fact["monitored_time_h"],
        np.nan,
    )
    hourly_fact["time_reconciliation_variance_h"] = (
        hourly_fact["monitored_time_h"]
        - hourly_fact["operation_time_h"]
        - hourly_fact["downtime_h"]
    )
    hourly_fact["source_coverage"] = hourly_fact["_merge"].map(
        {"both": "Both", "left_only": "Output only", "right_only": "Operations only"}
    )
    hourly_fact = hourly_fact.drop(columns="_merge")[
        [
            "hour_key",
            "date_key",
            "date",
            "hour_start",
            "hour_end",
            "hour_start_ts",
            "hour_end_ts",
            "production_units_reported",
            "operation_record_count",
            "monitored_time_h",
            "operation_time_h",
            "downtime_h",
            "published_efficiency",
            "calculated_efficiency",
            "time_reconciliation_variance_h",
            "source_coverage",
        ]
    ].sort_values(["date", "hour_start"])

    # Downtime-event fact.
    events = raw_events.copy()
    events["date"] = pd.to_datetime(events["date"]).dt.normalize()
    events["date_key"] = date_key(events["date"])
    events["downtime_start_ts"] = combine_date_time(
        events["date"], events["downtime_start_time"]
    )
    events["downtime_end_ts"] = combine_date_time(
        events["date"], events["downtime_end_time"]
    )
    events["reported_duration_minutes"] = (
        pd.to_timedelta(events["downtime_time"].astype(str), errors="coerce")
        .dt.total_seconds()
        .div(60)
    )
    events["calculated_duration_minutes"] = (
        events["downtime_end_ts"] - events["downtime_start_ts"]
    ).dt.total_seconds().div(60)
    events["duration_variance_seconds"] = (
        events["reported_duration_minutes"] - events["calculated_duration_minutes"]
    ) * 60
    events["start_hour"] = events["downtime_start_ts"].dt.hour
    events["duration_band"] = pd.cut(
        events["reported_duration_minutes"],
        bins=[-np.inf, 1, 5, 15, 60, np.inf],
        labels=["<1 min", "1–5 min", "5–15 min", "15–60 min", "60+ min"],
        right=False,
    ).astype(str)
    events = events[
        [
            "downtime_id",
            "date_key",
            "date",
            "downtime_start_ts",
            "downtime_end_ts",
            "start_hour",
            "reported_duration_minutes",
            "calculated_duration_minutes",
            "duration_variance_seconds",
            "duration_band",
        ]
    ].sort_values("downtime_start_ts")

    product = (
        daily[["product_key", "product_type_l"]]
        .drop_duplicates()
        .sort_values("product_type_l")
        .reset_index(drop=True)
    )
    product["product_name"] = product["product_type_l"].map(
        lambda value: f"{int(value)} litre container"
    )
    product["volume_litres_per_unit"] = product["product_type_l"]

    all_dates = pd.concat([daily["date"], hourly_fact["date"], events["date"]])
    dates = build_date_dimension(all_dates.min(), all_dates.max())

    # Quality checks deliberately surface source limitations rather than hiding them.
    quality = []
    quality.append(
        quality_row(
            "Daily duplicate business key",
            "Error",
            daily.duplicated(["date_key", "product_key"]).sum(),
            len(daily),
            "date_key + product_key must be unique",
        )
    )
    quality.append(
        quality_row(
            "Raw hourly duplicate business key",
            "Warning",
            raw_hourly.duplicated(["date", "hour_start", "hour_end"], keep=False).sum(),
            len(raw_hourly),
            "duplicate date-hour observations are aggregated and counted before modelling",
        )
    )
    quality.append(
        quality_row(
            "Hourly duplicate business key",
            "Error",
            hourly_fact.duplicated(["date_key", "hour_start"]).sum(),
            len(hourly_fact),
            "date_key + hour_start must be unique",
        )
    )
    quality.append(
        quality_row(
            "Downtime ID duplicate",
            "Error",
            events["downtime_id"].duplicated().sum(),
            len(events),
            "downtime_id must be unique",
        )
    )
    quality.append(
        quality_row(
            "Daily negative duration",
            "Error",
            (daily[["monitored_hours", "operating_hours", "downtime_hours"]].min(axis=1) < 0).sum(),
            len(daily),
            "daily time measures must be non-negative",
        )
    )
    quality.append(
        quality_row(
            "Event negative duration",
            "Error",
            (events["reported_duration_minutes"] < 0).sum(),
            len(events),
            "downtime duration must be non-negative",
        )
    )
    quality.append(
        quality_row(
            "Daily litres reconciliation",
            "Error",
            (daily["litres_reconciliation_variance"].abs() > 0.001).sum(),
            len(daily),
            "litres produced must equal units × product size",
        )
    )
    quality.append(
        quality_row(
            "Daily time reconciliation",
            "Warning",
            (daily["time_reconciliation_variance_h"].abs() > 0.01).sum(),
            len(daily),
            "monitored hours should approximately equal operating + downtime hours",
        )
    )
    quality.append(
        quality_row(
            "Hourly time reconciliation",
            "Warning",
            (hourly_fact["time_reconciliation_variance_h"].abs() > 0.01).sum(),
            hourly_fact["time_reconciliation_variance_h"].notna().sum(),
            "monitored hours should approximately equal operating + downtime hours",
        )
    )
    quality.append(
        quality_row(
            "Unmatched hourly source record",
            "Warning",
            (hourly_fact["source_coverage"] != "Both").sum(),
            len(hourly_fact),
            "output and operational records should share a date-hour key",
        )
    )
    quality.append(
        quality_row(
            "Event duration reconciliation",
            "Warning",
            (events["duration_variance_seconds"].abs() > 1).sum(),
            len(events),
            "reported and timestamp-derived duration should agree within one second",
        )
    )
    quality_report = pd.DataFrame(quality)

    monthly = daily.copy()
    monthly["year_month"] = monthly["date"].dt.strftime("%Y-%m")
    monthly_summary = (
        monthly.groupby("year_month", as_index=False)
        .agg(
            production_days=("date", "nunique"),
            production_units=("production_units", "sum"),
            litres_produced=("liters_produced", "sum"),
            monitored_hours=("monitored_hours", "sum"),
            operating_hours=("operating_hours", "sum"),
            downtime_hours=("downtime_hours", "sum"),
        )
        .sort_values("year_month")
    )
    monthly_summary["operational_efficiency"] = (
        monthly_summary["operating_hours"] / monthly_summary["monitored_hours"]
    )
    monthly_summary["units_per_operating_hour"] = (
        monthly_summary["production_units"] / monthly_summary["operating_hours"]
    )

    weighted_efficiency = daily["operating_hours"].sum() / daily["monitored_hours"].sum()
    valid_day = daily[daily["monitored_hours"] >= 1].copy()
    best_day = valid_day.loc[valid_day["calculated_efficiency"].idxmax()]
    worst_day = valid_day.loc[valid_day["calculated_efficiency"].idxmin()]
    top_output = daily.loc[daily["production_units"].idxmax()]

    summary = {
        "source": {
            "title": "Industrial Production Time-Series Dataset from a Beverage Bottling Line",
            "url": SOURCE_URL,
            "license": "CC BY 4.0",
            "md5": actual_md5,
        },
        "coverage": {
            "start_date": daily["date"].min().date().isoformat(),
            "end_date": daily["date"].max().date().isoformat(),
            "production_days": int(daily["date"].nunique()),
            "daily_rows": int(len(daily)),
            "hourly_rows": int(len(hourly_fact)),
            "downtime_events": int(len(events)),
        },
        "kpis": {
            "production_units": int(daily["production_units"].sum()),
            "litres_produced": int(daily["liters_produced"].sum()),
            "monitored_hours": round(float(daily["monitored_hours"].sum()), 3),
            "operating_hours": round(float(daily["operating_hours"].sum()), 3),
            "downtime_hours": round(float(daily["downtime_hours"].sum()), 3),
            "weighted_operational_efficiency": round(float(weighted_efficiency), 6),
            "units_per_operating_hour": round(
                float(daily["production_units"].sum() / daily["operating_hours"].sum()), 3
            ),
            "average_event_duration_minutes": round(
                float(events["reported_duration_minutes"].mean()), 3
            ),
            "median_event_duration_minutes": round(
                float(events["reported_duration_minutes"].median()), 3
            ),
        },
        "highlights": {
            "best_efficiency_date": best_day["date"].date().isoformat(),
            "best_efficiency": round(float(best_day["calculated_efficiency"]), 6),
            "worst_efficiency_date": worst_day["date"].date().isoformat(),
            "worst_efficiency": round(float(worst_day["calculated_efficiency"]), 6),
            "highest_output_date": top_output["date"].date().isoformat(),
            "highest_daily_units": int(top_output["production_units"]),
        },
    }

    output_dir.mkdir(parents=True, exist_ok=True)
    tables = {
        "dim_date": dates,
        "dim_product": product,
        "fact_daily_production": daily,
        "fact_hourly_performance": hourly_fact,
        "fact_downtime_events": events,
        "monthly_summary": monthly_summary,
        "data_quality_report": quality_report,
    }
    for name, frame in tables.items():
        frame.to_csv(output_dir / f"{name}.csv", index=False, date_format="%Y-%m-%dT%H:%M:%S")

    with (output_dir / "analysis_summary.json").open("w", encoding="utf-8") as handle:
        json.dump(summary, handle, indent=2)

    sqlite_path.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(sqlite_path) as connection:
        for name, frame in tables.items():
            sqlite_frame = frame.copy()
            for column in sqlite_frame.select_dtypes(include=["datetime64[ns]"]).columns:
                sqlite_frame[column] = sqlite_frame[column].dt.strftime("%Y-%m-%d %H:%M:%S")
            sqlite_frame.to_sql(name, connection, if_exists="replace", index=False)
        connection.execute(
            "CREATE INDEX IF NOT EXISTS ix_daily_date ON fact_daily_production(date_key)"
        )
        connection.execute(
            "CREATE INDEX IF NOT EXISTS ix_hourly_date ON fact_hourly_performance(date_key)"
        )
        connection.execute(
            "CREATE INDEX IF NOT EXISTS ix_events_date ON fact_downtime_events(date_key)"
        )
        connection.commit()

    return summary


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=Path("data/raw/production_raw.xlsx"))
    parser.add_argument("--output", type=Path, default=Path("data/processed"))
    parser.add_argument("--database", type=Path, default=Path("data/manufacturing_analytics.sqlite"))
    args = parser.parse_args()
    summary = build_project(args.source, args.output, args.database)
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
