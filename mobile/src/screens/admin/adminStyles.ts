import { StyleSheet } from "react-native";
import { C, RADIUS } from "../../theme";

export const cs = StyleSheet.create({
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.surfaceLowest,
    borderWidth: 1,
    borderColor: C.outlineVariant,
    borderRadius: 12,
    paddingHorizontal: 14,
    marginBottom: 14,
    minHeight: 46,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: C.surfaceHigh,
    alignItems: "center",
    justifyContent: "center",
  },
  pickerRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 8,
  },
  infoPanel: {
    flexDirection: "row",
    backgroundColor: C.surfaceLow,
    borderRadius: 12,
    padding: 14,
    marginTop: 12,
  },
  mapPreview: {
    backgroundColor: C.surfaceContainer,
    borderRadius: 12,
    height: 120,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },

  // Add Center live map preview
  previewWrap: {
    position: "relative",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.outlineVariant,
  },
  previewBadgeWrap: {
    position: "absolute",
    top: 8,
    left: 8,
    flexDirection: "row",
    alignItems: "center",
  },
  previewBadge: {
    backgroundColor: "rgba(0,0,0,0.45)",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    flexDirection: "row",
    alignItems: "center",
  },
  previewBadgeText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600" as const,
  },

  // Sticky bottom action bar replacing the floating FAB
  actionBar: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: C.surfaceLowest,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.outlineVariant,
  },
  actionBtn: {
    backgroundColor: C.primary,
    borderRadius: RADIUS.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    gap: 8,
  },
  actionBtnIcon: {
    color: C.onPrimary,
    fontSize: 20,
    lineHeight: 22,
  },
  actionBtnLabel: {
    color: C.onPrimary,
    fontSize: 15,
    fontWeight: "600" as const,
  },
});
