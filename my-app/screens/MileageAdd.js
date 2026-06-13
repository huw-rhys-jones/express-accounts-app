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
import MapView, { Polyline, Marker } from "react-native-maps";
import { GooglePlacesAutocomplete } from "react-native-google-places-autocomplete";
import * as Location from "expo-location";
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
import DateTimePickerModal from "react-native-modal-datetime-picker";

const GOOGLE_MAPS_KEY =
  Constants.expoConfig?.extra?.GOOGLE_MAPS_API_KEY || "";

const INPUT_TABS = ["Address", "GPS", "Manual"];

export default function MileageAdd({ navigation }) {
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

  // Derive the YYYY-MM-DD string saved to Firestore
  const dateKey = (() => {
    const d = selectedDate;
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  })();

  // ── Purpose ────────────────────────────────────────────────────────────────
  const [purpose, setPurpose] = useState("");

  // ── Input method tab ───────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState("Address");

  // ── Address method ─────────────────────────────────────────────────────────
  const [startAddress, setStartAddress] = useState("");
  const [endAddress, setEndAddress] = useState("");
  const [routeCoords, setRouteCoords] = useState(null); // [{lat, lng}]
  const [routeMiles, setRouteMiles] = useState(null);
  const [mapRegion, setMapRegion] = useState(null);
  const [loadingRoute, setLoadingRoute] = useState(false);

  // ── GPS method ─────────────────────────────────────────────────────────────
  const [gpsLocation, setGpsLocation] = useState(null);
  const [gpsAddress, setGpsAddress] = useState("");
  const [loadingGps, setLoadingGps] = useState(false);

  // ── Manual method ──────────────────────────────────────────────────────────
  const [manualMiles, setManualMiles] = useState("");
  const [manualStart, setManualStart] = useState("");
  const [manualEnd, setManualEnd] = useState("");

  // ── Saving ─────────────────────────────────────────────────────────────────
  const [saving, setSaving] = useState(false);

  // ─────────────────────────────────────────────────────────────────────────
  // Derived values
  // ─────────────────────────────────────────────────────────────────────────
  const selectedVehicle = vehicles.find((v) => v.id === vehicleId) || null;
  const ratePerMile = selectedVehicle?.ratePerMile ?? 55;

  const effectiveMiles = (() => {
    if (activeTab === "Manual") return parseFloat(manualMiles) || 0;
    return routeMiles || 0;
  })();

  const amountGBP = ((effectiveMiles * ratePerMile) / 100).toFixed(2);

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
  // Address → directions
  // ─────────────────────────────────────────────────────────────────────────
  const fetchDirections = async () => {
    if (!startAddress || !endAddress) {
      Alert.alert("Missing address", "Please enter both a start and end address.");
      return;
    }
    setLoadingRoute(true);
    setRouteCoords(null);
    setRouteMiles(null);
    try {
      const origin = encodeURIComponent(startAddress);
      const destination = encodeURIComponent(endAddress);
      const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${origin}&destination=${destination}&key=${GOOGLE_MAPS_KEY}`;
      const res = await fetch(url);
      const data = await res.json();

      if (data.status !== "OK" || !data.routes?.length) {
        Alert.alert("Route not found", "Could not find a route between those addresses.");
        return;
      }

      const leg = data.routes[0].legs[0];
      const metres = leg.distance.value;
      const miles = metres / 1609.344;
      setRouteMiles(parseFloat(miles.toFixed(2)));

      // Decode polyline
      const encoded = data.routes[0].overview_polyline.points;
      const decoded = decodePolyline(encoded);
      setRouteCoords(decoded);

      // Centre the map
      const lats = decoded.map((p) => p.latitude);
      const lngs = decoded.map((p) => p.longitude);
      setMapRegion({
        latitude: (Math.min(...lats) + Math.max(...lats)) / 2,
        longitude: (Math.min(...lngs) + Math.max(...lngs)) / 2,
        latitudeDelta: (Math.max(...lats) - Math.min(...lats)) * 1.4 + 0.05,
        longitudeDelta: (Math.max(...lngs) - Math.min(...lngs)) * 1.4 + 0.05,
      });
    } catch (err) {
      console.error("Directions error", err);
      Alert.alert("Error", "Could not fetch directions. Please check your connection.");
    } finally {
      setLoadingRoute(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // GPS
  // ─────────────────────────────────────────────────────────────────────────
  const captureGps = async () => {
    setLoadingGps(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission denied", "Location access is needed to capture your GPS position.");
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setGpsLocation(loc.coords);

      // Reverse geocode
      const [place] = await Location.reverseGeocodeAsync({
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
      });

      const parts = [place?.street, place?.city, place?.region, place?.postalCode].filter(Boolean);
      setGpsAddress(parts.join(", "));
    } catch (err) {
      console.error("GPS error", err);
      Alert.alert("Error", "Could not get your location.");
    } finally {
      setLoadingGps(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Save
  // ─────────────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    const user = auth.currentUser;
    if (!user) {
      Alert.alert("Error", "Not signed in.");
      return;
    }
    if (!vehicleId) {
      Alert.alert("Vehicle required", "Please select a vehicle.");
      return;
    }
    if (effectiveMiles <= 0) {
      Alert.alert("Distance required", "Please enter or calculate the trip distance.");
      return;
    }

    setSaving(true);
    try {
      let tripStartAddress = "";
      let tripEndAddress = "";
      let method = activeTab;

      if (activeTab === "Address") {
        tripStartAddress = startAddress;
        tripEndAddress = endAddress;
      } else if (activeTab === "GPS") {
        tripStartAddress = gpsAddress;
        tripEndAddress = "";
      } else {
        tripStartAddress = manualStart;
        tripEndAddress = manualEnd;
      }

      await setLastUsedVehicleId(vehicleId);

      await addDoc(collection(db, "receipts"), {
        userId: user.uid,
        type: "mileage",
        date: dateKey,
        amount: parseFloat(amountGBP),
        category: "Travel",
        mileageDetails: {
          startAddress: tripStartAddress,
          endAddress: tripEndAddress,
          distance: effectiveMiles,
          method,
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
  // Render helpers
  // ─────────────────────────────────────────────────────────────────────────
  const renderAddressTab = () => (
    <View>
      <Text style={styles.fieldLabel}>Start Address</Text>
      <GooglePlacesAutocomplete
        placeholder="e.g. 10 Downing Street, London"
        onPress={(data) => setStartAddress(data.description)}
        query={{ key: GOOGLE_MAPS_KEY, language: "en", components: "country:gb" }}
        styles={{ textInput: styles.placesInput, container: { marginBottom: 8 }, listView: { zIndex: 99 } }}
        fetchDetails={false}
        enablePoweredByContainer={false}
        keepResultsAfterBlur
        textInputProps={{ onChangeText: (t) => setStartAddress(t) }}
      />

      <Text style={styles.fieldLabel}>End Address</Text>
      <GooglePlacesAutocomplete
        placeholder="e.g. 1 Victoria St, London"
        onPress={(data) => setEndAddress(data.description)}
        query={{ key: GOOGLE_MAPS_KEY, language: "en", components: "country:gb" }}
        styles={{ textInput: styles.placesInput, container: { marginBottom: 8 }, listView: { zIndex: 99 } }}
        fetchDetails={false}
        enablePoweredByContainer={false}
        keepResultsAfterBlur
        textInputProps={{ onChangeText: (t) => setEndAddress(t) }}
      />

      <TouchableOpacity
        style={[styles.actionBtn, (!startAddress || !endAddress) && styles.actionBtnDisabled]}
        onPress={fetchDirections}
        disabled={!startAddress || !endAddress || loadingRoute}
      >
        {loadingRoute ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <Text style={styles.actionBtnText}>Calculate Route</Text>
        )}
      </TouchableOpacity>

      {routeCoords && mapRegion && (
        <MapView style={styles.map} region={mapRegion}>
          <Polyline coordinates={routeCoords} strokeColor={Colors.accent} strokeWidth={3} />
          <Marker coordinate={routeCoords[0]} pinColor="green" />
          <Marker coordinate={routeCoords[routeCoords.length - 1]} pinColor="red" />
        </MapView>
      )}
    </View>
  );

  const renderGpsTab = () => (
    <View>
      <Text style={styles.fieldLabel}>Current Location</Text>
      <TextInput
        style={styles.input}
        value={gpsAddress}
        onChangeText={setGpsAddress}
        placeholder="Tap button to capture GPS location"
        placeholderTextColor="#999"
        editable
      />
      <TouchableOpacity style={styles.actionBtn} onPress={captureGps} disabled={loadingGps}>
        {loadingGps ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <Text style={styles.actionBtnText}>📍  Capture GPS Location</Text>
        )}
      </TouchableOpacity>

      {gpsLocation && (
        <MapView
          style={styles.map}
          region={{
            latitude: gpsLocation.latitude,
            longitude: gpsLocation.longitude,
            latitudeDelta: 0.01,
            longitudeDelta: 0.01,
          }}
        >
          <Marker coordinate={{ latitude: gpsLocation.latitude, longitude: gpsLocation.longitude }} />
        </MapView>
      )}

      <Text style={styles.fieldLabel}>Distance (miles)</Text>
      <TextInput
        style={styles.input}
        value={manualMiles}
        onChangeText={setManualMiles}
        placeholder="Enter distance manually"
        placeholderTextColor="#999"
        keyboardType="decimal-pad"
      />
    </View>
  );

  const renderManualTab = () => (
    <View>
      <Text style={styles.fieldLabel}>Start Location (optional)</Text>
      <TextInput
        style={styles.input}
        value={manualStart}
        onChangeText={setManualStart}
        placeholder="e.g. Home"
        placeholderTextColor="#999"
      />
      <Text style={styles.fieldLabel}>End Location (optional)</Text>
      <TextInput
        style={styles.input}
        value={manualEnd}
        onChangeText={setManualEnd}
        placeholder="e.g. Client office"
        placeholderTextColor="#999"
      />
      <Text style={styles.fieldLabel}>Distance (miles) *</Text>
      <TextInput
        style={styles.input}
        value={manualMiles}
        onChangeText={setManualMiles}
        placeholder="0.0"
        placeholderTextColor="#999"
        keyboardType="decimal-pad"
      />
    </View>
  );

  // ─────────────────────────────────────────────────────────────────────────
  // JSX
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerBtn}>
          <Text style={styles.headerBtnText}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Record Mileage</Text>
        <TouchableOpacity
          onPress={handleSave}
          style={[styles.headerBtn, styles.headerSaveBtn]}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.headerBtnText}>Save</Text>
          )}
        </TouchableOpacity>
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
          <Text style={styles.fieldLabel}>Vehicle *</Text>
          {vehicles.length === 0 ? (
            <Text style={styles.noVehicleHint}>
              No vehicles registered. Add one via the side menu.
            </Text>
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
          <Text style={[styles.fieldLabel, { marginTop: vehicleOpen ? 180 : 16 }]}>Date *</Text>
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
          <Text style={styles.fieldLabel}>Purpose</Text>
          <TextInput
            style={styles.input}
            value={purpose}
            onChangeText={setPurpose}
            placeholder="e.g. Client meeting"
            placeholderTextColor="#999"
          />

          {/* Input method tabs */}
          <Text style={styles.fieldLabel}>Trip Distance</Text>
          <View style={styles.tabRow}>
            {INPUT_TABS.map((tab) => (
              <TouchableOpacity
                key={tab}
                style={[styles.tab, activeTab === tab && styles.tabActive]}
                onPress={() => setActiveTab(tab)}
              >
                <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
                  {tab}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {activeTab === "Address" && renderAddressTab()}
          {activeTab === "GPS" && renderGpsTab()}
          {activeTab === "Manual" && renderManualTab()}

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
              <Text style={styles.summaryValue}>{ratePerMile}p / mile</Text>
            </View>
            <View style={[styles.summaryRow, styles.summaryRowLast]}>
              <Text style={styles.summaryLabelBold}>Amount</Text>
              <Text style={styles.summaryValueBold}>
                £{effectiveMiles > 0 ? amountGBP : "0.00"}
              </Text>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Polyline decoder (Google encoded polyline algorithm)
// ─────────────────────────────────────────────────────────────────────────
function decodePolyline(encoded) {
  let index = 0;
  const len = encoded.length;
  const result = [];
  let lat = 0;
  let lng = 0;

  while (index < len) {
    let shift = 0;
    let result2 = 0;
    let b;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result2 |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlat = result2 & 1 ? ~(result2 >> 1) : result2 >> 1;
    lat += dlat;

    shift = 0;
    result2 = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result2 |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlng = result2 & 1 ? ~(result2 >> 1) : result2 >> 1;
    lng += dlng;

    result.push({ latitude: lat / 1e5, longitude: lng / 1e5 });
  }
  return result;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    backgroundColor: "#1C1C4E",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: Platform.OS === "ios" ? 56 : 16,
    paddingBottom: 14,
  },
  headerTitle: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "700",
  },
  headerBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  headerSaveBtn: {
    backgroundColor: Colors.accent,
  },
  headerBtnText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 15,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 60,
    backgroundColor: "#f4f4f8",
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#333",
    marginBottom: 4,
    marginTop: 12,
  },
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
  placesInput: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    fontSize: 15,
    color: Colors.textPrimary,
    backgroundColor: "#fff",
    height: 44,
  },
  dropdown: {
    borderColor: Colors.border,
    borderRadius: 10,
    backgroundColor: "#fff",
  },
  dropdownContainer: {
    borderColor: Colors.border,
    backgroundColor: "#fff",
  },
  noVehicleHint: {
    fontSize: 14,
    color: "#888",
    marginTop: 4,
    marginBottom: 4,
  },
  tabRow: {
    flexDirection: "row",
    marginTop: 4,
    marginBottom: 12,
    borderRadius: 10,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: "#e8e8ee",
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
  },
  tabActive: {
    backgroundColor: Colors.accent,
  },
  tabText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#555",
  },
  tabTextActive: {
    color: "#fff",
  },
  actionBtn: {
    backgroundColor: Colors.accent,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 8,
    marginBottom: 8,
  },
  actionBtnDisabled: {
    opacity: 0.45,
  },
  actionBtnText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 15,
  },
  map: {
    width: "100%",
    height: 200,
    borderRadius: 12,
    marginTop: 10,
    marginBottom: 4,
  },
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
  summaryRowLast: {
    borderBottomWidth: 0,
    paddingTop: 10,
  },
  summaryLabel: {
    fontSize: 14,
    color: "#555",
  },
  summaryValue: {
    fontSize: 14,
    color: Colors.textPrimary,
    fontWeight: "500",
  },
  summaryLabelBold: {
    fontSize: 16,
    color: Colors.textPrimary,
    fontWeight: "700",
  },
  summaryValueBold: {
    fontSize: 18,
    color: Colors.accent,
    fontWeight: "800",
  },
});
