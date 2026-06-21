/**
 * Builder zasobu FHIR Encounter dla Zdarzenia Medycznego (profil PLMedicalEvent).
 * Referencje (pacjent, lekarz, podmiot, komórka, płatnik) wskazywane przez identyfikatory
 * biznesowe (OID + wartość), zgodnie z przykładami P1.
 */

/** Systemy kodowania / OID-y używane w Encounter ZM. */
export const ZM_SYSTEM = {
  PROFILE_MEDICAL_EVENT: "https://ezdrowie.gov.pl/fhir/StructureDefinition/PLMedicalEvent",
  CONFIDENTIALITY: "urn:oid:2.16.840.1.113883.3.4424.11.1.83",
  EVENT_TYPE: "urn:oid:2.16.840.1.113883.3.4424.11.1.34",
  PESEL: "urn:oid:2.16.840.1.113883.3.4424.1.1.616",
  NFZ_BRANCH: "urn:oid:2.16.840.1.113883.3.4424.3.1",
  NPWZ: "urn:oid:2.16.840.1.113883.3.4424.1.6.2",
  PROFESSION_ROLE: "urn:oid:2.16.840.1.113883.3.4424.11.1.80",
  CELL: "urn:oid:2.16.840.1.113883.3.4424.2.3.3",
  PROVIDER: "urn:oid:2.16.840.1.113883.3.4424.2.3.1",
  INSURANCE_EXTENSION: "https://ezdrowie.gov.pl/fhir/StructureDefinition/PLInsuranceReference",
  PAYOR_EXTENSION: "https://ezdrowie.gov.pl/fhir/StructureDefinition/PLPayorReference",
  FUNCTION_EXTENSION: "https://ezdrowie.gov.pl/fhir/StructureDefinition/PLFunction",
} as const;

export interface MedicalEventEncounterInput {
  /** System (urn:oid) identyfikatora zdarzenia. */
  identifierSystem: string;
  /** Wartość identyfikatora zdarzenia (UUID). */
  identifierValue: string;
  /** Status (domyślnie "finished"). */
  status?: string;
  /** Poziom poufności (domyślnie "N"). */
  confidentialityCode?: string;
  /** Typ zdarzenia (class): kod + nazwa (np. 4 / Porada). */
  type: { code: string; display: string };
  /** Pacjent: referencja do zasobu (Patient/{id}), PESEL + dane + oddział NFZ (ubezpieczenie). */
  patient: { reference: string; pesel: string; display: string; nfzBranch: string };
  /** Lekarz: NPWZ + dane + rola wykonawcy (kod, np. 11). */
  practitioner: { npwz: string; display: string; functionCode: string };
  /** Podmiot (serviceProvider) + płatnik. */
  organization: { identifier: string; payorBranch: string };
  /** Komórka organizacyjna (location): identyfikator {podmiot}-{res7}. */
  location: { identifier: string };
  /** Okres zdarzenia (ISO 8601 z offsetem). */
  period: { start: string; end?: string };
}

type Json = Record<string, unknown>;

/** Buduje zasób FHIR Encounter (PLMedicalEvent) dla zdarzenia typu porada/wizyta. */
export function buildMedicalEventEncounter(input: MedicalEventEncounterInput): Json {
  const period: Json = { start: input.period.start };
  if (input.period.end) period["end"] = input.period.end;

  return {
    resourceType: "Encounter",
    meta: {
      profile: [ZM_SYSTEM.PROFILE_MEDICAL_EVENT],
      security: [{ system: ZM_SYSTEM.CONFIDENTIALITY, code: input.confidentialityCode ?? "N" }],
    },
    identifier: [{ system: input.identifierSystem, value: input.identifierValue }],
    status: input.status ?? "finished",
    class: { system: ZM_SYSTEM.EVENT_TYPE, code: input.type.code, display: input.type.display },
    subject: {
      extension: [
        {
          url: ZM_SYSTEM.INSURANCE_EXTENSION,
          valueReference: {
            identifier: { system: ZM_SYSTEM.NFZ_BRANCH, value: input.patient.nfzBranch },
          },
        },
      ],
      reference: input.patient.reference,
      type: "Patient",
      identifier: { system: ZM_SYSTEM.PESEL, value: input.patient.pesel },
      display: input.patient.display,
    },
    participant: [
      {
        extension: [
          {
            url: ZM_SYSTEM.FUNCTION_EXTENSION,
            valueCoding: {
              system: ZM_SYSTEM.PROFESSION_ROLE,
              code: input.practitioner.functionCode,
            },
          },
        ],
        individual: {
          identifier: { system: ZM_SYSTEM.NPWZ, value: input.practitioner.npwz },
          display: input.practitioner.display,
        },
      },
    ],
    period,
    location: [
      {
        location: { identifier: { system: ZM_SYSTEM.CELL, value: input.location.identifier } },
        period,
      },
    ],
    serviceProvider: {
      extension: [
        {
          url: ZM_SYSTEM.PAYOR_EXTENSION,
          valueReference: {
            identifier: { system: ZM_SYSTEM.NFZ_BRANCH, value: input.organization.payorBranch },
          },
        },
      ],
      identifier: { system: ZM_SYSTEM.PROVIDER, value: input.organization.identifier },
    },
  };
}
