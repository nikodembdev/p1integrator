import {
  err,
  ok,
  type OperationOutcome,
  type P1Error,
  P1TransportError,
  type Result,
} from "@p1/core";
import { CDA_OID } from "@p1/cda";
import {
  buildSoapEnvelope,
  parseSoapResponse,
  type ParsedSoapResponse,
  signWsSecurity,
} from "@p1/transport";
import {
  PRESCRIPTION_CONTEXT_NAMESPACE,
  PRESCRIPTION_CONTEXT_URN_PREFIX,
  PRESCRIPTION_MT_NS,
  type PrescriptionTransport,
  PRESCRIPTION_WS_NS,
} from "./submit.js";
import { collectRecords, fieldText, findText } from "./xml-walk.js";

/** Namespace `wspolne` (extension/root identyfikatorów OID) dla e-recepty. */
export const PRESCRIPTION_COMMON_NS = "http://csioz.gov.pl/p1/wspolne/mt/v20170510";

const ACTION = {
  SEARCH: "urn:wyszukanieReceptUslugobiorcy",
  SEARCH_EXTENDED: "urn:rozszerzoneWyszukiwanieReceptUslugobiorcy",
  KEYS: "urn:odczytKluczyReceptUslugobiorcy",
  SEARCH_ISSUER: "urn:wyszukanieReceptWystawiajacego",
  READ: "urn:odczytRecepty",
  READ_PACKAGE: "urn:odczytPakietuRecept",
  ACCESS_DATA: "urn:odczytDanychDostepowychPakietuRecept",
  FULFILLMENT_STATE: "urn:odczytStanuRealizacjiRecepty",
  READ_FULFILLMENT_DOC: "urn:odczytDokumentuRealizacjiRecepty",
  READ_CANCELLATION_DOC: "urn:odczytDokumentuAnulowaniaRecepty",
  SEARCH_FULFILLMENT_DOCS: "urn:wyszukanieDokumentowRealizacjiRecept",
  SEARCH_CANCELLATION_DOCS: "urn:wyszukanieDokumentowAnulowaniaRecept",
} as const;

/** Transport dla operacji odczytowych - jak `PrescriptionTransport`, ale bez podpisu CDA. */
export type PrescriptionQueryTransport = Omit<PrescriptionTransport, "documentSigner">;

/** Status recepty w P1 (`StatusReceptyEnumMT`). */
export type PrescriptionStatus =
  | "WYSTAWIONA"
  | "ZABLOKOWANA"
  | "ZREALIZOWANA"
  | "CZESCIOWO_ZREALIZOWANA"
  | "ANULOWANA";

/** Status dokumentu realizacji (`StatusDokumentuRealizacjiReceptyEnumMT`). */
export type FulfillmentDocumentStatus = "OBOWIAZUJACY" | "SKORYGOWANY";

/** Rodzaj realizacji (`RodzajRealizacjiEnumMT`). */
export type FulfillmentKind = "CZESCIOWA" | "WYCOFUJACA" | "ZAMYKAJACA";

/** Identyfikator OID (root + extension). */
export interface OidIdentifier {
  readonly root: string;
  readonly extension: string;
}

// --- wyszukanieReceptUslugobiorcy ---

/** Kryteria wyszukiwania recept usługobiorcy (pacjenta). Wymagany jest PESEL. */
export interface PatientPrescriptionSearchCriteria {
  /** PESEL pacjenta (usługobiorcy), dla którego wystawiono recepty. */
  pesel: string;
  /** Dolne ograniczenie daty wystawienia. */
  issuedFrom?: Date;
  /** Górne ograniczenie daty wystawienia. */
  issuedTo?: Date;
  /** Filtr po wystawiającym (NPWZ pracownika medycznego). */
  practitionerNpwz?: string;
  /** Filtr po statusie recepty. */
  status?: PrescriptionStatus;
}

/** Pojedynczy wynik wyszukiwania recepty pacjenta. */
export interface PatientPrescriptionSummary {
  /** `kluczRecepty` - klucz dostępowy do odczytu recepty (`readPrescription`). */
  readonly prescriptionKey: string;
  /** `kluczPakietu` - klucz pakietu zawierającego receptę. */
  readonly packageKey?: string;
  /** `dataWystawieniaRecepty` - moment zapisu recepty w P1 (ISO dateTime). */
  readonly issuedAt?: string;
  /** `numerRecepty` (root + extension) nadany przez usługodawcę. */
  readonly prescriptionNumber?: OidIdentifier;
  /** `statusRecepty`. */
  readonly status?: string;
  /** `przyczynaZablokowaniaRecepty` (gdy zablokowana). */
  readonly blockReason?: string;
  /** `podmiotNazwa` - nazwa podmiotu wystawiającego. */
  readonly providerName?: string;
  /** `wystawcaNazwa` - nazwa wystawcy (lekarza). */
  readonly issuerName?: string;
  /** NPWZ wystawcy (`identyfikatorPracownikaWystawcy`). */
  readonly issuerNpwz?: string;
}

