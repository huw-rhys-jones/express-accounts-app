// categoryLearning.js

/**
 * Tracks user category corrections and suggests categories based on history.
 */
class CategoryLearning {
    constructor() {
        this.userCorrections = {};
        this.categoryHistory = {};
    }

    /**
     * Track corrections made by the user for a specific category.
     * @param {string} userId - The ID of the user.
     * @param {string} category - The category corrected by the user.
     */
    trackCorrection(userId, category) {
        if (!this.userCorrections[userId]) {
            this.userCorrections[userId] = [];
        }
        this.userCorrections[userId].push(category);
    }

    /**
     * Suggest categories based on user's history.
     * @param {string} userId - The ID of the user.
     * @returns {Array<string>} - Suggested categories for the user.
     */
    suggestCategories(userId) {
        if (!this.userCorrections[userId]) {
            return [];
        }
        // Analyze corrections to suggest categories
        const suggestions = this.userCorrections[userId].reduce((acc, category) => {
            acc[category] = (acc[category] || 0) + 1;
            return acc;
        }, {});

        // Sort categories by frequency
        return Object.keys(suggestions).sort((a, b) => suggestions[b] - suggestions[a]);
    }
}

module.exports = CategoryLearning;
