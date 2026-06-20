import { create } from "xmlbuilder2";
import {
  CDA_OID,
  CDA_TEMPLATE,
  type CdaLegalAuthenticator,
  type ClinicalDocumentResult,
  formatCdaDateTime,
  generateDocumentId,
  type XmlObject,
} from "@p1/cda";
import {
  NULLIFICATION_DOC,
  NULLIFICATION_SECTION_TITLE,
  NULLIFICATION_TEMPLATE,
  NULLIFICATION_TITLE,
} from "./constants.js";

/** Dane autora anulowania (NPWZ + osoba). */
export interface NullificationAuthor {
  readonly authorExt: string;
  readonly authorRoot: string;
  /** Zawód medyczny (functionCode), np. "LEK". */
  readonly functionCode: string;
  readonly functionDisplay: string;
  readonly givenNames: readonly string[];
  readonly familyName: string;
}

/**
 * Dane pacjenta dla anulowania (recordTarget .2.3 wymaga id + imię/nazwisko).
 * UWAGA: NIE emitujemy `birthplace` — Schematron P1 ma błąd w regule .2.3 (kontekst
 * `patient/birthplace` z testem `count(birthplace)>=1` wymagałby birthplace zagnieżdżonego
 * w birthplace); reguła nie odpala się, gdy birthplace jest nieobecny.
 */
export interface NullificationPatient {
  readonly pesel: string;
  readonly givenNames: readonly string[];
  readonly familyName: string;
  readonly internalId?: string;
}

/** Identyfikator dokumentu anulowanego (oryginalnego skierowania). */
export interface AnnulledDocumentRef {
  readonly idRoot: string;
  readonly idExtension: string;
  readonly setIdRoot?: string;
  readonly setIdExtension?: string;
  readonly versionNumber?: number;
}

export interface NullificationInput {
  /** Bazowy root lokalny podmiotu (z niego pochodzą .4.1/.4.2). */
  readonly localRoot: string;
  readonly patient: NullificationPatient;
  readonly author: NullificationAuthor;
  readonly legalAuthenticator: CdaLegalAuthenticator;
  /** Dokument anulowany (oryginalne skierowanie). */
  readonly annulledDocument: AnnulledDocumentRef;
  /** Treść sekcji „Dane dokumentu anulowanego" (np. powód anulowania). */
  readonly description: string;
  readonly documentId?: string;
  readonly now?: Date;
  readonly documentDate?: string;
}

function templateId(root: string, extension?: string): XmlObject {
  return extension !== undefined ? { "@root": root, "@extension": extension } : { "@root": root };
}

/**
 * Buduje dokument CDA anulowania skierowania (plCdaNullification .1.14). Odrębny od
 * skierowań: trzy templateId (P1 + IHE), proste szablony nagłówka (.2.3/.2.4/.2.5),
 * referencja `relatedDocument/parentDocument` do dokumentu anulowanego i jedna sekcja.
 */
