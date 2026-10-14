"""Normalise labels for comparison without interpreting user instructions."""
import unicodedata


def normalized(value: str) -> str:
    return "".join(character for character in unicodedata.normalize("NFKD", value.strip().casefold())
                   if not unicodedata.combining(character))
