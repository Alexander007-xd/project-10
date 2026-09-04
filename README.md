# ModelMatch Pro

Laptop model availability checker with manual PDF search and a Gemini AI assistant for text and laptop-image identification.

## Project structure

- `app-package/` - static frontend for GitHub Pages
- `server.py` - Flask API for text and image AI assistance
- `requirements.txt` - Python dependencies
- `render.yaml` - Render deployment configuration
- `.gitignore` - excludes local environments and secrets

## Local development

Start the backend with `GOOGLE_API_KEY` set in the terminal:

```powershell
$env:GOOGLE_API_KEY="your_google_api_key"
python server.py
```

Start the frontend from the project root:

```powershell
python -m http.server 8000
```

Open `http://localhost:8000/app-package/index.html`.

## Remote deployment

1. Deploy this repository as a Render web service.
2. Use `pip install -r requirements.txt` as the build command.
3. Use `python server.py` as the start command.
4. Add `GOOGLE_API_KEY` in Render Environment Variables.
5. Add `GEMINI_MODEL` with value `gemini-3.6-flash` in Render Environment Variables.
6. Put the Render service URL in `app-package/config.js`.
7. Enable GitHub Pages from the repository's `main` branch and open `/app-package/index.html`.

The AI image feature sends the uploaded image to the backend for Gemini analysis. The browser no longer runs OCR locally.

Never commit a real API key to the repository.
