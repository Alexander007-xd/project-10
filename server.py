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
    ("MacBook Air", re.compile(r"\b(?:MACBOOK[\s-]*AIR|MBA)\b", re.I)),
    ("MacBook Pro", re.compile(r"\b(?:MACBOOK[\s-]*PRO|MBP)\b", re.I)),
    ("MacBook", re.compile(r"\bMACBOOK\b", re.I)),
    ("Surface Laptop", re.compile(r"\bSURFACE[\s-]*LAPTOP\b", re.I)),
    ("Surface Pro", re.compile(r"\bSURFACE[\s-]*PRO\b", re.I)),
    ("Surface Book", re.compile(r"\bSURFACE[\s-]*BOOK\b", re.I)),
    ("Surface", re.compile(r"\bSURFACE\b", re.I)),
    ("ThinkPad X1 Carbon", re.compile(r"\b(?:THINKPAD[\s-]*)?X1[\s-]*CARBON\b", re.I)),
    ("ThinkPad X1 Yoga", re.compile(r"\b(?:THINKPAD[\s-]*)?X1[\s-]*YOGA\b", re.I)),
    ("ThinkPad", re.compile(r"\bTHINKPAD\b", re.I)),
    ("IdeaPad Flex", re.compile(r"\bIDEAPAD[\s-]*FLEX\b", re.I)),
    ("IdeaPad Gaming", re.compile(r"\bIDEAPAD[\s-]*GAMING\b", re.I)),
    ("IdeaPad Slim", re.compile(r"\bIDEAPAD[\s-]*SLIM\b", re.I)),
    ("IdeaPad", re.compile(r"\bIDEAPAD\b", re.I)),
    ("Legion", re.compile(r"\bLEGION\b", re.I)),
    ("LOQ", re.compile(r"\bLOQ\b", re.I)),
    ("Yoga", re.compile(r"\bYOGA\b", re.I)),
    ("EliteBook Folio", re.compile(r"\bELITEBOOK[\s-]*FOLIO\b", re.I)),
    ("EliteBook x360", re.compile(r"\bELITEBOOK[\s-]*X360\b", re.I)),
    ("EliteBook", re.compile(r"\bELITEBOOK\b", re.I)),
    ("ProBook x360", re.compile(r"\bPROBOOK[\s-]*X360\b", re.I)),
    ("ProBook", re.compile(r"\bPROBOOK\b", re.I)),
    ("Pavilion Aero", re.compile(r"\bPAVILION[\s-]*AERO\b", re.I)),
    ("Pavilion x360", re.compile(r"\bPAVILION[\s-]*X360\b", re.I)),
    ("Pavilion", re.compile(r"\bPAVILION\b", re.I)),
    ("Envy x360", re.compile(r"\bENVY[\s-]*X360\b", re.I)),
    ("Envy", re.compile(r"\bENVY\b", re.I)),
    ("Spectre x360", re.compile(r"\bSPECTRE[\s-]*X360\b", re.I)),
    ("Spectre", re.compile(r"\bSPECTRE\b", re.I)),
    ("Victus", re.compile(r"\bVICTUS\b", re.I)),
    ("Omen", re.compile(r"\bOMEN\b", re.I)),
    ("Inspiron", re.compile(r"\bINSPIRON\b", re.I)),
    ("Latitude", re.compile(r"\bLATITUDE\b", re.I)),
    ("Vostro", re.compile(r"\bVOSTRO\b", re.I)),
    ("XPS", re.compile(r"\bXPS\b", re.I)),
    ("Precision", re.compile(r"\bPRECISION\b", re.I)),
    ("VivoBook S", re.compile(r"\bVIVOBOOK[\s-]*S\b", re.I)),
    ("VivoBook Pro", re.compile(r"\bVIVOBOOK[\s-]*PRO\b", re.I)),
    ("VivoBook Go", re.compile(r"\bVIVOBOOK[\s-]*GO\b", re.I)),
    ("VivoBook", re.compile(r"\bVIVOBOOK\b", re.I)),
    ("ZenBook", re.compile(r"\bZENBOOK\b", re.I)),
    ("TUF Gaming", re.compile(r"\bTUF[\s-]*GAMING\b", re.I)),
    ("TUF Dash", re.compile(r"\bTUF[\s-]*DASH\b", re.I)),
    ("TUF", re.compile(r"\bTUF\b", re.I)),
    ("ROG Zephyrus", re.compile(r"\bROG[\s-]*ZEPHYRUS\b", re.I)),
    ("ROG Strix", re.compile(r"\bROG[\s-]*STRIX\b", re.I)),
    ("ROG", re.compile(r"\bROG\b", re.I)),
    ("ExpertBook", re.compile(r"\bEXPERTBOOK\b", re.I)),
    ("Aspire 1", re.compile(r"\bASPIRE[\s-]*1\b", re.I)),
    ("Aspire 3", re.compile(r"\bASPIRE[\s-]*3\b", re.I)),
    ("Aspire 5", re.compile(r"\bASPIRE[\s-]*5\b", re.I)),
    ("Aspire 7", re.compile(r"\bASPIRE[\s-]*7\b", re.I)),
    ("Aspire", re.compile(r"\bASPIRE\b", re.I)),
    ("Nitro 5", re.compile(r"\bNITRO[\s-]*5\b", re.I)),
    ("Nitro", re.compile(r"\bNITRO\b", re.I)),
    ("Predator Helios Neo", re.compile(r"\bPREDATOR[\s-]*HELIOS[\s-]*NEO\b", re.I)),
    ("Predator Helios", re.compile(r"\bPREDATOR[\s-]*HELIOS\b", re.I)),
    ("Predator", re.compile(r"\bPREDATOR\b", re.I)),
    ("Swift", re.compile(r"\bSWIFT\b", re.I)),
    ("Modern", re.compile(r"\bMODERN\b", re.I)),
    ("Blade", re.compile(r"\bBLADE\b", re.I)),
    ("Viper", re.compile(r"\bVIPER\b", re.I)),
]

