import { SGOA_EXT, SGOA_PESEL_SYSTEM } from "./constants.js";
import type { ModificationHistoryEntry } from "./types.js";

/**
 * Wspólne helpery do czytania zasobów FHIR SGO-A (extensions, identyfikatory).
 * Zasoby traktujemy jako `unknown` i czytamy defensywnie - serwer może dokładać
 * pola, a parser nie powinien się na tym wywracać.
 */

export type FhirObject = Record<string, unknown>;

export function asObject(value: unknown): FhirObject | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as FhirObject)
    : undefined;
}

export function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export function asNumber(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

export function asBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

/** Wszystkie rozszerzenia o danym URL z `element.extension`. */
export function extensions(element: unknown, url: string): FhirObject[] {
  const obj = asObject(element);
  if (!obj) return [];
  return asArray(obj["extension"])
    .map(asObject)
    .filter((ext): ext is FhirObject => ext !== undefined && ext["url"] === url);
}

/** Pierwsze rozszerzenie o danym URL. */
export function extension(element: unknown, url: string): FhirObject | undefined {
  return extensions(element, url)[0];
}

/** Wartość prosta rozszerzenia (`value[x]` - pierwszy klucz `value*`). */
export function extensionValue(element: unknown, url: string): unknown {
  const ext = extension(element, url);
  if (!ext) return undefined;
  const key = Object.keys(ext).find((k) => k.startsWith("value"));
  return key !== undefined ? ext[key] : undefined;
}

/** PESEL z `subject.identifier` (system SGO-A). */
export function subjectPesel(resource: unknown): string | undefined {
  const identifier = asObject(asObject(asObject(resource)?.["subject"])?.["identifier"]);
  if (!identifier) return undefined;
  return identifier["system"] === SGOA_PESEL_SYSTEM ? asString(identifier["value"]) : undefined;
}

/** Historia modyfikacji z extension PLSGOAModificationHistory (wpisy `entry`). */
export function modificationHistory(resource: unknown): ModificationHistoryEntry[] {
  const history = extension(resource, SGOA_EXT.MODIFICATION_HISTORY);
  if (!history) return [];
  return asArray(history["extension"])
    .map(asObject)
    .filter((entry): entry is FhirObject => entry !== undefined && entry["url"] === "entry")
    .map((entry) => {
      const field = (url: string): unknown => {
        const ext = asArray(entry["extension"])
          .map(asObject)
          .find((e) => e?.["url"] === url);
        if (!ext) return undefined;
        const key = Object.keys(ext).find((k) => k.startsWith("value"));
        return key !== undefined ? ext[key] : undefined;
      };
      const location = asObject(field("locationId"));
      return {
        ...(asString(field("channel")) !== undefined
          ? { channel: asString(field("channel")) }
          : {}),
        ...(asString(field("type")) !== undefined ? { type: asString(field("type")) } : {}),
        ...(asString(field("version")) !== undefined
          ? { version: asString(field("version")) }
          : {}),
        ...(asString(field("date")) !== undefined ? { date: asString(field("date")) } : {}),
        ...(location
          ? {
              locationId: {
                ...(asString(location["system"]) !== undefined
                  ? { system: asString(location["system"]) }
                  : {}),
                ...(asString(location["value"]) !== undefined
                  ? { value: asString(location["value"]) }
                  : {}),
              },
            }
          : {}),
      } as ModificationHistoryEntry;
    });
}
