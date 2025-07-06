
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



export const categories = [
    {name: "Accomodation", 
      meta: ["rent", "house", "flat", "monthly", "hotel", "caravan", "bungalow"]},


    {name: "Subsistence", 
      meta: ["cafe", "restaurant", "bar", "olive", "hungry", "coffee", "americano", "latte", "cappacino",
             "steak", "peppercorn", "sirloin", "pizza", "meat", "eat"]},
     

     {name: "Travel",
      meta: ["rail", "train", "fare", "ticket", "single", "return", "zone", "tfl",
             "taxi", "parking", "toll"]},
     

     {name: "Vehicle Maintenance",
      meta: ["parts", "MOT", "servicing", "tyre", "oil", "filter", "brake"]},
      
      
     {name: "Fuel",
      meta: ["fuel", "filling", "petrol", "deisel", "unleaded", "pump"]},


     {name: "Rent",
      meta: ["monthly", "garage", "shop", "office", "premises"]},
      

     {name: "Equipment and Tools",
      meta: ["hammer", "saw", "driver"]},
      

     {name: "Telephone and Internet",
      meta: ["phone", "contract", "handset", "wifi", "router", "internet", "o2",
            "vodaphone"]},
      
      
     {name: "Materials",
      meta: ["nail", "screw", "consumable", "paint", "cement", "wood", "metal", 
             "plastic", "slate", "stone", "sand", "B&Q", "lamanate", "floor", 
             "deck", "plaster", "glue", "adhesive", "nuts", "bolts", "washer", 
             "carpet"]},

     {name: "Plant and Machinery",
      meta: ["machine", "plant"]},

     {name: "Vehicle Hire",
      meta: ["avis", "europcar", "enterprise"]},


     {name: "Training and Tuition",
      meta: ["course", "exam"]},
      

     {name: "Staff Welfare", 
      meta: ["health", "safety"]},


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
      meta: ["virus", "microsoft", "email", "website", "domain", "hosting"]},
     
      
     {name: "Repairs and Maintenance", 
      meta: ["plumber", "electrician", "painter", "gardener", "carpender", 
             "carpet", "glazer", "glazier", "glazing"]},


     {name: "Charitable Donations",
      meta: ["oxfam", "charity", "charitable", "mind"]},


     {name: "Consultancy Fees",
      meta: ["law", "accountant", "consult", "medical", "architect",
             "survey", "engineer", "solicit", "financial", "advis",
            "security", "fire", "risk", "assess", "bank"]}, 
     
            
     {name: "Advertising and Promotion",
      meta: ["radio", "billboard", "TV", "announcement", "sponsor",
             "media", "social", "facebook", "twitter", "instagram"]},
        

     {name: "Medical", 
      meta: ["plasters", "bandage", "paracetamol", "antiseptic", "drops", "eye",
             "ibuprofen"]},
        

    //  {name: "Sundry",
    //   meta: []},

      
     {name: "Taxes",
      meta: ["tax", "council", "rates"]},  

]

export const lowerCaseLetters = /[a-z]/g;
export const upperCaseLetters = /[A-Z]/g;
export const numbers = /[0-9]/g;