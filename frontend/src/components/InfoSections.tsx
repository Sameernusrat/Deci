import React from 'react';
import './InfoSections.css';

const InfoSections: React.FC = () => {
  return (
    <main className="info-sections" id="services">
      <div className="container">
        <section className="section">
          <h2>Enterprise Management Incentives (EMI)</h2>
          <div className="section-content">
            <div className="text-content">
              <p>
                EMI schemes are the UK's most tax-efficient way to incentivize key employees in qualifying companies. 
                With potential for significant tax savings, understanding the rules and requirements is crucial.
              </p>
              <ul>
                <li>Up to £3 million in total EMI options per company</li>
                <li>Maximum £250,000 per employee</li>
                <li>Potential capital gains tax treatment on exercise</li>
                <li>Business Asset Disposal Relief eligibility</li>
              </ul>
            </div>
            <div className="info-card">
              <h3>Key Benefits</h3>
              <p>No income tax or NICs on grant if options granted at market value</p>
              <p>Potential 10% CGT rate with Business Asset Disposal Relief</p>
            </div>
          </div>
        </section>

        <section className="section">
          <h2>Other Share Option Schemes</h2>
          <div className="section-grid">
            <div className="info-card">
              <h3>CSOP (Company Share Option Plan)</h3>
              <p>HMRC approved scheme allowing up to £60,000 per employee. Tax advantages available after 3-year holding period.</p>
            </div>
            <div className="info-card">
              <h3>SAYE (Save As You Earn)</h3>
              <p>All-employee scheme linked to savings contract. Employees save monthly and can buy shares at discount.</p>
            </div>
            <div className="info-card">
              <h3>Unapproved Options</h3>
              <p>Flexible but less tax-efficient. Income tax and NICs on exercise, but greater design flexibility.</p>
            </div>
          </div>
        </section>

        <section className="section">
          <h2>UK Equity Taxation</h2>
          <div className="section-content">
            <div className="text-content">
              <h3>Capital Gains Tax Considerations</h3>
              <p>
                Understanding when capital gains tax applies versus income tax is crucial for equity compensation planning.
              </p>
              <ul>
                <li>Annual CGT allowance: £6,000 (2023/24)</li>
                <li>Standard CGT rates: 10% (basic rate) / 20% (higher rate)</li>
                <li>Business Asset Disposal Relief: 10% on qualifying gains up to £1 million lifetime limit</li>
                <li>Investors' Relief: 10% rate for external investors in unlisted companies</li>
              </ul>
            </div>
            <div className="info-card">
              <h3>Income Tax vs CGT</h3>
              <p>Key factors determining tax treatment:</p>
              <ul>
                <li>Timing of acquisition vs disposal</li>
                <li>Nature of the arrangement</li>
                <li>Employment relationship</li>
                <li>Restriction on shares</li>
              </ul>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
};

export default InfoSections;