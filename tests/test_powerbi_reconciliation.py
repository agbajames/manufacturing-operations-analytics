import unittest
from pathlib import Path

import pandas as pd


ROOT = Path(__file__).resolve().parents[1]
PROCESSED = ROOT / "data" / "processed"


class PowerBIHeadlineReconciliationTests(unittest.TestCase):
    """Lock the report's headline cards to the figures published in README.md."""

    @classmethod
    def setUpClass(cls):
        cls.daily = pd.read_csv(PROCESSED / "fact_daily_production.csv")
        cls.hourly = pd.read_csv(PROCESSED / "fact_hourly_performance.csv")
        cls.events = pd.read_csv(PROCESSED / "fact_downtime_events.csv")

    def test_executive_headlines(self):
        self.assertEqual(int(self.daily["production_units"].sum()), 60_888)
        self.assertEqual(int(self.daily["liters_produced"].sum()), 212_358)
        efficiency = self.daily["operating_hours"].sum() / self.daily["monitored_hours"].sum()
        self.assertAlmostEqual(efficiency, 0.426595, places=6)
        self.assertAlmostEqual(self.daily["downtime_hours"].sum(), 137.564, places=3)
        units_per_hour = self.daily["production_units"].sum() / self.daily["operating_hours"].sum()
        self.assertAlmostEqual(units_per_hour, 598.061, places=3)

    def test_dataset_counts(self):
        self.assertEqual(len(self.daily), 59)
        self.assertEqual(len(self.hourly), 275)
        self.assertEqual(len(self.events), 1_388)

    def test_downtime_headlines(self):
        self.assertAlmostEqual(self.events["reported_duration_minutes"].sum(), 7_914.032, places=3)
        self.assertAlmostEqual(self.events["reported_duration_minutes"].mean(), 5.702, places=3)
        self.assertAlmostEqual(self.events["reported_duration_minutes"].median(), 1.501, places=3)
        long_stop_rate = (self.events["reported_duration_minutes"] >= 15).mean()
        self.assertAlmostEqual(long_stop_rate, 65 / 1_388, places=8)


if __name__ == "__main__":
    unittest.main()
