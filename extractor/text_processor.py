"""
Text processing module: Tokenization, Normalization, Stop Words, and Porter Stemmer.
Used for both document indexing and query preprocessing to ensure identical representations.
"""

import re
import unicodedata
from typing import List, Tuple, Dict

# Standard IR Stopwords list (NLTK / Lucene standard English stop words)
STOP_WORDS = {
    "a", "about", "above", "after", "again", "against", "all", "am", "an", "and", "any", "are", 
    "aren't", "as", "at", "be", "because", "been", "before", "being", "below", "between", "both", 
    "but", "by", "can", "cannot", "could", "couldn't", "did", "didn't", "do", "does", "doesn't", 
    "doing", "don't", "down", "during", "each", "few", "for", "from", "further", "had", "hadn't", 
    "has", "hasn't", "have", "haven't", "having", "he", "he'd", "he'll", "he's", "her", "here", 
    "here's", "hers", "herself", "him", "himself", "his", "how", "how's", "i", "i'd", "i'll", 
    "i'm", "i've", "if", "in", "into", "is", "isn't", "it", "it's", "its", "itself", "let's", 
    "me", "more", "most", "mustn't", "my", "myself", "no", "nor", "not", "of", "off", "on", 
    "once", "only", "or", "other", "ought", "our", "ours", "ourselves", "out", "over", "own", 
    "same", "shan't", "she", "she'd", "she'll", "she's", "should", "shouldn't", "so", "some", 
    "such", "than", "that", "that's", "the", "their", "theirs", "them", "themselves", "then", 
    "there", "there's", "these", "they", "they'd", "they'll", "they're", "they've", "this", 
    "those", "through", "to", "too", "under", "until", "up", "very", "was", "wasn't", "we", 
    "we'd", "we'll", "we're", "we've", "were", "weren't", "what", "what's", "when", "when's", 
    "where", "where's", "which", "while", "who", "who's", "whom", "why", "why's", "with", 
    "won't", "would", "wouldn't", "you", "you'd", "you'll", "you're", "you've", "your", "yours", 
    "yourself", "yourselves"
}


