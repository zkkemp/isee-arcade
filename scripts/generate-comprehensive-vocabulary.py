#!/usr/bin/env python3
"""Build research-guided vocabulary banks for every learner route.

Development-only inputs:
  * wordfreq corpus rankings (Apache-2.0)
  * Princeton WordNet relationships and glosses (WordNet license)
  * Middle School Vocabulary Lists headwords (Greene & Coxhead)
  * New Academic Word List headwords (CC BY-SA 4.0)

The generated TypeScript is deterministic and has no network or Python runtime
dependency. Source lists guide headword selection only; definitions, answer
placement, distractors, explanations, and question text are assembled here.
"""

from __future__ import annotations

import html
import json
import os
import re
import urllib.request
from dataclasses import dataclass
from difflib import SequenceMatcher
from functools import lru_cache
from pathlib import Path
from typing import Iterable

from better_profanity import profanity
from nltk.corpus import wordnet as wn
from wordfreq import top_n_list, zipf_frequency


ROOT = Path(__file__).resolve().parents[1]
GRADE_OUTPUT = ROOT / "lib" / "questions" / "gradeVocabulary.ts"
ISEE_OUTPUT = ROOT / "lib" / "questions" / "iseeLevelVocabulary.ts"
os.environ.setdefault("NLTK_DATA", "/tmp/isee-nltk-data")

MSVL_URL = "https://www.eapfoundation.com/vocab/other/msvl/"
NAWL_URL = "https://www.eapfoundation.com/vocab/academic/nawl/?listsize=complete"

SAFE_DEFINITION_RE = re.compile(
    r"\b(?:offensive|slur|vulgar|sexual|intercourse|genital|buttock|"
    r"urination|defecation|narcotic|intoxicat|pornograph|prostitut|"
    r"racial epithet|ethnic group|lysergic|hallucinogen|liquor|gin|"
    r"corpse|sexual organ|excrement)\b",
    re.IGNORECASE,
)

BLOCKED = {
    "ain",
    "aren",
    "couldn",
    "didn",
    "doesn",
    "don",
    "gonna",
    "gotta",
    "hadn",
    "hasn",
    "haven",
    "isn",
    "mightn",
    "mustn",
    "shan",
    "shouldn",
    "wanna",
    "wasn",
    "weren",
    "won",
    "wouldn",
    "armour",
    "colour",
    "centre",
    "favour",
    "favourite",
    "grey",
    "labour",
    "metre",
    "theatre",
    "programme",
}

INFLECTED_ENDINGS = ("ingly", "edly", "ing", "ed", "ies")


@dataclass(frozen=True)
class Entry:
    word: str
    meaning: str
    gloss: str
    pos: str
    frequency: float


@dataclass(frozen=True)
class BankSpec:
    key: str
    prefix: str
    count: int
    difficulty: int
    frequency_center: float
    frequency_min: float
    frequency_max: float
    min_length: int
    max_length: int
    max_meaning_words: int
    allow_gloss_answer: bool
    priority: str = "general"


GRADE_SPECS = [
    BankSpec("k", "gv-k", 500, 1, 5.65, 4.75, 7.50, 2, 7, 10, True),
    BankSpec("grade1", "gv-g1", 500, 1, 5.25, 4.45, 6.60, 3, 9, 10, True),
    BankSpec("grade2", "gv-g2", 500, 1, 4.85, 4.05, 5.90, 3, 10, 11, True),
    BankSpec("grade3", "gv-g3", 500, 2, 4.45, 3.70, 5.35, 4, 12, 12, True),
    BankSpec("grade4", "gv-g4", 500, 2, 4.15, 3.45, 4.95, 4, 13, 12, True),
    BankSpec("grade5", "gv-g5", 500, 2, 3.90, 3.20, 4.70, 5, 14, 12, True),
    BankSpec("grade6", "gv-g6", 500, 2, 3.70, 3.00, 4.55, 5, 15, 12, True, "msvl"),
    BankSpec("grade7", "gv-g7", 500, 3, 3.50, 2.80, 4.35, 5, 16, 12, True, "msvl"),
    BankSpec("grade8", "gv-g8", 500, 3, 3.30, 2.60, 4.15, 5, 17, 12, True, "academic"),
]

