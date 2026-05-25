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

# ============================================================
# Lyrics Forced Alignment Script
#
# Features:
# - MP3/WAV/etc input
# - TXT or LRC lyric input
# - Phrase-level fuzzy matching
# - Existing LRC timestamp support
# - Timestamp fallback when alignment fails
# - Produces:
#
#   [00:01.04]-[00:05.82] lyric line
#
# Usage:
#
# ./align_lyrics.py song.mp3 lyrics.lrc --language en
#
# Respect existing LRC timestamps:
#
# ./align_lyrics.py song.mp3 lyrics.lrc \
#   --respect-input-timestamps
#
# CPU mode:
#
# ./align_lyrics.py song.mp3 lyrics.lrc \
#   --device cpu
#
# ============================================================

DEFAULT_DEVICE = "cpu"
MODEL_NAME = "medium"

LRC_PATTERN = re.compile(r"\[(\d+):(\d+(?:\.\d+)?)\]")


# ============================================================
# Helpers
# ============================================================

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

    # strip parentheses but keep their content for matching
    text = text.replace("(", " ").replace(")", " ")

    # normalize apostrophes
    text = text.replace("’", "'")

    # normalize slang
    text = normalize_ing(text)

    # remove punctuation
    text = re.sub(r"[^\w\s']", " ", text)

    # collapse spaces
    text = re.sub(r"\s+", " ", text).strip()

    return text


# ============================================================
# Lyrics loading
# ============================================================

def load_lyrics(path: str):
    """
    Supports:
    - plain txt
    - lrc

    Returns:
        [
            {
                "original": str,
                "cleaned": str,
                "input_timestamp": float | None,
            }
        ]
    """

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
            }
        )

    return lines


# ============================================================
# Alignment processing
# ============================================================

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


# ============================================================
# Phrase-level matcher
# ============================================================

def find_word_index_for_time(aligned_words, timestamp):
    best_idx = 0
    best_diff = float("inf")
    for i, w in enumerate(aligned_words):
        diff = abs(w["start"] - timestamp)
        if diff < best_diff:
            best_diff = diff
            best_idx = i
    return best_idx


def match_line_to_words(
    line_words,
    aligned_words,
    start_index,
):
    """
    Phrase-level fuzzy matcher.
    """

    target = " ".join(line_words)

    best_score = -1
    best_range = None

    min_window = max(1, len(line_words) - 3)
    max_window = min(len(line_words) + 6, 24)

    search_end = min(start_index + 150, len(aligned_words))

    for i in range(start_index, search_end):

        for window_size in range(min_window, max_window + 1):

            chunk = aligned_words[i:i + window_size]

            if not chunk:
                continue

            candidate = " ".join(w["word"] for w in chunk)

            score = fuzz.ratio(target, candidate)

            distance_penalty = (i - start_index) * 0.5

            adjusted_score = score - distance_penalty

            if adjusted_score > best_score:
                best_score = adjusted_score
                best_range = (i, i + window_size)

    if best_range is None or best_score < 58:
        return None, None, start_index

    start_i, end_i = best_range

    return (
        aligned_words[start_i]["start"],
        aligned_words[end_i - 1]["end"],
        end_i,
    )


# ============================================================
# Main
# ============================================================

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

    parser.add_argument(
        "--respect-input-timestamps",
        action="store_true",
        help=(
            "Use existing LRC timestamps as start times "
            "instead of Whisper alignment starts"
        ),
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

    current_word_index = 0

    print("Matching lyric lines...")

    for i, lyric in enumerate(lyrics):

        if not lyric["cleaned"]:
            continue

        line_words = lyric["cleaned"].split()

        if lyric["input_timestamp"] is not None:
            anchor_idx = find_word_index_for_time(
                aligned_words, lyric["input_timestamp"]
            )
            search_start = max(current_word_index, anchor_idx)
        else:
            search_start = current_word_index

        start_time, end_time, match_end = (
            match_line_to_words(
                line_words,
                aligned_words,
                search_start,
            )
        )

        # ====================================================
        # Fallback to original LRC timestamps
        # ====================================================

        if start_time is None or end_time is None:

            current_ts = lyric["input_timestamp"]
            next_ts = None

            if i + 1 < len(lyrics):
                next_ts = lyrics[i + 1]["input_timestamp"]

            if current_ts is not None and next_ts is not None:

                print(
                    f"Fallback timestamps used: "
                    f"{lyric['original']}"
                )

                output_lines.append(
                    f"[{format_timestamp(current_ts)}]-"
                    f"[{format_timestamp(next_ts)}] "
                    f"{lyric['original']}"
                )

            else:
                print(f"Could not align: {lyric['original']}")

            continue

        current_word_index = match_end

        # ====================================================
        # Optionally preserve original LRC starts
        # ====================================================

        if (
            args.respect_input_timestamps
            and lyric["input_timestamp"] is not None
        ):
            start_time = lyric["input_timestamp"]

        formatted = (
            f"[{format_timestamp(start_time)}]-"
            f"[{format_timestamp(end_time)}] "
            f"{lyric['original']}"
        )

        output_lines.append(formatted)

    output_path = Path(args.audio).with_suffix(".lrc")

    with open(output_path, "w", encoding="utf-8") as f:
        f.write("\n".join(output_lines))

    print("\nDone.")
    print(f"Saved to: {output_path}")


if __name__ == "__main__":
    main()