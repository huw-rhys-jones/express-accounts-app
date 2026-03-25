import React from "react";
import IncomeFormScreen from "./IncomeForm";

export default function IncomeEdit(props) {
  return <IncomeFormScreen {...props} mode="edit" />;
}