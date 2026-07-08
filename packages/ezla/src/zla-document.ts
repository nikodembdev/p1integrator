import { create } from "xmlbuilder2";
import { KED_ZLA_NS } from "./constants.js";
import type { ZlaDocumentResult, ZlaInput } from "./types.js";

/**
 * Builder dokumentu KED ZLA (zaświadczenie lekarskie) - struktura `KEDU > ZUSZLA`
 * z sekcjami rzymskimi I-VIII (ns `http://www.zus.pl/2015/KED_ZLA_1`).
 * Zwraca NIEPODPISANY XML; podpis XML-DSig dokłada konsument przez port
 * `EzlaSigner.signDocument`. SKELETON - sekcje V (kod ubezpieczenia) i VIII (flagi)
 * wymagają domknięcia wg `ked_zla_1.1.xsd` i reguł walidacji (Załącznik 1/2).
 *
 * @see `.local/ezwolnienia-docs/_unz/ZUS_ZLA` - schemat i przykład.
 */
export function buildZlaKedu(input: ZlaInput): ZlaDocumentResult {
  const program = input.program ?? { producent: "p1integrator", symbol: "eZLA", wersja: "1.0" };
  const days = inclusiveDays(input.incapacity.from, input.incapacity.to);

  const root = create({ version: "1.0", encoding: "UTF-8" });
  const kedu = root.ele("KEDU", {
    xmlns: KED_ZLA_NS,
    "xmlns:xsi": "http://www.w3.org/2001/XMLSchema-instance",
    wersja_schematu: "1",
  });

  kedu.ele("naglowek.KEDU").ele("program").ele({
    producent: program.producent,
    symbol: program.symbol,
    wersja: program.wersja,
  });

  kedu.ele({
    ZUSZLA: {
      "@id_dokumentu": input.documentId,
      // I - seria/numer druku + ORYGINAŁ/KOPIA
      I: {
        p1: { p1: input.seriaNumer.seria, p2: input.seriaNumer.numer },
        p2: input.copy ?? "ORYGINAL",
      },
      // II - ubezpieczony (PESEL, imię, nazwisko)
      II: {
        p1: input.insured.pesel,
        p2: input.insured.firstName,
        p3: input.insured.lastName,
      },
      // III - adres ubezpieczonego
      III: {
        p1: input.insuredAddress.postalCode,
        p2: input.insuredAddress.city,
        p3: input.insuredAddress.street,
        p4: input.insuredAddress.houseNumber,
      },
      // IV - okres niezdolności (od/do) + liczba dni
      IV: {
        p1: { p1: input.incapacity.from, p2: input.incapacity.to },
        p3: String(days),
      },
      // VI - płatnik składek
      VI: {
        p1: input.payer.name,
        p2: input.payer.postalCode,
        p3: input.payer.city,
        p4: input.payer.street,
        p5: input.payer.houseNumber,
      },
      // VII - lekarz wystawiający (NPWZ, imię, nazwisko)
      VII: {
        p1: input.doctor.npwz,
        p2: input.doctor.firstName,
        p3: input.doctor.lastName,
      },
      // VIII - data wystawienia (flagi p6/p7/p8 do domknięcia wg XSD)
      VIII: {
        p1: input.issueDate,
      },
    },
  });

  return { keduXml: root.end({ headless: false }), documentId: input.documentId };
}

/** Liczba dni okresu niezdolności (włącznie z dniem początkowym i końcowym). */
function inclusiveDays(from: string, to: string): number {
  const start = Date.parse(from);
  const end = Date.parse(to);
  if (Number.isNaN(start) || Number.isNaN(end)) return 0;
  return Math.floor((end - start) / 86_400_000) + 1;
}
