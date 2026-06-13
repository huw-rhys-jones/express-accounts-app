import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import DropDownPicker from "react-native-dropdown-picker";
import { Colors } from "../utils/sharedStyles";
import { getVehicles, setVehicles } from "../utils/appSettings";

const ENGINE_SIZES = [
  { label: "Under 1400cc", value: "under_1400" },
  { label: "1400cc – 2000cc", value: "1400_2000" },
  { label: "Over 2000cc", value: "over_2000" },
];

const FUEL_TYPES = [
  { label: "Petrol", value: "PETROL" },
  { label: "Diesel", value: "DIESEL" },
  { label: "Electric", value: "ELECTRIC" },
  { label: "Hybrid", value: "HYBRID" },
];

export default function RegisterVehicleModal({ visible, onClose, onSaved, vehicle }) {
  const isEditing = Boolean(vehicle);

  const [reg, setReg] = useState("");
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [engineOpen, setEngineOpen] = useState(false);
  const [engineSize, setEngineSize] = useState("under_1400");
  const [fuelOpen, setFuelOpen] = useState(false);
  const [fuelType, setFuelType] = useState("PETROL");
  const [ratePerMile, setRatePerMile] = useState("55");
  const [dvlaLooking, setDvlaLooking] = useState(false);

  // Pre-fill when editing
  useEffect(() => {
    if (vehicle) {
      setReg(vehicle.registrationNumber || "");
      setMake(vehicle.make || "");
      setModel(vehicle.model || "");
      setEngineSize(vehicle.engineSize || "under_1400");
      setFuelType(vehicle.fuelType || "PETROL");
      setRatePerMile(String(vehicle.ratePerMile ?? 55));
    } else {
      setReg("");
      setMake("");
      setModel("");
      setEngineSize("under_1400");
      setFuelType("PETROL");
      setRatePerMile("55");
    }
  }, [vehicle, visible]);

  const canSave = reg.trim().length > 0 && make.trim().length > 0;

  const handleSave = async () => {
    const saved = await getVehicles();
    const rate = parseFloat(ratePerMile) || 55;
    let updated;

    if (isEditing) {
      updated = saved.map((v) =>
        v.id === vehicle.id
          ? { ...v, registrationNumber: reg.trim().toUpperCase(), make: make.trim(), model: model.trim(), engineSize, fuelType, ratePerMile: rate }
          : v
      );
    } else {
      const newVehicle = {
        id: Date.now().toString(),
        registrationNumber: reg.trim().toUpperCase(),
        make: make.trim(),
        model: model.trim(),
        engineSize,
        fuelType,
        ratePerMile: rate,
        addedAt: new Date().toISOString(),
      };
      updated = [...saved, newVehicle];
    }

    await setVehicles(updated);
    onSaved?.(updated);
    onClose();
  };

  const handleDelete = () => {
    Alert.alert(
      "Remove Vehicle",
      `Remove ${reg.trim().toUpperCase()} from your vehicles?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            const saved = await getVehicles();
            const updated = saved.filter((v) => v.id !== vehicle.id);
            await setVehicles(updated);
            onSaved?.(updated);
            onClose();
          },
        },
      ]
    );
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.card}>
          <Text style={styles.title}>{isEditing ? "Edit Vehicle" : "Register Vehicle"}</Text>

          <ScrollView
            style={{ flex: 1 }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: 8 }}
          >
            {/* Registration */}
            <Text style={styles.label}>Registration Number *</Text>
            <View style={styles.regRow}>
              <TextInput
                style={[styles.input, { flex: 1, textTransform: "uppercase" }]}
                value={reg}
                onChangeText={(t) => setReg(t.toUpperCase())}
                placeholder="e.g. AB12 CDE"
                placeholderTextColor="#aaa"
                autoCapitalize="characters"
              />
              <TouchableOpacity
                style={styles.lookupBtn}
                disabled
                activeOpacity={0.5}
              >
                {dvlaLooking
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={styles.lookupBtnText}>Look up</Text>
                }
              </TouchableOpacity>
            </View>
            <Text style={styles.lookupNote}>DVLA vehicle lookup coming soon</Text>

            {/* Make */}
            <Text style={styles.label}>Make *</Text>
            <TextInput
              style={styles.input}
              value={make}
              onChangeText={setMake}
              placeholder="e.g. Ford"
              placeholderTextColor="#aaa"
            />

            {/* Model */}
            <Text style={styles.label}>Model</Text>
            <TextInput
              style={styles.input}
              value={model}
              onChangeText={setModel}
              placeholder="e.g. Focus"
              placeholderTextColor="#aaa"
            />

            {/* Engine Size */}
            <Text style={styles.label}>Engine Size</Text>
            <DropDownPicker
              open={engineOpen}
              value={engineSize}
              items={ENGINE_SIZES}
              setOpen={setEngineOpen}
              setValue={setEngineSize}
              style={styles.dropdown}
              dropDownContainerStyle={styles.dropdownContainer}
              zIndex={3000}
              zIndexInverse={1000}
              listMode="SCROLLVIEW"
            />

            {/* Fuel Type */}
            <Text style={[styles.label, { marginTop: engineOpen ? 120 : 12 }]}>Fuel Type</Text>
            <DropDownPicker
              open={fuelOpen}
              value={fuelType}
              items={FUEL_TYPES}
              setOpen={setFuelOpen}
              setValue={setFuelType}
              style={styles.dropdown}
              dropDownContainerStyle={styles.dropdownContainer}
              zIndex={2000}
              zIndexInverse={2000}
              listMode="SCROLLVIEW"
            />

            {/* Rate per mile */}
            <Text style={[styles.label, { marginTop: fuelOpen ? 120 : 12 }]}>Rate per Mile (pence)</Text>
            <TextInput
              style={styles.input}
              value={ratePerMile}
              onChangeText={setRatePerMile}
              keyboardType="decimal-pad"
              placeholder="55"
              placeholderTextColor="#aaa"
            />
            <Text style={styles.rateHint}>
              HMRC advisory rate is 55p/mile. You can adjust this to match your actual rate.
            </Text>

            {isEditing && (
              <TouchableOpacity style={styles.deleteBtn} onPress={handleDelete}>
                <Text style={styles.deleteBtnText}>Remove Vehicle</Text>
              </TouchableOpacity>
            )}
          </ScrollView>

          {/* Buttons always visible outside ScrollView */}
          <View style={styles.btnRow}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.saveBtn, !canSave && styles.saveBtnDisabled]}
              onPress={handleSave}
              disabled={!canSave}
            >
              <Text style={styles.saveBtnText}>Save</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
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
    maxHeight: "90%",
    flex: 1,
    flexShrink: 1,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: Colors.textPrimary,
    marginBottom: 16,
    textAlign: "center",
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
    color: Colors.textPrimary,
    marginBottom: 6,
    marginTop: 12,
  },
  input: {
    backgroundColor: "#f5f5f5",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: Colors.textPrimary,
    borderWidth: 1,
    borderColor: "#e0e0e0",
  },
  regRow: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
  },
  lookupBtn: {
    backgroundColor: "#aaa",
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  lookupBtnText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 14,
  },
  lookupNote: {
    fontSize: 11,
    color: "#aaa",
    marginTop: 4,
    marginBottom: 2,
  },
  dropdown: {
    borderColor: "#e0e0e0",
    backgroundColor: "#f5f5f5",
    borderRadius: 10,
  },
  dropdownContainer: {
    borderColor: "#e0e0e0",
    backgroundColor: "#f5f5f5",
  },
  rateHint: {
    fontSize: 11,
    color: "#888",
    marginTop: 6,
    lineHeight: 16,
  },
  btnRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 24,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: "#f0f0f0",
    alignItems: "center",
  },
  cancelBtnText: {
    color: "#333",
    fontWeight: "600",
    fontSize: 15,
  },
  saveBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: Colors.accent,
    alignItems: "center",
  },
  saveBtnDisabled: {
    backgroundColor: "#ccc",
  },
  saveBtnText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 15,
  },
  deleteBtn: {
    marginTop: 12,
    marginBottom: 8,
    paddingVertical: 12,
    alignItems: "center",
  },
  deleteBtnText: {
    color: Colors.accent,
    fontWeight: "600",
    fontSize: 14,
    textDecorationLine: "underline",
  },
});
