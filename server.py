import os
import re
from typing import List, Optional

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


def best_model_match(query: str, available_models: List[str]) -> Optional[str]:
    if not available_models:
        return None

    query_norm = normalize_model(query)
    best_match = None
    best_score = 0

    for model in available_models:
        model_norm = normalize_model(model)
        if not model_norm:
            continue

        if query_norm == model_norm:
            return model

        if query_norm in model_norm or model_norm in query_norm:
            score = 95
        else:
            q_tokens = set(query_norm.split())
            m_tokens = set(model_norm.split())
            common = q_tokens & m_tokens
            score = len(common) * 25

        if score > best_score:
            best_score = score
            best_match = model

    return best_match if best_score >= 25 else None


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

    model_list = ", ".join(available_models) if available_models else "No models provided."
    user_input = (
        f"User question: {prompt}\n"
        f"Available models from PDF: {model_list}\n"
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

    normalized_answer = answer.lower()
    is_available = "available" in normalized_answer and "not available" not in normalized_answer
    matched_model = best_model_match(prompt, available_models)

    return jsonify({
        "available": is_available,
        "matchedModel": matched_model,
        "reasoning": answer,
        "confidence": 92 if matched_model else 72,
    })


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=False)
