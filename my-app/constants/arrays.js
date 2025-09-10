
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

export const expense_categories = [
                        "<Select>",
                        "Professional Fees",
                        "Advertising / Marketing",
                        "Travel Expenses",
                        "Office Costs",
                        "Construction",
                        "Cost of Goods",
                        "Clothing Expenses",
                        "Staff Costs",
                        "Finance Costs",
                        "Premises Costs",
                        "Training Courses"
]



export const categories_meta = [
    {name: "Accomodation", 
      meta: ["rent", "house", "flat", "monthly", "hotel", "caravan", "lodge", "inn", "guest", "guesthouse", "room", "night" "bungalow"]},


    {name: "Subsistence", 
      meta: ["cafe", "restaurant", "bar", "olive", "hungry", "coffee", "americano", "latte", "cappacino",
             "steak", "peppercorn", "sirloin", "pizza", "meat", "eat", "takeaway", "food", "table", "burger"]},
     

     {name: "Travel",
      meta: ["rail", "train", "fare", "ticket", "single", "return", "zone", "tfl",
             "taxi", "parking", "toll"]},
     

     {name: "Vehicle Maintenance",
      meta: ["parts", "MOT", "servicing", "tyre", "oil", "filter", "brake"]},
      
      
     {name: "Fuel",
      meta: ["fuel", "filling", "petrol", "deisel", "unleaded", "garage", "pump"]},


     {name: "Rent",
      meta: ["monthly", "shop", "office", "premises"]},
      

     {name: "Equipment and Tools",
      meta: ["hammer", "saw", "driver", "skip"]},
      

     {name: "Telephone and Internet",
      meta: ["phone", "contract", "bt" "handset", "wifi", "router", "ee", "internet", "o2",
            "vodaphone"]},
      
      
     {name: "Materials",
      meta: ["nail", "screw", "consumable", "paint", "cement", "wood", "metal", 
             "plastic", "slate", "stone", "sand", "B&Q", "lamanate", "floor", 
             "deck", "plaster", "glue", "adhesive", "selco", "screwfix", "wickes", "nuts", "tiles" "bolts", "washer", 
             "carpet"]},

     {name: "Plant and Machinery",
      meta: ["machine", "plant"]},

     {name: "Vehicle Hire",
      meta: ["avis", "europcar", "enterprise"]},


     {name: "Training and Tuition",
      meta: ["course", "exam" "training", "certificate"]},
      

     {name: "Health and Safety",
     meta: ["health", "boots", "gloves", "glasses", "plasters", "bandage", "paracetamol", "antiseptic", "drops", "eye",
             "ibuprofen", "medical", "safety"]}, 


    //  {name: "Entertaining",
    //  meta: []},
      

     {name: "Property Service Charges", 
      meta: ["estate", "management", "letting"]},


     {name: "Lighting and Heating",
      meta: ["electric", "light", "lamp", "gas", "heat", "bulb", "led", "flourescent"]},


     {name: "Cleaning and Upkeep",
      meta: ["clean", "wash", "detol", "bleach", "soap"]},
      

     {name: "Postage and Courier", 
      meta: ["stamps", "courier", "delivery", "postage", "envelope", "package"]},
      
      
     {name: "Stationary and Office",
      meta: ["pen", "stationary", "pencil", "paper", "Print", "extinguisher", "ink", "cartridge",
             "sellotape", "duct", "memory"]},


     {name: "Subscriptions and Professional Body",
      meta: ["magazines"]},


     {name: "Insurance",
     meta: ["insurance"]},
     
     
     {name: "Software and computer",
      meta: ["virus", "microsoft", "email", "website", "domain", "vpn" "hosting"]},
     
      
     {name: "Repairs and Maintenance", 
      meta: ["plumber", "electrician", "painter", "gardener", "carpenter", 
             "carpet", "glazer", "glazier", "glazing"]},


     {name: "Charitable Donations",
      meta: ["oxfam", "charity", "charitable", "mind"]},


     {name: "Consultancy Fees",
      meta: ["law", "accountant", "consult", "medical", "architect",
             "survey", "engineer", "solicit", "financial", "advis",
            "security", "fire", "risk", "assess", "bank"]}, 
     
            
     {name: "Advertising and Promotion",
      meta: ["radio", "billboard", "TV", "announcement", "ad", "yell", "sponsor",
             "media", "social", "facebook", "twitter", "instagram"]},
        

    // {name: "Medical", 
     // meta: ["plasters", "bandage", "paracetamol", "antiseptic", "drops", "eye",
           //  "ibuprofen"]},
        // #I would consider just combining this with health & safety

    //  {name: "Sundry",
    //   meta: []},

      
     {name: "Taxes",
      meta: ["tax", "council", "hmrc", "rates"]},  

]

export const lowerCaseLetters = /[a-z]/g;
export const upperCaseLetters = /[A-Z]/g;
export const numbers = /[0-9]/g;

// ---------- helpers ----------
export const TOTAL_HINT = /\b(total|grand total|amount due|balance|paid|card|subtotal)\b/i;
export const CURRENCY_SYMS = /(?:£|\$|€|GBP|USD|EUR)/i;
