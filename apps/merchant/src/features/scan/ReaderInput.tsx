import { useEffect, useRef, useState } from "react";
import { TextInput, View } from "react-native";
import { Icon } from "@/ui/Icon";
import { T } from "@/ui/Text";
import { fonts, radius, space, useTheme } from "@/ui/theme";

/*
 * Modalità lettore QR esterno (USB o Bluetooth, si comporta come una tastiera): un campo
 * sempre a fuoco riceve il codice seguito da Invio. Dopo ogni lettura si svuota e resta a
 * fuoco, così tra un cliente e l'altro non serve nessun clic.
 */
export function ReaderInput({ active, onCode }: { active: boolean; onCode: (raw: string) => void }) {
  const t = useTheme();
  const input = useRef<TextInput>(null);
  const [value, setValue] = useState("");
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (active) input.current?.focus();
  }, [active]);

  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: space.xl, gap: space.lg }}>
      <View
        style={{
          width: 88,
          height: 88,
          borderRadius: 44,
          backgroundColor: focused ? t.accentSoft : t.surface2,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Icon name="keyboard" color={focused ? t.accentText : t.ink2} size={40} />
      </View>
      <T variant="subtitle" center>
        {focused ? "Pronto: scansiona con il lettore" : "Tocca qui per usare il lettore"}
      </T>
      <T tone="ink2" center>
        Il codice arriva da solo. Dopo ogni cliente il lettore è subito pronto per il prossimo.
      </T>
      <TextInput
        ref={input}
        value={value}
        onChangeText={setValue}
        accessibilityLabel="Codice dal lettore QR"
        testID="campo-lettore"
        autoFocus={active}
        autoCapitalize="none"
        autoCorrect={false}
        spellCheck={false}
        submitBehavior="submit"
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          // il campo deve restare pronto: se il fuoco va altrove (es. un tocco sullo sfondo) torna qui
          if (active) setTimeout(() => input.current?.focus(), 150);
        }}
        onSubmitEditing={() => {
          const raw = value;
          setValue("");
          if (raw.trim()) onCode(raw);
          input.current?.focus();
        }}
        style={{
          width: "100%",
          maxWidth: 420,
          minHeight: 56,
          borderRadius: radius.field,
          borderWidth: focused ? 2 : 1,
          borderColor: focused ? t.accentEdge : t.line,
          backgroundColor: t.surface,
          color: t.ink,
          fontSize: 17,
          fontFamily: fonts.regular,
          textAlign: "center",
        }}
      />
    </View>
  );
}
