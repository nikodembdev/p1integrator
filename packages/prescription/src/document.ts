import { create } from "xmlbuilder2";
import { CDA_OID, formatCdaDateTime, type XmlObject } from "@p1/cda";
import {
  DOSAGE_INSTRUCTION_ACT_TEMPLATE,
  MANUFACTURED_MATERIAL_TEMPLATE,
  MANUFACTURED_PRODUCT_TEMPLATE,
  PRESCRIPTION_CODE,
  PRESCRIPTION_DOC_TEMPLATE,
  PRESCRIPTION_HEADER_TEMPLATE,
  PRESCRIPTION_OID,
  PRESCRIPTION_SECTION_TEMPLATE,
  SUBSTANCE_ADMINISTRATION_TEMPLATE,
  SUBSTITUTION_ACT_TEMPLATE,
  SUPPLY_TEMPLATE,
} from "./constants.js";
import type { DrugPrescriptionInput, DrugPrescriptionResult } from "./types.js";

const STRUCTURED_BODY_TEMPLATE = "2.16.840.1.113883.3.4424.13.10.2.25";
const FINSTRUCT_ACT_TEMPLATE = [
  "2.16.840.1.113883.3.4424.13.10.4.75",
  "2.16.840.1.113883.10.20.1.43",
  "1.3.6.1.4.1.19376.1.5.3.1.4.3.1",
] as const;

/**
 * Builder dokumentu recepty na lek (plCdaDrugPrescription, CDA PL PRE / IHE
 * Pharmacy 1.3.2). Nagłówek różni się od skierowania (3 templateId, kwalifikatory
 * KDLEK/RLEK/TWREC/TRREC, brak NFZ boundedBy/participant, brak specjalności
 * autora), więc to dedykowany builder — wzorowany na oficjalnej „recepta-poprawna".
 */
export function buildDrugPrescriptionCda(input: DrugPrescriptionInput): DrugPrescriptionResult {
  const effectiveDate = input.effectiveDate ?? formatCdaDateTime(input.now ?? new Date());
  const versionNumber = input.versionNumber ?? 1;
  const substitutionAllowed = input.substitution ?? true;

  const root = create({ version: "1.0", encoding: "UTF-8" });
  root.ins("xml-stylesheet", 'href="CDA_PL_IG_1.3.2.xsl" type="text/xsl"');
  const clinicalDocument = root.ele("ClinicalDocument", {
    "xsi:type": "extPL:ClinicalDocument",
    xmlns: "urn:hl7-org:v3",
    "xmlns:extPL": "http://www.csioz.gov.pl/xsd/extPL/r3",
    "xmlns:pharm": "urn:ihe:pharm",
    "xmlns:xsi": "http://www.w3.org/2001/XMLSchema-instance",
  });

  clinicalDocument.ele(buildHeader(input, effectiveDate, versionNumber));

  const component = clinicalDocument.ele("component");
  component.ele("templateId", { root: STRUCTURED_BODY_TEMPLATE });
  const structuredBody = component.ele("structuredBody");
  structuredBody.ele({
    component: {
      "@typeCode": "COMP",
      section: buildPrescriptionSection(input, effectiveDate, substitutionAllowed),
    },
  });

  return {
    xml: root.end({ prettyPrint: true }),
    prescriptionNumber: input.prescriptionNumber,
    effectiveDate,
  };
}

