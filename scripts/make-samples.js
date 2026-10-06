// Generates the demo files for the Dorsey & Whitney walkthrough:
//   samples/prehire_sample.csv          pre-hire candidates, in Dorsey's own column layout
//   samples/Dorsey - Pre-hire Demo.xlsx same candidates as an Excel file (sheet "Summary", like Dorsey's file)
//   samples/current_staff_sample.csv    current staff roster with recent leavers (drives job-class turnover)
// plus the blank templates in /public/templates.
// Every person is fictional (example.com addresses, 555-01xx phone numbers).
// The test suite uses its own fixed files in tests/fixtures, not these.
const fs = require('fs');
const path = require('path');
const Papa = require('papaparse');
const ExcelJS = require('exceljs');
const { seededRandom } = require('../server/providers/util');

const rnd = seededRandom('apax-dorsey-demo-v1');
const pick = (a) => a[Math.floor(rnd() * a.length)];
const between = (a, b) => a + rnd() * (b - a);
const FIRST = ['Avery', 'Jordan', 'Riley', 'Casey', 'Morgan', 'Taylor', 'Quinn', 'Harper', 'Rowan', 'Emerson', 'Parker', 'Reese', 'Skyler', 'Dakota', 'Hayden', 'Kendall', 'Logan', 'Peyton', 'Sawyer', 'Blake', 'Cameron', 'Drew', 'Elliot', 'Finley', 'Greer', 'Hollis', 'Indra', 'Jules', 'Kai', 'Lane', 'Marlowe', 'Noel', 'Oren', 'Paxton', 'Remy', 'Sloane', 'Tatum', 'Wren'];
const LAST = ['Ashford', 'Bellamy', 'Carrow', 'Dunmore', 'Ellison', 'Fairbanks', 'Garrity', 'Holloway', 'Iverson', 'Jessup', 'Kingsley', 'Lockhart', 'Merriweather', 'Northcott', 'Oakley', 'Pembrook', 'Quimby', 'Rutherford', 'Stanwick', 'Thornbury', 'Underhill', 'Vance', 'Whitlock', 'Yardley', 'Almquist', 'Bergstrom', 'Dahlberg', 'Engstrom', 'Halvorsen', 'Lindqvist', 'Nygaard', 'Sorensen'];
const INITIAL = 'ABCDEFGHJKLMNPRSTW';

// Dorsey's positions file (Source Job column), spelled exactly as Dorsey has them.
const POS = {
  junior: 'Junior Associate (Corporate Law)',
  mid: 'Mid-Level Associate (M&A)',
  senior: 'Senior Associate (Business Litigation)',
  partner: 'Partner',
  summer: 'Summer Associate/Intern.',
  paralegal: 'Paralegal',
  assistant: 'Legal Assistant',
  is: 'Information Services',
  admin: 'Administrative ',
};
const PRACTICE = ['Corporate', 'Mergers & Acquisitions', 'Business Litigation'];
const DEPT = {
  junior: () => 'Corporate',
  mid: () => 'Mergers & Acquisitions',
  senior: () => 'Business Litigation',
  partner: () => pick(PRACTICE),
  summer: () => 'Legal Recruiting',
  paralegal: () => pick(PRACTICE),
  assistant: () => pick(PRACTICE),
  is: () => 'Information Services',
  admin: () => 'Administration',
};
// [min, max] years at the firm for current staff, and annual salary range.
const PROFILE = {
  partner: { years: [6, 26], salary: [620000, 950000], code: 'PTR' },
  senior: { years: [5, 8.5], salary: [300000, 365000], code: 'SRA' },
  mid: { years: [2.5, 5], salary: [245000, 290000], code: 'MLA' },
  junior: { years: [0.2, 2.8], salary: [205000, 230000], code: 'JRA' },
  summer: { years: [0.05, 0.35], salary: [42000, 48000], code: 'SUM' },
  paralegal: { years: [0.4, 12], salary: [68000, 92000], code: 'PLG' },
  assistant: { years: [0.25, 16], salary: [54000, 72000], code: 'LAS' },
  is: { years: [0.8, 11], salary: [82000, 128000], code: 'INS' },
  admin: { years: [0.3, 13], salary: [47000, 62000], code: 'ADM' },
};
// Twin Cities towns and straight-line miles to 50 South Sixth Street, Minneapolis.
const TOWNS = [
  ['Minneapolis', 'MN', '55403', 1.2], ['Minneapolis', 'MN', '55405', 2.4], ['Minneapolis', 'MN', '55408', 3.1], ['Minneapolis', 'MN', '55414', 2.6],
  ['St. Paul', 'MN', '55105', 7.9], ['Edina', 'MN', '55424', 7.6], ['Bloomington', 'MN', '55437', 12.1], ['Minnetonka', 'MN', '55305', 10.8],
  ['Eden Prairie', 'MN', '55344', 14.6], ['Plymouth', 'MN', '55447', 12.9], ['Maple Grove', 'MN', '55369', 15.3], ['Woodbury', 'MN', '55125', 17.8],
  ['Roseville', 'MN', '55113', 8.4], ['Blaine', 'MN', '55449', 16.9], ['Lakeville', 'MN', '55044', 24.2], ['Stillwater', 'MN', '55082', 24.8],
  ['Shakopee', 'MN', '55379', 21.7], ['Hudson', 'WI', '54016', 29.6], ['Elk River', 'MN', '55330', 33.4], ['Northfield', 'MN', '55057', 40.2],
  ['Red Wing', 'MN', '55066', 44.1], ['Faribault', 'MN', '55021', 47.6], ['St. Cloud', 'MN', '56301', 60.3], ['Rochester', 'MN', '55901', 76.2],
];
const STREETS = ['Lake', 'Hennepin', 'Nicollet', 'Lyndale', 'Penn', 'France', 'Summit', 'Grand', 'Cedar', 'Minnehaha', 'Como', 'Excelsior', 'Wayzata', 'Valley View'];
const fmt = (d) => `${d.getUTCMonth() + 1}/${d.getUTCDate()}/${d.getUTCFullYear()}`;
const daysAgo = (n) => new Date(Date.now() - Math.round(n) * 86400000);
const AREA = { MN: ['612', '651', '952', '763'], WI: ['715'] };

