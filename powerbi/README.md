# Power BI report

The repository contains an editable Power BI Project (`.pbip`) with a TMDL semantic model and four PBIR report pages:

1. Executive Overview
2. Production Performance
3. Downtime Analysis
4. Data Quality & Governance

Open `ManufacturingOperationsAnalytics/Manufacturing Operations Analytics.pbip` in Power BI Desktop. The model imports the versioned CSV outputs from this repository's public GitHub URLs, so another reviewer can refresh it without recreating local paths.

## Headline reconciliation

The report measures and `tests/test_powerbi_reconciliation.py` reconcile the cards to the figures published in the project README:

| Metric | Expected report value | Calculation |
|---|---:|---|
| Production units | 60,888 | Sum of daily production units |
| Litres produced | 212,358 | Sum of daily litres |
| Operational efficiency | 42.6595% | Operating hours / monitored hours |
| Downtime hours | 137.564 | Sum of daily downtime hours |
| Units per operating hour | 598.061 | Production units / operating hours |
| Downtime events | 1,388 | Distinct downtime IDs |
| Event downtime | 7,914.032 minutes | Sum of event durations |
| Daily / hourly rows | 59 / 275 | Validated fact-table row counts |

Operational Efficiency is a weighted ratio. It is not an average of row-level percentages and must not be labelled OEE.

## Filters and interactions

- Executive Overview: Date and Product dropdown slicers filter the KPI card, monthly trends, product chart and production-day table.
- Production Performance: Date and Product dropdown slicers filter the matrix, hourly trend, heatmap, scatter plot and decomposition tree.
- Downtime Analysis: Date and Duration Band dropdown slicers filter all event cards, charts, heatmap and event detail.
- Data Quality & Governance: the validation table is deliberately isolated from cross-filtering. This prevents selecting a quality check from changing operational totals.
- Cross-filtering remains enabled between operational charts unless an interaction is explicitly disabled above.
- Slicers are page-local so each analytical question can be reset independently.

## Refresh steps

1. Run `python src/etl.py` and `python -m unittest discover -s tests -v`.
2. Commit the regenerated files under `data/processed/` if the source changes.
3. Open the `.pbip` project in Power BI Desktop.
4. Select **Home → Refresh**. For the GitHub raw URLs, choose an Anonymous Web credential at the repository root level if prompted.
5. Confirm the headline figures against the table above and review the Data Quality & Governance page before publishing.
6. Save the project. Use **File → Save As** for a `.pbix`, or export a `.pbit` template if a binary/template artefact is required.