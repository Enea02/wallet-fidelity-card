/// <reference types="jest" />
import { fireEvent, render, screen } from "@testing-library/react-native";
import { CardPreview } from "./CardPreview";

jest.mock("react-native-svg", () => ({ SvgXml: () => null }));

const props = {
  name: "Salone Nora",
  programName: "Carta Amica",
  hexColor: "#5B1F2E",
  logoUrl: null,
  stampsRequired: 10,
  stampIcon: "scissors" as const,
  rewardLabel: "Taglio gratis",
  stampUnit: "taglio",
  stampUnitPlural: "tagli",
};

describe("anteprima della carta", () => {
  it("negli stati del design, con lo stesso testo della carta vera", async () => {
    await render(<CardPreview {...props} />);
    expect(screen.getByTestId("anteprima-modulo")).toHaveTextContent("Ti mancano 4 tagli");
    expect(screen.getAllByText("6 / 10").length).toBe(2); // Google e Apple
    await fireEvent.press(screen.getByTestId("modalita-premio"));
    expect(screen.getByTestId("anteprima-modulo")).toHaveTextContent("Taglio gratis disponibile!");
    await fireEvent.press(screen.getByTestId("modalita-nuova"));
    expect(screen.getByTestId("anteprima-modulo")).toHaveTextContent("Come funziona");
  });

  it("colori della carta corretti per il contrasto", async () => {
    await render(<CardPreview {...props} hexColor="#F7C843" />);
    const bg = (id: string) =>
      [screen.getByTestId(id).props.style].flat().find((s: { backgroundColor?: string }) => s?.backgroundColor)
        ?.backgroundColor;
    expect(bg("anteprima-google")).toBe(bg("anteprima-apple"));
  });
});
