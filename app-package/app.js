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
    this.aiSearchBtn = document.getElementById('aiSearchBtn');
    this.aiStatus = document.getElementById('aiStatus');
    this.aiResult = document.getElementById('aiResult');

    this.pdfInput.addEventListener('change', () => this.handlePDFUpload());
    this.searchBtn.addEventListener('click', () => this.handleSearch());
    this.aiImageInput.addEventListener('change', async () => {
      const file = this.aiImageInput.files[0];
      this.aiImageFileName.textContent = file ? file.name : 'No image selected';
      if (!file) {
        this.aiSearchBtn.disabled = true;
        this.aiStatus.textContent = 'Ready';
        return;
      }

      this.aiPromptInput.value = '';
      this.aiSearchBtn.disabled = !this.pdfLoaded;
      this.aiStatus.textContent = this.pdfLoaded
        ? 'Image ready. Starting AI scan...'
        : 'Upload your PDF catalog first.';

      if (this.pdfLoaded) await this.handleAiImageSearch(file);
    });
    this.searchInput.addEventListener('input', () => {
      this.searchBtn.disabled = !this.pdfLoaded || !this.searchInput.value.trim();
    });
    this.searchInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') this.handleSearch();
    });

    this.manualTabBtn.addEventListener('click', () => this.showTab('manual'));
    this.aiTabBtn.addEventListener('click', () => this.showTab('ai'));
    this.aiSearchBtn.addEventListener('click', () => this.handleAiSearch());
    this.aiPromptInput.addEventListener('keydown', (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') this.handleAiSearch();
    });
    this.aiSearchBtn.disabled = true;
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
    const compact = this.normalizeModel(value);
    const numericCode = compact.match(/\d{3,6}[A-Z]\d{1,3}[A-Z]?|\d{3,6}[A-Z]{1,3}/g);
    if (numericCode) return numericCode.sort((left, right) => right.length - left.length)[0];
    const letterCode = compact.match(/[A-Z]{1,6}\d{2,6}[A-Z]{0,3}/g);
    return letterCode ? letterCode.sort((left, right) => right.length - left.length)[0] : '';
  }

  isModelMatch(query, model) {
    const normalizedQuery = this.normalizeModel(query);
    const normalizedModel = this.normalizeModel(model);

    if (!normalizedQuery || !normalizedModel) return false;
    if (normalizedQuery === normalizedModel) return true;

    const queryCode = this.extractModelCode(query);
    const modelCode = this.extractModelCode(model);
    if (queryCode) return queryCode === modelCode;
    if (modelCode) return /^[A-Z0-9]{3,}$/.test(normalizedQuery) && modelCode.includes(normalizedQuery);

    if (/^[A-Z0-9]{3,}$/.test(normalizedQuery) && normalizedModel.includes(normalizedQuery)) return true;

    const queryTokens = this.tokenizeModel(normalizedQuery);
    const modelTokens = this.tokenizeModel(normalizedModel);

    if (!queryTokens.length || !modelTokens.length) return false;

    let matchedTokens = 0;
    for (const token of queryTokens) {
      const found = modelTokens.some(candidate => candidate.includes(token) || token.includes(candidate));
      if (found) matchedTokens += 1;
    }

    return matchedTokens >= Math.min(queryTokens.length, 2);
  }

  isLikelyModel(value) {
    const model = this.normalizeModel(value);
    if (!model || model.length < 2) return false;
    if (['PDF', 'PAGE', 'FILE', 'MODEL', 'THE', 'AND', 'FOR', 'SCREENSHOT', 'LAPTOP'].includes(model)) {
      return false;
    }

    const hasLetters = /[A-Z]/.test(model);
    const hasDigits = /\d/.test(model);
    if (!hasLetters || !hasDigits) return false;

    return /^(?:[A-Z]{1,4}\d{2,5}[A-Z]{0,2}|\d{3,5}[A-Z]{1,3}|\d{3,5}[A-Z]\d{1,3}[A-Z]{0,2}|[A-Z]{2,4}\d{2,5}[A-Z]{0,2}|[A-Z]\d{1,3}[A-Z]{1,2}\d{1,4})$/i.test(model)
      || /[A-Z]{2,4}-?\d{2,5}/.test(model)
      || /[A-Z]{2,4}\d{2,5}[A-Z]{1,4}/.test(model);
  }

  extractModels(text) {
    this.models.clear();
    this.modelLabels.clear();

    const textVariants = [text, text.replace(/\s+/g, ' ')];
    const patterns = [
      /[A-Z]{1,4}-\d{2,5}[A-Z]{0,2}/g,
      /[A-Z]{1,4}-?\d{2,5}[A-Z]{0,2}/g,
      /[A-Z]{2,4}-?\d{2,5}[A-Z]{0,2}/g,
      /\d{3,5}[A-Z]{1,3}/g,
      /\d{3,5}\s*[A-Z]\s*\d{1,3}[A-Z]?/g,
      /[A-Z]\d{1,3}[A-Z]{1,2}\d{1,4}/g
    ];

    textVariants.forEach((value) => {
      const lines = value.split(/\n|\r/);
      lines.forEach((line) => {
        const candidates = line.match(/[A-Z]{1,4}-\d{2,5}[A-Z]{0,2}|[A-Z]{1,4}-?\d{2,5}[A-Z]{0,2}|\d{3,5}[A-Z]{1,3}|\d{3,5}\s*[A-Z]\s*\d{1,3}[A-Z]?|[A-Z]{2,4}-?\d{2,5}[A-Z]{0,2}|[A-Z]\d{1,3}[A-Z]{1,2}\d{1,4}/g) || [];

        candidates.forEach((item) => {
          const model = this.normalizeModel(item);
          if (this.isLikelyModel(model)) this.addModel(model, line);
        });

        patterns.forEach((pattern) => {
          const matches = line.match(pattern) || [];
          matches.forEach((match) => {
            const model = this.normalizeModel(match);
            if (this.isLikelyModel(model)) this.addModel(model, line);
          });
        });
      });
    });
  }

  addModel(model, sourceLine) {
    this.models.add(model);
    if (!this.modelLabels.has(model)) {
      this.modelLabels.set(model, model);
    }
  }

  displayModel(model) {
    return this.modelLabels.get(model) || model;
  }

  findLocalMatches(query) {
    const normalizedQuery = this.normalizeModel(query);
    const models = Array.from(this.models);
    const exactModels = models.filter(model => this.normalizeModel(model) === normalizedQuery);
    const matchingModels = exactModels.length ? exactModels : models.filter(model => this.isModelMatch(query, model));
    return matchingModels.map(model => this.displayModel(model));
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
        const pageText = content.items.map(item => item.str).join(' ');
        fullText += pageText + '\n';
        this.pdfStatus.textContent = `Extracting page ${i}/${pdf.numPages}...`;
      }

      this.pdfText = fullText;
      this.extractModels(fullText);
      this.pdfLoaded = true;

      this.pdfStatus.textContent = `✅ Loaded ${this.models.size} models`;
      this.pdfStatus.style.color = '#2dd4bf';
      this.searchBtn.disabled = false;
      this.aiSearchBtn.disabled = false;
      this.aiStatus.textContent = 'Catalog ready';
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
    if (this.aiImageInput.files[0]) {
      await this.handleAiImageSearch(this.aiImageInput.files[0]);
      return;
    }

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

    this.aiStatus.textContent = 'Asking AI assistant...';
    this.aiResult.style.display = 'block';
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
      const statusText = data.available ? '✅ Available' : '❌ Not Found';
      const statusClass = data.available ? 'result available' : 'result not-found';
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

    this.aiStatus.textContent = 'Gemini is inspecting the image...';
    this.aiResult.style.display = 'block';
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
      if (!response.ok) throw new Error(data.error || 'AI image lookup failed');

      const matches = Array.isArray(data.matchedModels) ? data.matchedModels : [];
      this.aiResult.className = data.available ? 'result available' : 'result not-found';
      this.aiResult.innerHTML = `
        <div>${data.available ? '✅ Available in your PDF' : '❌ Not Found in your PDF'}</div>
        <div class="match-info"><strong>AI identified:</strong> ${this.escapeHtml(data.identifiedModel || 'Model not clear')}</div>
        ${matches.length ? this.renderCatalogMatches(matches, 'PDF catalog matches') : ''}
        <div class="match-info">${this.escapeHtml(data.reasoning || 'The assistant could not identify a confident model.')}</div>
        <div class="match-info">Confidence: ${data.confidence || 0}%</div>
      `;
      this.aiStatus.textContent = data.available ? 'Image match ready' : 'Image checked';
    } catch (error) {
      console.error('AI image lookup error:', error);
      this.aiResult.className = 'result not-found';
      this.aiResult.innerHTML = `<div>❌ Image lookup failed</div><div class="match-info">${this.escapeHtml(error.message)}</div>`;
      this.aiStatus.textContent = 'Check the AI backend and try again.';
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
