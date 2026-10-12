// Generates the Force America current-staff demo file:
//   samples/Force America - Current Staff Demo.xlsx (and .csv)
// It uses the eight positions and departments from Force America's pre-hire file
// (spelled exactly as in that file, so turnover matches by position) and adds
// recent leavers, so a staff run builds the turnover table that the pre-hire run
// then uses. Every person is fictional (example.com addresses, 555-01xx phones).
const fs = require('fs');
const path = require('path');
const Papa = require('papaparse');
const ExcelJS = require('exceljs');
const { seededRandom } = require('../server/providers/util');

const rnd = seededRandom('apax-force-america-demo-v1');
const pick = (a) => a[Math.floor(rnd() * a.length)];
const between = (a, b) => a + rnd() * (b - a);
const FIRST = ['Aiden', 'Brooke', 'Caleb', 'Dana', 'Eli', 'Faith', 'Gavin', 'Hannah', 'Isaac', 'Jenna', 'Kyle', 'Leah', 'Mason', 'Nora', 'Owen', 'Paige', 'Quentin', 'Rachel', 'Seth', 'Tessa', 'Usher', 'Violet', 'Wyatt', 'Zoe', 'Grant', 'Molly', 'Trent', 'Ivy', 'Cole', 'Jade', 'Reid', 'Sadie'];
const LAST = ['Anderson', 'Bjork', 'Carlson', 'Dahl', 'Erickson', 'Fischer', 'Gustafson', 'Hanson', 'Isaacson', 'Johansen', 'Kowalski', 'Larsen', 'Moen', 'Nelson', 'Olson', 'Peterson', 'Quist', 'Rasmussen', 'Swanson', 'Thorson', 'Ulrich', 'Voss', 'Wahl', 'Youngquist', 'Zimmer', 'Berg', 'Lund', 'Strand', 'Holm', 'Engel'];
const INITIAL = 'ABCDEFGHJKLMNPRSTW';

// Positions and departments exactly as in Force America's file.
const ROLES = [
  { job: 'Material Handler', dept: 'Warehouse Operations', active: 24, leavers: 9, salary: [38000, 46000], years: [0.2, 6], code: 'FA-1001' },
  { job: 'Hose Assembly Technician', dept: 'Manufacturing', active: 20, leavers: 6, salary: [42000, 52000], years: [0.3, 9], code: 'FA-1002' },
  { job: 'Mechnical Inside Sales', dept: 'Sales', active: 10, leavers: 3, salary: [55000, 75000], years: [0.5, 10], code: 'FA-1003' },
  { job: 'Product Marketing', dept: 'Marketing', active: 5, leavers: 1, salary: [70000, 95000], years: [1, 8], code: 'FA-1004' },
  { job: 'Engineering', dept: 'Engineering', active: 9, leavers: 1, salary: [85000, 120000], years: [1, 14], code: 'FA-1005' },
  { job: 'Field Services', dept: 'Field Service', active: 12, leavers: 3, salary: [62000, 80000], years: [0.5, 12], code: 'FA-1006' },
  { job: 'Machinist', dept: 'Manufacturing', active: 14, leavers: 3, salary: [55000, 72000], years: [0.5, 18], code: 'FA-1007' },
  { job: 'Information Services', dept: 'Information Technology', active: 6, leavers: 1, salary: [75000, 105000], years: [1, 12], code: 'FA-1008' },
];
// South-metro towns and approximate miles to the Bloomington, MN site.
const TOWNS = [
  ['Bloomington', 'MN', '55431', 2.1], ['Bloomington', 'MN', '55420', 3.4], ['Richfield', 'MN', '55423', 5.2], ['Burnsville', 'MN', '55337', 6.3],
  ['Eagan', 'MN', '55122', 7.4], ['Edina', 'MN', '55435', 5.8], ['Savage', 'MN', '55378', 9.6], ['Apple Valley', 'MN', '55124', 10.9],
  ['Eden Prairie', 'MN', '55344', 9.1], ['Lakeville', 'MN', '55044', 16.8], ['Prior Lake', 'MN', '55372', 15.2], ['Shakopee', 'MN', '55379', 14.7],
  ['Minneapolis', 'MN', '55407', 10.3], ['St. Paul', 'MN', '55116', 11.5], ['Farmington', 'MN', '55024', 21.3], ['Rosemount', 'MN', '55068', 17.9],
  ['Chaska', 'MN', '55318', 20.6], ['Northfield', 'MN', '55057', 33.8], ['New Prague', 'MN', '56071', 37.5], ['Hastings', 'MN', '55033', 26.4],
];
const STREETS = ['Lyndale', 'Penn', 'France', 'Normandale', 'Cliff', 'Old Shakopee', 'Nicollet', 'Portland', 'Cedar', 'Pilot Knob', 'Burnsville', 'County Road 42'];
const fmt = (d) => `${d.getUTCMonth() + 1}/${d.getUTCDate()}/${d.getUTCFullYear()}`;
const daysAgo = (n) => new Date(Date.now() - Math.round(n) * 86400000);
const REASONS = ['Another Job', 'Resigned', 'Better Pay Elsewhere', 'Relocation', 'Personal Reasons', 'Schedule Conflict'];

