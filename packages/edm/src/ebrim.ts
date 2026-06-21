import type { OidIdentifier } from "./types.js";

/**
 * Builder metadanych indeksu EDM (IHE XDS.b, ebRIM 3.0) dla ITI-42/ITI-57.
 * Produkuje `RegistryObjectList` z DocumentEntry (ExtrinsicObject) + SubmissionSet
 * (RegistryPackage) + Association (HasMember). Wzorowany na obiektach testowych P1.
 * Wartości na drucie (CX/XCN/XON, OID, kody słowników) zostają zgodne z P1.
 */

const RIM_NS = "urn:oasis:names:tc:ebxml-regrep:xsd:rim:3.0";

/** Stałe XDS: typy obiektów, schematy klasyfikacji, schematy identyfikatorów. */
export const XDS = {
  OBJECT_TYPE_EXTRINSIC: "urn:uuid:7edca82f-054d-47f2-a032-9b2a5b5186c1",
  OBJECT_TYPE_CLASSIFICATION:
    "urn:oasis:names:tc:ebxml-regrep:ObjectType:RegistryObject:Classification",
  OBJECT_TYPE_EXTERNAL_ID:
    "urn:oasis:names:tc:ebxml-regrep:ObjectType:RegistryObject:ExternalIdentifier",
  STATUS_APPROVED: "urn:oasis:names:tc:ebxml-regrep:StatusType:Approved",
  ASSOCIATION_HAS_MEMBER: "urn:oasis:names:tc:ebxml-regrep:AssociationType:HasMember",
  // SubmissionSet (RegistryPackage)
  SS_CLASSIFICATION_NODE: "urn:uuid:a54d6aa5-d40d-43f9-88c5-b4633d873bdd",
  SS_AUTHOR_SCHEME: "urn:uuid:a7058bb9-b4e4-4307-ba5b-e3f0ab85e12d",
  SS_CONTENT_TYPE_SCHEME: "urn:uuid:aa543740-bdda-424e-8c96-df4873be8500",
  SS_UNIQUE_ID_SCHEME: "urn:uuid:96fdda7c-d067-4183-912e-bf5ee74998a8",
  SS_SOURCE_ID_SCHEME: "urn:uuid:554ac39e-e3fe-47fe-b233-965d2a147832",
  SS_PATIENT_ID_SCHEME: "urn:uuid:6b5aea1a-874d-4603-a4bc-96a0a7b38446",
  // DocumentEntry (ExtrinsicObject)
  DE_AUTHOR_SCHEME: "urn:uuid:93606bcf-9494-43ec-9b4e-a7748d1a838d",
  DE_CLASS_CODE_SCHEME: "urn:uuid:41a5887f-8865-4c09-adf7-e362475b143a",
  DE_EVENT_CODE_SCHEME: "urn:uuid:2c6b8cb7-8b2a-4051-b291-b1ae6a575ef4",
  DE_CONFIDENTIALITY_SCHEME: "urn:uuid:f4f85eac-e6cb-4883-b524-f2705394840f",
  DE_FORMAT_CODE_SCHEME: "urn:uuid:a09d5840-386c-46f2-b5ad-9c3699a4309d",
  DE_FACILITY_TYPE_SCHEME: "urn:uuid:f33fb8ac-18af-42cc-ae0e-ed0b0bdb91e1",
  DE_PRACTICE_SETTING_SCHEME: "urn:uuid:cccf5598-8b07-4b77-a05e-ae952c785ead",
  DE_TYPE_CODE_SCHEME: "urn:uuid:f0306f51-975f-434e-a61c-c59651d33983",
  DE_PATIENT_ID_SCHEME: "urn:uuid:58a6f841-87b3-4a3e-92fd-a8ffeff98427",
  DE_UNIQUE_ID_SCHEME: "urn:uuid:2e82c1f6-a085-4c72-9da3-8640a32e42ab",
  // rozszerzenia PL
  SLOT_STORAGE_CATEGORY: "urn:extpl:SlotName:StorageCategory",
  SLOT_MEDICAL_EVENT_ID: "urn:extpl:SlotName:MedicalEventId",
  DOC_AVAILABILITY_ONLINE: "urn:ihe:iti:2010:DocumentAvailability:Online",
  ENCOUNTER_ID_TYPE: "urn:ihe:iti:xds:2015:encounterId",
} as const;

