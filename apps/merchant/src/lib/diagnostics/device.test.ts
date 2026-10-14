import { describe, expect, it, vi } from "vitest";

vi.mock("@react-native-community/netinfo", () => ({ default: {} }));
vi.mock("expo-application", () => ({}));
vi.mock("expo-device", () => ({}));
vi.mock("expo-localization", () => ({}));
vi.mock("react-native", () => ({ Platform: { OS: "web" } }));
vi.mock("../config", () => ({ app: {} }));

const { browserName } = await import("./device");

describe("browser in parole semplici", () => {
  it.each([
    [
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
      "Chrome 141",
      "macOS",
    ],
    [
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
      "Safari 18",
      "iOS",
    ],
    [
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0",
      "Edge 141",
      "Windows",
    ],
    ["Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0", "Firefox 140", "Linux"],
  ])("%s", (ua, browser, os) => {
    expect(browserName(ua)).toEqual({ browser, os });
  });
});
