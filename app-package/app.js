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

  normalizeModel(value) {
    return String(value || '')
      .trim()
      .toUpperCase()
      .replace(/\s+/g, '')
      .replace(/[^A-Z0-9]/g, '');
  }

  tokenizeModel(value) {
    const normalized = this.normalizeModel(value);
    return (normalized.match(/[A-Z]+\d+|\d+[A-Z]+|[A-Z]+|\d+/g) || []).filter(Boolean);
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

  isModelMatch(query, model) {
    const normalizedQuery = this.normalizeModel(query);
    const normalizedModel = this.normalizeModel(model);

    if (!normalizedQuery || !normalizedModel) return false;
    if (normalizedQuery === normalizedModel) return true;

    const queryCode = this.extractModelCode(query);
    const modelCode = this.extractModelCode(model);

    // Exact model code matching when both codes exist
    if (queryCode && modelCode) {
      return queryCode === modelCode;
    }

    // Direct substring match if query has at least 3 characters
    if (normalizedQuery.length >= 3 && normalizedModel.includes(normalizedQuery)) {
      return true;
    }
    if (normalizedModel.length >= 3 && normalizedQuery.includes(normalizedModel)) {
      return true;
    }

    // Multi-token matching for phrases like "MacBook Air M1" or "IdeaPad 3"
    const queryTokens = this.tokenizeModel(normalizedQuery).filter(t => t.length >= 2);
    const modelTokens = this.tokenizeModel(normalizedModel).filter(t => t.length >= 2);

    if (!queryTokens.length || !modelTokens.length) return false;

    const meaningfulQueryTokens = queryTokens.filter(t => !['LAPTOP', 'NOTEBOOK', 'THE', 'AND', 'FOR', 'SERIES', 'INCH'].includes(t));
    if (!meaningfulQueryTokens.length) return false;

    let matchedTokens = 0;
    for (const token of meaningfulQueryTokens) {
      const found = modelTokens.some(candidate => candidate === token || (candidate.length >= 3 && candidate.includes(token)));
      if (found) matchedTokens += 1;
    }

    return matchedTokens === meaningfulQueryTokens.length || (meaningfulQueryTokens.length >= 2 && matchedTokens >= 2);
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
      // 1. Hyphenated: A315-58, A515-56, AN515-57, SF314-511, PH315-54, FA506-IC, FX505-DT
      /[a-zA-Z]{1,4}\d{2,5}-[a-zA-Z0-9]{1,6}/gi,
      // 2. HP hyphenated: 15-dw3000, 15s-fq5000, 15-dy2000, 14-dq1000, 15-eg, 15-fb, 14-dv, 16-d, 15s-du
      /\d{2,3}[a-zA-Z]{0,2}-[a-zA-Z]{1,4}\d{0,5}[a-zA-Z]{0,3}/gi,
      // 3. Standalone hyphenated: UX-425, G-513, etc.
      /[a-zA-Z]{2,6}-[a-zA-Z0-9]{2,6}/gi,
      // 4. Alphanumeric: X515EA, FX506LH, GA401, UX425, A2337, A2681, A2442, T480, T490
      /[a-zA-Z]{1,4}\d{2,5}[a-zA-Z]{0,4}/gi,
      // 5. Lenovo style: 15ITL6, 15ALC6, 15IAU7, 15AMN7, 15IAL7, 15ACH6, 16ACH6H, 15IRH8, 15ITL05, 14ITL6
      /\d{2,3}[a-zA-Z]{1,4}\d{1,4}[a-zA-Z0-9]{0,3}/gi,
      // 6. G series / EliteBook / ProBook: 840 G3, 840 G5, 830 G5, 850 G6, 450 G8, 1040 G3, G15 5511, G15 5515
      /\d{3,5}\s*[a-zA-Z]\s*\d{1,3}[a-zA-Z0-9]{0,2}/gi,
      // 7. ThinkPad Gen: T14 Gen 1, T14 Gen 2, X1 Carbon Gen 9, E14 Gen 2
      /[a-zA-Z]{1,3}\d{1,3}\s*(?:Gen\s*\d{1,2}|s)?/gi,
      // 8. Series + model names: Inspiron 15 3511, Latitude 5420, Vostro 3510, XPS 15 9510, MacBook Air M1
      /(?:Inspiron|Latitude|Vostro|XPS|Pavilion|Envy|Spectre|Victus|Omen|ThinkPad|IdeaPad|Legion|Yoga|LOQ|VivoBook|ZenBook|TUF|ROG|Aspire|Swift|Nitro|Predator|MacBook)\s+(?:[A-Za-z0-9-]+\s+)*[A-Za-z0-9-]+/gi,
      // 9. Apple model numbers: A2337, A2681, A2338, A2442, A2485, A2141
      /\bA\d{4}\b/gi,
      // 10. Standalone 4-5 digit model numbers in lines (3511, 5420, 9305)
      /\b\d{4,5}\b/g
    ];

    for (const line of this.catalogLines) {
      // Clean variant with normalized spacing around hyphens: "A315 - 58" => "A315-58"
      const normalizedLine = line.replace(/\s*-\s*/g, '-');
      const testLines = [line, normalizedLine];

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
    const normalizedQuery = this.normalizeModel(query);
    if (!normalizedQuery) return [];

    const matches = new Set();

    // 1. Direct and code match across extracted models
    for (const model of this.models) {
      if (this.isModelMatch(query, model)) {
        matches.add(this.displayModel(model));
      }
    }

    // 2. Scan raw catalog lines for exact token matches (fallback for complex multi-word catalog lines)
    if (matches.size === 0 && this.catalogLines.length > 0) {
      const qTokens = this.tokenizeModel(normalizedQuery).filter(t => t.length >= 2);
      if (qTokens.length > 0) {
        for (const line of this.catalogLines) {
          const normLine = this.normalizeModel(line);
          if (normLine.includes(normalizedQuery)) {
            matches.add(line);
          } else {
            const allMatch = qTokens.every(token => normLine.includes(token));
            if (allMatch) {
              matches.add(line);
            }
          }
        }
      }
    }

    return Array.from(matches);
  }

  renderCatalogMatches(matches, title = 'PDF catalog matches') {
    return `
      <div class="catalog-options">
        <div class="options-title">${title} <span>${matches.length}</span></div>
        <div class="catalog-list">
          ${matches.map((model, index) => `
            <div class="catalog-option" style="--option-index: ${index};">
              <span class="option-number">${String(index + 1).padStart(2, '0')}</span>
              <span class="option-name">${this.escapeHtml(model)}</span>
              <span class="option-arrow">↗</span>
            </div>
          `).join('')}
        </div>
      </div>
    `;
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
    const normalizedQuery = this.normalizeModel(query);
    if (!normalizedQuery || !this.pdfLoaded) return;

    this.searchBtn.disabled = true;
    this.searchResult.style.display = 'block';
    // Force re-trigger animation by temporarily removing the class
    this.searchResult.className = '';
    void this.searchResult.offsetWidth; // reflow
    this.searchResult.className = 'result loading';
    this.searchResult.innerHTML = '<div>Searching...</div>';

    const matchedModels = this.findLocalMatches(query);
    const found = matchedModels.length > 0;

    if (found) {
      this.searchResult.className = 'result available';
      this.searchResult.innerHTML = `
        <div>✅ Available</div>
        ${this.renderCatalogMatches(matchedModels)}
      `;
    } else {
      this.searchResult.className = 'result not-found';
      this.searchResult.innerHTML = `
        <div>❌ Not Found</div>
        <div class="match-info">Model: ${query.toUpperCase()}</div>
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
        available: '✅ Available',
        unavailable: '❌ Not in catalog',
        partial: '◐ Partial match',
        uncertain: '？ Needs confirmation'
      }[data.status] || (data.available ? '✅ Available' : '❌ Not Found');
      const statusClass = data.status === 'available' || data.available ? 'result available' : 'result not-found';
      const options = matchedModels.length
        ? this.renderCatalogMatches(matchedModels)
        : '';
      const serviceNotice = data.aiUnavailable
        ? '<div class="match-info">Gemini is temporarily busy. This result was checked directly against your PDF.</div>'
        : '';
      this.aiResult.className = statusClass;
      this.aiResult.innerHTML = `
        <div>${statusText}</div>
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
          <div>✅ Available in your PDF</div>
          ${this.renderCatalogMatches(localMatches)}
          <div class="match-info">AI explanation is temporarily unavailable, but the catalog match is confirmed locally.</div>
        `;
        this.aiStatus.textContent = 'Catalog result ready';
        return;
      }
      this.aiResult.className = 'result not-found';
      this.aiResult.innerHTML = `
        <div>❌ AI lookup failed</div>
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
      this.aiResult.className = 'result not-found';
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
        available: '✅ Available in your PDF',
        unavailable: '❌ Not in your PDF',
        partial: '◐ Partial catalog match',
        uncertain: '？ Model needs confirmation'
      }[data.status] || (data.available ? '✅ Available in your PDF' : '❌ Not Found in your PDF');
      this.aiResult.className = data.status === 'available' || data.available ? 'result available' : 'result not-found';
      this.aiResult.innerHTML = `
        <div>${imageStatusText}</div>
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