/** Kod w słowniku: wartość + nazwa słownika (codingScheme) + opis. */
export interface CodedValue {
  readonly code: string;
  readonly codingScheme: string;
  readonly displayName: string;
}

/** Osoba w formacie XCN (id^nazwisko^imię^^^prefiks^^^&OID&ISO). */
export interface XcnPerson {
  readonly id?: string;
  readonly familyName: string;
  readonly givenName: string;
  readonly prefix?: string;
  readonly assigningAuthorityOid?: string;
}

/** Autor dokumentu (klasyfikacja author). */
export interface DocumentAuthor {
  readonly person: XcnPerson;
  /** Instytucja XON (nazwa^^^^^&OID&ISO^^^^idExt). */
  readonly institution?: { name: string; oid: string; idExtension?: string };
  readonly role?: string;
  readonly specialty?: string;
  /** Telekomunikacja XTN, np. `^EMR^PH^^^^^^^^^693112233`. */
  readonly telecommunication?: string;
}

export interface SourcePatientInfo {
  readonly familyName: string;
  readonly givenName: string;
  /** Data urodzenia YYYYMMDD. */
  readonly birthDate?: string;
  /** Płeć M/K. */
  readonly gender?: string;
  readonly city?: string;
}

export interface DocumentEntryInput {
  /** Symboliczny id obiektu w wysyłce (urn:uuid:...). */
  readonly entryUuid: string;
  /** Logiczny id (grupuje wersje indeksu); pomijalny przy wersji inicjalnej. */
  readonly lid?: string;
  /** uniqueId dokumentu (root^extension) - nadawany przez usługodawcę. */
  readonly uniqueId: OidIdentifier;
  /** Identyfikator repozytorium (OID), w którym leży treść. */
  readonly repositoryUniqueId: string;
  readonly mimeType: string;
  /** SHA-1 treści (hex). */
  readonly hash: string;
  /** Rozmiar treści w bajtach. */
  readonly size: number;
  /** Data utworzenia dokumentu YYYYMMDDHHMMSS. */
  readonly creationTime: string;
  readonly languageCode?: string;
  /** Tytuł (Name). */
  readonly title?: string;
  readonly serviceStartTime?: string;
  readonly serviceStopTime?: string;
  /** Kategoria brakowania (KKM), np. "2020". */
  readonly storageCategory?: string;
  /** Powiązane zdarzenie medyczne (link EDM <-> ZM). */
  readonly medicalEvent?: { id: string; oid: string };
  /** Nazwa pliku/URI treści. */
  readonly uri?: string;
  /** Identyfikator pacjenta w systemie usługodawcy (CX) + dane (PID). */
  readonly sourcePatient: { id: string; oid: string; info: SourcePatientInfo };
  readonly legalAuthenticator?: XcnPerson;
  readonly author: DocumentAuthor;
  /** Typ dokumentu wg słownika P1 (classCode), np. {code:"06.10", scheme, name}. */
  readonly typeP1: CodedValue;
  /** Typ dokumentu wg LOINC (typeCode). */
  readonly typeLoinc: CodedValue;
  /** Poziom poufności (np. N). */
  readonly confidentiality: CodedValue;
  /** Format dokumentu (formatCode). */
  readonly format: CodedValue;
  /** Specjalność komórki (practiceSetting). */
  readonly practiceSetting?: CodedValue;
  /** Dziedzina medyczna usługodawcy (healthcareFacilityType). */
  readonly facilityType?: CodedValue;
  /** Identyfikator pacjenta w domenie XDS (CX), np. `id^^^&OID&ISO`. */
  readonly patientId: string;
}

