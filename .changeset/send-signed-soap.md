---
"@p1/transport": minor
---

Dodano `sendSignedSoap` - wspólny helper orkiestracji wywołania SOAP P1 (koperta →
podpis WS-Security → mTLS POST → parsowanie odpowiedzi). Moduły domenowe
(`referral`, `prescription`, `ipom`) korzystają z niego zamiast powielać identyczny
ogon transportu; logika specyficzna dla operacji (podpis XAdES CDA, budowa Body,
ekstrakcja pól odpowiedzi) zostaje w modułach. Bez zmian w publicznym API tych modułów.