export function buildNullificationCda(input: NullificationInput): ClinicalDocumentResult {
  const documentId = input.documentId ?? generateDocumentId();
  const documentDate = input.documentDate ?? formatCdaDateTime(input.now ?? new Date());

  // Anulowanie zastępuje (RPLC) oryginał: dzieli z nim setId, a versionNumber = oryginał + 1.
  const parentSetIdRoot = input.annulledDocument.setIdRoot ?? input.annulledDocument.idRoot;
  const parentSetIdExtension =
    input.annulledDocument.setIdExtension ?? input.annulledDocument.idExtension;
  const parentVersion = input.annulledDocument.versionNumber ?? 1;

  const patientIds: XmlObject[] = [];
  if (input.patient.internalId) {
    patientIds.push({
      "@extension": input.patient.internalId,
      "@root": `${input.localRoot}.17.1`,
      "@displayable": "false",
    });
  }
  patientIds.push({
    "@extension": input.patient.pesel,
    "@root": CDA_OID.PESEL,
    "@displayable": "true",
  });

  const header: XmlObject = {
    typeId: { "@extension": "POCD_HD000040", "@root": CDA_OID.HL7_TYPE_ID },
    templateId: [
      templateId(NULLIFICATION_TEMPLATE.NULLIFICATION, "1.3.2"),
      templateId(NULLIFICATION_TEMPLATE.IHE_NULLIFICATION),
      templateId(NULLIFICATION_TEMPLATE.IHE_MEDICAL_DOCUMENT),
    ],
    id: { "@extension": documentId, "@root": `${input.localRoot}.4.1`, "@displayable": "false" },
    code: {
      "@code": NULLIFICATION_DOC.LOINC,
      "@codeSystem": CDA_OID.LOINC,
      "@codeSystemName": "LOINC",
      "@displayName": NULLIFICATION_DOC.LOINC_DISPLAY,
      translation: {
        "@code": NULLIFICATION_DOC.P1_CLASS,
        "@codeSystem": CDA_OID.DOC_CLASS_P1,
        "@codeSystemName": "KLAS_DOK_P1",
        "@displayName": NULLIFICATION_DOC.P1_CLASS_DISPLAY,
      },
    },
    title: NULLIFICATION_TITLE,
    effectiveTime: { "@value": documentDate },
    confidentialityCode: { "@code": "N", "@codeSystem": CDA_OID.HL7_CONFIDENTIALITY },
    languageCode: { "@code": "pl-PL" },
    setId: { "@extension": parentSetIdExtension, "@root": parentSetIdRoot },
    versionNumber: { "@value": String(parentVersion + 1) },
    recordTarget: {
      "@typeCode": "RCT",
      "@contextControlCode": "OP",
      templateId: { "@root": NULLIFICATION_TEMPLATE.RECORD_TARGET },
      patientRole: {
        "@classCode": "PAT",
        id: patientIds,
        patient: {
          name: { given: [...input.patient.givenNames], family: input.patient.familyName },
        },
      },
    },
    author: {
      "@typeCode": "AUT",
      "@contextControlCode": "OP",
      templateId: { "@root": NULLIFICATION_TEMPLATE.AUTHOR },
      functionCode: {
        "@code": input.author.functionCode,
        "@codeSystem": CDA_OID.FUNCTION_CODES,
        "@displayName": input.author.functionDisplay,
      },
      time: { "@value": documentDate },
      assignedAuthor: {
        "@classCode": "ASSIGNED",
        id: {
          "@extension": input.author.authorExt,
          "@root": input.author.authorRoot,
          "@displayable": "false",
        },
        assignedPerson: {
          templateId: { "@root": CDA_TEMPLATE.PERSON },
          name: { given: [...input.author.givenNames], family: input.author.familyName },
        },
      },
    },
    custodian: {
      "@typeCode": "CST",
      templateId: { "@root": NULLIFICATION_TEMPLATE.CUSTODIAN },
      assignedCustodian: {
        "@classCode": "ASSIGNED",
        representedCustodianOrganization: {
          "@classCode": "ORG",
          "@determinerCode": "INSTANCE",
          id: {
            "@assigningAuthorityName": "CSIOZ",
            "@displayable": "false",
            "@root": CDA_OID.CSIOZ,
          },
        },
      },
    },
    legalAuthenticator: {
      templateId: { "@root": NULLIFICATION_TEMPLATE.LEGAL_AUTHENTICATOR },
      time: { "@value": documentDate },
      signatureCode: { "@code": "S" },
      assignedEntity: {
        id: {
          "@extension": input.legalAuthenticator.authorExt,
          "@root": input.legalAuthenticator.authorRoot,
          "@displayable": "false",
        },
        code: {
          "@code": input.legalAuthenticator.functionCode,
          "@codeSystem": CDA_OID.FUNCTION_CODES,
          "@displayName": input.legalAuthenticator.functionDisplay,
        },
      },
    },
    relatedDocument: {
      "@typeCode": "RPLC",
      templateId: { "@root": NULLIFICATION_TEMPLATE.RELATED_DOCUMENT },
      parentDocument: {
        "@classCode": "DOCCLIN",
        "@moodCode": "EVN",
        id: {
          "@extension": input.annulledDocument.idExtension,
          "@root": input.annulledDocument.idRoot,
        },
        setId: { "@extension": parentSetIdExtension, "@root": parentSetIdRoot },
        versionNumber: { "@value": String(parentVersion) },
      },
    },
  };

  const root = create({ version: "1.0", encoding: "UTF-8" });
  root.ins("xml-stylesheet", 'href="CDA_PL_IG_1.3.2.xsl" type="text/xsl"');
  const clinicalDocument = root.ele("ClinicalDocument", {
    xmlns: "urn:hl7-org:v3",
    "xmlns:extPL": "http://www.csioz.gov.pl/xsd/extPL/r3",
    "xmlns:xsi": "http://www.w3.org/2001/XMLSchema-instance",
  });
  clinicalDocument.ele(header);

  const component = clinicalDocument.ele("component");
  component.ele("templateId", { root: NULLIFICATION_TEMPLATE.STRUCTURED_BODY });
  const structuredBody = component.ele("structuredBody");
  structuredBody.ele({
    component: {
      "@typeCode": "COMP",
      section: {
        "@classCode": "DOCSECT",
        "@moodCode": "EVN",
        templateId: { "@root": NULLIFICATION_TEMPLATE.SECTION },
        title: NULLIFICATION_SECTION_TITLE,
        text: { content: { "@ID": "p1_dane_anulowanego", "#": input.description } },
      },
    },
  });

  return { xml: root.end({ prettyPrint: true }), documentId, documentDate };
}
