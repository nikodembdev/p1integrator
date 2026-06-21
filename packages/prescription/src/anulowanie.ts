import { create } from "xmlbuilder2";
import { CDA_OID, formatCdaDateTime, type XmlObject } from "@p1/cda";
import { PRESCRIPTION_DOC_TEMPLATE } from "./constants.js";
import type {
  PrescriptionAuthor,
  PrescriptionLegalAuthenticator,
  PrescriptionPatient,
  PrescriptionType,
} from "./types.js";

/** Szablony dokumentu anulującego (IHE Nullification .1.14, CDA PL 1.3.2). */
const CANCELLATION_TEMPLATE = {
  DOC: "2.16.840.1.113883.3.4424.13.10.1.14",
  RECORD_TARGET: "2.16.840.1.113883.3.4424.13.10.2.3",
  AUTHOR: "2.16.840.1.113883.3.4424.13.10.2.4",
  PERSON: "2.16.840.1.113883.3.4424.13.10.2.1",
  ORGANIZATION_UNIT: "2.16.840.1.113883.3.4424.13.10.2.17",
  CUSTODIAN: "2.16.840.1.113883.3.4424.13.10.2.5",
  LEGAL_AUTHENTICATOR: "2.16.840.1.113883.3.4424.13.10.2.6",
  NFZ_PARTICIPANT: "2.16.840.1.113883.3.4424.13.10.2.19",
  RELATED_DOCUMENT: "2.16.840.1.113883.3.4424.13.10.2.46",
  COMPONENT: "2.16.840.1.113883.3.4424.13.10.2.47",
  SECTION: "2.16.840.1.113883.3.4424.13.10.3.27",
} as const;

const CANCELLATION_CODE = "51851-4";
const CANCELLATION_TRANSLATION = "08.80";

/** Odniesienie do anulowanej recepty (z wystawienia). */
export interface CancelledPrescriptionRef {
  /** Numer anulowanej recepty (id @extension oryginału). */
  prescriptionNumber: string;
  /** Identyfikator zbioru wersji oryginału (setId) - dzielony przez dokument anulujący. */
  versionSetId: { root: string; extension: string };
  /** Numer wersji oryginału (domyślnie 1); anulowanie = +1. */
  versionNumber?: number;
  /** Tytuł anulowanego dokumentu do narracji (domyślnie „Recepta"). */
  title?: string;
  /** Data wystawienia anulowanej recepty (DD.MM.RRRR) do narracji. */
  issuedDate?: string;
}

export interface PrescriptionCancellationInput {
  /** Węzeł OID usługodawcy (jak przy wystawieniu recepty). */
  localRoot: string;
  /** Numer dokumentu anulującego (id @extension); generowany, jeśli pominięty. */
  cancellationNumber: string;
  /** Rodzaj recepty (ZW/PA/PF) - wpływa na dane autora. */
  prescriptionType?: PrescriptionType;
  effectiveDate?: string;
  now?: Date;
  cancelled: CancelledPrescriptionRef;
  patient: PrescriptionPatient;
  author: PrescriptionAuthor;
  /** Specjalność autora (np. „0718"/„neurologia") - wymagana przez szablon .2.4. */
  authorSpecialtyCode?: string;
  authorSpecialtyName?: string;
  legalAuthenticator: PrescriptionLegalAuthenticator;
  /** Oddział NFZ (participant .2.19). */
  nfzBranch: string;
}

export interface PrescriptionCancellationResult {
  xml: string;
  cancellationNumber: string;
  effectiveDate: string;
}

/**
 * Builder dokumentu anulującego receptę (IHE Nullification .1.14, CDA PL 1.3.2).
 * Odwzorowuje oficjalny wzorzec „anulowanie-recepty". Dokument zastępuje oryginał
 * (relatedDocument RPLC: dzieli setId, versionNumber = oryginał + 1).
 */
