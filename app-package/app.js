pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
const AI_API_BASE_URL = window.MODEL_MATCH_API_URL || 'http://localhost:5000';

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    registrations.forEach((registration) => registration.unregister());
  });
}

if ('caches' in window) {
  caches.keys().then((cacheNames) => {
    cacheNames
      .filter((cacheName) => cacheName.startsWith('model-checker-'))
      .forEach((cacheName) => caches.delete(cacheName));
  });
}

const SERIES_PATTERNS = [
  { name: 'MacBook Air', regex: /\b(?:MACBOOK[\s-]*AIR|MBA)\b/i },
  { name: 'MacBook Pro', regex: /\b(?:MACBOOK[\s-]*PRO|MBP)\b/i },
  { name: 'MacBook', regex: /\bMACBOOK\b/i },
  { name: 'Surface Laptop', regex: /\bSURFACE[\s-]*LAPTOP\b/i },
  { name: 'Surface Pro', regex: /\bSURFACE[\s-]*PRO\b/i },
  { name: 'Surface Book', regex: /\bSURFACE[\s-]*BOOK\b/i },
  { name: 'Surface', regex: /\bSURFACE\b/i },
  { name: 'ThinkPad X1 Carbon', regex: /\b(?:THINKPAD[\s-]*)?X1[\s-]*CARBON\b/i },
  { name: 'ThinkPad X1 Yoga', regex: /\b(?:THINKPAD[\s-]*)?X1[\s-]*YOGA\b/i },
  { name: 'ThinkPad', regex: /\bTHINKPAD\b/i },
  { name: 'IdeaPad Flex', regex: /\bIDEAPAD[\s-]*FLEX\b/i },
  { name: 'IdeaPad Gaming', regex: /\bIDEAPAD[\s-]*GAMING\b/i },
  { name: 'IdeaPad Slim', regex: /\bIDEAPAD[\s-]*SLIM\b/i },
  { name: 'IdeaPad', regex: /\bIDEAPAD\b/i },
  { name: 'Legion', regex: /\bLEGION\b/i },
  { name: 'LOQ', regex: /\bLOQ\b/i },
  { name: 'Yoga', regex: /\bYOGA\b/i },
  { name: 'EliteBook Folio', regex: /\bELITEBOOK[\s-]*FOLIO\b/i },
  { name: 'EliteBook x360', regex: /\bELITEBOOK[\s-]*X360\b/i },
  { name: 'EliteBook', regex: /\bELITEBOOK\b/i },
  { name: 'ProBook x360', regex: /\bPROBOOK[\s-]*X360\b/i },
  { name: 'ProBook', regex: /\bPROBOOK\b/i },
  { name: 'Pavilion Aero', regex: /\bPAVILION[\s-]*AERO\b/i },
  { name: 'Pavilion x360', regex: /\bPAVILION[\s-]*X360\b/i },
  { name: 'Pavilion', regex: /\bPAVILION\b/i },
  { name: 'Envy x360', regex: /\bENVY[\s-]*X360\b/i },
  { name: 'Envy', regex: /\bENVY\b/i },
  { name: 'Spectre x360', regex: /\bSPECTRE[\s-]*X360\b/i },
  { name: 'Spectre', regex: /\bSPECTRE\b/i },
  { name: 'Victus', regex: /\bVICTUS\b/i },
  { name: 'Omen', regex: /\bOMEN\b/i },
  { name: 'Inspiron', regex: /\bINSPIRON\b/i },
  { name: 'Latitude', regex: /\bLATITUDE\b/i },
  { name: 'Vostro', regex: /\bVOSTRO\b/i },
  { name: 'XPS', regex: /\bXPS\b/i },
  { name: 'Precision', regex: /\bPRECISION\b/i },
  { name: 'VivoBook S', regex: /\bVIVOBOOK[\s-]*S\b/i },
  { name: 'VivoBook Pro', regex: /\bVIVOBOOK[\s-]*PRO\b/i },
  { name: 'VivoBook Go', regex: /\bVIVOBOOK[\s-]*GO\b/i },
  { name: 'VivoBook', regex: /\bVIVOBOOK\b/i },
  { name: 'ZenBook', regex: /\bZENBOOK\b/i },
  { name: 'TUF Gaming', regex: /\bTUF[\s-]*GAMING\b/i },
  { name: 'TUF Dash', regex: /\bTUF[\s-]*DASH\b/i },
  { name: 'TUF', regex: /\bTUF\b/i },
  { name: 'ROG Zephyrus', regex: /\bROG[\s-]*ZEPHYRUS\b/i },
  { name: 'ROG Strix', regex: /\bROG[\s-]*STRIX\b/i },
  { name: 'ROG', regex: /\bROG\b/i },
  { name: 'ExpertBook', regex: /\bEXPERTBOOK\b/i },
  { name: 'Aspire 1', regex: /\bASPIRE[\s-]*1\b/i },
  { name: 'Aspire 3', regex: /\bASPIRE[\s-]*3\b/i },
  { name: 'Aspire 5', regex: /\bASPIRE[\s-]*5\b/i },
  { name: 'Aspire 7', regex: /\bASPIRE[\s-]*7\b/i },
  { name: 'Aspire', regex: /\bASPIRE\b/i },
  { name: 'Nitro 5', regex: /\bNITRO[\s-]*5\b/i },
  { name: 'Nitro', regex: /\bNITRO\b/i },
  { name: 'Predator Helios Neo', regex: /\bPREDATOR[\s-]*HELIOS[\s-]*NEO\b/i },
  { name: 'Predator Helios', regex: /\bPREDATOR[\s-]*HELIOS\b/i },
  { name: 'Predator', regex: /\bPREDATOR\b/i },
  { name: 'Swift', regex: /\bSWIFT\b/i },
  { name: 'Modern', regex: /\bMODERN\b/i },
  { name: 'Blade', regex: /\bBLADE\b/i },
  { name: 'Viper', regex: /\bVIPER\b/i }
];

const BRANDS = ['ACER', 'ASUS', 'DELL', 'APPLE', 'HP', 'LENOVO', 'MICROSOFT', 'MSI', 'RAZER', 'CANON', 'SAMSUNG'];