export interface SubmissionSetInput {
  /** Symboliczny id wysyłki (urn:uuid:...). */
  readonly submissionUuid: string;
  readonly lid?: string;
  /** uniqueId wysyłki (root^extension). */
  readonly uniqueId: OidIdentifier;
  /** Identyfikator źródła wysyłki (OID). */
  readonly sourceId: string;
  /** Czas wysyłki YYYYMMDDHHMMSS. */
  readonly submissionTime: string;
  readonly title?: string;
  readonly author: DocumentAuthor;
  /** Identyfikator pacjenta w domenie XDS (CX). */
  readonly patientId: string;
  /** Charakter wysyłki (domyślnie REGISTER). */
  readonly contentTypeCode?: string;
  readonly contentTypeName?: string;
}

export interface DocumentIndexInput {
  readonly submissionSet: SubmissionSetInput;
  readonly document: DocumentEntryInput;
  /** Symboliczny id asocjacji SS->DE. */
  readonly associationId?: string;
}

const esc = (v: string): string =>
  v.replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[c] ?? c);

const slot = (name: string, ...values: string[]): string =>
  `<rim:Slot name="${name}"><rim:ValueList>` +
  values.map((v) => `<rim:Value>${v}</rim:Value>`).join("") +
  `</rim:ValueList></rim:Slot>`;

const localizedName = (value: string): string =>
  `<rim:Name><rim:LocalizedString value="${esc(value)}"/></rim:Name>`;

/** XCN: id^family^given^^^prefix^^^&OID&ISO. */
function xcn(p: XcnPerson): string {
  const auth = p.assigningAuthorityOid ? `&amp;${p.assigningAuthorityOid}&amp;ISO` : "";
  return `${p.id ?? ""}^${esc(p.familyName)}^${esc(p.givenName)}^^^${esc(p.prefix ?? "")}^^^${auth}`;
}

/** Klasyfikacja kodem ze słownika (nodeRepresentation + codingScheme + Name). */
function codedClassification(
  scheme: string,
  classifiedObject: string,
  id: string,
  coded: CodedValue,
): string {
  return (
    `<rim:Classification classifiedObject="${classifiedObject}"` +
    ` nodeRepresentation="${esc(coded.code)}" classificationScheme="${scheme}"` +
    ` objectType="${XDS.OBJECT_TYPE_CLASSIFICATION}" id="${id}">` +
    slot("codingScheme", esc(coded.codingScheme)) +
    localizedName(coded.displayName) +
    `</rim:Classification>`
  );
}

function externalIdentifier(
  scheme: string,
  registryObject: string,
  id: string,
  value: string,
  name: string,
): string {
  return (
    `<rim:ExternalIdentifier value="${esc(value)}" identificationScheme="${scheme}"` +
    ` objectType="${XDS.OBJECT_TYPE_EXTERNAL_ID}" id="${id}" registryObject="${registryObject}">` +
    localizedName(name) +
    `</rim:ExternalIdentifier>`
  );
}

function authorClassification(
  scheme: string,
  classifiedObject: string,
  id: string,
  author: DocumentAuthor,
): string {
  const institution = author.institution
    ? `${esc(author.institution.name)}^^^^^&amp;${author.institution.oid}&amp;ISO` +
      (author.institution.idExtension ? `^^^^${esc(author.institution.idExtension)}` : "")
    : "";
  return (
    `<rim:Classification classifiedObject="${classifiedObject}" nodeRepresentation=""` +
    ` classificationScheme="${scheme}" objectType="${XDS.OBJECT_TYPE_CLASSIFICATION}" id="${id}">` +
    slot("authorPerson", xcn(author.person)) +
    (author.institution ? slot("authorInstitution", institution) : "") +
    (author.role ? slot("authorRole", esc(author.role)) : "") +
    (author.specialty ? slot("authorSpecialty", esc(author.specialty)) : "") +
    (author.telecommunication
      ? slot("authorTelecommunication", esc(author.telecommunication))
      : "") +
    `</rim:Classification>`
  );
}

