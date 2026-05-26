from __future__ import annotations

import json
import sys
from pathlib import Path

from faster_whisper import WhisperModel


def format_ts(seconds: float) -> str:
    total = int(seconds)
    return f"{total // 3600:02d}:{(total % 3600) // 60:02d}:{total % 60:02d}"


def main() -> None:
    if len(sys.argv) < 3:
        raise SystemExit("Usage: transcribe_chunks.py <chunks_dir> <output_dir> [model_size]")

    chunks_dir = Path(sys.argv[1])
    output_dir = Path(sys.argv[2])
    model_size = sys.argv[3] if len(sys.argv) > 3 else "tiny"
    output_dir.mkdir(parents=True, exist_ok=True)

    model = WhisperModel(model_size, device="cpu", compute_type="int8")
    all_rows = []
    txt_lines = [
        f"Chunks: {chunks_dir}",
        f"Modelo: {model_size}",
        "",
    ]

    for index, chunk in enumerate(sorted(chunks_dir.glob("*.wav"))):
        offset = index * 600
        print(f"Transcribiendo {chunk.name} desde {format_ts(offset)}...", flush=True)
        segments, info = model.transcribe(
            str(chunk),
            language="es",
            beam_size=1,
            best_of=1,
            vad_filter=True,
            vad_parameters={"min_silence_duration_ms": 700},
            condition_on_previous_text=False,
            initial_prompt=(
                "Reunion sobre inmobiliaria, sistema Abaco, propietarios, fincas, inquilinos, "
                "contratos, alquileres, gastos comunes, UTE, OSE, tributos, saneamiento, "
                "pagos, recibos, liquidaciones, reajustes y procesos manuales."
            ),
        )
        for segment in segments:
            start = offset + segment.start
            end = offset + segment.end
            row = {
                "chunk": chunk.name,
                "start": start,
                "end": end,
                "start_ts": format_ts(start),
                "end_ts": format_ts(end),
                "text": segment.text.strip(),
            }
            all_rows.append(row)
            txt_lines.append(f"[{row['start_ts']} - {row['end_ts']}] {row['text']}")

    (output_dir / "Voz.transcripcion.txt").write_text("\n".join(txt_lines) + "\n", encoding="utf-8")
    (output_dir / "Voz.segments.json").write_text(
        json.dumps(all_rows, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