export function buildPrescriptionCancellationCda(
  input: PrescriptionCancellationInput,
): PrescriptionCancellationResult {
  const effectiveDate = input.effectiveDate ?? formatCdaDateTime(input.now ?? new Date());
  const parentVersion = input.cancelled.versionNumber ?? 1;

  const root = create({ version: "1.0", encoding: "UTF-8" });
  root.ins("xml-stylesheet", 'href="CDA_PL_IG_1.3.2.xsl" type="text/xsl"');
  const clinicalDocument = root.ele("ClinicalDocument", {
    "xsi:type": "extPL:ClinicalDocument",
    xmlns: "urn:hl7-org:v3",
    "xmlns:extPL": "http://www.csioz.gov.pl/xsd/extPL/r3",
    "xmlns:pharm": "urn:ihe:pharm",
    "xmlns:xsi": "http://www.w3.org/2001/XMLSchema-instance",
  });

  clinicalDocument.ele({
    typeId: { "@extension": "POCD_HD000040", "@root": CDA_OID.HL7_TYPE_ID },
    templateId: [
      { "@root": PRESCRIPTION_DOC_TEMPLATE.IHE_MEDICAL_DOCUMENT },
      { "@root": PRESCRIPTION_DOC_TEMPLATE.IHE_PRESCRIPTION },
      { "@root": CANCELLATION_TEMPLATE.DOC, "@extension": "1.3.2" },
    ],
    id: {
      "@extension": input.cancellationNumber,
      "@root": `${input.localRoot}.2.9`,
      "@displayable": "true",
    },
    code: {
      "@code": CANCELLATION_CODE,
      "@codeSystem": CDA_OID.LOINC,
      "@codeSystemName": "LOINC",
      "@displayName": "Administrative note",
      translation: {
        "@code": CANCELLATION_TRANSLATION,
        "@codeSystem": CDA_OID.DOC_CLASS_P1,
        "@codeSystemName": "KLAS_DOK_P1",
        "@displayName": "Dokument anulujący",
      },
    },
    title: "Dokument anulujący",
    effectiveTime: { "@value": effectiveDate },
    confidentialityCode: { "@code": "N", "@codeSystem": CDA_OID.HL7_CONFIDENTIALITY },
    languageCode: { "@code": "pl-PL" },
    setId: {
      "@extension": input.cancelled.versionSetId.extension,
      "@root": input.cancelled.versionSetId.root,
    },
    versionNumber: { "@value": String(parentVersion + 1) },
    recordTarget: buildRecordTarget(input),
    author: buildAuthor(input, effectiveDate),
    custodian: buildCustodian(),
    legalAuthenticator: buildLegalAuthenticator(input.legalAuthenticator, effectiveDate),
    participant: {
      "@typeCode": "IND",
      templateId: { "@root": CANCELLATION_TEMPLATE.NFZ_PARTICIPANT },
      associatedEntity: {
        "@classCode": "UNDWRT",
        id: { "@extension": input.nfzBranch, "@root": CDA_OID.NFZ_BRANCH, "@displayable": "true" },
      },
    },
    relatedDocument: {
      "@typeCode": "RPLC",
      templateId: { "@root": CANCELLATION_TEMPLATE.RELATED_DOCUMENT },
      parentDocument: {
        id: {
          "@extension": input.cancelled.prescriptionNumber,
          "@root": `${input.localRoot}.2.1`,
          "@displayable": "false",
        },
        setId: {
          "@extension": input.cancelled.versionSetId.extension,
          "@root": input.cancelled.versionSetId.root,
        },
        versionNumber: { "@value": String(parentVersion) },
      },
    },
  });

  const component = clinicalDocument.ele("component");
  component.ele("templateId", { root: CANCELLATION_TEMPLATE.COMPONENT });
  const structuredBody = component.ele("structuredBody");
  structuredBody.ele({ component: { section: buildCancelledInfoSection(input) } });

  return {
    xml: root.end({ prettyPrint: true }),
    cancellationNumber: input.cancellationNumber,
    effectiveDate,
  };
}

function buildRecordTarget(input: PrescriptionCancellationInput): XmlObject {
  const { patient } = input;
  const a = patient.address;
  const addr: XmlObject = { city: a.city, postalCode: a.postalCode };
  if (a.street) addr.streetName = a.street;
  addr.houseNumber = a.houseNumber;
  if (a.unitId) addr.unitID = a.unitId;

  const person: XmlObject = {
    name: { given: [...patient.givenNames], family: patient.familyName },
  };
  if (patient.gender) {
    person.administrativeGenderCode = {
      "@code": patient.gender,
      "@codeSystem": CDA_OID.HL7_GENDER,
    };
  }
  person.birthTime = { "@value": patient.birthDate };

  return {
    templateId: { "@root": CANCELLATION_TEMPLATE.RECORD_TARGET },
    patientRole: {
      id: [
        {
          "@extension": patient.internalId ?? "12345",
          "@root": `${input.localRoot}.17.1`,
          "@displayable": "false",
        },
        { "@extension": patient.pesel, "@root": CDA_OID.PESEL, "@displayable": "true" },
      ],
      addr,
      patient: person,
    },
  };
}

