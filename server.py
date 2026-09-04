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


SERIES_PATTERNS = [
    ("MacBook Air", re.compile(r"\b(?:MACBOOK\s*AIR|MBA)\b", re.I)),
    ("MacBook Pro", re.compile(r"\b(?:MACBOOK\s*PRO|MBP)\b", re.I)),
    ("MacBook", re.compile(r"\bMACBOOK\b", re.I)),
    ("Surface Laptop", re.compile(r"\bSURFACE\s*LAPTOP\b", re.I)),
    ("Surface Pro", re.compile(r"\bSURFACE\s*PRO\b", re.I)),
    ("Surface Book", re.compile(r"\bSURFACE\s*BOOK\b", re.I)),
    ("Surface", re.compile(r"\bSURFACE\b", re.I)),
    ("ThinkPad X1 Carbon", re.compile(r"\b(?:THINKPAD\s*)?X1\s*CARBON\b", re.I)),
    ("ThinkPad X1 Yoga", re.compile(r"\b(?:THINKPAD\s*)?X1\s*YOGA\b", re.I)),
    ("ThinkPad", re.compile(r"\bTHINKPAD\b", re.I)),
    ("IdeaPad Flex", re.compile(r"\bIDEAPAD\s*FLEX\b", re.I)),
    ("IdeaPad Gaming", re.compile(r"\bIDEAPAD\s*GAMING\b", re.I)),
    ("IdeaPad Slim", re.compile(r"\bIDEAPAD\s*SLIM\b", re.I)),
    ("IdeaPad", re.compile(r"\bIDEAPAD\b", re.I)),
    ("Legion", re.compile(r"\bLEGION\b", re.I)),
    ("LOQ", re.compile(r"\bLOQ\b", re.I)),
    ("Yoga", re.compile(r"\bYOGA\b", re.I)),
    ("EliteBook Folio", re.compile(r"\bELITEBOOK\s*FOLIO\b", re.I)),
    ("EliteBook x360", re.compile(r"\bELITEBOOK\s*X360\b", re.I)),
    ("EliteBook", re.compile(r"\bELITEBOOK\b", re.I)),
    ("ProBook x360", re.compile(r"\bPROBOOK\s*X360\b", re.I)),
    ("ProBook", re.compile(r"\bPROBOOK\b", re.I)),
    ("Pavilion Aero", re.compile(r"\bPAVILION\s*AERO\b", re.I)),
    ("Pavilion x360", re.compile(r"\bPAVILION\s*X360\b", re.I)),
    ("Pavilion", re.compile(r"\bPAVILION\b", re.I)),
    ("Envy x360", re.compile(r"\bENVY\s*X360\b", re.I)),
    ("Envy", re.compile(r"\bENVY\b", re.I)),
    ("Spectre x360", re.compile(r"\bSPECTRE\s*X360\b", re.I)),
    ("Spectre", re.compile(r"\bSPECTRE\b", re.I)),
    ("Victus", re.compile(r"\bVICTUS\b", re.I)),
    ("Omen", re.compile(r"\bOMEN\b", re.I)),
    ("Inspiron", re.compile(r"\bINSPIRON\b", re.I)),
    ("Latitude", re.compile(r"\bLATITUDE\b", re.I)),
    ("Vostro", re.compile(r"\bVOSTRO\b", re.I)),
    ("XPS", re.compile(r"\bXPS\b", re.I)),
    ("Precision", re.compile(r"\bPRECISION\b", re.I)),
    ("VivoBook S", re.compile(r"\bVIVOBOOK\s*S\b", re.I)),
    ("VivoBook Pro", re.compile(r"\bVIVOBOOK\s*PRO\b", re.I)),
    ("VivoBook Go", re.compile(r"\bVIVOBOOK\s*GO\b", re.I)),
    ("VivoBook", re.compile(r"\bVIVOBOOK\b", re.I)),
    ("ZenBook", re.compile(r"\bZENBOOK\b", re.I)),
    ("TUF Gaming", re.compile(r"\bTUF\s*GAMING\b", re.I)),
    ("TUF Dash", re.compile(r"\bTUF\s*DASH\b", re.I)),
    ("TUF", re.compile(r"\bTUF\b", re.I)),
    ("ROG Zephyrus", re.compile(r"\bROG\s*ZEPHYRUS\b", re.I)),
    ("ROG Strix", re.compile(r"\bROG\s*STRIX\b", re.I)),
    ("ROG", re.compile(r"\bROG\b", re.I)),
    ("ExpertBook", re.compile(r"\bEXPERTBOOK\b", re.I)),
    ("Aspire 1", re.compile(r"\bASPIRE\s*1\b", re.I)),
    ("Aspire 3", re.compile(r"\bASPIRE\s*3\b", re.I)),
    ("Aspire 5", re.compile(r"\bASPIRE\s*5\b", re.I)),
    ("Aspire 7", re.compile(r"\bASPIRE\s*7\b", re.I)),
    ("Aspire", re.compile(r"\bASPIRE\b", re.I)),
    ("Nitro 5", re.compile(r"\bNITRO\s*5\b", re.I)),
    ("Nitro", re.compile(r"\bNITRO\b", re.I)),
    ("Predator Helios Neo", re.compile(r"\bPREDATOR\s*HELIOS\s*NEO\b", re.I)),
    ("Predator Helios", re.compile(r"\bPREDATOR\s*HELIOS\b", re.I)),
    ("Predator", re.compile(r"\bPREDATOR\b", re.I)),
    ("Swift", re.compile(r"\bSWIFT\b", re.I)),
    ("Modern", re.compile(r"\bMODERN\b", re.I)),
    ("Blade", re.compile(r"\bBLADE\b", re.I)),
    ("Viper", re.compile(r"\bVIPER\b", re.I)),
]