let serial = 0;
function person(role, { nearBias = 0 } = {}) {
  const i = serial++;
  const first = FIRST[(i * 5 + 3) % FIRST.length];
  const last = LAST[(i * 7 + Math.floor(i / FIRST.length) * 3) % LAST.length];
  // Partners and senior people skew toward closer-in suburbs; junior staff spread wider.
  const town = TOWNS[Math.min(TOWNS.length - 1, Math.floor(rnd() * (TOWNS.length - nearBias)))];
  const [city, st, zip, miles] = town;
  return {
    role, first, last, mi: INITIAL[i % INITIAL.length],
    email: `${first}.${last}${i}@example.com`.toLowerCase(),
    phone: `(${pick(AREA[st])}) 555-01${String(i % 100).padStart(2, '0')}`,
    street: `${100 + Math.floor(rnd() * 9800)} ${pick(STREETS)} ${pick(['Ave S', 'St', 'Blvd', 'Ln', 'Ct', 'Way'])}`,
    city, st, zip,
    miles: Math.round(Math.max(0.6, miles + between(-1.8, 2.6)) * 10) / 10,
  };
}

// ---------------------------------------------------------------- current staff
const ACTIVE = { partner: 30, senior: 18, mid: 20, junior: 22, summer: 6, paralegal: 16, assistant: 18, is: 8, admin: 12 };
const LEAVERS = { junior: 7, mid: 6, senior: 3, partner: 2, paralegal: 3, assistant: 6, is: 1, admin: 3, summer: 2 };
const REASONS = { default: ['Another Job', 'Resigned', 'Lateral Move to Another Firm', 'Relocation', 'Personal Reasons', 'Family Obligation'], partner: ['Lateral Move to Another Firm', 'Retirement'], summer: ['End Of Temp Employment'] };

const staff = [];
let empNo = 41000;
const addStaff = (role, terminated) => {
  const p = person(role, { nearBias: role === 'partner' ? 8 : role === 'senior' ? 5 : 0 });
  const prof = PROFILE[role];
  const years = between(...prof.years);
  const termDays = terminated ? between(15, 340) : 0;
  staff.push({
    'Employee Number': empNo++,
    'Employee Name (Last Suffix, First MI)': `${p.last}, ${p.first} ${p.mi}.`,
    'Address Line 1 + Address Line 2': p.street,
    'City, State Zip Code (Formatted)': `${p.city}, ${p.st} ${p.zip}`,
    'E-mail Address': p.email,
    'Home Phone (Formatted)': p.phone,
    'Hire Date': fmt(daysAgo(termDays + years * 365)),
    'Term Date': terminated ? fmt(daysAgo(termDays)) : '',
    'Termination Reason': terminated ? pick(REASONS[role] || REASONS.default) : '',
    'Employment Status': terminated ? 'Terminated' : 'Active',
    Organization: 'Dorsey & Whitney LLP',
    Division: ['is', 'admin'].includes(role) ? 'Business Services' : 'Legal',
    Department: DEPT[role](),
    'Job Class': POS[role],
    'Job Code': `${prof.code}-${100 + Math.floor(rnd() * 800)}`,
    'Distance (Miles)': p.miles,
    'Annual Salary': Math.round(between(...prof.salary) / 500) * 500,
  });
};
for (const [role, n] of Object.entries(ACTIVE)) for (let k = 0; k < n; k++) addStaff(role, false);
for (const [role, n] of Object.entries(LEAVERS)) for (let k = 0; k < n; k++) addStaff(role, true);
// Shuffle so the file reads like an HRIS export, not grouped by role.
for (let i = staff.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [staff[i], staff[j]] = [staff[j], staff[i]]; }

