import os
import re
import time
import json
from typing import List

from flask import Flask, jsonify, request
from flask_cors import CORS
from google import genai
from google.genai import types

app = Flask(__name__)
CORS(
    app,
    resources={r"/api/*": {"origins": [
        "http://localhost:8000",
        "http://127.0.0.1:8000",
        "https://alexander007-xd.github.io",
    ]}},
    methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type"],
)

SYSTEM_PROMPT = """
You are ModelMatch Pro, a Laptop Skin Availability Checker Assistant for a laptop-skin seller.

Your job is to check whether a laptop skin design is available for a model mentioned by the user.
The catalog supplied in the request is the only source of truth. Never claim availability from
your general laptop knowledge or memory.

The user may provide a full model, a shortened model code, a brandless code, a typo, or several
models in one request. Search the whole catalog when the brand is missing. Catalog lines may group
variants with commas or semicolons, or describe a series/generation. Evaluate each variant carefully.

For a text request:
- Check exact model, numeric core, sub-model code, and generation.
- A close match is not automatically available. Variant and suffix differences matter, including
- G6 vs G8, Yoga vs non-Yoga, CPU generation, and screen/model family differences.
- If the exact variant is not confirmed but a close catalog entry exists, ask for the exact SKU,
    generation, or model suffix instead of confirming availability.

For an image request, inspect System Information, dxdiag, BIOS, or product-label images. Prioritize
System Manufacturer, System Model, System SKU, and Processor. System SKU often contains the precise
model code. Ignore serial numbers, asset tags, Windows keys, and barcodes.

Every result belongs to exactly one category:
1. AVAILABLE: a clear exact catalog match. Mention the matching catalog entry.
2. UNAVAILABLE: no catalog match. Say it is not in the list; do not guess.
3. PARTIAL: a related entry exists, but the exact variant/suffix is not confirmed. Ask one question.
4. UNCERTAIN: the evidence or image is unclear and identity cannot be confidently confirmed.

Return concise customer-support wording. For multiple models, return a numbered result for each.
Return JSON only with this shape:
{
    "status": "available|unavailable|partial|uncertain",
    "identified_model": "model or empty string",
    "matched_models": [],
    "reasoning": "short customer-facing explanation",
    "question": "one clarifying question or empty string"
}
"""

IMAGE_SYSTEM_PROMPT = """
You are ModelMatch Pro, a professional Laptop Skin Availability Checker Assistant.

Inspect the uploaded System Information, dxdiag, BIOS, sticker, bezel, or product-label image.
Read System Manufacturer, System Model, System SKU, and Processor when visible. The SKU often
contains the precise model code or generation. Never invent unreadable text. Ignore serial numbers,
asset tags, Windows keys, and barcodes.

Compare the identified model only with the supplied catalog. A brandless code must be searched
across the whole catalog. Numeric core, sub-model code, and generation can suggest a close match,
but suffixes and variants matter: G6 vs G8, Yoga vs non-Yoga, CPU generation, and family differences
must not be silently treated as identical. If the exact variant is not confirmed, use partial or
uncertain instead of available.

Use these categories:
- available: clear exact catalog match
- unavailable: no catalog match
- partial: related catalog entry exists, exact variant needs confirmation
- uncertain: image or model identity is not clear enough

Return JSON only:
{
    "status": "available|unavailable|partial|uncertain",
    "identified_model": "best visible model text or empty string",
    "matched_models": [],
    "confidence": 0,
    "reasoning": "short customer-facing explanation",
    "question": "one clarifying question or empty string"
}
Confidence must be an integer from 0 to 100.
"""

TEMPERATURE = 0.2
MAX_OUTPUT_TOKENS = 512
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.6-flash")
GEMINI_IMAGE_MODEL = os.getenv("GEMINI_IMAGE_MODEL", GEMINI_MODEL)


@app.get("/health")
def health():
    return jsonify({"ok": True, "textModel": GEMINI_MODEL, "imageModel": GEMINI_IMAGE_MODEL})


def normalize_model(text: str) -> str:
    return re.sub(r"[^A-Za-z0-9]+", " ", str(text or "")).upper().strip()