export interface PatientPrescriptionSearchResult {
  readonly prescriptions: readonly PatientPrescriptionSummary[];
  readonly outcome?: OperationOutcome;
}

/**
 * Wyszukuje recepty pacjenta (operacja `wyszukanieReceptUslugobiorcy`).
 * Zwraca listę podsumowań z `kluczRecepty` - klucz przekaż do `readPrescription`,
 * by pobrać treść CDA. Zbyt szerokie kryteria → biznesowy błąd `PrzekroczonaLiczbaWynikow`
 * (sprawdzaj `outcome.major`); użyj `searchPatientPrescriptionsExtended` ze stronicowaniem.
 */
export async function searchPatientPrescriptions(
  criteria: PatientPrescriptionSearchCriteria,
  transport: PrescriptionQueryTransport,
): Promise<Result<PatientPrescriptionSearchResult, P1Error>> {
  const body =
    `<ws:WyszukanieReceptUslugobiorcyRequest><kryteriaWyszukiwaniaReceptUslugobiorcy>` +
    dateEl("dataWystawieniaReceptyDo", criteria.issuedTo) +
    dateEl("dataWystawieniaReceptyOd", criteria.issuedFrom) +
    (criteria.practitionerNpwz
      ? `<r:idPracownikaMedycznego>${oid(criteria.practitionerNpwz, CDA_OID.NPWZ)}</r:idPracownikaMedycznego>`
      : "") +
    `<r:idUslugobiorcy>${oid(criteria.pesel, CDA_OID.PESEL)}</r:idUslugobiorcy>` +
    (criteria.status ? `<r:statusRecepty>${criteria.status}</r:statusRecepty>` : "") +
    `</kryteriaWyszukiwaniaReceptUslugobiorcy></ws:WyszukanieReceptUslugobiorcyRequest>`;

  const parsed = await callService(body, ACTION.SEARCH, transport);
  if (!parsed.ok) return parsed;
  return ok({
    prescriptions: collectRecords(parsed.value.body, "wynikWyszukiwaniaReceptUslugobiorcy")
      .map(toSummary)
      .filter(isDefined),
    ...outcomeOf(parsed.value),
  });
}

// --- rozszerzoneWyszukiwanieReceptUslugobiorcy ---

/** Parametry stronicowania (wymagane razem, gdy podane). */
export interface PagingParams {
  /** Rozmiar strony (>= 1). */
  pageSize: number;
  /** Numer strony (od 0). */
  pageNumber: number;
  /** Kierunek sortowania po dacie wystawienia. */
  sort: "ROSNACO" | "MALEJACO";
  /** Czy zwrócić łączną liczbę rekordów (`liczbaDokumentow`). */
  includeCount: boolean;
}

/** Rozszerzone kryteria wyszukiwania recept usługobiorcy. Wymagany jest PESEL. */
export interface PatientPrescriptionExtendedCriteria {
  pesel: string;
  issuedFrom?: Date;
  issuedTo?: Date;
  /** Filtr po nazwie leku. */
  drugName?: string;
  /** Filtr po numerze recepty. */
  prescriptionNumber?: OidIdentifier;
  status?: PrescriptionStatus;
  /** Stronicowanie/sortowanie wyników. */
  paging?: PagingParams;
  /** Sytuacja zagrożenia życia (szerszy dostęp do recept). */
  lifeThreatening?: boolean;
}

/** Wynik rozszerzonego wyszukiwania - bogatszy niż podstawowy. */
export interface PatientPrescriptionExtended {
  readonly prescriptionKey?: string;
  readonly issuedAt?: string;
  readonly firstDispenseAt?: string;
  readonly drugName?: string;
  readonly prescriptionNumber?: OidIdentifier;
  readonly status?: string;
  readonly blockReason?: string;
  readonly packageSize?: string;
  readonly drugQuantity?: string;
  readonly paymentLevel?: string;
  /** `statusMozliwosciRealizacjiRecepty` - czy receptę można obecnie zrealizować. */
  readonly fulfillable?: boolean;
}

export interface PatientPrescriptionExtendedResult {
  readonly prescriptions: readonly PatientPrescriptionExtended[];
  /** `liczbaDokumentow` - łączna liczba rekordów (gdy `paging.includeCount`). */
  readonly totalCount?: number;
  readonly outcome?: OperationOutcome;
}

/**
 * Rozszerzone wyszukiwanie recept pacjenta (operacja
 * `rozszerzoneWyszukiwanieReceptUslugobiorcy`) - filtr po nazwie leku i stronicowanie,
 * obejście limitu wyników podstawowego wyszukiwania.
 */
