import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = path.join(repo, 'powerbi', 'ManufacturingOperationsAnalytics');
const report = path.join(root, 'Manufacturing Operations Analytics.Report');
const model = path.join(root, 'Manufacturing Operations Analytics.SemanticModel');
const definition = path.join(report, 'definition');
const pagesRoot = path.join(definition, 'pages');

fs.rmSync(root, { recursive: true, force: true });
fs.mkdirSync(pagesRoot, { recursive: true });
fs.mkdirSync(path.join(report, 'StaticResources', 'RegisteredResources'), { recursive: true });
fs.mkdirSync(path.join(model, 'definition', 'tables'), { recursive: true });

const writeJson = (file, value) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
};
const write = (file, value) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, value.endsWith('\n') ? value : `${value}\n`);
};
const id = (seed) => crypto.createHash('sha256').update(seed).digest('hex').slice(0, 20);
const schema = 'https://developer.microsoft.com/json-schemas/fabric/item/report/definition';
const visualSchema = `${schema}/visualContainer/2.9.0/schema.json`;
const source = (table) => ({ SourceRef: { Entity: table } });
const measureTable = 'KPI_Measures';
const col = (table, property) => ({
  field: { Column: { Expression: source(table), Property: property } },
  queryRef: `${table}.${property}`,
  nativeQueryRef: property,
});
const measure = (property) => ({
  field: { Measure: { Expression: source(measureTable), Property: property } },
  queryRef: `${measureTable}.${property}`,
  nativeQueryRef: property,
});
const titleObject = (text) => ({
  title: [{ properties: {
    show: { expr: { Literal: { Value: 'true' } } },
    text: { expr: { Literal: { Value: `'${text.replaceAll("'", "''")}'` } } },
    fontSize: { expr: { Literal: { Value: '13D' } } },
  } }],
});
const position = (x, y, width, height, z) => ({ x, y, width, height, z, tabOrder: z });

function textbox(seed, x, y, w, h, text, size = 22, color = '#16324F') {
  return {
    $schema: visualSchema, name: id(seed), position: position(x, y, w, Math.max(h, Math.ceil(size * 1.6 + 16)), 10),
    visual: {
      visualType: 'textbox',
      objects: { general: [{ properties: { paragraphs: [{ textRuns: [{ value: text, textStyle: { fontFamily: 'Segoe UI Semibold', fontSize: `${size}px`, color } }], horizontalTextAlignment: 'left' }] } }] },
      visualContainerObjects: {
        background: [{ properties: { show: { expr: { Literal: { Value: 'false' } } } } }],
        border: [{ properties: { show: { expr: { Literal: { Value: 'false' } } } } }],
      },
    },
  };
}
function card(seed, x, y, w, h, measures, title) {
  return {
    $schema: visualSchema, name: id(seed), position: position(x, y, w, h, 100),
    visual: { visualType: 'cardVisual', query: { queryState: { Data: { projections: measures.map(measure) } } }, visualContainerObjects: titleObject(title) },
  };
}
function chart(seed, type, x, y, w, h, category, ys, title, extra = {}) {
  const queryState = { Category: { projections: [col(...category)] }, Y: { projections: ys.map(measure) }, ...extra };
  return {
    $schema: visualSchema, name: id(seed), position: position(x, y, w, h, 200),
    visual: { visualType: type, query: { queryState }, visualContainerObjects: titleObject(title) },
  };
}
function table(seed, x, y, w, h, fields, title, type = 'tableEx') {
  const projections = fields.map((f) => f.kind === 'measure' ? measure(f.name) : col(f.table, f.name));
  const queryState = type === 'pivotTable'
    ? { Rows: { projections: projections.filter((_, i) => fields[i].role === 'Rows') }, Columns: { projections: projections.filter((_, i) => fields[i].role === 'Columns') }, Values: { projections: projections.filter((_, i) => fields[i].role === 'Values') } }
    : { Values: { projections } };
  return {
    $schema: visualSchema, name: id(seed), position: position(x, y, w, h, 300),
    visual: { visualType: type, query: { queryState }, visualContainerObjects: titleObject(title) },
  };
}
function slicer(seed, x, y, w, field, label) {
  return {
    $schema: visualSchema, name: id(seed), position: position(x, y, w, 80, 50),
    visual: { visualType: 'slicer', query: { queryState: { Values: { projections: [col(...field)] } } }, objects: { data: [{ properties: { mode: { expr: { Literal: { Value: "'Dropdown'" } } } } }], header: [{ properties: { show: { expr: { Literal: { Value: 'true' } } }, text: { expr: { Literal: { Value: `'${label}'` } } } } }] } },
  };
}
function custom(seed, type, x, y, w, h, queryState, title) {
  return { $schema: visualSchema, name: id(seed), position: position(x, y, w, h, 250), visual: { visualType: type, query: { queryState }, visualContainerObjects: titleObject(title) } };
}

