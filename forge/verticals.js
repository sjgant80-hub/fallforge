/* FallForge · auto-detect vertical from a business's public footprint.
 * Keyword-based scoring · runs on discovered site text · returns ranked
 * verticals + confidence. If confidence < threshold we ask the user.
 */

const FINGERPRINTS = {
  hospitality: {
    label: 'Hospitality (holiday rental / glamping / B&B / boutique hotel)',
    keywords: [
      'book','stay','stays','guest','guests','cottage','cottages','glamping','yurt','shepherd','B&B','bed and breakfast','airbnb','booking.com','vrbo',
      'accommodation','holiday let','holiday rental','self catering','check-in','check-out','check in','check out','rate per night','nightly','minimum stay','sleeps',
      'hosting','host','stays','retreat','treehouse','bothy','cabin','stargazer','farmstay','lodge','pod'
    ],
    templateUrl: 'https://sjgant80-hub.github.io/fallhub/verticals/hospitality.html',
    kernelBase: 'hospitality'
  },
  trades: {
    label: 'Trades (plumber / electrician / decorator / gas engineer)',
    keywords: [
      'plumber','plumbing','electrician','electrical','gas safe','gas engineer','decorator','painting','landscaper','landscaping','roofer','roofing','builder','building',
      'callout','call out','emergency call','24/7','emergency','boiler','boiler service','boiler repair','heating','central heating','bathroom install','kitchen fit',
      'NICEIC','gas safety','PAT test','free quote','insurance work','fully insured','public liability','trades','tradesman','tradespeople'
    ],
    templateUrl: 'https://sjgant80-hub.github.io/fallhub/verticals/trades.html',
    kernelBase: 'trades'
  },
  adshop: {
    label: 'Ad firm (creative agency / brand studio / freelance strategy)',
    keywords: [
      'agency','creative agency','brand studio','brand strategy','copywriting','content strategy','social media agency','media buying','campaign','campaigns','copywriter',
      'branding','logo design','visual identity','marketing','advertising','ad agency','digital agency','freelance strategy','strategy consultant','case study','case studies',
      'clients','portfolio','deliverables','creative deliverable'
    ],
    templateUrl: 'https://sjgant80-hub.github.io/fallhub/verticals/adshop.html',
    kernelBase: 'adshop'
  },
  accounting: {
    label: 'Accounting practice (bookkeeper / VAT / self-assessment)',
    keywords: [
      'accountant','accountants','bookkeeper','bookkeeping','VAT','HMRC','self assessment','self-assessment','payroll','ct600','corporation tax','MTD','making tax digital',
      'AAT','ACCA','ICAEW','ICPA','CIOT','fully insured accountant','client onboarding','engagement letter','tax return','statutory accounts','tax planning'
    ],
    templateUrl: 'https://sjgant80-hub.github.io/fallhub/verticals/accounting.html',
    kernelBase: 'accounting'
  },
  barbershop: {
    label: 'Barbershop chain (multi-location grooming)',
    keywords: [
      'barber','barbershop','barber shop','haircut','beard trim','shave','fade','skin fade','loyalty punch','punch card','walk-in','walk in','chair','chairs','stylist',
      'appointments','booksy','fresha','pomade','stock','stock levels','locations','flagship','franchise'
    ],
    templateUrl: 'https://sjgant80-hub.github.io/fallhub/verticals/barbershop.html',
    kernelBase: 'barbershop'
  }
};

/* Given raw text from a discovered footprint, return ranked verticals + score. */
export function detectVertical(rawText) {
  const t = String(rawText || '').toLowerCase();
  const scores = {};
  let total = 0;
  for (const [key, fp] of Object.entries(FINGERPRINTS)) {
    let s = 0;
    for (const kw of fp.keywords) {
      const rx = new RegExp('\\b' + kw.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'g');
      const m = t.match(rx);
      if (m) s += m.length;
    }
    scores[key] = s;
    total += s;
  }
  const ranked = Object.entries(scores)
    .map(([key, hits]) => ({ key, hits, confidence: total ? hits / total : 0, label: FINGERPRINTS[key].label, templateUrl: FINGERPRINTS[key].templateUrl }))
    .sort((a, b) => b.hits - a.hits);
  return {
    top: ranked[0],
    ranked,
    confident: ranked[0].confidence >= 0.35 && ranked[0].hits >= 4
  };
}

export const VERTICAL_LIST = Object.entries(FINGERPRINTS).map(([key, fp]) => ({
  key, label: fp.label, templateUrl: fp.templateUrl, kernelBase: fp.kernelBase
}));

export function getVertical(key) { return FINGERPRINTS[key]; }