export async function searchPatientPrescriptionsExtended(
  criteria: PatientPrescriptionExtendedCriteria,
  transport: PrescriptionQueryTransport,
): Promise<Result<PatientPrescriptionExtendedResult, P1Error>> {
  const body =
    `<ws:RozszerzoneWyszukiwanieReceptUslugobiorcyRequest>` +
    `<rozszerzoneKryteriaWyszukiwaniaReceptUslugobiorcy>` +
    dateEl("dataWystawieniaReceptyDo", criteria.issuedTo) +
    dateEl("dataWystawieniaReceptyOd", criteria.issuedFrom) +
    `<r:idUslugobiorcy>${oid(criteria.pesel, CDA_OID.PESEL)}</r:idUslugobiorcy>` +
    (criteria.drugName ? `<r:nazwaLeku>${escapeXml(criteria.drugName)}</r:nazwaLeku>` : "") +
    numerReceptyEl(criteria.prescriptionNumber) +
    (criteria.status ? `<r:statusRecepty>${criteria.status}</r:statusRecepty>` : "") +
    pagingEl(criteria.paging) +
    (criteria.lifeThreatening !== undefined
      ? `<r:czySytuacjaZagrozeniaZycia>${criteria.lifeThreatening}</r:czySytuacjaZagrozeniaZycia>`
      : "") +
    `</rozszerzoneKryteriaWyszukiwaniaReceptUslugobiorcy>` +
    `</ws:RozszerzoneWyszukiwanieReceptUslugobiorcyRequest>`;

  const parsed = await callService(body, ACTION.SEARCH_EXTENDED, transport);
  if (!parsed.ok) return parsed;
  const totalText = findText(parsed.value.body, "liczbaDokumentow");
  return ok({
    prescriptions: collectRecords(
      parsed.value.body,
      "wynikRozszerzonegoWyszukiwaniaReceptUslugobiorcy",
    ).map(toExtended),
    ...(totalText !== undefined ? { totalCount: Number(totalText) } : {}),
    ...outcomeOf(parsed.value),
  });
}

// --- odczytKluczyReceptUslugobiorcy ---

/** Klucz recepty pacjenta z odczytu kluczy. */
export interface PatientPrescriptionKey {
  readonly prescriptionKey: string;
  readonly issuedAt?: string;
  readonly dispenseFrom?: string;
  readonly issuerName?: string;
  readonly drugName?: string;
  readonly status?: string;
}

export interface PatientPrescriptionKeysResult {
  readonly keys: readonly PatientPrescriptionKey[];
  readonly outcome?: OperationOutcome;
}

/**
 * Odczytuje klucze recept pacjenta (operacja `odczytKluczyReceptUslugobiorcy`).
 * Wariant pod uwierzytelnienie e-Dowodem: `signedDocument` to base64 dokumentu
 * `DokumentPodpisanyEDowodemMT` (gdy pominięty, P1 stosuje kontekst wywołania).
 */
export async function readPatientPrescriptionKeys(
  transport: PrescriptionQueryTransport,
  signedDocument?: string,
): Promise<Result<PatientPrescriptionKeysResult, P1Error>> {
  const body =
    `<ws:OdczytKluczyReceptUslugobiorcyRequest><odczytKluczyReceptUslugobiorcy>` +
    (signedDocument ? `<r:podpisanyDokument>${signedDocument}</r:podpisanyDokument>` : "") +
    `</odczytKluczyReceptUslugobiorcy></ws:OdczytKluczyReceptUslugobiorcyRequest>`;

  const parsed = await callService(body, ACTION.KEYS, transport);
  if (!parsed.ok) return parsed;
  return ok({
    keys: collectRecords(parsed.value.body, "wynikWyszukiwaniaKluczyReceptUslugobiorcy")
      .map(toKey)
      .filter(isDefined),
    ...outcomeOf(parsed.value),
  });
}

// --- wyszukanieReceptWystawiajacego ---

/** Kryteria wyszukiwania recept wystawionych (przez wystawiającego). Wszystkie opcjonalne. */
export interface IssuerPrescriptionSearchCriteria {
  issuedFrom?: Date;
  issuedTo?: Date;
  /** NPWZ wystawiającego. */
  practitionerNpwz?: string;
  /** PESEL pacjenta. */
  pesel?: string;
  prescriptionNumber?: OidIdentifier;
  status?: PrescriptionStatus;
}

export interface IssuerPrescriptionSearchResult {
  readonly prescriptions: readonly PatientPrescriptionSummary[];
  readonly outcome?: OperationOutcome;
}

/**
 * Wyszukuje recepty wystawione (operacja `wyszukanieReceptWystawiajacego`) - z perspektywy
 * wystawiającego, np. po NPWZ lub numerze recepty. Struktura wyniku jak przy pacjencie.
 */
