/** Stałe namespace'ów i algorytmów WS-Security / XML-DSig używane przez P1. */

export const SOAPENV_NS = "http://schemas.xmlsoap.org/soap/envelope/";
export const WSSE_NS =
  "http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd";
export const WSU_NS =
  "http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd";

export const X509_TOKEN_TYPE =
  "http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-x509-token-profile-1.0#X509v3";
export const BASE64_ENCODING_TYPE =
  "http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-soap-message-security-1.0#Base64Binary";

export const SIGNATURE_ALGORITHM = "http://www.w3.org/2001/04/xmldsig-more#rsa-sha256";
export const CANONICALIZATION_ALGORITHM = "http://www.w3.org/2001/10/xml-exc-c14n#";
export const DIGEST_ALGORITHM = "http://www.w3.org/2001/04/xmlenc#sha256";
