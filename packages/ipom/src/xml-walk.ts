/** Pomocniki do przeszukiwania sparsowanej odpowiedzi SOAP (fast-xml-parser) po nazwach lokalnych. */

/** Zbiera wszystkie węzły o danym kluczu (płaska lista), niezależnie od zagnieżdżenia. */
export function collectRecords(node: unknown, key: string): unknown[] {
  const out: unknown[] = [];
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }
    if (value !== null && typeof value === "object") {
      const record = value as Record<string, unknown>;
      for (const [k, v] of Object.entries(record)) {
        if (k === key) {
          if (Array.isArray(v)) out.push(...(v as unknown[]));
          else out.push(v);
        } else {
          visit(v);
        }
      }
    }
  };
  visit(node);
  return out;
}

/** Znajduje pierwszą wartość tekstową pod danym kluczem (rekurencyjnie). */
export function findText(node: unknown, key: string): string | undefined {
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findText(item, key);
      if (found !== undefined) return found;
    }
    return undefined;
  }
  if (node !== null && typeof node === "object") {
    const record = node as Record<string, unknown>;
    if (key in record) return coerce(record[key]);
    for (const value of Object.values(record)) {
      const found = findText(value, key);
      if (found !== undefined) return found;
    }
  }
  return undefined;
}

/** Sprowadza wartość węzła do tekstu (obsługuje `#text`). */
export function coerce(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if ("#text" in record) return coerce(record["#text"]);
    for (const inner of Object.values(record)) {
      const found = coerce(inner);
      if (found !== undefined) return found;
    }
  }
  return undefined;
}

/** Pobiera bezpośrednią wartość pola `key` z rekordu (bez schodzenia głębiej w inne klucze). */
export function fieldText(node: unknown, key: string): string | undefined {
  if (node !== null && typeof node === "object" && !Array.isArray(node)) {
    const record = node as Record<string, unknown>;
    if (key in record) return coerce(record[key]);
  }
  return undefined;
}
