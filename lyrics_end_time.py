#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.10"
# dependencies = [
#     "whisperx",
#     "rapidfuzz",
#     "torch",
# ]
# ///

import argparse
import re
from pathlib import Path

import whisperx
from rapidfuzz import fuzz

DEFAULT_DEVICE = "cpu"
MODEL_NAME = "medium"

LRC_PATTERN = re.compile(r"\[(\d+):(\d+(?:\.\d+)?)\]")


def format_timestamp(seconds: float) -> str:
    minutes = int(seconds // 60)
    secs = seconds % 60
    return f"{minutes:02d}:{secs:05.2f}"


def parse_lrc_timestamp(match) -> float:
    minutes = int(match.group(1))
    seconds = float(match.group(2))
    return minutes * 60 + seconds


def strip_lrc_tags(line: str) -> str:
    return re.sub(LRC_PATTERN, "", line).strip()


def normalize_ing(text: str) -> str:
    return re.sub(r"(\w+)in'", r"\1ing", text)


def clean_text(text: str) -> str:
    text = text.lower()
    text = text.replace("(", " ").replace(")", " ")
    text = text.replace("\u2019", "'")
    text = normalize_ing(text)
    text = re.sub(r"[^\w\s']", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def load_lyrics(path: str):
    lines = []

    with open(path, "r", encoding="utf-8") as f:
        raw_lines = f.readlines()

    for raw_line in raw_lines:
        raw_line = raw_line.strip()

        if not raw_line:
            continue

        timestamps = list(LRC_PATTERN.finditer(raw_line))

        input_timestamp = None
        if timestamps:
            input_timestamp = parse_lrc_timestamp(timestamps[0])

        lyric_text = strip_lrc_tags(raw_line)

        if not lyric_text:
            if input_timestamp is not None:
                lines.append(
                    {
                        "original": "",
                        "cleaned": "",
                        "input_timestamp": input_timestamp,
                        "is_marker": True,
                    }
                )
            continue

        cleaned = clean_text(lyric_text)

        if not cleaned:
            continue

        lines.append(
            {
                "original": lyric_text,
                "cleaned": cleaned,
                "input_timestamp": input_timestamp,
                "is_marker": False,
            }
        )

    return lines


def flatten_words(segments):
    words = []

    for segment in segments:
        for word in segment.get("words", []):
            if "start" not in word or "end" not in word:
                continue

            cleaned = clean_text(word["word"])

            if not cleaned:
                continue

            words.append(
                {
                    "word": cleaned,
                    "start": word["start"],
                    "end": word["end"],
                }
            )

    return words


def find_word_index_for_time(aligned_words, timestamp):
    best_idx = 0
    best_diff = float("inf")

    for i, w in enumerate(aligned_words):
        diff = abs(w["start"] - timestamp)
        if diff < best_diff:
            best_diff = diff
            best_idx = i

    return best_idx


def find_end_time(line_words, aligned_words, start_time):
    target = " ".join(line_words)
    anchor_idx = find_word_index_for_time(aligned_words, start_time)

    min_window = max(1, len(line_words) - 3)
    max_window = min(len(line_words) + 6, 24)

    search_start = max(0, anchor_idx - 10)
    search_end = min(anchor_idx + 80, len(aligned_words))

    best_score = -1
    best_end_time = None

    for i in range(search_start, search_end):

        time_offset = abs(aligned_words[i]["start"] - start_time)
        if time_offset > 2.5:
            continue

        for window_size in range(min_window, max_window + 1):

            chunk = aligned_words[i : i + window_size]

            if not chunk:
                continue

            candidate = " ".join(w["word"] for w in chunk)
            score = fuzz.ratio(target, candidate)

            if score > best_score:
                best_score = score
                best_end_time = chunk[-1]["end"]

    if best_score < 50:
        return None

    return best_end_time


def find_next_timestamp(lyrics, start_idx):
    for j in range(start_idx + 1, len(lyrics)):
        ts = lyrics[j]["input_timestamp"]
        if ts is not None:
            return ts
    return None


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("audio")
    parser.add_argument("lyrics")
    parser.add_argument(
        "--device",
        default=DEFAULT_DEVICE,
        choices=["cpu", "cuda"],
    )
    parser.add_argument(
        "--language",
        default="en",
        help="Language code like en, ja, es",
    )
    args = parser.parse_args()

    print("Loading lyrics...")
    lyrics = load_lyrics(args.lyrics)

    print("Loading Whisper model...")

    model = whisperx.load_model(
        MODEL_NAME,
        args.device,
        compute_type="float16" if args.device == "cuda" else "int8",
    )

    print("Loading audio...")
    audio = whisperx.load_audio(args.audio)

    print("Transcribing...")

    result = model.transcribe(
        audio,
        batch_size=16,
        language=args.language,
    )

    print("Loading alignment model...")

    align_model, metadata = whisperx.load_align_model(
        language_code=result["language"],
        device=args.device,
    )

    print("Aligning...")

    aligned_result = whisperx.align(
        result["segments"],
        align_model,
        metadata,
        audio,
        args.device,
    )

    print("Flattening aligned words...")
    aligned_words = flatten_words(aligned_result["segments"])

    print(f"Aligned words: {len(aligned_words)}")

    output_lines = []

    for i, lyric in enumerate(lyrics):

        if lyric["is_marker"]:
            continue

        start_time = lyric["input_timestamp"]

        if start_time is None:
            print(f"No start timestamp, skipping: {lyric['original']}")
            continue

        line_words = lyric["cleaned"].split()

        end_time = find_end_time(line_words, aligned_words, start_time)

        # ============================================================
        # Validate end time: discard if it extends past next
        # line's start
        # ============================================================

        if end_time is not None:
            next_ts = find_next_timestamp(lyrics, i)

            if next_ts is not None and end_time > next_ts:
                print(
                    f"End time {end_time:.2f} > next start "
                    f"{next_ts:.2f}, discarding: "
                    f"{lyric['original']}"
                )
                end_time = None

        # ============================================================
        # Fallback: next timestamp (including markers) as end time
        # ============================================================

        if end_time is None:
            next_ts = find_next_timestamp(lyrics, i)

            if next_ts is not None:
                end_time = next_ts
                print(
                    f"Fallback end time for: "
                    f"{lyric['original']}"
                )
            else:
                end_time = start_time + 3.0

        output_lines.append(
            f"[{format_timestamp(start_time)}]-"
            f"[{format_timestamp(end_time)}] "
            f"{lyric['original']}"
        )

    output_path = Path(args.audio).with_suffix(".lrc")

    with open(output_path, "w", encoding="utf-8") as f:
        f.write("\n".join(output_lines))

    print("\nDone.")
    print(f"Saved to: {output_path}")


if __name__ == "__main__":
    main()