BRANDS = {"ACER", "ASUS", "DELL", "APPLE", "HP", "LENOVO", "MICROSOFT", "MSI", "RAZER", "CANON", "SAMSUNG", "SONY", "TOSHIBA", "LG", "ALIENWARE"}

SERIES_BRAND_MAP = {
    "ELITEBOOK": "HP", "PROBOOK": "HP", "PAVILION": "HP", "ENVY": "HP", "SPECTRE": "HP", "VICTUS": "HP", "OMEN": "HP", "ZBOOK": "HP",
    "THINKPAD": "LENOVO", "IDEAPAD": "LENOVO", "LEGION": "LENOVO", "YOGA": "LENOVO", "LOQ": "LENOVO", "THINKBOOK": "LENOVO",
    "INSPIRON": "DELL", "LATITUDE": "DELL", "VOSTRO": "DELL", "XPS": "DELL", "PRECISION": "DELL", "ALIENWARE": "DELL",
    "VIVOBOOK": "ASUS", "ZENBOOK": "ASUS", "TUF": "ASUS", "ROG": "ASUS", "EXPERTBOOK": "ASUS", "ZEPHYRUS": "ASUS", "STRIX": "ASUS",
    "ASPIRE": "ACER", "SWIFT": "ACER", "NITRO": "ACER", "PREDATOR": "ACER", "SPIN": "ACER", "TRAVELMATE": "ACER",
    "MACBOOK": "APPLE", "SURFACE": "MICROSOFT",
    "MODERN": "MSI", "PRESTIGE": "MSI", "STEALTH": "MSI", "RAIDER": "MSI", "KATANA": "MSI", "SWORD": "MSI", "CYBORG": "MSI",
    "BLADE": "RAZER", "VIPER": "RAZER"
}

BRAND_AND_SERIES = [
    "ACER", "ASUS", "DELL", "APPLE", "MACBOOK", "MICROSOFT", "SURFACE",
    "HP", "LENOVO", "MSI", "RAZER", "CANON", "SAMSUNG", "SONY", "TOSHIBA", "LG", "ALIENWARE",
    "THINKPAD", "IDEAPAD", "LEGION", "YOGA", "LOQ", "THINKBOOK",
    "ELITEBOOK", "PROBOOK", "PAVILION", "ENVY", "SPECTRE", "VICTUS", "OMEN", "ZBOOK",
    "INSPIRON", "LATITUDE", "VOSTRO", "XPS", "PRECISION",
    "VIVOBOOK", "ZENBOOK", "TUF", "ROG", "EXPERTBOOK", "ZEPHYRUS", "STRIX",
    "ASPIRE", "SWIFT", "NITRO", "PREDATOR", "SPIN", "TRAVELMATE",
    "MODERN", "PRESTIGE", "STEALTH", "RAIDER", "KATANA", "SWORD", "CYBORG", "TITAN", "VECTOR",
    "BLADE", "VIPER"
]

