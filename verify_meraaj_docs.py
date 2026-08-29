import base64, hashlib, hmac, json, os, urllib.request, urllib.error, http.cookiejar
from pymongo import MongoClient

env = {}
for l in open('/app/.env'):
    l = l.strip()
    if '=' in l and not l.startswith('#'):
        k, v = l.split('=', 1)
        env[k] = v.strip().strip('"').strip("'")
db = MongoClient(env['MONGO_URL'])[env.get('DB_NAME', 'rahaal')]
SECRET = env['MERAAJ_SHARED_SECRET'].encode()
BASE = 'http://localhost:3000/api'
results = []
def rep(name, ok, extra=''):
    results.append((name, ok, extra))
    print(('PASS ' if ok else 'FAIL ') + name + (' — ' + str(extra)[:100] if extra else ''))

cj = http.cookiejar.CookieJar()
op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))
plain = urllib.request.build_opener()  # no cookies

def call(opener, path, method='GET', body=None, headers=None, raw_body=None):
    req = urllib.request.Request(BASE + path, method=method)
    data = raw_body if raw_body is not None else (json.dumps(body).encode() if body is not None else None)
    if data is not None:
        req.add_header('Content-Type', 'application/json')
    for k, v in (headers or {}).items():
        req.add_header(k, v)
    try:
        r = opener.open(req, data, timeout=120)
        return r.status, r.read(), {k.lower(): v for k, v in r.headers.items()}
    except urllib.error.HTTPError as e:
        return e.code, e.read(), {k.lower(): v for k, v in e.headers.items()}

# login
st, b, _ = call(op, '/auth/login', 'POST', {'email': 'owner@demo.com', 'password': 'Demo@2025'})
assert st == 200, b
T = db.users.find_one({'email': 'owner@demo.com'})['tenant_id']
print('LOGIN OK tenant', T)

# seed inbound booking (2 registrants with passports)
INB, REF = 'MDOC-INB-1', 'MDOC-REF-1'
db.meraaj_inbound_bookings.delete_many({'id': INB})
db.booking_documents.delete_many({'booking_ref': REF})
from datetime import datetime, timezone
db.meraaj_inbound_bookings.insert_one({
    'id': INB, 'tenant_id': T, 'meraaj_booking_ref': REF, 'package_id': 'x', 'package_name': 'MDOC pkg',
    'buyer_office_name': 'MDOC office', 'seats': 2,
    'registrants': [{'name': 'أحمد الاختبار', 'passport_no': 'P111222'}, {'name': 'سالم الاختبار', 'passport_no': 'P333444'}],
    'total_price': 1, 'net_to_seller_total': 1, 'currency': 'SAR', 'status': 'new', 'history': [], 'created_at': datetime.now(timezone.utc),
})

# ---------- 1) REAL webhook ingestion: documents_updated ----------
long_sig = 'sig=' + 'a' * 900 + '&exp=9999999999'  # ~930-char query → total URL > 600 (old cut) but < 2048
docs_payload = {
    'type': 'meraaj.booking.documents_updated',
    'data': {'booking_ref': REF, 'documents': [
        {'registrant_index': 0, 'type': 'photo', 'url': f'https://meraaj.example/api/documents/D1/signed?{long_sig}', 'label': 'صورة شخصية'},
        {'registrant_index': 1, 'type': 'ticket', 'url': 'http://localhost:3000/api/health', 'label': 'تذكرة طيران'},
        {'registrant_index': 5, 'type': 'passport', 'url': 'https://meraaj.example/x', 'label': 'bad idx'},
    ]},
}
raw = json.dumps(docs_payload).encode()
sig = hmac.new(SECRET, raw, hashlib.sha256).hexdigest()
st, b, _ = call(plain, '/meraaj/webhooks', 'POST', raw_body=raw, headers={'x-meraaj-signature': sig})
j = json.loads(b)
rep('T1 webhook documents_updated accepted (2 added, 1 skipped)', st == 200 and j.get('documents_added') == 2 and j.get('documents_skipped') == 1, j)

d_photo = db.booking_documents.find_one({'booking_ref': REF, 'doc_type': 'photo'})
d_ticket = db.booking_documents.find_one({'booking_ref': REF, 'doc_type': 'ticket'})
rep('T2 doc_type photo/ticket preserved (not coerced to other)', bool(d_photo) and bool(d_ticket))
rep('T3 registrant + passport linkage kept', d_photo and d_photo['registrant_name'] == 'أحمد الاختبار' and d_photo['passport_no'] == 'P111222' and d_ticket['registrant_name'] == 'سالم الاختبار' and d_ticket['passport_no'] == 'P333444')
rep('T4 long signed URL (>600 chars) stored intact', d_photo and len(d_photo['storage']['url']) > 600 and d_photo['storage']['url'].endswith('exp=9999999999'))