class ModelChecker {
  constructor() {
    this.pdfText = '';
    this.models = new Set();
    this.modelLabels = new Map();
    this.catalogLines = [];
    this.pdfLoaded = false;

    this.pdfInput = document.getElementById('pdfInput');
    this.pdfFileName = document.getElementById('pdfFileName');
    this.pdfStatus = document.getElementById('pdfStatus');

    this.searchInput = document.getElementById('searchInput');
    this.searchBtn = document.getElementById('searchBtn');
    this.searchResult = document.getElementById('searchResult');

    this.manualTabBtn = document.getElementById('manualTabBtn');
    this.aiTabBtn = document.getElementById('aiTabBtn');
    this.manualPanel = document.getElementById('manualPanel');
    this.aiPanel = document.getElementById('aiPanel');

    this.aiPromptInput = document.getElementById('aiPromptInput');
    this.aiImageInput = document.getElementById('aiImageInput');
    this.aiImageFileName = document.getElementById('aiImageFileName');
    this.aiTextBtn = document.getElementById('aiTextBtn');
    this.aiImageBtn = document.getElementById('aiImageBtn');
    this.aiStatus = document.getElementById('aiStatus');
    this.aiResult = document.getElementById('aiResult');

    this.pdfInput.addEventListener('change', () => this.handlePDFUpload());
    this.searchBtn.addEventListener('click', () => this.handleSearch());
    this.aiImageInput.addEventListener('change', () => {
      const file = this.aiImageInput.files[0];
      this.aiImageFileName.textContent = file ? file.name : 'No image selected';
      this.updateAiButtons();
      this.aiStatus.textContent = file ? 'Image ready to scan.' : (this.pdfLoaded ? 'Catalog ready' : 'Ready');
    });
    this.searchInput.addEventListener('input', () => {
      this.searchBtn.disabled = !this.pdfLoaded || !this.searchInput.value.trim();
    });
    this.searchInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') this.handleSearch();
    });
    this.aiPromptInput.addEventListener('input', () => this.updateAiButtons());

    this.manualTabBtn.addEventListener('click', () => this.showTab('manual'));
    this.aiTabBtn.addEventListener('click', () => this.showTab('ai'));
    this.aiTextBtn.addEventListener('click', () => this.handleAiSearch());
    this.aiImageBtn.addEventListener('click', () => {
      const file = this.aiImageInput.files[0];
      if (file) {
        this.handleAiImageSearch(file);
      } else {
        this.aiImageInput.click();
      }
    });
    this.aiPromptInput.addEventListener('keydown', (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') this.handleAiSearch();
    });
    this.updateAiButtons();
  }

  updateAiButtons() {
    this.aiTextBtn.disabled = !this.pdfLoaded;
    this.aiImageBtn.disabled = !this.pdfLoaded;
  }

  showTab(tab) {
    const isManual = tab === 'manual';
    this.manualTabBtn.classList.toggle('active', isManual);
    this.aiTabBtn.classList.toggle('active', !isManual);
    this.manualPanel.classList.toggle('active', isManual);
    this.aiPanel.classList.toggle('active', !isManual);
  }

  normalize(text) {
    return String(text || '')
      .toUpperCase()
      .trim()
      .replace(/[\t\r\n]+/g, ' ')
      .replace(/\s+/g, ' ');
  }

  compact(text) {
    return String(text || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  }

  normalizeModel(value) {
    return this.compact(value);
  }

  tokenizeModel(value) {
    const rawTokens = String(value || '').toUpperCase().match(/[A-Z0-9]+/g) || [];
    const tokens = [];
    for (const t of rawTokens) {
      tokens.push(t);
      const sub = t.match(/[A-Z]+\d+|\d+[A-Z]+|[A-Z]+|\d+/g) || [];
      if (sub.length > 1) tokens.push(...sub);
    }
    return Array.from(new Set(tokens.filter(Boolean)));
  }

  extractModelCode(value) {
    const tokens = String(value || '').toUpperCase().match(/[A-Z0-9]+/g) || [];
    const codePattern = /^\d{2,6}[A-Z]{1,4}\d{1,4}[A-Z]?$|^\d{3,6}[A-Z]\d{1,3}[A-Z]?$|^\d{3,6}[A-Z]{1,3}$/;
    const letterPattern = /^[A-Z]{1,6}\d{2,6}[A-Z]{0,3}$/;
    const numericModelPattern = /^\d{4,5}$/;

    // Alphanumeric codes first (e.g. A31558, 840G3, 15ITL6, T480, UX425, A2337)
    const candidates = tokens.filter(token => codePattern.test(token) || letterPattern.test(token));
    if (candidates.length) return candidates.sort((left, right) => right.length - left.length)[0];

    // Combine adjacent tokens (e.g. ["840", "G3"] => "840G3", ["15", "DW3000"] => "15DW3000")
    for (let index = 0; index < tokens.length - 1; index += 1) {
      const combined = `${tokens[index]}${tokens[index + 1]}`;
      if (codePattern.test(combined) || letterPattern.test(combined)) return combined;
    }

    // 4-5 digit standalone model numbers (Dell 3511, 5420, 9305, etc.) excluding years
    const numericCandidates = tokens.filter(token => numericModelPattern.test(token) && !/^(19|20)\d{2}$/.test(token));
    if (numericCandidates.length) return numericCandidates[0];

    return '';
  }

  extractKeys(text) {
    const norm = this.normalize(text);
    const comp = this.compact(norm);

    // 1. Identify Series
    let series = '';
    for (const p of SERIES_PATTERNS) {
      if (p.regex.test(norm)) {
        series = p.name;
        break;
      }
    }

    // Identify Brand
    let brand = '';
    for (const b of BRANDS) {
      if (new RegExp(`\\b${b}\\b`, 'i').test(norm)) {
        brand = b;
        break;
      }
    }

    // Check if text is solely a series or brand (e.g. "ThinkPad", "Dell Inspiron")
    let cleanRemaining = norm;
    for (const b of BRANDS) {
      cleanRemaining = cleanRemaining.replace(new RegExp(`\\b${b}\\b`, 'gi'), '');
    }
    if (series) {
      cleanRemaining = cleanRemaining.replace(new RegExp(series, 'gi'), '');
    }
    cleanRemaining = cleanRemaining.replace(/\b(?:LAPTOP|NOTEBOOK|SERIES|INCH|DEVICES?)\b/gi, '').trim();
    const isSeriesOnly = Boolean(series && this.compact(cleanRemaining).length === 0);

    // 2. Identify Generation / Silicon
    let gen = '';
    const hpGen = norm.match(/\b(?:G|GEN)\s*(\d{1,2})\b/i);
    if (hpGen) gen = `G${hpGen[1]}`;
    const appleM = norm.match(/\b(M[1-4](?:\s*(?:PRO|MAX|ULTRA))?)\b/i);
    if (appleM) gen = appleM[1].replace(/\s+/g, '');
    const genMatch = norm.match(/\bGEN\s*(\d{1,2})\b/i);
    if (genMatch && !gen) gen = `GEN${genMatch[1]}`;

    // 3. Extract all model codes
    const codes = new Set();
    let baseCode = '';
    let suffix = '';

    // Apple A-numbers (A2337, A2681, A1466, etc.)
    const aMatches = norm.match(/\bA\d{4}\b/gi) || [];
    for (const m of aMatches) codes.add(this.compact(m));

    // Dell Regulatory P-numbers (P185G, P112F, P89G, etc.)
    const pMatches = norm.match(/\bP\d{2,3}[A-Z]\b/gi) || [];
    for (const m of pMatches) codes.add(this.compact(m));

    // Surface Model numbers (Model 1868 -> 1868)
    const surfMatches = norm.match(/\bMODEL\s*(\d{4})\b/gi) || [];
    for (const m of surfMatches) {
      const num = m.replace(/[^0-9]/g, '');
      if (num) codes.add(num);
    }

    // Screen size cleanup: remove "13.6-inch", "15.6-inch", "14-inch" before code extraction
    const cleanNorm = norm.replace(/\b\d{1,2}(?:\.\d)?\s*-\s*(?:INCH|IN)\b/gi, '')
                          .replace(/\b\d{1,2}(?:\.\d)?\s*(?:INCH|IN|")\b/gi, '');

    // Hyphenated codes (A315-58, FX506-LH, 15-dw3000, RZ09-0300, etc.)
    const hyphenMatches = cleanNorm.match(/\b([A-Z]{0,4}\d{1,4}[A-Z]{0,2})\s*-\s*([A-Z0-9]{1,8})\b/gi) || [];
    for (const hm of hyphenMatches) {
      const parts = hm.split('-').map(s => this.compact(s));
      if (parts[0] && parts[0].length >= 2) codes.add(parts[0]);
      if (parts[1] && parts[1].length >= 2) codes.add(parts[1]);
      const full = parts.join('');
      if (full.length >= 3) codes.add(full);
      if (!baseCode && parts[0] && parts[0].length >= 2) {
        baseCode = parts[0];
        suffix = parts[1] || '';
      }
    }

    // General model codes (FX506LH, 15ITL6, 500D, 3511, 5420, 840, T14, X515, etc.)
    const generalMatches = cleanNorm.match(/\b([A-Z]{1,4}\d{2,5}[A-Z]{0,4}|\d{2,4}[A-Z]{1,4}\d{0,4}|\d{4,5})\b/gi) || [];
    for (const gm of generalMatches) {
      const c = this.compact(gm);
      if (!/^(19|20)\d{2}$/.test(c) && c.length >= 3) {
        codes.add(c);
        const alphaSplit = c.match(/^([A-Z]{1,4}\d{2,4})([A-Z]{1,4})$/i);
        if (alphaSplit) {
          codes.add(alphaSplit[1]);
          if (!baseCode) {
            baseCode = alphaSplit[1];
            suffix = alphaSplit[2];
          }
        } else if (!baseCode) {
          baseCode = c;
        }
      }
    }

    // Standalone 3-digit HP/Dell models (e.g. 840, 830, 850, 450)
    const threeDigitMatches = cleanNorm.match(/\b([1-9]\d{2})\b/g) || [];
    for (const tm of threeDigitMatches) {
      codes.add(tm);
      if (!baseCode) baseCode = tm;
    }

    // Single digit model if cleanRemaining is pure digit (e.g. 3 in Surface Laptop 3)
    const singleDigitMatch = this.compact(cleanRemaining).match(/^\d$/);
    if (singleDigitMatch) {
      codes.add(singleDigitMatch[0]);
      if (!baseCode) baseCode = singleDigitMatch[0];
    }

    // 2-digit family / screen tokens (e.g. 74 in Latitude 74, 15 in LOQ 15 / Inspiron 15, 14 in Inspiron 14, 54 in Latitude 54)
    const twoDigitMatches = cleanNorm.match(/\b(\d{2})\b/g) || [];
    const familyNumbers = [];
    for (const dm of twoDigitMatches) {
      if (!/^(19|20)$/.test(dm)) {
        familyNumbers.push(dm);
      }
    }

    const primaryNumeric = baseCode || (codes.size > 0 ? Array.from(codes)[0] : '');

    const hasExactCode = Boolean(
      Array.from(codes).some(c => c.length >= 4 || /[A-Z]\d|\d[A-Z]/i.test(c)) ||
      (threeDigitMatches.length > 0 && Boolean(gen)) ||
      (Boolean(series) && Boolean(gen)) ||
      (Boolean(series) && Boolean(singleDigitMatch))
    );

    return {
      raw: text,
      norm,
      comp,
      brand: brand.toUpperCase(),
      series: series.toUpperCase(),
      isSeriesOnly,
      gen: gen.toUpperCase(),
      numeric: primaryNumeric.toUpperCase(),
      baseCode: baseCode.toUpperCase(),
      suffix: suffix.toUpperCase(),
      codes: Array.from(codes).map(c => c.toUpperCase()),
      familyNumbers,
      cleanRemaining: this.compact(cleanRemaining),
      hasExactCode
    };
  }

  matchScore(q, c) {
    let score = 0;
    let suffixConflict = false;
    let genConflict = false;
    let numericMatched = false;

    // 1. Direct whole-string match
    if (q.comp === c.comp) {
      return { score: 100, numericMatched: true, suffixConflict: false, genConflict: false };
    }

    // 2. Series comparison
    if (q.series && c.series) {
      if (q.series === c.series) {
        score += 30;
      } else if (c.series.includes(q.series) || q.series.includes(c.series)) {
        score += 20;
      } else {
        return { score: -100, numericMatched: false, suffixConflict: false, genConflict: false };
      }
    }

    // 3. Exact Code Matching across recognized codes
    const matchingCodes = q.codes.filter(qc => qc.length >= 3 && (c.codes.includes(qc) || (qc.length >= 4 && c.comp.includes(qc))));
    if (matchingCodes.length > 0) {
      score += 50;
      numericMatched = true;
    } else if (q.numeric && q.numeric.length >= 3 && (c.numeric === q.numeric || (q.numeric.length >= 4 && c.comp.includes(q.numeric)))) {
      score += 45;
      numericMatched = true;
    }

    // 4. Base Code Matching with Suffix Evaluation
    if (q.baseCode && q.baseCode.length >= 3) {
      const baseMatch = c.codes.some(code => code === q.baseCode || (code.length >= 4 && (code.startsWith(q.baseCode) || q.baseCode.startsWith(code))));
      if (baseMatch) {
        if (!numericMatched) {
          score += 35;
          numericMatched = true;
        }
        if (q.suffix) {
          if (c.suffix && c.suffix === q.suffix) {
            score += 25;
          } else if (c.comp.includes(q.suffix)) {
            score += 20;
          } else {
            suffixConflict = true;
          }
        }
      }
    }

    // 5. Generation comparison
    if (q.gen && c.gen) {
      if (q.gen === c.gen) {
        score += 35;
        if (!numericMatched && q.series && c.series && q.series === c.series) {
          numericMatched = true;
        }
      } else {
        genConflict = true;
      }
    } else if (q.gen && c.comp.includes(q.gen)) {
      score += 35;
      if (!numericMatched && q.series && c.series && q.series === c.series) {
        numericMatched = true;
      }
    } else if (q.gen && !c.gen && !c.comp.includes(q.gen)) {
      if (numericMatched) {
        genConflict = true;
      }
    }

    // 6. Substring fallback for clean codes
    if (!numericMatched && q.comp.length >= 4 && c.comp.includes(q.comp)) {
      score += 40;
      numericMatched = true;
    }

    return { score, numericMatched, suffixConflict, genConflict };
  }

  splitMultiBrandLine(line) {
    const brandRegex = /\b(Acer|Asus|Dell|Apple|MacBook|Microsoft|Surface|HP|Lenovo|MSI|Razer|Canon|Alienware|Samsung|Sony|Toshiba|LG)\b/gi;
    const matches = [];
    let match;
    while ((match = brandRegex.exec(line)) !== null) {
      matches.push({ index: match.index, brand: match[1] });
    }

    if (matches.length <= 1) {
      return [line.trim()];
    }

    const splitIndices = [];
    for (let i = 0; i < matches.length; i++) {
      const curr = matches[i];
      if (i > 0) {
        const prev = matches[i - 1];
        if ((/Apple/i.test(prev.brand) && /MacBook/i.test(curr.brand)) ||
            (/Microsoft/i.test(prev.brand) && /Surface/i.test(curr.brand))) {
          continue;
        }
      }
      splitIndices.push(curr.index);
    }

    const chunks = [];
    for (let i = 0; i < splitIndices.length; i++) {
      const start = splitIndices[i];
      const end = (i + 1 < splitIndices.length) ? splitIndices[i + 1] : line.length;
      const chunk = line.slice(start, end).trim();
      if (chunk.length > 2) chunks.push(chunk);
    }
    return chunks;
  }

  expandSubModels(entry) {
    const clean = String(entry || '').trim().replace(/[,;]+$/, '').trim();

    // Do not split inside parentheses if they are years/sizes
    let textWithoutParenCommas = clean.replace(/\([^)]*\)/g, match => match.replace(/,/g, '__COMMA__'));

    // Pattern 1: Comma-separated numbers at end after prefix
    // e.g. "Dell Latitude 7480, 7490, 7400"
    // e.g. "Dell Inspiron 15 3510, 3511, 3515"
    // e.g. "Dell Inspiron 3480, 3481, 3490, 3493"
    const commaNumMatch = clean.match(/^(.+?\b(?:Latitude|Inspiron|Vostro|XPS|IdeaPad|ThinkPad|ProBook|EliteBook|Modern|Prestige|ExpertBook|ZenBook|VivoBook|Legion|LOQ)?(?:\s+\d{1,2})?)\s+([A-Z0-9-]{3,10}(?:\s*,\s*[A-Z0-9-]{2,10})+)$/i);
    if (commaNumMatch) {
      const prefix = commaNumMatch[1].trim();
      const codes = commaNumMatch[2].split(/\s*,\s*/);
      const areCodes = codes.every(c => /^[A-Z0-9-]{2,10}$/i.test(c.trim()) && !/^(AND|OR|THE|INCH|SERIES)$/i.test(c.trim()));
      if (areCodes) {
        const results = [];
        for (const code of codes) {
          if (code.length <= 2 && /^[A-Z]{1,3}\d{3}-\d{2}$/i.test(codes[0])) {
            const base = codes[0].split('-')[0];
            results.push(`${prefix} ${base}-${code}`.trim());
          } else {
            results.push(`${prefix} ${code}`.trim());
          }
        }
        return results;
      }
    }

    // Pattern 2: Comma-separated full models with repeated prefix
    // e.g. "HP EliteBook 840 G3, 840 G4, 840 G5"
    // e.g. "HP 15-fc Series, 15-fd Series"
    // e.g. "hp 250 g10 , 255 g1"
    if (textWithoutParenCommas.includes(',')) {
      const parts = textWithoutParenCommas.split(/\s*,\s*/).map(p => p.replace(/__COMMA__/g, ',').trim());
      if (parts.length > 1) {
        const firstPart = parts[0];
        const prefixWords = firstPart.split(/\s+/);
        if (prefixWords.length >= 2) {
          const subModels = [];
          let allMatched = true;
          for (let i = 0; i < parts.length; i++) {
            const p = parts[i].trim();
            if (p.toLowerCase().startsWith(prefixWords[0].toLowerCase())) {
              subModels.push(p);
            } else if (/^\d{3,4}\s*G\d/i.test(p) && prefixWords.length >= 3) {
              subModels.push(`${prefixWords[0]} ${prefixWords[1]} ${p}`.trim());
            } else if (/^G\d/i.test(p)) {
              subModels.push(`${firstPart.replace(/G\d.*$/, '')}${p}`.trim());
            } else {
              subModels.push(`${prefixWords[0]} ${p}`.trim());
            }
          }
          if (allMatched && subModels.length > 1) {
            return subModels;
          }
        }
      }
    }

    // Pattern 3: Hyphenated pair of models (e.g. "Lenovo LOQ 15IRX9 - 15IAX9")
    const hyphenPairMatch = clean.match(/^(.+?)\s+(\d{2}[A-Z0-9]{3,7})\s*-\s*(\d{2}[A-Z0-9]{3,7})$/i);
    if (hyphenPairMatch) {
      const prefix = hyphenPairMatch[1].trim();
      return [
        `${prefix} ${hyphenPairMatch[2]}`.trim(),
        `${prefix} ${hyphenPairMatch[3]}`.trim()
      ];
    }

    // Pattern 4: MacBook Air (13.3-inch, A1466, A1369)
    const appleMultiMatch = clean.match(/^(MacBook\s*(?:Air|Pro))\s*\((?:[^)]*,\s*)?(A\d{4})\s*,\s*(A\d{4})\)/i);
    if (appleMultiMatch) {
      return [
        `${appleMultiMatch[1]} ${appleMultiMatch[2]}`,
        `${appleMultiMatch[1]} ${appleMultiMatch[3]}`
      ];
    }

    return [clean];
  }

  cleanList(rawList) {
    if (!rawList || !Array.isArray(rawList)) return [];
    const seen = new Set();
    const clean = [];
    for (const item of rawList) {
      const trimmed = String(item || '').trim().replace(/\s+/g, ' ');
      if (!trimmed || /^(Acer\s+Asus\s+Dell|Brand|Model|Laptop|Catalog)/i.test(trimmed)) continue;

      const brandChunks = this.splitMultiBrandLine(trimmed);
      for (const chunk of brandChunks) {
        const semiParts = chunk.split(';');
        let parentBrand = '';
        for (const b of BRANDS) {
          if (new RegExp(`\\b${b}\\b`, 'i').test(semiParts[0])) {
            parentBrand = b.charAt(0) + b.slice(1).toLowerCase();
            break;
          }
        }

        for (const part of semiParts) {
          let cleanPart = part.trim().replace(/[,;]+$/, '').trim();
          if (!cleanPart || cleanPart.length < 3) continue;

          const hasBrand = BRANDS.some(b => new RegExp(`\\b${b}\\b`, 'i').test(cleanPart));
          if (!hasBrand && parentBrand) {
            cleanPart = `${parentBrand} ${cleanPart}`;
          }

          const subModels = this.expandSubModels(cleanPart);
          for (const sub of subModels) {
            const comp = this.compact(sub);
            if (comp.length >= 2 && !seen.has(comp)) {
              seen.add(comp);
              clean.push(sub);
            }
          }
        }
      }
    }
    return clean;
  }

  smartClassify(query, rawCatalog) {
    const catalog = this.cleanList(rawCatalog);
    const q = this.extractKeys(query);

    if (!q.comp) {
      return {
        status: 'UNAVAILABLE',
        isExactMatch: false,
        matchedModel: '',
        variants: [],
        reasoning: 'Please enter a model name.'
      };
    }

    // 1. Check for exact match first
    let exactMatchLine = null;
    const partialConflictMatches = [];

    for (const line of catalog) {
      const c = this.extractKeys(line);

      // Brand and series consistency
      if (q.brand && c.brand && q.brand !== c.brand) continue;
      if (q.series && c.series && q.series !== c.series && !c.series.includes(q.series) && !q.series.includes(c.series)) continue;

      const res = this.matchScore(q, c);

      if (res.score > 0) {
        if ((res.genConflict || res.suffixConflict) && res.numericMatched) {
          partialConflictMatches.push(line);
        } else if (res.numericMatched && q.hasExactCode && !res.genConflict && !res.suffixConflict) {
          if (!q.series || c.series === q.series || c.series.includes(q.series)) {
            exactMatchLine = line;
            break;
          }
        }
      }
    }

    if (!exactMatchLine && q.hasExactCode) {
      for (const line of catalog) {
        const c = this.extractKeys(line);
        if (q.brand && c.brand && q.brand !== c.brand) continue;
        if (q.series && c.series && q.series !== c.series) continue;
        const allCodesMatch = q.codes.length > 0 && q.codes.every(code => c.comp.includes(code));
        if (allCodesMatch) {
          if (q.gen && c.gen && q.gen !== c.gen) continue;
          exactMatchLine = line;
          break;
        }
      }
    }

    // Exact match found:
    // "eita shodu amake exact model ta dekhabo je available ase kina . jodi thake thaole bolbe and show korbe je ase extra ar kiso na"
    if (exactMatchLine) {
      return {
        status: 'AVAILABLE',
        isExactMatch: true,
        matchedModel: exactMatchLine,
        variants: [], // Extra nothing!
        reasoning: `Model "${query.trim()}" is available in stock.`
      };
    }

    // 2. Partial Conflict: user searched specific gen or suffix (e.g. 840 G2) that doesn't exist, but same model exists (840 G3, G4...)
    if (partialConflictMatches.length > 0) {
      return {
        status: 'PARTIAL',
        isExactMatch: false,
        matchedModel: partialConflictMatches[0],
        variants: partialConflictMatches,
        reasoning: `The exact model "${query.trim()}" was not found, but other variants of this model are in stock:`
      };
    }

    // 3. User typed a model/family without specific variant:
    // "jodi emon hoye ami emon ekta model er nam leksi jeita ar onk gola varient ase kinto ami type kori nai kinto pdf e ase . tahole oita same model er baki varient gola show korbe . onno kono model er na"
    const sameModelVariants = [];
    const seenVariants = new Set();

    for (const line of catalog) {
      const c = this.extractKeys(line);

      // Rule A: Brand mismatch check
      if (q.brand && c.brand && q.brand !== c.brand) continue;

      // Rule B: Series match (if user specified a series, like Latitude, LOQ, Inspiron, Aspire 3, etc.)
      if (q.series) {
        const seriesMatch = Boolean(c.series) && (c.series === q.series || c.series.includes(q.series) || q.series.includes(c.series));
        if (!seriesMatch) continue;
      }

      // Rule C: Number / Family match (e.g. 74 in Latitude 74, 15 in LOQ 15, 840 in EliteBook 840)
      if (q.familyNumbers.length > 0) {
        const numberMatches = q.familyNumbers.every(fn => {
          return c.comp.includes(fn) || c.codes.some(code => code.includes(fn));
        });
        if (!numberMatches) continue;
      }

      // Rule D: Base code match (e.g. 840 in EliteBook 840)
      if (q.baseCode && q.baseCode.length >= 3) {
        const baseMatch = c.codes.some(code => code.startsWith(q.baseCode) || code === q.baseCode) || c.comp.includes(q.baseCode);
        if (!baseMatch) continue;
      }

      // Check query tokens
      const qTokens = q.norm.split(/\s+/).filter(t => t.length >= 2 && !BRANDS.includes(t));
      const tokenMatches = qTokens.every(t => c.norm.includes(t) || c.comp.includes(t));
      if (q.series || tokenMatches) {
        const k = this.compact(line);
        if (!seenVariants.has(k)) {
          seenVariants.add(k);
          sameModelVariants.push(line);
        }
      }
    }

    if (sameModelVariants.length > 0) {
      if (sameModelVariants.length === 1) {
        return {
          status: 'AVAILABLE',
          isExactMatch: true,
          matchedModel: sameModelVariants[0],
          variants: [],
          reasoning: `Model "${query.trim()}" is available in stock.`
        };
      }
      return {
        status: 'VARIANTS',
        isExactMatch: false,
        matchedModel: `${query.trim()} Variants`,
        variants: sameModelVariants,
        reasoning: `Multiple variants found for "${query.trim()}". Available options:`
      };
    }

    // 4. Unavailable
    return {
      status: 'UNAVAILABLE',
      isExactMatch: false,
      matchedModel: '',
      variants: [],
      reasoning: `Model "${query.trim()}" was not found in the uploaded catalog.`
    };
  }

  classify(query, catalogVariants) {
    const res = this.smartClassify(query, catalogVariants);
    const categoryMap = {
      AVAILABLE: 'AVAILABLE',
      VARIANTS: 'PARTIAL',
      PARTIAL: 'PARTIAL',
      UNAVAILABLE: 'UNAVAILABLE'
    };
    return {
      category: categoryMap[res.status] || 'UNAVAILABLE',
      bestMatch: res.matchedModel,
      matches: res.variants.length > 0 ? res.variants : (res.matchedModel ? [res.matchedModel] : []),
      note: res.reasoning
    };
  }

  isModelMatch(query, model) {
    const res = this.classify(query, [model]);
    return res.category === 'AVAILABLE';
  }

  isLikelyModel(value) {
    const model = this.normalizeModel(value);
    if (!model || model.length < 2) return false;
    const stopWords = [
      'PDF', 'PAGE', 'FILE', 'MODEL', 'THE', 'AND', 'FOR', 'SCREENSHOT', 'LAPTOP',
      'CATALOG', 'SERIES', 'NOTEBOOK', 'AVAILABLE', 'STOCK', 'INCH', 'TRUE', 'FALSE',
      'NAME', 'BRAND', 'PRICE', 'TOTAL', 'VERSION', 'TABLE', 'SHEET', 'CHECK', 'STATUS'
    ];
    if (stopWords.includes(model)) return false;

    // Reject pure 1-3 digit numbers (page numbers, items, etc.)
    if (/^\d{1,3}$/.test(model)) return false;
    // Reject years (1990-2039)
    if (/^(19[9]\d|20[0-3]\d)$/.test(model)) return false;

    const hasLetters = /[A-Z]/.test(model);
    const hasDigits = /\d/.test(model);

    // Alphanumeric models (letters + digits)
    if (hasLetters && hasDigits) return true;

    // 4-5 digit standalone model numbers (Dell Inspiron 3511, Latitude 5420, XPS 9305, etc.)
    if (/^\d{4,5}$/.test(model)) return true;

    return false;
  }

  addModel(model, sourceLine, rawText) {
    const norm = this.normalizeModel(model);
    if (!norm || norm.length < 2) return;
    this.models.add(norm);

    // If sourceLine is a clean, readable line (e.g. "Aspire 3 A315-58"), use it as label
    const cleanLine = String(sourceLine || '').trim().replace(/\s+/g, ' ');
    const cleanRaw = String(rawText || model).trim();

    if (!this.modelLabels.has(norm)) {
      if (cleanLine.length >= 3 && cleanLine.length <= 45 && !cleanLine.includes('  ')) {
        this.modelLabels.set(norm, cleanLine);
      } else {
        this.modelLabels.set(norm, cleanRaw.toUpperCase());
      }
    }
  }

  extractModels(text) {
    this.models.clear();
    this.modelLabels.clear();
    this.catalogLines = [];

    if (!text || typeof text !== 'string') return;

    const rawLines = text.split(/\r?\n/);
    this.catalogLines = this.cleanList(rawLines);

    for (const line of this.catalogLines) {
      const norm = this.normalizeModel(line);
      if (this.isLikelyModel(norm)) {
        this.addModel(norm, line, line);
      }
      const code = this.extractModelCode(line);
      if (code && this.isLikelyModel(code)) {
        this.addModel(code, line, line);
      }
    }
  }

  getCleanCatalog() {
    return this.catalogLines.length > 0
      ? this.catalogLines
      : Array.from(this.models).map(m => this.displayModel(m));
  }

  displayModel(model) {
    return this.modelLabels.get(model) || model;
  }

  findLocalMatches(query) {
    if (!query) return [];
    const catalog = this.getCleanCatalog();
    const res = this.smartClassify(query, catalog);
    if (res.isExactMatch && res.matchedModel) return [res.matchedModel];
    return res.variants.length > 0 ? res.variants : (res.matchedModel ? [res.matchedModel] : []);
  }

  renderCatalogMatches(matches, title = 'PDF catalog matches') {
    if (!matches || !matches.length) return '';
    const seen = new Set();
    const uniqueList = [];
    for (const m of matches) {
      const clean = String(m || '').replace(/[,;]+$/, '').trim();
      const k = this.compact(clean);
      if (k.length >= 2 && !seen.has(k)) {
        seen.add(k);
        uniqueList.push(clean);
      }
    }
    if (!uniqueList.length || uniqueList.length <= 1) return '';

    return `
      <div class="catalog-options">
        <div class="options-title">${title} <span>${uniqueList.length}</span></div>
        <div class="catalog-list">
          ${uniqueList.map((model, index) => `
            <div class="catalog-option" style="--option-index: ${index};" onclick="window.modelChecker && window.modelChecker.selectCatalogOption('${this.escapeHtml(model).replace(/'/g, "\\'")}')">
              <span class="option-number">${String(index + 1).padStart(2, '0')}</span>
              <span class="option-name">${this.escapeHtml(model)}</span>
              <span class="option-arrow">↗</span>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  selectCatalogOption(model) {
    if (!model) return;
    this.searchInput.value = model;
    this.handleSearch();
  }

  async handlePDFUpload() {
    const file = this.pdfInput.files[0];
    if (!file) return;

    this.pdfFileName.textContent = file.name;
    this.pdfStatus.textContent = 'Extracting text...';
    this.pdfStatus.style.color = '#fbbf24';

    try {
      const arrayBuffer = await file.arrayBuffer();
      const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
      const pdf = await loadingTask.promise;

      let fullText = '';
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        let pageText = '';
        let lastY = null;

        for (const item of content.items) {
          if (!item.str) continue;
          // When vertical coordinate changes by more than 5pt, emit a newline
          if (lastY !== null && Math.abs(item.transform[5] - lastY) > 5) {
            pageText += '\n';
          } else if (pageText && !pageText.endsWith(' ') && !pageText.endsWith('\n')) {
            pageText += ' ';
          }
          pageText += item.str;
          if (item.hasEOL) {
            pageText += '\n';
          }
          lastY = item.transform[5];
        }

        fullText += pageText + '\n';
        this.pdfStatus.textContent = `Extracting page ${i}/${pdf.numPages}...`;
      }

      this.pdfText = fullText;
      this.extractModels(fullText);
      this.pdfLoaded = true;

      this.pdfStatus.textContent = `✅ Loaded ${this.models.size} models from ${file.name}`;
      this.pdfStatus.style.color = '#2dd4bf';

      // Update button states
      this.searchBtn.disabled = !this.searchInput.value.trim();
      this.updateAiButtons();
      this.aiStatus.textContent = `Catalog ready (${this.models.size} models)`;
      this.searchInput.focus();
    } catch (error) {
      console.error('PDF error:', error);
      this.pdfStatus.textContent = '❌ Failed to load PDF';
      this.pdfStatus.style.color = '#f87171';
      this.pdfLoaded = false;
    }
  }

  async handleSearch() {
    const query = this.searchInput.value.trim();
    if (!query || !this.pdfLoaded) return;

    this.searchBtn.disabled = true;
    this.searchResult.style.display = 'block';
    this.searchResult.className = '';
    void this.searchResult.offsetWidth; // reflow
    this.searchResult.className = 'result loading';
    this.searchResult.innerHTML = '<div>Evaluating catalog variants...</div>';

    const catalog = this.getCleanCatalog();
    const result = this.smartClassify(query, catalog);

    if (result.status === 'AVAILABLE' && result.isExactMatch) {
      this.searchResult.className = 'result available';
      this.searchResult.innerHTML = `
        <div class="result-badge">✅ AVAILABLE IN CATALOG</div>
        <div class="confirmed-model-card">
          <div class="confirmed-model-name">${this.escapeHtml(result.matchedModel)}</div>
          <div class="confirmed-model-note">${this.escapeHtml(result.reasoning || 'Exact model is confirmed and available in stock.')}</div>
        </div>
      `;
    } else if (result.status === 'VARIANTS') {
      this.searchResult.className = 'result partial';
      this.searchResult.innerHTML = `
        <div class="result-badge">◐ MULTIPLE VARIANTS IN STOCK</div>
        <div class="confirmed-model-card">
          <div class="confirmed-model-name">${this.escapeHtml(result.matchedModel)}</div>
          <div class="confirmed-model-note">${this.escapeHtml(result.reasoning)}</div>
        </div>
        ${this.renderCatalogMatches(result.variants, 'Available variants of this model')}
      `;
    } else if (result.status === 'PARTIAL') {
      this.searchResult.className = 'result partial';
      this.searchResult.innerHTML = `
        <div class="result-badge">◐ DIFFERENT VARIANT IN STOCK</div>
        <div class="confirmed-model-card">
          <div class="confirmed-model-name">${this.escapeHtml(result.matchedModel)}</div>
          <div class="confirmed-model-note">${this.escapeHtml(result.reasoning)}</div>
        </div>
        ${this.renderCatalogMatches(result.variants, 'Available catalog alternatives')}
      `;
    } else {
      this.searchResult.className = 'result unavailable';
      this.searchResult.innerHTML = `
        <div class="result-badge">❌ NOT FOUND IN CATALOG</div>
        <div class="confirmed-model-card">
          <div class="confirmed-model-name">${this.escapeHtml(query.toUpperCase())}</div>
          <div class="confirmed-model-note">Model was not found in the uploaded catalog.</div>
        </div>
      `;
    }

    this.searchBtn.disabled = false;
    this.searchInput.select();
  }

  async handleAiSearch() {
    const prompt = this.aiPromptInput.value.trim();
    if (!this.pdfLoaded) {
      this.aiStatus.textContent = 'Upload your PDF catalog first.';
      this.aiResult.style.display = 'block';
      this.aiResult.className = 'result not-found';
      this.aiResult.innerHTML = '<div>Upload a PDF before asking about availability.</div>';
      return;
    }
    if (!prompt) {
      this.aiStatus.textContent = 'Please enter a model name or question.';
      this.aiResult.style.display = 'block';
      this.aiResult.className = 'result not-found';
      this.aiResult.innerHTML = '<div>Enter a model to ask the AI assistant.</div>';
      return;
    }

    this.aiTextBtn.disabled = true;
    this.aiImageBtn.disabled = true;
    this.aiStatus.textContent = 'Asking AI assistant...';
    this.aiResult.style.display = 'block';
    this.aiResult.className = '';
    void this.aiResult.offsetWidth;
    this.aiResult.className = 'result loading';
    this.aiResult.innerHTML = '<div>Thinking...</div>';

    try {
      const cleanCatalog = this.getCleanCatalog();
      const response = await fetch(`${AI_API_BASE_URL}/api/ai-check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          availableModels: cleanCatalog
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'AI lookup failed');
      }

      // Deduplicate matched models
      const rawMatches = Array.isArray(data.matchedModels)
        ? data.matchedModels
        : (data.matchedModel ? [data.matchedModel] : []);
      const seen = new Set();
      const uniqueMatches = [];
      for (const m of rawMatches) {
        const clean = String(m || '').replace(/[,;]+$/, '').trim();
        const k = this.compact(clean);
        if (k.length >= 2 && !seen.has(k)) {
          seen.add(k);
          uniqueMatches.push(clean);
        }
      }

      const statusText = {
        available: '✅ Available in Catalog',
        unavailable: '❌ Not in Catalog',
        partial: '◐ Partial Match',
        uncertain: '？ Needs Confirmation'
      }[data.status] || (data.available ? '✅ Available in Catalog' : '❌ Not in Catalog');

      const statusClass = {
        available: 'result available',
        partial: 'result partial',
        uncertain: 'result uncertain',
        unavailable: 'result unavailable'
      }[data.status] || (data.available ? 'result available' : 'result unavailable');

      // If exact match or single match, DO NOT render catalog matches list: "extra ar kiso na"
      const isSingleExact = (data.status === 'available' || data.available) && uniqueMatches.length <= 1;
      const options = (!isSingleExact && uniqueMatches.length > 1)
        ? this.renderCatalogMatches(uniqueMatches, 'PDF catalog matches')
        : '';

      const serviceNotice = data.aiUnavailable
        ? '<div class="match-info">Gemini is temporarily busy. This result was checked directly against your PDF.</div>'
        : '';

      const matchedName = data.matchedModel || (uniqueMatches.length === 1 ? uniqueMatches[0] : null);
      const confirmedModelHtml = matchedName
        ? `
          <div class="confirmed-model-card">
            <div class="confirmed-model-name">${this.escapeHtml(matchedName)}</div>
            <div class="confirmed-model-note">${this.escapeHtml(data.reasoning || 'Exact model is confirmed and available in stock.')}</div>
          </div>
        `
        : `<div class="match-info">${this.escapeHtml(data.reasoning || 'AI assistant response')}</div>`;

      this.aiResult.className = statusClass;
      this.aiResult.innerHTML = `
        <div class="result-badge">${statusText}</div>
        ${confirmedModelHtml}
        ${options}
        ${data.ambiguous && uniqueMatches.length > 1 ? '<div class="match-info">Please select your specific variant from the list above.</div>' : ''}
        ${data.question ? `<div class="match-info"><strong>Question:</strong> ${this.escapeHtml(data.question)}</div>` : ''}
        <div class="match-info">Confidence: ${data.confidence || 0}%</div>
        ${serviceNotice}
      `;
      this.aiStatus.textContent = 'AI response ready';
    } catch (error) {
      console.error('AI lookup error:', error);
      const localMatches = this.findLocalMatches(prompt);
      if (localMatches.length) {
        this.aiResult.className = 'result available';
        const isSingle = localMatches.length === 1;
        this.aiResult.innerHTML = `
          <div class="result-badge">✅ Available in Catalog</div>
          <div class="confirmed-model-card">
            <div class="confirmed-model-name">${this.escapeHtml(localMatches[0])}</div>
            <div class="confirmed-model-note">Match confirmed directly from your uploaded PDF catalog.</div>
          </div>
          ${!isSingle ? this.renderCatalogMatches(localMatches, 'PDF catalog matches') : ''}
          <div class="match-info">AI explanation is temporarily unavailable, but the catalog match is confirmed locally.</div>
        `;
        this.aiStatus.textContent = 'Catalog result ready';
        return;
      }
      this.aiResult.className = 'result unavailable';
      this.aiResult.innerHTML = `
        <div class="result-badge">❌ AI Lookup Failed</div>
        <div class="match-info">${this.escapeHtml(error.message)}</div>
      `;
      this.aiStatus.textContent = 'API connection issue. Check your Python backend and Google key.';
    } finally {
      this.updateAiButtons();
    }
  }

  async handleAiImageSearch(file) {
    if (!this.pdfLoaded) {
      this.aiStatus.textContent = 'Upload your PDF catalog first.';
      this.aiResult.style.display = 'block';
      this.aiResult.className = 'result unavailable';
      this.aiResult.innerHTML = '<div>Upload a PDF before scanning an image.</div>';
      return;
    }

    this.aiTextBtn.disabled = true;
    this.aiImageBtn.disabled = true;
    this.aiStatus.textContent = 'Gemini is inspecting the image...';
    this.aiResult.style.display = 'block';
    this.aiResult.className = '';
    void this.aiResult.offsetWidth;
    this.aiResult.className = 'result loading';
    this.aiResult.innerHTML = '<div>Identifying laptop model...</div><div class="match-info">The image is sent securely to the AI backend for analysis.</div>';

    try {
      const cleanCatalog = this.getCleanCatalog();
      const formData = new FormData();
      formData.append('image', file);
      formData.append('availableModels', JSON.stringify(cleanCatalog));

      const response = await fetch(`${AI_API_BASE_URL}/api/ai-image-check`, {
        method: 'POST',
        body: formData
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || `AI image lookup failed (${response.status})`);

      const rawMatches = Array.isArray(data.matchedModels) ? data.matchedModels : [];
      const seen = new Set();
      const uniqueMatches = [];
      for (const m of rawMatches) {
        const clean = String(m || '').replace(/[,;]+$/, '').trim();
        const k = this.compact(clean);
        if (k.length >= 2 && !seen.has(k)) {
          seen.add(k);
          uniqueMatches.push(clean);
        }
      }

      const imageStatusText = {
        available: '✅ Available in Catalog',
        unavailable: '❌ Not in Catalog',
        partial: '◐ Partial Match',
        uncertain: '？ Model Needs Confirmation'
      }[data.status] || (data.available ? '✅ Available in Catalog' : '❌ Not in Catalog');

      const imageStatusClass = {
        available: 'result available',
        partial: 'result partial',
        uncertain: 'result uncertain',
        unavailable: 'result unavailable'
      }[data.status] || (data.available ? 'result available' : 'result unavailable');

      const isSingleExact = (data.status === 'available' || data.available) && uniqueMatches.length <= 1;
      const options = (!isSingleExact && uniqueMatches.length > 1)
        ? this.renderCatalogMatches(uniqueMatches, 'PDF catalog matches')
        : '';

      const matchedName = data.identifiedModel || (uniqueMatches.length === 1 ? uniqueMatches[0] : null);
      const confirmedCard = matchedName
        ? `
          <div class="confirmed-model-card">
            <div class="confirmed-model-name">${this.escapeHtml(matchedName)}</div>
            <div class="confirmed-model-note">${this.escapeHtml(data.reasoning || 'Image match confirmed in catalog.')}</div>
          </div>
        `
        : `<div class="match-info">${this.escapeHtml(data.reasoning || 'The assistant could not identify a confident model.')}</div>`;

      this.aiResult.className = imageStatusClass;
      this.aiResult.innerHTML = `
        <div class="result-badge">${imageStatusText}</div>
        ${confirmedCard}
        ${options}
        ${data.question ? `<div class="match-info"><strong>Question:</strong> ${this.escapeHtml(data.question)}</div>` : ''}
        <div class="match-info">Confidence: ${data.confidence || 0}%</div>
      `;
      this.aiStatus.textContent = data.available ? 'Image match ready' : 'Image checked';
    } catch (error) {
      console.error('AI image lookup error:', error);
      this.aiResult.className = 'result not-found';
      const message = error instanceof TypeError
        ? 'The remote AI backend could not be reached. Render may still be deploying or sleeping.'
        : error.message;
      this.aiResult.innerHTML = `<div>❌ Image lookup failed</div><div class="match-info">${this.escapeHtml(message)}</div>`;
      this.aiStatus.textContent = 'Image scan failed. Try again in a moment.';
    } finally {
      this.updateAiButtons();
    }
  }

  escapeHtml(value) {
    return String(value || '').replace(/[&<>'"]/g, (character) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[character]));
  }

}

document.addEventListener('DOMContentLoaded', () => {
  window.modelChecker = new ModelChecker();
  window.modelChecker.showTab('manual');
});
