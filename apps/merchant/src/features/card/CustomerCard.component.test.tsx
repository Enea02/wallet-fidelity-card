/// <reference types="jest" />
import type { CardView } from "@loyalty/shared/api";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { CustomerCard, type CustomerCardProps } from "./CustomerCard";
import { availability, cardReducer, initialState, type CardState } from "./state";

// la griglia SVG non serve qui: si verifica il saldo scritto
jest.mock("./StampGrid", () => ({ StampGrid: () => null }));

const card = (over: Partial<CardView> = {}): CardView => ({
  id: "33333333-3333-4333-8333-333333333333",
  shortCode: "DEMA2345",
  name: "Giulia Rossi",
  stamps: 6,
  stampsRequired: 10,
  rewardsAvailable: 0,
  rewardLabel: "Taglio gratis",
  ...over,
});
const base = () => initialState({ card: card(), since: "2026-03-03T10:00:00Z", visits: 16 });

async function renderCard(state: CardState, over: Partial<CustomerCardProps> = {}, now = 0, online = true) {
  const handlers = {
    onStamp: jest.fn(),
    onRedeem: jest.fn(),
    onUndo: jest.fn(),
    onNext: jest.fn(),
    onDismissError: jest.fn(),
  };
  await render(
    <CustomerCard
      state={state}
      can={availability(state, now, online)}
      stampIcon="scissors"
      online={online}
      {...handlers}
      {...over}
    />,
  );
  return handlers;
}

const isDisabled = (testID: string) => screen.getByTestId(testID).props.accessibilityState?.disabled === true;

describe("scheda cliente", () => {
  it("appena scansionata: chi è, saldo, timbro attivo, riscatto spento, niente annullamento", async () => {
    const h = await renderCard(base());
    expect(screen.getByTestId("nome-cliente")).toHaveTextContent("Giulia Rossi");
    expect(screen.getByText(/Cliente da marzo · 16 visite/)).toBeTruthy();
    expect(screen.getByLabelText("6 timbri su 10")).toBeTruthy();
    expect(isDisabled("aggiungi-timbro")).toBe(false);
    expect(isDisabled("riscatta-premio")).toBe(true);
    expect(screen.queryByTestId("annulla-timbro")).toBeNull();
    await fireEvent.press(screen.getByTestId("aggiungi-timbro"));
    expect(h.onStamp).toHaveBeenCalledTimes(1);
  });

  it("timbro in corso: pulsanti bloccati (niente doppio tocco)", async () => {
    const h = await renderCard(cardReducer(base(), { type: "start", action: "stamp" }));
    expect(isDisabled("aggiungi-timbro")).toBe(true);
    await fireEvent.press(screen.getByTestId("aggiungi-timbro"));
    expect(h.onStamp).not.toHaveBeenCalled();
  });

  it("dopo il timbro: annullamento con il conto alla rovescia", async () => {
    const s = cardReducer(base(), { type: "stamped", card: card({ stamps: 7 }), rewardUnlocked: false, at: 0 });
    const h = await renderCard(s, {}, 8_000);
    expect(screen.getByLabelText("7 timbri su 10")).toBeTruthy();
    expect(screen.getByTestId("annulla-timbro")).toHaveTextContent("Annulla ultimo timbro · 4:52");
    await fireEvent.press(screen.getByTestId("annulla-timbro"));
    expect(h.onUndo).toHaveBeenCalledTimes(1);
  });

  it("con un premio: etichetta e riscatto attivo", async () => {
    const h = await renderCard(
      initialState({ card: card({ stamps: 0, rewardsAvailable: 1 }), since: "2026-03-03T10:00:00Z", visits: 10 }),
    );
    expect(screen.getByTestId("premi-disponibili")).toHaveTextContent("1 premio disponibile: Taglio gratis");
    await fireEvent.press(screen.getByTestId("riscatta-premio"));
    expect(h.onRedeem).toHaveBeenCalledTimes(1);
  });

  it("errore del server: messaggio e codice assistenza", async () => {
    const s = cardReducer(base(), {
      type: "failed",
      notice: {
        code: "E_CARD_DELETED",
        userMessage: "Questa carta è stata cancellata su richiesta del cliente.",
        supportCode: "ERR-7K3QX",
      },
    });
    await renderCard(s);
    expect(screen.getByTestId("messaggio-errore")).toHaveTextContent(/cancellata/);
    expect(screen.getByText("ERR-7K3QX")).toBeTruthy();
  });

  it("offline: avviso e azioni bloccate", async () => {
    await renderCard(
      initialState({ card: card({ rewardsAvailable: 1 }), since: "2026-03-03T10:00:00Z", visits: 3 }),
      {},
      0,
      false,
    );
    expect(screen.getByText(/Senza rete/)).toBeTruthy();
    expect(isDisabled("aggiungi-timbro")).toBe(true);
    expect(isDisabled("riscatta-premio")).toBe(true);
  });

  it("cliente successivo sempre disponibile", async () => {
    const h = await renderCard(base(), {}, 0, false);
    await fireEvent.press(screen.getByTestId("cliente-successivo"));
    expect(h.onNext).toHaveBeenCalledTimes(1);
  });
});
