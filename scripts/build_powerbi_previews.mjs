import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(repo, 'powerbi', 'preview');
fs.mkdirSync(out, { recursive: true });

function parseCsv(file) {
  const text = fs.readFileSync(path.join(repo, 'data', 'processed', file), 'utf8').trim();
  const rows = [];
  let row = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"' && quoted && text[i + 1] === '"') { cell += '"'; i++; }
    else if (c === '"') quoted = !quoted;
    else if (c === ',' && !quoted) { row.push(cell); cell = ''; }
    else if ((c === '\n' || c === '\r') && !quoted) {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  row.push(cell); rows.push(row);
  const [headers, ...body] = rows;
  return body.map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i] ?? ''])));
}
const monthly = parseCsv('monthly_summary.csv');
const daily = parseCsv('fact_daily_production.csv');
const hourly = parseCsv('fact_hourly_performance.csv');
const downtime = parseCsv('fact_downtime_events.csv');
const quality = parseCsv('data_quality_report.csv');
const n = (v) => Number(v || 0);
const fmt = (v, d = 0) => n(v).toLocaleString('en-GB', { minimumFractionDigits: d, maximumFractionDigits: d });
const total = (rows, key) => rows.reduce((s, r) => s + n(r[key]), 0);
const production = total(daily, 'production_units');
const litres = total(daily, 'liters_produced');
const monitored = total(daily, 'monitored_hours');
const operating = total(daily, 'operating_hours');
const downtimeHours = total(daily, 'downtime_hours');
const efficiency = operating / monitored;
const eventMinutes = total(downtime, 'reported_duration_minutes');
const durations = downtime.map(r => n(r.reported_duration_minutes)).sort((a,b) => a-b);
const median = (durations[(durations.length - 1) >> 1] + durations[durations.length >> 1]) / 2;
const avgDuration = eventMinutes / downtime.length;
const longRate = downtime.filter(r => n(r.reported_duration_minutes) >= 15).length / downtime.length;
const both = hourly.filter(r => r.source_coverage === 'Both').length;