export async function searchIssuerPrescriptions(
  criteria: IssuerPrescriptionSearchCriteria,
  transport: PrescriptionQueryTransport,
): Promise<Result<IssuerPrescriptionSearchResult, P1Error>> {
  const body =
    `<ws:WyszukanieReceptWystawiajacegoRequest><kryteriaWyszukiwaniaRecept>` +
    dateEl("dataWystawieniaReceptyDo", criteria.issuedTo) +
    dateEl("dataWystawieniaReceptyOd", criteria.issuedFrom) +
    (criteria.practitionerNpwz
      ? `<r:idPracownikaMedycznego>${oid(criteria.practitionerNpwz, CDA_OID.NPWZ)}</r:idPracownikaMedycznego>`
      : "") +
    (criteria.pesel
      ? `<r:idUslugobiorcy>${oid(criteria.pesel, CDA_OID.PESEL)}</r:idUslugobiorcy>`
      : "") +
    numerReceptyEl(criteria.prescriptionNumber) +
    (criteria.status ? `<r:statusRecepty>${criteria.status}</r:statusRecepty>` : "") +
    `</kryteriaWyszukiwaniaRecept></ws:WyszukanieReceptWystawiajacegoRequest>`;

  const parsed = await callService(body, ACTION.SEARCH_ISSUER, transport);
  if (!parsed.ok) return parsed;
  return ok({
    prescriptions: collectRecords(parsed.value.body, "wynikWyszukiwaniaRecept")
      .map(toSummary)
      .filter(isDefined),
    ...outcomeOf(parsed.value),
  });
}

// --- odczytRecepty ---

/** Treść odczytanej recepty (`odczytRecepty`). */
export interface PrescriptionContent {
  /** `statusRecepty`. */
  readonly status?: string;
  /** `identyfikatorDokumentuWPakiecie`. */
  readonly documentIdInPackage?: string;
  /** Dokument CDA recepty (odkodowany z base64 `tresc`). */
  readonly cdaXml?: string;
  readonly outcome?: OperationOutcome;
}

/**
 * Odczytuje treść recepty po kluczu (operacja `odczytRecepty`). `prescriptionKey`
 * pochodzi z `searchPatientPrescriptions`. Zwraca dokument CDA (odkodowany z base64).
 */
export async function readPrescription(
  prescriptionKey: string,
  transport: PrescriptionQueryTransport,
): Promise<Result<PrescriptionContent, P1Error>> {
  const body =
    `<ws:OdczytReceptyRequest>` +
    `<kluczRecepty><r:kluczRecepty>${escapeXml(prescriptionKey)}</r:kluczRecepty></kluczRecepty>` +
    `</ws:OdczytReceptyRequest>`;

  const parsed = await callService(body, ACTION.READ, transport);
  if (!parsed.ok) return parsed;
  const recepta = collectRecords(parsed.value.body, "recepta")[0];
  return ok(toContent(recepta, findText(parsed.value.body, "statusRecepty"), parsed.value));
}

// --- odczytPakietuRecept ---

export interface PrescriptionPackageContent {
  /** Recepty w pakiecie (każda z treścią CDA). */
  readonly prescriptions: readonly PrescriptionContent[];
  readonly outcome?: OperationOutcome;
}

/**
 * Odczytuje cały pakiet recept po kluczu pakietu (operacja `odczytPakietuRecept`).
 * Zwraca listę recept z treścią CDA.
 */
export async function readPrescriptionPackage(
  packageKey: string,
  transport: PrescriptionQueryTransport,
): Promise<Result<PrescriptionPackageContent, P1Error>> {
  const body =
    `<ws:OdczytPakietuReceptRequest>` +
    `<kluczPakietuRecept><r:kluczPakietuRecept>${escapeXml(packageKey)}</r:kluczPakietuRecept></kluczPakietuRecept>` +
    `</ws:OdczytPakietuReceptRequest>`;

  const parsed = await callService(body, ACTION.READ_PACKAGE, transport);
  if (!parsed.ok) return parsed;
  const items = collectRecords(parsed.value.body, "receptaIWynikWeryfikacji");
  return ok({
    prescriptions: items.map((item) => {
      const recepta = collectRecords(item, "recepta")[0];
      return toContent(recepta, fieldText(item, "statusRecepty"));
    }),
    ...outcomeOf(parsed.value),
  });
}

// --- odczytDanychDostepowychPakietuRecept ---

export interface PackageAccessData {
  /** `kluczPakietuRecept`. */
  readonly packageKey?: string;
  /** `kodPakietuRecept`. */
  readonly packageCode?: string;
  /** Klucze i numery recept w pakiecie. */
  readonly prescriptions: readonly {
    prescriptionKey?: string;
    prescriptionNumber?: OidIdentifier;
  }[];
  readonly outcome?: OperationOutcome;
}

/**
 * Odczytuje dane dostępowe pakietu (operacja `odczytDanychDostepowychPakietuRecept`):
 * klucz i kod pakietu oraz klucze/numery recept - po kluczu dowolnej recepty z pakietu.
 */