BRAND_SERIES_PAIRS = {
    "HP": ["ELITEBOOK", "PROBOOK", "PAVILION", "ENVY", "SPECTRE", "VICTUS", "OMEN", "ZBOOK"],
    "LENOVO": ["THINKPAD", "IDEAPAD", "LEGION", "YOGA", "LOQ", "THINKBOOK"],
    "DELL": ["INSPIRON", "LATITUDE", "VOSTRO", "XPS", "PRECISION", "ALIENWARE"],
    "ASUS": ["VIVOBOOK", "ZENBOOK", "TUF", "ROG", "EXPERTBOOK", "ZEPHYRUS", "STRIX"],
    "ACER": ["ASPIRE", "SWIFT", "NITRO", "PREDATOR", "SPIN", "TRAVELMATE"],
    "APPLE": ["MACBOOK"],
    "MICROSOFT": ["SURFACE"],
    "MSI": ["MODERN", "PRESTIGE", "STEALTH", "RAIDER", "KATANA", "SWORD", "CYBORG", "TITAN", "VECTOR"],
    "RAZER": ["BLADE", "VIPER"]
}


def normalize(text: str) -> str:
    return re.sub(r"\s+", " ", str(text or "").upper().strip())


def compact(text: str) -> str:
    return re.sub(r"[^A-Z0-9]", "", normalize(text))


def is_brand_series_pair(brand: str, series: str) -> bool:
    b = brand.upper()
    s = series.upper()
    return bool(b in BRAND_SERIES_PAIRS and s in BRAND_SERIES_PAIRS[b])


def is_consecutive_series_pair(first: str, second: str) -> bool:
    f = first.upper()
    s = second.upper()
    return f == "ROG" and s in ("ZEPHYRUS", "STRIX")


def split_multi_model_line(line: str) -> list:
    pattern = re.compile(rf"\b({'|'.join(BRAND_AND_SERIES)})\b", re.I)
    matches = [{"index": m.start(), "word": m.group(1)} for m in pattern.finditer(line)]
    if len(matches) <= 1:
        return [line.strip()]

    split_indices = []
    for i, curr in enumerate(matches):
        if i == 0:
            split_indices.append(curr["index"])
            continue
        prev = matches[i - 1]
        gap = line[prev["index"] + len(prev["word"]):curr["index"]].strip()
        is_bs = is_brand_series_pair(prev["word"], curr["word"])
        is_sp = is_consecutive_series_pair(prev["word"], curr["word"])
        if len(gap) <= 2 and (is_bs or is_sp):
            continue
        split_indices.append(curr["index"])

    if len(split_indices) <= 1:
        return [line.strip()]

    chunks = []
    for i, start in enumerate(split_indices):
        end = split_indices[i + 1] if i + 1 < len(split_indices) else len(line)
        chunk = line[start:end].strip()
        if len(chunk) > 2:
            chunks.append(chunk)
    return chunks


def isolate_matching_chunk(line: str, q: dict) -> str:
    chunks = split_multi_model_line(line)
    if len(chunks) <= 1:
        return line
    for chunk in chunks:
        chunk_keys = extract_keys(chunk)
        res = match_score(q, chunk_keys)
        if res["numeric_matched"] and not res["gen_conflict"] and not res["suffix_conflict"]:
            return chunk
    return chunks[0]


def has_unclosed_paren(s: str) -> bool:
    return s.count("(") > s.count(")")


def has_trailing_connector(s: str) -> bool:
    s = s.strip()
    return bool(re.search(r"[-–—,/]$", s) or re.search(r",\s*$", s))


def has_leading_continuation(s: str) -> bool:
    s = s.strip()
    return bool(re.match(r"^[)\];,–—]", s) or re.match(r"^(and|or|Series|Gen\s*\d|G\d|\(20\d\d\)|\(P\d+)", s, re.I))