const pageDefs = [
  {
    name: 'ReportSectionExecutive', displayName: 'Executive Overview', visuals: [
      textbox('exec-title', 24, 12, 700, 42, 'Manufacturing Operations — Executive Overview'),
      slicer('exec-date', 850, 10, 190, ['Dim Date', 'date'], 'Date'),
      slicer('exec-product', 1050, 10, 206, ['Dim Product', 'product_name'], 'Product'),
      card('exec-kpis', 24, 66, 1232, 112, ['Total Production Units', 'Total Litres Produced', 'Operational Efficiency', 'Downtime Hours', 'Units per Operating Hour'], 'Headline performance'),
      custom('exec-combo', 'lineClusteredColumnComboChart', 24, 194, 600, 238, { Category: { projections: [col('Dim Date', 'year_month')] }, Y: { projections: [measure('Total Production Units')] }, Y2: { projections: [measure('Operational Efficiency')] } }, 'Production and efficiency by month'),
      chart('exec-time', 'columnChart', 640, 194, 616, 238, ['Dim Date', 'year_month'], ['Operating Hours', 'Downtime Hours'], 'Operating versus downtime hours'),
      chart('exec-product-chart', 'clusteredBarChart', 24, 448, 600, 240, ['Dim Product', 'product_name'], ['Total Production Units', 'Total Litres Produced'], 'Output by product'),
      table('exec-days', 640, 448, 616, 240, [
        { table: 'Dim Date', name: 'date' }, { kind: 'measure', name: 'Total Production Units' }, { kind: 'measure', name: 'Operational Efficiency' }, { kind: 'measure', name: 'Downtime Hours' },
      ], 'Production-day detail'),
    ],
  },
  {
    name: 'ReportSectionProduction', displayName: 'Production Performance', visuals: [
      textbox('prod-title', 24, 12, 700, 42, 'Production Performance'),
      slicer('prod-date', 850, 10, 190, ['Dim Date', 'date'], 'Date'),
      slicer('prod-product', 1050, 10, 206, ['Dim Product', 'product_name'], 'Product'),
      table('prod-matrix', 24, 76, 600, 276, [
        { table: 'Dim Date', name: 'date', role: 'Rows' }, { table: 'Dim Product', name: 'product_name', role: 'Columns' },
        { kind: 'measure', name: 'Total Production Units', role: 'Values' }, { kind: 'measure', name: 'Total Litres Produced', role: 'Values' }, { kind: 'measure', name: 'Operational Efficiency', role: 'Values' }, { kind: 'measure', name: 'Units per Operating Hour', role: 'Values' },
      ], 'Daily output by product', 'pivotTable'),
      chart('prod-hourly', 'lineChart', 640, 76, 616, 276, ['Fact Hourly Performance', 'hour_start'], ['Hourly Reported Output'], 'Hourly reported output'),
      table('prod-heatmap', 24, 368, 392, 320, [
        { table: 'Dim Date', name: 'day_of_week', role: 'Rows' }, { table: 'Fact Hourly Performance', name: 'hour_start', role: 'Columns' }, { kind: 'measure', name: 'Hourly Calculated Efficiency', role: 'Values' },
      ], 'Efficiency heatmap', 'pivotTable'),
      custom('prod-scatter', 'scatterChart', 432, 368, 392, 320, { Category: { projections: [col('Dim Date', 'date')] }, X: { projections: [measure('Downtime Hours')] }, Y: { projections: [measure('Total Production Units')] }, Size: { projections: [measure('Monitored Hours')] } }, 'Downtime versus production'),
      custom('prod-tree', 'decompositionTreeVisual', 840, 368, 416, 320, { Analyze: { projections: [measure('Total Production Units')] }, ExplainBy: { projections: [col('Dim Date', 'year_month'), col('Dim Product', 'product_name'), col('Dim Date', 'day_of_week'), col('Fact Hourly Performance', 'hour_start')] } }, 'Production drivers'),
    ],
  },
  {
    name: 'ReportSectionDowntime', displayName: 'Downtime Analysis', visuals: [
      textbox('down-title', 24, 12, 700, 42, 'Downtime Analysis'),
      slicer('down-date', 850, 10, 190, ['Dim Date', 'date'], 'Date'),
      slicer('down-band', 1050, 10, 206, ['Fact Downtime Events', 'duration_band'], 'Duration band'),
      card('down-kpis', 24, 66, 1232, 112, ['Downtime Events', 'Event Downtime Minutes', 'Average Event Duration Minutes', 'Median Event Duration Minutes', 'Long Stop Event Rate'], 'Downtime event summary'),
      chart('down-band-chart', 'clusteredColumnChart', 24, 194, 392, 238, ['Fact Downtime Events', 'duration_band'], ['Event Downtime Minutes'], 'Downtime minutes by duration band'),
      custom('down-trend', 'lineClusteredColumnComboChart', 432, 194, 392, 238, { Category: { projections: [col('Dim Date', 'date')] }, Y: { projections: [measure('Downtime Events')] }, Y2: { projections: [measure('Event Downtime Minutes')] } }, 'Events and minutes by date'),
      table('down-heatmap', 840, 194, 416, 238, [
        { table: 'Dim Date', name: 'day_of_week', role: 'Rows' }, { table: 'Fact Downtime Events', name: 'start_hour', role: 'Columns' }, { kind: 'measure', name: 'Downtime Events', role: 'Values' },
      ], 'Event-count heatmap', 'pivotTable'),
      table('down-detail', 24, 448, 1232, 240, [
        { table: 'Fact Downtime Events', name: 'downtime_id' }, { table: 'Fact Downtime Events', name: 'downtime_start_ts' }, { table: 'Fact Downtime Events', name: 'downtime_end_ts' }, { table: 'Fact Downtime Events', name: 'reported_duration_minutes' }, { table: 'Fact Downtime Events', name: 'duration_band' },
      ], 'Downtime event detail'),
    ],
  },
  {
    name: 'ReportSectionQuality', displayName: 'Data Quality & Governance', visuals: [
      textbox('quality-title', 24, 12, 700, 42, 'Data Quality & Governance'),
      card('quality-review', 24, 74, 384, 112, ['Quality Checks Requiring Review'], 'Checks requiring review'),
      card('quality-match', 424, 74, 384, 112, ['Hourly Source Match Rate'], 'Hourly source match rate'),
      card('quality-rows', 824, 74, 432, 112, ['Validated Daily Rows', 'Validated Hourly Rows', 'Validated Downtime Events'], 'Validated dataset rows'),
      table('quality-table', 24, 202, 760, 290, [
        { table: 'Data Quality Report', name: 'check_name' }, { table: 'Data Quality Report', name: 'severity' }, { table: 'Data Quality Report', name: 'status' }, { table: 'Data Quality Report', name: 'affected_rows' }, { table: 'Data Quality Report', name: 'affected_pct' }, { table: 'Data Quality Report', name: 'rule' },
      ], 'Validation results'),
      chart('quality-coverage', 'clusteredColumnChart', 800, 202, 456, 290, ['Fact Hourly Performance', 'source_coverage'], ['Hourly Records'], 'Hourly source coverage'),
      textbox('quality-note', 24, 514, 1232, 174, 'What requires review\n• Six duplicate raw hourly operation records are removed deterministically during ETL.\n• Sixteen hour keys appear in only one of the two hourly source tables and remain visible through source_coverage.\n• Fifteen daily records trigger time-reconciliation review warnings. These are surfaced, not silently corrected.\n\nProvenance: every figure originates from the checked-in XLSX, passes automated validation, and is published as versioned CSV/SQLite outputs.', 15, '#263238'),
    ],
  },
];

