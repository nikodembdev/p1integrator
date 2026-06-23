import { create } from "xmlbuilder2";
import {
  type CdaAuthor,
  type CdaAuthorOrganization,
  CDA_OID,
  type CdaLegalAuthenticator,
  type CdaPatient,
  formatCdaDateTime,
  generateDocumentId,
  type XmlObject,
} from "@p1/cda";
import { IPOM_ID_SEGMENT, IPOM_SETID_SEGMENT } from "./constants.js";

/** Szablony generycznego dokumentu anulującego (IHE Nullification .1.14, CDA PL 1.3.2). */
const CANCELLATION_TEMPLATE = {
  IHE_MEDICAL_DOCUMENT: "1.3.6.1.4.1.19376.1.9.1.1.1",
  IHE_MEDICAL_DOCUMENT_2: "1.3.6.1.4.1.19376.1.5.3.1.1.1",
  DOC: "2.16.840.1.113883.3.4424.13.10.1.14",
  RECORD_TARGET: "2.16.840.1.113883.3.4424.13.10.2.3",
  AUTHOR: "2.16.840.1.113883.3.4424.13.10.2.4",
  PERSON: "2.16.840.1.113883.3.4424.13.10.2.1",
  REPRESENTED_ORGANIZATION: "2.16.840.1.113883.3.4424.13.10.2.17",
  WHOLE_ORGANIZATION: "2.16.840.1.113883.3.4424.13.10.2.14",
  CUSTODIAN: "2.16.840.1.113883.3.4424.13.10.2.5",
  LEGAL_AUTHENTICATOR: "2.16.840.1.113883.3.4424.13.10.2.6",
  NFZ_PARTICIPANT: "2.16.840.1.113883.3.4424.13.10.2.19",
  RELATED_DOCUMENT: "2.16.840.1.113883.3.4424.13.10.2.46",
  COMPONENT: "2.16.840.1.113883.3.4424.13.10.2.47",
  SECTION: "2.16.840.1.113883.3.4424.13.10.3.27",
} as const;

const CANCELLATION_CODE = "51851-4";
const CANCELLATION_TRANSLATION = "08.80";
const AUTHOR_SPECIALTY_OID = "2.16.840.1.113883.3.4424.11.3.3.1";

/** Odniesienie do anulowanego planu opieki medycznej (z wystawienia). */
export interface CancelledIpomRef {
  /** Identyfikator anulowanego planu (`id` @extension oryginału; root `<localRoot>.26.1`). */
  readonly documentId: string;
  /** Identyfikator zbioru wersji oryginału (`setId` @extension; root `<localRoot>.26.2`). */
  readonly documentSetId: string;
  /** Numer wersji oryginału (domyślnie 1); anulowanie = +1. */
  readonly versionNumber?: number;
  /** Tytuł anulowanego dokumentu do narracji (domyślnie „Indywidualny Plan Opieki Medycznej"). */
  readonly title?: string;
  /** Data wystawienia anulowanego planu (DD.MM.RRRR) do narracji. */
  readonly issuedDate?: string;
}

/** Wejście buildera dokumentu anulującego plan opieki medycznej. */
export interface IpomCancellationInput {
  /** Bazowy root lokalny podmiotu (jak przy wystawieniu planu). */
  readonly localRoot: string;
  /** Numer dokumentu anulującego (`id` @extension); generowany, jeśli pominięty. */
  readonly cancellationNumber?: string;
  readonly effectiveDate?: string;
  readonly now?: Date;
  readonly cancelled: CancelledIpomRef;
  readonly patient: CdaPatient;
  readonly author: CdaAuthor;
  /** Specjalność autora (`.2.4` code) - np. „0718"/„neurologia". */
  readonly authorSpecialtyCode?: string;
  readonly authorSpecialtyName?: string;
  readonly legalAuthenticator: CdaLegalAuthenticator;
  /** Oddział NFZ (participant `.2.19`). */
  readonly nfzBranch: string;
}

export interface IpomCancellationResult {
  readonly xml: string;
  readonly cancellationNumber: string;
  readonly effectiveDate: string;
}

/**
 * Builder dokumentu anulującego plan opieki medycznej (generyczny „Dokument
 * anulujący", IHE Nullification `.10.1.14`, CDA PL 1.3.2). Zastępuje oryginał
 * (relatedDocument RPLC: dzieli `setId`, versionNumber = oryginał + 1).
 * Wzorowany na `anulowanie-dokumentu-medycznego-1.3.2.xml`.
 */
