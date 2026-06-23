import {
  type CdaAuthor,
  type CdaAuthorOrganization,
  CDA_OID,
  type CdaLegalAuthenticator,
  type CdaPatient,
  type CdaPatientAddress,
  type XmlObject,
} from "@p1/cda";
import { ATRYBUTY_IPOM_OID, IPOM_TEMPLATE } from "./constants.js";

/** Dane stron dokumentu IPOM (wspólne dla planu i harmonogramu). */
export interface IpomHeaderParty {
  readonly localRoot: string;
  readonly patient: CdaPatient;
  readonly author: CdaAuthor;
  readonly legalAuthenticator: CdaLegalAuthenticator;
  /** Identyfikator podmiotu udostępniającego (`providerOrganization`, root `.2.3.1`). */
  readonly providerOrganizationId: string;
}

/** Parametry nagłówka swoiste dla typu dokumentu (plan `.41` / harmonogram `.42`). */
export interface IpomHeaderDoc {
  readonly docTemplate: string;
  readonly igVersion: string;
  /** Segment root-a `id` (`<localRoot>.{idSegment}`), np. „26.1" (plan) / „27.1" (harmonogram). */
  readonly idSegment: string;
  /** Segment root-a `setId`, np. „26.2" / „27.2". */
  readonly setIdSegment: string;
  /** Kod KLAS_DOK_P1 (translation): „00.94" plan / „00.95" harmonogram. */
  readonly translationCode: string;
  readonly translationDisplay: string;
  readonly title: string;
  readonly documentId: string;
  readonly documentSetId: string;
  readonly documentDate: string;
  readonly versionNumber: number;
}

/**
 * Buduje nagłówek dokumentu IPOM (wspólny dla planu i harmonogramu): identity →
 * recordTarget (`.2.3` z `providerOrganization`) → author (`.2.4` bez specjalności,
 * `representedOrganization` `.2.17`) → custodian (`.2.20`) → legalAuthenticator (`.2.6`).
 * Część swoista dla typu (templateId, kod, tytuł, segmenty root) przychodzi w `doc`.
 */
export function buildIpomHeader(party: IpomHeaderParty, doc: IpomHeaderDoc): XmlObject {
  const { localRoot } = party;
  return {
    typeId: { "@extension": "POCD_HD000040", "@root": CDA_OID.HL7_TYPE_ID },
    templateId: { "@root": doc.docTemplate, "@extension": doc.igVersion },
    id: {
      "@extension": doc.documentId,
      "@root": `${localRoot}.${doc.idSegment}`,
      "@displayable": "false",
    },
    code: {
      "@code": "18776-5",
      "@codeSystem": CDA_OID.LOINC,
      "@codeSystemName": "LOINC",
      "@displayName": "Plan of care note",
      translation: {
        "@code": doc.translationCode,
        "@codeSystem": CDA_OID.DOC_CLASS_P1,
        "@codeSystemName": "KLAS_DOK_P1",
        "@displayName": doc.translationDisplay,
      },
    },
    title: doc.title,
    effectiveTime: { "@value": doc.documentDate },
    confidentialityCode: { "@code": "N", "@codeSystem": CDA_OID.HL7_CONFIDENTIALITY },
    languageCode: { "@code": "pl-PL" },
    setId: { "@extension": doc.documentSetId, "@root": `${localRoot}.${doc.setIdSegment}` },
    versionNumber: { "@value": String(doc.versionNumber) },
    recordTarget: buildRecordTarget(party.patient, localRoot, party.providerOrganizationId),
    author: buildAuthor(party.author, doc.documentDate),
    custodian: buildCustodian(),
    legalAuthenticator: buildLegalAuthenticator(party.legalAuthenticator, doc.documentDate),
  };
}

