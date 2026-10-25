import React, { useEffect, useState } from "react";
import { Text, View } from "react-native";
import QRCode from "react-native-qrcode-svg";
import { invitationPayload } from "./inviteCode";

export function InvitationQR({
  code,
  expiresAt,
}: {
  code: string;
  expiresAt: number;
}) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  if (now >= expiresAt)
    return (
      <Text style={{ color: "#edc29d", fontSize: 12, marginVertical: 18 }}>
        This invite expired. Create a fresh code below.
      </Text>
    );
  return (
    <View
      testID="connection-invite-qr"
      accessibilityLabel={`ConferenceOS invitation QR for ${code}`}
      style={{
        padding: 14,
        marginBottom: 20,
        backgroundColor: "#ffffff",
        borderRadius: 18,
      }}
    >
      <QRCode
        value={invitationPayload(code)}
        size={180}
        color="#17121f"
        backgroundColor="#ffffff"
        quietZone={8}
        ecl="M"
      />
    </View>
  );
}