BRANDS = {"ACER", "ASUS", "DELL", "APPLE", "HP", "LENOVO", "MICROSOFT", "MSI", "RAZER", "CANON", "SAMSUNG"}


def normalize(text: str) -> str:
    return re.sub(r"\s+", " ", str(text or "").upper().strip())


def compact(text: str) -> str:
    return re.sub(r"[^A-Z0-9]", "", normalize(text))


def normalize_model(text: str) -> str:
    return compact(text)


def compact_model(text: str) -> str:
    return compact(text)


def extract_keys(text: str) -> dict:
    norm = normalize(text)
    comp = compact(norm)

    series = ""
    for name, pattern in SERIES_PATTERNS:
        if pattern.search(norm):
            series = name
            break

    clean = norm
    for b in BRANDS:
        clean = re.sub(rf"\b{b}\b", "", clean, flags=re.I)
    if series:
        clean = re.sub(re.escape(series), "", clean, flags=re.I)
    clean = re.sub(r"\b(?:LAPTOP|NOTEBOOK|SERIES|INCH|DEVICES?)\b", "", clean, flags=re.I).strip()
    is_series_only = bool(series and len(compact(clean)) == 0)

    gen = ""
    hp_gen = re.search(r"\b(?:G|GEN)\s*(\d{1,2})\b", norm, re.I)
    if hp_gen:
        gen = f"G{hp_gen.group(1)}"
    apple_m = re.search(r"\b(M[1-4](?:\s*(?:PRO|MAX|ULTRA))?)\b", norm, re.I)
    if apple_m:
        gen = re.sub(r"\s+", "", apple_m.group(1))
    gen_match = re.search(r"\bGEN\s*(\d{1,2})\b", norm, re.I)
    if gen_match and not gen:
        gen = f"GEN{gen_match.group(1)}"

    codes = set()
    base_code = ""
    suffix = ""

    for m in re.findall(r"\bA\d{4}\b", norm, re.I):
        codes.add(compact(m))

    for m in re.findall(r"\bP\d{2,3}[A-Z]\b", norm, re.I):
        codes.add(compact(m))

    for m in re.findall(r"\bMODEL\s*(\d{4})\b", norm, re.I):
        num = re.sub(r"\D", "", m)
        if num:
            codes.add(num)

    clean_norm = re.sub(r"\b\d{1,2}(?:\.\d)?\s*-\s*(?:INCH|IN)\b", "", norm, flags=re.I)
    clean_norm = re.sub(r'\b\d{1,2}(?:\.\d)?\s*(?:INCH|IN|")\b', "", clean_norm, flags=re.I)

    for hm in re.findall(r"\b([A-Z]{0,4}\d{1,4}[A-Z]{0,2})\s*-\s*([A-Z0-9]{1,8})\b", clean_norm, re.I):
        p0, p1 = compact(hm[0]), compact(hm[1])
        if len(p0) >= 2:
            codes.add(p0)
        if len(p1) >= 2:
            codes.add(p1)
        full = p0 + p1
        if len(full) >= 3:
            codes.add(full)
        if not base_code and len(p0) >= 2:
            base_code = p0
            suffix = p1

    for gm in re.findall(r"\b([A-Z]{1,4}\d{2,5}[A-Z]{0,4}|\d{2,4}[A-Z]{1,4}\d{0,4}|\d{4,5})\b", clean_norm, re.I):
        c = compact(gm)
        if not re.match(r"^(19|20)\d{2}$", c) and len(c) >= 3:
            codes.add(c)
            alpha_split = re.match(r"^([A-Z]{1,4}\d{2,4})([A-Z]{1,4})$", c, re.I)
            if alpha_split:
                codes.add(alpha_split.group(1).upper())
                if not base_code:
                    base_code = alpha_split.group(1).upper()
                    suffix = alpha_split.group(2).upper()
            elif not base_code:
                base_code = c

    for tm in re.findall(r"\b([1-9]\d{2})\b", clean_norm):
        codes.add(tm)
        if not base_code:
            base_code = tm

    primary_numeric = base_code or (next(iter(codes)) if codes else "")

    return {
        "raw": text,
        "norm": norm,
        "comp": comp,
        "series": series.upper(),
        "is_series_only": is_series_only,
        "gen": gen.upper(),
        "numeric": primary_numeric.upper(),
        "base_code": base_code.upper(),
        "suffix": suffix.upper(),
        "codes": [c.upper() for c in codes],
    }