export async function readPackageAccessData(
  prescriptionKey: string,
  transport: PrescriptionQueryTransport,
): Promise<Result<PackageAccessData, P1Error>> {
  const body =
    `<ws:OdczytDanychDostepowychPakietuReceptRequest>` +
    `<kluczRecepty><r:kluczRecepty>${escapeXml(prescriptionKey)}</r:kluczRecepty></kluczRecepty>` +
    `</ws:OdczytDanychDostepowychPakietuReceptRequest>`;

  const parsed = await callService(body, ACTION.ACCESS_DATA, transport);
  if (!parsed.ok) return parsed;
  return ok({
    ...optional("packageKey", findText(parsed.value.body, "kluczPakietuRecept")),
    ...optional("packageCode", findText(parsed.value.body, "kodPakietuRecept")),
    prescriptions: collectRecords(parsed.value.body, "kluczINumerRecepty").map((node) => ({
      ...optional("prescriptionKey", fieldText(node, "kluczRecepty")),
      ...numberOf(node["numerRecepty"]),
    })),
    ...outcomeOf(parsed.value),
  });
}

// --- odczytStanuRealizacjiRecepty ---

export interface ProductQuantity {
  readonly unit?: string;
  readonly value?: string;
}

export interface PrescriptionFulfillmentState {
  /** `dataWydawaniaProduktuOd`. */
  readonly dispenseFrom?: string;
  /** `iloscProduktuDoWydaniaObecnie`. */
  readonly quantityToDispenseNow?: ProductQuantity;
  /** `iloscWydanegoProduktu`. */
  readonly quantityDispensed?: ProductQuantity;
  /** `iloscProduktuDoWydaniaSuma`. */
  readonly quantityToDispenseTotal?: ProductQuantity;
  readonly outcome?: OperationOutcome;
}

/**
 * Odczytuje stan realizacji recepty (operacja `odczytStanuRealizacjiRecepty`):
 * ilości produktu do wydania/wydane oraz datę rozpoczęcia wydawania.
 */
export async function readPrescriptionFulfillmentState(
  prescriptionKey: string,
  transport: PrescriptionQueryTransport,
): Promise<Result<PrescriptionFulfillmentState, P1Error>> {
  const body =
    `<ws:OdczytStanuRealizacjiReceptyRequest>` +
    `<kluczRecepty><r:kluczRecepty>${escapeXml(prescriptionKey)}</r:kluczRecepty></kluczRecepty>` +
    `</ws:OdczytStanuRealizacjiReceptyRequest>`;

  const parsed = await callService(body, ACTION.FULFILLMENT_STATE, transport);
  if (!parsed.ok) return parsed;
  const state = collectRecords(parsed.value.body, "stanRealizacjiRecepty")[0];
  return ok({
    ...optional("dispenseFrom", state ? fieldText(state, "dataWydawaniaProduktuOd") : undefined),
    ...quantity("quantityToDispenseNow", state?.["iloscProduktuDoWydaniaObecnie"]),
    ...quantity("quantityDispensed", state?.["iloscWydanegoProduktu"]),
    ...quantity("quantityToDispenseTotal", state?.["iloscProduktuDoWydaniaSuma"]),
    ...outcomeOf(parsed.value),
  });
}

// --- odczytDokumentuRealizacjiRecepty / odczytDokumentuAnulowaniaRecepty ---

/** Treść dokumentu (CDA odkodowane z base64) + opcjonalny status. */
export interface DocumentContent {
  readonly cdaXml?: string;
  readonly status?: string;
  readonly outcome?: OperationOutcome;
}

/**
 * Odczytuje dokument realizacji recepty (operacja `odczytDokumentuRealizacjiRecepty`)
 * po identyfikatorze dokumentu. Zwraca treść CDA realizacji.
 */
export async function readFulfillmentDocument(
  documentId: OidIdentifier,
  transport: PrescriptionQueryTransport,
): Promise<Result<DocumentContent, P1Error>> {
  const body =
    `<ws:OdczytDokumentuRealizacjiReceptyRequest><identyfikatorDokumentuRealizacjiRecepty>` +
    `<r:identyfikatorDokumentuRealizacjiRecepty>${oid(documentId.extension, documentId.root)}</r:identyfikatorDokumentuRealizacjiRecepty>` +
    `</identyfikatorDokumentuRealizacjiRecepty></ws:OdczytDokumentuRealizacjiReceptyRequest>`;

  const parsed = await callService(body, ACTION.READ_FULFILLMENT_DOC, transport);
  if (!parsed.ok) return parsed;
  return ok({
    ...decoded("cdaXml", findText(parsed.value.body, "dokumentRealizacjiRecepty")),
    ...optional("status", findText(parsed.value.body, "status")),
    ...outcomeOf(parsed.value),
  });
}

/**
 * Odczytuje dokument anulowania recepty (operacja `odczytDokumentuAnulowaniaRecepty`)
 * po identyfikatorze dokumentu. Zwraca treść CDA anulowania.
 */
