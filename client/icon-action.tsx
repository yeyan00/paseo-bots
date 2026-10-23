import { useEffect, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Icon } from "@getpaseo/plugin/client/react-native";
import type { PluginScreenProps } from "@getpaseo/plugin/client";

/** Labels remain available to keyboards, screen readers and touch long presses. */
export function IconAction({
  icon,
  label,
  theme,
  onPress,
  disabled = false,
  expanded,
  count,
  align = "end",
}: {
  icon: string;
  label: string;
  theme: PluginScreenProps["theme"];
  onPress: () => void;
  disabled?: boolean;
  expanded?: boolean;
  count?: number;
  align?: "start" | "end";
}) {
  const c = theme.colors;
  const [hover, setHover] = useState(false),
    [focus, setFocus] = useState(false),
    [touchTip, setTouchTip] = useState(false);
  const longPressed = useRef(false);
  useEffect(() => {
    if (!touchTip) return;
    const timer = setTimeout(() => setTouchTip(false), 2500);
    return () => clearTimeout(timer);
  }, [touchTip]);
  const showTip = hover || focus || touchTip;
  return (
    <View style={{ position: "relative", zIndex: showTip ? 30 : 0 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        aria-expanded={expanded}
        accessibilityState={{
          disabled,
          ...(expanded === undefined ? {} : { expanded }),
        }}
        disabled={disabled}
        onHoverIn={() => setHover(true)}
        onHoverOut={() => setHover(false)}
        onFocus={() => setFocus(true)}
        onBlur={() => setFocus(false)}
        onPressIn={() => {
          longPressed.current = false;
        }}
        onLongPress={() => {
          longPressed.current = true;
          setTouchTip(true);
        }}
        onPress={() => {
          if (!longPressed.current) {
            setFocus(false);
            setTouchTip(false);
            onPress();
          }
        }}
        style={{
          minWidth: 44,
          height: 44,
          paddingHorizontal: 10,
          gap: 5,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 8,
          backgroundColor:
            expanded || hover || focus ? c.surface2 : "transparent",
          opacity: disabled ? 0.4 : 1,
        }}
      >
        <Icon name={icon} size={18} color={c.foreground} />
        {count !== undefined && (
          <Text style={{ color: c.foregroundMuted, fontSize: 12 }}>
            {count}
          </Text>
        )}
      </Pressable>
      {showTip && (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: 46,
            ...(align === "start" ? { left: 0 } : { right: 0 }),
            minWidth: 100,
            maxWidth: 220,
            padding: 8,
            borderWidth: 1,
            borderColor: c.border,
            borderRadius: 6,
            backgroundColor: c.surface2,
          }}
        >
          <Text style={{ color: c.foreground, fontSize: 12, lineHeight: 17 }}>
            {label}
          </Text>
        </View>
      )}
    </View>
  );
}