def match_score(q: dict, c: dict) -> dict:
    score = 0
    suffix_conflict = False
    gen_conflict = False
    numeric_matched = False

    if q["comp"] == c["comp"]:
        return {"score": 100, "numeric_matched": True, "suffix_conflict": False, "gen_conflict": False}

    if q["series"] and c["series"]:
        if q["series"] == c["series"]:
            score += 30
        elif q["series"] in c["series"] or c["series"] in q["series"]:
            score += 20
        else:
            return {"score": -100, "numeric_matched": False, "suffix_conflict": False, "gen_conflict": False}

    matching_codes = [qc for qc in q["codes"] if len(qc) >= 3 and (qc in c["codes"] or (len(qc) >= 4 and qc in c["comp"]))]
    if matching_codes:
        score += 50
        numeric_matched = True
    elif q["numeric"] and len(q["numeric"]) >= 3 and (c["numeric"] == q["numeric"] or (len(q["numeric"]) >= 4 and q["numeric"] in c["comp"])):
        score += 45
        numeric_matched = True

    if q["base_code"] and len(q["base_code"]) >= 3:
        base_match = any(code == q["base_code"] or (len(code) >= 4 and (code.startswith(q["base_code"]) or q["base_code"].startswith(code))) for code in c["codes"])
        if base_match:
            if not numeric_matched:
                score += 35
                numeric_matched = True
            if q["suffix"]:
                if c["suffix"] and c["suffix"] == q["suffix"]:
                    score += 25
                elif q["suffix"] in c["comp"]:
                    score += 20
                else:
                    suffix_conflict = True

    if q["gen"] and c["gen"]:
        if q["gen"] == c["gen"]:
            score += 35
            if not numeric_matched and q["series"] and c["series"] and q["series"] == c["series"]:
                numeric_matched = True
        else:
            gen_conflict = True
    elif q["gen"] and q["gen"] in c["comp"]:
        score += 35
        if not numeric_matched and q["series"] and c["series"] and q["series"] == c["series"]:
            numeric_matched = True
    elif q["gen"] and not c["gen"] and q["gen"] not in c["comp"]:
        if numeric_matched:
            gen_conflict = True

    if not numeric_matched and len(q["comp"]) >= 4 and q["comp"] in c["comp"]:
        score += 40
        numeric_matched = True

    return {"score": score, "numeric_matched": numeric_matched, "suffix_conflict": suffix_conflict, "gen_conflict": gen_conflict}