// ---------------------------------------------------------------- pre-hire candidates
const OPENINGS = { junior: 8, mid: 5, senior: 3, partner: 2, summer: 6, paralegal: 5, assistant: 5, is: 3, admin: 3 };
const prehire = [];
let req = 412;
for (const [role, n] of Object.entries(OPENINGS)) {
  const code = `DW-${PROFILE[role].code}-26${String(req++).padStart(3, '0')}`;
  const dept = DEPT[role]();
  for (let k = 0; k < n; k++) {
    const p = person(role, { nearBias: role === 'partner' ? 6 : 0 });
    const noAddress = prehire.length === 9 || prehire.length === 27; // two candidates left their street address blank
    prehire.push({
      'Candidate (Last, Suffix First MI)': `${p.last}, ${p.first} ${p.mi}.`,
      'Source Job': POS[role],
      'Opportunity Title': '',
      'Source Job Code': code,
      'Department Name': dept,
      'Email Address': p.email,
      'Primary Phone': p.phone,
      'Address 1': noAddress ? '' : p.street,
      City: p.city,
      'State/Province Code': p.st,
      'Zip/Postal Code': p.zip,
      'Distance (Miles)': noAddress ? '' : p.miles,
    });
  }
}
// One candidate applied to a second requisition: scored and charged once.
prehire.push({ ...prehire[4], 'Source Job': POS.mid, 'Source Job Code': `DW-${PROFILE.mid.code}-26413`, 'Department Name': DEPT.mid() });

// ---------------------------------------------------------------- write files
async function main() {
  const root = path.join(__dirname, '..');
  fs.mkdirSync(path.join(root, 'samples'), { recursive: true });
  fs.mkdirSync(path.join(root, 'public', 'templates'), { recursive: true });
  fs.writeFileSync(path.join(root, 'samples', 'current_staff_sample.csv'), Papa.unparse(staff));
  fs.writeFileSync(path.join(root, 'samples', 'prehire_sample.csv'), Papa.unparse(prehire));
  fs.copyFileSync(path.join(root, 'samples', 'current_staff_sample.csv'), path.join(root, 'public', 'templates', 'current_staff_sample.csv'));
  fs.copyFileSync(path.join(root, 'samples', 'prehire_sample.csv'), path.join(root, 'public', 'templates', 'prehire_sample.csv'));
  const header = (row) => `${Papa.unparse([Object.fromEntries(Object.keys(row).filter((k) => !['Distance (Miles)', 'Annual Salary'].includes(k)).map((k) => [k, '']))]).split('\n')[0]}\n`;
  fs.writeFileSync(path.join(root, 'public', 'templates', 'current_staff_template.csv'), header(staff[0]));
  fs.writeFileSync(path.join(root, 'public', 'templates', 'prehire_template.csv'), header(prehire[0]));

  // Excel copy laid out like Dorsey's own positions file (sheet "Summary", same header order).
  const wb = new ExcelJS.Workbook();
  wb.creator = 'The Apax Group';
  const ws = wb.addWorksheet('Summary');
  const cols = Object.keys(prehire[0]);
  ws.columns = cols.map((h) => ({ header: h, key: h, width: Math.max(14, Math.min(40, h.length + 4)) }));
  prehire.forEach((r) => ws.addRow(r));
  ws.getRow(1).font = { bold: true };
  ws.getColumn('Candidate (Last, Suffix First MI)').width = 30;
  ws.getColumn('Source Job').width = 40;
  await wb.xlsx.writeFile(path.join(root, 'samples', 'Dorsey - Pre-hire Demo.xlsx'));

  const wb2 = new ExcelJS.Workbook();
  wb2.creator = 'The Apax Group';
  const ws2 = wb2.addWorksheet('Active Staff');
  ws2.columns = Object.keys(staff[0]).map((h) => ({ header: h, key: h, width: Math.max(12, Math.min(38, h.length + 2)) }));
  staff.forEach((r) => ws2.addRow(r));
  ws2.getRow(1).font = { bold: true };
  await wb2.xlsx.writeFile(path.join(root, 'samples', 'Dorsey - Current Staff Demo.xlsx'));

  console.log(`samples: ${staff.length} staff rows (${Object.values(LEAVERS).reduce((a, b) => a + b, 0)} leavers), ${prehire.length} pre-hire rows`);
}
main();