ISEE_SPECS = [
    BankSpec(
        "middle",
        "im-vc",
        550,
        2,
        3.45,
        2.75,
        4.30,
        5,
        16,
        7,
        True,
        "msvl",
    ),
    BankSpec(
        "upper",
        "iu-vc",
        550,
        3,
        3.05,
        2.20,
        4.00,
        6,
        18,
        8,
        True,
        "nawl",
    ),
]


def fetch_text(url: str) -> str:
    request = urllib.request.Request(
        url,
        headers={"User-Agent": "ISEE-Arcade curriculum generator"},
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        return response.read().decode("utf-8", errors="replace")


def strip_tags(value: str) -> str:
    return html.unescape(re.sub(r"<[^>]+>", "", value)).strip().lower()


def source_headwords() -> tuple[set[str], set[str]]:
    msvl_html = fetch_text(MSVL_URL)
    msvl = {
        strip_tags(match.group(1))
        for match in re.finditer(
            r"<tr><td>\d+</td><td>(.*?)</td><td>",
            msvl_html,
            flags=re.DOTALL,
        )
    }
    nawl_html = fetch_text(NAWL_URL)
    nawl = {
        match.group(1).lower()
        for match in re.finditer(
            r"<td><a[^>]+><b>([A-Za-z]+)</b></a></td>",
            nawl_html,
        )
    }
    msvl = {word for word in msvl if re.fullmatch(r"[a-z]+", word)}
    nawl = {word for word in nawl if re.fullmatch(r"[a-z]+", word)}
    if len(msvl) < 300:
        raise RuntimeError(f"MSVL extraction returned only {len(msvl)} headwords")
    if len(nawl) < 900:
        raise RuntimeError(f"NAWL extraction returned only {len(nawl)} headwords")
    return msvl, nawl


@lru_cache(maxsize=None)
def clean_word(value: str) -> str | None:
    value = value.strip().lower()
    if (
        not re.fullmatch(r"[a-z]+", value)
        or value in BLOCKED
        or profanity.contains_profanity(value)
    ):
        return None
    return value


def too_similar(left: str, right: str) -> bool:
    return SequenceMatcher(a=left, b=right).ratio() >= 0.78


def likely_inflected(word: str) -> bool:
    if word.endswith(INFLECTED_ENDINGS):
        return True
    if word.endswith("ly") and len(word) > 6:
        return True
    if word.endswith("s") and not word.endswith(("ss", "us", "is")):
        noun_root = wn.morphy(word, "n")
        if noun_root and noun_root != word:
            return True
    return False


def clean_gloss(value: str) -> str | None:
    value = value.split(";")[0]
    value = re.sub(r"^\([^)]*\)\s*", "", value)
    value = re.sub(r"\s+", " ", value).strip(" .")
    if (
        len(value) < 6
        or len(value) > 92
        or SAFE_DEFINITION_RE.search(value)
    ):
        return None
    return value


def best_entry(word: str, spec: BankSpec) -> Entry | None:
    word = clean_word(word)
    if (
        not word
        or len(word) < spec.min_length
        or len(word) > spec.max_length
        or likely_inflected(word)
    ):
        return None
    frequency = zipf_frequency(word, "en")
    if not (spec.frequency_min <= frequency <= spec.frequency_max):
        return None

    # WordNet's first noun sense is not necessarily the everyday part of speech
    # (KEEP begins with the noun "financial support"). Rank the first several
    # senses by the target lemma's corpus count, then by dictionary order.
    senses: list[tuple[int, int, object]] = []
    for sense_index, synset in enumerate(wn.synsets(word)[:8]):
        target_count = max(
            (
                lemma.count()
                for lemma in synset.lemmas()
                if lemma.name().replace("_", " ").lower() == word
            ),
            default=0,
        )
        senses.append((-target_count, sense_index, synset))

    for negative_count, _sense_index, synset in sorted(senses):
        if synset.instance_hypernyms():
            continue
        pos = "a" if synset.pos() == "s" else synset.pos()
        if pos not in {"n", "v", "a", "r"}:
            continue
        lemmas = {clean_word(lemma.name().replace("_", "")) for lemma in synset.lemmas()}
        if word not in lemmas:
            continue
        if spec.key in {"k", "grade1", "grade2", "grade3", "grade4", "grade5"} and negative_count == 0:
            continue
        gloss = clean_gloss(synset.definition())
        if not gloss:
            continue

        synonyms: list[str] = []
        for lemma in synset.lemmas():
            synonym = clean_word(lemma.name().replace("_", " "))
            if (
                not synonym
                or synonym == word
                or too_similar(word, synonym)
                or len(synonym.split()) > spec.max_meaning_words
            ):
                continue
            synonyms.append(synonym)

        if spec.key in {item.key for item in GRADE_SPECS} and len(gloss.split()) <= spec.max_meaning_words:
            meaning = gloss
        elif synonyms:
            meaning = max(synonyms, key=lambda item: zipf_frequency(item, "en"))
        elif spec.allow_gloss_answer and len(gloss.split()) <= spec.max_meaning_words:
            meaning = gloss
        else:
            continue
        if profanity.contains_profanity(meaning) or SAFE_DEFINITION_RE.search(meaning):
            continue
        return Entry(word, meaning, gloss, pos, frequency)
    return None


def select_bank(
    spec: BankSpec,
    *,
    general_words: list[str],
    msvl: set[str],
    nawl: set[str],
) -> list[Entry]:
    if spec.priority == "msvl":
        priority_words = msvl
    elif spec.priority == "nawl":
        priority_words = nawl
    elif spec.priority == "academic":
        priority_words = msvl | nawl
    else:
        priority_words = set()

    ranked = {word: index for index, word in enumerate(general_words)}
    candidates = list(dict.fromkeys([*priority_words, *general_words]))
    # Order words with cheap corpus metadata first, then stop as soon as the
    # bank is full. Performing WordNet analysis on every one of 80,000 words
    # before sorting made the generator needlessly slow.
    candidates.sort(
        key=lambda word: (
            0 if word in priority_words else 1,
            abs(zipf_frequency(word, "en") - spec.frequency_center),
            ranked.get(word, 1_000_000),
            word,
        )
    )
    selected: list[Entry] = []
    used_meanings: set[str] = set()
    for word in candidates:
        entry = best_entry(word, spec)
        if not entry:
            continue
        # A few repeated meanings are educationally fine, but keeping meanings
        # unique inside a bank produces stronger answer choices and less monotony.
        if entry.meaning in used_meanings:
            continue
        selected.append(entry)
        used_meanings.add(entry.meaning)
        if len(selected) == spec.count:
            return selected
    raise RuntimeError(f"{spec.key}: only {len(selected)} quality entries found")


def entry_lines(entries: Iterable[Entry]) -> Iterable[str]:
    for entry in entries:
        payload = [entry.word, entry.meaning, entry.gloss, entry.pos]
        yield f"  {json.dumps(payload, ensure_ascii=False)},"


def render_shared_helpers() -> list[str]:
    return [
        "type VocabularyEntry = readonly [word: string, meaning: string, gloss: string, pos: string];",
        "",
        "function buildVocabularyBank(",
        "  prefix: string,",
        "  difficulty: 1 | 2 | 3,",
        "  entries: readonly VocabularyEntry[],",
        "): Question[] {",
        "  return entries.map((entry, index) => {",
        "    const [word, correct, gloss, pos] = entry;",
        "    const distractors: string[] = [];",
        "    for (let jump = 1; jump <= entries.length && distractors.length < 3; jump += 1) {",
        "      const candidate = entries[(index + jump * 47) % entries.length];",
        "      if (candidate[3] === pos && candidate[1] !== correct && !distractors.includes(candidate[1])) {",
        "        distractors.push(candidate[1]);",
        "      }",
        "    }",
        "    for (let jump = 1; jump <= entries.length && distractors.length < 3; jump += 1) {",
        "      const candidate = entries[(index + jump * 53) % entries.length];",
        "      if (candidate[1] !== correct && !distractors.includes(candidate[1])) {",
        "        distractors.push(candidate[1]);",
        "      }",
        "    }",
        "    const answer = (index % 4) as 0 | 1 | 2 | 3;",
        "    const choices = [...distractors];",
        "    choices.splice(answer, 0, correct);",
        "    return {",
        "      id: `${prefix}-${String(index + 1).padStart(3, '0')}`,",
        "      subject: 'verbal',",
        "      kind: 'synonym',",
        "      topic: 'level-specific vocabulary',",
        "      prompt: word.toUpperCase(),",
        "      choices,",
        "      answer,",
        "      explain: `“${word}” means “${correct}.” In this sense: ${gloss}.`,",
        "      difficulty,",
        "    };",
        "  });",
        "}",
        "",
    ]


def render_grade(banks: dict[str, list[Entry]]) -> str:
    lines = [
        "import type { Question } from './types';",
        "",
        "/**",
        " * Grade-specific vocabulary generated from corpus frequency, WordNet,",
        " * Common Core progression, MSVL, and NAWL source guidance.",
        " * See scripts/generate-comprehensive-vocabulary.py for provenance and gates.",
        " */",
        *render_shared_helpers(),
    ]
    constants: list[str] = []
    for spec in GRADE_SPECS:
        name = f"{spec.key.upper()}_ENTRIES".replace("GRADE", "GRADE_")
        constants.append(name)
        lines.append(f"const {name}: readonly VocabularyEntry[] = [")
        lines.extend(entry_lines(banks[spec.key]))
        lines.append("];")
        lines.append("")
    lines.extend(
        [
            "export const GRADE_VOCABULARY_BANKS = {",
            *[
                (
                    f"  {spec.key}: buildVocabularyBank("
                    f"'{spec.prefix}', {spec.difficulty}, {constants[index]}),"
                )
                for index, spec in enumerate(GRADE_SPECS)
            ],
            "} satisfies Record<string, Question[]>;",
            "",
        ]
    )
    return "\n".join(lines)


def render_isee(banks: dict[str, list[Entry]]) -> str:
    lines = [
        "import type { Question } from './types';",
        "",
        "/**",
        " * ISEE Middle and Upper vocabulary generated independently from the",
        " * protected Lower source, while allowing appropriate headword overlap.",
        " */",
        *render_shared_helpers(),
    ]
    for spec in ISEE_SPECS:
        name = f"ISEE_{spec.key.upper()}_ENTRIES"
        lines.append(f"const {name}: readonly VocabularyEntry[] = [")
        lines.extend(entry_lines(banks[spec.key]))
        lines.append("];")
        lines.append("")
    lines.extend(
        [
            "export const ISEE_MIDDLE_VOCABULARY = buildVocabularyBank(",
            "  'im-vc',",
            "  2,",
            "  ISEE_MIDDLE_ENTRIES,",
            ");",
            "",
            "export const ISEE_UPPER_VOCABULARY = buildVocabularyBank(",
            "  'iu-vc',",
            "  3,",
            "  ISEE_UPPER_ENTRIES,",
            ");",
            "",
        ]
    )
    return "\n".join(lines)


def main() -> None:
    profanity.load_censor_words()
    msvl, nawl = source_headwords()
    general_words = top_n_list("en", 80_000)
    grade_banks = {
        spec.key: select_bank(
            spec,
            general_words=general_words,
            msvl=msvl,
            nawl=nawl,
        )
        for spec in GRADE_SPECS
    }
    isee_banks = {
        spec.key: select_bank(
            spec,
            general_words=general_words,
            msvl=msvl,
            nawl=nawl,
        )
        for spec in ISEE_SPECS
    }
    GRADE_OUTPUT.write_text(render_grade(grade_banks), encoding="utf-8")
    ISEE_OUTPUT.write_text(render_isee(isee_banks), encoding="utf-8")
    print(
        "Generated "
        f"{sum(map(len, grade_banks.values()))} grade vocabulary questions and "
        f"{sum(map(len, isee_banks.values()))} ISEE vocabulary questions."
    )


if __name__ == "__main__":
    main()