def starts_with_brand_or_series(s: str) -> bool:
    first_word = re.split(r"[\s-]+", s.strip())[0].upper()
    all_brands = set(BRANDS) | {s.upper() for s in BRAND_AND_SERIES}
    return first_word in all_brands


def stitch_continuation_lines(lines: List[str]) -> List[str]:
    if not lines:
        return []
    result = []
    current = ""

    for line in lines:
        raw = str(line or "").strip()
        if not raw:
            continue

        if not current:
            current = raw
            continue

        has_unclosed = has_unclosed_paren(current)
        ends_with_conn = has_trailing_connector(current)
        starts_with_cont = has_leading_continuation(raw)
        starts_with_brand = starts_with_brand_or_series(raw)
        is_short_code = bool(re.match(r"^[A-Z0-9-]{3,12}$", raw, re.I))

        if (
            has_unclosed
            or ends_with_conn
            or starts_with_cont
            or is_short_code
            or (not starts_with_brand and not re.match(r"^[A-Z][a-z]+ [A-Z]", raw) and (len(current) < 30 or current.endswith(",")))
        ):
            if current.endswith("-") or current.endswith("–"):
                current += raw
            elif is_short_code and not current.endswith(","):
                current += f", {raw}"
            else:
                current += f" {raw}"
        else:
            result.append(current)
            current = raw

    if current:
        result.append(current)
    return result


def extract_base_prefix(first_part: str) -> str:
    dash_match = re.match(r"^(.+?)\s*[–—]\s*([A-Z0-9].*)$", first_part, re.I)
    if dash_match:
        pre = re.sub(r"\([^)]*\)", "", dash_match.group(1))
        pre = re.sub(r"\s+", " ", pre).strip()
        if len(pre) >= 3:
            return pre

    hp_code_match = re.match(r"^(.+?\b\d{2}-)([A-Z0-9]+.*)$", first_part, re.I)
    if hp_code_match:
        return hp_code_match.group(1)

    code_match = re.match(
        r"^(.+?\b(?:Latitude|Inspiron|Vostro|XPS|Precision|IdeaPad|ThinkPad|ProBook|EliteBook|Modern|Prestige|ExpertBook|ZenBook|VivoBook|Legion|LOQ|Pavilion|Envy|Victus|Omen|Blade|Surface|MacBook)(?:\s+\d{1,2})?)\s+[A-Z0-9-]+(?:\s*\(.*?\))?$",
        first_part,
        re.I,
    )
    if code_match:
        return code_match.group(1).strip()

    words = first_part.strip().split()
    if len(words) >= 3 and re.match(r"^[A-Z0-9-]{3,10}$", re.sub(r"\([^)]*\)", "", words[-1]), re.I):
        return " ".join(words[:-1])
    return " ".join(words[: min(2, len(words))])