def compact_model(text: str) -> str:
    return re.sub(r"[^A-Z0-9]", "", normalize_model(text))


def model_code(text: str) -> str:
    compact = compact_model(text)
    numeric_candidates = re.findall(r"\d{2,6}[A-Z]{1,4}\d{1,4}[A-Z]?|\d{3,6}[A-Z]\d{1,3}[A-Z]?|\d{3,6}[A-Z]{1,3}", compact)
    if numeric_candidates:
        return max(numeric_candidates, key=len)
    letter_candidates = re.findall(r"[A-Z]{1,6}\d{2,6}[A-Z]{0,3}", compact)
    if letter_candidates:
        return max(letter_candidates, key=len)
    # 4-5 digit standalone model numbers (e.g. Dell 3511, 5420, 9305)
    four_digit = re.findall(r"\b\d{4,5}\b", str(text or ""))
    valid_four_digit = [d for d in four_digit if not (len(d) == 4 and (d.startswith("19") or d.startswith("20")))]
    if valid_four_digit:
        return valid_four_digit[0]
    return compact


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

    exact_matches = []
    partial_matches = []
    for model in available_models:
        model_compact = model_code(model)
        if any(fragment and fragment == model_compact for fragment in fragments):
            exact_matches.append(model)
        elif any(fragment and (fragment in model_compact or model_compact in fragment) for fragment in fragments):
            partial_matches.append(model)
    return list(dict.fromkeys(exact_matches or partial_matches))


def parse_assistant_json(answer: str) -> dict:
    text = answer.strip()
    # Strip markdown code fences that Gemini sometimes wraps around JSON
    fence_match = re.search(r"```(?:json)?\s*\n?(.*?)\n?\s*```", text, re.DOTALL)
    if fence_match:
        text = fence_match.group(1).strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return {}


@app.route("/api/ai-check", methods=["POST"])
def ai_check():
    api_key = os.getenv("GOOGLE_API_KEY")
    payload = request.get_json(silent=True) or {}
    prompt = (payload.get("prompt") or "").strip()
    available_models = payload.get("availableModels") or []

    if not prompt:
        return jsonify({"error": "Prompt is required."}), 400

    matches = find_model_matches(prompt, available_models)
    if not api_key:
        return jsonify({
            "available": bool(matches),
            "matchedModel": matches[0] if matches else None,
            "matchedModels": matches,
            "ambiguous": len(matches) > 1,
            "reasoning": "Catalog result checked directly from the uploaded PDF. Set GOOGLE_API_KEY to enable Gemini explanations.",
            "confidence": 98 if matches else 72,
            "aiUnavailable": True,
        })

    model_list = ", ".join(available_models) if available_models else "No models provided."
    matched_list = ", ".join(matches) if matches else "No deterministic matches."
    user_input = (
        f"User question: {prompt}\n"
        f"Available models from PDF: {model_list}\n"
        f"Deterministic matches for the model fragment: {matched_list}\n"
        "Determine if the requested model is available."
    )

    answer = ""
    ai_error = None
    client = genai.Client(api_key=api_key)
    for attempt in range(3):
        try:
            response = client.models.generate_content(
                model=GEMINI_MODEL,
                contents=user_input,
                config=types.GenerateContentConfig(
                    system_instruction=SYSTEM_PROMPT,
                    temperature=TEMPERATURE,
                    max_output_tokens=MAX_OUTPUT_TOKENS,
                    top_p=0.9,
                    candidate_count=1,
                    response_mime_type="application/json",
                ),
            )
            answer = (response.text or "").strip()
            break
        except Exception as exc:  # pragma: no cover
            ai_error = str(exc)
            if "503" not in ai_error and "UNAVAILABLE" not in ai_error:
                break
            if attempt < 2:
                time.sleep(1 + attempt)

    is_available = bool(matches)
    matched_model = matches[0] if matches else None
    assistant_data = parse_assistant_json(answer)

    # Use AI status when available; only override with "available" if the AI
    # didn't return a valid status and we have deterministic matches.
    ai_status = assistant_data.get("status", "")
    if ai_status in {"available", "unavailable", "partial", "uncertain"}:
        status = ai_status
    elif matches:
        status = "available"
    else:
        status = "unavailable"

    # Use parsed reasoning from AI; fall back to a deterministic message.
    ai_reasoning = str(assistant_data.get("reasoning") or "").strip()
    if ai_reasoning:
        reasoning = ai_reasoning
    elif matches:
        reasoning = f"Found {len(matches)} matching model option(s) in the PDF."
    else:
        reasoning = "No matching model was found in the PDF."
    if ai_error and not answer:
        reasoning += " AI explanation is temporarily unavailable, so this result uses the PDF catalog match."

    return jsonify({
        "available": is_available,
        "status": status,
        "matchedModel": matched_model,
        "matchedModels": matches,
        "ambiguous": len(matches) > 1,
        "reasoning": reasoning,
        "question": str(assistant_data.get("question") or ""),
        "confidence": int(assistant_data.get("confidence", 98 if matches else 72)),
        "aiUnavailable": bool(ai_error and not answer),
    })


