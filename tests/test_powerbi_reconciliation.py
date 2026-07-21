import unittest
from pathlib import Path
import re

import pandas as pd


ROOT = Path(__file__).resolve().parents[1]
PROCESSED = ROOT / "data" / "processed"
TMDL_DEFINITION = (
    ROOT
    / "powerbi"
    / "ManufacturingOperationsAnalytics"
    / "Manufacturing Operations Analytics.SemanticModel"
    / "definition"
)
REPORT_DEFINITION = (
    ROOT
    / "powerbi"
    / "ManufacturingOperationsAnalytics"
    / "Manufacturing Operations Analytics.Report"
    / "definition"
)


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

    def test_tmdl_uses_supported_tabular_data_types(self):
        supported = {
            "string",
            "int64",
            "double",
            "dateTime",
            "decimal",
            "boolean",
            "binary",
            "variant",
        }
        declarations = []
        for path in TMDL_DEFINITION.rglob("*.tmdl"):
            for line_number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
                match = re.fullmatch(r"\s*dataType:\s*(\S+)\s*", line)
                if match:
                    declarations.append((path, line_number, match.group(1)))

        self.assertTrue(declarations, "No TMDL dataType declarations were found")
        invalid = [
            f"{path.relative_to(ROOT)}:{line_number} ({data_type})"
            for path, line_number, data_type in declarations
            if data_type not in supported
        ]
        self.assertFalse(invalid, f"Unsupported TMDL data types: {invalid}")

    def test_model_omits_unsupported_implicit_measure_property(self):
        model = (TMDL_DEFINITION / "model.tmdl").read_text(encoding="utf-8")
        self.assertNotIn("discourageImplicitMeasures", model)

    def test_measure_table_uses_supported_name_everywhere(self):
        tables = TMDL_DEFINITION / "tables"
        self.assertFalse((tables / "Measures.tmdl").exists())
        self.assertTrue((tables / "KPI_Measures.tmdl").exists())

        model = (TMDL_DEFINITION / "model.tmdl").read_text(encoding="utf-8")
        self.assertIn("ref table KPI_Measures", model)

        stale_references = []
        for path in REPORT_DEFINITION.rglob("*.json"):
            content = path.read_text(encoding="utf-8")
            if '"Entity": "Measures"' in content or '"queryRef": "Measures.' in content:
                stale_references.append(str(path.relative_to(ROOT)))
        self.assertFalse(stale_references, f"Stale Measures table references: {stale_references}")

    def test_duration_band_sort_key_is_imported_not_calculated(self):
        downtime = (
            TMDL_DEFINITION / "tables" / "Fact Downtime Events.tmdl"
        ).read_text(encoding="utf-8")
        self.assertNotIn("column duration_band_sort =", downtime)
        self.assertIn("sourceColumn: duration_band_sort", downtime)
        self.assertIn('DurationBandSort = Table.AddColumn(Typed, "duration_band_sort"', downtime)
        self.assertIn("sortByColumn: duration_band_sort", downtime)

    def test_iso_date_strings_are_imported_as_datetime(self):
        invalid = []
        for path in (TMDL_DEFINITION / "tables").glob("*.tmdl"):
            content = path.read_text(encoding="utf-8")
            if '{"date", type date}' in content:
                invalid.append(str(path.relative_to(ROOT)))
        self.assertFalse(invalid, f"ISO timestamp text forced directly to type date: {invalid}")


if __name__ == "__main__":
    unittest.main()
