export interface CameraScannerProps {
  /** false mentre si cerca la carta o la schermata non è in primo piano: la fotocamera si ferma. */
  active: boolean;
  onCode: (raw: string) => void;
}
