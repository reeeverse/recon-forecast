"""
Text normalization for reconciliation matching.

Normalizing before scoring ensures superficial formatting differences
(separators, case, stopwords) don't penalize legitimate matches.
"""

import re

_REF_STRIP = re.compile(r"[-/\s]")
_DESC_PUNCT = re.compile(r"[^\w\s]")
_DESC_SPACES = re.compile(r"\s+")

_STOPWORDS = frozenset(
    [
        "payment", "txn", "transaction", "ref", "reference",
        "neft", "imps", "upi", "rtgs", "from", "to", "by",
        "being", "towards", "for", "cr", "dr",
    ]
)


def normalize_reference(ref: str) -> str:
    """Upper-case, strip separators. Empty string if input is blank."""
    if not ref or not ref.strip():
        return ""
    return _REF_STRIP.sub("", ref).upper()


def normalize_description(desc: str) -> str:
    """
    Lower-case, remove punctuation, collapse whitespace, drop stopwords.
    Returns empty string if input is blank.
    """
    if not desc or not desc.strip():
        return ""
    s = desc.lower()
    s = _DESC_PUNCT.sub(" ", s)
    s = _DESC_SPACES.sub(" ", s).strip()
    tokens = [t for t in s.split() if t not in _STOPWORDS]
    return " ".join(tokens)
