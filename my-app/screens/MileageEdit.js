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
  doc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
} from "firebase/firestore";
import { auth, db } from "../firebaseConfig";
import { Colors } from "../utils/sharedStyles";
import { formatDate } from "../utils/format_style";
import DateTimePickerModal from "react-native-modal-datetime-picker";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button } from "react-native-paper";
import {
  getVehicles,
  setLastUsedVehicleId,
} from "../utils/appSettings";
import { useData } from "../contexts/DataContext";

const GOOGLE_MAPS_KEY =
  Constants.expoConfig?.extra?.GOOGLE_MAPS_API_KEY || "";

export default function MileageEdit({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const item = route?.params?.item;
  const md = item?.mileageDetails || {};

  const { userProfile } = useData();
  const isVerified = userProfile?.verificationStatus === "verified";

  // ── Vehicle picker ─────────────────────────────────────────────────────────
  const [vehicles, setVehiclesState] = useState([]);
  const [vehicleOpen, setVehicleOpen] = useState(false);
  const [vehicleId, setVehicleId] = useState(md.vehicleId || null);
  const [vehicleItems, setVehicleItems] = useState([]);

  // ── Date ───────────────────────────────────────────────────────────────────
  const [selectedDate, setSelectedDate] = useState(item?.date ? new Date(item.date) : new Date());
  const [isDatePickerVisible, setDatePickerVisible] = useState(false);
  const showDatePicker = () => setDatePickerVisible(true);
  const hideDatePicker = () => setDatePickerVisible(false);
  const handleConfirmDate = (d) => { setSelectedDate(d); hideDatePicker(); };
  const dateKey = (() => {
    const d = selectedDate;
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  })();

  // ── Form fields ────────────────────────────────────────────────────────────
  const [purpose, setPurpose] = useState(md.purpose || "");
  const [startAddress, setStartAddress] = useState(md.startAddress || "");
  const [endAddress, setEndAddress] = useState(md.endAddress || "");
  const [distance, setDistance] = useState(md.distance ? String(md.distance) : "");
  const [isReturnTrip, setIsReturnTrip] = useState(Boolean(md.returnTrip));
  const [lastCalculatedOneWayMiles, setLastCalculatedOneWayMiles] = useState(
    typeof md.oneWayDistance === "number"
      ? md.oneWayDistance
      : typeof md.distance === "number"
      ? md.distance / (md.returnTrip ? 2 : 1)
      : null
  );
  const [loadingRoute, setLoadingRoute] = useState(false);

  // ── Autocomplete ───────────────────────────────────────────────────────────
  const [startSuggestions, setStartSuggestions] = useState([]);
  const [endSuggestions, setEndSuggestions] = useState([]);
  const startDebounce = useRef(null);
  const endDebounce = useRef(null);

  // ── Saving / deleting ──────────────────────────────────────────────────────
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // ─────────────────────────────────────────────────────────────────────────
  const selectedVehicle = vehicles.find((v) => v.id === vehicleId) || null;
  const ratePerMile = selectedVehicle?.ratePerMile ?? md.ratePerMile ?? 55;
  const effectiveMiles = parseFloat(distance) || 0;
  const amountGBP = ((effectiveMiles * ratePerMile) / 100).toFixed(2);
  const canSave = !!vehicleId && effectiveMiles > 0;

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
    })();
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  // Route calculation
  // ─────────────────────────────────────────────────────────────────────────
  const calculateRoute = async (start, end) => {
    if (!start || !end) return;
    setLoadingRoute(true);
    try {
      const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${encodeURIComponent(start)}&destination=${encodeURIComponent(end)}&key=${GOOGLE_MAPS_KEY}`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.status === "OK" && data.routes?.length) {
        const oneWayMiles = data.routes[0].legs[0].distance.value / 1609.344;
        setLastCalculatedOneWayMiles(oneWayMiles);
        setDistance((oneWayMiles * (isReturnTrip ? 2 : 1)).toFixed(2));
      }
    } catch (err) {
      console.error("Directions error", err);
    } finally {
      setLoadingRoute(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Places autocomplete (new API, verified users only)
  // ─────────────────────────────────────────────────────────────────────────
  const fetchSuggestions = async (input) => {
    if (!isVerified || !input || input.length < 2) return [];
    try {
      const res = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Goog-Api-Key": GOOGLE_MAPS_KEY },
        body: JSON.stringify({ input, includedRegionCodes: ["gb"] }),
      });
      const data = await res.json();
      return (data.suggestions || []).map((s) => s.placePrediction?.text?.text).filter(Boolean);
    } catch { return []; }
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

  const handleToggleReturnTrip = () => {
    setIsReturnTrip((prev) => {
      const next = !prev;
      if (lastCalculatedOneWayMiles !== null) {
        setDistance((lastCalculatedOneWayMiles * (next ? 2 : 1)).toFixed(2));
      }
      return next;
    });
  };

  const handleDistanceChange = (text) => {
    setDistance(text);
    setLastCalculatedOneWayMiles(null);
  };

  // ─────────────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    const user = auth.currentUser;
    if (!user || !item?.id) return;
    if (!vehicleId) { Alert.alert("Vehicle required", "Please select a vehicle."); return; }
    if (effectiveMiles <= 0) { Alert.alert("Distance required", "Please enter the trip distance."); return; }

    setSaving(true);
    try {
      await setLastUsedVehicleId(vehicleId);
      await updateDoc(doc(db, "receipts", item.id), {
        date: dateKey,
        amount: parseFloat(amountGBP),
        mileageDetails: {
          startAddress,
          endAddress,
          distance: effectiveMiles,
          oneWayDistance:
            lastCalculatedOneWayMiles !== null
              ? parseFloat(lastCalculatedOneWayMiles.toFixed(2))
              : null,
          returnTrip: isReturnTrip,
          vehicleId,
          vehicleReg: selectedVehicle?.registrationNumber || "",
          ratePerMile,
          purpose: purpose.trim(),
        },
        updatedAt: serverTimestamp(),
      });
      navigation.goBack();
    } catch (err) {
      console.error("Update mileage error", err);
      Alert.alert("Error", "Could not update mileage record.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    Alert.alert("Delete Trip", "Are you sure you want to delete this mileage record?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete", style: "destructive",
        onPress: async () => {
          if (!item?.id) return;
          setDeleting(true);
          try {
            await deleteDoc(doc(db, "receipts", item.id));
            navigation.goBack();
          } catch (err) {
            console.error("Delete mileage error", err);
            Alert.alert("Error", "Could not delete this record.");
          } finally {
            setDeleting(false);
          }
        },
      },
    ]);
  };

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top + 10, 24) }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerBtn}>
          <Text style={styles.headerBtnText}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Edit Mileage</Text>
        <View style={styles.headerBtn} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" nestedScrollEnabled>

          {/* Vehicle */}
          <Text style={styles.fieldLabel}>Vehicle <Text style={styles.required}>*</Text></Text>
          {vehicles.length === 0 ? (
            <Text style={styles.noVehicleHint}>No vehicles registered. Add one via the side menu.</Text>
          ) : (
            <DropDownPicker
              open={vehicleOpen} value={vehicleId} items={vehicleItems}
              setOpen={setVehicleOpen} setValue={setVehicleId} setItems={setVehicleItems}
              style={styles.dropdown} dropDownContainerStyle={styles.dropdownContainer}
              zIndex={5000} listMode="SCROLLVIEW"
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
            isVisible={isDatePickerVisible} mode="date" date={selectedDate}
            maximumDate={new Date()} onConfirm={handleConfirmDate} onCancel={hideDatePicker}
          />

          {/* Purpose */}
          <Text style={styles.fieldLabel}>Purpose <Text style={styles.optional}>(optional)</Text></Text>
          <TextInput style={styles.input} value={purpose} onChangeText={setPurpose} placeholder="e.g. Client meeting" placeholderTextColor="#999" />

          {/* Start Location */}
          <Text style={styles.fieldLabel}>Start Location <Text style={styles.optional}>(optional)</Text></Text>
          <View style={styles.autocompleteWrap}>
            <TextInput style={styles.input} value={startAddress} onChangeText={handleStartChange} placeholder="e.g. Home" placeholderTextColor="#999" />
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
            <TextInput style={styles.input} value={endAddress} onChangeText={handleEndChange} placeholder="e.g. Client office" placeholderTextColor="#999" />
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

          <TouchableOpacity style={styles.returnTripRow} onPress={handleToggleReturnTrip} activeOpacity={0.8}>
            <View style={[styles.checkbox, isReturnTrip && styles.checkboxChecked]}>
              {isReturnTrip ? <Text style={styles.checkboxTick}>✓</Text> : null}
            </View>
            <Text style={styles.returnTripLabel}>Return trip (double distance)</Text>
          </TouchableOpacity>

          {/* Distance */}
          <Text style={styles.fieldLabel}>
            Distance (miles) <Text style={styles.required}>*</Text>
            {loadingRoute && <ActivityIndicator size="small" color={Colors.accent} style={{ marginLeft: 6 }} />}
          </Text>
          <TextInput style={styles.input} value={distance} onChangeText={handleDistanceChange} placeholder="0.0" placeholderTextColor="#999" keyboardType="decimal-pad" />

          {/* Summary */}
          <View style={styles.summaryBox}>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Total Miles</Text>
              <Text style={styles.summaryValue}>{effectiveMiles > 0 ? effectiveMiles.toFixed(2) : "–"}</Text>
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
        <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, Platform.OS === "android" ? 24 : 16) }]}>
          <Button
            mode="outlined"
            onPress={handleDelete}
            textColor={Colors.accent}
            style={styles.bottomActionBtn}
            disabled={deleting}
          >
            {deleting ? <ActivityIndicator color={Colors.accent} size="small" /> : "Delete"}
          </Button>
          <Button
            mode="contained"
            onPress={handleSave}
            buttonColor={Colors.accent}
            style={styles.bottomActionBtn}
            disabled={!canSave || saving}
          >
            {saving ? <ActivityIndicator color="#fff" size="small" /> : "Save"}
          </Button>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f4f4f8" },
  header: {
    backgroundColor: "#1C1C4E",
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16,
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
    borderWidth: 1, borderColor: Colors.border, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 10, fontSize: 15,
    color: Colors.textPrimary, backgroundColor: "#fff",
  },
  dropdown: { borderColor: Colors.border, borderRadius: 10, backgroundColor: "#fff" },
  dropdownContainer: { borderColor: Colors.border, backgroundColor: "#fff" },
  noVehicleHint: { fontSize: 14, color: "#888", marginTop: 4 },
  returnTripRow: {
    marginTop: 14,
    marginBottom: 2,
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
  },
  checkbox: {
    width: 20,
    height: 20,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 5,
    marginRight: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
  },
  checkboxChecked: {
    backgroundColor: Colors.accent,
    borderColor: Colors.accent,
  },
  checkboxTick: { color: "#fff", fontSize: 13, fontWeight: "800" },
  returnTripLabel: { fontSize: 14, color: Colors.textPrimary, fontWeight: "500" },
  autocompleteWrap: { position: "relative" },
  suggestionList: {
    marginTop: 6,
    backgroundColor: "#fff", borderWidth: 1, borderColor: Colors.border,
    borderRadius: 10, zIndex: 100, elevation: 4,
    overflow: "hidden",
  },
  suggestionRow: { paddingHorizontal: 14, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: "#f0f0f0" },
  suggestionText: { fontSize: 14, color: Colors.textPrimary },
  summaryBox: { backgroundColor: "#fff", borderRadius: 14, padding: 16, marginTop: 20, borderWidth: 1, borderColor: Colors.border },
  summaryRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: "#f0f0f0" },
  summaryRowLast: { borderBottomWidth: 0, paddingTop: 10 },
  summaryLabel: { fontSize: 14, color: "#555" },
  summaryValue: { fontSize: 14, color: Colors.textPrimary, fontWeight: "500" },
  summaryLabelBold: { fontSize: 16, color: Colors.textPrimary, fontWeight: "700" },
  summaryValueBold: { fontSize: 18, color: Colors.accent, fontWeight: "800" },
  bottomBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: "#fff",
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: "#e8e8e8",
  },
  bottomActionBtn: { flex: 1 },
});
