const pool = require('../../config/database');
const natural = require('natural');
const brain = require('brain.js');
const nlp = require('compromise');

class ExpenseClassifier {
  constructor() {
    this.nlp = nlp; 
    this.initializeClassifiers();
    this.trainingData = [];
    this.initializeWithBasicData(); 
    this.recentCorrections = new Map(); 
    this.correctionThreshold = 1;
  }

  initializeClassifiers() {
    this.keywordClassifier = new natural.BayesClassifier();
    
    this.neuralClassifier = new brain.NeuralNetwork({
      binaryThresh: 0.5,
      hiddenLayers: [7], // Simpler architecture
      activation: 'sigmoid', // More stable than leaky-relu
      leakyReluAlpha: 0.01,
      inputSize: 7,
      outputSize: 7,
      learningRate: 0.3, // Reduced from 0.5
      momentum: 0.1 // Reduced from 0.3
    });
    
    this.trainingData = [];
  }

  initializeWithBasicData() {
    const enhancedTrainingData = {
      Food: {
        examples: ["burger", "pizza", "pasta"],
        nouns: ["meal", "food", "dinner"],
        verbs: ["eat", "dine"]
      },
      Bill: {
        examples: ["electric bill", "water payment"],
        nouns: ["utility", "rent"],
        verbs: ["pay", "owe"]
      },
      Transportation: {
        examples: ["jeep", "jeepney", "bus fare", "gas", "train ticket", "public transport"],
        nouns: ["transport", "fare", "vehicle", "commute"],
        verbs: ["ride", "travel", "commute"]
      },
      Entertainment: {
        examples: ["movie", "concert", "game"],
        nouns: ["fun", "show"],
        verbs: ["watch", "play"]
      },
      Healthcare: {
        examples: ["doctor", "hospital", "medicine"],
        nouns: ["health", "clinic"],
        verbs: ["treat", "heal"]
      },
      Shopping: {
        examples: ["clothes", "shoes", "mall"],
        nouns: ["purchase", "item"],
        verbs: ["buy", "shop"]
      },
      Other: {
        examples: ["miscellaneous", "unknown"],
        nouns: ["other"],
        verbs: []
      }
    };
    Object.entries(enhancedTrainingData).forEach(([expenseType, data]) => {
      // Train on direct examples
      data.examples.forEach(text => this.addTrainingExample(text, expenseType));
      
      // Train on related nouns/verbs
      data.nouns.forEach(noun => this.addTrainingExample(noun, expenseType));
      data.verbs.forEach(verb => this.addTrainingExample(verb, expenseType));
    });
    
    this.train();
  }

  textToFeatures(text) {
    const doc = this.nlp(text);
    const words = text.split(/\s+/);
    
    const transportTerms = ["jeep", "bus", "taxi", "fare", "gas", "transport"];
  const hasTransportTerm = transportTerms.some(term => text.includes(term)) ? 1 : 0;
  
  return [
    Math.min(text.length / 100, 1),
    /\d/.test(text) ? 1 : 0,
    Math.min(words.length / 10, 1),
    Math.min(doc.nouns().out('array').length / 5, 1),
    Math.min(doc.verbs().out('array').length / 5, 1),
    Math.min(doc.adjectives().out('array').length / 5, 1),
    hasTransportTerm // New feature specifically for transportation
  ];
}

  addLinguisticVariants(text, expenseType) {
    const doc = this.nlp(text);
    
    // 1. Add singular/plural forms
    const singular = doc.nouns().toSingular().text();
    if (singular !== text) {
      this.keywordClassifier.addDocument(singular, expenseType);
    }
    
    // 2. Add verb forms (e.g. "paying bill" -> "pay bill")
    const baseVerbs = doc.verbs().toInfinitive().text();
    if (baseVerbs !== text) {
      this.keywordClassifier.addDocument(baseVerbs, expenseType);
    }
    
    // 3. Add money-related expansions
    if (doc.has('#Money')) {
      this.keywordClassifier.addDocument('payment', expenseType);
    }
  }

