import { forwardRef, useId, useState } from "react";
import { TextInput, View, type TextInputProps } from "react-native";
import { T } from "./Text";
import { fonts, radius, space, useTheme } from "./theme";

export interface TextFieldProps extends TextInputProps {
  label: string;
  hint?: string;
  error?: string | null;
}

/** Campo del design: etichetta sopra, testo ≥16 px (niente zoom su iOS), errore sotto in rosso. */
export const TextField = forwardRef<TextInput, TextFieldProps>(function TextField(
  { label, hint, error, style, onFocus, onBlur, ...rest },
  ref,
) {
  const t = useTheme();
  const [focused, setFocused] = useState(false);
  const id = `campo-${useId().replace(/:/g, "")}`;
  return (
    <View style={{ gap: 6 }}>
      <T variant="small" style={{ fontFamily: fonts.semibold }} nativeID={`${id}-label`}>
        {label}
      </T>
      <TextInput
        ref={ref}
        accessibilityLabel={label}
        aria-labelledby={`${id}-label`}
        aria-invalid={!!error}
        placeholderTextColor={t.ink3}
        {...rest}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        style={[
          {
            minHeight: 56,
            borderRadius: radius.field,
            borderWidth: focused ? 2 : 1,
            borderColor: error ? t.danger : focused ? t.accentEdge : t.line,
            backgroundColor: t.surface,
            paddingHorizontal: focused ? space.md - 1 : space.md,
            color: t.ink,
            fontSize: 17,
            fontFamily: fonts.regular,
          },
          style,
        ]}
      />
      {error ? (
        <T variant="small" tone="danger" accessibilityLiveRegion="polite">
          {error}
        </T>
      ) : hint ? (
        <T variant="small" tone="ink2">
          {hint}
        </T>
      ) : null}
    </View>
  );
});
