import { useMemo } from "react";
import { PanResponder } from "react-native";

const TAB_ORDER = ["Expenses", "Income", "BankStatements", "Summary"];
const CAPTURE_THRESHOLD = 18;
const NAVIGATION_THRESHOLD = 72;

export function useTabSwipeNavigation(navigation, currentTabName) {
  return useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gestureState) => {
          const { dx, dy } = gestureState;
          return Math.abs(dx) > CAPTURE_THRESHOLD && Math.abs(dx) > Math.abs(dy) * 1.4;
        },
        onPanResponderRelease: (_, gestureState) => {
          const { dx, dy } = gestureState;
          if (Math.abs(dx) < NAVIGATION_THRESHOLD || Math.abs(dx) < Math.abs(dy) * 1.2) {
            return;
          }

          const currentIndex = TAB_ORDER.indexOf(currentTabName);
          if (currentIndex < 0) return;

          if (dx < 0 && currentIndex < TAB_ORDER.length - 1) {
            navigation.navigate(TAB_ORDER[currentIndex + 1]);
          } else if (dx > 0 && currentIndex > 0) {
            navigation.navigate(TAB_ORDER[currentIndex - 1]);
          }
        },
      }),
    [navigation, currentTabName]
  );
}