  addCommonFoodMisspellings(baseWord) {
    if (baseWord.includes('burger')) {
      this.addTrainingExample('burgei', 'Food');
      this.addTrainingExample('burgir', 'Food');
    }
    if (baseWord.includes('pizza')) {
      this.addTrainingExample('piza', 'Food');
      this.addTrainingExample('pisa', 'Food');
    }
  }

  fuzzyMatch(input, target, threshold = 0.7) {
    const distance = natural.LevenshteinDistance(input, target);
    const similarity = 1 - (distance / Math.max(input.length, target.length));
    return similarity >= threshold;
  }

  addTrainingExample(text, expenseType) {
    const normalized = text.toLowerCase().trim();
    
    this.keywordClassifier.addDocument(normalized, expenseType);
    
    this.trainingData.push({
      input: this.textToFeatures(normalized),
      output: expenseType 
    });

    this.addLinguisticVariants(normalized, expenseType);
  }

  async retrain() {
    // Retrain both classifiers with updated data
    this.keywordClassifier.retrain();
    if (this.trainingData.length > 0) {
      await this.neuralClassifier.train(this.prepareTrainingData(), {
        iterations: 200,
        errorThresh: 0.01,
        log: true
      });
    }
  }

  async simpleLearn(itemName, expenseType) {
    try {
      const normalizedText = itemName.toLowerCase().trim();

      this.keywordClassifier.addDocument(normalizedText, expenseType);
      
      const features = this.textToFeatures(normalizedText);
    this.trainingData.push({
      input: features,
      output: { [expenseType]: 1 }
    });
      
      await this.keywordClassifier.retrain();
      if (this.trainingData.length % 5 === 0) {
        await this.neuralClassifier.train(this.trainingData, {
          iterations: 1000,
          errorThresh: 0.01,
          log: false
        });
      }
      return true;
    } catch (error) {
      console.error('Error in learning:', {
        error: error.message,
        text: itemName,        
        expenseType: expenseType, 
        stack: error.stack
      });
      throw error;
    }
  }

  async learn(text, expenseType, userId, options = {}) {
    try {
        const lowerText = (text || '').toLowerCase().trim();
        const safeExpenseType = expenseType || 'Other';
        const safeUserId = userId || null;

        // Add to recent corrections
        const currentCount = this.recentCorrections.get(lowerText)?.count || 0;
        this.recentCorrections.set(lowerText, {
            count: currentCount + 1,
            expenseType: safeExpenseType
        });

        // Add training example
        this.addTrainingExample(lowerText, safeExpenseType);
        
        // Immediate persist if requested
        if (options.immediatePersist) {
            await this.persistCorrections(safeUserId);
        }

        // Periodic retraining
        if (this.trainingData.length % 5 === 0) {
            await this.retrain();
        }

        return true;
    } catch (error) {
        console.error('Learning error:', {
            text,
            expenseType,
            userId,
            error: error.message
        });
        throw error;
    }
}
  
  async persistCorrections(userId) {  
    const corrections = Array.from(this.recentCorrections.entries())
      .filter(([_, {count}]) => count >= this.correctionThreshold);
    
      if (corrections.length === 0) return;

      const connection = await pool.getConnection();
      try {
          await connection.beginTransaction();
          
          for (const [itemName, {expenseType, count}] of corrections) {
            // Ensure no undefined values get passed to MySQL
            const safeItemName = itemName || null;
            const safeExpenseType = expenseType || null;
            const safeUserId = userId || null;
            
            await connection.execute(
                `INSERT INTO expense_learning_data 
                 (item_name, expense_type, correction_count, userId) 
                 VALUES (?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE
                 expense_type = VALUES(expense_type),
                 correction_count = correction_count + VALUES(correction_count),
                 last_updated = NOW()`,
                [
                    safeItemName.substring(0, 100), // Ensure it fits in column
                    safeExpenseType,
                    count,
                    safeUserId
                ]
            );
        }
        
        await connection.commit();
        this.recentCorrections.clear();
    } catch (err) {
        await connection.rollback();
        console.error('Failed to persist corrections:', {
            error: err.message,
            stack: err.stack,
            corrections: corrections // Log what we were trying to save
        });
        throw err;
    } finally {
        connection.release();
    }
}

