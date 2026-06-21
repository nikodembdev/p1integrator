/**
 * Pomocniki do przechodzenia sparsowanego Body SOAP (fast-xml-parser, bez prefiksów NS).
 * Współdzielone przez wysyłkę (klucze recept) i pobieranie (wyniki wyszukiwania/odczytu).
 */

/** Zbiera wszystkie wystąpienia obiektów spod klucza `key` (na dowolnej głębokości). */
export function collectRecords(node: unknown, key: string): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }
    if (value !== null && typeof value === "object") {
      const record = value as Record<string, unknown>;
      if (key in record) {
        const found = record[key];
        if (Array.isArray(found)) {
          for (const item of found) if (isRecord(item)) out.push(item);
        } else if (isRecord(found)) {
          out.push(found);
        }
      }
      for (const child of Object.values(record)) visit(child);
    }
  };
  visit(node);
  return out;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Pierwsza tekstowa wartość spod klucza `key` (przeszukuje drzewo wgłąb). */
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

/** Tekstowa wartość bezpośredniego pola obiektu (bez schodzenia głębiej). */
export function fieldText(record: Record<string, unknown>, key: string): string | undefined {
  return key in record ? coerce(record[key]) : undefined;
}

export function coerce(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    for (const item of value) {
      const text = coerce(item);
      if (text !== undefined) return text;
    }
    return undefined;
  }
  if (value !== null && typeof value === "object" && "#text" in value) {
    return coerce((value as Record<string, unknown>)["#text"]);
  }
  return undefined;
}