export async function readCancellationDocument(
  documentId: OidIdentifier,
  transport: PrescriptionQueryTransport,
): Promise<Result<DocumentContent, P1Error>> {
  const body =
    `<ws:OdczytDokumentuAnulowaniaReceptyRequest><identyfikatorDokumentuAnulowaniaRecepty>` +
    `<r:identyfikatorDokumentuAnulowaniaRecepty>${oid(documentId.extension, documentId.root)}</r:identyfikatorDokumentuAnulowaniaRecepty>` +
    `</identyfikatorDokumentuAnulowaniaRecepty></ws:OdczytDokumentuAnulowaniaReceptyRequest>`;

  const parsed = await callService(body, ACTION.READ_CANCELLATION_DOC, transport);
  if (!parsed.ok) return parsed;
  const doc = collectRecords(parsed.value.body, "dokumentAnulowaniaRecepty")[0];
  return ok({
    ...decoded("cdaXml", doc ? fieldText(doc, "tresc") : undefined),
    ...outcomeOf(parsed.value),
  });
}

// --- wyszukanieDokumentowRealizacjiRecept ---

/** Kryteria wyszukiwania dokumentów realizacji. Wszystkie opcjonalne. */
export interface FulfillmentDocumentSearchCriteria {
  /** Identyfikator podmiotu wystawcy realizacji. */
  providerId?: OidIdentifier;
  issuedFrom?: Date;
  issuedTo?: Date;
  /** NPWZ realizatora. */
  realizerNpwz?: string;
  kind?: FulfillmentKind;
  status?: FulfillmentDocumentStatus;
}

export interface FulfillmentDocumentSummary {
  readonly documentId?: OidIdentifier;
  readonly status?: string;
  readonly kind?: string;
  readonly issuedAt?: string;
  readonly realizerNpwz?: string;
  readonly providerId?: OidIdentifier;
  readonly prescriptionKey?: string;
  readonly paperNumber?: string;
}

export interface FulfillmentDocumentSearchResult {
  readonly documents: readonly FulfillmentDocumentSummary[];
  readonly outcome?: OperationOutcome;
}

/**
 * Wyszukuje dokumenty realizacji recept (operacja `wyszukanieDokumentowRealizacjiRecept`).
 */
export async function searchFulfillmentDocuments(
  criteria: FulfillmentDocumentSearchCriteria,
  transport: PrescriptionQueryTransport,
): Promise<Result<FulfillmentDocumentSearchResult, P1Error>> {
  const body =
    `<ws:WyszukanieDokumentowRealizacjiReceptRequest><kryteriaWyszukiwaniaDokumentowRealizacji>` +
    (criteria.providerId
      ? `<r:identyfikatorPodmiotuWystawcy>${oid(criteria.providerId.extension, criteria.providerId.root)}</r:identyfikatorPodmiotuWystawcy>`
      : "") +
    dateEl("dataWystawieniaOd", criteria.issuedFrom) +
    dateEl("dataWystawieniaDo", criteria.issuedTo) +
    (criteria.realizerNpwz
      ? `<r:identyfikatorPracownikaRealizatora>${oid(criteria.realizerNpwz, CDA_OID.NPWZ)}</r:identyfikatorPracownikaRealizatora>`
      : "") +
    (criteria.kind ? `<r:rodzajRealizacji>${criteria.kind}</r:rodzajRealizacji>` : "") +
    (criteria.status
      ? `<r:statusDokumentuRealizacjiRecepty>${criteria.status}</r:statusDokumentuRealizacjiRecepty>`
      : "") +
    `</kryteriaWyszukiwaniaDokumentowRealizacji></ws:WyszukanieDokumentowRealizacjiReceptRequest>`;

  const parsed = await callService(body, ACTION.SEARCH_FULFILLMENT_DOCS, transport);
  if (!parsed.ok) return parsed;
  return ok({
    documents: collectRecords(parsed.value.body, "wynikWyszukiwaniaDokumentowRealizacji").map(
      (node) => ({
        ...idOf("documentId", node["identyfikatorDokumentuRealizacjiRecepty"]),
        ...optional("status", fieldText(node, "statusDokumentuRealizacjiRecepty")),
        ...optional("kind", fieldText(node, "rodzajRealizacji")),
        ...optional("issuedAt", fieldText(node, "dataWystawienia")),
        ...idExtensionOf("realizerNpwz", node["identyfikatorPracownikaRealizatora"]),
        ...idOf("providerId", node["identyfikatorPodmiotuWystawcy"]),
        ...optional("prescriptionKey", fieldText(node, "kluczRecepty")),
        ...optional("paperNumber", fieldText(node, "numerReceptyPapierowej")),
      }),
    ),
    ...outcomeOf(parsed.value),
  });
}

// --- wyszukanieDokumentowAnulowaniaRecept ---

/** Kryteria wyszukiwania dokumentów anulowania. Wszystkie opcjonalne. */
export interface CancellationDocumentSearchCriteria {
  issuedFrom?: Date;
  issuedTo?: Date;
  prescriptionNumber?: OidIdentifier;
}

export interface CancellationDocumentSummary {
  readonly documentId?: OidIdentifier;
  readonly issuedAt?: string;
  readonly prescriptionKey?: string;
}

export interface CancellationDocumentSearchResult {
  readonly documents: readonly CancellationDocumentSummary[];
  readonly outcome?: OperationOutcome;
}

