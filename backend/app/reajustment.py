from __future__ import annotations

import re
import time
from dataclasses import dataclass
from datetime import datetime
from html.parser import HTMLParser
from typing import Dict, Optional, Tuple

import httpx


CAJA_NOTARIAL_REAJUSTMENT_URL = (
    "https://www.cajanotarial.org.uy/innovaportal/v/3481/1/innova.front/indice-de-reajuste-de-alquileres.html"
)

_MONTHS: Dict[int, str] = {
    1: "enero",
    2: "febrero",
    3: "marzo",
    4: "abril",
    5: "mayo",
    6: "junio",
    7: "julio",
    8: "agosto",
    9: "septiembre",
    10: "octubre",
    11: "noviembre",
    12: "diciembre",
}


class _TextExtractor(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self._chunks: list[str] = []

    def handle_data(self, data: str) -> None:
        value = (data or "").replace("\xa0", " ").strip()
        if value:
            self._chunks.append(value)

    def text(self) -> str:
        return "\n".join(self._chunks)


@dataclass(frozen=True)
class ReajustmentIndexSnapshot:
    fetched_at: datetime
    factors: Dict[Tuple[int, int], float]


_CACHE: Optional[ReajustmentIndexSnapshot] = None
_CACHE_TTL_SECONDS = 12 * 60 * 60


def _normalize_number(raw: str) -> Optional[float]:
    value = (raw or "").strip()
    if not value:
        return None
    value = value.replace(",", ".")
    try:
        number = float(value)
    except ValueError:
        return None
    if number < 0.5 or number > 2.0:
        return None
    return number


def _extract_text(html: str) -> str:
    parser = _TextExtractor()
    parser.feed(html or "")
    return parser.text()


def _parse_page(text: str) -> Dict[Tuple[int, int], float]:
    raw_lines = [line.strip() for line in (text or "").splitlines() if line.strip()]
    lines = [re.sub(r"\s+", " ", line).strip() for line in raw_lines]
    factors: Dict[Tuple[int, int], float] = {}

    month_re = re.compile(
        r"^(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)$",
        re.IGNORECASE,
    )
    month_re_inline = re.compile(
        r"^(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\b",
        re.IGNORECASE,
    )

    header_index = next((idx for idx, line in enumerate(lines) if re.search(r"Mes\s*/?\s*año", line, re.IGNORECASE)), None)
    if header_index is None:
        return factors

    years: list[int] = []
    cursor = header_index + 1
    while cursor < len(lines):
        line = lines[cursor]
        if month_re.match(line):
            break
        for match in re.findall(r"\b(19\d{2}|20\d{2})\b", line):
            years.append(int(match))
        cursor += 1

    while cursor < len(lines):
        line = lines[cursor]
        if not month_re_inline.match(line):
            cursor += 1
            continue
        month_name = month_re_inline.match(line).group(1).lower()  # type: ignore[union-attr]
        month_number = next((k for k, v in _MONTHS.items() if v == month_name), None)
        if not month_number:
            cursor += 1
            continue

        values: list[str] = []
        if " " in line:
            remainder = line.split(" ", 1)[1]
            values.extend(re.findall(r"\d+[.,]\d+", remainder))

        cursor += 1
        while cursor < len(lines) and not month_re_inline.match(lines[cursor]) and not re.search(r"Mes\s*/?\s*año", lines[cursor], re.IGNORECASE):
            values.extend(re.findall(r"\d+[.,]\d+", lines[cursor]))
            cursor += 1

        if years:
            for index, year in enumerate(years):
                if index >= len(values):
                    break
                factor = _normalize_number(values[index])
                if factor is None:
                    continue
                factors[(int(year), int(month_number))] = factor
        else:
            for raw in values[:1]:
                factor = _normalize_number(raw)
                if factor is None:
                    continue
                year_candidates = re.findall(r"\b(19\d{2}|20\d{2})\b", " ".join(lines[header_index:header_index + 10]))
                year = int(year_candidates[0]) if year_candidates else None
                if year:
                    factors[(year, int(month_number))] = factor
    return factors


def fetch_indice_reajuste_snapshot(force: bool = False) -> ReajustmentIndexSnapshot:
    global _CACHE
    now = datetime.utcnow()
    if not force and _CACHE and (now - _CACHE.fetched_at).total_seconds() < _CACHE_TTL_SECONDS:
        return _CACHE

    pages = [CAJA_NOTARIAL_REAJUSTMENT_URL]
    for page in (2, 3):
        pages.append(f"{CAJA_NOTARIAL_REAJUSTMENT_URL}?page={page}")

    all_factors: Dict[Tuple[int, int], float] = {}
    with httpx.Client(timeout=10.0, follow_redirects=True, headers={"User-Agent": "inmobiliaria-salgueiro-poc"}) as client:
        for url in pages:
            response = client.get(url)
            response.raise_for_status()
            text = _extract_text(response.text)
            all_factors.update(_parse_page(text))
            time.sleep(0.1)

    snapshot = ReajustmentIndexSnapshot(fetched_at=now, factors=all_factors)
    _CACHE = snapshot
    return snapshot


def indice_reajuste_alquileres_factor(year: int, month: int) -> Optional[float]:
    snapshot = fetch_indice_reajuste_snapshot()
    return snapshot.factors.get((int(year), int(month)))