# ---------- 2) office upload path: new 10MB backend cap ----------
png6 = base64.b64encode(b'\x89PNG' + os.urandom(6 * 1024 * 1024)).decode()
st, b, _ = call(op, f'/meraaj/inbound-bookings/{INB}/documents', 'POST', {
    'context': 'traveler', 'registrant_index': 0, 'doc_type': 'passport',
    'label': 'passport-scan.png', 'filename': 'passport-scan.png', 'content_type': 'image/png', 'file_base64': png6,
})
j = json.loads(b)
rep('T5 office upload 6MB accepted (was rejected at 4MB before)', st == 200, j if st != 200 else '')
local_id = j.get('document', {}).get('id')

png11 = base64.b64encode(os.urandom(11 * 1024 * 1024)).decode()
st, b, _ = call(op, f'/meraaj/inbound-bookings/{INB}/documents', 'POST', {
    'context': 'traveler', 'registrant_index': 0, 'doc_type': 'passport',
    'label': 'big.png', 'filename': 'big.png', 'content_type': 'image/png', 'file_base64': png11,
})
msg = json.loads(b).get('error', '')
rep('T6 office upload 11MB rejected with (10MB) message', st == 400 and '10MB' in msg, msg)

# doc_type ticket accepted on office POST
tiny = base64.b64encode(b'%PDF' + os.urandom(2000)).decode()
st, b, _ = call(op, f'/meraaj/inbound-bookings/{INB}/documents', 'POST', {
    'context': 'traveler', 'registrant_index': 1, 'doc_type': 'ticket',
    'label': 'ticket.pdf', 'filename': 'ticket.pdf', 'content_type': 'application/pdf', 'file_base64': tiny,
})
j = json.loads(b)
pdf_id = j.get('document', {}).get('id')
d_stored = db.booking_documents.find_one({'id': pdf_id}) if pdf_id else None
rep('T7 office PDF upload with doc_type=ticket stored as ticket', st == 200 and d_stored and d_stored['doc_type'] == 'ticket')

# ---------- 3) documents list: linkage fields exposed ----------
st, b, _ = call(op, f'/meraaj/inbound-bookings/{INB}/documents')
lst = json.loads(b)['documents']
ext_doc = next(d for d in lst if d['doc_type'] == 'ticket' and d['external_url'])
rep('T8 GET list exposes registrant_name/passport_no/external_url', all(d.get('registrant_name') for d in lst) and ext_doc['passport_no'] == 'P333444')

# ---------- 4) preview/download serving ----------
# local image via download endpoint (inline + correct type + filename)
st, body, h = call(op, f'/meraaj/booking-documents/{local_id}/download')
rep('T9 local image download: 200 + image/png + inline + filename + exact bytes',
    st == 200 and h.get('content-type') == 'image/png' and 'inline' in h.get('content-disposition', '') and 'passport-scan.png' in h.get('content-disposition', '') and len(body) == 4 + 6 * 1024 * 1024)
# local PDF via generic document-proxy
st, body, h = call(op, f'/document-proxy/{pdf_id}')
rep('T10 local PDF via /document-proxy: 200 + application/pdf + exact bytes', st == 200 and h.get('content-type') == 'application/pdf' and len(body) == 4 + 2000)
# external doc via generic proxy (server-side fetch path — local health URL, no Meraaj call)
ext_id = d_ticket['id']
st, body, h = call(op, f'/document-proxy/{ext_id}')
rep('T11 external doc via /document-proxy: 200 (server-side fetch works)', st == 200 and len(body) > 0)

# ---------- 5) authorization ----------
st, _, _ = call(plain, f'/document-proxy/{local_id}')
r1 = st
st, _, _ = call(plain, f'/meraaj/booking-documents/{local_id}/download')
rep('T12 unauthenticated blocked (401) on proxy + download', r1 == 401 and st == 401, f'{r1},{st}')

# ---------- 6) Meraaj signed-URL proxy validation (no upstream call) ----------
st1, b1, _ = call(op, '/meraaj/document-proxy')
st2, b2, _ = call(op, '/meraaj/document-proxy?url=' + urllib.parse.quote('https://evil.example/steal'))
st3, b3, _ = call(op, '/meraaj/document-proxy?url=' + urllib.parse.quote('https://m.example/api/documents/D9/signed'))
st4, _, _ = call(plain, '/meraaj/document-proxy?url=x')
rep('T13 signed-proxy guards: 400 no url / 403 bad path / 403 missing sig / 401 unauth',
    st1 == 400 and st2 == 403 and st3 == 403 and st4 == 401, f'{st1},{st2},{st3},{st4}')

# ---------- cleanup ----------
for d in db.booking_documents.find({'booking_ref': REF}):
    k = d.get('storage', {}).get('object_key')
    if k:
        db.document_blobs.delete_many({'object_key': k})
db.booking_documents.delete_many({'booking_ref': REF})
db.meraaj_inbound_bookings.delete_many({'id': INB})
db.document_audit.delete_many({'meta.booking_ref': REF})
res = db.booking_documents.count_documents({'booking_ref': REF}) + db.meraaj_inbound_bookings.count_documents({'id': INB})
print('CLEANUP residue:', res)
print('=====', sum(1 for _, ok, _ in results if ok), '/', len(results), 'PASSED =====')
