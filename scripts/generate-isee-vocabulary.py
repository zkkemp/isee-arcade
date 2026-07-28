#!/usr/bin/env python3
"""Generate independent Middle and Upper ISEE vocabulary banks.

This is a development-only content generator. It uses the open WordNet lexical
database and wordfreq rankings to find age-appropriate headwords, then freezes
the selected questions into TypeScript. The shipped application has no Python,
NLTK, or wordfreq runtime dependency.

The protected Lower Level source files are read only to create an exclusion set.
They are never rewritten. Middle and Upper are also excluded from one another.
"""

from __future__ import annotations

import json
import os
import re
from difflib import SequenceMatcher
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

from nltk.corpus import wordnet as wn
from wordfreq import top_n_list, zipf_frequency


ROOT = Path(__file__).resolve().parents[1]
VOCAB_DIR = ROOT / "lib" / "questions" / "vocab"
OUTPUT = ROOT / "lib" / "questions" / "iseeLevelVocabulary.ts"
TARGET_PER_LEVEL = 550

os.environ.setdefault("NLTK_DATA", "/tmp/isee-nltk-data")

BLOCKED = {
    # Function words, contractions, abbreviations, and terms that are poor
    # standalone test-prep headwords even when they have a WordNet entry.
    "ain",
    "aren",
    "couldn",
    "didn",
    "doesn",
    "don",
    "hadn",
    "hasn",
    "haven",
    "isn",
    "mightn",
    "mustn",
    "shan",
    "shouldn",
    "wasn",
    "weren",
    "won",
    "wouldn",
    "etc",
    "mr",
    "mrs",
    "ms",
    "st",
    "dr",
    "okay",
    "yeah",
    "hey",
    "gonna",
    "wanna",
    "gotta",
    "bum",
    "idiot",
    "moron",
    "retard",
    "retarded",
    "stupid",
    "damn",
    "hell",
    "jesus",
    "mohammed",
    "muhammad",
}

# A synonym answer should itself teach useful vocabulary. Reject the most
# common English words so an advanced headword does not collapse to an answer
# such as "make", "can", "get", or "thing".
COMMON_WORDS = set(top_n_list("en", 650))


@dataclass(frozen=True)
class Entry:
    word: str
    synonym: str
    definition: str
    pos: str
    frequency: float


def lower_words() -> set[str]:
    words: set[str] = set()
    for source in sorted(VOCAB_DIR.glob("*.ts")):
        text = source.read_text(encoding="utf-8")
        words.update(
            match.group(2).lower()
            for match in re.finditer(r"prompt:\s*(['\"])([A-Z][A-Z -]+)\1", text)
        )
    # The protected bank contains 550 questions and 510 distinct headwords;
    # several words intentionally appear in more than one sense.
    if len(words) < 500:
        raise RuntimeError(f"Expected at least 500 protected Lower headwords, found {len(words)}")
    return words


def clean_lemma(value: str) -> str | None:
    value = value.replace("_", " ").lower().strip()
    if not re.fullmatch(r"[a-z]+", value):
        return None
    if len(value) < 3 or len(value) > 18 or value in BLOCKED:
        return None
    return value


def too_similar(left: str, right: str) -> bool:
    return SequenceMatcher(a=left, b=right).ratio() >= 0.72


def best_entry(word: str) -> Entry | None:
    # Only the first few senses are considered, and the first usable sense wins.
    # This keeps CHAIN paired with "series" rather than a later geographic sense
    # and CONFIDENCE paired with "assurance" rather than "authority".
    for synset in wn.synsets(word)[:3]:
        if synset.instance_hypernyms():
            continue
        pos = "a" if synset.pos() == "s" else synset.pos()
        if pos not in {"n", "v", "a", "r"}:
            continue
        if wn.morphy(word, pos) != word:
            continue
        target_lemmas = {clean_lemma(lemma.name()) for lemma in synset.lemmas()}
        if word not in target_lemmas:
            continue
        synonyms = []
        for lemma in synset.lemmas():
            synonym = clean_lemma(lemma.name())
            if synonym and synonym != word:
                synonyms.append(synonym)
        if not synonyms:
            continue
        synonyms = [
            item
            for item in synonyms
            if item not in COMMON_WORDS
            and item not in BLOCKED
            and len(item) >= 4
            and not too_similar(word, item)
        ]
        if not synonyms:
            continue
        synonym = max(synonyms, key=lambda item: zipf_frequency(item, "en"))
        synonym_frequency = zipf_frequency(synonym, "en")
        if synonym_frequency < 2.65:
            continue
        definition = re.sub(r"\s+", " ", synset.definition()).strip()
        if len(definition) < 12 or len(definition) > 150:
            continue
        return Entry(
            word=word,
            synonym=synonym,
            definition=definition,
            pos=pos,
            frequency=zipf_frequency(word, "en"),
        )
    return None