def expand_sub_models(entry: str) -> list:
    clean = re.sub(r"[,;]+$", "", str(entry or "").strip()).strip()
    text_without_paren = re.sub(r"\([^)]*\)", lambda m: m.group(0).replace(",", "__COMMA__"), clean)

    # Pattern 1: Comma-separated numbers at end after prefix
    m1 = re.match(r"^(.+?\b(?:Latitude|Inspiron|Vostro|XPS|IdeaPad|ThinkPad|ProBook|EliteBook|Modern|Prestige|ExpertBook|ZenBook|VivoBook|Legion|LOQ)?(?:\s+\d{1,2})?)\s+([A-Z0-9-]{3,10}(?:\s*,\s*[A-Z0-9-]{2,10})+)$", clean, re.I)
    if m1:
        prefix = m1.group(1).strip()
        codes = [c.strip() for c in m1.group(2).split(",")]
        if all(re.match(r"^[A-Z0-9-]{2,10}$", c, re.I) and not re.match(r"^(AND|OR|THE|INCH|SERIES)$", c, re.I) for c in codes):
            results = []
            for code in codes:
                if len(code) <= 2 and re.match(r"^[A-Z]{1,3}\d{3}-\d{2}$", codes[0], re.I):
                    base = codes[0].split("-")[0]
                    results.append(f"{prefix} {base}-{code}".strip())
                else:
                    results.append(f"{prefix} {code}".strip())
            return results

    # Pattern 2: Comma-separated full models with repeated prefix
    if "," in text_without_paren:
        parts = [p.replace("__COMMA__", ",").strip() for p in text_without_paren.split(",")]
        if len(parts) > 1:
            first_part = parts[0]
            base_prefix = extract_base_prefix(first_part)
            sub_models = []
            for i, p in enumerate(parts):
                p = p.strip()
                if i == 0:
                    sub_models.append(p)
                elif p.lower().startswith(base_prefix.lower()):
                    sub_models.append(p)
                elif re.match(r"^\d{3,4}\s*G\d", p, re.I) and len(base_prefix.split()) >= 2:
                    sub_models.append(f"{base_prefix} {p}".strip())
                elif re.match(r"^G\d", p, re.I):
                    base_p = re.sub(r"G\d.*$", "", first_part)
                    sub_models.append(f"{base_p}{p}".strip())
                elif base_prefix.endswith("-"):
                    sub_models.append(f"{base_prefix}{p}".strip())
                else:
                    sub_models.append(f"{base_prefix} {p}".strip())
            if len(sub_models) > 1:
                return sub_models

    # Pattern 3: Hyphenated pair
    m3 = re.match(r"^(.+?)\s+(\d{2}[A-Z0-9]{3,7})\s*-\s*(\d{2}[A-Z0-9]{3,7})$", clean, re.I)
    if m3:
        prefix = m3.group(1).strip()
        return [f"{prefix} {m3.group(2)}".strip(), f"{prefix} {m3.group(3)}".strip()]

    # Pattern 4: MacBook Air (13.3-inch, A1466, A1369)
    m4 = re.match(r"^(MacBook\s*(?:Air|Pro))\s*\((?:[^)]*,\s*)?(A\d{4})\s*,\s*(A\d{4})\)", clean, re.I)
    if m4:
        return [f"{m4.group(1)} {m4.group(2)}", f"{m4.group(1)} {m4.group(3)}"]

    return [clean]


def clean_catalog_lines(raw_catalog: List[str]) -> List[str]:
    seen = set()
    cleaned = []
    stitched = stitch_continuation_lines(raw_catalog or [])
    for item in stitched:
        trimmed = re.sub(r"\s+", " ", str(item or "").strip())
        if not trimmed or re.match(r"^(Acer\s+Asus\s+Dell|Brand|Model|Laptop|Catalog)", trimmed, re.I):
            continue

        brand_chunks = split_multi_model_line(trimmed)
        for chunk in brand_chunks:
            semi_parts = chunk.split(";")
            parent_brand = ""
            for b in BRANDS:
                if re.search(rf"\b{b}\b", semi_parts[0], re.I):
                    parent_brand = b.capitalize()
                    break

            for part in semi_parts:
                clean_part = re.sub(r"[,;]+$", "", part.strip()).strip()
                if not clean_part or len(clean_part) < 3:
                    continue

                has_brand = any(re.search(rf"\b{b}\b", clean_part, re.I) for b in BRANDS)
                if not has_brand and parent_brand:
                    clean_part = f"{parent_brand} {clean_part}"

                sub_models = expand_sub_models(clean_part)
                for sub in sub_models:
                    k = compact(sub)
                    if len(k) >= 2 and k not in seen:
                        seen.add(k)
                        cleaned.append(sub)
    return cleaned


