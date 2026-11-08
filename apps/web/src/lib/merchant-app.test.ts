import { afterEach, describe, expect, it } from "vitest";
import { merchantAppUrl, siteOrigin } from "./merchant-app";

const saved = { base: process.env.APP_BASE_URL, url: process.env.MERCHANT_APP_URL };
afterEach(() => {
  process.env.APP_BASE_URL = saved.base;
  if (saved.url === undefined) delete process.env.MERCHANT_APP_URL;
  else process.env.MERCHANT_APP_URL = saved.url;
});

describe("web app esercente sullo stesso server", () => {
  it("per default i link d'invito portano a APP_BASE_URL/app", () => {
    process.env.APP_BASE_URL = "https://carte.esempio.it/";
    delete process.env.MERCHANT_APP_URL;
    expect(merchantAppUrl()).toBe("https://carte.esempio.it/app");
  });

  it("MERCHANT_APP_URL, se impostata, ha la precedenza", () => {
    process.env.APP_BASE_URL = "https://carte.esempio.it";
    process.env.MERCHANT_APP_URL = "http://localhost:8081/";
    expect(merchantAppUrl()).toBe("http://localhost:8081");
  });

  it("origine del sito da APP_BASE_URL", () => {
    process.env.APP_BASE_URL = "https://carte.esempio.it/qualcosa";
    expect(siteOrigin()).toBe("https://carte.esempio.it");
    process.env.APP_BASE_URL = "non un url";
    expect(siteOrigin()).toBeNull();
  });
});
