const ASCII_REPLACEMENTS: Record<string, string> = {
  "\u2018": "'",
  "\u2019": "'",
  "\u201C": '"',
  "\u201D": '"',
  "\u2013": "-",
  "\u2014": "-",
  "\u2212": "-",
  "\u2192": "->",
  "\u2190": "<-",
  "\u21D2": "=>",
  "\u2022": "-",
  "\u00B7": "-",
  "\u2026": "...",
  "\u2713": "[x]",
  "\u2714": "[x]",
  "\u2717": "[ ]",
  "\u2718": "[ ]",
  "\u00A0": " ",
};

export function toAscii(text: string): string {
  let out = text;
  for (const [from, to] of Object.entries(ASCII_REPLACEMENTS)) out = out.split(from).join(to);
  return out.replace(/[^\x00-\x7F]/g, "");
}