writeJson(path.join(root, 'Manufacturing Operations Analytics.pbip'), {
  $schema: 'https://developer.microsoft.com/json-schemas/fabric/pbip/pbipProperties/1.0.0/schema.json', version: '1.0',
  artifacts: [{ report: { path: 'Manufacturing Operations Analytics.Report' } }], settings: { enableAutoRecovery: true },
});
writeJson(path.join(report, 'definition.pbir'), {
  $schema: 'https://developer.microsoft.com/json-schemas/fabric/item/report/definitionProperties/2.0.0/schema.json', version: '4.0',
  datasetReference: { byPath: { path: '../Manufacturing Operations Analytics.SemanticModel' } },
});
writeJson(path.join(report, '.platform'), {
  $schema: 'https://developer.microsoft.com/json-schemas/fabric/gitIntegration/platformProperties/2.0.0/schema.json',
  metadata: { type: 'Report', displayName: 'Manufacturing Operations Analytics' },
  config: { version: '2.0', logicalId: 'cc453fbe-2dd6-44d4-9e48-91d889f80d4f' },
});
writeJson(path.join(model, '.platform'), {
  $schema: 'https://developer.microsoft.com/json-schemas/fabric/gitIntegration/platformProperties/2.0.0/schema.json',
  metadata: { type: 'SemanticModel', displayName: 'Manufacturing Operations Analytics' },
  config: { version: '2.0', logicalId: '85171d2e-e76e-4b8a-82ed-9bfdba251070' },
});
writeJson(path.join(definition, 'version.json'), { $schema: `${schema}/versionMetadata/1.0.0/schema.json`, version: '2.0.0' });
writeJson(path.join(definition, 'report.json'), {
  $schema: `${schema}/report/3.1.0/schema.json`,
  themeCollection: { customTheme: { name: 'ManufacturingOperationsAnalytics.json', reportVersionAtImport: { visual: '2.6.0', report: '3.1.0', page: '2.3.0' }, type: 'RegisteredResources' } },
  resourcePackages: [{ name: 'RegisteredResources', type: 'RegisteredResources', items: [{ name: 'ManufacturingOperationsAnalytics.json', path: 'ManufacturingOperationsAnalytics.json', type: 'CustomTheme' }] }],
  settings: { defaultDrillFilterOtherVisuals: true, allowChangeFilterTypes: true, useStylableVisualContainerHeader: true },
});
writeJson(path.join(pagesRoot, 'pages.json'), { $schema: `${schema}/pagesMetadata/1.0.0/schema.json`, pageOrder: pageDefs.map((p) => p.name), activePageName: pageDefs[0].name });
for (const page of pageDefs) {
  const dir = path.join(pagesRoot, page.name);
  const pageJson = { $schema: `${schema}/page/2.1.0/schema.json`, name: page.name, displayName: page.displayName, displayOption: 'FitToPage', height: 720, width: 1280 };
  if (page.name === 'ReportSectionQuality') {
    const qualityTable = id('quality-table');
    pageJson.visualInteractions = page.visuals
      .filter((visual) => visual.name !== qualityTable)
      .flatMap((visual) => [
        { source: qualityTable, target: visual.name, type: 'NoFilter' },
        { source: visual.name, target: qualityTable, type: 'NoFilter' },
      ]);
  }
  writeJson(path.join(dir, 'page.json'), pageJson);
  for (const visual of page.visuals) writeJson(path.join(dir, 'visuals', visual.name, 'visual.json'), visual);
}
fs.copyFileSync(path.join(repo, 'powerbi', 'theme.json'), path.join(report, 'StaticResources', 'RegisteredResources', 'ManufacturingOperationsAnalytics.json'));
const themePath = path.join(report, 'StaticResources', 'RegisteredResources', 'ManufacturingOperationsAnalytics.json');
const theme = JSON.parse(fs.readFileSync(themePath, 'utf8'));
theme.name = 'ManufacturingOperationsAnalytics.json';
writeJson(themePath, theme);

