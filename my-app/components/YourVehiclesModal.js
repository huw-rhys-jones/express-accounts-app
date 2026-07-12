import React, { useEffect, useState } from "react";
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Colors } from "../utils/sharedStyles";
import RegisterVehicleModal from "./RegisterVehicleModal";

export default function YourVehiclesModal({ visible, onClose, vehicles, onChanged }) {
  const [editingVehicle, setEditingVehicle] = useState(null);
  const [registerOpen, setRegisterOpen] = useState(false);
  const [pendingEditVehicle, setPendingEditVehicle] = useState(null);
  const [pendingCreateVehicle, setPendingCreateVehicle] = useState(false);

  useEffect(() => {
    if (visible) {
      return;
    }

    if (pendingEditVehicle) {
      setEditingVehicle(pendingEditVehicle);
      setPendingEditVehicle(null);
      return;
    }

    if (pendingCreateVehicle) {
      setRegisterOpen(true);
      setPendingCreateVehicle(false);
    }
  }, [pendingCreateVehicle, pendingEditVehicle, visible]);

  const engineLabel = (key) => {
    if (key === "over_2000") return "Over 2000cc";
    if (key === "1400_2000") return "1400–2000cc";
    return "Under 1400cc";
  };

  return (
    <>
      <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
        <View style={styles.overlay}>
          <View style={styles.card}>
            <Text style={styles.title}>Your Vehicles</Text>

            <ScrollView showsVerticalScrollIndicator={false}>
              {vehicles.length === 0 ? (
                <Text style={styles.empty}>No vehicles registered yet.</Text>
              ) : (
                vehicles.map((v) => (
                  <TouchableOpacity
                    key={v.id}
                    style={styles.vehicleRow}
                    onPress={() => {
                      setPendingEditVehicle(v);
                      onClose?.();
                    }}
                    activeOpacity={0.75}
                  >
                    <View style={styles.regBadge}>
                      <Text style={styles.regText}>{v.registrationNumber}</Text>
                    </View>
                    <View style={styles.vehicleInfo}>
                      <Text style={styles.vehicleName}>
                        {v.make}{v.model ? ` ${v.model}` : ""}
                      </Text>
                      <Text style={styles.vehicleSub}>
                        {engineLabel(v.engineSize)} · {v.fuelType} · {v.ratePerMile}p/mi
                      </Text>
                    </View>
                    <Text style={styles.editChevron}>›</Text>
                  </TouchableOpacity>
                ))
              )}

              <TouchableOpacity
                style={styles.addBtn}
                onPress={() => {
                  setPendingCreateVehicle(true);
                  onClose?.();
                }}
              >
                <Text style={styles.addBtnText}>+ Add Another Vehicle</Text>
              </TouchableOpacity>
            </ScrollView>

            <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
              <Text style={styles.closeBtnText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Edit existing vehicle */}
      <RegisterVehicleModal
        visible={Boolean(editingVehicle)}
        vehicle={editingVehicle}
        onClose={() => setEditingVehicle(null)}
        onSaved={(updated) => {
          setEditingVehicle(null);
          onChanged?.(updated);
        }}
      />

      {/* Add new vehicle */}
      <RegisterVehicleModal
        visible={registerOpen}
        onClose={() => setRegisterOpen(false)}
        onSaved={(updated) => {
          setRegisterOpen(false);
          onChanged?.(updated);
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "flex-end",
  },
  card: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    maxHeight: "80%",
    paddingBottom: 50,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: Colors.textPrimary,
    marginBottom: 16,
    textAlign: "center",
  },
  empty: {
    color: "#888",
    textAlign: "center",
    marginVertical: 20,
    fontSize: 14,
  },
  vehicleRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
    gap: 12,
  },
  regBadge: {
    backgroundColor: Colors.textPrimary,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    minWidth: 80,
    alignItems: "center",
  },
  regText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 14,
    letterSpacing: 1,
  },
  vehicleInfo: {
    flex: 1,
  },
  vehicleName: {
    fontSize: 15,
    fontWeight: "600",
    color: Colors.textPrimary,
  },
  vehicleSub: {
    fontSize: 12,
    color: "#888",
    marginTop: 2,
  },
  editChevron: {
    fontSize: 22,
    color: "#ccc",
  },
  addBtn: {
    marginTop: 16,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.accent,
    alignItems: "center",
  },
  addBtnText: {
    color: Colors.accent,
    fontWeight: "700",
    fontSize: 15,
  },
  closeBtn: {
    marginTop: 16,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: Colors.textPrimary,
    alignItems: "center",
  },
  closeBtnText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 15,
  },
});
