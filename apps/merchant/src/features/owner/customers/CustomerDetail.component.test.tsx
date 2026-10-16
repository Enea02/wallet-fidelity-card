/// <reference types="jest" />
import { fireEvent, render as rtlRender, screen } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { CustomerDetail } from "./CustomerDetail";

const mockCall = jest.fn();
jest.mock("@/lib/api", () => ({
  api: { call: (...a: unknown[]) => mockCall(...a) },
  ApiError: class ApiError extends Error {},
}));
jest.mock("@/lib/network", () => ({ useOnline: () => true }));
jest.mock("@/lib/session", () => ({
  useShop: () => ({ id: "11111111-1111-4111-8111-111111111111", name: "Salone Demo", stampIcon: "scissors" }),
}));
jest.mock("@/features/card/StampGrid", () => ({ StampGrid: () => null }));

const mockDetail = {
  customer: {
    id: "33333333-3333-4333-8333-333333333333",
    shortCode: "DEMA2345",
    name: "Giulia Rossi",
    phoneMasked: "+39 333 ***4567",
    stamps: 6,
    rewardsAvailable: 1,
    consentMarketing: true,
    createdAt: "2026-03-03T10:00:00.000Z",
    lastVisitAt: "2026-10-10T08:12:00.000Z",
    stampsRequired: 10,
    rewardLabel: "Taglio gratis",
  },
  prepaidCards: [],
  history: [
    { at: "2026-10-10T08:12:00.000Z", action: "stamp", actorName: "Sara", before: null, after: null, reason: null },
    { at: "2026-03-03T10:00:00.000Z", action: "enroll", actorName: "cliente", before: null, after: null, reason: null },
  ],
};
const mockReload = jest.fn();
jest.mock("../useApi", () => ({
  useApi: () => ({ data: mockDetail, error: null, loading: false, reload: mockReload }),
}));

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
const render = (ui: ReactElement) => rtlRender(<SafeAreaProvider initialMetrics={metrics}>{ui}</SafeAreaProvider>);

const isDisabled = (id: string) => screen.getByTestId(id).props.accessibilityState?.disabled === true;

beforeEach(() => mockCall.mockReset());

describe("dettaglio cliente", () => {
  it("saldo, premio, consenso e storico leggibile", async () => {
    await render(<CustomerDetail customerId={mockDetail.customer.id} onChanged={jest.fn()} onDeleted={jest.fn()} />);
    expect(screen.getByTestId("dettaglio-nome")).toHaveTextContent("Giulia Rossi");
    expect(screen.getByText(/1 premio da riscattare: Taglio gratis/)).toBeTruthy();
    expect(screen.getByTestId("dettaglio-consenso")).toHaveTextContent(/Riceve le promozioni/);
    expect(screen.getByText("Iscrizione")).toBeTruthy();
    expect(screen.getByText(/· Sara$/)).toBeTruthy();
    expect(screen.getByTestId("revoca-consenso")).toBeTruthy();
  });

  it("rettifica: senza motivo non parte; con motivo manda il nuovo saldo", async () => {
    const onChanged = jest.fn();
    mockCall.mockResolvedValue({ card: { stamps: 7, rewardsAvailable: 1 } });
    await render(<CustomerDetail customerId={mockDetail.customer.id} onChanged={onChanged} onDeleted={jest.fn()} />);
    await fireEvent.press(screen.getByTestId("correggi-saldo"));
    await fireEvent.press(screen.getByTestId("rettifica-timbri-piu"));
    expect(screen.getByTestId("rettifica-riepilogo")).toHaveTextContent("+1 timbro");
    await fireEvent.press(screen.getByTestId("salva-rettifica"));
    expect(mockCall).not.toHaveBeenCalled();
    expect(screen.getByText(/Scegli un motivo/)).toBeTruthy();

    await fireEvent.press(screen.getByTestId("motivo-Timbro dimenticato"));
    await fireEvent.press(screen.getByTestId("salva-rettifica"));
    expect(mockCall).toHaveBeenCalledWith("adjust", {
      shopId: "11111111-1111-4111-8111-111111111111",
      params: { id: mockDetail.customer.id },
      body: { stamps: 7, rewards: 1, reason: "Timbro dimenticato" },
    });
    expect(onChanged).toHaveBeenCalledWith(expect.objectContaining({ stamps: 7 }));
  });

  it("cancellazione in due passi: serve il codice della carta", async () => {
    const onDeleted = jest.fn();
    mockCall.mockResolvedValue({ deleted: true, shortCode: "DEMA2345" });
    await render(<CustomerDetail customerId={mockDetail.customer.id} onChanged={jest.fn()} onDeleted={onDeleted} />);
    await fireEvent.press(screen.getByTestId("cancella-cliente"));
    expect(screen.getByText(/non si può annullare/)).toBeTruthy();
    await fireEvent.press(screen.getByTestId("cancella-continua"));
    await fireEvent.changeText(screen.getByTestId("cancella-codice"), "DEMA2344");
    expect(isDisabled("cancella-conferma")).toBe(true);
    await fireEvent.changeText(screen.getByTestId("cancella-codice"), "dema2345");
    expect(isDisabled("cancella-conferma")).toBe(false);
    await fireEvent.press(screen.getByTestId("cancella-conferma"));
    expect(mockCall).toHaveBeenCalledWith(
      "deleteCustomer",
      expect.objectContaining({ params: { id: mockDetail.customer.id } }),
    );
    expect(onDeleted).toHaveBeenCalled();
  });
});