/** Buduje element ExtrinsicObject (DocumentEntry). */
function buildDocumentEntry(d: DocumentEntryInput): string {
  const obj = d.entryUuid;
  const pid = d.sourcePatient.info;
  const sourceInfo = [
    `PID-5|${esc(pid.familyName)}^${esc(pid.givenName)}^^^^^^`,
    ...(pid.birthDate ? [`PID-7|${pid.birthDate}`] : []),
    ...(pid.gender ? [`PID-8|${esc(pid.gender)}`] : []),
    ...(pid.city ? [`PID-11|${esc(pid.city)}`] : []),
  ];
  const medicalEvent = d.medicalEvent
    ? slot(
        XDS.SLOT_MEDICAL_EVENT_ID,
        `${esc(d.medicalEvent.id)}^^^&amp;${d.medicalEvent.oid}&amp;ISO^${XDS.ENCOUNTER_ID_TYPE}`,
      )
    : "";

  return (
    `<rim:ExtrinsicObject xmlns:rim="${RIM_NS}" id="${obj}"` +
    (d.lid ? ` lid="${d.lid}"` : "") +
    ` objectType="${XDS.OBJECT_TYPE_EXTRINSIC}" mimeType="${esc(d.mimeType)}"` +
    ` status="${XDS.STATUS_APPROVED}">` +
    slot("creationTime", d.creationTime) +
    slot("repositoryUniqueId", esc(d.repositoryUniqueId)) +
    slot("documentAvailability", XDS.DOC_AVAILABILITY_ONLINE) +
    slot("languageCode", esc(d.languageCode ?? "pl-PL")) +
    slot("size", String(d.size)) +
    slot("hash", esc(d.hash)) +
    (d.storageCategory ? slot(XDS.SLOT_STORAGE_CATEGORY, esc(d.storageCategory)) : "") +
    medicalEvent +
    (d.uri ? slot("URI", esc(d.uri)) : "") +
    (d.serviceStartTime ? slot("serviceStartTime", d.serviceStartTime) : "") +
    (d.serviceStopTime ? slot("serviceStopTime", d.serviceStopTime) : "") +
    slot("sourcePatientId", `${esc(d.sourcePatient.id)}^^^&amp;${d.sourcePatient.oid}&amp;ISO`) +
    slot("sourcePatientInfo", ...sourceInfo) +
    (d.legalAuthenticator ? slot("legalAuthenticator", xcn(d.legalAuthenticator)) : "") +
    localizedName(d.title ?? "Dokument") +
    `<rim:VersionInfo versionName="1"/>` +
    authorClassification(XDS.DE_AUTHOR_SCHEME, obj, `${obj}-cl-author`, d.author) +
    codedClassification(XDS.DE_CLASS_CODE_SCHEME, obj, `${obj}-cl-class`, d.typeP1) +
    codedClassification(XDS.DE_CONFIDENTIALITY_SCHEME, obj, `${obj}-cl-conf`, d.confidentiality) +
    codedClassification(XDS.DE_FORMAT_CODE_SCHEME, obj, `${obj}-cl-format`, d.format) +
    (d.practiceSetting
      ? codedClassification(
          XDS.DE_PRACTICE_SETTING_SCHEME,
          obj,
          `${obj}-cl-practice`,
          d.practiceSetting,
        )
      : "") +
    (d.facilityType
      ? codedClassification(XDS.DE_FACILITY_TYPE_SCHEME, obj, `${obj}-cl-facility`, d.facilityType)
      : "") +
    codedClassification(XDS.DE_TYPE_CODE_SCHEME, obj, `${obj}-cl-type`, d.typeLoinc) +
    externalIdentifier(
      XDS.DE_PATIENT_ID_SCHEME,
      obj,
      `${obj}-ei-patient`,
      d.patientId,
      "XDSDocumentEntry.patientId",
    ) +
    externalIdentifier(
      XDS.DE_UNIQUE_ID_SCHEME,
      obj,
      `${obj}-ei-unique`,
      `${d.uniqueId.root}^${d.uniqueId.extension}`,
      "XDSDocumentEntry.uniqueId",
    ) +
    `</rim:ExtrinsicObject>`
  );
}

