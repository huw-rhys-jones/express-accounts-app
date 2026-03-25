import React from "react";
import IncomeFormScreen from "./IncomeForm";

export default function IncomeAdd(props) {
  return <IncomeFormScreen {...props} mode="create" />;
}