import React, { useState, useEffect } from "react";
import {
  Modal,
  View,
  Image,
  TouchableOpacity,
  Text,
  StyleSheet,
  StatusBar,
} from "react-native";

const ANNOTATIONS = [
  { key: "amount", label: "Amount", color: "#2E9F46" },
  { key: "date",   label: "Date",   color: "#1A73E8" },
  { key: "vat",    label: "VAT",    color: "#E06B6B" },
];

export default function AnnotationModal({ visible, imageUri, ocrFrames, onClose }) {
  const [containerSize, setContainerSize] = useState(null);

  useEffect(() => {
    if (!visible) {
      setContainerSize(null);
    }
  }, [visible]);

  // Use the actual pixel dimensions stored at OCR time (matches what ML Kit processed).
  // Fall back to Image.getSize if not available (older cached data).
  const [fallbackSize, setFallbackSize] = useState(null);
  useEffect(() => {
    if (visible && imageUri && !ocrFrames?.imageW) {
      console.log('[Annotation] no stored dimensions, falling back to Image.getSize for:', imageUri);
      Image.getSize(
        imageUri,
        (w, h) => { console.log('[Annotation] fallback naturalSize:', w, 'x', h); setFallbackSize({ w, h }); },
        (err) => { console.log('[Annotation] getSize error:', err); setFallbackSize(null); },
      );
    }
    if (!visible) setFallbackSize(null);
  }, [imageUri, visible, ocrFrames?.imageW]);

  const naturalSize = ocrFrames?.imageW
    ? { w: ocrFrames.imageW, h: ocrFrames.imageH }
    : fallbackSize;

  const computeBox = (frame, label) => {
    if (!naturalSize || !containerSize || !frame) return null;
    // resizeMode="contain": scale uniformly to fit, centred
    const scale = Math.min(
      containerSize.w / naturalSize.w,
      containerSize.h / naturalSize.h,
    );
    const renderedW = naturalSize.w * scale;
    const renderedH = naturalSize.h * scale;
    const offsetX = (containerSize.w - renderedW) / 2;
    const offsetY = (containerSize.h - renderedH) / 2;
    const box = {
      left:   frame.left   * scale + offsetX,
      top:    frame.top    * scale + offsetY,
      width:  frame.width  * scale,
      height: frame.height * scale,
    };
    console.log(`[Annotation] box(${label}) naturalSize=${naturalSize.w}x${naturalSize.h} scale=${scale.toFixed(3)} offset=(${offsetX.toFixed(0)},${offsetY.toFixed(0)}) =>`, JSON.stringify(box));
    return box;
  };

  const activeAnnotations = ANNOTATIONS.filter(({ key }) => ocrFrames?.[key]);

  return (
    <Modal
      visible={visible}
      animationType="fade"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <StatusBar barStyle="light-content" backgroundColor="black" />
      <View
        style={styles.container}
        onLayout={(e) => {
          const { width, height } = e.nativeEvent.layout;
          console.log('[Annotation] containerSize:', width, 'x', height);
          setContainerSize({ w: width, h: height });
        }}
      >
        {imageUri ? (
          <Image
            source={{ uri: imageUri }}
            style={styles.image}
            resizeMode="contain"
          />
        ) : null}

        {/* Overlay boxes */}
        {containerSize && naturalSize &&
          activeAnnotations.map(({ key, label, color }) => {
            const box = computeBox(ocrFrames[key], label);
            if (!box) return null;
            // Add visual padding so thin text lines are clearly visible
            const PAD = 8;
            const padded = {
              left:   box.left   - PAD,
              top:    box.top    - PAD,
              width:  box.width  + PAD * 2,
              height: box.height + PAD * 2,
            };
            return (
              <React.Fragment key={key}>
                <View style={[styles.box, { ...padded, borderColor: color }]} />
                {/* Chip rendered as sibling so it isn't width-constrained by the box */}
                <View style={[styles.labelChip, { backgroundColor: color, top: padded.top - 18, left: padded.left - 1 }]}>
                  <Text style={styles.labelText}>{label}</Text>
                </View>
              </React.Fragment>
            );
          })}

        {/* Legend */}
        {activeAnnotations.length > 0 && (
          <View style={styles.legend}>
            {activeAnnotations.map(({ key, label, color }) => (
              <View key={key} style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: color }]} />
                <Text style={styles.legendLabel}>{label}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Close button */}
        <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
          <Text style={styles.closeTxt}>✕</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "black",
  },
  image: {
    flex: 1,
  },
  box: {
    position: "absolute",
    borderWidth: 2,
    borderRadius: 4,
  },
  labelChip: {
    position: "absolute",
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 3,
  },
  labelText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "700",
  },
  legend: {
    position: "absolute",
    bottom: 72,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "center",
    gap: 16,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendLabel: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
  },
  closeBtn: {
    position: "absolute",
    top: 48,
    right: 18,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
  },
  closeTxt: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "700",
  },
});
