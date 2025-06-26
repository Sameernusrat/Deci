import express from 'express';
import { AdviceService } from '../services/AdviceService';

const router = express.Router();
const adviceService = new AdviceService();

router.get('/emi-eligibility', (req, res) => {
  const eligibilityInfo = adviceService.getEMIEligibilityInfo();
  res.json(eligibilityInfo);
});

router.post('/emi-check', (req, res) => {
  try {
    const { companyInfo } = req.body;
    const result = adviceService.checkEMIEligibility(companyInfo);
    res.json(result);
  } catch (error) {
    console.error('EMI check error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/tax-rates', (req, res) => {
  const taxRates = adviceService.getCurrentTaxRates();
  res.json(taxRates);
});

router.post('/tax-calculation', (req, res) => {
  try {
    const { scenario } = req.body;
    const calculation = adviceService.calculateTax(scenario);
    res.json(calculation);
  } catch (error) {
    console.error('Tax calculation error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;