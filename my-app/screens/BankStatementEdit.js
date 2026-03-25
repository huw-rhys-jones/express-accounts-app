import React from "react";
import BankStatementForm from "./BankStatementForm";

export default function BankStatementEdit(props) {
  return <BankStatementForm {...props} mode="edit" />;
}