import { slide } from "@remotion/transitions/slide";
import { linearTiming, TransitionSeries } from "@remotion/transitions";
import type { ComponentType } from "react";
import { Apertura } from "./scenes/Apertura";
import { Assistenza } from "./scenes/Assistenza";
import { Cassa } from "./scenes/Cassa";
import { Chiusura } from "./scenes/Chiusura";
import { Iscrizione } from "./scenes/Iscrizione";
import { Problema } from "./scenes/Problema";
import { Programmi } from "./scenes/Programmi";
import { Titolare } from "./scenes/Titolare";
import { s } from "./ui/theme";

/** Scene in ordine, con la loro durata; tra una scena e l'altra mezzo secondo di scorrimento. */
const SCENES: Array<{ id: string; Scene: ComponentType; seconds: number }> = [
  { id: "apertura", Scene: Apertura, seconds: 5.5 },
  { id: "problema", Scene: Problema, seconds: 5 },
  { id: "iscrizione", Scene: Iscrizione, seconds: 17 },
  { id: "cassa", Scene: Cassa, seconds: 15 },
  { id: "titolare", Scene: Titolare, seconds: 16 },
  { id: "programmi", Scene: Programmi, seconds: 9 },
  { id: "assistenza", Scene: Assistenza, seconds: 5 },
  { id: "chiusura", Scene: Chiusura, seconds: 5.5 },
];
const TRANSITION = s(0.5);

export const DURATION = SCENES.reduce((t, sc) => t + s(sc.seconds), 0) - TRANSITION * (SCENES.length - 1);

export function Presentazione() {
  return (
    <TransitionSeries>
      {SCENES.flatMap(({ id, Scene, seconds }, i) => {
        const items = [
          <TransitionSeries.Sequence key={id} durationInFrames={s(seconds)} name={id}>
            <Scene />
          </TransitionSeries.Sequence>,
        ];
        if (i < SCENES.length - 1) {
          // scorrimento e non dissolvenza: con la dissolvenza i testi di due scene si sovrappongono
          items.push(
            <TransitionSeries.Transition
              key={`${id}-t`}
              presentation={slide({ direction: "from-right" })}
              timing={linearTiming({ durationInFrames: TRANSITION })}
            />,
          );
        }
        return items;
      })}
    </TransitionSeries>
  );
}
