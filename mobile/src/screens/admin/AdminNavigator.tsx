import React, { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { api } from "../../api";
import { AppBar, BottomNav, NotificationsModal } from "../../components";
import { C, T } from "../../theme";
import type { Center, LoginResponse } from "../../types";
import { ADMIN_TABS } from "../../navigation/adminNav";
import { ResourcesPage } from "./ResourcesPage";
import { AdminMapPage } from "./MapPage";
import { CentersPage } from "./CentersPage";
import { AccountsPage } from "./AccountsPage";
import { SettingsPage } from "./SettingsPage";
import { AddCenterModal } from "./modals/AddCenterModal";
import { AddCoordinatorModal } from "./modals/AddCoordinatorModal";

type AdminView = null | { name: "addCenter" } | { name: "addCoordinator" };

/** Administrator role navigator — owns tab state, modal stack, and the
 *  nation-wide data fetches. Pages are prop-driven and independent. */
export default function AdminNavigator({
  session,
  onLogout,
}: {
  session: LoginResponse;
  onLogout: () => void;
}) {
  const [tab, setTab] = useState("resources");
  const [view, setView] = useState<AdminView>(null);
  const openView = useCallback(
    (v: { name: "addCenter" } | { name: "addCoordinator" }) => setView(v),
    [],
  );
  const [centers, setCenters] = useState<Center[]>([]);
  const [notifOpen, setNotifOpen] = useState(false);
  const [key, setKey] = useState(0);
  const refresh = useCallback(() => setKey((k) => k + 1), []);

  useEffect(() => {
    api<Center[]>("/centers")
      .then(setCenters)
      .catch(() => {});
  }, [key]);

  return (
    <View style={{ flex: 1, backgroundColor: C.background }}>
      <AppBar
        title="MADAD"
        right={
          <Pressable
            onPress={() => setNotifOpen(true)}
            hitSlop={8}
            accessibilityLabel="Notifications"
          >
            <Text style={{ fontSize: 20, padding: 6 }}>{"🔔"}</Text>
          </Pressable>
        }
      />
      <View style={{ flex: 1 }}>
        {tab === "resources" && (
          <ResourcesPage centers={centers} key2={key} go={openView} />
        )}
        {tab === "map" && <AdminMapPage centers={centers} key2={key} />}
        {tab === "centers" && (
          <CentersPage
            centers={centers}
            key2={key}
            refresh={refresh}
            go={(v: { name: "addCenter" } | { name: "addCoordinator" }) =>
              setView(v)
            }
          />
        )}
        {tab === "accounts" && (
          <AccountsPage
            key2={key}
            refresh={refresh}
            go={(v: { name: "addCenter" } | { name: "addCoordinator" }) =>
              setView(v)
            }
          />
        )}
        {tab === "settings" && (
          <SettingsPage session={session} onLogout={onLogout} />
        )}
      </View>
      <BottomNav tabs={ADMIN_TABS} active={tab} onChange={setTab} />

      {view?.name === "addCenter" && (
        <View
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: C.background,
          }}
        >
          <AddCenterModal
            centers={centers}
            onBack={() => {
              setView(null);
              refresh();
            }}
          />
        </View>
      )}
      <NotificationsModal
        visible={notifOpen}
        items={[]}
        onClose={() => setNotifOpen(false)}
      />
      {view?.name === "addCoordinator" && (
        <View
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: C.background,
          }}
        >
          <AddCoordinatorModal
            centers={centers}
            onBack={() => {
              setView(null);
              refresh();
            }}
          />
        </View>
      )}
    </View>
  );
}

function AdminBell() {
  return <Text style={{ fontSize: 20, padding: 6 }}>{"🔔"}</Text>;
}