/**
 * Wyszukuje dokumenty anulowania recept (operacja `wyszukanieDokumentowAnulowaniaRecept`).
 */
export async function searchCancellationDocuments(
  criteria: CancellationDocumentSearchCriteria,
  transport: PrescriptionQueryTransport,
): Promise<Result<CancellationDocumentSearchResult, P1Error>> {
  const body =
    `<ws:WyszukanieDokumentowAnulowaniaReceptRequest><kryteriaWyszukiwaniaDokumentowAnulowania>` +
    dateEl("dataWystawieniaOd", criteria.issuedFrom) +
    dateEl("dataWystawieniaDo", criteria.issuedTo) +
    numerReceptyEl(criteria.prescriptionNumber) +
    `</kryteriaWyszukiwaniaDokumentowAnulowania></ws:WyszukanieDokumentowAnulowaniaReceptRequest>`;

  const parsed = await callService(body, ACTION.SEARCH_CANCELLATION_DOCS, transport);
  if (!parsed.ok) return parsed;
  return ok({
    documents: collectRecords(parsed.value.body, "wynikWyszukiwaniaDokumentowAnulowania").map(
      (node) => ({
        ...idOf("documentId", node["identyfikatorDokumentuAnulowaniaRecepty"]),
        ...optional("issuedAt", fieldText(node, "dataWystawienia")),
        ...optional("prescriptionKey", findText(node["kluczRecepty"], "kluczRecepty")),
      }),
    ),
    ...outcomeOf(parsed.value),
  });
}

// --- wewnętrzne: wysyłka + budowa elementów + mapowanie wyników ---

/** Wspólna wysyłka koperty (kontekst e-recepty + WS-Security + mTLS) i parsowanie. */
async function callService(
  body: string,
  soapAction: string,
  transport: PrescriptionQueryTransport,
): Promise<Result<ParsedSoapResponse, P1Error>> {
  const envelope = buildSoapEnvelope({
    context: transport.context,
    body,
    namespaces: { ws: PRESCRIPTION_WS_NS, r: PRESCRIPTION_MT_NS, wsp: PRESCRIPTION_COMMON_NS },
    contextNamespace: PRESCRIPTION_CONTEXT_NAMESPACE,
    contextUrnPrefix: PRESCRIPTION_CONTEXT_URN_PREFIX,
  });

  const now = transport.clock?.now();
  const signed = signWsSecurity(envelope, {
    certificate: transport.wsSecurityCertificate,
    contextNamespace: PRESCRIPTION_CONTEXT_NAMESPACE,
    ...(now !== undefined ? { now } : {}),
  });

  let responseBody: string;
  try {
    const response = await transport.httpClient.send({
      url: transport.endpoint,
      method: "POST",
      headers: { "Content-Type": "text/xml; charset=utf-8", SOAPAction: soapAction },
      body: signed,
    });
    responseBody = response.body;
  } catch (cause) {
    return err(
      new P1TransportError(`Prescription query (${soapAction}) request failed`, { cause }),
    );
  }

  return parseSoapResponse(responseBody);
}

/** Element daty (ISO dateTime) lub pusty, gdy brak. */
function dateEl(name: string, date: Date | undefined): string {
  return date ? `<r:${name}>${date.toISOString()}</r:${name}>` : "";
}

/** Blok identyfikatora OID (kolejność: extension, root - jak w XSD). */
function oid(extension: string, root: string): string {
  return `<wsp:extension>${escapeXml(extension)}</wsp:extension><wsp:root>${escapeXml(root)}</wsp:root>`;
}

function numerReceptyEl(number: OidIdentifier | undefined): string {
  return number ? `<r:numerRecepty>${oid(number.extension, number.root)}</r:numerRecepty>` : "";
}

function pagingEl(paging: PagingParams | undefined): string {
  if (!paging) return "";
  return (
    `<r:parametryStronicowania>` +
    `<wsp:rozmiarStrony>${paging.pageSize}</wsp:rozmiarStrony>` +
    `<wsp:numerStrony>${paging.pageNumber}</wsp:numerStrony>` +
    `<wsp:kierunekSortowania>${paging.sort}</wsp:kierunekSortowania>` +
    `<wsp:czyPodacLiczbeRek>${paging.includeCount}</wsp:czyPodacLiczbeRek>` +
    `</r:parametryStronicowania>`
  );
}

function toSummary(node: Record<string, unknown>): PatientPrescriptionSummary | undefined {
  const prescriptionKey = fieldText(node, "kluczRecepty");
  if (prescriptionKey === undefined) return undefined;
  const issuer = node["identyfikatorPracownikaWystawcy"];
  return {
    prescriptionKey,
    ...optional("packageKey", fieldText(node, "kluczPakietu")),
    ...optional("issuedAt", fieldText(node, "dataWystawieniaRecepty")),
    ...numberOf(node["numerRecepty"]),
    ...optional("status", fieldText(node, "statusRecepty")),
    ...optional("blockReason", fieldText(node, "przyczynaZablokowaniaRecepty")),
    ...optional("providerName", fieldText(node, "podmiotNazwa")),
    ...optional("issuerName", fieldText(node, "wystawcaNazwa")),
    ...idExtensionOf("issuerNpwz", issuer),
  };
}

