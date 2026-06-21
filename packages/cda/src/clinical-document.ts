import { create } from "xmlbuilder2";
import { formatCdaDateTime } from "./datetime.js";
import { generateDocumentId } from "./document-id.js";
import { CDA_OID, CDA_TEMPLATE } from "./oids.js";
import type {
  CdaAuthor,
  CdaAuthorOrganization,
  CdaLegalAuthenticator,
  CdaPatient,
  CdaPatientAddress,
  ClinicalDocumentInput,
  ClinicalDocumentResult,
  XmlObject,
} from "./types.js";

/**
 * Generyczny builder dokumentu CDA PL IG 1.3.2: składa nagłówek (identity →
 * recordTarget → author → custodian → legalAuthenticator → participant) oraz
 * `structuredBody` z dostarczonych sekcji. Część specyficzna dla typu dokumentu
 * (`templateId`, `code`, `title`, `sections`) przychodzi z modułu domenowego.
 * xmlbuilder2 zapewnia escaping.
 */
export function buildClinicalDocument(input: ClinicalDocumentInput): ClinicalDocumentResult {
  const documentId = input.documentId ?? generateDocumentId();
  const documentSetId = input.documentSetId ?? documentId;
  const documentDate = input.documentDate ?? formatCdaDateTime(input.now ?? new Date());

  const templateId: XmlObject =
    input.templateId.extension !== undefined
      ? { "@root": input.templateId.root, "@extension": input.templateId.extension }
      : { "@root": input.templateId.root };

  const header: XmlObject = {
    typeId: { "@extension": "POCD_HD000040", "@root": CDA_OID.HL7_TYPE_ID },
    templateId,
    id: { "@extension": documentId, "@root": `${input.localRoot}.4.1`, "@displayable": "false" },
    code: input.code,
    title: input.title,
    effectiveTime: { "@value": documentDate },
    confidentialityCode: { "@code": "N", "@codeSystem": CDA_OID.HL7_CONFIDENTIALITY },
    languageCode: { "@code": "pl-PL" },
    setId: { "@extension": documentSetId, "@root": `${input.localRoot}.4.2` },
    versionNumber: { "@value": "1" },
    recordTarget: buildRecordTarget(
      input.patient,
      input.localRoot,
      input.recordTargetTemplateId ?? CDA_TEMPLATE.PATIENT,
    ),
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
  component.ele("templateId", {
    root: input.structuredBodyTemplateId ?? CDA_TEMPLATE.STRUCTURED_BODY,
  });
  const structuredBody = component.ele("structuredBody");
  for (const section of input.sections ?? []) {
    structuredBody.ele({ component: { "@typeCode": "COMP", section } });
  }

  return { xml: root.end({ prettyPrint: true }), documentId, documentDate };
}

function buildRecordTarget(
  patient: CdaPatient,
  localRoot: string,
  templateRoot: string,
): XmlObject {
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
  if (patient.birthplace) person.birthplace = buildBirthplace(patient.birthplace);
  patientRole.patient = person;

  return { templateId: { "@root": templateRoot }, patientRole };
}

/** `birthplace/place/addr` - miejsce urodzenia (wymagane m.in. przez recordTarget psychiatryczny .2.40). */
function buildBirthplace(birthplace: NonNullable<CdaPatient["birthplace"]>): XmlObject {
  const addr: XmlObject = { country: birthplace.country ?? "Polska" };
  if (birthplace.postalCode) addr.postalCode = birthplace.postalCode;
  if (birthplace.city) addr.city = birthplace.city;
  return {
    "@classCode": "BIRTHPL",
    place: { "@classCode": "PLC", "@determinerCode": "INSTANCE", addr },
  };
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
  // Kody TERYT (censusTract) - wymagane m.in. przez skierowanie uzdrowiskowe dla Polski.
  const teryt: string[] = [];
  if (address.terytTerc) teryt.push(`TERYT TERC: ${address.terytTerc}`);
  if (address.terytSimc) teryt.push(`TERYT SIMC: ${address.terytSimc}`);
  if (address.terytUlic) teryt.push(`TERYT ULIC: ${address.terytUlic}`);
  if (teryt.length > 0) addr.censusTract = teryt;
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
  if (org.cellSpecialtyCode) {
    representedOrganization.standardIndustryClassCode = {
      "@code": org.cellSpecialtyCode,
      "@codeSystem": CDA_OID.ORG_CELL_SPECIALTY,
      "@displayName": org.cellSpecialtyName ?? org.name,
    };
  }

  // Poziom podmiotu (REGON 14 → podmiot + REGON 9).
  const providerLevel: XmlObject = {
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

  // Gdy podano jednostkę organizacyjną (MUŚ, .2.3.2) - wstaw ją między komórkę a podmiot.
  if (org.orgUnitExt) {
    representedOrganization.asOrganizationPartOf = {
      wholeOrganization: {
        id: { "@extension": org.orgUnitExt, "@root": CDA_OID.ORG_UNIT, "@displayable": "true" },
        name: org.orgUnitName ?? org.name,
        addr: {
          postalCode: org.address.postalCode,
          city: org.address.city,
          streetName: org.address.street,
          houseNumber: org.address.houseNumber,
        },
        asOrganizationPartOf: providerLevel,
      },
    };
  } else {
    representedOrganization.asOrganizationPartOf = providerLevel;
  }
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