let serial = 0;
const rows = [];
function add(role, terminated) {
  const i = serial++;
  const first = FIRST[(i * 7 + 3) % FIRST.length];
  const last = LAST[(i * 11 + Math.floor(i / FIRST.length)) % LAST.length];
  const [city, st, zip, miles] = pick(TOWNS);
  const termDays = terminated ? between(15, 340) : 0;
  rows.push({
    'Employee Number': 70100 + i,
    'Employee Name (Last Suffix, First MI)': `${last}, ${first} ${INITIAL[i % INITIAL.length]}`,
    'Address Line 1 + Address Line 2': `${100 + Math.floor(rnd() * 9800)} ${pick(STREETS)} ${pick(['Ave S', 'Rd', 'St', 'Blvd', 'Ln', 'Ct'])}`,
    'City, State Zip Code (Formatted)': `${city}, ${st} ${zip}`,
    'E-mail Address': `${first}.${last}${i}@example.com`.toLowerCase(),
    'Home Phone (Formatted)': `(952) 555-01${String(i % 100).padStart(2, '0')}`,
    'Hire Date': fmt(daysAgo(termDays + between(...role.years) * 365)),
    'Term Date': terminated ? fmt(daysAgo(termDays)) : '',
    'Termination Reason': terminated ? pick(REASONS) : '',
    'Employment Status': terminated ? 'Terminated' : 'Active',
    Organization: 'Force America',
    Division: ['Material Handler', 'Hose Assembly Technician', 'Machinist'].includes(role.job) ? 'Operations' : 'Commercial and Support',
    Department: role.dept,
    'Job Class': role.job,
    'Job Code': role.code,
    'Distance (Miles)': Math.round(Math.max(0.8, miles + between(-1.5, 2.5)) * 10) / 10,
    'Annual Salary': Math.round(between(...role.salary) / 500) * 500,
  });
}
for (const r of ROLES) { for (let k = 0; k < r.active; k++) add(r, false); for (let k = 0; k < r.leavers; k++) add(r, true); }
for (let i = rows.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [rows[i], rows[j]] = [rows[j], rows[i]]; }

(async () => {
  const dir = path.join(__dirname, '..', 'samples');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'Force America - Current Staff Demo.csv'), Papa.unparse(rows));
  const wb = new ExcelJS.Workbook();
  wb.creator = 'The Apax Group';
  const ws = wb.addWorksheet('Active Staff');
  ws.columns = Object.keys(rows[0]).map((h) => ({ header: h, key: h, width: Math.max(12, Math.min(38, h.length + 2)) }));
  rows.forEach((r) => ws.addRow(r));
  ws.getRow(1).font = { bold: true };
  await wb.xlsx.writeFile(path.join(dir, 'Force America - Current Staff Demo.xlsx'));
  const leavers = ROLES.reduce((a, r) => a + r.leavers, 0);
  console.log(`Force America: ${rows.length} staff rows (${leavers} leavers)`);
})();