writeJson(path.join(model, 'definition.pbism'), {
  $schema: 'https://developer.microsoft.com/json-schemas/fabric/item/semanticModel/definitionProperties/1.0.0/schema.json', version: '4.2', settings: { qnaEnabled: true },
});
write(path.join(model, 'definition', 'database.tmdl'), `database ManufacturingOperationsAnalytics\n\tcompatibilityLevel: 1702\n\tcompatibilityMode: powerBI\n\tlanguage: 1033\n`);
write(path.join(model, 'definition', 'model.tmdl'), `model Model\n\tculture: en-GB\n\tdefaultPowerBIDataSourceVersion: powerBI_V3\n\tsourceQueryCulture: en-GB\n\nref table 'Dim Date'\nref table 'Dim Product'\nref table 'Fact Daily Production'\nref table 'Fact Hourly Performance'\nref table 'Fact Downtime Events'\nref table 'Data Quality Report'\nref table ${measureTable}\n`);

const githubBase = 'https://raw.githubusercontent.com/agbajames/manufacturing-operations-analytics/main/data/processed';
const typeM = { string: 'type text', int64: 'Int64.Type', double: 'type number', date: 'type datetime', datetime: 'type datetime', logical: 'type logical' };
const tmdlType = { string: 'string', int64: 'int64', double: 'double', date: 'dateTime', datetime: 'dateTime', logical: 'boolean' };
function tableTmdl(name, file, columns, options = {}) {
  const sortBy = { month_name: 'month_number', day_of_week: 'day_of_week_number', duration_band: 'duration_band_sort' };
  const colDefs = columns.map(([n, t, hidden = false]) => `\tcolumn '${n}'\n\t\tdataType: ${tmdlType[t] ?? 'string'}\n${hidden ? '\t\tisHidden\n' : ''}\t\tsummarizeBy: none\n\t\tsourceColumn: ${n}${sortBy[n] ? `\n\t\tsortByColumn: ${sortBy[n]}` : ''}`).join('\n\n');
  const isDowntime = name === 'Fact Downtime Events';
  const extraColumns = isDowntime ? `\n\n\tcolumn duration_band_sort\n\t\tdataType: int64\n\t\tisHidden\n\t\tsummarizeBy: none\n\t\tsourceColumn: duration_band_sort` : '';
  const extraTransforms = isDowntime ? `,\n\t\t\t\tDurationBandSort = Table.AddColumn(Typed, \"duration_band_sort\", each if [reported_duration_minutes] < 1 then 1 else if [reported_duration_minutes] < 5 then 2 else if [reported_duration_minutes] < 15 then 3 else if [reported_duration_minutes] < 60 then 4 else 5, Int64.Type)` : '';
  const finalStep = isDowntime ? 'DurationBandSort' : 'Typed';
  const transforms = columns.map(([n, t]) => `{\"${n}\", ${typeM[t] ?? 'type text'}}`).join(', ');
  return `table '${name}'\n${options.dataCategory ? `\tdataCategory: ${options.dataCategory}\n` : ''}\n${colDefs}${extraColumns}\n\n\tpartition '${name}' = m\n\t\tmode: import\n\t\tsource =\n\t\t\tlet\n\t\t\t\tSource = Csv.Document(Web.Contents(\"${githubBase}/${file}\"), [Delimiter=\",\", Encoding=65001, QuoteStyle=QuoteStyle.Csv]),\n\t\t\t\tHeaders = Table.PromoteHeaders(Source, [PromoteAllScalars=true]),\n\t\t\t\tTyped = Table.TransformColumnTypes(Headers, {${transforms}}, \"en-GB\")${extraTransforms}\n\t\t\tin\n\t\t\t\t${finalStep}\n`;
}
const tables = [
  ['Dim Date', 'dim_date.csv', [['date_key','int64',true],['date','date'],['year','int64'],['quarter','string'],['month_number','int64'],['month_name','string'],['year_month','string'],['day_of_week_number','int64'],['day_of_week','string'],['is_weekend','logical']], { dataCategory: 'Time' }],
  ['Dim Product', 'dim_product.csv', [['product_key','string',true],['product_type_l','int64'],['product_name','string'],['volume_litres_per_unit','int64']]],
  ['Fact Daily Production', 'fact_daily_production.csv', [['date_key','int64',true],['date','date'],['product_key','string',true],['product_type_l','int64'],['production_units','int64'],['liters_produced','int64'],['production_start_ts','datetime'],['production_end_ts','datetime'],['published_efficiency','double'],['calculated_efficiency','double'],['published_gallons_per_hour','double'],['monitored_hours','double'],['operating_hours','double'],['downtime_hours','double'],['time_reconciliation_variance_h','double'],['litres_reconciliation_variance','double']]],
  ['Fact Hourly Performance', 'fact_hourly_performance.csv', [['hour_key','int64'],['date_key','int64',true],['date','date'],['hour_start','int64'],['hour_end','int64'],['hour_start_ts','datetime'],['hour_end_ts','datetime'],['production_units_reported','double'],['operation_record_count','double'],['monitored_time_h','double'],['operation_time_h','double'],['downtime_h','double'],['published_efficiency','double'],['calculated_efficiency','double'],['time_reconciliation_variance_h','double'],['source_coverage','string']]],
  ['Fact Downtime Events', 'fact_downtime_events.csv', [['downtime_id','string'],['date_key','int64',true],['date','date'],['downtime_start_ts','datetime'],['downtime_end_ts','datetime'],['start_hour','int64'],['reported_duration_minutes','double'],['calculated_duration_minutes','double'],['duration_variance_seconds','double'],['duration_band','string']]],
  ['Data Quality Report', 'data_quality_report.csv', [['check_name','string'],['severity','string'],['status','string'],['affected_rows','int64'],['rows_tested','int64'],['affected_pct','double'],['rule','string']]],
];
for (const [name, file, columns, options] of tables) write(path.join(model, 'definition', 'tables', `${name}.tmdl`), tableTmdl(name, file, columns, options));

