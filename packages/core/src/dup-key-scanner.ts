/**
 * Scans raw JSON text for a duplicate object key, WITHOUT calling JSON.parse
 * (which silently keeps only the last value for a duplicate key and hides
 * the collision entirely). This is a deliberate, minimal tokenizer: it only
 * needs to notice "this object already saw this key", not fully validate
 * JSON syntax. Genuine syntax errors are left for JSON.parse to report as
 * 'malformed-json' afterwards, so on anything this scanner cannot make sense
 * of it simply gives up and reports "no duplicate found" rather than
 * throwing or guessing.
 */
export function hasDuplicateKey(text: string): boolean {
  let i = 0;
  const n = text.length;

  interface Frame {
    isObject: boolean;
    keys: Set<string> | null;
    expectKey: boolean;
  }
  const stack: Frame[] = [];

  function isWs(ch: string): boolean {
    return ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r';
  }

  function skipWs(): void {
    while (i < n && isWs(text[i]!)) i++;
  }

  /** Reads a JSON string starting at text[i] === '"'. Returns its content, or null if unterminated. */
  function readString(): string | null {
    i++; // consume opening quote
    let out = '';
    while (i < n) {
      const c = text[i]!;
      if (c === '\') {
        const esc = text[i + 1];
        if (esc === undefined) return null;
        if (esc === 'u') {
          out += text.slice(i, i + 6);
          i += 6;
        } else {
          out += text.slice(i, i + 2);
          i += 2;
        }
        continue;
      }
      if (c === '"') {
        i++;
        return out;
      }
      out += c;
      i++;
    }
    return null; // ran off the end: unterminated string
  }

  try {
    while (i < n) {
      skipWs();
      if (i >= n) break;
      const c = text[i]!;

      if (c === '{') {
        stack.push({ isObject: true, keys: new Set<string>(), expectKey: true });
        i++;
        continue;
      }
      if (c === '[') {
        stack.push({ isObject: false, keys: null, expectKey: false });
        i++;
        continue;
      }
      if (c === '}' || c === ']') {
        stack.pop();
        i++;
        continue;
      }
      if (c === '"') {
        const top = stack[stack.length - 1];
        const isKeyPosition = !!top && top.isObject && top.expectKey;
        const str = readString();
        if (str === null) return false; // malformed; let JSON.parse report it
        if (isKeyPosition && top) {
          if (top.keys!.has(str)) return true;
          top.keys!.add(str);
          top.expectKey = false;
        }
        continue;
      }
      if (c === ':') {
        i++;
        continue;
      }
      if (c === ',') {
        const top = stack[stack.length - 1];
        if (top && top.isObject) top.expectKey = true;
        i++;
        continue;
      }
      // A bare value token (number, true, false, null): skip to the next delimiter.
      if (/[0-9\-tfn]/.test(c)) {
        while (i < n && !isWs(text[i]!) && text[i] !== ',' && text[i] !== '}' && text[i] !== ']') i++;
        continue;
      }
      // Unrecognised character; advance to avoid looping forever on malformed input.
      i++;
    }
  } catch {
    return false;
  }

  return false;
}
