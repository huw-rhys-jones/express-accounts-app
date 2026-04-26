import React, { useState, useMemo } from "react";
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Dimensions,
} from "react-native";
import { categories_meta } from "../constants/arrays";
import { Colors } from "../utils/sharedStyles";

const { height } = Dimensions.get("window");

const CategorySelector = ({ visible, onClose, onSelect, selectedCategory }) => {
  const [searchText, setSearchText] = useState("");

  const filteredCategories = useMemo(() => {
    if (!searchText.trim()) {
      return categories_meta;
    }

    const query = searchText.toLowerCase().trim();
    return categories_meta.filter((cat) => {
      return (
        cat.name.toLowerCase().includes(query) ||
        cat.meta.some((keyword) => keyword.toLowerCase().includes(query))
      );
    });
  }, [searchText]);

  const handleSelect = (categoryName) => {
    onSelect(categoryName);
    setSearchText("");
  };

  const handleClose = () => {
    setSearchText("");
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent={true}
      onRequestClose={handleClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modalCard}>
          {/* Header with close button */}
          <View style={styles.header}>
            <Text style={styles.title}>Category</Text>
            <TouchableOpacity onPress={handleClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={styles.closeButton}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Search field */}
          <View style={styles.searchContainer}>
            <TextInput
              style={styles.searchInput}
              placeholder="Search categories..."
              placeholderTextColor={Colors.textSecondary}
              value={searchText}
              onChangeText={setSearchText}
              autoFocus={true}
            />
          </View>

          {/* Category list */}
          <ScrollView
            style={styles.listContainer}
            keyboardShouldPersistTaps="always"
            showsVerticalScrollIndicator={true}
          >
            {filteredCategories.length > 0 ? (
              filteredCategories.map((category, index) => (
                <TouchableOpacity
                  key={`${category.name}-${index}`}
                  style={[
                    styles.categoryItem,
                    selectedCategory === category.name && styles.categoryItemSelected,
                  ]}
                  onPress={() => handleSelect(category.name)}
                >
                  <Text
                    style={[
                      styles.categoryName,
                      selectedCategory === category.name && styles.categoryNameSelected,
                    ]}
                  >
                    {category.name}
                  </Text>
                </TouchableOpacity>
              ))
            ) : (
              <View style={styles.noResults}>
                <Text style={styles.noResultsText}>No categories found</Text>
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
    paddingHorizontal: 12,
    paddingBottom: 12,
  },
  modalCard: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: height * 0.75,
    overflow: "hidden",
  },
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#e0e0e0",
  },
  title: {
    fontSize: 18,
    fontWeight: "600",
    color: "#333",
  },
  closeButton: {
    fontSize: 24,
    color: "#666",
    padding: 4,
  },
  searchContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
  },
  searchInput: {
    backgroundColor: "#f5f5f5",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: "#333",
  },
  listContainer: {
    flex: 1,
    paddingTop: 8,
  },
  categoryItem: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
  },
  categoryItemSelected: {
    backgroundColor: "#fff3e0",
  },
  categoryName: {
    fontSize: 16,
    color: "#333",
  },
  categoryNameSelected: {
    color: "#a60d49",
    fontWeight: "500",
  },
  noResults: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 40,
  },
  noResultsText: {
    fontSize: 16,
    color: Colors.textSecondary || "#999",
  },
});

export default CategorySelector;
