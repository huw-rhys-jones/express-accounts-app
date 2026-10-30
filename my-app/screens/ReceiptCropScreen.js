import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  PanResponder,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Colors } from "../utils/sharedStyles";
import {
  FULL_RECT,
  createWorkingCopy,
  detectReceiptRect,
  exportEditedImage,
  rotateRectCcw,
  rotateRectCw,
  rotatedSize,
} from "../utils/receiptImageProcessing";

const MIN_SIZE = 0.1;
const IMAGE_PADDING = 28;
const HIT_SIZE = 44;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

// kind: corner ("tl", "br", ...) or edge ("t", "l", ...); each letter moves one side of the rect.
function applyDrag(start, kind, dx, dy) {
  const next = { ...start };
  if (kind.includes("l")) next.left = clamp(start.left + dx, 0, start.right - MIN_SIZE);
  if (kind.includes("r")) next.right = clamp(start.right + dx, start.left + MIN_SIZE, 1);
  if (kind.includes("t")) next.top = clamp(start.top + dy, 0, start.bottom - MIN_SIZE);
  if (kind.includes("b")) next.bottom = clamp(start.bottom + dy, start.top + MIN_SIZE, 1);
  return next;
}

function DragHandle({ kind, x, y, onStart, onMove }) {
  const callbacks = useRef({});
  callbacks.current = { onStart, onMove };

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => callbacks.current.onStart(),
      onPanResponderMove: (_, g) => callbacks.current.onMove(kind, g.dx, g.dy),
    }),
  ).current;

  const isCorner = kind.length === 2;
  return (
    <View
      {...responder.panHandlers}
      style={[styles.hit, { left: x - HIT_SIZE / 2, top: y - HIT_SIZE / 2 }]}
    >
      <View style={isCorner ? styles.cornerDot : styles.edgeDot} />
    </View>
  );
}

