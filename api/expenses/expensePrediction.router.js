const express = require('express');
const router = express.Router();
const expensePredictionController = require('./expensePrediction.controller');
const { checkToken } = require('../../auth/token_validation');

// Prediction endpoints
router.post('/predict', checkToken, expensePredictionController.predictCategory);
router.post('/learn', checkToken, expensePredictionController.learnFromCorrection);
router.put('/:id', checkToken, expensePredictionController.editExpense);

module.exports = router;