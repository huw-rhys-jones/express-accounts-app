import React from "react";
import BankStatementForm from "./BankStatementForm";

export default function BankStatementAdd(props) {
  return <BankStatementForm {...props} mode="create" />;
}