export class Enums {
  static roles = [
    "admin",
    "data_entry",
    "manager",
    "canteen_incharge",
    "accounts",
  ];

  static userStatus = ["active", "blocked"];

  static requisitionStatus = [
    "draft",
    "pending_approval",
    "approved",
    "received",
  ];

  static consumptionStatus = ["pending_approval", "approved"];
}
