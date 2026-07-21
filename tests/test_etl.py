from pathlib import Path
import unittest

import pandas as pd

from src.etl import EXPECTED_MD5, file_md5


ROOT = Path(__file__).resolve().parents[1]
PROCESSED = ROOT / "data" / "processed"


class ManufacturingEtlTests(unittest.TestCase):
    def test_source_checksum(self):
        self.assertEqual(
            file_md5(ROOT / "data" / "raw" / "production_raw.xlsx"), EXPECTED_MD5
        )

    def test_primary_keys_and_relationships(self):
        daily = pd.read_csv(PROCESSED / "fact_daily_production.csv")
        hourly = pd.read_csv(PROCESSED / "fact_hourly_performance.csv")
        events = pd.read_csv(PROCESSED / "fact_downtime_events.csv")
        dates = pd.read_csv(PROCESSED / "dim_date.csv")
        products = pd.read_csv(PROCESSED / "dim_product.csv")

        self.assertFalse(daily.duplicated(["date_key", "product_key"]).any())
        self.assertFalse(hourly.duplicated(["hour_key"]).any())
        self.assertFalse(events["downtime_id"].duplicated().any())
        self.assertTrue(set(daily["date_key"]).issubset(set(dates["date_key"])))
        self.assertTrue(set(hourly["date_key"]).issubset(set(dates["date_key"])))
        self.assertTrue(set(events["date_key"]).issubset(set(dates["date_key"])))
        self.assertTrue(set(daily["product_key"]).issubset(set(products["product_key"])))

    def test_business_reconciliations(self):
        daily = pd.read_csv(PROCESSED / "fact_daily_production.csv")
        events = pd.read_csv(PROCESSED / "fact_downtime_events.csv")

        self.assertTrue((daily["production_units"] >= 0).all())
        self.assertTrue((daily["liters_produced"] >= 0).all())
        self.assertTrue((daily["litres_reconciliation_variance"].abs() < 0.001).all())
        self.assertTrue(
            (daily[["monitored_hours", "operating_hours", "downtime_hours"]] >= 0)
            .all()
            .all()
        )
        self.assertTrue((events["reported_duration_minutes"] >= 0).all())
        self.assertLessEqual(events["duration_variance_seconds"].abs().max(), 1)

    def test_expected_row_counts(self):
        self.assertEqual(len(pd.read_csv(PROCESSED / "fact_daily_production.csv")), 59)
        self.assertEqual(len(pd.read_csv(PROCESSED / "fact_downtime_events.csv")), 1388)


if __name__ == "__main__":
    unittest.main()
