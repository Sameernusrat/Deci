export interface EMIEligibilityInfo {
  companyRequirements: string[];
  employeeRequirements: string[];
  optionRequirements: string[];
  limits: {
    companyTotal: string;
    perEmployee: string;
  };
}

export interface TaxRates {
  capitalGains: {
    basicRate: number;
    higherRate: number;
    allowance: number;
    businessAssetDisposalRelief: number;
  };
  incomeTax: {
    basicRate: number;
    higherRate: number;
    additionalRate: number;
    personalAllowance: number;
  };
}

export class AdviceService {
  getEMIEligibilityInfo(): EMIEligibilityInfo {
    return {
      companyRequirements: [
        'UK company or subsidiary of qualifying group',
        'Independent company (not controlled by another company)',
        'Carrying on qualifying trade',
        'Gross assets not exceeding £30 million',
        'Fewer than 250 full-time equivalent employees'
      ],
      employeeRequirements: [
        'Employee or director of the company',
        'Work at least 25 hours per week or 75% of working time',
        'Not have material interest in company (generally <30%)',
        'Not connected with company if material interest exists'
      ],
      optionRequirements: [
        'Options must be over ordinary shares',
        'Exercise price at least equal to market value at grant',
        'Exercise period between 1-10 years',
        'No other rights attached to options'
      ],
      limits: {
        companyTotal: '£3 million',
        perEmployee: '£250,000'
      }
    };
  }

  checkEMIEligibility(companyInfo: any): { eligible: boolean; issues: string[] } {
    const issues: string[] = [];
    
    // Simple validation for demo
    if (companyInfo.grossAssets > 30000000) {
      issues.push('Gross assets exceed £30 million limit');
    }
    
    if (companyInfo.employees >= 250) {
      issues.push('Employee count exceeds 250 limit');
    }
    
    if (companyInfo.isControlled) {
      issues.push('Company appears to be controlled by another entity');
    }
    
    return {
      eligible: issues.length === 0,
      issues
    };
  }

  getCurrentTaxRates(): TaxRates {
    return {
      capitalGains: {
        basicRate: 10,
        higherRate: 20,
        allowance: 6000,
        businessAssetDisposalRelief: 10
      },
      incomeTax: {
        basicRate: 20,
        higherRate: 40,
        additionalRate: 45,
        personalAllowance: 12570
      }
    };
  }

  calculateTax(scenario: any): { incomeTax: number; capitalGains: number; totalTax: number } {
    // Simplified tax calculation for demo
    const { gainAmount, isBusinessAsset, taxBand } = scenario;
    
    let capitalGains = 0;
    const rates = this.getCurrentTaxRates();
    
    if (gainAmount > rates.capitalGains.allowance) {
      const taxableGain = gainAmount - rates.capitalGains.allowance;
      
      if (isBusinessAsset) {
        capitalGains = taxableGain * (rates.capitalGains.businessAssetDisposalRelief / 100);
      } else {
        const rate = taxBand === 'basic' ? rates.capitalGains.basicRate : rates.capitalGains.higherRate;
        capitalGains = taxableGain * (rate / 100);
      }
    }
    
    return {
      incomeTax: 0, // Simplified - would depend on specific scenario
      capitalGains,
      totalTax: capitalGains
    };
  }
}