def extract_keys(text: str) -> dict:
    norm = normalize(text)
    comp = compact(norm)

    series = ""
    for name, pattern in SERIES_PATTERNS:
        if pattern.search(norm):
            series = name
            break

    brand = ""
    for b in BRANDS:
        if re.search(rf"\b{b}\b", norm, re.I):
            brand = b
            break
    if not brand and series:
        brand = SERIES_BRAND_MAP.get(series.upper(), "")

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

    three_digit_matches = re.findall(r"\b([1-9]\d{2})\b", clean_norm)
    for tm in three_digit_matches:
        codes.add(tm)
        if not base_code:
            base_code = tm

    clean_rem_comp = compact(clean)
    single_digit = re.match(r"^\d$", clean_rem_comp)
    if single_digit:
        codes.add(single_digit.group(0))
        if not base_code:
            base_code = single_digit.group(0)

    two_digit_matches = re.findall(r"\b(\d{2})\b", clean_norm)
    family_numbers = [dm for dm in two_digit_matches if not re.match(r"^(19|20)$", dm)]

    primary_numeric = base_code or (next(iter(codes)) if codes else "")

    has_exact_code = bool(
        any(len(c) >= 4 or re.search(r"[A-Z]\d|\d[A-Z]", c) for c in codes)
        or (three_digit_matches and bool(gen))
        or (bool(series) and bool(gen))
        or (bool(series) and bool(single_digit))
    )

    return {
        "raw": text,
        "norm": norm,
        "comp": comp,
        "brand": brand.upper(),
        "series": series.upper(),
        "is_series_only": is_series_only,
        "gen": gen.upper(),
        "numeric": primary_numeric.upper(),
        "base_code": base_code.upper(),
        "suffix": suffix.upper(),
        "codes": [c.upper() for c in codes],
        "family_numbers": family_numbers,
        "has_exact_code": has_exact_code,
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


def classify_match(query: str, raw_catalog: List[str]) -> dict:
    catalog = clean_catalog_lines(raw_catalog)
    q = extract_keys(query)

    if not q["comp"]:
        return {
            "status": "unavailable",
            "is_exact_match": False,
            "best_match": "",
            "matched_models": [],
            "reasoning": "Please enter a model name.",
            "confidence": 0,
        }

    # 1. Exact match check
    exact_match_line = None
    partial_conflict_matches = []

    for line in catalog:
        c = extract_keys(line)
        if q["brand"] and c["brand"] and q["brand"] != c["brand"]:
            continue
        if q["series"] and c["series"] and q["series"] != c["series"] and q["series"] not in c["series"] and c["series"] not in q["series"]:
            continue

        res = match_score(q, c)
        if res["score"] > 0:
            if (res["gen_conflict"] or res["suffix_conflict"]) and res["numeric_matched"]:
                partial_conflict_matches.append(line)
            elif res["numeric_matched"] and q["has_exact_code"] and not res["gen_conflict"] and not res["suffix_conflict"]:
                if not q["series"] or c["series"] == q["series"] or q["series"] in c["series"]:
                    exact_match_line = line
                    break

    if not exact_match_line and q["has_exact_code"]:
        for line in catalog:
            c = extract_keys(line)
            if q["brand"] and c["brand"] and q["brand"] != c["brand"]:
                continue
            if q["series"] and c["series"] and q["series"] != c["series"]:
                continue
            all_codes_match = q["codes"] and all(code in c["comp"] for code in q["codes"])
            if all_codes_match:
                if q["gen"] and c["gen"] and q["gen"] != c["gen"]:
                    continue
                exact_match_line = line
                break

    # If exact model match found:
    if exact_match_line:
        clean_matched = isolate_matching_chunk(exact_match_line, q)
        return {
            "status": "available",
            "is_exact_match": True,
            "best_match": clean_matched,
            "matched_models": [],  # NOTHING EXTRA!
            "reasoning": f"Model '{query.strip()}' is available in stock.",
            "confidence": 98,
        }

    # 2. Partial Conflict:
    if partial_conflict_matches:
        clean_matched = isolate_matching_chunk(partial_conflict_matches[0], q)
        return {
            "status": "partial",
            "is_exact_match": False,
            "best_match": clean_matched,
            "matched_models": [isolate_matching_chunk(m, q) for m in partial_conflict_matches],
            "reasoning": f"The exact model '{query.strip()}' was not found, but other variants of this model are in stock:",
            "confidence": 85,
        }

    # 3. Model with unspecified variants:
    same_model_variants = []
    seen_variants = set()

    for line in catalog:
        c = extract_keys(line)
        if q["brand"] and c["brand"] and q["brand"] != c["brand"]:
            continue
        if q["series"]:
            series_match = bool(c["series"]) and (c["series"] == q["series"] or q["series"] in c["series"] or c["series"] in q["series"])
            if not series_match:
                continue

        if q["family_numbers"]:
            number_matches = all(fn in c["comp"] or any(fn in code for code in c["codes"]) for fn in q["family_numbers"])
            if not number_matches:
                continue

        if q["base_code"] and len(q["base_code"]) >= 3:
            base_match = any(code.startswith(q["base_code"]) or code == q["base_code"] for code in c["codes"]) or q["base_code"] in c["comp"]
            if not base_match:
                continue

        q_tokens = [t for t in q["norm"].split() if len(t) >= 2 and t not in BRANDS]
        token_matches = all(t in c["norm"] or t in c["comp"] for t in q_tokens)
        if q["series"] or token_matches:
            k = compact(line)
            if k not in seen_variants:
                seen_variants.add(k)
                same_model_variants.append(line)

    if same_model_variants:
        if len(same_model_variants) == 1:
            clean_matched = isolate_matching_chunk(same_model_variants[0], q)
            return {
                "status": "available",
                "is_exact_match": True,
                "best_match": clean_matched,
                "matched_models": [],
                "reasoning": f"Model '{query.strip()}' is available in stock.",
                "confidence": 95,
            }
        unique_isolated = []
        seen_iso = set()
        for v in same_model_variants:
            iso = isolate_matching_chunk(v, q)
            k = compact(iso)
            if len(k) >= 2 and k not in seen_iso:
                seen_iso.add(k)
                unique_isolated.append(iso)
        if len(unique_isolated) == 1:
            return {
                "status": "available",
                "is_exact_match": True,
                "best_match": unique_isolated[0],
                "matched_models": [],
                "reasoning": f"Model '{query.strip()}' is available in stock.",
                "confidence": 95,
            }
        return {
            "status": "partial",
            "is_exact_match": False,
            "best_match": f"{query.strip()} Variants",
            "matched_models": unique_isolated,
            "reasoning": f"Multiple variants found for '{query.strip()}'. Available options:",
            "confidence": 90,
        }

    return {
        "status": "unavailable",
        "is_exact_match": False,
        "best_match": "",
        "matched_models": [],
        "reasoning": f"Model '{query.strip()}' was not found in the uploaded catalog.",
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
    raw_available = payload.get("availableModels") or []
    available_models = clean_catalog_lines(raw_available)

    if not prompt:
        return jsonify({"error": "Prompt is required."}), 400

    classification = classify_match(prompt, available_models)
    matches = classification["matched_models"]
    best_match = classification["best_match"]
    is_exact = classification.get("is_exact_match", False)

    if not api_key:
        return jsonify({
            "status": classification["status"],
            "available": classification["status"] == "available",
            "matchedModel": best_match or None,
            "matchedModels": matches,
            "ambiguous": len(matches) > 1,
            "reasoning": classification["reasoning"],
            "confidence": classification["confidence"],
            "aiUnavailable": True,
        })

    model_list = ", ".join(available_models) if available_models else "No models provided."
    matched_list = ", ".join(matches) if matches else "None"
    best_catalog = best_match or "None"
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

    is_available = classification["status"] == "available"
    matched_model = best_match or (matches[0] if matches else None)
    assistant_data = parse_assistant_json(answer)

    ai_status = assistant_data.get("status", "")
    if ai_status in {"available", "unavailable", "partial", "uncertain"}:
        status = ai_status
    else:
        status = classification["status"]

    ai_reasoning = str(assistant_data.get("reasoning") or "").strip()
    if ai_reasoning:
        reasoning = ai_reasoning
    elif is_exact:
        reasoning = f"Model '{prompt}' is confirmed in the catalog."
    elif matches:
        reasoning = f"Found {len(matches)} matching variant(s) in the PDF."
    else:
        reasoning = classification["reasoning"]

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
        "confidence": int(assistant_data.get("confidence", 98 if is_available else 72)),
        "aiUnavailable": bool(ai_error and not answer),
    })


@app.route("/api/ai-image-check", methods=["POST"])
def ai_image_check():
    api_key = os.getenv("GOOGLE_API_KEY")
    image = request.files.get("image")
    if not image:
        return jsonify({"error": "Please upload an image."}), 400

    try:
        raw_available = json.loads(request.form.get("availableModels", "[]"))
    except json.JSONDecodeError:
        return jsonify({"error": "Invalid catalog model data."}), 400

    if not isinstance(raw_available, list):
        return jsonify({"error": "Catalog model data must be a list."}), 400

    available_models = clean_catalog_lines(raw_available)

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
