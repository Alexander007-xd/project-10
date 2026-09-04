import os
import re
from typing import List

from flask import Flask, jsonify, request
from flask_cors import CORS
from google import genai
from google.genai import types

app = Flask(__name__)
CORS(app)

SYSTEM_PROMPT = """
You are a strict laptop model availability assistant.

Task:
- Check whether the user asks about a model that exists in the provided PDF model list.
- Give a short answer: either AVAILABLE or NOT AVAILABLE.
- If a match is found, return the exact matched model name from the list.
- If the model is not found, say it clearly and give a brief reason.
- Be conservative: only mark available when there is a strong match.
- Ignore irrelevant text and focus on model names.
- Keep the response concise: 2 to 4 short lines.
"""

TEMPERATURE = 0.2
MAX_OUTPUT_TOKENS = 120
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.6-flash")


def normalize_model(text: str) -> str:
    return re.sub(r"[^A-Za-z0-9]+", " ", str(text or "")).upper().strip()


def compact_model(text: str) -> str:
    return re.sub(r"[^A-Z0-9]", "", normalize_model(text))


def query_fragments(query: str) -> List[str]:
    normalized = normalize_model(query)
    tokens = normalized.split()
    fragments = []
    for index, token in enumerate(tokens):
        compact_token = compact_model(token)
        has_letters = bool(re.search(r"[A-Z]", compact_token))
        has_digits = bool(re.search(r"\d", compact_token))
        if has_letters and has_digits:
            fragments.append(compact_token)
        elif compact_token.isdigit() and len(compact_token) >= 3:
            fragments.append(compact_token)

        if index + 1 < len(tokens):
            next_token = compact_model(tokens[index + 1])
            if next_token and ((compact_token.isdigit() and len(next_token) <= 4 and re.search(r"[A-Z]", next_token))
                               or (has_letters and has_digits and next_token.isdigit())):
                fragments.append(compact_token + next_token)

    if fragments:
        return list(dict.fromkeys(fragments))
    return [compact_model(normalized)] if compact_model(normalized) else []


def find_model_matches(query: str, available_models: List[str]) -> List[str]:
    fragments = query_fragments(query)
    if not fragments:
        return []
    fragments = [max(fragments, key=len)]

    matches = []
    for model in available_models:
        model_compact = compact_model(model)
        if any(fragment and (fragment == model_compact or fragment in model_compact or model_compact in fragment)
               for fragment in fragments):
            matches.append(model)
    return list(dict.fromkeys(matches))


@app.route("/api/ai-check", methods=["POST"])
def ai_check():
    api_key = os.getenv("GOOGLE_API_KEY")
    if not api_key:
        return jsonify({
            "error": "Missing GOOGLE_API_KEY. Set it in your terminal before starting the server: set GOOGLE_API_KEY=your_key_here"
        }), 500

    payload = request.get_json(silent=True) or {}
    prompt = (payload.get("prompt") or "").strip()
    available_models = payload.get("availableModels") or []

    if not prompt:
        return jsonify({"error": "Prompt is required."}), 400

    matches = find_model_matches(prompt, available_models)
    model_list = ", ".join(available_models) if available_models else "No models provided."
    matched_list = ", ".join(matches) if matches else "No deterministic matches."
    user_input = (
        f"User question: {prompt}\n"
        f"Available models from PDF: {model_list}\n"
        f"Deterministic matches for the model fragment: {matched_list}\n"
        "Determine if the requested model is available."
    )

    try:
        client = genai.Client(api_key=api_key)
        response = client.models.generate_content(
            model=GEMINI_MODEL,
            contents=user_input,
            config=types.GenerateContentConfig(
                system_instruction=SYSTEM_PROMPT,
                temperature=TEMPERATURE,
                max_output_tokens=MAX_OUTPUT_TOKENS,
                top_p=0.9,
                candidate_count=1,
            ),
        )
        answer = (response.text or "").strip()
    except Exception as exc:  # pragma: no cover
        return jsonify({"error": f"AI request failed: {exc}"}), 500

    is_available = bool(matches)
    matched_model = matches[0] if matches else None
    if matches:
        reasoning = f"Found {len(matches)} matching model option(s) in the PDF."
    else:
        reasoning = answer or "No matching model was found in the PDF."

    return jsonify({
        "available": is_available,
        "matchedModel": matched_model,
        "matchedModels": matches,
        "ambiguous": len(matches) > 1,
        "reasoning": reasoning,
        "confidence": 98 if matches else 72,
    })


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=False)