write(path.join(model, 'definition', 'relationships.tmdl'), `relationship 'Daily to Date'\n\tfromColumn: 'Fact Daily Production'.date_key\n\ttoColumn: 'Dim Date'.date_key\n\nrelationship 'Hourly to Date'\n\tfromColumn: 'Fact Hourly Performance'.date_key\n\ttoColumn: 'Dim Date'.date_key\n\nrelationship 'Downtime to Date'\n\tfromColumn: 'Fact Downtime Events'.date_key\n\ttoColumn: 'Dim Date'.date_key\n\nrelationship 'Daily to Product'\n\tfromColumn: 'Fact Daily Production'.product_key\n\ttoColumn: 'Dim Product'.product_key\n`);

const measures = [
  ['Total Production Units', "SUM ( 'Fact Daily Production'[production_units] )", '#,##0'],
  ['Total Litres Produced', "SUM ( 'Fact Daily Production'[liters_produced] )", '#,##0'],
  ['Production Days', "DISTINCTCOUNT ( 'Fact Daily Production'[date_key] )", '#,##0'],
  ['Monitored Hours', "SUM ( 'Fact Daily Production'[monitored_hours] )", '#,##0.0'],
  ['Operating Hours', "SUM ( 'Fact Daily Production'[operating_hours] )", '#,##0.0'],
  ['Downtime Hours', "SUM ( 'Fact Daily Production'[downtime_hours] )", '#,##0.0'],
  ['Operational Efficiency', 'DIVIDE ( [Operating Hours], [Monitored Hours] )', '0.0%'],
  ['Units per Operating Hour', 'DIVIDE ( [Total Production Units], [Operating Hours] )', '#,##0.0'],
  ['Downtime Events', "DISTINCTCOUNT ( 'Fact Downtime Events'[downtime_id] )", '#,##0'],
  ['Event Downtime Minutes', "SUM ( 'Fact Downtime Events'[reported_duration_minutes] )", '#,##0.0'],
  ['Average Event Duration Minutes', "AVERAGE ( 'Fact Downtime Events'[reported_duration_minutes] )", '#,##0.0'],
  ['Median Event Duration Minutes', "MEDIAN ( 'Fact Downtime Events'[reported_duration_minutes] )", '#,##0.0'],
  ['Long Stop Events', "CALCULATE ( [Downtime Events], 'Fact Downtime Events'[reported_duration_minutes] >= 15 )", '#,##0'],
  ['Long Stop Event Rate', 'DIVIDE ( [Long Stop Events], [Downtime Events] )', '0.0%'],
  ['Hourly Records', "COUNTROWS ( 'Fact Hourly Performance' )", '#,##0'],
  ['Hourly Reported Output', "SUM ( 'Fact Hourly Performance'[production_units_reported] )", '#,##0'],
  ['Hourly Calculated Efficiency', "DIVIDE ( SUM ( 'Fact Hourly Performance'[operation_time_h] ), SUM ( 'Fact Hourly Performance'[monitored_time_h] ) )", '0.0%'],
  ['Matched Hourly Records', "CALCULATE ( [Hourly Records], 'Fact Hourly Performance'[source_coverage] = \"Both\" )", '#,##0'],
  ['Hourly Source Match Rate', 'DIVIDE ( [Matched Hourly Records], [Hourly Records] )', '0.0%'],
  ['Quality Checks Requiring Review', "CALCULATE ( COUNTROWS ( 'Data Quality Report' ), 'Data Quality Report'[status] = \"REVIEW\" )", '#,##0'],
  ['Validated Daily Rows', "COUNTROWS ( 'Fact Daily Production' )", '#,##0'],
  ['Validated Hourly Rows', "COUNTROWS ( 'Fact Hourly Performance' )", '#,##0'],
  ['Validated Downtime Events', "COUNTROWS ( 'Fact Downtime Events' )", '#,##0'],
];
const measureDefs = measures.map(([name, dax, fmt]) => `\tmeasure '${name}' = ${dax}\n\t\tformatString: ${fmt}`).join('\n\n');
write(path.join(model, 'definition', 'tables', `${measureTable}.tmdl`), `table ${measureTable}\n\n${measureDefs}\n\n\tcolumn Dummy\n\t\tdataType: string\n\t\tisHidden\n\t\tsourceColumn: [Dummy]\n\n\tpartition ${measureTable} = calculated\n\t\tmode: import\n\t\tsource = ROW ( \"Dummy\", BLANK () )\n`);

console.log(`Built ${pageDefs.length} report pages at ${root}`);
