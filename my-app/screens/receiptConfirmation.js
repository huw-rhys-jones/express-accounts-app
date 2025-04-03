import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  ScrollView,
} from "react-native";
import Icon from "react-native-vector-icons/MaterialCommunityIcons";
import { Button } from "react-native-paper";

const ReceiptConfirmationScreen = () => {
  const [tickedFields, setTickedFields] = useState({
    Currency: true,
    Amount: true,
    Date: true,
    Category: true,
  });

  const toggleTick = (label) => {
    setTickedFields((prev) => ({
      ...prev,
      [label]: !prev[label],
    }));
  };

  const renderDetailRow = (label, value) => {
    const isTicked = tickedFields[label];

    return (
      <View style={styles.detailRow} key={label}>
        <Text style={styles.label}>{label}</Text>
        <View style={styles.inputBox}>
          <Text style={styles.value}>{value}</Text>
        </View>
        <TouchableOpacity onPress={() => toggleTick(label)}>
          <Icon
            name={isTicked ? "check" : "checkbox-blank-outline"}
            size={24}
            color={isTicked ? "green" : "#888"}
            style={styles.checkIcon}
          />
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {/* Close Button */}
      <TouchableOpacity style={styles.closeButton}>
        <Icon name="close-circle" size={30} color="#C51F63" />
      </TouchableOpacity>

      {/* Receipt Image */}
      <Image
        source={{
          uri: "https://via.placeholder.com/200x300.png?text=Receipt",
        }}
        style={styles.receiptImage}
      />

      {/* Title */}
      <View style={styles.headerBox}>
        <Text style={styles.headerText}>Receipt details found</Text>
      </View>

      {/* Detail Rows */}
      <View style={styles.detailsContainer}>
        {renderDetailRow("Currency", "£")}
        {renderDetailRow("Amount", "13.35")}
        {renderDetailRow("Date", "24/05/06")}
        {renderDetailRow("Category", "SUBSISTENCE")}
      </View>

      {/* Buttons */}
      <View style={styles.buttonRow}>
        <Button
          mode="contained"
          buttonColor="#a60d49"
          style={styles.button}
          onPress={() => console.log("Retry")}
        >
          Retry
        </Button>
        <Button
          mode="contained"
          buttonColor="#a60d49"
          style={styles.button}
          onPress={() => console.log("Accept")}
        >
          Accept
        </Button>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: "#302C66",
    alignItems: "center",
    paddingTop: 40,
    paddingBottom: 20,
  },
  closeButton: {
    position: "absolute",
    top: 10,
    right: 10,
    zIndex: 10,
  },
  receiptImage: {
    width: 100,
    height: 140,
    resizeMode: "contain",
    borderRadius: 10,
    marginTop: 20,
  },
  headerBox: {
    backgroundColor: "#f2f2f2",
    paddingVertical: 10,
    paddingHorizontal: 30,
    borderRadius: 25,
    marginTop: 10,
  },
  headerText: {
    color: "#a60d49",
    fontWeight: "bold",
    fontSize: 18,
  },
  detailsContainer: {
    marginTop: 15,
    width: "90%",
    backgroundColor: "#E5E5EA",
    borderRadius: 30,
    padding: 22,
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 8,
  },
  label: {
    flex: 1,
    fontSize: 16,
    fontWeight: "bold",
    color: "#302C66",
  },
  inputBox: {
    flex: 2,
    backgroundColor: "#fff",
    borderRadius: 5,
    paddingVertical: 10,
    paddingHorizontal: 15,
    marginHorizontal: 10,
    borderWidth: 1,
    borderColor: "#ccc",
  },
  value: {
    fontSize: 14,
    color: "#302C66",
  },
  checkIcon: {
    marginRight: 5,
  },
  buttonRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 22,
    width: "90%",
  },
  button: {
    flex: 1,
    marginHorizontal: 5,
    paddingVertical: 3,
    borderRadius: 25,
  

  },
});

export default ReceiptConfirmationScreen;
