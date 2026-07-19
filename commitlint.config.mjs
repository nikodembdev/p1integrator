export default {
  extends: ["@commitlint/config-conventional"],
  rules: {
    // Scope = paczka, której dotyczy zmiana (opcjonalny, ale gdy jest - z listy)
    "scope-enum": [
      1,
      "always",
      [
        "core",
        "cda",
        "signing",
        "transport",
        "prescription",
        "referral",
        "ipom",
        "medical-events",
        "edm",
        "patient-summary",
        "moje-zdrowie",
        "repo",
        "ci",
        "deps",
      ],
    ],
  },
};
