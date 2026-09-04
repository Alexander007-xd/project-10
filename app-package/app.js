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
    this.pdfLoaded = false;

    this.pdfInput = document.getElementById('pdfInput');
    this.pdfFileName = document.getElementById('pdfFileName');
    this.pdfStatus = document.getElementById('pdfStatus');

    this.searchInput = document.getElementById('searchInput');
    this.searchBtn = document.getElementById('searchBtn');
    this.searchResult = document.getElementById('searchResult');

    this.imgInput = document.getElementById('imgInput');
    this.imgFileName = document.getElementById('imgFileName');
    this.ocrProgress = document.getElementById('ocrProgress');
    this.ocrStatus = document.getElementById('ocrStatus');
    this.ocrBar = document.getElementById('ocrBar');
    this.ocrResult = document.getElementById('ocrResult');

    this.manualTabBtn = document.getElementById('manualTabBtn');
    this.aiTabBtn = document.getElementById('aiTabBtn');
    this.manualPanel = document.getElementById('manualPanel');
    this.aiPanel = document.getElementById('aiPanel');

    this.aiPromptInput = document.getElementById('aiPromptInput');
    this.aiSearchBtn = document.getElementById('aiSearchBtn');
    this.aiStatus = document.getElementById('aiStatus');
    this.aiResult = document.getElementById('aiResult');

    this.pdfInput.addEventListener('change', () => this.handlePDFUpload());
    this.searchBtn.addEventListener('click', () => this.handleSearch());
    this.imgInput.addEventListener('change', () => this.handleImageUpload());
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

  isModelMatch(query, model) {
    const normalizedQuery = this.normalizeModel(query);
    const normalizedModel = this.normalizeModel(model);

    if (!normalizedQuery || !normalizedModel) return false;
    if (normalizedQuery === normalizedModel) return true;
    if (normalizedModel.includes(normalizedQuery) || normalizedQuery.includes(normalizedModel)) return true;

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
          if (this.isLikelyModel(model)) this.models.add(model);
        });

        patterns.forEach((pattern) => {
          const matches = line.match(pattern) || [];
          matches.forEach((match) => {
            const model = this.normalizeModel(match);
            if (this.isLikelyModel(model)) this.models.add(model);
          });
        });
      });
    });
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

    let found = false;
    let matchedModel = query.toUpperCase();

    for (const model of this.models) {
      if (this.isModelMatch(query, model)) {
        found = true;
        matchedModel = model;
        break;
      }
    }

    if (found) {
      this.searchResult.className = 'result available';
      this.searchResult.innerHTML = `
        <div>✅ Available</div>
        <div class="match-info">Model: ${matchedModel}</div>
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
          availableModels: Array.from(this.models)
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
        ? `<div class="match-info"><strong>Available options:</strong><br>${matchedModels.map(model => this.escapeHtml(model)).join('<br>')}</div>`
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
      this.aiResult.className = 'result not-found';
      this.aiResult.innerHTML = `
        <div>❌ AI lookup failed</div>
        <div class="match-info">${this.escapeHtml(error.message)}</div>
      `;
      this.aiStatus.textContent = 'API connection issue. Check your Python backend and Google key.';
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

  async handleImageUpload() {
    const file = this.imgInput.files[0];
    if (!file) return;

    this.imgFileName.textContent = file.name;
    this.ocrProgress.classList.add('active');
    this.ocrStatus.textContent = 'Preparing image...';
    this.updateOCRProgress(0);

    try {
      const img = await this.loadImageFile(file);
      this.ocrStatus.textContent = 'Running OCR (this may take 10-30s)...';
      this.updateOCRProgress(25);

      const { data: { text } } = await Tesseract.recognize(img, 'eng', {
        logger: (message) => {
          if (message.status === 'recognizing text') {
            const progress = 25 + Math.round((message.progress || 0) * 50);
            this.updateOCRProgress(progress);
            this.ocrStatus.textContent = `OCR: ${Math.round((message.progress || 0) * 100)}%`;
          }
        }
      });

      this.updateOCRProgress(75);
      this.ocrStatus.textContent = 'Extracting models from text...';

      const ocrText = text.toUpperCase();
      const potentialModels = this.extractModelsFromText(ocrText);

      let foundAny = false;
      let bestMatch = null;
      let matchedModel = null;

      for (const model of potentialModels) {
        const normalizedModel = this.normalizeModel(model);
        if (this.models.has(normalizedModel)) {
          foundAny = true;
          bestMatch = normalizedModel;
          matchedModel = normalizedModel;
          break;
        }

        for (const pdfModel of this.models) {
          if (this.isModelMatch(model, pdfModel)) {
            foundAny = true;
            bestMatch = `${normalizedModel} → ${pdfModel}`;
            matchedModel = pdfModel;
            break;
          }
        }
        if (foundAny) break;
      }

      this.ocrResult.style.display = 'block';
      if (foundAny && matchedModel) {
        this.searchInput.value = matchedModel;
        this.ocrResult.className = 'result available';
        this.ocrResult.innerHTML = `
          <div>✅ Model Found!</div>
          <div class="match-info">OCR Text: "${ocrText.substring(0, 50)}${ocrText.length > 50 ? '...' : ''}"<br>Match: ${bestMatch}</div>
        `;
        this.searchBtn.disabled = false;
      } else {
        this.ocrResult.className = 'result not-found';
        this.ocrResult.innerHTML = `
          <div>❌ No Match Found</div>
          <div class="match-info">OCR Text: "${ocrText.substring(0, 50)}${ocrText.length > 50 ? '...' : ''}"<br>Checked ${potentialModels.length} potential models</div>
        `;
      }

      this.updateOCRProgress(100);
      setTimeout(() => this.ocrProgress.classList.remove('active'), 1500);
    } catch (error) {
      console.error('OCR error:', error);
      this.ocrResult.style.display = 'block';
      this.ocrResult.className = 'result not-found';
      this.ocrResult.innerHTML = '<div>❌ OCR Failed</div><div class="match-info">Please try a clearer screenshot</div>';
      this.ocrProgress.classList.remove('active');
    }
  }

  loadImageFile(file) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const MAX_SIZE = 1400;
        let width = img.width;
        let height = img.height;

        if (width > MAX_SIZE || height > MAX_SIZE) {
          const scale = Math.min(MAX_SIZE / width, MAX_SIZE / height);
          width *= scale;
          height *= scale;
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');

        ctx.filter = 'contrast(1.7) saturate(1.2)';
        ctx.drawImage(img, 0, 0, width, height);

        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        for (let i = 0; i < data.length; i += 4) {
          const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
          const threshold = gray > 170 ? 255 : gray < 80 ? 0 : gray;
          data[i] = threshold;
          data[i + 1] = threshold;
          data[i + 2] = threshold;
        }
        ctx.putImageData(imageData, 0, 0);

        resolve(canvas);
      };
      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });
  }

  extractModelsFromText(text) {
    const models = new Set();
    const patterns = [
      /[A-Z]{1,4}-?\d{2,5}[A-Z]{0,2}/g,
      /\d{3,5}[A-Z]{1,3}/g,
      /\d{3,5}\s*[A-Z]\s*\d{1,3}[A-Z]?/g,
      /[A-Z]{2,4}-?\d{2,5}[A-Z]{0,2}/g,
      /[A-Z]\d{1,3}[A-Z]{1,2}\d{1,4}/g
    ];

    patterns.forEach((pattern) => {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const model = this.normalizeModel(match[0]);
        if (this.isLikelyModel(model)) models.add(model);
      }
    });

    return Array.from(models);
  }

  updateOCRProgress(percent) {
    this.ocrBar.style.width = percent + '%';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.modelChecker = new ModelChecker();
  window.modelChecker.showTab('manual');
});