function toExtended(node: Record<string, unknown>): PatientPrescriptionExtended {
  const fulfillable = fieldText(node, "statusMozliwosciRealizacjiRecepty");
  return {
    ...optional("prescriptionKey", fieldText(node, "kluczRecepty")),
    ...optional("issuedAt", fieldText(node, "dataWystawieniaRecepty")),
    ...optional("firstDispenseAt", fieldText(node, "dataPierwszegoWydaniaLeku")),
    ...optional("drugName", fieldText(node, "nazwaPrzepisanegoLeku")),
    ...numberOf(node["numerRecepty"]),
    ...optional("status", fieldText(node, "statusRecepty")),
    ...optional("blockReason", fieldText(node, "przyczynaZablokowaniaRecepty")),
    ...optional("packageSize", fieldText(node, "wielkoscOpakowania")),
    ...optional("drugQuantity", fieldText(node, "iloscLeku")),
    ...optional("paymentLevel", fieldText(node, "poziomOdplatnosciRecepty")),
    ...(fulfillable !== undefined ? { fulfillable: fulfillable === "true" } : {}),
  };
}

function toKey(node: Record<string, unknown>): PatientPrescriptionKey | undefined {
  const prescriptionKey = fieldText(node, "kluczRecepty");
  if (prescriptionKey === undefined) return undefined;
  return {
    prescriptionKey,
    ...optional("issuedAt", fieldText(node, "dataWystawienia")),
    ...optional("dispenseFrom", fieldText(node, "dataRealizacjiOd")),
    ...optional("issuerName", fieldText(node, "imieNazwiskoWystawcy")),
    ...optional("drugName", fieldText(node, "nazwaLeku")),
    ...optional("status", fieldText(node, "status")),
  };
}

function toContent(
  recepta: Record<string, unknown> | undefined,
  status: string | undefined,
  parsed?: ParsedSoapResponse,
): PrescriptionContent {
  const base64 = recepta ? fieldText(recepta, "tresc") : undefined;
  return {
    ...(status !== undefined ? { status } : {}),
    ...optional(
      "documentIdInPackage",
      recepta ? fieldText(recepta, "identyfikatorDokumentuWPakiecie") : undefined,
    ),
    ...decoded("cdaXml", base64),
    ...(parsed ? outcomeOf(parsed) : {}),
  };
}

/** Parsuje numerRecepty (root/extension) na pole `prescriptionNumber`. */
function numberOf(value: unknown): { prescriptionNumber: OidIdentifier } | object {
  const id = parseOid(value);
  return id ? { prescriptionNumber: id } : {};
}

/** Parsuje dowolny identyfikator OID na wskazane pole. */
function idOf<K extends string>(key: K, value: unknown): Record<K, OidIdentifier> | object {
  const id = parseOid(value);
  return id ? { [key]: id } : {};
}

/** Wyciąga samo `extension` identyfikatora na wskazane pole (np. NPWZ). */
function idExtensionOf<K extends string>(key: K, value: unknown): Record<K, string> | object {
  const id = parseOid(value);
  return id?.extension ? { [key]: id.extension } : {};
}

function parseOid(value: unknown): OidIdentifier | undefined {
  if (!value || typeof value !== "object") return undefined;
  const rec = value as Record<string, unknown>;
  const root = fieldText(rec, "root");
  const extension = fieldText(rec, "extension");
  if (root === undefined && extension === undefined) return undefined;
  return { root: root ?? "", extension: extension ?? "" };
}

function quantity<K extends string>(key: K, value: unknown): Record<K, ProductQuantity> | object {
  if (!value || typeof value !== "object") return {};
  const rec = value as Record<string, unknown>;
  const unit = fieldText(rec, "jednostka");
  const v = fieldText(rec, "wartosc");
  if (unit === undefined && v === undefined) return {};
  return {
    [key]: { ...(unit !== undefined ? { unit } : {}), ...(v !== undefined ? { value: v } : {}) },
  };
}

/** Pole z odkodowaną treścią base64 (lub puste). */
function decoded<K extends string>(key: K, base64: string | undefined): Record<K, string> | object {
  return base64 ? { [key]: Buffer.from(base64, "base64").toString("utf8") } : {};
}

function outcomeOf(parsed: ParsedSoapResponse): { outcome: OperationOutcome } | object {
  return parsed.outcome !== undefined ? { outcome: parsed.outcome } : {};
}

function optional<K extends string>(key: K, value: string | undefined): Record<K, string> | object {
  return value !== undefined ? { [key]: value } : {};
}

function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined;
}

function escapeXml(value: string): string {
  return value.replace(/[<>&"']/g, (char) => {
    switch (char) {
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case "&":
        return "&amp;";
      case '"':
        return "&quot;";
      default:
        return "&apos;";
    }
  });
}
