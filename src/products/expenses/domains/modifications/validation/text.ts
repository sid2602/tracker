export function normalizeText(text: string): string {
  return text
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[.,!?;:()[\]{}]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

export function hasTextEvidence(text: string, value: string): boolean {
  const textTokens = tokenize(text);
  const valueTokens = tokenize(value);

  return valueTokens.some((valueToken) => {
    if (valueToken.length < 3) {
      return false;
    }
    return textTokens.some(
      (textToken) =>
        textToken === valueToken ||
        stemToken(textToken) === stemToken(valueToken),
    );
  });
}

function tokenize(text: string): string[] {
  return text.toLocaleLowerCase().match(/\p{L}+/gu) ?? [];
}

function stemToken(token: string): string {
  const suffixes = [
    "ami",
    "owi",
    "owej",
    "ach",
    "em",
    "om",
    "ie",
    "ą",
    "ę",
    "a",
    "y",
    "i",
    "u",
    "e",
  ];

  for (const suffix of suffixes) {
    if (token.endsWith(suffix) && token.length - suffix.length >= 3) {
      return token.slice(0, -suffix.length);
    }
  }

  return token;
}