class PorterStemmer:
    """
    Standard Martin Porter 1980 Stemming Algorithm implementation.
    Transforms words into their morphological root (e.g. running -> run, connection -> connect).
    """

    def __init__(self):
        self.b = ""  # buffer for word to be stemmed
        self.k = 0
        self.k0 = 0
        self.j = 0  # a general offset into the string

    def _is_consonant(self, i: int) -> bool:
        c = self.b[i]
        if c in "aeiou":
            return False
        if c == "y":
            if i == self.k0:
                return True
            else:
                return not self._is_consonant(i - 1)
        return True

    def _measure(self) -> int:
        """Measure the number of consonant sequences between k0 and j."""
        n = 0
        i = self.k0
        while True:
            if i > self.j:
                return n
            if not self._is_consonant(i):
                break
            i += 1
        i += 1
        while True:
            while True:
                if i > self.j:
                    return n
                if self._is_consonant(i):
                    break
                i += 1
            i += 1
            n += 1
            while True:
                if i > self.j:
                    return n
                if not self._is_consonant(i):
                    break
                i += 1
            i += 1

    def _vowel_in_stem(self) -> bool:
        for i in range(self.k0, self.j + 1):
            if not self._is_consonant(i):
                return True
        return False

    def _double_consonant(self, i: int) -> bool:
        if i < self.k0 + 1:
            return False
        if self.b[i] != self.b[i - 1]:
            return False
        return self._is_consonant(i)

    def _cvc(self, i: int) -> bool:
        if i < self.k0 + 2 or not self._is_consonant(i) or self._is_consonant(i - 1) or not self._is_consonant(i - 2):
            return False
        ch = self.b[i]
        if ch in ("w", "x", "y"):
            return False
        return True

    def _ends(self, s: str) -> bool:
        length = len(s)
        o = self.k - length + 1
        if o < self.k0:
            return False
        for i in range(length):
            if self.b[o + i] != s[i]:
                return False
        self.j = self.k - length
        return True

    def _set_to(self, s: str):
        length = len(s)
        o = self.j + 1
        self.b = self.b[:o] + s + self.b[o + length:]
        self.k = self.j + length

    def _replace_m(self, s: str):
        if self._measure() > 0:
            self._set_to(s)

    def _step1ab(self):
        if self.b[self.k] == 's':
            if self._ends("sses"):
                self.k -= 2
            elif self._ends("ies"):
                self._set_to("i")
            elif self.b[self.k - 1] != 's':
                self.k -= 1
        if self._ends("eed"):
            if self._measure() > 0:
                self.k -= 1
        elif (self._ends("ed") or self._ends("ing")) and self._vowel_in_stem():
            self.k = self.j
            if self._ends("at"):
                self._set_to("ate")
            elif self._ends("bl"):
                self._set_to("ble")
            elif self._ends("iz"):
                self._set_to("ize")
            elif self._double_consonant(self.k):
                self.k -= 1
                ch = self.b[self.k]
                if ch in ('l', 's', 'z'):
                    self.k += 1
            elif self._measure() == 1 and self._cvc(self.k):
                self._set_to("e")

    def _step1c(self):
        if self._ends("y") and self._vowel_in_stem():
            self.b = self.b[:self.k] + 'i' + self.b[self.k + 1:]

    def _step2(self):
        if self.k <= self.k0 + 1:
            return
        ch = self.b[self.k - 1]
        if ch == 'a':
            if self._ends("ational"): self._replace_m("ate")
            elif self._ends("tional"): self._replace_m("tion")
        elif ch == 'c':
            if self._ends("enci"): self._replace_m("ence")
            elif self._ends("anci"): self._replace_m("ance")
        elif ch == 'e':
            if self._ends("izer"): self._replace_m("ize")
        elif ch == 'l':
            if self._ends("bli"): self._replace_m("ble")
            elif self._ends("alli"): self._replace_m("al")
            elif self._ends("entli"): self._replace_m("ent")
            elif self._ends("eli"): self._replace_m("e")
            elif self._ends("ousli"): self._replace_m("ous")
        elif ch == 'o':
            if self._ends("ization"): self._replace_m("ize")
            elif self._ends("ation"): self._replace_m("ate")
            elif self._ends("ator"): self._replace_m("ate")
        elif ch == 's':
            if self._ends("alism"): self._replace_m("al")
            elif self._ends("iveness"): self._replace_m("ive")
            elif self._ends("fulness"): self._replace_m("ful")
            elif self._ends("ousness"): self._replace_m("ous")
        elif ch == 't':
            if self._ends("aliti"): self._replace_m("al")
            elif self._ends("iviti"): self._replace_m("ive")
            elif self._ends("biliti"): self._replace_m("ble")
        elif ch == 'g':
            if self._ends("logi"): self._replace_m("log")

    def _step3(self):
        if self.k <= self.k0:
            return
        ch = self.b[self.k]
        if ch == 'e':
            if self._ends("icate"): self._replace_m("ic")
            elif self._ends("ative"): self._replace_m("")
            elif self._ends("alize"): self._replace_m("al")
        elif ch == 'i':
            if self._ends("iciti"): self._replace_m("ic")
        elif ch == 'l':
            if self._ends("ical"): self._replace_m("ic")
            elif self._ends("ful"): self._replace_m("")
        elif ch == 's':
            if self._ends("ness"): self._replace_m("")

    def _step4(self):
        if self.k <= self.k0 + 1:
            return
        ch = self.b[self.k - 1]
        suffixes = {
            'a': ["al"],
            'c': ["ance", "ence"],
            'e': ["er"],
            'i': ["ic"],
            'l': ["able", "ible"],
            'n': ["ant", "ement", "ment", "ent"],
            'o': ["ion"],
            's': ["ism"],
            't': ["ate", "iti"],
            'u': ["ous"],
            'v': ["ive"],
            'z': ["ize"],
        }
        if ch in suffixes:
            for s in suffixes[ch]:
                if self._ends(s):
                    if s == "ion":
                        if self.j >= self.k0 and self.b[self.j] in ("s", "t") and self._measure() > 1:
                            self.k = self.j
                    elif self._measure() > 1:
                        self.k = self.j
                    break

    def _step5(self):
        self.j = self.k
        if self.b[self.k] == 'e':
            a = self._measure()
            if a > 1 or (a == 1 and not self._cvc(self.k - 1)):
                self.k -= 1
        if self.b[self.k] == 'l' and self._double_consonant(self.k) and self._measure() > 1:
            self.k -= 1

    def stem(self, word: str) -> str:
        word = word.lower()
        if len(word) <= 2:
            return word
        self.b = word
        self.k = len(word) - 1
        self.k0 = 0
        self._step1ab()
        self._step1c()
        self._step2()
        self._step3()
        self._step4()
        self._step5()
        return self.b[:self.k + 1]


_stemmer = PorterStemmer()
_token_pattern = re.compile(r"[a-zA-Z0-9]+(?:'[a-zA-Z]+)?")


def normalize_text(text: str) -> str:
    """Normalize unicode characters to ASCII compatible NFKD."""
    if not text:
        return ""
    text = unicodedata.normalize("NFKD", text)
    return "".join(c for c in text if not unicodedata.combining(c))


def tokenize(text: str) -> List[str]:
    """Extract word tokens from text."""
    normalized = normalize_text(text).lower()
    return _token_pattern.findall(normalized)


def process_text(text: str, stem: bool = True, remove_stops: bool = True) -> List[str]:
    """Full text processing pipeline: tokenize -> stop-word filter -> stem."""
    tokens = tokenize(text)
    processed = []
    for token in tokens:
        if remove_stops and token in STOP_WORDS:
            continue
        if len(token) < 2 or len(token) > 40:
            continue
        if stem:
            token = _stemmer.stem(token)
        processed.append(token)
    return processed


def process_with_positions(text: str, stem: bool = True, remove_stops: bool = True) -> List[Tuple[str, int]]:
    """Process text and return list of (stemmed_token, word_position) for phrase and proximity searches."""
    tokens = tokenize(text)
    result = []
    for pos, token in enumerate(tokens):
        if remove_stops and token in STOP_WORDS:
            continue
        if len(token) < 2 or len(token) > 40:
            continue
        term = _stemmer.stem(token) if stem else token
        result.append((term, pos))
    return result


def compute_term_frequencies(tokens: List[str]) -> Dict[str, int]:
    """Compute raw term frequency counts for a list of tokens."""
    counts = {}
    for t in tokens:
        counts[t] = counts.get(t, 0) + 1
    return counts

