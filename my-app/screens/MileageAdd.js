import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import DropDownPicker from "react-native-dropdown-picker";
import Constants from "expo-constants";
import {
  collection,
  addDoc,
  serverTimestamp,
} from "firebase/firestore";
import { auth, db } from "../firebaseConfig";
import { Colors } from "../utils/sharedStyles";
import { formatDate } from "../utils/format_style";
import {
  getVehicles,
  getLastUsedVehicleId,
  setLastUsedVehicleId,
} from "../utils/appSettings";
import { useData } from "../contexts/DataContext";
import DateTimePickerModal from "react-native-modal-datetime-picker";

const GOOGLE_MAPS_KEY =
  Constants.expoConfig?.extra?.GOOGLE_MAPS_API_KEY || "";

export default function MileageAdd({ navigation }) {
  const { userProfile } = useData();
  const isVerified = userProfile?.verificationStatus === "verified";
  // ── Vehicle picker ─────────────────────────────────────────────────────────
  const [vehicles, setVehiclesState] = useState([]);
  const [vehicleOpen, setVehicleOpen] = useState(false);
  const [vehicleId, setVehicleId] = useState(null);
  const [vehicleItems, setVehicleItems] = useState([]);

  // ── Date ───────────────────────────────────────────────────────────────────
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [isDatePickerVisible, setDatePickerVisible] = useState(false);
  const showDatePicker = () => setDatePickerVisible(true);
  const hideDatePicker = () => setDatePickerVisible(false);
  const handleConfirmDate = (d) => { setSelectedDate(d); hideDatePicker(); };

  const dateKey = (() => {
    const d = selectedDate;
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  })();

  // ── Form fields ────────────────────────────────────────────────────────────
  const [purpose, setPurpose] = useState("");
  const [startAddress, setStartAddress] = useState("");
  const [endAddress, setEndAddress] = useState("");
  const [distance, setDistance] = useState("");
  const [loadingRoute, setLoadingRoute] = useState(false);

  // Autocomplete suggestion lists
  const [startSuggestions, setStartSuggestions] = useState([]);
  const [endSuggestions, setEndSuggestions] = useState([]);
  const startDebounce = useRef(null);
  const endDebounce = useRef(null);

  // ── Saving ─────────────────────────────────────────────────────────────────
  const [saving, setSaving] = useState(false);

  // ─────────────────────────────────────────────────────────────────────────
  // Derived values
  // ─────────────────────────────────────────────────────────────────────────
  const selectedVehicle = vehicles.find((v) => v.id === vehicleId) || null;
  const ratePerMile = selectedVehicle?.ratePerMile ?? 55;
  const effectiveMiles = parseFloat(distance) || 0;
  const amountGBP = ((effectiveMiles * ratePerMile) / 100).toFixed(2);
  const canSave = !!vehicleId && effectiveMiles > 0;

  // ─────────────────────────────────────────────────────────────────────────
  // Load vehicles on mount
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      const saved = await getVehicles();
      setVehiclesState(saved);
      setVehicleItems(
        saved.map((v) => ({
          label: `${v.registrationNumber} – ${v.make}${v.model ? " " + v.model : ""}`,
          value: v.id,
        }))
      );
      const lastId = await getLastUsedVehicleId();
      if (lastId && saved.find((v) => v.id === lastId)) {
        setVehicleId(lastId);
      } else if (saved.length > 0) {
        setVehicleId(saved[saved.length - 1].id);
      }
    })();
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  // Auto-calculate route when both addresses are selected via Places
  // ─────────────────────────────────────────────────────────────────────────
  const calculateRoute = async (start, end) => {
    if (!start || !end) return;
    setLoadingRoute(true);
    try {
      const origin = encodeURIComponent(start);
      const destination = encodeURIComponent(end);
      const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${origin}&destination=${destination}&key=${GOOGLE_MAPS_KEY}`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.status === "OK" && data.routes?.length) {
        const metres = data.routes[0].legs[0].distance.value;
        setDistance((metres / 1609.344).toFixed(2));
      }
    } catch (err) {
      console.error("Directions error", err);
    } finally {
      setLoadingRoute(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Places autocomplete (new API)
  // ─────────────────────────────────────────────────────────────────────────
  const fetchSuggestions = async (input) => {
    if (!isVerified || !input || input.length < 2) return [];
    try {
      const res = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": GOOGLE_MAPS_KEY,
        },
        body: JSON.stringify({
          input,
          includedRegionCodes: ["gb"],
        }),
      });
      const data = await res.json();
      return (data.suggestions || []).map((s) => s.placePrediction?.text?.text).filter(Boolean);
    } catch {
      return [];
    }
  };

  const handleStartChange = (text) => {
    setStartAddress(text);
    setStartSuggestions([]);
    clearTimeout(startDebounce.current);
    startDebounce.current = setTimeout(async () => {
      setStartSuggestions(await fetchSuggestions(text));
    }, 300);
  };

  const handleEndChange = (text) => {
    setEndAddress(text);
    setEndSuggestions([]);
    clearTimeout(endDebounce.current);
    endDebounce.current = setTimeout(async () => {
      setEndSuggestions(await fetchSuggestions(text));
    }, 300);
  };

  const handleStartSelect = (addr) => {
    setStartAddress(addr);
    setStartSuggestions([]);
    if (endAddress) calculateRoute(addr, endAddress);
  };

  const handleEndSelect = (addr) => {
    setEndAddress(addr);
    setEndSuggestions([]);
    if (startAddress) calculateRoute(startAddress, addr);
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Save
  // ─────────────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    const user = auth.currentUser;
    if (!user) { Alert.alert("Error", "Not signed in."); return; }
    if (!vehicleId) { Alert.alert("Vehicle required", "Please select a vehicle."); return; }
    if (effectiveMiles <= 0) { Alert.alert("Distance required", "Please enter the trip distance."); return; }

    setSaving(true);
    try {
      await setLastUsedVehicleId(vehicleId);
      await addDoc(collection(db, "receipts"), {
        userId: user.uid,
        type: "mileage",
        date: dateKey,
        amount: parseFloat(amountGBP),
        category: "Travel",
        mileageDetails: {
          startAddress,
          endAddress,
          distance: effectiveMiles,
          vehicleId,
          vehicleReg: selectedVehicle?.registrationNumber || "",
          ratePerMile,
          purpose: purpose.trim(),
        },
        createdAt: serverTimestamp(),
      });
      navigation.goBack();
    } catch (err) {
      console.error("Save mileage error", err);
      Alert.alert("Error", "Could not save mileage record.");
    } finally {
      setSaving(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // JSX
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerBtn}>
          <Text style={styles.headerBtnText}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Record Mileage</Text>
        <View style={styles.headerBtn} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          nestedScrollEnabled
        >
          {/* Vehicle */}
          <Text style={styles.fieldLabel}>Vehicle <Text style={styles.required}>*</Text></Text>
          {vehicles.length === 0 ? (
            <Text style={styles.noVehicleHint}>No vehicles registered. Add one via the side menu.</Text>
          ) : (
            <DropDownPicker
              open={vehicleOpen}
              value={vehicleId}
              items={vehicleItems}
              setOpen={setVehicleOpen}
              setValue={setVehicleId}
              setItems={setVehicleItems}
              style={styles.dropdown}
              dropDownContainerStyle={styles.dropdownContainer}
              zIndex={5000}
              listMode="SCROLLVIEW"
            />
          )}

          {/* Date */}
          <Text style={[styles.fieldLabel, { marginTop: vehicleOpen ? 180 : 16 }]}>
            Date <Text style={styles.required}>*</Text>
          </Text>
          <TouchableOpacity style={styles.input} onPress={showDatePicker}>
            <Text style={{ color: Colors.textPrimary, fontSize: 15, paddingVertical: 2 }}>
              {formatDate(selectedDate)}
            </Text>
          </TouchableOpacity>
          <DateTimePickerModal
            isVisible={isDatePickerVisible}
            mode="date"
            date={selectedDate}
            maximumDate={new Date()}
            onConfirm={handleConfirmDate}
            onCancel={hideDatePicker}
          />

          {/* Purpose */}
          <Text style={styles.fieldLabel}>Purpose <Text style={styles.optional}>(optional)</Text></Text>
          <TextInput
            style={styles.input}
            value={purpose}
            onChangeText={setPurpose}
            placeholder="e.g. Client meeting"
            placeholderTextColor="#999"
          />

          {/* Start Location */}
          <Text style={styles.fieldLabel}>Start Location <Text style={styles.optional}>(optional)</Text></Text>
          <View style={styles.autocompleteWrap}>
            <TextInput
              style={styles.input}
              value={startAddress}
              onChangeText={handleStartChange}
              placeholder="e.g. Home"
              placeholderTextColor="#999"
            />
            {startSuggestions.length > 0 && (
              <View style={styles.suggestionList}>
                {startSuggestions.map((item, i) => (
                  <TouchableOpacity key={`start-${i}`} style={styles.suggestionRow} onPress={() => handleStartSelect(item)}>
                    <Text style={styles.suggestionText}>{item}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>

          {/* End Location */}
          <Text style={styles.fieldLabel}>End Location <Text style={styles.optional}>(optional)</Text></Text>
          <View style={styles.autocompleteWrap}>
            <TextInput
              style={styles.input}
              value={endAddress}
              onChangeText={handleEndChange}
              placeholder="e.g. Client office"
              placeholderTextColor="#999"
            />
            {endSuggestions.length > 0 && (
              <View style={styles.suggestionList}>
                {endSuggestions.map((item, i) => (
                  <TouchableOpacity key={`end-${i}`} style={styles.suggestionRow} onPress={() => handleEndSelect(item)}>
                    <Text style={styles.suggestionText}>{item}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>

          {/* Distance */}
          <Text style={styles.fieldLabel}>
            Distance (miles) <Text style={styles.required}>*</Text>
            {loadingRoute && <ActivityIndicator size="small" color={Colors.accent} style={{ marginLeft: 6 }} />}
          </Text>
          <TextInput
            style={styles.input}
            value={distance}
            onChangeText={setDistance}
            placeholder="0.0"
            placeholderTextColor="#999"
            keyboardType="decimal-pad"
          />

          {/* Summary */}
          <View style={styles.summaryBox}>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Total Miles</Text>
              <Text style={styles.summaryValue}>
                {effectiveMiles > 0 ? effectiveMiles.toFixed(2) : "–"}
              </Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Rate</Text>
              <Text style={styles.summaryValue}>{ratePerMile}p/mile</Text>
            </View>
            <View style={[styles.summaryRow, styles.summaryRowLast]}>
              <Text style={styles.summaryLabelBold}>Amount</Text>
              <Text style={styles.summaryValueBold}>£{effectiveMiles > 0 ? amountGBP : "0.00"}</Text>
            </View>
          </View>
        </ScrollView>

        {/* Bottom action bar */}
        <View style={styles.bottomBar}>
          <TouchableOpacity style={styles.cancelBtn} onPress={() => navigation.goBack()}>
            <Text style={styles.cancelBtnText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.saveBtn, !canSave && styles.saveBtnDisabled]}
            onPress={handleSave}
            disabled={!canSave || saving}
          >
            {saving ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.saveBtnText}>Save</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f4f4f8" },
  header: {
    backgroundColor: "#1C1C4E",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: Platform.OS === "ios" ? 56 : 16,
    paddingBottom: 14,
  },
  headerTitle: { color: "#fff", fontSize: 17, fontWeight: "700" },
  headerBtn: { width: 40, alignItems: "center" },
  headerBtnText: { color: "#fff", fontWeight: "600", fontSize: 22 },
  scrollContent: { padding: 16, paddingBottom: 20 },
  fieldLabel: { fontSize: 13, fontWeight: "600", color: "#333", marginBottom: 4, marginTop: 12 },
  required: { color: Colors.accent },
  optional: { fontWeight: "400", color: "#888" },
  input: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: Colors.textPrimary,
    backgroundColor: "#fff",
  },
  dropdown: { borderColor: Colors.border, borderRadius: 10, backgroundColor: "#fff" },
  dropdownContainer: { borderColor: Colors.border, backgroundColor: "#fff" },
  noVehicleHint: { fontSize: 14, color: "#888", marginTop: 4, marginBottom: 4 },
  summaryBox: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 16,
    marginTop: 20,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
  },
  summaryRowLast: { borderBottomWidth: 0, paddingTop: 10 },
  summaryLabel: { fontSize: 14, color: "#555" },
  summaryValue: { fontSize: 14, color: Colors.textPrimary, fontWeight: "500" },
  summaryLabelBold: { fontSize: 16, color: Colors.textPrimary, fontWeight: "700" },
  summaryValueBold: { fontSize: 18, color: Colors.accent, fontWeight: "800" },
  bottomBar: {
    flexDirection: "row",
    padding: 16,
    paddingBottom: Platform.OS === "android" ? 24 : 16,
    gap: 12,
    backgroundColor: "#f4f4f8",
    borderTopWidth: 1,
    borderTopColor: "#e0e0e8",
  },
  cancelBtn: {
    flex: 1,
    backgroundColor: Colors.accent,
    paddingVertical: 14,
    borderRadius: 30,
    alignItems: "center",
  },
  cancelBtnText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  saveBtn: {
    flex: 1,
    backgroundColor: Colors.accent,
    paddingVertical: 14,
    borderRadius: 30,
    alignItems: "center",
  },
  saveBtnDisabled: { backgroundColor: "#b0b0c0" },
  saveBtnText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  autocompleteWrap: { position: "relative", zIndex: 10 },
  suggestionList: {
    position: "absolute",
    top: "100%",
    left: 0,
    right: 0,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    zIndex: 100,
    elevation: 4,
  },
  suggestionRow: {
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
  },
  suggestionText: { fontSize: 14, color: Colors.textPrimary },
});
