import { describe, expect, it } from "vitest";
import { buildRegistryObjectList, type DocumentIndexInput, XDS } from "./ebrim.js";

const input: DocumentIndexInput = {
  submissionSet: {
    submissionUuid: "urn:uuid:11111111-0000-406c-8ffa-14c117944197",
    uniqueId: { root: "2.16.840.1.113883.3.4424.2.7.1491", extension: "12345678" },
    sourceId: "2.16.840.1.113883.3.4424.2.7.1491",
    submissionTime: "20260621120000",
    author: { person: { id: "4727124", familyName: "Leczniczy", givenName: "Adam713" } },
    patientId: "P123456789^^^&2.16.840.1.113883.3.4424.15&ISO",
  },
  document: {
    entryUuid: "urn:uuid:23f6e7b3-0000-0000-0000-4ca4f7fb1ef8",
    uniqueId: { root: "2.16.840.1.113883.3.4424.2.7.1491", extension: "987654321" },
    repositoryUniqueId: "2.16.840.1.113883.3.4424.7.24.1",
    mimeType: "text/xml",
    hash: "da39a3ee5e6b4b0d3255bfef95601890afd80709",
    size: 4096,
    creationTime: "20260621120000",
    title: "Karta informacyjna leczenia szpitalnego",
    medicalEvent: { id: "316544979021366272", oid: "2.16.840.1.113883.3.4424.2.7.1491.15.1" },
    uri: "dokument.xml",
    sourcePatient: {
      id: "P123456789",
      oid: "2.16.840.1.113883.3.4424.2.7.1491.17.1",
      info: {
        familyName: "Senior",
        givenName: "Sylwester",
        birthDate: "19400101",
        gender: "M",
        city: "Warszawa",
      },
    },
    author: {
      person: {
        id: "4727124",
        familyName: "Leczniczy",
        givenName: "Adam713",
        assigningAuthorityOid: "2.16.840.1.113883.3.4424.1.6.2",
      },
      institution: {
        name: "Przychodnia",
        oid: "2.16.840.1.113883.3.4424.2.3.1",
        idExtension: "000000927722",
      },
      role: "Lekarz",
    },
    typeP1: {
      code: "06.10",
      codingScheme: "Klasyfikacja dokumentów P1",
      displayName: "Karta informacyjna",
    },
    typeLoinc: {
      code: "10006-5",
      codingScheme: "LOINC",
      displayName: "Conference Evaluation Note",
    },
    confidentiality: { code: "N", codingScheme: "2.16.840.1.113883.5.25", displayName: "normal" },
    format: {
      code: "urn:extPL:pl-cda",
      codingScheme: "Kody formatów P1",
      displayName: "PIK HL7 CDA",
    },
    patientId: "P123456789^^^&2.16.840.1.113883.3.4424.15&ISO",
  },
};

describe("buildRegistryObjectList", () => {
  const xml = buildRegistryObjectList(input);

  it("zawiera DocumentEntry, SubmissionSet i Association (HasMember)", () => {
    expect(xml).toContain("<rim:RegistryObjectList");
    expect(xml).toContain(`objectType="${XDS.OBJECT_TYPE_EXTRINSIC}"`);
    expect(xml).toContain("<rim:RegistryPackage");
    expect(xml).toContain(`associationType="${XDS.ASSOCIATION_HAS_MEMBER}"`);
    expect(xml).toContain('sourceObject="urn:uuid:11111111-0000-406c-8ffa-14c117944197"');
    expect(xml).toContain('targetObject="urn:uuid:23f6e7b3-0000-0000-0000-4ca4f7fb1ef8"');
  });

  it("ustawia repozytorium, hash, rozmiar i availability", () => {
    expect(xml).toContain(slotValue("repositoryUniqueId", "2.16.840.1.113883.3.4424.7.24.1"));
    expect(xml).toContain(slotValue("hash", "da39a3ee5e6b4b0d3255bfef95601890afd80709"));
    expect(xml).toContain(slotValue("size", "4096"));
    expect(xml).toContain(slotValue("documentAvailability", XDS.DOC_AVAILABILITY_ONLINE));
  });

  it("wiąże indeks ze zdarzeniem medycznym (MedicalEventId, encounterId)", () => {
    expect(xml).toContain(XDS.SLOT_MEDICAL_EVENT_ID);
    expect(xml).toContain(
      "316544979021366272^^^&amp;2.16.840.1.113883.3.4424.2.7.1491.15.1&amp;ISO",
    );
    expect(xml).toContain(XDS.ENCOUNTER_ID_TYPE);
  });

  it("ustawia identyfikatory zewnętrzne (uniqueId, patientId) i klasyfikacje", () => {
    expect(xml).toContain(`identificationScheme="${XDS.DE_UNIQUE_ID_SCHEME}"`);
    expect(xml).toContain('value="2.16.840.1.113883.3.4424.2.7.1491^987654321"');
    expect(xml).toContain(`identificationScheme="${XDS.DE_PATIENT_ID_SCHEME}"`);
    expect(xml).toContain(`classificationScheme="${XDS.DE_CLASS_CODE_SCHEME}"`);
    expect(xml).toContain(`classificationScheme="${XDS.DE_TYPE_CODE_SCHEME}"`);
    expect(xml).toContain('nodeRepresentation="06.10"');
    // autor w XCN z OID
    expect(xml).toContain(
      "4727124^Leczniczy^Adam713^^^^^^&amp;2.16.840.1.113883.3.4424.1.6.2&amp;ISO",
    );
  });

  it("klasyfikuje SubmissionSet (RegistryPackage classificationNode)", () => {
    expect(xml).toContain(`classificationNode="${XDS.SS_CLASSIFICATION_NODE}"`);
    expect(xml).toContain(`identificationScheme="${XDS.SS_UNIQUE_ID_SCHEME}"`);
    expect(xml).toContain("Rejestracja indeksu EDM");
  });
});

function slotValue(name: string, value: string): string {
  return `<rim:Slot name="${name}"><rim:ValueList><rim:Value>${value}</rim:Value>`;
}
