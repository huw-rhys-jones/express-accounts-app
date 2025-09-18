
export const currencies = ["£", "€", "$"]


export const currencies_full = [
    {
      index: 0, 
      name: "Pounds Sterling",
      symbol: "£"
    },
  
    {
      index: 1,
      name: "Euro",
      symbol: "€"
    },
  
    {
      index: 2,
      name: "Yen",
      symbol: "¥"
    },
     
    
    {
      index: 3,
      name: "US Dollar",
      symbol: "\\$"
    },
  
  ]
  
export const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


export const categories_meta = [
  {
    name: "Accomodation",
    meta: ["rent", "house", "flat", "monthly", "hotel", "caravan", "bungalow"],
    vatRate: 20, // hotels 20%, residential rent exempt (you can special-case if needed)
  },
  {
    name: "Subsistence",
    meta: [
      "cafe", "restaurant", "bar", "olive", "hungry", "coffee", "americano",
      "latte", "cappacino", "steak", "peppercorn", "sirloin", "pizza", "meat",
      "eat", "takeaway", "food", "burger"
    ],
    vatRate: 20,
  },
  {
    name: "Travel",
    meta: ["rail", "train", "fare", "ticket", "single", "return", "zone", "tfl", "taxi", "parking", "toll"],
    vatRate: 0,
  },
  {
    name: "Vehicle Maintenance",
    meta: ["parts", "MOT", "servicing", "tyre", "oil", "filter", "brake"],
    vatRate: 20,
  },
  {
    name: "Fuel",
    meta: ["fuel", "filling", "petrol", "deisel", "unleaded", "pump"],
    vatRate: 20,
  },
  {
    name: "Rent",
    meta: ["monthly", "garage", "shop", "office", "premises"],
    vatRate: 0, // commercial rents usually exempt
  },
  {
    name: "Equipment and Tools",
    meta: ["hammer", "saw", "driver"],
    vatRate: 20,
  },
  {
    name: "Telephone and Internet",
    meta: ["phone", "contract", "handset", "wifi", "router", "internet", "o2", "vodaphone"],
    vatRate: 20,
  },
  {
    name: "Materials",
    meta: [
      "nail", "screw", "consumable", "paint", "cement", "wood", "metal",
      "plastic", "slate", "stone", "sand", "B&Q", "lamanate", "floor",
      "deck", "plaster", "glue", "adhesive", "nuts", "bolts", "washer",
      "carpet"
    ],
    vatRate: 20,
  },
  {
    name: "Plant and Machinery",
    meta: ["machine", "plant"],
    vatRate: 20,
  },
  {
    name: "Vehicle Hire",
    meta: ["avis", "europcar", "enterprise"],
    vatRate: 20,
  },
  {
    name: "Training and Tuition",
    meta: ["course", "exam"],
    vatRate: 0, // exempt unless commercial training (could be 20%)
  },
  {
    name: "Staff Welfare",
    meta: ["health", "safety"],
    vatRate: 20,
  },
  {
    name: "Property Service Charges",
    meta: ["estate", "management", "letting"],
    vatRate: 20,
  },
  {
    name: "Lighting and Heating",
    meta: ["electric", "light", "lamp", "gas", "heat", "bulb", "led", "flourescent"],
    vatRate: 20, // business use
  },
  {
    name: "Cleaning and Upkeep",
    meta: ["clean", "wash", "detol", "bleach", "soap"],
    vatRate: 20,
  },
  {
    name: "Postage and Courier",
    meta: ["stamps", "courier", "delivery", "postage", "envelope", "package"],
    vatRate: 20, // Royal Mail exempt, private couriers 20%
  },
  {
    name: "Stationary and Office",
    meta: ["pen", "stationary", "pencil", "paper", "Print", "extinguisher", "ink", "cartridge", "sellotape", "duct", "memory"],
    vatRate: 20,
  },
  {
    name: "Subscriptions and Professional Body",
    meta: ["magazines"],
    vatRate: 20,
  },
  {
    name: "Insurance",
    meta: ["insurance"],
    vatRate: 0, // exempt
  },
  {
    name: "Software and computer",
    meta: ["virus", "microsoft", "email", "website", "domain", "hosting"],
    vatRate: 20,
  },
  {
    name: "Repairs and Maintenance",
    meta: ["plumber", "electrician", "painter", "gardener", "carpender", "carpet", "glazer", "glazier", "glazing"],
    vatRate: 20,
  },
  {
    name: "Charitable Donations",
    meta: ["oxfam", "charity", "charitable", "mind"],
    vatRate: 0, // exempt
  },
  {
    name: "Consultancy Fees",
    meta: ["law", "accountant", "consult", "medical", "architect", "survey", "engineer", "solicit", "financial", "advis", "security", "fire", "risk", "assess", "bank"],
    vatRate: 20,
  },
  {
    name: "Advertising and Promotion",
    meta: ["radio", "billboard", "TV", "announcement", "sponsor", "media", "social", "facebook", "twitter", "instagram"],
    vatRate: 20,
  },
  {
    name: "Medical",
    meta: ["plasters", "bandage", "paracetamol", "antiseptic", "drops", "eye", "ibuprofen"],
    vatRate: 0,
  },
  {
    name: "Taxes",
    meta: ["tax", "council", "rates"],
    vatRate: 0, // exempt
  },
];


export const lowerCaseLetters = /[a-z]/g;
export const upperCaseLetters = /[A-Z]/g;
export const numbers = /[0-9]/g;

// ---------- helpers ----------
export const TOTAL_HINT = /\b(total|grand total|amount due|balance|paid|card|subtotal)\b/i;
export const CURRENCY_SYMS = /(?:£|\$|€|GBP|USD|EUR)/i;
