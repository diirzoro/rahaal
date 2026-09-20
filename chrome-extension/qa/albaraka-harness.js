// Albaraka-bus parser harness — simulates the REAL ticket structure from the user screenshot
// (RTL table serialized in DOM order: label cell first, then value; bidi RLM marks included)
const path = process.argv[2] || '/app/chrome-extension/parsers.js'
require(path)
const P = globalThis.RahalParsers

const RLM = '\u200f'
// Page text = booking-site labels (search form) + the ticket table + footer
const text = [
  'التذاكر - شركة البركة للنقل البري',
  'رقم الهوية أو الجواز', // search-form label that v1.4.0 wrongly displayed as the passenger
  'PrintTickets',
  `رقم التذكرة\t${RLM}MK16858${RLM}\tرقم الجواز\t${RLM}16788902${RLM}`,
  `الاسم\tعادل عبد الحكيم صالح حسين شنظور\t775409537\tالرحلة\t62869\tعدن - الرياض`,
  `الميلاد\t1999/09/26\tالمقعد\t12\tتاريخ الرحلة\t2026/09/23\t${RLM}pm 02:00`,
  `الإصدار\t2026/09/20\tالوكيل\tرحاب المشاعر_الم\tوقت الحضور\t${RLM}pm 01:00`,
  `الفرع\tفرع المكلا\tاليوم\tالأربعاء`,
  `السعر\t${RLM}300.00 ر.س.${RLM}\tملاحظات`,
  'تمت الطباعة بواسطة: رحاب المشاعر - الأحد 23:11:16 2026/09/20',
].join('\n')

const data = P.scrape(text, { hostname: 'brk.rhlati.com', title: 'التذاكر - شركة البركة' })
console.log(JSON.stringify(data, null, 1))
if (P.validateForSend) console.log('VALIDATE:', JSON.stringify(P.validateForSend(data)))