def select_entries(
    *,
    excluded: set[str],
    min_frequency: float,
    max_frequency: float,
    min_length: int,
    count: int,
) -> list[Entry]:
    selected: list[Entry] = []
    used_answers: set[str] = set()
    for raw in top_n_list("en", 80000):
        word = clean_lemma(raw)
        if not word or word in excluded or len(word) < min_length:
            continue
        frequency = zipf_frequency(word, "en")
        if not (min_frequency <= frequency <= max_frequency):
            continue
        entry = best_entry(word)
        if (
            not entry
            or entry.synonym in excluded
            or entry.synonym == word
            or too_similar(word, entry.synonym)
        ):
            continue
        # Avoid a bank full of morphological near-duplicates.
        if word.startswith(entry.synonym) or entry.synonym.startswith(word):
            continue
        # Repeating an answer occasionally is defensible, but unique correct
        # choices produce a much healthier bank and cleaner audits.
        if entry.synonym in used_answers:
            continue
        selected.append(entry)
        used_answers.add(entry.synonym)
        excluded.add(word)
        if len(selected) == count:
            return selected
    raise RuntimeError(
        f"Only found {len(selected)} usable entries in frequency range "
        f"{min_frequency}–{max_frequency}"
    )


def distractors(entries: list[Entry], index: int) -> list[str]:
    entry = entries[index]
    pool = [
        other.synonym
        for other in entries
        if other.pos == entry.pos
        and other.synonym != entry.synonym
        and abs(len(other.synonym) - len(entry.synonym)) <= 5
    ]
    if len(pool) < 3:
        pool = [other.synonym for other in entries if other.synonym != entry.synonym]
    # Start far from the matching entry, then walk the filtered pool. A simple
    # walk is guaranteed to terminate even when the pool length shares factors
    # with the bank size.
    picked: list[str] = []
    cursor = (index * 37 + 19) % len(pool)
    while len(picked) < 3:
        candidate = pool[cursor]
        if candidate not in picked and candidate != entry.synonym:
            picked.append(candidate)
        cursor = (cursor + 1) % len(pool)
    return picked


def question_lines(entries: list[Entry], prefix: str, difficulty: int) -> Iterable[str]:
    for index, entry in enumerate(entries):
        choices = distractors(entries, index)
        answer = index % 4
        choices.insert(answer, entry.synonym)
        payload = {
            "id": f"{prefix}-{index + 1:03d}",
            "subject": "verbal",
            "kind": "synonym",
            "prompt": entry.word.upper(),
            "choices": choices,
            "answer": answer,
            "explain": (
                f"“{entry.word.capitalize()}” means “{entry.synonym}.” "
                f"In this question, it describes {entry.definition.rstrip('.')}."
            ),
            "difficulty": difficulty,
        }
        yield f"  {json.dumps(payload, ensure_ascii=False)},"


def render(middle: list[Entry], upper: list[Entry]) -> str:
    lines = [
        "import type { Question } from './types';",
        "",
        "/**",
        " * Independent ISEE Middle and Upper vocabulary.",
        " *",
        " * Generated from open WordNet relationships, then frozen so production",
        " * behavior is deterministic. The build-time audit proves both banks contain",
        " * 550 unique headwords and share no headword with Lower or one another.",
        " */",
        "export const ISEE_MIDDLE_VOCABULARY: Question[] = [",
        *question_lines(middle, "im-vc", 2),
        "];",
        "",
        "export const ISEE_UPPER_VOCABULARY: Question[] = [",
        *question_lines(upper, "iu-vc", 3),
        "];",
        "",
    ]
    return "\n".join(lines)


def main() -> None:
    protected = lower_words()
    excluded = set(protected)
    middle = select_entries(
        excluded=excluded,
        min_frequency=3.15,
        max_frequency=4.15,
        min_length=5,
        count=TARGET_PER_LEVEL,
    )
    upper = select_entries(
        excluded=excluded,
        min_frequency=2.35,
        max_frequency=3.35,
        min_length=6,
        count=TARGET_PER_LEVEL,
    )
    middle_words = {entry.word for entry in middle}
    upper_words = {entry.word for entry in upper}
    assert len(middle_words) == TARGET_PER_LEVEL
    assert len(upper_words) == TARGET_PER_LEVEL
    assert not (protected & middle_words)
    assert not (protected & upper_words)
    assert not (middle_words & upper_words)
    OUTPUT.write_text(render(middle, upper), encoding="utf-8")
    print(
        f"Wrote {len(middle)} Middle and {len(upper)} Upper questions to "
        f"{OUTPUT.relative_to(ROOT)}"
    )


if __name__ == "__main__":
    main()