function buildRecordTarget(
  patient: CdaPatient,
  localRoot: string,
  providerOrganizationId: string,
): XmlObject {
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
    templateId: { "@root": IPOM_TEMPLATE.RECORD_TARGET },
    patientRole: {
      id: [
        {
          "@extension": patient.internalId ?? "12345",
          "@root": `${localRoot}.17.1`,
          "@displayable": "false",
        },
        { "@extension": patient.pesel, "@root": CDA_OID.PESEL, "@displayable": "true" },
      ],
      addr: buildPatientAddress(patient.address),
      patient: person,
      providerOrganization: {
        "@classCode": "ORG",
        templateId: { "@root": IPOM_TEMPLATE.PROVIDER_ORGANIZATION },
        id: {
          "@extension": providerOrganizationId,
          "@root": CDA_OID.PROVIDER,
          "@displayable": "false",
        },
      },
    },
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
  const teryt: string[] = [];
  if (address.terytSimc) teryt.push(`TERYT SIMC: ${address.terytSimc}`);
  if (address.terytTerc) teryt.push(`TERYT TERC: ${address.terytTerc}`);
  if (teryt.length > 0) addr.censusTract = teryt;
  return addr;
}

function buildAuthor(author: CdaAuthor, documentDate: string): XmlObject {
  return {
    templateId: { "@root": IPOM_TEMPLATE.AUTHOR },
    functionCode: {
      "@code": author.functionCode,
      "@codeSystem": CDA_OID.FUNCTION_CODES,
      "@displayName": author.functionDisplay,
    },
    time: { "@value": documentDate },
    assignedAuthor: {
      "@xsi:type": "extPL:AssignedAuthor",
      id: { "@extension": author.authorExt, "@root": author.authorRoot, "@displayable": "false" },
      assignedPerson: {
        templateId: { "@root": IPOM_TEMPLATE.PERSON },
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
  return {
    templateId: { "@root": IPOM_TEMPLATE.REPRESENTED_ORGANIZATION },
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
        id: { "@extension": org.regon14, "@root": CDA_OID.REGON_14, "@displayable": "true" },
        name: org.name,
        asOrganizationPartOf: {
          wholeOrganization: {
            id: [
              { "@extension": org.providerExt, "@root": org.providerRoot, "@displayable": "true" },
              { "@extension": org.regon9, "@root": CDA_OID.REGON_9, "@displayable": "true" },
            ],
            name: org.name,
          },
        },
      },
    },
  };
}

function buildNfzContract(org: CdaAuthorOrganization): XmlObject {
  return {
    "@typeCode": "PART",
    "extPL:templateId": { "@root": IPOM_TEMPLATE.NFZ_CONTRACT },
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
    templateId: { "@root": IPOM_TEMPLATE.CUSTODIAN },
    assignedCustodian: {
      "@classCode": "ASSIGNED",
      representedCustodianOrganization: {
        "@classCode": "ORG",
        "@determinerCode": "INSTANCE",
        id: { "@assigningAuthorityName": "CSIOZ", "@displayable": "false", "@root": CDA_OID.CSIOZ },
      },
    },
  };
}

function buildLegalAuthenticator(la: CdaLegalAuthenticator, documentDate: string): XmlObject {
  return {
    templateId: { "@root": IPOM_TEMPLATE.LEGAL_AUTHENTICATOR },
    time: { "@value": documentDate },
    signatureCode: { "@code": "S" },
    assignedEntity: {
      id: { "@extension": la.authorExt, "@root": la.authorRoot, "@displayable": "true" },
    },
  };
}

/** Element `<code>` LOINC. */
export function loincCode(code: string, display: string): XmlObject {
  return {
    "@code": code,
    "@codeSystem": CDA_OID.LOINC,
    "@codeSystemName": "LOINC",
    "@displayName": display,
  };
}

/** Element `<code>` w systemie AtrybutyIPOM (DWOSP/SOPS/ZBLAB/ZOWB/SRZ/...). */
export function ipomAttributeCode(attr: { code: string; display: string }): XmlObject {
  return {
    "@code": attr.code,
    "@codeSystem": ATRYBUTY_IPOM_OID,
    "@codeSystemName": "AtrybutyIPOM",
    "@displayName": attr.display,
  };
}