function buildHeader(
  input: DrugPrescriptionInput,
  effectiveDate: string,
  versionNumber: number,
): XmlObject {
  const { author, legalAuthenticator } = input;
  const drug = input.drug;
  const qualifier = (
    code: string,
    name: string,
    value: string,
    valueSystem: string,
    valueDisplay?: string,
  ): XmlObject => ({
    name: {
      "@code": code,
      "@codeSystem": CDA_OID.POLISH_CLASSIFIERS,
      "@codeSystemName": "PolskieKlasyfikatoryHL7v3",
      "@displayName": name,
    },
    value: valueDisplay
      ? { "@code": value, "@codeSystem": valueSystem, "@displayName": valueDisplay }
      : { "@code": value, "@codeSystem": valueSystem },
  });

  return {
    typeId: { "@extension": "POCD_HD000040", "@root": CDA_OID.HL7_TYPE_ID },
    templateId: [
      { "@root": PRESCRIPTION_DOC_TEMPLATE.IHE_MEDICAL_DOCUMENT },
      { "@root": PRESCRIPTION_DOC_TEMPLATE.IHE_PRESCRIPTION },
      { "@root": PRESCRIPTION_DOC_TEMPLATE.DRUG_PRESCRIPTION, "@extension": "1.3.2" },
    ],
    id: {
      "@extension": input.prescriptionNumber,
      "@root": `${input.localRoot}.2.1`,
      "@displayable": "true",
    },
    code: {
      "@code": PRESCRIPTION_CODE.DOC_LOINC,
      "@codeSystem": CDA_OID.LOINC,
      "@codeSystemName": "LOINC",
      "@displayName": PRESCRIPTION_CODE.DOC_LOINC_DISPLAY,
      translation: {
        "@code": PRESCRIPTION_CODE.DOC_P1_CLASS,
        "@codeSystem": CDA_OID.DOC_CLASS_P1,
        "@codeSystemName": "KLAS_DOK_P1",
        "@displayName": PRESCRIPTION_CODE.DOC_P1_CLASS_DISPLAY,
        qualifier: [
          qualifier(
            "KDLEK",
            "Kategoria dostępności leku",
            drug.availabilityCategory ?? "Rp",
            PRESCRIPTION_OID.DRUG_AVAILABILITY,
          ),
          qualifier("RLEK", "Rodzaj leku", "G", CDA_OID.POLISH_CLASSIFIERS, "Lek gotowy"),
          qualifier("TWREC", "Tryb wystawienia recepty", "Z", CDA_OID.POLISH_CLASSIFIERS, "Zwykła"),
          qualifier("TRREC", "Tryb realizacji recepty", "Z", CDA_OID.POLISH_CLASSIFIERS, "Zwykły"),
        ],
      },
    },
    title: PRESCRIPTION_CODE.DOC_P1_CLASS_DISPLAY,
    effectiveTime: { "@value": effectiveDate },
    confidentialityCode: { "@code": "N", "@codeSystem": CDA_OID.HL7_CONFIDENTIALITY },
    languageCode: { "@code": "pl-PL" },
    setId: { "@extension": input.versionSetId.extension, "@root": input.versionSetId.root },
    versionNumber: { "@value": String(versionNumber) },
    recordTarget: buildRecordTarget(input),
    author: buildAuthor(author, effectiveDate),
    custodian: buildCustodian(),
    legalAuthenticator: {
      templateId: { "@root": PRESCRIPTION_HEADER_TEMPLATE.LEGAL_AUTHENTICATOR },
      time: { "@value": legalAuthenticator.time ?? effectiveDate },
      signatureCode: { "@code": "S" },
      assignedEntity: {
        id: {
          "@extension": legalAuthenticator.npwz,
          "@root": CDA_OID.NPWZ,
          "@displayable": "true",
        },
      },
    },
  };
}

