import fs from 'fs';
import { extractData } from '../my-app/utils/extractors.js';

const cases = {E008:'28.49',E017:'349.00',E022:'20.00',E027:'58.56',E032:'54.25',E039:'40.52'};
for (const [id, want] of Object.entries(cases)) {
  const c = JSON.parse(fs.readFileSync(`/home/huw/code/express-accounts-app/receipts/cache/${id}.json`,'utf8'));
  const r = extractData(c.rawText);
  const got = r.money?.value?.toFixed(2);
  const ok = got === want;
  process.stdout.write(`${ok?'OK':'FAIL'} ${id}: got=${got}, want=${want}\n`);
}
