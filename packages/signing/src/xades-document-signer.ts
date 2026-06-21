/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument */
import { createHash, createSign, webcrypto } from "node:crypto";
import { DOMParser, XMLSerializer } from "@xmldom/xmldom";
import forge from "node-forge";
import * as xpath from "xpath";
import { ExclusiveCanonicalization } from "xml-crypto";
import type { DocumentSigner } from "@p1/core";
import * as xadesjs from "xadesjs";

/** Certyfikat podpisujący (kontener PKCS#12 + hasło). */
export interface SigningCertificate {
  readonly p12: Buffer;
  readonly password: string;
}

const EXC_C14N = "http://www.w3.org/2001/10/xml-exc-c14n#";
const DSIG_NS = "http://www.w3.org/2000/09/xmldsig#";
const XADES_NS = "http://uri.etsi.org/01903/v1.3.2#";

// Silnik kryptograficzny (wbudowany WebCrypto Node) + zależności DOM/xpath (jednorazowo).
const crypto = webcrypto as unknown as Crypto;
let engineReady = false;
function ensureEngine(): void {
  if (engineReady) return;
  xadesjs.Application.setEngine("NodeJS", crypto);
  xadesjs.setNodeDependencies({ DOMParser, XMLSerializer, xpath });
  engineReady = true;
}

interface ParsedKey {
  readonly pkcs8: ArrayBuffer;
  readonly privateKeyPem: string;
  readonly certificateBase64: string;
}

function parseSigningP12(p12: Buffer, password: string): ParsedKey {
  const asn1 = forge.asn1.fromDer(forge.util.createBuffer(p12.toString("binary")));
  const container = forge.pkcs12.pkcs12FromAsn1(asn1, password);
  const keyBag =
    container.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[
      forge.pki.oids.pkcs8ShroudedKeyBag!
    ]?.[0] ?? container.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag!]?.[0];
  const certBag = container.getBags({ bagType: forge.pki.oids.certBag })[
    forge.pki.oids.certBag!
  ]?.[0];
  if (!keyBag?.key || !certBag?.cert) {
    throw new Error("Nie znaleziono klucza prywatnego lub certyfikatu w .p12");
  }
  const pkcs8Asn1 = forge.pki.wrapRsaPrivateKey(forge.pki.privateKeyToAsn1(keyBag.key));
  const pkcs8Bytes = forge.asn1.toDer(pkcs8Asn1).getBytes();
  const certDer = forge.asn1.toDer(forge.pki.certificateToAsn1(certBag.cert)).getBytes();
  return {
    pkcs8: Uint8Array.from(pkcs8Bytes, (c) => c.charCodeAt(0)).buffer,
    privateKeyPem: forge.pki.privateKeyToPem(keyBag.key),
    certificateBase64: forge.util.encode64(certDer),
  };
}

const c14n = new ExclusiveCanonicalization();
const sha256b64 = (s: string): string =>
  createHash("sha256").update(Buffer.from(s, "utf8")).digest("base64");

export interface XadesDocumentSignerOptions {
  /** Certyfikat podpisujący (PKCS#12) - klucz lekarza. */
  readonly certificate: SigningCertificate;
}

/**
 * Podpisywarka XAdES-BES in-process (bez serwisu Java/DSS). Strukturę podpisu (enveloped,
 * QualifyingProperties: SigningTime + SigningCertificate) generuje xadesjs, ale 2× DigestValue
 * i SignatureValue PRZELICZAMY poprawną exclusive-c14n z xml-crypto - xmldsigjs liczy c14n
 * niestandardowo, co P1 odrzuca. Podpis akceptowany przez P1 (zob. [[in-process-signing]]).
 *
 * Niuanse dopasowane do weryfikatora P1/DSS:
 * - PI `xml-stylesheet` musi zostać (warstwa prezentacyjna; inaczej REG.WER.070),
 * - digest referencji dokumentu liczony z prologiem (PI) jak robi DSS,
 * - referencja SignedProperties musi mieć transformę exc-c14n (xadesjs jej nie dodaje).
 */
