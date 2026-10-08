import React, { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import MapView, { Marker, Polyline } from "react-native-maps";
import polyline from "@mapbox/polyline";
import { Colors } from "../utils/sharedStyles";

const MIN_DELTA = 0.02;

function RouteMarker({ coordinate, label, color }) {
  return (
    <Marker coordinate={coordinate} anchor={{ x: 0.5, y: 1 }}>
      <View style={styles.marker}>
        <View style={[styles.markerLabel, { backgroundColor: color }]}>
          <Text style={styles.markerLabelText}>{label}</Text>
        </View>
        <View style={[styles.markerDot, { backgroundColor: color }]} />
      </View>
    </Marker>
  );
}

export default function MileageRouteMap({ start, end, encodedPath }) {
  const routeCoordinates = useMemo(() => {
    if (!encodedPath) return [];
    return polyline
      .decode(encodedPath)
      .map(([latitude, longitude]) => ({ latitude, longitude }));
  }, [encodedPath]);

  if (!start || !end) return null;

  const latitudeDelta = Math.max(
    Math.abs(start.latitude - end.latitude) * 1.8,
    MIN_DELTA,
  );
  const longitudeDelta = Math.max(
    Math.abs(start.longitude - end.longitude) * 1.8,
    MIN_DELTA,
  );
  const region = {
    latitude: (start.latitude + end.latitude) / 2,
    longitude: (start.longitude + end.longitude) / 2,
    latitudeDelta,
    longitudeDelta,
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Journey map</Text>
      <MapView
        style={styles.map}
        region={region}
        scrollEnabled={false}
        rotateEnabled={false}
      >
        {routeCoordinates.length > 1 ? (
          <Polyline
            coordinates={routeCoordinates}
            strokeColor={Colors.accent}
            strokeWidth={4}
          />
        ) : null}
        <RouteMarker coordinate={start} label="Start" color="#2E9F46" />
        <RouteMarker coordinate={end} label="End" color={Colors.accent} />
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 16,
  },
  title: {
    color: Colors.textPrimary,
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 8,
  },
  map: {
    width: "100%",
    height: 210,
    borderRadius: 10,
  },
  marker: {
    alignItems: "center",
  },
  markerLabel: {
    borderRadius: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  markerLabelText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "700",
  },
  markerDot: {
    borderColor: "#fff",
    borderRadius: 7,
    borderWidth: 2,
    height: 14,
    marginTop: 2,
    width: 14,
  },
});