  async loadTrainingData() {
    try {
      const [expenses] = await pool.execute(
        "SELECT LOWER(item_name) as item_name, expense_type FROM expenses LIMIT 1000"
      );
      
      console.log(`Loaded ${expenses.length} training examples`);

      if (expenses.length === 0) {
        console.warn('Warning: No training data loaded from database');
        return;
      }

      const categoryCounts = {};
      expenses.forEach(expense => {
        this.addTrainingExample(expense.item_name, expense.expense_type);
        categoryCounts[expenseType] = (categoryCounts[expenseType] || 0) + 1;
      });

      const categoryExamples = {
        Food: [
          "burger", "burgei", "burgir", "hamburger", "jollibee", 
          "pizza", "piza", "pasta", "sandwich", "fries", "milktea",
          "rice", "noodles", "chicken", "mcdo", "kfc"
        ],
        Bill: [
          "electric bill", "water bill", "internet bill", "phone bill",
          "cable bill", "utility bill", "rent", "mortgage", "electricity",
          "water payment", "internet payment"
        ],
        Transportation: [
          "gasoline", "gas", "petrol", "diesel", "jeep", "jeepney", 
          "bus", "mrt", "grab", "angkas", "taxi", "lrt", "tricycle",
          "parking", "car", "vehicle", "transport", "fare", "commute",
          "fuel", "oil change", "toll", "public transport", "metro"
        ],
        Entertainment: [
          "movie tickets", "netflix", "spotify", "youtube premium",
          "concert tickets", "videoke", "arcade", "theme park",
          "movie", "cinema", "streaming", "game", "video game"
        ],
        Healthcare: [
          "doctor visit", "hospital", "medicine", "vitamins",
          "checkup", "dentist", "vaccine", "medical supplies",
          "pharmacy", "drugstore", "clinic", "xray", "laboratory"
        ],
        Shopping: [
          'shoes', 'clothes', 'shirt', 'pants', 'dress',
          'gadget', 'phone', 'laptop', 'accessories', 'bag',
          'watch', 'perfume', 'makeup', 'groceries', 'market',
          'office chair', 'desk', 'monitor', 'keyboard', 'mouse',
          'furniture', 'stationery', 'notebook', 'pen', 'backpack'
        ],
        Other: [
          "miscellaneous", "unknown", "uncategorized"
        ]
      };

      const targetCount = Math.max(...Object.values(categoryCounts)) || 10;
      for (const [expenseType, examples] of Object.entries(categoryExamples)) {
        examples.forEach(text => {
          if ((categoryCounts[expenseType] || 0) < targetCount) {
            this.addTrainingExample(text, expenseType);
            categoryCounts[expenseType] = (categoryCounts[expenseType] || 0) + 1;
          }
        });
      }
      
      await this.train();
    } catch (error) {
      console.error('Error loading training data:', error);
    }
  }


  async train() {
  this.keywordClassifier.train();
  
  if (this.trainingData.length > 0) {
    try {
      const trainingOptions = {
        iterations: 300, // Reduced from 2000
        errorThresh: 0.01,
        log: true,
        learningRate: 0.3, // Increased learning rate
        momentum: 0.1,
        timeout: 10000 // Stop after 10 seconds
      };
      
      const normalizedData = this.prepareTrainingData();
      await this.neuralClassifier.train(normalizedData, trainingOptions);
    } catch (err) {
      console.error('Training failed:', err);
      this.initializeClassifiers();
    }
  }
}

prepareTrainingData() {
  const categories = ['Food', 'Bill', 'Transportation', 'Entertainment', 'Healthcare', 'Shopping', 'Other'];
  return this.trainingData.map(item => {
    const output = {};
    categories.forEach(cat => {
      output[cat] = item.output === cat ? 0.99 : 0.01; // Better contrast
    });
    return {
      input: item.input,
      output: output
    };
  });
}