function buildAuthor(input: PrescriptionCancellationInput, effectiveDate: string): XmlObject {
  const { author } = input;
  const assignedAuthor: XmlObject = {
    id: { "@extension": author.npwz, "@root": CDA_OID.NPWZ, "@displayable": "false" },
  };
  if (input.authorSpecialtyCode) {
    assignedAuthor.code = {
      "@code": input.authorSpecialtyCode,
      "@codeSystem": "2.16.840.1.113883.3.4424.11.3.3.1",
      "@displayName": input.authorSpecialtyName ?? input.authorSpecialtyCode,
    };
  }

  const assignedPerson: XmlObject = {
    templateId: { "@root": CANCELLATION_TEMPLATE.PERSON },
    name: {
      prefix: author.prefix ?? "lek.",
      given: [...author.givenNames],
      family: author.familyName,
    },
  };

  if (input.prescriptionType === "PA" || input.prescriptionType === "PF") {
    if (!author.address || !author.phone) {
      throw new Error("Anulowanie pro auctore/familiae wymaga adresu i telefonu autora");
    }
    assignedAuthor.addr = {
      postalCode: author.address.postalCode,
      city: author.address.city,
      streetName: author.address.street,
      houseNumber: author.address.houseNumber,
    };
    assignedAuthor.telecom = { "@value": `tel:${author.phone}` };
    assignedAuthor.assignedPerson = assignedPerson;
  } else {
    const org = author.organization;
    if (!org) throw new Error("Anulowanie recepty zwykłej wymaga danych organizacji autora");
    assignedAuthor.assignedPerson = assignedPerson;
    assignedAuthor.representedOrganization = {
      templateId: { "@root": CANCELLATION_TEMPLATE.ORGANIZATION_UNIT },
      id: {
        "@extension": `${org.podmiotExt}-001`,
        "@root": "2.16.840.1.113883.3.4424.2.3.2",
        "@displayable": "true",
      },
      name: org.name,
      telecom: { "@use": "PUB", "@value": `tel:${org.phone}` },
      addr: {
        postalCode: org.address.postalCode,
        city: org.address.city,
        streetName: org.address.street,
        houseNumber: org.address.houseNumber,
      },
      asOrganizationPartOf: {
        wholeOrganization: {
          id: {
            "@extension": org.regon14,
            "@root": "2.16.840.1.113883.3.4424.2.2.2",
            "@displayable": "true",
          },
          asOrganizationPartOf: {
            wholeOrganization: {
              id: {
                "@extension": org.podmiotExt,
                "@root": "2.16.840.1.113883.3.4424.2.3.1",
                "@displayable": "true",
              },
            },
          },
        },
      },
    };
  }

  return {
    templateId: { "@root": CANCELLATION_TEMPLATE.AUTHOR },
    functionCode: {
      "@code": "LEK",
      "@codeSystem": CDA_OID.FUNCTION_CODES,
      "@displayName": "Lekarz",
    },
    time: { "@value": author.time ?? effectiveDate },
    assignedAuthor,
  };
}

function buildCustodian(): XmlObject {
  return {
    templateId: { "@root": CANCELLATION_TEMPLATE.CUSTODIAN },
    assignedCustodian: {
      representedCustodianOrganization: {
        id: { "@root": CDA_OID.CSIOZ, "@assigningAuthorityName": "CSIOZ", "@displayable": "false" },
      },
    },
  };
}

function buildLegalAuthenticator(
  la: PrescriptionLegalAuthenticator,
  effectiveDate: string,
): XmlObject {
  return {
    templateId: { "@root": CANCELLATION_TEMPLATE.LEGAL_AUTHENTICATOR },
    time: { "@value": la.time ?? effectiveDate },
    signatureCode: { "@code": "S" },
    assignedEntity: {
      id: { "@extension": la.npwz, "@root": CDA_OID.NPWZ, "@displayable": "false" },
      code: { "@code": "LEK", "@codeSystem": CDA_OID.FUNCTION_CODES, "@displayName": "Lekarz" },
    },
  };
}

function buildCancelledInfoSection(input: PrescriptionCancellationInput): XmlObject {
  const c = input.cancelled;
  const paragraphs: XmlObject[] = [{ "#": "Proszę o anulowanie dokumentu:" }];
  paragraphs.push({ caption: "Tytuł:", "#": ` ${c.title ?? "Recepta"}` });
  if (c.issuedDate) paragraphs.push({ caption: "Data wystawienia:", "#": ` ${c.issuedDate}` });
  paragraphs.push({ caption: "Identyfikator:", "#": ` ${c.prescriptionNumber}` });

  return {
    templateId: { "@root": CANCELLATION_TEMPLATE.SECTION },
    title: "Dane dokumentu anulowanego",
    text: { paragraph: paragraphs },
  };
}