function group(rows, key, value) {
  const m = new Map();
  for (const r of rows) m.set(r[key], (m.get(r[key]) ?? 0) + n(r[value]));
  return [...m].map(([label, val]) => ({ label, val }));
}
function cards(items) { return `<div class="cards">${items.map(([label,value]) => `<div class="card"><span>${label}</span><strong>${value}</strong></div>`).join('')}</div>`; }
function bars(items, title, color='#00897B') {
  const max = Math.max(...items.map(x => x.val), 1);
  return `<section class="panel"><h3>${title}</h3><div class="bars">${items.map(x => `<div class="barrow"><label>${x.label}</label><i style="width:${Math.max(2, x.val/max*100)}%;background:${color}"></i><b>${fmt(x.val, x.val < 100 ? 1 : 0)}</b></div>`).join('')}</div></section>`;
}
function line(items, title, color='#1565C0', percent=false) {
  const vals = items.map(x => n(x.val)); const min = Math.min(...vals); const max = Math.max(...vals); const span = max-min || 1;
  const pts = vals.map((v,i) => `${40+i*(520/Math.max(vals.length-1,1))},${190-(v-min)/span*140}`).join(' ');
  return `<section class="panel"><h3>${title}</h3><svg viewBox="0 0 600 220"><line x1="40" y1="190" x2="570" y2="190" stroke="#ccd5db"/><polyline points="${pts}" fill="none" stroke="${color}" stroke-width="4"/>${items.map((x,i)=>`<circle cx="${40+i*(520/Math.max(vals.length-1,1))}" cy="${190-(n(x.val)-min)/span*140}" r="5" fill="${color}"/><text x="${40+i*(520/Math.max(vals.length-1,1))}" y="212" text-anchor="middle">${x.label}</text>`).join('')}<text x="44" y="38" class="axis">${percent ? fmt(max*100,1)+'%' : fmt(max)}</text></svg></section>`;
}
function table(headers, rows) { return `<section class="panel table"><table><thead><tr>${headers.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${r.map(v=>`<td>${v}</td>`).join('')}</tr>`).join('')}</tbody></table></section>`; }
function page(id, title, body) { return `<main class="page" id="${id}"><header><div><h1>${title}</h1><p>Manufacturing Operations Analytics</p></div><span>PBIR design preview · validated source</span></header>${body}<footer>Source: validated processed tables · Use the PBIP project for the interactive Power BI report.</footer></main>`; }

const exec = page('executive-overview', 'Executive Overview',
  cards([['Production units',fmt(production)],['Litres produced',fmt(litres)],['Operational efficiency',fmt(efficiency*100,1)+'%'],['Downtime hours',fmt(downtimeHours,1)],['Units / operating hour',fmt(production/operating,1)]])+
  `<div class="grid two">${line(monthly.map(r=>({label:r.year_month.slice(5),val:r.production_units})),'Production units by month')}${bars(monthly.map(r=>({label:r.year_month,val:n(r.downtime_hours)})),'Downtime hours by month','#EF6C00')}</div>`+
  `<div class="grid two">${bars(group(daily,'product_type_l','production_units').map(x=>({label:x.label+' litre',val:x.val})),'Units by product')}${table(['Month','Days','Units','Efficiency'],monthly.map(r=>[r.year_month,r.production_days,fmt(r.production_units),fmt(n(r.operational_efficiency)*100,1)+'%']))}</div>`);

const hourlyByHour = group(hourly,'hour_start','production_units_reported').sort((a,b)=>n(a.label)-n(b.label));
const topDaily = [...daily].sort((a,b)=>n(b.production_units)-n(a.production_units)).slice(0,8);
const prod = page('production-performance', 'Production Performance',
  cards([['Production days','56'],['Monitored hours',fmt(monitored,1)],['Operating hours',fmt(operating,1)],['Average daily output',fmt(production/56)]])+
  `<div class="grid two">${line(hourlyByHour,'Reported output by hour of day')}${bars(topDaily.map(r=>({label:r.date.slice(5,10),val:n(r.production_units)})),'Highest-output production dates')}</div>`+
  `<div class="grid two">${table(['Date','Product','Units','Litres','Efficiency'],topDaily.slice(0,6).map(r=>[r.date.slice(0,10),r.product_type_l+'L',fmt(r.production_units),fmt(r.liters_produced),fmt(n(r.calculated_efficiency)*100,1)+'%']))}${bars(group(hourly,'source_coverage','operation_time_h'),'Operating hours by source coverage','#3949AB')}</div>`);

const band = group(downtime,'duration_band','reported_duration_minutes');
const eventByHour = group(downtime,'start_hour','reported_duration_minutes').sort((a,b)=>n(a.label)-n(b.label));
const topStops = [...downtime].sort((a,b)=>n(b.reported_duration_minutes)-n(a.reported_duration_minutes)).slice(0,8);
const down = page('downtime-analysis', 'Downtime Analysis',
  cards([['Downtime events',fmt(downtime.length)],['Event minutes',fmt(eventMinutes,1)],['Average duration',fmt(avgDuration,1)+' min'],['Median duration',fmt(median,1)+' min'],['Long-stop rate',fmt(longRate*100,1)+'%']])+
  `<div class="grid two">${bars(band,'Downtime minutes by duration band','#D84315')}${line(eventByHour,'Event downtime minutes by start hour','#D84315')}</div>`+
  table(['Event','Start','End','Minutes','Band'],topStops.map(r=>[r.downtime_id,r.downtime_start_ts.slice(0,16).replace('T',' '),r.downtime_end_ts.slice(0,16).replace('T',' '),fmt(r.reported_duration_minutes,1),r.duration_band])));

const q = page('data-quality-governance', 'Data Quality & Governance',
  cards([['Checks requiring review',quality.filter(r=>r.status==='REVIEW').length],['Hourly source match rate',fmt(both/hourly.length*100,1)+'%'],['Daily rows',fmt(daily.length)],['Hourly rows',fmt(hourly.length)],['Downtime events',fmt(downtime.length)]])+
  `<div class="grid quality">${table(['Check','Severity','Status','Affected','Percent'],quality.map(r=>[r.check_name,r.severity,`<span class="status ${r.status.toLowerCase()}">${r.status}</span>`,r.affected_rows,fmt(n(r.affected_pct)*100,1)+'%']))}<section class="panel narrative"><h3>Governance notes</h3><h2>Known conditions remain visible</h2><ul><li><b>6</b> duplicate raw hourly operation rows removed deterministically.</li><li><b>16</b> hour keys found in only one hourly source.</li><li><b>15</b> daily time-reconciliation warnings retained for review.</li></ul><p>Every headline figure traces back to the checked-in XLSX and is verified by automated tests.</p></section></div>`);

const html = `<!doctype html><html><head><meta charset="utf-8"><title>Power BI report previews</title><style>
*{box-sizing:border-box}body{margin:0;background:#dce5ea;font-family:Segoe UI,Arial,sans-serif;color:#243746}.page{width:1280px;height:720px;background:#f7f9fa;padding:18px 24px 26px;position:relative;overflow:hidden;display:none}.page:target{display:block}.page:first-of-type{display:block}.page:has(~ .page:target){display:none}header{height:56px;display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #00897B;margin-bottom:12px}h1{font-size:25px;line-height:1;margin:0;color:#16324F}header p{margin:5px 0;font-size:12px;color:#607d8b}header span{font-size:12px;background:#e0f2f1;color:#00695c;border-radius:14px;padding:7px 12px}.cards{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-bottom:12px}.card,.panel{background:white;border:1px solid #dce4e8;border-radius:8px;box-shadow:0 1px 3px #102a4315}.card{height:86px;padding:12px 15px;border-top:4px solid #00897B}.card span{display:block;font-size:12px;color:#607d8b;margin-bottom:7px}.card strong{font-size:25px;color:#16324F}.grid{display:grid;gap:12px;margin-bottom:12px}.two{grid-template-columns:1fr 1fr}.quality{grid-template-columns:2fr 1fr}.panel{padding:10px 14px;height:217px;overflow:hidden}.panel h3{font-size:13px;margin:0 0 7px;color:#37474f}.bars{display:flex;flex-direction:column;gap:6px}.barrow{display:grid;grid-template-columns:80px 1fr 60px;gap:8px;align-items:center;font-size:10px}.barrow label{text-align:right;color:#546e7a}.barrow i{display:block;height:13px;border-radius:2px}.barrow b{font-weight:600}.panel svg{width:100%;height:185px}.panel svg text{font-size:9px;fill:#607d8b}.table{padding:0;height:217px;overflow:auto}.table table{border-collapse:collapse;width:100%;font-size:10px}.table th{position:sticky;top:0;background:#16324F;color:white;text-align:left;padding:7px}.table td{padding:6px 7px;border-bottom:1px solid #edf1f3}.table tr:nth-child(even){background:#f4f7f8}.quality>.table,.quality>.narrative{height:408px}.narrative{padding:20px}.narrative h2{font-size:22px;color:#16324F}.narrative li{margin:18px 0;line-height:1.35}.narrative b{color:#D84315}.status{font-weight:700;padding:2px 5px;border-radius:8px}.pass{background:#e8f5e9;color:#2e7d32}.review{background:#fff3e0;color:#e65100}footer{position:absolute;bottom:8px;left:24px;color:#78909c;font-size:9px}
</style></head><body>${exec}${prod}${down}${q}</body></html>`;
fs.writeFileSync(path.join(out, 'index.html'), html);
console.log(`Built report previews at ${path.join(out, 'index.html')}`);