@app.route("/api/ai-image-check", methods=["POST"])
def ai_image_check():
    api_key = os.getenv("GOOGLE_API_KEY")
    image = request.files.get("image")
    if not image:
        return jsonify({"error": "Please upload an image."}), 400

    try:
        available_models = json.loads(request.form.get("availableModels", "[]"))
    except json.JSONDecodeError:
        return jsonify({"error": "Invalid catalog model data."}), 400

    if not isinstance(available_models, list):
        return jsonify({"error": "Catalog model data must be a list."}), 400

    if not api_key:
        return jsonify({"error": "Missing GOOGLE_API_KEY on the AI backend."}), 500

    image_bytes = image.read()
    if not image_bytes:
        return jsonify({"error": "The uploaded image is empty."}), 400
    if len(image_bytes) > 10 * 1024 * 1024:
        return jsonify({"error": "Please upload an image smaller than 10 MB."}), 400

    mime_type = image.mimetype or "image/jpeg"
    catalog = ", ".join(str(model) for model in available_models) or "No models provided."
    vision_prompt = (
        "Identify the laptop model in this image. Then compare it with this PDF catalog.\n"
        f"PDF catalog models: {catalog}\n"
        "Return only the requested JSON object."
    )

    answer = ""
    ai_error = None
    try:
        client = genai.Client(api_key=api_key)
        image_part = types.Part.from_bytes(data=image_bytes, mime_type=mime_type)
        for attempt in range(3):
            try:
                response = client.models.generate_content(
                    model=GEMINI_IMAGE_MODEL,
                    contents=[image_part, vision_prompt],
                    config=types.GenerateContentConfig(
                        system_instruction=IMAGE_SYSTEM_PROMPT,
                        temperature=0.15,
                        max_output_tokens=400,
                        response_mime_type="application/json",
                    ),
                )
                answer = (response.text or "").strip()
                break
            except Exception as exc:  # pragma: no cover
                ai_error = str(exc)
                if "503" not in ai_error and "UNAVAILABLE" not in ai_error:
                    break
                if attempt < 2:
                    time.sleep(1 + attempt)
    except Exception as exc:  # pragma: no cover
        ai_error = str(exc)

    if not answer:
        return jsonify({"error": f"AI image request failed: {ai_error or 'No response returned.'}"}), 502

    try:
        identified = json.loads(answer)
    except json.JSONDecodeError:
        identified = {"identified_model": answer, "confidence": 35, "reasoning": "The image response was not structured."}

    identified_model = str(identified.get("identified_model") or "").strip()
    matches = find_model_matches(identified_model, available_models) if identified_model else []
    status = "available" if matches else str(identified.get("status") or "uncertain")
    if status not in {"available", "unavailable", "partial", "uncertain"}:
        status = "uncertain"
    return jsonify({
        "available": bool(matches),
        "status": status,
        "identifiedModel": identified_model,
        "matchedModel": matches[0] if matches else None,
        "matchedModels": matches,
        "ambiguous": len(matches) > 1,
        "confidence": int(identified.get("confidence") or 0),
        "reasoning": str(identified.get("reasoning") or "Image analyzed against the uploaded catalog."),
        "question": str(identified.get("question") or ""),
    })


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=False)