export default function ReceiptCropScreen({ route, navigation }) {
  const insets = useSafeAreaInsets();
  const images = route.params?.images || [];
  const targetScreen = route.params?.targetScreen || "Receipt";
  const isReedit = Boolean(route.params?.reedit);

  const [index, setIndex] = useState(0);
  const [working, setWorking] = useState(null);
  const [autoRect, setAutoRect] = useState(null);
  const [rect, setRect] = useState(FULL_RECT);
  const [rotation, setRotation] = useState(0);
  const [area, setArea] = useState({ width: 0, height: 0 });
  const [saving, setSaving] = useState(false);
  const [needsManual, setNeedsManual] = useState(false);

  const resultsRef = useRef([]);
  const rectRef = useRef(rect);
  const dragStartRef = useRef(rect);
  rectRef.current = rect;

  const finishOrAdvance = (asset) => {
    resultsRef.current = [...resultsRef.current, asset];
    if (index + 1 < images.length) {
      setIndex(index + 1);
      return;
    }
    const params = { initialImages: resultsRef.current, sourceImages: images };
    if (isReedit) {
      navigation.navigate({ name: targetScreen, params, merge: true });
    } else {
      navigation.replace(targetScreen, params);
    }
  };

  useEffect(() => {
    let cancelled = false;
    setWorking(null);
    setNeedsManual(false);
    setAutoRect(null);
    setRotation(0);
    setRect(FULL_RECT);

    (async () => {
      try {
        const copy = await createWorkingCopy(images[index].uri);
        if (cancelled) return;
        setWorking(copy);
        let detected = null;
        try {
          detected = await detectReceiptRect(copy.uri);
        } catch (error) {
          console.warn("Receipt edge detection failed", error);
        }
        if (cancelled) return;
        setAutoRect(detected);
        setRect(detected || FULL_RECT);
        // Skip manual adjustment when edges were found, unless the user asked to re-edit
        if (detected && !isReedit) {
          try {
            const asset = await exportEditedImage(copy, { rotation: 0, rect: detected }, images[index].fileName);
            if (!cancelled) finishOrAdvance(asset);
            return;
          } catch (error) {
            console.warn("Automatic crop failed, showing manual adjustment", error);
          }
        }
        if (!cancelled) setNeedsManual(true);
      } catch (error) {
        console.error("Could not prepare image for cropping", error);
        if (!cancelled) finishOrAdvance(images[index]);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  const rotate = (clockwise) => {
    setRotation((current) => (current + (clockwise ? 90 : 270)) % 360);
    setRect((current) => (clockwise ? rotateRectCw(current) : rotateRectCcw(current)));
  };

  const useAuto = () => {
    setRotation(0);
    setRect(autoRect || FULL_RECT);
  };

  const useOriginal = () => {
    setRotation(0);
    setRect(FULL_RECT);
  };

  const confirm = async () => {
    if (!working || saving) return;
    setSaving(true);
    try {
      const asset = await exportEditedImage(working, { rotation, rect }, images[index].fileName);
      finishOrAdvance(asset);
    } catch (error) {
      console.error("Could not crop image", error);
      Alert.alert("Crop failed", "Could not apply the crop. You can use the original photo instead.", [
        { text: "Cancel", style: "cancel" },
        { text: "Use original", onPress: () => finishOrAdvance(images[index]) },
      ]);
    } finally {
      setSaving(false);
    }
  };

  const ready = Boolean(working) && needsManual;
  const size = working ? rotatedSize(working.width, working.height, rotation) : null;
  const scale = size && area.width
    ? Math.min((area.width - IMAGE_PADDING * 2) / size.width, (area.height - IMAGE_PADDING * 2) / size.height)
    : 0;
  const box = size ? { width: size.width * scale, height: size.height * scale } : null;
  const imageSize = working ? { width: working.width * scale, height: working.height * scale } : null;

  const px = (value, total) => value * total;
  const handles = box
    ? [
        ["tl", rect.left, rect.top],
        ["tr", rect.right, rect.top],
        ["bl", rect.left, rect.bottom],
        ["br", rect.right, rect.bottom],
        ["t", (rect.left + rect.right) / 2, rect.top],
        ["b", (rect.left + rect.right) / 2, rect.bottom],
        ["l", rect.left, (rect.top + rect.bottom) / 2],
        ["r", rect.right, (rect.top + rect.bottom) / 2],
      ]
    : [];

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top + 10, 24) }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerBtn} disabled={saving}>
          <Text style={styles.headerBtnText}>Cancel</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          {images.length > 1 ? `Adjust photo ${index + 1} of ${images.length}` : "Adjust photo"}
        </Text>
        <View style={styles.headerBtn} />
      </View>

      <View style={styles.imageArea} onLayout={(e) => setArea(e.nativeEvent.layout)}>
        {box && needsManual ? (
          <View style={{ width: box.width, height: box.height }}>
            <Image
              source={{ uri: working.uri }}
              resizeMode="stretch"
              style={{
                position: "absolute",
                width: imageSize.width,
                height: imageSize.height,
                left: (box.width - imageSize.width) / 2,
                top: (box.height - imageSize.height) / 2,
                transform: [{ rotate: `${rotation}deg` }],
              }}
            />

            <View pointerEvents="none" style={StyleSheet.absoluteFill}>
              <View style={[styles.dim, { left: 0, top: 0, right: 0, height: px(rect.top, box.height) }]} />
              <View style={[styles.dim, { left: 0, bottom: 0, right: 0, height: px(1 - rect.bottom, box.height) }]} />
              <View
                style={[
                  styles.dim,
                  { left: 0, width: px(rect.left, box.width), top: px(rect.top, box.height), height: px(rect.bottom - rect.top, box.height) },
                ]}
              />
              <View
                style={[
                  styles.dim,
                  { right: 0, width: px(1 - rect.right, box.width), top: px(rect.top, box.height), height: px(rect.bottom - rect.top, box.height) },
                ]}
              />
              <View
                style={[
                  styles.frame,
                  {
                    left: px(rect.left, box.width),
                    top: px(rect.top, box.height),
                    width: px(rect.right - rect.left, box.width),
                    height: px(rect.bottom - rect.top, box.height),
                  },
                ]}
              />
            </View>

            {handles.map(([kind, hx, hy]) => (
              <DragHandle
                key={kind}
                kind={kind}
                x={px(hx, box.width)}
                y={px(hy, box.height)}
                onStart={() => {
                  dragStartRef.current = rectRef.current;
                }}
                onMove={(k, dx, dy) =>
                  setRect(applyDrag(dragStartRef.current, k, dx / box.width, dy / box.height))
                }
              />
            ))}
          </View>
        ) : (
          <View style={styles.loading}>
            <ActivityIndicator color="#fff" />
            <Text style={styles.loadingText}>Finding receipt edges…</Text>
          </View>
        )}
      </View>

      {working && needsManual ? (
        <Text style={styles.hint}>
          {autoRect ? "Edges detected automatically. Drag the handles to adjust." : "Couldn't detect edges. Drag the handles to crop."}
        </Text>
      ) : null}

      <View style={styles.tools}>
        <ToolButton icon="rotate-left" label="Rotate left" onPress={() => rotate(false)} disabled={!ready} />
        <ToolButton icon="rotate-right" label="Rotate right" onPress={() => rotate(true)} disabled={!ready} />
        <ToolButton icon="auto-fix" label="Auto crop" onPress={useAuto} disabled={!ready || !autoRect} />
        <ToolButton icon="backup-restore" label="Original" onPress={useOriginal} disabled={!ready} />
      </View>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <TouchableOpacity
          style={[styles.primary, (!ready || saving) && styles.primaryDisabled]}
          onPress={confirm}
          disabled={!ready || saving}
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.primaryText}>{index + 1 < images.length ? "Next" : "Use photo"}</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

function ToolButton({ icon, label, onPress, disabled }) {
  return (
    <TouchableOpacity
      style={[styles.tool, disabled && styles.toolDisabled]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <MaterialCommunityIcons name={icon} size={26} color="#fff" />
      <Text style={styles.toolLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  header: {
    backgroundColor: "#1C1C4E",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  headerTitle: { color: "#fff", fontSize: 17, fontWeight: "700" },
  headerBtn: { width: 70 },
  headerBtnText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  imageArea: { flex: 1, alignItems: "center", justifyContent: "center" },
  dim: { position: "absolute", backgroundColor: "rgba(0,0,0,0.55)" },
  frame: { position: "absolute", borderWidth: 2, borderColor: "#fff" },
  hit: { position: "absolute", width: HIT_SIZE, height: HIT_SIZE, alignItems: "center", justifyContent: "center" },
  cornerDot: { width: 22, height: 22, borderRadius: 11, backgroundColor: "#fff", borderWidth: 3, borderColor: Colors.accent },
  edgeDot: { width: 14, height: 14, borderRadius: 7, backgroundColor: "#fff", borderWidth: 2, borderColor: Colors.accent },
  loading: { alignItems: "center", gap: 10 },
  loadingText: { color: "#ddd", fontSize: 13 },
  hint: { color: "#bbb", fontSize: 12, textAlign: "center", paddingHorizontal: 16, paddingBottom: 6 },
  tools: { flexDirection: "row", justifyContent: "space-around", paddingVertical: 10, backgroundColor: "#111" },
  tool: { alignItems: "center", minWidth: 72, gap: 2 },
  toolDisabled: { opacity: 0.35 },
  toolLabel: { color: "#fff", fontSize: 11 },
  footer: { paddingHorizontal: 16, paddingTop: 10, backgroundColor: "#111" },
  primary: { backgroundColor: Colors.accent, borderRadius: 24, paddingVertical: 13, alignItems: "center" },
  primaryDisabled: { opacity: 0.5 },
  primaryText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});