def classify_match(query: str, catalog_variants: List[str]) -> dict:
    q = extract_keys(query)
    if not q["comp"]:
        return {"status": "unavailable", "best_match": "", "matched_models": [], "reasoning": "No model query provided.", "confidence": 0}

    if q["is_series_only"]:
        series_matches = []
        for raw in catalog_variants:
            c = extract_keys(raw)
            if c["series"] and (c["series"] == q["series"] or q["series"] in c["series"] or c["series"] in q["series"]):
                series_matches.append(raw)
        if series_matches:
            return {
                "status": "uncertain",
                "best_match": series_matches[0],
                "matched_models": series_matches[:10],
                "reasoning": f"Multiple models found for {q['series']} series. Please specify your exact model number.",
                "confidence": 60,
            }

    best = None
    best_score = -999
    partial_matches = []
    exact_matches = []

    for raw in catalog_variants:
        c = extract_keys(raw)
        res = match_score(q, c)
        if res["score"] > 0:
            if res["gen_conflict"] or res["suffix_conflict"]:
                partial_matches.append((raw, res["score"]))
            elif res["numeric_matched"]:
                exact_matches.append((raw, res["score"]))
            else:
                partial_matches.append((raw, res["score"]))

            if res["score"] > best_score:
                best = raw
                best_score = res["score"]

    exact_matches.sort(key=lambda x: x[1], reverse=True)
    partial_matches.sort(key=lambda x: x[1], reverse=True)

    if exact_matches:
        return {
            "status": "available",
            "best_match": exact_matches[0][0],
            "matched_models": [m[0] for m in exact_matches],
            "reasoning": "Exact model code & series confirmed in catalog stock.",
            "confidence": 98,
        }

    if partial_matches:
        return {
            "status": "partial",
            "best_match": partial_matches[0][0],
            "matched_models": [m[0] for m in partial_matches],
            "reasoning": "A related model exists in stock, but the specific generation or suffix differs.",
            "confidence": 85,
        }

    for line in catalog_variants:
        if q["comp"] in compact(line):
            return {
                "status": "available",
                "best_match": line,
                "matched_models": [line],
                "reasoning": "Model text matched in catalog.",
                "confidence": 92,
            }

    return {
        "status": "unavailable",
        "best_match": "",
        "matched_models": [],
        "reasoning": f"Model '{query.upper()}' was not found in the uploaded catalog.",
        "confidence": 0,
    }


def find_model_matches(query: str, available_models: List[str]) -> List[str]:
    res = classify_match(query, available_models)
    if res["matched_models"]:
        return res["matched_models"]
    return [res["best_match"]] if res["best_match"] else []


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

    classification = classify_match(prompt, available_models)
    matches = classification["matched_models"]

    if not api_key:
        return jsonify({
            "status": classification["status"],
            "available": classification["status"] == "available",
            "matchedModel": classification["best_match"] or None,
            "matchedModels": matches,
            "ambiguous": classification["status"] == "uncertain",
            "reasoning": classification["reasoning"],
            "confidence": classification["confidence"],
            "aiUnavailable": True,
        })

    model_list = ", ".join(available_models) if available_models else "No models provided."
    matched_list = ", ".join(matches) if matches else "No deterministic matches."
    best_catalog = classification["best_match"] or "None"
    user_input = (
        f"User question: {prompt}\n"
        f"Available models from PDF: {model_list}\n"
        f"Deterministic pipeline result: Category = {classification['status'].upper()}, Best match = {best_catalog}, Matches = {matched_list}\n"
        "Confirm if the requested model is available or partial based on the catalog."
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