  async predict(text, userPatterns = null) {  
    try {
      if (!text || typeof text !== 'string' || text.trim().length === 0) {
        return 'Other';
      }

      const lowerText = text.toLowerCase().trim();
    if (this.recentCorrections.has(lowerText)) {
      const { count, expenseType } = this.recentCorrections.get(lowerText);
      if (count >= this.correctionThreshold) {
        return expenseType;
      }
    }
      const words = lowerText.split(/\s+/);

      if (userPatterns && userPatterns[lowerText]) {
        return userPatterns[lowerText];
      }

      const transportKeywords = ["jeep", "bus", "taxi", "transport", "fare", "gas"];
      if (transportKeywords.some(keyword => lowerText.includes(keyword))) {
        return 'Transportation';
      }

      const categoryKeywords = {
        Food: [
          "burger", "burgei", "burgir", "hamburger", "jollibee", 
          "pizza", "piza", "pasta", "sandwich", "fries", "milktea",
          "rice", "noodles", "chicken", "mcdo", "kfc"
        ],
        Bill: [
          "electric bill", "water bill", "internet bill", "phone bill",
          "cable bill", "utility bill", "rent", "mortgage", "electricity",
          "water payment", "internet payment"
        ],
        Transportation: [
          "gasoline", "gas", "petrol", "diesel", "jeepney fare",
          "bus fare", "mrt fare", "grab", "angkas", "taxi",
          "lrt fare", "tricycle fare", "parking fee", "car maintenance"
        ],
        Entertainment: [
          "movie tickets", "netflix", "spotify", "youtube premium",
          "concert tickets", "videoke", "arcade", "theme park",
          "movie", "cinema", "streaming", "game", "video game"
        ],
        Healthcare: [
          "doctor visit", "hospital", "medicine", "vitamins",
          "checkup", "dentist", "vaccine", "medical supplies",
          "pharmacy", "drugstore", "clinic", "xray", "laboratory"
        ],
        Shopping: [
          'shoes', 'clothes', 'shirt', 'pants', 'dress',
          'gadget', 'phone', 'laptop', 'accessories', 'bag',
          'watch', 'perfume', 'makeup', 'groceries', 'market',
          'office chair', 'desk', 'monitor', 'keyboard', 'mouse',
          'furniture', 'stationery', 'notebook', 'pen', 'backpack'
        ]
      };
      

      for (const [expenseType, keywords] of Object.entries(categoryKeywords)) {
        if (keywords.some(keyword => 
          keyword.includes(' ') ? lowerText.includes(keyword) : words.includes(keyword)
        )) {
          return expenseType;
        }
      }
  

      const keywordCategory = this.keywordClassifier.classify(lowerText);
      if (keywordCategory && keywordCategory !== 'Other') {
        const probs = this.keywordClassifier.getClassifications(lowerText);
        if (probs[0].value > 0.6) return keywordCategory;
      }
  
      const neuralResult = this.neuralClassifier.run(this.textToFeatures(lowerText));
      if (neuralResult) {
        const neuralCategory = Object.keys(neuralResult)[0];
        if (neuralCategory && neuralCategory !== 'Other') {
          return neuralCategory;
        }
      }
  
      return {
        expenseType: expenseType, // 'Food', 'Transportation', etc
        confidence: this.calculateConfidence(text, expenseType)
      };
    } catch (error) {
      return {
        expenseType: 'Other',
        confidence: 0
      };
    }
  }
}


module.exports = new ExpenseClassifier();