import { Composition } from "remotion";
import { DURATION, Presentazione } from "./Presentazione";
import { FPS } from "./ui/theme";

export function Root() {
  return (
    <Composition
      id="Presentazione"
      component={Presentazione}
      durationInFrames={DURATION}
      fps={FPS}
      width={1920}
      height={1080}
    />
  );
}
