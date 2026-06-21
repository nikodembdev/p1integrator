#!/usr/bin/env python3
"""Rekonesans szablonu P1: z (zinline'owanego) .sch wyciąga kluczowe fakty do
zbudowania typu skierowania - template dokumentu, structuredBody, obowiązkowe
sekcje z kodami/tytułami oraz obowiązkowe wpisy (entry) per sekcja.

Użycie: python3 scripts/recon-sch.py <inlined.sch>
"""
import re
import sys

s = open(sys.argv[1]).read()
P = "2.16.840.1.113883.3.4424.13.10."


def asserts():
    for m in re.finditer(r"<assert[^>]*>(.*?)</assert>", s, re.S):
        yield re.sub(r"\s+", " ", m.group(1)).strip()


# 1. Template dokumentu (.1.x) i structuredBody (.2.x) z mandatory-asserts
roots = {}
for a in asserts():
    label = re.match(r"\(([^)]+)\)", a)
    for r in re.findall(rf"{re.escape(P)}([0-9]+\.[0-9]+)", a):
        roots.setdefault(r, label.group(1) if label else "?")

print("=== template dokumentu (.1.x) ===")
for r, lab in sorted(roots.items()):
    if r.startswith("1."):
        print(f"  .{r}  {lab}")
print("=== structuredBody (.2.x - kandydaci) ===")
for r, lab in sorted(roots.items()):
    if r.startswith("2."):
        print(f"  .{r}  {lab}")

# 2. Obowiązkowe komponenty sekcji w structuredBody
print("=== obowiązkowe komponenty (component → section .3.x) ===")
mand = set()
for a in asserts():
    m = re.search(r"component\[hl7:section\[hl7:templateId\[@root='" + re.escape(P) + r"(3\.[0-9]+)'\]\]\] jest mandatory", a)
    if m:
        mand.add(m.group(1))
        print(f"  .{m.group(1)}  {re.match(r'.([^)]+).', a).group(1)}")

# 3. Kody + tytuły sekcji .3.x
print("=== sekcje .3.x: kod LOINC + wymagany tytuł ===")
secs = sorted(set(re.findall(re.escape(P) + r"(3\.[0-9]+)", s)))
for sec in secs:
    T = P + sec
    code = re.search(r"section\[hl7:templateId/@root='" + re.escape(T) + r"'\]/hl7:code\[\(@code='([^']+)'", s)
    code2 = re.search(r"templateId/@root='" + re.escape(T) + r"'\]\]/hl7:section\[hl7:code\[\(@code='([^']+)'", s)
    title = None
    # tytuł: szukamy asserta 'title MUSI wynosić' w pobliżu etykiety sekcji
    for a in asserts():
        if T in s and "title MUSI wynosić" in a:
            mt = re.search(r"title MUSI wynosić ''([^']+)''", a)
            if mt:
                # przypisz po etykiecie sekcji jeśli pasuje
                pass
    cc = code.group(1) if code else (code2.group(1) if code2 else "?")
    star = " *MANDATORY" if sec in mand else ""
    print(f"  .{sec}  code={cc}{star}")

# 4. Wymagane tytuły (wszystkie)
print("=== wymagane tytuły sekcji (title MUSI wynosić) ===")
for a in asserts():
    mt = re.search(r"\(([^)]+)\).*title MUSI wynosić ''([^']+)''", a)
    if mt:
        print(f"  {mt.group(1)}: '{mt.group(2)}'")

# 5. Obowiązkowe wpisy/elementy w sekcjach (entry/observation/act/...) - mandatory min 1x
print("=== obowiązkowe elementy wewn. sekcji (mandatory, bez section/templateId/code/title) ===")
seen = set()
for a in asserts():
    if "jest mandatory" not in a:
        continue
    lab = re.match(r"\(([^)]+)\)", a)
    el = re.search(r"element (hl7:[A-Za-z]+(?:\[[^\]]*\])?) jest mandatory", a)
    if not lab or not el:
        continue
    name = el.group(1)
    if name in ("hl7:templateId", "hl7:code", "hl7:title", "hl7:section", "hl7:text",
                "hl7:effectiveTime", "hl7:id", "hl7:languageCode", "hl7:confidentialityCode"):
        continue
    key = (lab.group(1), name)
    if key in seen:
        continue
    seen.add(key)
    print(f"  {lab.group(1)}: {name}")
