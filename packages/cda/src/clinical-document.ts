import { create } from "xmlbuilder2";
import {
  CDA_OID,
  CDA_TEMPLATE,
  LOINC_CODE,
  REALIZATION_MODE,
  TREATMENT_TYPE,
} from "./constants.js";
import { formatCdaDateTime } from "./datetime.js";
import { generateDocumentId } from "./document-id.js";
import type {
  CdaAuthor,
  CdaAuthorOrganization,
  CdaLegalAuthenticator,
  CdaPatient,
  CdaPatientAddress,
  ClinicalDocumentHeaderInput,
  ClinicalDocumentResult,
} from "./types.js";

const POLISH_CLASSIFIERS_NAME = "PolskieKlasyfikatoryHL7v3";

type XmlObject = Record<string, unknown>;

/**
 * Buduje pełny nagłówek dokumentu CDA „skierowanie do uzdrowiska" (HL7 CDA PL IG
 * 1.3.2): identity → recordTarget → author → custodian → legalAuthenticator →
 * participant + scaffold `structuredBody`. Sekcje kliniczne body (PR2) podaje się
 * jako `bodyComponentsXml`. xmlbuilder2 zapewnia escaping.
 */
export function buildClinicalDocumentHeader(
  input: ClinicalDocumentHeaderInput,
): ClinicalDocumentResult {
  const documentId = input.documentId ?? generateDocumentId();
  const documentSetId = input.documentSetId ?? documentId;
  const documentDate = input.documentDate ?? formatCdaDateTime(input.now ?? new Date());

  const header: XmlObject = {
    typeId: { "@extension": "POCD_HD000040", "@root": CDA_OID.HL7_TYPE_ID },
    templateId: { "@root": CDA_TEMPLATE.HEALTH_RESORT_REFERRAL, "@extension": "1.3.2" },
    id: { "@extension": documentId, "@root": `${input.localRoot}.4.1`, "@displayable": "false" },
    code: buildCode(input),
    title: input.title,
    effectiveTime: { "@value": documentDate },
    confidentialityCode: { "@code": "N", "@codeSystem": CDA_OID.HL7_CONFIDENTIALITY },
    languageCode: { "@code": "pl-PL" },
    setId: { "@extension": documentSetId, "@root": `${input.localRoot}.4.2` },
    versionNumber: { "@value": "1" },
    recordTarget: buildRecordTarget(input.patient, input.localRoot),
    author: buildAuthor(input.author, documentDate),
    custodian: buildCustodian(),
    legalAuthenticator: buildLegalAuthenticator(input.legalAuthenticator, documentDate),
    participant: buildParticipant(input.nfzBranchCode),
  };

  const root = create({ version: "1.0", encoding: "UTF-8" });
  root.ins("xml-stylesheet", 'href="CDA_PL_IG_1.3.2.xsl" type="text/xsl"');
  const clinicalDocument = root.ele("ClinicalDocument", {
    xmlns: "urn:hl7-org:v3",
    "xmlns:extPL": "http://www.csioz.gov.pl/xsd/extPL/r3",
    "xmlns:xsi": "http://www.w3.org/2001/XMLSchema-instance",
    "xsi:type": "extPL:ClinicalDocument",
  });
  clinicalDocument.ele(header);

  const component = clinicalDocument.ele("component");
  component.ele("templateId", { root: CDA_TEMPLATE.STRUCTURED_BODY });
  const structuredBody = component.ele("structuredBody");
  for (const section of input.bodyComponents ?? []) {
    structuredBody.ele({ component: { "@typeCode": "COMP", section } });
  }

  return { xml: root.end({ prettyPrint: true }), documentId, documentDate };
}

function buildCode(input: ClinicalDocumentHeaderInput): XmlObject {
  const treatment = TREATMENT_TYPE[input.treatmentType];
  const realization = REALIZATION_MODE[input.realizationMode];
  const classifier = (code: string, display: string): XmlObject => ({
    "@code": code,
    "@displayName": display,
    "@codeSystem": CDA_OID.POLISH_CLASSIFIERS,
    "@codeSystemName": POLISH_CLASSIFIERS_NAME,
  });
  return {
    "@code": LOINC_CODE.REFERRAL,
    "@codeSystem": CDA_OID.LOINC,
    "@codeSystemName": "LOINC",
    "@displayName": "Prescription for diagnostic or specialist care Document",
    translation: {
      "@code": "02.10",
      "@codeSystem": CDA_OID.DOC_CLASS_P1,
      "@codeSystemName": "KLAS_DOK_P1",
      "@displayName": "Skierowanie na badanie lub leczenie",
      qualifier: [
        {
          name: classifier("RSUZDR", "Rodzaje świadczenia uzdrowiskowego"),
          value: classifier(treatment.code, treatment.display),
        },
        {
          name: classifier("TRSU", "Tryb realizacji świadczenia uzdrowiskowego"),
          value: classifier(realization.code, realization.display),
        },
      ],
    },
  };
}

