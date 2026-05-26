from __future__ import annotations

import json
import sys
from pathlib import Path

from faster_whisper import WhisperModel


def format_ts(seconds: float) -> str:
    total = int(seconds)
    hours = total // 3600
    minutes = (total % 3600) // 60
    secs = total % 60
    return f"{hours:02d}:{minutes:02d}:{secs:02d}"


def main() -> None:
    if len(sys.argv) < 3:
        raise SystemExit("Usage: transcribe_audio.py <audio_path> <output_dir> [model_size]")

    audio_path = Path(sys.argv[1])
    output_dir = Path(sys.argv[2])
    model_size = sys.argv[3] if len(sys.argv) > 3 else "small"
    output_dir.mkdir(parents=True, exist_ok=True)

    model = WhisperModel(model_size, device="cpu", compute_type="int8")
    segments, info = model.transcribe(
        str(audio_path),
        language="es",
        beam_size=5,
        vad_filter=True,
        vad_parameters={"min_silence_duration_ms": 700},
    )

    rows = []
    txt_lines = [
        f"Audio: {audio_path}",
        f"Modelo: {model_size}",
        f"Idioma detectado: {info.language} ({info.language_probability:.2f})",
        "",
    ]

    for segment in segments:
        row = {
            "start": segment.start,
            "end": segment.end,
            "start_ts": format_ts(segment.start),
            "end_ts": format_ts(segment.end),
            "text": segment.text.strip(),
        }
        rows.append(row)
        txt_lines.append(f"[{row['start_ts']} - {row['end_ts']}] {row['text']}")

    stem = audio_path.stem
    (output_dir / f"{stem}.transcripcion.txt").write_text("\n".join(txt_lines) + "\n", encoding="utf-8")
    (output_dir / f"{stem}.segments.json").write_text(
        json.dumps(rows, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
