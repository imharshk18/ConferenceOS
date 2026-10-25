import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { NETWORK_AREAS } from "../../packages/core/network";

export function AreaPicker({
  selected,
  onChange,
  disabled = false,
  prefix = "Network area",
}: {
  selected: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
  prefix?: string;
}) {
  return (
    <View style={s.wrap}>
      {NETWORK_AREAS.map((area) => {
        const chosen = selected.includes(area.id);
        return (
          <Pressable
            key={area.id}
            accessibilityRole="checkbox"
            accessibilityLabel={`${prefix} ${area.label}`}
            accessibilityState={{ checked: chosen }}
            aria-checked={chosen}
            disabled={disabled}
            onPress={() =>
              onChange(
                chosen
                  ? selected.filter((id) => id !== area.id)
                  : [...selected, area.id],
              )
            }
            style={[
              s.chip,
              {
                borderColor: chosen ? area.color + "a0" : "#403447",
                backgroundColor: chosen ? area.color + "20" : "#1b1724",
              },
            ]}
          >
            <View
              style={[
                s.dot,
                { backgroundColor: chosen ? area.color : "#695a76" },
              ]}
            />
            <Text style={[s.label, { color: chosen ? area.color : "#b2a0c1" }]}>
              {area.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
const s = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 12,
    marginBottom: 16,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderRadius: 18,
    paddingVertical: 10,
    paddingHorizontal: 11,
  },
  dot: { width: 4, height: 4, borderRadius: 2 },
  label: { fontSize: 10 },
});
