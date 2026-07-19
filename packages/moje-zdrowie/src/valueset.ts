import { map, type P1Error, type Result } from "@p1/core";
import { serializeQuery, type SgoaClient } from "./client.js";
import { asArray, asObject, asString } from "./fhir.js";

/** Pozycja słownika po rozwinięciu ValueSet. */
export interface ValueSetEntry {
  readonly system?: string;
  readonly code?: string;
  readonly display?: string;
}

/**
 * Rozwija słownik operacją `GET /ValueSet/{id}/$expand` (z opcjonalnym
 * filtrowaniem i stronicowaniem) - np. słowniki PLSGOA* (statusy, kanały,
 * rodzaje badań).
 */
export async function expandValueSet(
  client: SgoaClient,
  id: string,
  params: { readonly filter?: string; readonly count?: number; readonly offset?: number } = {},
): Promise<Result<readonly ValueSetEntry[], P1Error>> {
  const qs = serializeQuery({
    filter: params.filter,
    count: params.count !== undefined ? String(params.count) : undefined,
    offset: params.offset !== undefined ? String(params.offset) : undefined,
  });
  const result = await client.get(`ValueSet/${id}/$expand${qs ? `?${qs}` : ""}`);
  return map(result, (resource) => {
    const contains = asArray(asObject(asObject(resource)?.["expansion"])?.["contains"]);
    return contains.map(asObject).map((entry) => {
      const system = asString(entry?.["system"]);
      const code = asString(entry?.["code"]);
      const display = asString(entry?.["display"]);
      return {
        ...(system !== undefined ? { system } : {}),
        ...(code !== undefined ? { code } : {}),
        ...(display !== undefined ? { display } : {}),
      };
    });
  });
}