function buildRecordTarget(patient: CdaPatient, localRoot: string): XmlObject {
  const patientRole: XmlObject = {
    id: [
      {
        "@extension": patient.internalId ?? "12345",
        "@root": `${localRoot}.17.1`,
        "@displayable": "false",
      },
      { "@extension": patient.pesel, "@root": CDA_OID.PESEL, "@displayable": "true" },
    ],
    addr: buildPatientAddress(patient.address),
  };

  const telecom: XmlObject[] = [];
  if (patient.phone) telecom.push({ "@value": `tel:${patient.phone}` });
  if (patient.email) telecom.push({ "@value": `mailto:${patient.email}` });
  if (telecom.length > 0) patientRole.telecom = telecom;

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
  patientRole.patient = person;

  return { templateId: { "@root": CDA_TEMPLATE.PATIENT }, patientRole };
}

function buildPatientAddress(address: CdaPatientAddress): XmlObject {
  const addr: XmlObject = {};
  if (address.use) addr["@use"] = address.use;
  addr.country = address.country ?? "Polska";
  addr.city = address.city;
  addr.postalCode = address.postalCode;
  addr.streetName = address.street ?? { "@nullFlavor": "NA" };
  addr.houseNumber = address.houseNumber;
  if (address.unitId) addr.unitID = address.unitId;
  return addr;
}

function buildAuthor(author: CdaAuthor, documentDate: string): XmlObject {
  return {
    templateId: { "@root": CDA_TEMPLATE.AUTHOR },
    functionCode: {
      "@code": author.functionCode,
      "@codeSystem": CDA_OID.FUNCTION_CODES,
      "@displayName": author.functionDisplay,
    },
    time: { "@value": documentDate },
    assignedAuthor: {
      "@xsi:type": "extPL:AssignedAuthor",
      id: { "@extension": author.authorExt, "@root": author.authorRoot, "@displayable": "false" },
      code: {
        "@code": author.specialtyCode,
        "@codeSystem": CDA_OID.SPECIALTY_CODES,
        "@displayName": author.specialtyDisplay,
      },
      assignedPerson: {
        templateId: { "@root": CDA_TEMPLATE.PERSON },
        name: {
          prefix: author.prefix ?? "lek.",
          given: [...author.givenNames],
          family: author.familyName,
        },
      },
      representedOrganization: buildRepresentedOrganization(author.organization),
      "extPL:boundedBy": buildNfzContract(author.organization),
    },
  };
}

function buildRepresentedOrganization(org: CdaAuthorOrganization): XmlObject {
  const representedOrganization: XmlObject = {
    templateId: { "@root": CDA_TEMPLATE.ORGANIZATION },
    id: {
      "@extension": `${org.providerExt}-001`,
      "@root": CDA_OID.WORKPLACE,
      "@displayable": "true",
    },
    name: org.name,
  };
  representedOrganization.telecom = { "@use": "PUB", "@value": `tel:${org.phone}` };
  representedOrganization.addr = {
    postalCode: org.address.postalCode,
    city: org.address.city,
    streetName: org.address.street,
    houseNumber: org.address.houseNumber,
  };
  representedOrganization.asOrganizationPartOf = {
    wholeOrganization: {
      templateId: { "@root": CDA_TEMPLATE.WHOLE_ORGANIZATION },
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
  };
  return representedOrganization;
}

function buildNfzContract(org: CdaAuthorOrganization): XmlObject {
  return {
    "@typeCode": "PART",
    "extPL:templateId": { "@root": CDA_TEMPLATE.NFZ_CONTRACT },
    "extPL:reimbursementRelatedContract": {
      "@moodCode": "EVN",
      "@classCode": "CNTRCT",
      "extPL:id": { "@extension": org.nfzContractNumber, "@root": CDA_OID.NFZ_CONTRACT },
      "extPL:bounding": {
        "@typeCode": "PART",
        "extPL:reimburser": {
          "@classCode": "UNDWRT",
          "extPL:id": {
            "@extension": org.nfzBranchCode,
            "@root": CDA_OID.NFZ_BRANCH,
            "@displayable": "true",
          },
        },
      },
    },
  };
}

function buildCustodian(): XmlObject {
  return {
    templateId: { "@root": CDA_TEMPLATE.CUSTODIAN },
    assignedCustodian: {
      representedCustodianOrganization: {
        id: { "@assigningAuthorityName": "CSIOZ", "@displayable": "false", "@root": CDA_OID.CSIOZ },
      },
    },
  };
}

function buildLegalAuthenticator(la: CdaLegalAuthenticator, documentDate: string): XmlObject {
  return {
    templateId: { "@root": CDA_TEMPLATE.LEGAL_AUTHENTICATOR },
    time: { "@value": documentDate },
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

function buildParticipant(nfzBranchCode: string): XmlObject {
  return {
    "@typeCode": "IND",
    templateId: { "@root": CDA_TEMPLATE.NFZ_PARTICIPANT },
    associatedEntity: {
      "@classCode": "UNDWRT",
      id: { "@extension": nfzBranchCode, "@root": CDA_OID.NFZ_BRANCH, "@displayable": "true" },
    },
  };
}
