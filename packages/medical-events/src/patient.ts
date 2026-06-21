/**
 * Builder zasobu FHIR Patient (profil PLPatient) dla Zdarzenia Medycznego.
 * Pacjenta rejestruje się/odszukuje przed zdarzeniem; jego id trafia do
 * `Encounter.subject.reference`.
 */

export const PL_PATIENT_PROFILE = "https://ezdrowie.gov.pl/fhir/StructureDefinition/PLPatient";
/** System identyfikatora PESEL. */
export const PL_PATIENT_PESEL = "urn:oid:2.16.840.1.113883.3.4424.1.1.616";
/** System lokalnego identyfikatora pacjenta (np. dla pacjenta bez PESEL). */
export const PL_PATIENT_LOCAL_ID = "urn:oid:2.16.840.1.113883.3.4424.1.7.1.616";
const CONFIDENTIALITY = "urn:oid:2.16.840.1.113883.3.4424.11.1.83";

export interface MedicalEventPatientInput {
  /** Identyfikator pacjenta: PESEL ({@link PL_PATIENT_PESEL}) lub lokalny/paszport. */
  identifier: { system: string; value: string };
  givenNames: string[];
  familyName: string;
  /** Płeć FHIR: "male" | "female" | "other" | "unknown". */
  gender: string;
  /** Data urodzenia YYYY-MM-DD. */
  birthDate: string;
  phone?: string;
  confidentialityCode?: string;
}

type Json = Record<string, unknown>;

/** Buduje zasób FHIR Patient (PLPatient). */
export function buildMedicalEventPatient(input: MedicalEventPatientInput): Json {
  const patient: Json = {
    resourceType: "Patient",
    meta: {
      profile: [PL_PATIENT_PROFILE],
      security: [{ system: CONFIDENTIALITY, code: input.confidentialityCode ?? "N" }],
    },
    identifier: [{ system: input.identifier.system, value: input.identifier.value }],
    name: [{ family: input.familyName, given: [...input.givenNames] }],
    gender: input.gender,
    birthDate: input.birthDate,
  };
  if (input.phone) patient["telecom"] = [{ system: "phone", value: input.phone }];
  return patient;
}

/** Mapuje płeć z notacji P1/CDA (M/F/UN) na kod FHIR. */
export function toFhirGender(gender: string): string {
  switch (gender.toUpperCase()) {
    case "M":
      return "male";
    case "F":
      return "female";
    default:
      return "unknown";
  }
}