function buildRecordTarget(input: DrugPrescriptionInput): XmlObject {
  const { patient } = input;
  const a = patient.address;
  const postalCode: XmlObject = a.postCity
    ? { "@xsi:type": "extPL:adxp.postalCode", "@postCity": a.postCity, "#": a.postalCode }
    : { "#": a.postalCode };
  const addr: XmlObject = {
    country: a.country ?? "Polska",
    postalCode,
    city: a.city,
  };
  if (a.street) addr.streetName = a.street;
  addr.houseNumber = a.houseNumber;
  if (a.unitId) addr.unitID = a.unitId;
  if (a.censusTract) addr.censusTract = a.censusTract;

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
    templateId: { "@root": PRESCRIPTION_HEADER_TEMPLATE.RECORD_TARGET },
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

function buildAuthor(author: DrugPrescriptionInput["author"], effectiveDate: string): XmlObject {
  const org = author.organization;
  return {
    templateId: { "@root": PRESCRIPTION_HEADER_TEMPLATE.AUTHOR },
    functionCode: {
      "@code": "LEK",
      "@codeSystem": CDA_OID.FUNCTION_CODES,
      "@displayName": "Lekarz",
    },
    time: { "@value": author.time ?? effectiveDate },
    assignedAuthor: {
      id: { "@extension": author.npwz, "@root": CDA_OID.NPWZ, "@displayable": "true" },
      assignedPerson: {
        templateId: { "@root": PRESCRIPTION_HEADER_TEMPLATE.PERSON },
        name: {
          prefix: author.prefix ?? "lek.",
          given: [...author.givenNames],
          family: author.familyName,
        },
      },
      representedOrganization: {
        templateId: { "@root": PRESCRIPTION_HEADER_TEMPLATE.ORGANIZATION_UNIT },
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
      },
    },
  };
}

function buildCustodian(): XmlObject {
  return {
    templateId: { "@root": PRESCRIPTION_HEADER_TEMPLATE.CUSTODIAN },
    assignedCustodian: {
      representedCustodianOrganization: {
        id: { "@root": CDA_OID.CSIOZ, "@assigningAuthorityName": "CSIOZ", "@displayable": "false" },
      },
    },
  };
}

function buildPrescriptionSection(
  input: DrugPrescriptionInput,
  effectiveDate: string,
  substitutionAllowed: boolean,
): XmlObject {
  const { drug, dosage, payment } = input;
  const content = (id: string, text?: string, styleCode?: string): XmlObject => {
    const c: XmlObject = { "@ID": id };
    if (styleCode) c["@styleCode"] = styleCode;
    if (text !== undefined) c["#"] = text;
    return c;
  };

  // Narracja MUSI odzwierciedlać blok strukturalny (REG.WER.3252) — wyliczamy ją
  // z danych, replikując oficjalną transformatę narracyjną P1 (1.3.2).
  const strength = drug.strengthText ?? computeStrengthNarrative(drug.ingredients);
  const dosageText = computeDosageNarrative(dosage, effectiveDate);

  const sbadmContent: XmlObject[] = [
    content("p1_nazwaLeku", drug.name, "xPLbig"),
    content("p1_mocSkladnikowLeku", strength),
  ];
  if (!substitutionAllowed) sbadmContent.push(content("p1_nieZamieniac", "NZ", "xPLbig"));

  const paragraphs: XmlObject[] = [
    { "@ID": "SBADM_1", content: sbadmContent },
    {
      content: [
        content("p1_iloscLeku", payment.packageCount),
        content("p1_krotnosc_opis", `x ${drug.formName} po`),
        content("p1_wielkoscOpakowania", `${drug.capacityValue} ${drug.capacityUnit}`),
      ],
    },
    {
      "@ID": "DS_1",
      content: [
        content("p1_stosowanie_opis_1", "D.S."),
        ...(dosageText ? [content("p1_stosowanie_wartosc_1", dosageText, "Bold")] : []),
      ],
    },
    {
      "@ID": "ACT_1",
      content: [
        content("p1_odplatnosc_opis", "Odpłatność"),
        content("p1_odplatnosc_wartosc", payment.level, "Bold"),
      ],
    },
  ];
  // Akapit „informacja dla wydającego" tylko gdy istnieje odpowiadający akt FINSTRUCT.
  if (input.dispenserInfo) {
    paragraphs.push({
      "@ID": "TEXT1",
      content: [
        content("p1_infoDlaWydajacego_opis_1", "Informacja dla osoby wydającej lek:"),
        content("p1_infoDlaWydajacego_wartosc_1", input.dispenserInfo),
      ],
    });
  }

  const text: XmlObject = { paragraph: paragraphs };

  return {
    templateId: [
      { "@root": PRESCRIPTION_SECTION_TEMPLATE.SECTION_IHE },
      { "@root": PRESCRIPTION_SECTION_TEMPLATE.SECTION },
    ],
    id: { "@extension": input.sectionId ?? "1", "@root": `${input.localRoot}.2.4` },
    code: {
      "@code": PRESCRIPTION_CODE.SECTION_LOINC,
      "@codeSystem": CDA_OID.LOINC,
      "@codeSystemName": "LOINC",
      "@displayName": "Prescriptions",
    },
    title: "Rp",
    text,
    entry: {
      substanceAdministration: buildSubstanceAdministration(
        input,
        effectiveDate,
        substitutionAllowed,
      ),
    },
  };
}

function buildSubstanceAdministration(
  input: DrugPrescriptionInput,
  effectiveDate: string,
  substitutionAllowed: boolean,
): XmlObject {
  const { drug, dosage } = input;

  const effectiveTime: XmlObject[] = [];
  if (dosage.startDate || dosage.endDate) {
    const ivl: XmlObject = { "@xsi:type": "IVL_TS" };
    if (dosage.startDate) ivl.low = { "@value": dosage.startDate };
    if (dosage.endDate) ivl.high = { "@value": dosage.endDate };
    effectiveTime.push(ivl);
  }
  if (dosage.periodUnit && dosage.periodValue) {
    effectiveTime.push({
      "@operator": "A",
      "@xsi:type": "PIVL_TS",
      period: { "@unit": dosage.periodUnit, "@value": dosage.periodValue },
    });
  }

  const sbadm: XmlObject = {
    "@classCode": "SBADM",
    "@moodCode": "INT",
    templateId: SUBSTANCE_ADMINISTRATION_TEMPLATE.map((root) => ({ "@root": root })),
    id: {
      "@extension": `${input.prescriptionNumber}-1`,
      "@root": `${input.localRoot}.2.3`,
    },
    text: { reference: { "@value": "#SBADM_1" } },
    statusCode: { "@code": "completed" },
  };
  if (effectiveTime.length > 0) sbadm.effectiveTime = effectiveTime;
  // repeatNumber jest mandatory w P1 (plCdaDrugPrescriptionEntry); domyślnie 0 (bez powtórzeń).
  sbadm.repeatNumber = { "@value": dosage.repeatNumber ?? "0" };
  if (dosage.doseQuantity) {
    sbadm.doseQuantity = dosage.doseUnit
      ? { "@unit": dosage.doseUnit, "@value": dosage.doseQuantity }
      : { "@value": dosage.doseQuantity };
  }
  if (dosage.rateValue) {
    sbadm.rateQuantity = { "@unit": dosage.rateUnit ?? "1", "@value": dosage.rateValue };
  }

  sbadm.consumable = {
    manufacturedProduct: {
      templateId: MANUFACTURED_PRODUCT_TEMPLATE.map((root) => ({ "@root": root })),
      manufacturedMaterial: {
        templateId: MANUFACTURED_MATERIAL_TEMPLATE.map((root) => ({ "@root": root })),
        code: {
          "@code": drug.code,
          "@codeSystem": PRESCRIPTION_OID.DRUG_ID,
          "@displayName": drug.name,
        },
        name: drug.name,
        "pharm:asContent": {
          "@classCode": "CONT",
          "pharm:containerPackagedMedicine": {
            "@classCode": "CONT",
            "@determinerCode": "INSTANCE",
            "pharm:code": {
              "@code": drug.packageEan,
              "@codeSystem": PRESCRIPTION_OID.GS1,
              "@codeSystemName": "GS1",
            },
            "pharm:name": drug.packageName,
            "pharm:formCode": {
              "@code": drug.formCode,
              "@codeSystem": PRESCRIPTION_OID.FORM_CODE,
              "@displayName": drug.formName,
            },
            "pharm:capacityQuantity": { "@unit": drug.capacityUnit, "@value": drug.capacityValue },
          },
        },
        "pharm:ingredient": drug.ingredients.map((ing) => {
          const denominator: XmlObject = { "@value": ing.denominatorValue, "@xsi:type": "PQ" };
          if (ing.denominatorUnit) denominator["@unit"] = ing.denominatorUnit;
          return {
            "@classCode": "ACTI",
            "pharm:quantity": {
              numerator: {
                "@unit": ing.numeratorUnit,
                "@value": ing.numeratorValue,
                "@xsi:type": "PQ",
              },
              denominator,
            },
            "pharm:ingredient": {
              "@classCode": "MMAT",
              "@determinerCode": "KIND",
              "pharm:code": {
                "@code": ing.code,
                "@codeSystem": PRESCRIPTION_OID.SUBSTANCE_ID,
                "@displayName": ing.name,
              },
              "pharm:name": ing.name,
            },
          };
        }),
      },
    },
  };

  const entryRelationship: XmlObject[] = [buildSupplyRelationship(input, effectiveDate)];
  if (!substitutionAllowed) entryRelationship.push(buildSubstitutionRelationship());
  entryRelationship.push(
    buildInstructionRelationship(DOSAGE_INSTRUCTION_ACT_TEMPLATE, "PINSTRUCT", "#DS_1"),
  );
  if (input.dispenserInfo) {
    entryRelationship.push(
      buildInstructionRelationship(FINSTRUCT_ACT_TEMPLATE, "FINSTRUCT", "#TEXT1"),
    );
  }
  sbadm.entryRelationship = entryRelationship;

  return sbadm;
}

function buildSupplyRelationship(input: DrugPrescriptionInput, effectiveDate: string): XmlObject {
  const { drug, payment } = input;
  return {
    "@typeCode": "COMP",
    supply: {
      "@classCode": "SPLY",
      "@moodCode": "RQO",
      templateId: SUPPLY_TEMPLATE.map((root) => ({ "@root": root })),
      effectiveTime: { "@value": effectiveDate },
      independentInd: { "@value": "false" },
      quantity: { "@value": payment.packageCount },
      product: {
        manufacturedProduct: {
          manufacturedLabeledDrug: {
            code: {
              "@code": drug.packageEan,
              "@codeSystem": PRESCRIPTION_OID.GS1,
              "@codeSystemName": "GS1",
              "@displayName": drug.packageName,
            },
          },
        },
      },
      entryRelationship: {
        "@typeCode": "COMP",
        act: {
          "@classCode": "ACT",
          "@moodCode": "DEF",
          templateId: { "@root": "2.16.840.1.113883.3.4424.13.10.4.57" },
          code: {
            "@code": PRESCRIPTION_CODE.PAYMENT_LOINC,
            "@codeSystem": CDA_OID.LOINC,
            "@displayName": "Payment source",
          },
          text: { reference: { "@value": "#ACT_1" } },
          statusCode: { "@code": "completed" },
          entryRelationship: {
            "@typeCode": "COMP",
            act: {
              "@classCode": "ACT",
              "@moodCode": "EVN",
              code: {
                "@code": "PUBLICPOL",
                "@codeSystem": PRESCRIPTION_OID.HL7_ACT,
                qualifier: {
                  name: {
                    "@code": "RLPO",
                    "@codeSystem": CDA_OID.POLISH_CLASSIFIERS,
                    "@codeSystemName": "PolskieKlasyfikatoryHL7v3",
                    "@displayName": "Poziomy odpłatności leków refundowanych",
                  },
                  value: {
                    "@code": payment.level,
                    "@codeSystem": PRESCRIPTION_OID.PAYMENT_LEVEL,
                    "@displayName": payment.levelDisplay ?? payment.level,
                  },
                },
              },
              statusCode: { "@code": "completed" },
              performer: {
                "@typeCode": "PRF",
                assignedEntity: {
                  id: {
                    "@extension": payment.nfzBranch,
                    "@root": PRESCRIPTION_OID.NFZ_BRANCH,
                    "@displayable": "true",
                  },
                },
              },
            },
          },
        },
      },
    },
  };
}

function buildSubstitutionRelationship(): XmlObject {
  return {
    "@typeCode": "COMP",
    act: {
      "@classCode": "ACT",
      "@moodCode": "DEF",
      templateId: SUBSTITUTION_ACT_TEMPLATE.map((root) => ({ "@root": root })),
      code: {
        "@code": PRESCRIPTION_CODE.SUBSTITUTION,
        "@codeSystem": PRESCRIPTION_OID.HL7_SUBSTITUTION,
        "@codeSystemName": "HL7 Substance Admin Substitution",
      },
      text: { reference: { "@value": "#ACT_1" } },
      statusCode: { "@code": "completed" },
    },
  };
}

function buildInstructionRelationship(
  templates: readonly string[],
  code: string,
  reference: string,
): XmlObject {
  return {
    "@inversionInd": "true",
    "@typeCode": "SUBJ",
    act: {
      "@classCode": "ACT",
      "@moodCode": "INT",
      templateId: templates.map((root) => ({ "@root": root })),
      code: {
        "@code": code,
        "@codeSystem": PRESCRIPTION_OID.IHE_ACT,
        "@codeSystemName": "IHEActCode",
      },
      text: { reference: { "@value": reference } },
      statusCode: { "@code": "completed" },
    },
  };
}

// --- Generowanie bloku narracyjnego ze struktury (replika transformaty P1 1.3.2) ---

const POLISH_MONTHS_GENITIVE = [
  "",
  "stycznia",
  "lutego",
  "marca",
  "kwietnia",
  "maja",
  "czerwca",
  "lipca",
  "sierpnia",
  "września",
  "października",
  "listopada",
  "grudnia",
] as const;

/** Data YYYYMMDD → „D miesiąca YYYY r." (format transformaty narracyjnej). */
function formatPolishDate(yyyymmdd: string): string {
  const year = Number(yyyymmdd.slice(0, 4));
  const month = Number(yyyymmdd.slice(4, 6));
  const day = Number(yyyymmdd.slice(6, 8));
  return `${day} ${POLISH_MONTHS_GENITIVE[month] ?? ""} ${year} r.`;
}

/** YYYYMMDD → liczba porównywalna (jak w transformacie). */
function dateToNumber(yyyymmdd: string): number {
  return (
    10000 * Number(yyyymmdd.slice(0, 4)) +
    100 * Number(yyyymmdd.slice(4, 6)) +
    Number(yyyymmdd.slice(6, 8))
  );
}

function ingredientStrength(ing: DrugPrescriptionInput["drug"]["ingredients"][number]): string {
  let s = ing.numeratorValue;
  if (ing.numeratorUnit) s += ` ${ing.numeratorUnit}`;
  // mianownik tylko gdy wartość != 1 lub podano jednostkę != 1
  if (ing.denominatorValue && (ing.denominatorValue !== "1" || ing.denominatorUnit)) {
    s += ` / ${ing.denominatorValue}`;
    if (ing.denominatorUnit) s += ` ${ing.denominatorUnit}`;
  }
  return s;
}

/** Wylicza `p1_mocSkladnikowLeku` ze składników (replika transformaty). */
function computeStrengthNarrative(
  ingredients: DrugPrescriptionInput["drug"]["ingredients"],
): string {
  if (ingredients.length === 0) return "";
  const first = ingredients[0];
  if (ingredients.length === 1 && first) return `(${ingredientStrength(first)})`;

  const denUnits = new Set(ingredients.map((i) => i.denominatorUnit).filter(Boolean));
  const denValues = new Set(ingredients.map((i) => i.denominatorValue).filter(Boolean));
  if (denUnits.size === 1 && denValues.size <= 1) {
    const nums = ingredients
      .map((i) => i.numeratorValue + (i.numeratorUnit ? ` ${i.numeratorUnit}` : ""))
      .join(" + ");
    const denUnit = [...denUnits][0] ?? "";
    const denValue = [...denValues][0];
    const denPrefix = denValues.size === 1 && denValue !== "1" ? `${denValue ?? ""} ` : "";
    return `(${nums}) / ${denPrefix}${denUnit}`;
  }
  return ingredients.map(ingredientStrength).join(" + ");
}

/** Wylicza `p1_stosowanie_wartosc_1` z dawkowania (replika transformaty). */
function computeDosageNarrative(
  dosage: DrugPrescriptionInput["dosage"],
  supplyDate: string,
): string {
  if (!dosage.periodUnit || !dosage.periodValue || !dosage.doseQuantity) return "";

  let freq: string;
  if (dosage.periodUnit === "h" && dosage.periodValue === "24") freq = "Raz dziennie";
  else if (dosage.periodUnit === "h" && dosage.periodValue === "12") freq = "2 x dziennie";
  else if (dosage.periodUnit === "h" && dosage.periodValue === "8") freq = "3 x dziennie";
  else if (dosage.periodUnit === "h" && dosage.periodValue === "6") freq = "4 x dziennie";
  else freq = `Co ${dosage.periodValue} ${dosage.periodUnit}`;

  const dose = dosage.doseUnit
    ? `${dosage.doseQuantity} ${dosage.doseUnit}`
    : `${dosage.doseQuantity} szt.`;
  let s = `${freq} po ${dose}`;

  if (dosage.startDate && dateToNumber(dosage.startDate) > dateToNumber(supplyDate)) {
    s += `, rozpocząć ${formatPolishDate(dosage.startDate)}`;
  }
  if (dosage.endDate && dosage.endDate.length >= 6) {
    s += `, zakończyć do ${formatPolishDate(dosage.endDate)}`;
  }
  const repeat = Number(dosage.repeatNumber ?? "0");
  if (repeat >= 1) s += `, powtórzyć cykl ${repeat}${repeat === 1 ? " raz" : " razy"}`;
  return s;
}
