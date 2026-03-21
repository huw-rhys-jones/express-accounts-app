// smartCategoryMatching.js

// Function to categorize input based on context
function categorizeInput(input, context) {
    // Context-aware categorization logic here
    // For example, disambiguation based on prior user inputs or predefined categories
    // This is a placeholder to illustrate the structure
    const categories = {
        "fruit": ["apple", "banana", "orange"],
        "animal": ["dog", "cat", "fish"],
    };

    for (const category in categories) {
        if (categories[category].includes(input.toLowerCase())) {
            return category;
        }
    }
    return "unknown";
}

// Function to match categories with context-aware disambiguation
function matchCategory(input, context) {
    // Placeholder for context-aware disambiguation logic
    if (context === "food") {
        return categorizeInput(input, context);
    } else if (context === "pets") {
        return categorizeInput(input, context);
    }
    return "unknown context";
}

// Example usage
console.log(matchCategory('banana', 'food'));  // Output: fruit
console.log(matchCategory('dog', 'pets'));     // Output: animal

export { categorizeInput, matchCategory };