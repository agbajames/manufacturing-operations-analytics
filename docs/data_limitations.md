# Data limitations and analytical guardrails

- The dataset covers one beverage filling process and 56 production days, so findings should not be generalised to other facilities without validation.
- The daily table has 59 rows because three dates contain both 3-litre and 5-litre product records.
- Six raw hourly operations records share duplicate date-hour keys. They are aggregated, and their source count is retained.
- Sixteen transformed hourly records occur in only one of the two hourly source sheets. Missing output or operations data remains null rather than being assumed to be zero.
- Fifteen daily rows have more than 0.01 hours of difference between monitored time and operating time plus reported downtime. This is surfaced in the quality report.
- The downtime event log has no reason, machine, operator or work-centre field. Time patterns are descriptive and must not be described as root causes.
- The source-published field is named `gallons_per_hour`; it is preserved as published even though other production fields use litres and units.
- The dataset does not contain the availability, ideal-cycle and quality components needed to calculate full OEE.
- Findings are historical and descriptive. No causal claims should be made without operational context.
