"""Shared deterministic startup relevance for public event providers."""

import re

DEFAULT_QUERIES = (
    "founder",
    "startup",
    "VC",
    "venture capital",
    "angel investor",
    "entrepreneur",
    "startup pitch",
    "demo day",
)
# Whole words avoid matches like "angel" in "Los Angeles".
STARTUP_TERMS = re.compile(
    r"\b(start[ -]?ups?|co[ -]?founders?|founders?|vc|vcs|venture(?: capital| fest)?|"
    r"angel invest(?:or|ors|ing|ment)|entrepreneurs?|entrepreneurship|"
    r"pitch(?:ing)? (?:night|competition|contest|event)|demo day|"
    r"seed fund(?:ing)?|accelerators?|incubators?)\b",
    re.IGNORECASE,
)


def startup_relevant(
    title: str,
    description: str | None,
    organizer: str | None = None,
    tags: list[str] | None = None,
) -> bool:
    headline = " ".join(
        filter(
            None,
            (
                title,
                organizer,
            ),
        )
    )
    if STARTUP_TERMS.search(headline) or any(
        STARTUP_TERMS.search(tag) for tag in tags or []
    ):
        return True
    # A speaker being "founder of X" does not make a medical talk or concert
    # a startup event. Require topic/audience evidence beyond that bio wording.
    description = re.sub(
        r"\b(?:co[ -]?)?founders?\s+(?:of|at)\b",
        "",
        description or "",
        flags=re.IGNORECASE,
    )
    # Singular job titles in an open-ended audience list are weak evidence.
    # Keep explicit startup topics and plural founder/entrepreneur audiences.
    description = re.sub(
        r"\b(?:founder|entrepreneur)\b", "", description, flags=re.IGNORECASE
    )
    return bool(STARTUP_TERMS.search(description))
