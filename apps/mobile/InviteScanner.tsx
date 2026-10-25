import React, { useEffect, useRef, useState } from "react";
import {
  AppState,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import Ionicons from "@expo/vector-icons/Ionicons";
import { readIncomingInvite } from "./inviteLink";
import { useReducedMotion } from "./useReducedMotion";

export function InviteScanner({
  onClose,
  onCode,
}: {
  onClose: () => void;
  onCode: (code: string) => void;
}) {
  const [permission, requestPermission] = useCameraPermissions();
  const reducedMotion = useReducedMotion();
  const [active, setActive] = useState(AppState.currentState === "active");
  const [paused, setPaused] = useState(false),
    [error, setError] = useState(""),
    [pasted, setPasted] = useState("");
  const locked = useRef(false);
  useEffect(() => {
    const listener = AppState.addEventListener("change", (state) =>
      setActive(state === "active"),
    );
    return () => listener.remove();
  }, []);
  const receive = (payload: string) => {
    if (locked.current) return;
    locked.current = true;
    setPaused(true);
    const code = readIncomingInvite(payload);
    if (!code) {
      setError(
        "That isn’t a valid ConferenceOS invite. Scan an invite QR from someone’s Network screen.",
      );
      return;
    }
    onCode(code);
    onClose();
  };
  return (
    <Modal
      animationType={reducedMotion ? "none" : "slide"}
      transparent
      onRequestClose={onClose}
    >
      <View style={s.backdrop}>
        <View style={s.sheet}>
          <ScrollView
            automaticallyAdjustKeyboardInsets
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={s.heading}>
              <View>
                <Text style={s.eyebrow}>ONE SCAN. A NEW CONNECTION.</Text>
                <Text style={s.title}>Say hello.</Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close invite scanner"
                onPress={onClose}
                style={s.close}
              >
                <Ionicons name="close" size={22} color="#e9dff8" />
              </Pressable>
            </View>
            <Text style={s.body}>
              Scan their ConferenceOS invite, then send a request. They still
              choose whether to accept.
            </Text>
            <View style={s.camera}>
              {permission?.granted && active && !paused ? (
                <CameraView
                  style={StyleSheet.absoluteFill}
                  facing="back"
                  barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
                  onBarcodeScanned={({ data }) => receive(data)}
                  onMountError={() => {
                    setPaused(true);
                    setError(
                      "Camera unavailable. You can paste the invite link below or enter their code in Network.",
                    );
                  }}
                />
              ) : (
                <View style={s.placeholder}>
                  <Ionicons name="scan-outline" size={55} color="#c4a8f0" />
                  <Text style={s.body}>
                    {paused
                      ? "Scanner paused"
                      : "Camera opens only with your permission"}
                  </Text>
                </View>
              )}
              <View pointerEvents="none" style={s.frame} />
            </View>
            {!permission?.granted && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Allow camera for QR scanning"
                style={s.button}
                onPress={() => {
                  if (
                    permission &&
                    !permission.canAskAgain &&
                    Platform.OS !== "web"
                  )
                    void Linking.openSettings();
                  else
                    void requestPermission()
                      .then((result) => {
                        if (!result.granted)
                          setError(
                            "Camera permission wasn’t granted. Paste an invite link below instead.",
                          );
                      })
                      .catch(() =>
                        setError(
                          "Camera access unavailable. Paste an invite link instead.",
                        ),
                      );
                }}
              >
                <Text style={s.buttonText}>
                  {permission && !permission.canAskAgain
                    ? "Open camera settings"
                    : "Allow camera"}
                </Text>
              </Pressable>
            )}
            {!!error && (
              <Text accessibilityRole="alert" style={s.error}>
                {error}
              </Text>
            )}
            {paused && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Scan another QR code"
                onPress={() => {
                  locked.current = false;
                  setPaused(false);
                  setError("");
                }}
                style={s.secondary}
              >
                <Text style={s.body}>Scan again</Text>
              </Pressable>
            )}
            <TextInput
              accessibilityLabel="Paste invite QR link"
              value={pasted}
              onChangeText={setPasted}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="Or paste an invite link"
              placeholderTextColor="#8b809b"
              style={s.input}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Use pasted invite link"
              disabled={!pasted || paused}
              onPress={() => receive(pasted)}
              style={[s.secondary, !pasted && { opacity: 0.4 }]}
            >
              <Text style={s.body}>Use invite link</Text>
            </Pressable>
            <Text style={s.fine}>
              Only ConferenceOS invitation links are accepted. Scanning never
              opens a website.
            </Text>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
const s = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "#050712b0",
  },
  sheet: {
    backgroundColor: "#191623",
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    padding: 24,
    paddingBottom: 36,
    maxHeight: "96%",
  },
  heading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  eyebrow: { fontSize: 8, letterSpacing: 1.5, color: "#ac99bf" },
  title: {
    fontSize: 29,
    color: "#eee4f7",
    marginTop: 9,
    fontWeight: "500",
    letterSpacing: -1,
  },
  close: { padding: 9, backgroundColor: "#30263c", borderRadius: 20 },
  body: { color: "#b6a7c7", fontSize: 12, lineHeight: 19, marginTop: 8 },
  camera: {
    height: 230,
    marginVertical: 18,
    borderRadius: 24,
    overflow: "hidden",
    backgroundColor: "#0e1018",
    alignItems: "center",
    justifyContent: "center",
  },
  placeholder: { alignItems: "center", padding: 25 },
  frame: {
    position: "absolute",
    width: 175,
    height: 175,
    borderWidth: 1.5,
    borderColor: "#c6b2ed80",
    borderRadius: 20,
  },
  button: {
    backgroundColor: "#cdb5f3",
    borderRadius: 18,
    padding: 15,
    alignItems: "center",
  },
  buttonText: { color: "#261c35", fontWeight: "600", fontSize: 13 },
  secondary: { padding: 9, alignItems: "center" },
  error: { color: "#f0b2c4", fontSize: 12, lineHeight: 19, marginVertical: 8 },
  input: {
    backgroundColor: "#100f19",
    padding: 14,
    borderRadius: 15,
    color: "#eee4f7",
    fontSize: 12,
    borderWidth: 1,
    borderColor: "#3b2e49",
  },
  fine: { color: "#897b9b", fontSize: 9, lineHeight: 15, marginTop: 8 },
});