/** Buduje element RegistryPackage (SubmissionSet) + jego klasyfikację typu. */
function buildSubmissionSet(s: SubmissionSetInput): string {
  const obj = s.submissionUuid;
  return (
    `<rim:RegistryPackage xmlns:rim="${RIM_NS}" id="${obj}"` +
    (s.lid ? ` lid="${s.lid}"` : "") +
    ` objectType="urn:oasis:names:tc:ebxml-regrep:ObjectType:RegistryObject:RegistryPackage"` +
    ` status="${XDS.STATUS_APPROVED}">` +
    slot("submissionTime", s.submissionTime) +
    localizedName(s.title ?? "Wysyłka EDM") +
    `<rim:VersionInfo versionName="1"/>` +
    authorClassification(XDS.SS_AUTHOR_SCHEME, obj, `${obj}-cl-author`, s.author) +
    `<rim:Classification classifiedObject="${obj}"` +
    ` nodeRepresentation="${esc(s.contentTypeCode ?? "REGISTER")}"` +
    ` classificationScheme="${XDS.SS_CONTENT_TYPE_SCHEME}"` +
    ` objectType="${XDS.OBJECT_TYPE_CLASSIFICATION}" id="${obj}-cl-content">` +
    slot("codingScheme", "Typ wysyłki") +
    localizedName(s.contentTypeName ?? "Rejestracja indeksu EDM") +
    `</rim:Classification>` +
    externalIdentifier(
      XDS.SS_UNIQUE_ID_SCHEME,
      obj,
      `${obj}-ei-unique`,
      `${s.uniqueId.root}^${s.uniqueId.extension}`,
      "XDSSubmissionSet.uniqueId",
    ) +
    externalIdentifier(
      XDS.SS_SOURCE_ID_SCHEME,
      obj,
      `${obj}-ei-source`,
      s.sourceId,
      "XDSSubmissionSet.sourceId",
    ) +
    externalIdentifier(
      XDS.SS_PATIENT_ID_SCHEME,
      obj,
      `${obj}-ei-patient`,
      s.patientId,
      "XDSSubmissionSet.patientId",
    ) +
    `</rim:RegistryPackage>` +
    `<rim:Classification xmlns:rim="${RIM_NS}" classifiedObject="${obj}"` +
    ` classificationNode="${XDS.SS_CLASSIFICATION_NODE}" id="${obj}-cl-ss"` +
    ` objectType="${XDS.OBJECT_TYPE_CLASSIFICATION}"/>`
  );
}

/** Asocjacja SubmissionSet -> DocumentEntry (HasMember, Original). */
function buildAssociation(input: DocumentIndexInput): string {
  const id = input.associationId ?? `${input.submissionSet.submissionUuid}-assoc`;
  return (
    `<rim:Association xmlns:rim="${RIM_NS}" associationType="${XDS.ASSOCIATION_HAS_MEMBER}"` +
    ` id="${id}" sourceObject="${input.submissionSet.submissionUuid}"` +
    ` targetObject="${input.document.entryUuid}">` +
    slot("SubmissionSetStatus", "Original") +
    `</rim:Association>`
  );
}

/**
 * Buduje `RegistryObjectList` (DocumentEntry + SubmissionSet + Association) -
 * wnętrze `SubmitObjectsRequest` dla ITI-42 (i ITI-57).
 */
export function buildRegistryObjectList(input: DocumentIndexInput): string {
  return (
    `<rim:RegistryObjectList xmlns:rim="${RIM_NS}">` +
    buildDocumentEntry(input.document) +
    buildSubmissionSet(input.submissionSet) +
    buildAssociation(input) +
    `</rim:RegistryObjectList>`
  );
}
