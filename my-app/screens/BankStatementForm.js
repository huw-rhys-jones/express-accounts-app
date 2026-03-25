import React, { useMemo, useState } from "react";
import {
  Alert,
  Image,
  PermissionsAndroid,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { KeyboardAwareScrollView } from "react-native-keyboard-aware-scroll-view";
import { Button } from "react-native-paper";
import DateTimePickerModal from "react-native-modal-datetime-picker";
import * as ImagePicker from "react-native-image-picker";
import * as DocumentPicker from "expo-document-picker";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { auth, db } from "../firebaseConfig";
import { Colors, ReceiptStyles } from "../utils/sharedStyles";
import { formatDate } from "../utils/format_style";
import {
  createDocumentAttachment,
  createImageAttachment,
  deleteStoredAttachments,
  getAttachmentUri,
  isImageAttachment,
  normalizeStoredAttachments,
  uploadAttachmentEntries,
} from "../utils/documentAttachments";

function navigateBackToBankStatements(navigation) {
  navigation.reset({
    index: 0,
    routes: [
      {
        name: "MainTabs",
        state: { routes: [{ name: "BankStatements" }] },
      },
    ],
  });
}

export default function BankStatementForm({ navigation, route, mode }) {
  const statement = route?.params?.statement;
  const [accountName, setAccountName] = useState(statement?.accountName || "");
  const [statementStartDate, setStatementStartDate] = useState(
    statement?.statementStartDate ? new Date(statement.statementStartDate) : new Date()
  );
  const [statementEndDate, setStatementEndDate] = useState(
    statement?.statementEndDate ? new Date(statement.statementEndDate) : new Date()
  );
  const [datePickerTarget, setDatePickerTarget] = useState(null);
  const [moneyInTotal, setMoneyInTotal] = useState(
    statement?.moneyInTotal != null ? String(statement.moneyInTotal) : ""
  );
  const [moneyOutTotal, setMoneyOutTotal] = useState(
    statement?.moneyOutTotal != null ? String(statement.moneyOutTotal) : ""
  );
  const [notes, setNotes] = useState(statement?.notes || "");
  const [attachments, setAttachments] = useState(
    normalizeStoredAttachments(statement?.attachments || [])
  );
  const [isSaving, setIsSaving] = useState(false);

  const existingRemoteAttachments = useMemo(
    () => normalizeStoredAttachments(statement?.attachments || []),
    [statement?.attachments]
  );

  const requestCameraAndLaunch = async () => {
    if (Platform.OS === "android") {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.CAMERA
      );
      if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
        Alert.alert("Permission Denied", "Camera access is required.");
        return;
      }
    }

    ImagePicker.launchCamera(
      { mediaType: "photo", includeBase64: false, quality: 0.9 },
      (response) => {
        if (!response?.assets?.length) return;
        setAttachments((current) => [
          ...current,
          ...response.assets.map(createImageAttachment),
        ]);
      }
    );
  };

  const pickImageOption = () => {
    Alert.alert("Add Statement Pages", "Choose an option", [
      { text: "Camera", onPress: () => requestCameraAndLaunch().catch(() => {}) },
      {
        text: "Gallery",
        onPress: () =>
          ImagePicker.launchImageLibrary(
            {
              mediaType: "photo",
              includeBase64: false,
              selectionLimit: 0,
              quality: 0.9,
            },
            (response) => {
              if (!response?.assets?.length) return;
              setAttachments((current) => [
                ...current,
                ...response.assets.map(createImageAttachment),
              ]);
            }
          ),
      },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  const pickPdfOption = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: "application/pdf",
      multiple: true,
      copyToCacheDirectory: true,
    });

    if (result.canceled || !result.assets?.length) {
      return;
    }

    setAttachments((current) => [
      ...current,
      ...result.assets.map(createDocumentAttachment),
    ]);
  };

  const saveStatement = async () => {
    if (!accountName.trim()) {
      Alert.alert("Invalid Input", "Please enter an account name.");
      return;
    }

    const incomingMoney = Number(moneyInTotal || 0);
    const outgoingMoney = Number(moneyOutTotal || 0);
    if (Number.isNaN(incomingMoney) || Number.isNaN(outgoingMoney)) {
      Alert.alert("Invalid Input", "Please enter valid totals for money in and money out.");
      return;
    }

    const user = auth.currentUser;
    if (!user) {
      Alert.alert("Authentication Error", "Please sign in again.");
      return;
    }

    setIsSaving(true);
    try {
      const currentRemoteUrls = new Set(
        attachments.filter((item) => item.url && !item.localUri).map((item) => item.url)
      );
      const removedAttachments = existingRemoteAttachments.filter(
        (item) => item.url && !currentRemoteUrls.has(item.url)
      );
      if (removedAttachments.length > 0) {
        await deleteStoredAttachments(removedAttachments);
      }

      const uploadedAttachments = await uploadAttachmentEntries({
        folder: "bankStatements",
        userId: user.uid,
        attachments,
      });

      const payload = {
        accountName: accountName.trim(),
        statementStartDate: statementStartDate.toISOString(),
        statementEndDate: statementEndDate.toISOString(),
        date: statementEndDate.toISOString(),
        moneyInTotal: incomingMoney,
        moneyOutTotal: outgoingMoney,
        netMovement: incomingMoney - outgoingMoney,
        notes: notes.trim(),
        attachments: uploadedAttachments,
        transactions: statement?.transactions || [],
        extractionStatus: uploadedAttachments.length > 0 ? "manual-review-needed" : "manual-entry",
        userId: user.uid,
        updatedAt: serverTimestamp(),
      };

      if (mode === "edit" && statement?.id) {
        await updateDoc(doc(db, "bankStatements", statement.id), payload);
      } else {
        await addDoc(collection(db, "bankStatements"), {
          ...payload,
          createdAt: serverTimestamp(),
        });
      }

      navigateBackToBankStatements(navigation);
    } catch (error) {
      console.error("Error saving bank statement", error);
      Alert.alert("Save Failed", "Could not save this bank statement.");
    } finally {
      setIsSaving(false);
    }
  };

  const deleteStatement = async () => {
    if (!(mode === "edit" && statement?.id)) return;

    Alert.alert("Delete Bank Statement", "Delete this statement and its attachments?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          setIsSaving(true);
          try {
            await deleteStoredAttachments(attachments);
            await deleteDoc(doc(db, "bankStatements", statement.id));
            navigateBackToBankStatements(navigation);
          } catch (error) {
            console.error("Error deleting bank statement", error);
            Alert.alert("Delete Failed", "Could not delete this bank statement.");
          } finally {
            setIsSaving(false);
          }
        },
      },
    ]);
  };

  const renderAttachment = (attachment, index) => {
    const uri = getAttachmentUri(attachment);
    if (!uri) return null;

    return (
      <View key={attachment.id || `${uri}-${index}`} style={styles.attachmentShell}>
        {isImageAttachment(attachment) ? (
          <Image source={{ uri }} style={ReceiptStyles.receiptImage} />
        ) : (
          <View style={styles.pdfCard}>
            <Text style={styles.pdfLabel}>PDF</Text>
            <Text style={styles.pdfName} numberOfLines={2}>
              {attachment.name || "Statement PDF"}
            </Text>
          </View>
        )}
        <TouchableOpacity
          style={styles.removeAttachmentButton}
          onPress={() =>
            setAttachments((current) => current.filter((item) => item.id !== attachment.id))
          }
        >
          <Text style={styles.removeAttachmentText}>×</Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <SafeAreaView style={ReceiptStyles.safeArea}>
      <KeyboardAwareScrollView
        contentContainerStyle={styles.scrollContent}
        enableOnAndroid
        keyboardShouldPersistTaps="handled"
      >
        <View style={ReceiptStyles.container}>
          <View style={ReceiptStyles.borderContainer}>
            <Text style={ReceiptStyles.header}>
              {mode === "edit" ? "Edit Bank Statement" : "Add Bank Statement"}
            </Text>

            <View style={styles.fieldGroup}>
              <Text style={ReceiptStyles.label}>Account Name:</Text>
              <TextInput
                value={accountName}
                onChangeText={setAccountName}
                placeholder="Main business account"
                placeholderTextColor={Colors.textMuted}
                style={styles.textInput}
              />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={ReceiptStyles.label}>Statement Start:</Text>
              <TouchableOpacity
                style={ReceiptStyles.dateButton}
                onPress={() => setDatePickerTarget("start")}
              >
                <Text style={ReceiptStyles.dateText}>{formatDate(statementStartDate)}</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.fieldGroup}>
              <Text style={ReceiptStyles.label}>Statement End:</Text>
              <TouchableOpacity
                style={ReceiptStyles.dateButton}
                onPress={() => setDatePickerTarget("end")}
              >
                <Text style={ReceiptStyles.dateText}>{formatDate(statementEndDate)}</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.moneyRow}>
              <View style={styles.moneyColumn}>
                <Text style={ReceiptStyles.label}>Money In:</Text>
                <TextInput
                  value={moneyInTotal}
                  onChangeText={setMoneyInTotal}
                  keyboardType="decimal-pad"
                  placeholder="0.00"
                  placeholderTextColor={Colors.textMuted}
                  style={styles.textInput}
                />
              </View>
              <View style={styles.moneyColumn}>
                <Text style={ReceiptStyles.label}>Money Out:</Text>
                <TextInput
                  value={moneyOutTotal}
                  onChangeText={setMoneyOutTotal}
                  keyboardType="decimal-pad"
                  placeholder="0.00"
                  placeholderTextColor={Colors.textMuted}
                  style={styles.textInput}
                />
              </View>
            </View>

            <View style={styles.fieldGroup}>
              <Text style={ReceiptStyles.label}>Notes:</Text>
              <TextInput
                value={notes}
                onChangeText={setNotes}
                placeholder="Statement notes or review reminders"
                placeholderTextColor={Colors.textMuted}
                style={[styles.textInput, styles.notesInput]}
                multiline
              />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={ReceiptStyles.label}>Attachments:</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {attachments.map(renderAttachment)}
                <TouchableOpacity style={ReceiptStyles.uploadPlaceholder} onPress={pickImageOption}>
                  <Text style={ReceiptStyles.plus}>+</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.pdfAddCard} onPress={() => pickPdfOption().catch(() => {})}>
                  <Text style={styles.pdfAddText}>PDF</Text>
                </TouchableOpacity>
              </ScrollView>
              <Text style={styles.helperText}>
                Images and PDFs are stored now. OCR extraction of statement rows will be added next.
              </Text>
            </View>

            <View style={styles.actionRow}>
              <Button mode="outlined" onPress={() => navigateBackToBankStatements(navigation)}>
                Cancel
              </Button>
              <Button
                mode="contained"
                buttonColor={Colors.accent}
                onPress={saveStatement}
                disabled={isSaving}
              >
                Save
              </Button>
            </View>

            {mode === "edit" ? (
              <Button
                mode="outlined"
                textColor={Colors.accent}
                onPress={deleteStatement}
                style={styles.deleteButton}
              >
                Delete Statement
              </Button>
            ) : null}
          </View>
        </View>
      </KeyboardAwareScrollView>

      <DateTimePickerModal
        isVisible={Boolean(datePickerTarget)}
        mode="date"
        date={datePickerTarget === "start" ? statementStartDate : statementEndDate}
        maximumDate={new Date()}
        onConfirm={(date) => {
          if (datePickerTarget === "start") {
            setStatementStartDate(date);
          } else {
            setStatementEndDate(date);
          }
          setDatePickerTarget(null);
        }}
        onCancel={() => setDatePickerTarget(null)}
      />

      {isSaving ? (
        <View style={styles.loadingOverlay}>
          <View style={styles.loadingCard}>
            <Text style={styles.loadingText}>Saving bank statement…</Text>
          </View>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  scrollContent: { flexGrow: 1, paddingBottom: 120 },
  fieldGroup: { marginBottom: 18 },
  textInput: {
    backgroundColor: Colors.inputBg,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: Colors.textPrimary,
    fontSize: 16,
  },
  notesInput: { minHeight: 92, textAlignVertical: "top" },
  moneyRow: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  moneyColumn: { flex: 1 },
  attachmentShell: { marginRight: 12, position: "relative" },
  pdfCard: {
    width: 120,
    height: 120,
    borderRadius: 16,
    backgroundColor: Colors.card,
    padding: 14,
    justifyContent: "space-between",
  },
  pdfLabel: { color: Colors.accent, fontWeight: "700", fontSize: 16 },
  pdfName: { color: Colors.textPrimary, fontSize: 13 },
  removeAttachmentButton: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "rgba(0,0,0,0.65)",
    alignItems: "center",
    justifyContent: "center",
  },
  removeAttachmentText: { color: Colors.surface, fontSize: 18, lineHeight: 18 },
  pdfAddCard: {
    width: 78,
    height: 120,
    borderRadius: 18,
    backgroundColor: Colors.card,
    justifyContent: "center",
    alignItems: "center",
  },
  pdfAddText: { color: Colors.textPrimary, fontWeight: "700", fontSize: 18 },
  helperText: {
    marginTop: 10,
    color: Colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  actionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 6,
  },
  deleteButton: { marginTop: 16 },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "center",
    alignItems: "center",
  },
  loadingCard: {
    backgroundColor: Colors.surface,
    paddingHorizontal: 24,
    paddingVertical: 18,
    borderRadius: 12,
  },
  loadingText: { color: Colors.textPrimary, fontWeight: "600" },
});