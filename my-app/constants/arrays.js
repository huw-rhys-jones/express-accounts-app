
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
    name: "Fuel",
    meta: ["fuel", "filling", "petrol", "deisel", "unleaded", "pump", "gas station", "shell", "bp", "texaco"],
    vatRate: 20,
  },
  {
    name: "Vehicle Costs and Maintenance",
    meta: ["parts", "MOT", "servicing", "tyre", "oil", "filter", "brake", "repair", "exhaust", "battery", "garage"],
    vatRate: 20,
  },
  {
    name: "Vehicle Hire",
    meta: ["avis", "europcar", "enterprise", "rental", "van hire", "hertz", "sixt"],
    vatRate: 20,
  },
  {
    name: "Travel (bus, train, taxi)",
    meta: ["rail", "train", "fare", "ticket", "single", "return", "zone", "tfl", "taxi", "uber", "bolt", "tube", "underground", "bus"],
    vatRate: 0,
  },
  {
    name: "Accommodation",
    meta: ["hotel", "inn", "travelodge", "premier inn", "airbnb", "stay", "lodging", "booking.com"],
    vatRate: 20,
  },
  {
    name: "Subsistence",
    meta: [
      "cafe", "restaurant", "bar", "olive", "hungry", "coffee", "americano",
      "latte", "cappacino", "steak", "peppercorn", "sirloin", "pizza", "meat",
      "eat", "takeaway", "food", "burger", "lunch", "meal", "greggs", "mcdonalds"
    ],
    vatRate: 20,
  },
  {
    name: "Parking",
    meta: ["parking", "ncp", "pay and display", "ringgo", "car park", "valet", "permit"],
    vatRate: 20,
  },
  {
    name: "Plant & Machinery Hire",
    meta: ["machine", "plant", "digger", "excavator", "generator", "hss", "speedy", "hire"],
    vatRate: 20,
  },
  {
    name: "Materials",
    meta: [
      "nail", "screw", "consumable", "paint", "cement", "wood", "metal",
      "plastic", "slate", "stone", "sand", "B&Q", "lamanate", "floor",
      "deck", "plaster", "glue", "adhesive", "nuts", "bolts", "washer", "carpet", "timber", "brick"
    ],
    vatRate: 20,
  },
  {
    name: "Tools and Equipment",
    meta: ["hammer", "saw", "driver", "drill", "power tool", "wrench", "toolbox", "ladder"],
    vatRate: 20,
  },
  {
    name: "Client Entertaining",
    meta: ["hospitality", "client", "entertainment", "dinner", "drinks", "event", "tickets", "theatre"],
    vatRate: 0, // In the UK, Client Entertaining is usually not VAT recoverable
  },
  {
    name: "Business Rental",
    meta: ["monthly", "garage", "shop", "office", "premises", "rent", "lease", "business rates", "council tax"],
    vatRate: 0,
  },
  {
    name: "Waste Disposal",
    meta: ["skip", "rubbish", "refuse", "bin", "recycling", "landfill", "hazard", "waste"],
    vatRate: 20,
  },
  {
    name: "Telephone",
    meta: ["phone", "contract", "handset", "o2", "vodaphone", "mobile", "ee", "three", "billing"],
    vatRate: 20,
  },
  {
    name: "Software",
    meta: ["virus", "microsoft", "email", "website", "domain", "hosting", "saas", "adobe", "subscription", "cloud"],
    vatRate: 20,
  },
  {
    name: "Business Insurance",
    meta: ["insurance", "liability", "indemnity", "premium", "broker", "policy"],
    vatRate: 0,
  },
  {
    name: "Training costs",
    meta: ["course", "exam", "tuition", "certification", "workshop", "seminar", "degree"],
    vatRate: 0,
  },
  {
    name: "Professional Fees",
    meta: ["law", "accountant", "consult", "medical", "architect", "survey", "engineer", "solicit", "financial", "advis", "audit"],
    vatRate: 20,
  },
  {
    name: "Trade Subscriptions",
    meta: ["magazines", "journal", "membership", "professional body", "guild", "union", "licence"],
    vatRate: 20,
  },
  {
    name: "Utilities",
    meta: ["electric", "light", "lamp", "gas", "heat", "bulb", "led", "flourescent", "water", "utility", "power", "sewerage"],
    vatRate: 5,
  },
  {
    name: "Cleaning and Upkeep",
    meta: ["clean", "wash", "detol", "bleach", "soap", "sanitizer", "janitorial", "window", "hygiene"],
    vatRate: 20,
  },
  {
    name: "Sundry items",
    meta: ["miscellaneous", "other", "sundry", "petty", "cash", "small", "random"],
    vatRate: 20,
  },
  {
    name: "Postage",
    meta: ["stamps", "courier", "delivery", "postage", "envelope", "package", "royal mail", "dpd", "fedex", "ups"],
    vatRate: 20,
  },
  {
    name: "Stationary",
    meta: ["pen", "stationary", "pencil", "paper", "print", "extinguisher", "ink", "cartridge", "sellotape", "duct", "memory", "stapler", "folder"],
    vatRate: 20,
  },
];


export const lowerCaseLetters = /[a-z]/g;
export const upperCaseLetters = /[A-Z]/g;
export const numbers = /[0-9]/g;

// ---------- helpers ----------
export const TOTAL_HINT = /\b(total|grand total|amount due|balance|paid|card|subtotal)\b/i;
export const CURRENCY_SYMS = /(?:£|\$|€|GBP|USD|EUR)/i;