export function buildIpomCancellationCda(input: IpomCancellationInput): IpomCancellationResult {
  const effectiveDate = input.effectiveDate ?? formatCdaDateTime(input.now ?? new Date());
  const cancellationNumber = input.cancellationNumber ?? generateDocumentId();
  const parentVersion = input.cancelled.versionNumber ?? 1;
  const { localRoot } = input;
  const setIdRoot = `${localRoot}.${IPOM_SETID_SEGMENT}`;
  const parentIdRoot = `${localRoot}.${IPOM_ID_SEGMENT}`;

  const root = create({ version: "1.0", encoding: "UTF-8" });
  root.ins("xml-stylesheet", 'href="CDA_PL_IG_1.3.2.xsl" type="text/xsl"');
  const clinicalDocument = root.ele("ClinicalDocument", {
    xmlns: "urn:hl7-org:v3",
    "xmlns:extPL": "http://www.csioz.gov.pl/xsd/extPL/r3",
    "xmlns:xsi": "http://www.w3.org/2001/XMLSchema-instance",
    "xsi:type": "extPL:ClinicalDocument",
  });

  clinicalDocument.ele({
    typeId: { "@extension": "POCD_HD000040", "@root": CDA_OID.HL7_TYPE_ID },
    templateId: [
      { "@root": CANCELLATION_TEMPLATE.IHE_MEDICAL_DOCUMENT },
      { "@root": CANCELLATION_TEMPLATE.IHE_MEDICAL_DOCUMENT_2 },
      { "@root": CANCELLATION_TEMPLATE.DOC, "@extension": "1.3.2" },
    ],
    id: { "@extension": cancellationNumber, "@root": `${localRoot}.2.9`, "@displayable": "true" },
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
    setId: { "@extension": input.cancelled.documentSetId, "@root": setIdRoot },
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
          "@extension": input.cancelled.documentId,
          "@root": parentIdRoot,
          "@displayable": "false",
        },
        setId: { "@extension": input.cancelled.documentSetId, "@root": setIdRoot },
        versionNumber: { "@value": String(parentVersion) },
      },
    },
  });

  const component = clinicalDocument.ele("component");
  component.ele("templateId", { root: CANCELLATION_TEMPLATE.COMPONENT });
  const structuredBody = component.ele("structuredBody");
  structuredBody.ele({ component: { section: buildCancelledInfoSection(input) } });

  return { xml: root.end({ prettyPrint: true }), cancellationNumber, effectiveDate };
}

function buildRecordTarget(input: IpomCancellationInput): XmlObject {
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

function buildAuthor(input: IpomCancellationInput, effectiveDate: string): XmlObject {
  const { author } = input;
  const org = author.organization;
  const assignedAuthor: XmlObject = {
    id: { "@extension": author.authorExt, "@root": author.authorRoot, "@displayable": "false" },
  };
  if (input.authorSpecialtyCode) {
    assignedAuthor.code = {
      "@code": input.authorSpecialtyCode,
      "@codeSystem": AUTHOR_SPECIALTY_OID,
      "@displayName": input.authorSpecialtyName ?? input.authorSpecialtyCode,
    };
  }
  assignedAuthor.assignedPerson = {
    templateId: { "@root": CANCELLATION_TEMPLATE.PERSON },
    name: {
      prefix: author.prefix ?? "lek.",
      given: [...author.givenNames],
      family: author.familyName,
    },
  };
  assignedAuthor.representedOrganization = buildRepresentedOrganization(org);

  return {
    templateId: { "@root": CANCELLATION_TEMPLATE.AUTHOR },
    functionCode: {
      "@code": author.functionCode,
      "@codeSystem": CDA_OID.FUNCTION_CODES,
      "@displayName": author.functionDisplay,
    },
    time: { "@value": effectiveDate },
    assignedAuthor,
  };
}

function buildRepresentedOrganization(org: CdaAuthorOrganization): XmlObject {
  return {
    templateId: { "@root": CANCELLATION_TEMPLATE.REPRESENTED_ORGANIZATION },
    id: {
      "@extension": `${org.providerExt}-01`,
      "@root": CDA_OID.ORG_UNIT,
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
        templateId: { "@root": CANCELLATION_TEMPLATE.WHOLE_ORGANIZATION },
        id: { "@extension": org.regon14, "@root": CDA_OID.REGON_14, "@displayable": "true" },
        asOrganizationPartOf: {
          wholeOrganization: {
            id: [
              { "@extension": org.providerExt, "@root": org.providerRoot, "@displayable": "true" },
              { "@extension": org.regon9, "@root": CDA_OID.REGON_9, "@displayable": "true" },
            ],
          },
        },
      },
    },
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

function buildLegalAuthenticator(la: CdaLegalAuthenticator, effectiveDate: string): XmlObject {
  return {
    templateId: { "@root": CANCELLATION_TEMPLATE.LEGAL_AUTHENTICATOR },
    time: { "@value": effectiveDate },
    signatureCode: { "@code": "S" },
    assignedEntity: {
      id: { "@extension": la.authorExt, "@root": la.authorRoot, "@displayable": "false" },
      code: {
        "@code": la.functionCode,
        "@codeSystem": CDA_OID.FUNCTION_CODES,
        "@displayName": la.functionDisplay,
      },
    },
  };
}

function buildCancelledInfoSection(input: IpomCancellationInput): XmlObject {
  const c = input.cancelled;
  const paragraphs: XmlObject[] = [
    { "#": "Proszę o anulowanie dokumentu:" },
    { caption: "Tytuł:", "#": ` ${c.title ?? "Indywidualny Plan Opieki Medycznej"}` },
  ];
  if (c.issuedDate) paragraphs.push({ caption: "Data wystawienia:", "#": ` ${c.issuedDate}` });
  paragraphs.push({ caption: "Identyfikator:", "#": ` ${c.documentId}` });

  return {
    templateId: { "@root": CANCELLATION_TEMPLATE.SECTION },
    title: "Dane dokumentu anulowanego",
    text: { paragraph: paragraphs },
  };
}
