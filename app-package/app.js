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
  { name: 'MacBook Air', regex: /\b(?:MACBOOK\s*AIR|MBA)\b/i },
  { name: 'MacBook Pro', regex: /\b(?:MACBOOK\s*PRO|MBP)\b/i },
  { name: 'MacBook', regex: /\bMACBOOK\b/i },
  { name: 'Surface Laptop', regex: /\bSURFACE\s*LAPTOP\b/i },
  { name: 'Surface Pro', regex: /\bSURFACE\s*PRO\b/i },
  { name: 'Surface Book', regex: /\bSURFACE\s*BOOK\b/i },
  { name: 'Surface', regex: /\bSURFACE\b/i },
  { name: 'ThinkPad X1 Carbon', regex: /\b(?:THINKPAD\s*)?X1\s*CARBON\b/i },
  { name: 'ThinkPad X1 Yoga', regex: /\b(?:THINKPAD\s*)?X1\s*YOGA\b/i },
  { name: 'ThinkPad', regex: /\bTHINKPAD\b/i },
  { name: 'IdeaPad Flex', regex: /\bIDEAPAD\s*FLEX\b/i },
  { name: 'IdeaPad Gaming', regex: /\bIDEAPAD\s*GAMING\b/i },
  { name: 'IdeaPad Slim', regex: /\bIDEAPAD\s*SLIM\b/i },
  { name: 'IdeaPad', regex: /\bIDEAPAD\b/i },
  { name: 'Legion', regex: /\bLEGION\b/i },
  { name: 'LOQ', regex: /\bLOQ\b/i },
  { name: 'Yoga', regex: /\bYOGA\b/i },
  { name: 'EliteBook Folio', regex: /\bELITEBOOK\s*FOLIO\b/i },
  { name: 'EliteBook x360', regex: /\bELITEBOOK\s*X360\b/i },
  { name: 'EliteBook', regex: /\bELITEBOOK\b/i },
  { name: 'ProBook x360', regex: /\bPROBOOK\s*X360\b/i },
  { name: 'ProBook', regex: /\bPROBOOK\b/i },
  { name: 'Pavilion Aero', regex: /\bPAVILION\s*AERO\b/i },
  { name: 'Pavilion x360', regex: /\bPAVILION\s*X360\b/i },
  { name: 'Pavilion', regex: /\bPAVILION\b/i },
  { name: 'Envy x360', regex: /\bENVY\s*X360\b/i },
  { name: 'Envy', regex: /\bENVY\b/i },
  { name: 'Spectre x360', regex: /\bSPECTRE\s*X360\b/i },
  { name: 'Spectre', regex: /\bSPECTRE\b/i },
  { name: 'Victus', regex: /\bVICTUS\b/i },
  { name: 'Omen', regex: /\bOMEN\b/i },
  { name: 'Inspiron', regex: /\bINSPIRON\b/i },
  { name: 'Latitude', regex: /\bLATITUDE\b/i },
  { name: 'Vostro', regex: /\bVOSTRO\b/i },
  { name: 'XPS', regex: /\bXPS\b/i },
  { name: 'Precision', regex: /\bPRECISION\b/i },
  { name: 'VivoBook S', regex: /\bVIVOBOOK\s*S\b/i },
  { name: 'VivoBook Pro', regex: /\bVIVOBOOK\s*PRO\b/i },
  { name: 'VivoBook Go', regex: /\bVIVOBOOK\s*GO\b/i },
  { name: 'VivoBook', regex: /\bVIVOBOOK\b/i },
  { name: 'ZenBook', regex: /\bZENBOOK\b/i },
  { name: 'TUF Gaming', regex: /\bTUF\s*GAMING\b/i },
  { name: 'TUF Dash', regex: /\bTUF\s*DASH\b/i },
  { name: 'TUF', regex: /\bTUF\b/i },
  { name: 'ROG Zephyrus', regex: /\bROG\s*ZEPHYRUS\b/i },
  { name: 'ROG Strix', regex: /\bROG\s*STRIX\b/i },
  { name: 'ROG', regex: /\bROG\b/i },
  { name: 'ExpertBook', regex: /\bEXPERTBOOK\b/i },
  { name: 'Aspire 1', regex: /\bASPIRE\s*1\b/i },
  { name: 'Aspire 3', regex: /\bASPIRE\s*3\b/i },
  { name: 'Aspire 5', regex: /\bASPIRE\s*5\b/i },
  { name: 'Aspire 7', regex: /\bASPIRE\s*7\b/i },
  { name: 'Aspire', regex: /\bASPIRE\b/i },
  { name: 'Nitro 5', regex: /\bNITRO\s*5\b/i },
  { name: 'Nitro', regex: /\bNITRO\b/i },
  { name: 'Predator Helios Neo', regex: /\bPREDATOR\s*HELIOS\s*NEO\b/i },
  { name: 'Predator Helios', regex: /\bPREDATOR\s*HELIOS\b/i },
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

    // Check if text is solely a series or brand (e.g. "ThinkPad", "Dell Inspiron")
    let cleanRemaining = norm;
    for (const brand of BRANDS) {
      cleanRemaining = cleanRemaining.replace(new RegExp(`\\b${brand}\\b`, 'gi'), '');
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

    const primaryNumeric = baseCode || (codes.size > 0 ? Array.from(codes)[0] : '');

    return {
      raw: text,
      norm,
      comp,
      series: series.toUpperCase(),
      isSeriesOnly,
      gen: gen.toUpperCase(),
      numeric: primaryNumeric.toUpperCase(),
      baseCode: baseCode.toUpperCase(),
      suffix: suffix.toUpperCase(),
      codes: Array.from(codes).map(c => c.toUpperCase())
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
        // Conflicting series (e.g. ThinkPad vs IdeaPad, or EliteBook vs Pavilion)
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
        // Check suffix conflict
        if (q.suffix) {
          if (c.suffix && c.suffix === q.suffix) {
            score += 25;
          } else if (c.comp.includes(q.suffix)) {
            score += 20;
          } else {
            // User asked for specific suffix (e.g. 99 or IU), catalog has different suffix (58 or LH)
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
        // Conflicting generation (e.g. G2 vs G3, M3 vs M2)
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

  classify(query, catalogVariants) {
    const q = this.extractKeys(query);
    if (!q.comp) {
      return { category: 'UNAVAILABLE', bestMatch: '', matches: [] };
    }

    // If user only typed a series name without a model code (e.g. "ThinkPad" or "Inspiron")
    if (q.isSeriesOnly) {
      const seriesMatches = [];
      for (const rawVariant of catalogVariants) {
        const c = this.extractKeys(rawVariant);
        if (c.series && (c.series === q.series || c.series.includes(q.series) || q.series.includes(c.series))) {
          seriesMatches.push(rawVariant);
        }
      }
      if (seriesMatches.length > 0) {
        return {
          category: 'UNCERTAIN',
          bestMatch: seriesMatches[0],
          matches: seriesMatches.slice(0, 10),
          note: `Multiple models found for ${q.series}. Please specify your exact model number.`
        };
      }
    }

    let best = null;
    let bestScored = null;
    const partialMatches = [];
    const exactMatches = [];

    for (const rawVariant of catalogVariants) {
      const c = this.extractKeys(rawVariant);
      const res = this.matchScore(q, c);

      if (res.score > 0) {
        // Apply Suffix / Generation Conflict Hard Rule:
        if (res.genConflict || res.suffixConflict) {
          partialMatches.push({ variant: rawVariant, c, res });
        } else if (res.numericMatched) {
          exactMatches.push({ variant: rawVariant, c, res });
        } else {
          partialMatches.push({ variant: rawVariant, c, res });
        }

        if (!bestScored || res.score > bestScored.score) {
          best = rawVariant;
          bestScored = res;
        }
      }
    }

    exactMatches.sort((a, b) => b.res.score - a.res.score);
    partialMatches.sort((a, b) => b.res.score - a.res.score);

    if (exactMatches.length > 0) {
      return {
        category: 'AVAILABLE',
        bestMatch: exactMatches[0].variant,
        matches: exactMatches.map(m => m.variant),
        note: 'Exact model code & series confirmed in catalog stock.'
      };
    }

    if (partialMatches.length > 0) {
      return {
        category: 'PARTIAL',
        bestMatch: partialMatches[0].variant,
        matches: partialMatches.map(m => m.variant),
        note: 'A related model exists in stock, but the specific generation or suffix differs.'
      };
    }

    // Direct line substring fallback
    const directLine = catalogVariants.find(line => this.compact(line).includes(q.comp));
    if (directLine) {
      return {
        category: 'AVAILABLE',
        bestMatch: directLine,
        matches: [directLine],
        note: 'Exact model text matched in catalog.'
      };
    }

    return {
      category: 'UNAVAILABLE',
      bestMatch: '',
      matches: [],
      note: 'Model was not found in the uploaded catalog.'
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

    // Preserve non-empty lines from PDF
    const rawLines = text.split(/\r?\n/);
    for (const rawLine of rawLines) {
      const trimmed = rawLine.trim().replace(/\s+/g, ' ');
      if (trimmed.length > 1) {
        this.catalogLines.push(trimmed);
      }
    }

    // Comprehensive case-insensitive regex patterns for all major laptop catalog formats
    const patterns = [
      // 1. Hyphenated: A315-58, A515-56, AN515-57, SF314-511, PH315-54, FA506-IC, FX505-DT, RZ09-0300, X-T30
      /[a-zA-Z]{1,4}\d{1,5}-[a-zA-Z0-9]{1,6}/gi,
      // 2. HP hyphenated: 15-dw3000, 15s-fq5000, 15-dy2000, 14-dq1000, 15-eg, 15-fb, 14-dv, 16-d, 15s-du, 15-fc, 15-fd
      /\d{2,3}[a-zA-Z]{0,2}-[a-zA-Z]{1,4}\d{0,5}[a-zA-Z]{0,3}/gi,
      // 3. Standalone hyphenated: UX-425, G-513, etc.
      /[a-zA-Z]{2,6}-[a-zA-Z0-9]{2,6}/gi,
      // 4. Alphanumeric: X515EA, FX506LH, GA401, UX425, A2337, A2681, A2442, T480, T490, 500D, RC30, 573G, B10MW
      /[a-zA-Z]{1,4}\d{2,5}[a-zA-Z]{0,4}/gi,
      // 5. Digits followed by letters: 500D, 573G, 75G, 14ISK, 14IKB, 14KBR, 14IAU7, 14IRU8, 14abr8, 8460p, 8470p
      /\d{2,4}[a-zA-Z]{1,5}/gi,
      // 6. Lenovo style: 15ITL6, 15ALC6, 15IAU7, 15AMN7, 15IAL7, 15ACH6, 16ACH6H, 15IRH8, 15ITL05, 14ITL6
      /\d{2,3}[a-zA-Z]{1,4}\d{1,4}[a-zA-Z0-9]{0,3}/gi,
      // 7. G series / EliteBook / ProBook: 840 G3, 840 G5, 830 G5, 850 G6, 450 G8, 1040 G3, G15 5511, G15 5515, 250 g10, 255 g10
      /\d{3,5}\s*[a-zA-Z]\s*\d{1,3}[a-zA-Z0-9]{0,2}/gi,
      // 8. ThinkPad Gen: T14 Gen 1, T14 Gen 2, X1 Carbon Gen 9, E14 Gen 2, Gen 7, Gen 8, Gen 10
      /[a-zA-Z0-9]{1,3}\s*(?:Gen\s*\d{1,2}|s)?/gi,
      // 9. Dell regulatory numbers: (P185G), P112F, P89G, P90F, P28F, P40F, P47F, P64G, P51F, P66F, P144G, P38F, P98G, P99G
      /\bP\d{2,3}[A-Za-z]\b/gi,
      // 10. Surface model numbers: Model 1868, Model 1769
      /\bModel\s*\d{4}\b/gi,
      // 11. Lenovo machine codes: (81W1), (81W4), (82KU), (82MF), (83ER), (83EM)
      /\b\d{2}[A-Za-z0-9]{2}\b/gi,
      // 12. Series + model names: Inspiron 15 3511, Latitude 5420, Vostro 3510, XPS 15 9510, MacBook Air M1, Surface Laptop 3
      /(?:Inspiron|Latitude|Vostro|XPS|Pavilion|Envy|Spectre|Victus|Omen|ThinkPad|IdeaPad|Legion|Yoga|LOQ|VivoBook|ZenBook|TUF|ROG|Aspire|Swift|Nitro|Predator|MacBook|Surface)\s+(?:[A-Za-z0-9-]+\s+)*[A-Za-z0-9-]+/gi,
      // 13. Apple model numbers: A2337, A2681, A2338, A2442, A2485, A2141, A1465, A1466, A1369, A1237, A1304, A3240, A3113, A2780
      /\bA\d{4}\b/gi,
      // 14. Standalone 4-5 digit model numbers in lines (3510, 3511, 3515, 3520, 3530, 5420, 9305, 1868, 1769)
      /\b\d{4,5}\b/g
    ];

    for (const line of this.catalogLines) {
      // Clean variant with normalized spacing around hyphens: "A315 - 58" => "A315-58"
      const normalizedLine = line.replace(/\s*-\s*/g, '-');
      // Sub-items separated by commas, semicolons, or slashes
      const subItems = line.split(/[,;/|]+/).map(s => s.trim()).filter(s => s.length >= 2);
      const testLines = [line, normalizedLine, ...subItems];

      for (const currentLine of testLines) {
        for (const pattern of patterns) {
          const matches = currentLine.match(pattern) || [];
          for (const match of matches) {
            const trimmed = match.trim();
            const norm = this.normalizeModel(trimmed);
            if (this.isLikelyModel(norm)) {
              this.addModel(norm, line, trimmed);

              // Also add the pure model code if different
              const code = this.extractModelCode(trimmed);
              if (code && code !== norm && this.isLikelyModel(code)) {
                this.addModel(code, line, trimmed);
              }
            }
          }
        }
      }
    }
  }

  displayModel(model) {
    return this.modelLabels.get(model) || model;
  }

  findLocalMatches(query) {
    if (!query) return [];
    const catalogVariants = this.catalogLines.length > 0
      ? this.catalogLines
      : Array.from(this.models).map(m => this.displayModel(m));
    const res = this.classify(query, catalogVariants);
    return res.matches.length > 0 ? res.matches : (res.bestMatch ? [res.bestMatch] : []);
  }

  renderCatalogMatches(matches, title = 'PDF catalog matches') {
    if (!matches || !matches.length) return '';
    return `
      <div class="catalog-options">
        <div class="options-title">${title} <span>${matches.length}</span></div>
        <div class="catalog-list">
          ${matches.map((model, index) => `
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

    // Prioritize catalogLines, fallback to extracted models
    const catalogVariants = this.catalogLines.length > 0
      ? this.catalogLines
      : Array.from(this.models).map(model => this.displayModel(model));

    const result = this.classify(query, catalogVariants);

    if (result.category === 'AVAILABLE') {
      this.searchResult.className = 'result available';
      this.searchResult.innerHTML = `
        <div class="result-badge">✅ AVAILABLE IN CATALOG</div>
        <div class="best-match-card">
          <div class="best-match-header">
            <span class="best-match-tag">Best Matching Catalog Line</span>
            <span class="best-match-pill">100% MATCH</span>
          </div>
          <div class="best-match-line">${this.escapeHtml(result.bestMatch)}</div>
          <div class="best-match-note">${this.escapeHtml(result.note || 'Exact model code & series confirmed in catalog.')}</div>
        </div>
        ${result.matches.length > 1 ? this.renderCatalogMatches(result.matches, 'All matching catalog variants') : ''}
      `;
    } else if (result.category === 'PARTIAL') {
      this.searchResult.className = 'result partial';
      this.searchResult.innerHTML = `
        <div class="result-badge">◐ PARTIAL MATCH</div>
        <div class="best-match-card">
          <div class="best-match-header">
            <span class="best-match-tag">Closest Catalog Line</span>
            <span class="best-match-pill">DIFFERENT VARIANT</span>
          </div>
          <div class="best-match-line">${this.escapeHtml(result.bestMatch)}</div>
          <div class="best-match-note">${this.escapeHtml(result.note || 'A related model exists in stock, but the specific generation or suffix differs.')}</div>
        </div>
        ${result.matches.length > 0 ? this.renderCatalogMatches(result.matches, 'Available catalog alternatives') : ''}
      `;
    } else if (result.category === 'UNCERTAIN') {
      this.searchResult.className = 'result uncertain';
      this.searchResult.innerHTML = `
        <div class="result-badge">？ NEEDS CONFIRMATION</div>
        <div class="best-match-card">
          <div class="best-match-header">
            <span class="best-match-tag">Series Detected</span>
            <span class="best-match-pill">SPECIFY EXACT MODEL</span>
          </div>
          <div class="best-match-line">${this.escapeHtml(result.bestMatch)}</div>
          <div class="best-match-note">${this.escapeHtml(result.note || 'Multiple models found for this series. Please enter your exact model number.')}</div>
        </div>
        ${result.matches.length > 0 ? this.renderCatalogMatches(result.matches, 'Models in this series') : ''}
      `;
    } else {
      this.searchResult.className = 'result unavailable';
      this.searchResult.innerHTML = `
        <div class="result-badge">❌ NOT FOUND IN CATALOG</div>
        <div class="match-info" style="margin-top: 12px; font-size: 0.85rem;">
          Model "<strong>${this.escapeHtml(query.toUpperCase())}</strong>" was not found in the uploaded catalog.
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
      const response = await fetch(`${AI_API_BASE_URL}/api/ai-check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          availableModels: Array.from(this.models).map(model => this.displayModel(model))
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'AI lookup failed');
      }

      const matchedModels = Array.isArray(data.matchedModels)
        ? data.matchedModels
        : (data.matchedModel ? [data.matchedModel] : []);
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

      const options = matchedModels.length
        ? this.renderCatalogMatches(matchedModels)
        : '';
      const serviceNotice = data.aiUnavailable
        ? '<div class="match-info">Gemini is temporarily busy. This result was checked directly against your PDF.</div>'
        : '';
      this.aiResult.className = statusClass;
      this.aiResult.innerHTML = `
        <div class="result-badge">${statusText}</div>
        <div class="match-info">${this.escapeHtml(data.reasoning || 'AI assistant response')}</div>
        ${options}
        <div class="match-info">${data.ambiguous ? 'Please enter the exact model name for a precise result.' : `Matched model: ${this.escapeHtml(data.matchedModel || 'None')}`}</div>
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
        this.aiResult.innerHTML = `
          <div class="result-badge">✅ Available in Catalog</div>
          ${this.renderCatalogMatches(localMatches)}
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
      const formData = new FormData();
      formData.append('image', file);
      formData.append('availableModels', JSON.stringify(Array.from(this.models).map(model => this.displayModel(model))));

      const response = await fetch(`${AI_API_BASE_URL}/api/ai-image-check`, {
        method: 'POST',
        body: formData
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || `AI image lookup failed (${response.status})`);

      const matches = Array.isArray(data.matchedModels) ? data.matchedModels : [];
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

      this.aiResult.className = imageStatusClass;
      this.aiResult.innerHTML = `
        <div class="result-badge">${imageStatusText}</div>
        <div class="match-info"><strong>AI identified:</strong> ${this.escapeHtml(data.identifiedModel || 'Model not clear')}</div>
        ${matches.length ? this.renderCatalogMatches(matches, 'PDF catalog matches') : ''}
        <div class="match-info">${this.escapeHtml(data.reasoning || 'The assistant could not identify a confident model.')}</div>
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