export function createXadesDocumentSigner(options: XadesDocumentSignerOptions): DocumentSigner {
  const { pkcs8, privateKeyPem, certificateBase64 } = parseSigningP12(
    options.certificate.p12,
    options.certificate.password,
  );

  return {
    async signXades(documentXml: string): Promise<string> {
      ensureEngine();
      const privateKey = await crypto.subtle.importKey(
        "pkcs8",
        pkcs8,
        { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
        false,
        ["sign"],
      );

      const doc = new DOMParser().parseFromString(documentXml, "application/xml");
      const signedXml = new xadesjs.SignedXml();
      signedXml.XmlSignature.SignedInfo.CanonicalizationMethod.Algorithm = EXC_C14N;

      await signedXml.Sign({ name: "RSASSA-PKCS1-v1_5" }, privateKey, doc as any, {
        references: [
          { id: "r-id-1", uri: "", hash: "SHA-256", transforms: ["enveloped", "exc-c14n"] },
        ],
        signingCertificate: certificateBase64,
        x509: [certificateBase64],
      });
      doc.documentElement?.appendChild(signedXml.GetXml() as any);

      const select = xpath.useNamespaces({ ds: DSIG_NS, xades: XADES_NS });
      const sig = (select("//ds:Signature", doc as any) as any[])[0];

      // 1) DigestValue referencji dokumentu (URI="") - exc-c14n CAŁEGO dokumentu BEZ podpisu,
      //    z prologiem (PI/komentarze przed korzeniem) tak jak liczy DSS.
      const docClone = doc.cloneNode(true) as any;
      const sigInClone = (select("//ds:Signature", docClone) as any[])[0];
      sigInClone.parentNode.removeChild(sigInClone);
      let prolog = "";
      for (let n = docClone.firstChild; n && n !== docClone.documentElement; n = n.nextSibling) {
        // xmldom reprezentuje deklarację XML jako PI o target "xml" - c14n jej NIE zawiera.
        if (n.nodeType === 7 && n.target !== "xml") prolog += `<?${n.target} ${n.data}?>\n`;
        else if (n.nodeType === 8) prolog += `<!--${n.data}-->\n`;
      }
      const docRef = (select(".//ds:Reference[@URI='']", sig) as any[])[0];
      (select("./ds:DigestValue", docRef) as any[])[0].textContent = sha256b64(
        prolog + c14n.process(docClone.documentElement, {}),
      );

      // 2) Referencja SignedProperties: xadesjs nie dodaje jej transformy (DSS użyłby wtedy
      //    inclusive c14n). Dokładamy exc-c14n i liczymy digest tym samym algorytmem.
      const signedProps = (select(".//xades:SignedProperties", sig) as any[])[0];
      const propsRef = (select(".//ds:Reference[@Type]", sig) as any[])[0];
      if ((select("./ds:Transforms", propsRef) as any[]).length === 0) {
        const transforms = doc.createElementNS(DSIG_NS, "ds:Transforms");
        const transform = doc.createElementNS(DSIG_NS, "ds:Transform");
        transform.setAttribute("Algorithm", EXC_C14N);
        transforms.appendChild(transform);
        propsRef.insertBefore(transforms, propsRef.firstChild);
      }
      (select("./ds:DigestValue", propsRef) as any[])[0].textContent = sha256b64(
        c14n.process(signedProps, {}),
      );

      // 3) SignatureValue - exc-c14n SignedInfo (z poprawionymi digestami) → RSA-SHA256.
      const signedInfo = (select("./ds:SignedInfo", sig) as any[])[0];
      (select("./ds:SignatureValue", sig) as any[])[0].textContent = createSign("RSA-SHA256")
        .update(Buffer.from(c14n.process(signedInfo, {}), "utf8"))
        .sign(privateKeyPem, "base64");

      return new XMLSerializer().serializeToString(doc);
    },
  };
}
