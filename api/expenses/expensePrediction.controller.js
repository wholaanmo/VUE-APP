const expenseService = require('../expenses/expenses.service');
const expenseClassifierService = require('../expenses/expenseClassifier.service');

module.exports = {
  initialize: async () => {
    try {
      expenseClassifierService.initializeWithBasicData();
      await expenseClassifierService.loadTrainingData();
      console.log('Classifier ready');
    } catch (err) {
      console.error('Failed to initialize classifier:', err);
      throw err;
    }
  },

  predictCategory: async (req, res) => {
    try {
        const { item_name } = req.body;
        const userId = req.user?.userId; 
        
        if (!item_name || typeof item_name !== 'string' || item_name.trim().length < 2) {
            return res.status(400).json({ 
                success: false,
                code: 'INVALID_INPUT',
                message: 'Item name must be a string with at least 2 characters'
            });
        }

        // Get prediction with confidence
        const { expenseType, confidence } = await expenseClassifierService.predict(item_name);
        
        // Check historical data if prediction is uncertain
        let finalCategory = expenseType;
        if (confidence < 0.7 || expenseType === 'Other') {
            try {
                const [existingItems] = await pool.execute(
                    `SELECT expense_type, COUNT(*) as count 
                     FROM expenses 
                     WHERE LOWER(item_name) = LOWER(?) 
                     AND userId = ? 
                     AND expense_type != 'Other'
                     GROUP BY expense_type
                     ORDER BY count DESC
                     LIMIT 1`,
                    [item_name, userId]
                );

                if (existingItems.length > 0) {
                    finalCategory = existingItems[0].expense_type;
                } else {
                    const [frequentItems] = await pool.execute(
                        `SELECT COUNT(*) as count 
                         FROM expenses 
                         WHERE LOWER(item_name) = LOWER(?) 
                         AND userId = ?`,
                        [item_name, userId]
                    );

                    if (frequentItems[0].count >= 3) {
                        finalCategory = 'Shopping';
                    }
                }
            } catch (dbError) {
                console.error('Error checking item history:', dbError);
            }
        }

        res.json({ 
            success: true,
            data: { 
                expense_type: finalCategory,
                confidence,
                was_adjusted: finalCategory !== expenseType,
                adjustment_reason: finalCategory !== expenseType ? 
                    (expenseType === 'Other' ? 'historical_override' : 'frequency_override') : null
            }
        });

    } catch (error) {
        console.error('Prediction failed:', error);
        res.status(500).json({ 
            success: false,
            code: 'PREDICTION_FAILED',
            message: 'Failed to process prediction'
        });
    }
},
  
    learnFromCorrection: async (req, res) => {
      try {
        console.log('Full incoming request:', {
          body: req.body,
          headers: req.headers,
          user: req.user
        });
    
        const { item_name, expense_type, item_price, personal_budget_id } = req.body;
        const userId = req.user?.userId || null; 
        
        if (!item_name || !expense_type) {
          console.error('Missing required fields:', { item_name, expense_type });
          return res.status(400).json({ 
            success: 0,
            message: 'Both item_name and expense_type are required' 
          });
        }
        
        await expenseClassifierService.learn(item_name, expense_type);
      
        const result = await expenseService.learnFromCorrection(
          item_name,
          expense_type,
          userId,
          item_price,
          personal_budget_id
        );
        
        return res.json({ 
          success: 1,
          message: 'Learned from correction',
          data: result 
        });
        
      } catch (error) {
        console.error('Full learning error:', {
          message: error.message,
          stack: error.stack,
          response: error.response?.data,
          request: {
            body: req.body,
            headers: req.headers
          }
        });
        
        return res.status(500).json({ 
          success: 0,
          message: 'Failed to learn from correction',
          error: process.env.NODE_ENV === 'development' ? {
            message: error.message,
            stack: error.stack
          } : undefined
        });
      }
    },
    editExpense: async (req, res) => {
      try {
        const { item_price, expense_type, item_name, personal_budget_id } = req.body;
        const userId = req.user.userId;
        const id = req.params.id;
    
        if (!item_price || !expense_type || !item_name) {
          return res.status(400).json({
            success: 0,
            message: "Missing required fields"
          });
        }
    
        await expenseService.editExpense({
          id, 
          userId, 
          item_price, 
          expense_type, 
          item_name,
          personal_budget_id
        });
    
        return res.json({
          success: 1,
          message: "Expense updated successfully"
        });
      } catch (err) {
        let message = "Database error";
        if (err.message === "Expense not found or unauthorized") {
          message = err.message;
        }
        console.error("Edit expense error:", {
          error: err,
          request: {
            params: req.params,
            body: req.body,
            user: req.user
          }
        });
        return res.status(500).json({
          success: 0,
          message: message
        });
      }
    }
  };