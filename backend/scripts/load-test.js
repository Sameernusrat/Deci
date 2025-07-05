const autocannon = require('autocannon');
const fs = require('fs');
const path = require('path');

// Load test configuration
const config = {
  url: 'http://localhost:3001',
  connections: 50, // Concurrent connections
  pipelining: 1,
  duration: 60, // 60 seconds
  requests: [
    // Health check endpoint (70% of requests)
    {
      method: 'GET',
      path: '/api/health',
      weight: 70
    },
    // Chat message endpoint (25% of requests)
    {
      method: 'POST',
      path: '/api/chat/message',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: 'What are EMI schemes and how do they work?',
        context: { source: 'load-test' }
      }),
      weight: 25
    },
    // Topics endpoint (5% of requests)
    {
      method: 'GET', 
      path: '/api/chat/topics',
      weight: 5
    }
  ]
};

// Test scenarios
const scenarios = [
  {
    name: 'Baseline Test',
    description: 'Normal load with 50 concurrent connections',
    config: { ...config, connections: 50, duration: 30 }
  },
  {
    name: 'High Load Test',
    description: 'High load with 100 concurrent connections',
    config: { ...config, connections: 100, duration: 60 }
  },
  {
    name: 'Stress Test',
    description: 'Extreme load with 200 concurrent connections',
    config: { ...config, connections: 200, duration: 90 }
  },
  {
    name: 'Burst Test',
    description: 'Short burst with very high concurrency',
    config: { ...config, connections: 500, duration: 30 }
  }
];

// Performance thresholds
const thresholds = {
  avgResponseTime: 500, // ms
  p95ResponseTime: 1000, // ms
  p99ResponseTime: 2000, // ms
  errorRate: 5, // percentage
  minThroughput: 100 // requests per second
};

class LoadTester {
  constructor() {
    this.results = [];
    this.reportDir = './load-test-reports';
    this.ensureReportDirectory();
  }

  ensureReportDirectory() {
    if (!fs.existsSync(this.reportDir)) {
      fs.mkdirSync(this.reportDir, { recursive: true });
    }
  }

  async runScenario(scenario) {
    console.log(`\n🔥 Running ${scenario.name}...`);
    console.log(`📋 ${scenario.description}`);
    console.log(`⚙️  Config: ${scenario.config.connections} connections, ${scenario.config.duration}s duration`);
    console.log('━'.repeat(80));

    return new Promise((resolve, reject) => {
      const instance = autocannon(scenario.config, (err, result) => {
        if (err) {
          reject(err);
          return;
        }

        const processedResult = this.processResult(scenario, result);
        this.results.push(processedResult);
        
        console.log(this.formatResult(processedResult));
        resolve(processedResult);
      });

      // Track progress
      autocannon.track(instance, { renderProgressBar: true });
    });
  }

  processResult(scenario, result) {
    const avgResponseTime = result.latency.mean;
    const p95ResponseTime = result.latency.p95;
    const p99ResponseTime = result.latency.p99;
    const errorRate = (result.errors / result.requests.total) * 100;
    const throughput = result.requests.average;

    // Determine pass/fail status
    const passed = 
      avgResponseTime <= thresholds.avgResponseTime &&
      p95ResponseTime <= thresholds.p95ResponseTime &&
      p99ResponseTime <= thresholds.p99ResponseTime &&
      errorRate <= thresholds.errorRate &&
      throughput >= thresholds.minThroughput;

    return {
      scenario: scenario.name,
      description: scenario.description,
      config: scenario.config,
      timestamp: new Date().toISOString(),
      metrics: {
        duration: result.duration,
        connections: result.connections,
        requests: {
          total: result.requests.total,
          average: result.requests.average,
          sent: result.requests.sent
        },
        latency: {
          mean: avgResponseTime,
          p50: result.latency.p50,
          p75: result.latency.p75,
          p90: result.latency.p90,
          p95: p95ResponseTime,
          p99: p99ResponseTime,
          max: result.latency.max
        },
        throughput: {
          mean: result.throughput.mean,
          stddev: result.throughput.stddev,
          min: result.throughput.min,
          max: result.throughput.max
        },
        errors: result.errors,
        timeouts: result.timeouts,
        errorRate: errorRate
      },
      thresholds: {
        avgResponseTime: {
          value: avgResponseTime,
          threshold: thresholds.avgResponseTime,
          passed: avgResponseTime <= thresholds.avgResponseTime
        },
        p95ResponseTime: {
          value: p95ResponseTime,
          threshold: thresholds.p95ResponseTime,
          passed: p95ResponseTime <= thresholds.p95ResponseTime
        },
        p99ResponseTime: {
          value: p99ResponseTime,
          threshold: thresholds.p99ResponseTime,
          passed: p99ResponseTime <= thresholds.p99ResponseTime
        },
        errorRate: {
          value: errorRate,
          threshold: thresholds.errorRate,
          passed: errorRate <= thresholds.errorRate
        },
        throughput: {
          value: throughput,
          threshold: thresholds.minThroughput,
          passed: throughput >= thresholds.minThroughput
        }
      },
      passed,
      grade: this.calculateGrade(avgResponseTime, p95ResponseTime, errorRate, throughput)
    };
  }

  calculateGrade(avgResponseTime, p95ResponseTime, errorRate, throughput) {
    let score = 100;

    // Penalize based on response times
    if (avgResponseTime > 100) score -= Math.min(30, (avgResponseTime - 100) / 10);
    if (p95ResponseTime > 200) score -= Math.min(25, (p95ResponseTime - 200) / 20);
    
    // Penalize based on error rate
    score -= errorRate * 5;
    
    // Penalize based on low throughput
    if (throughput < 200) score -= Math.min(20, (200 - throughput) / 5);

    if (score >= 90) return 'A';
    if (score >= 80) return 'B';
    if (score >= 70) return 'C';
    if (score >= 60) return 'D';
    return 'F';
  }

  formatResult(result) {
    const { metrics, thresholds, passed, grade } = result;
    const status = passed ? '✅ PASSED' : '❌ FAILED';
    
    return `
📊 Results for ${result.scenario}:
${status} (Grade: ${grade})

🚀 Performance Metrics:
   Total Requests: ${metrics.requests.total.toLocaleString()}
   Duration: ${metrics.duration}s
   Avg Throughput: ${metrics.requests.average.toFixed(1)} req/s
   
⏱️  Response Times:
   Average: ${metrics.latency.mean.toFixed(1)}ms ${thresholds.avgResponseTime.passed ? '✅' : '❌'}
   p95: ${metrics.latency.p95.toFixed(1)}ms ${thresholds.p95ResponseTime.passed ? '✅' : '❌'}
   p99: ${metrics.latency.p99.toFixed(1)}ms ${thresholds.p99ResponseTime.passed ? '✅' : '❌'}
   Max: ${metrics.latency.max.toFixed(1)}ms

📈 Throughput:
   Mean: ${metrics.throughput.mean.toFixed(1)} req/s ${thresholds.throughput.passed ? '✅' : '❌'}
   Min: ${metrics.throughput.min.toFixed(1)} req/s
   Max: ${metrics.throughput.max.toFixed(1)} req/s

⚠️  Errors:
   Total Errors: ${metrics.errors}
   Error Rate: ${metrics.errorRate.toFixed(2)}% ${thresholds.errorRate.passed ? '✅' : '❌'}
   Timeouts: ${metrics.timeouts}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;
  }

  async checkServerHealth() {
    try {
      const response = await fetch('http://localhost:3001/api/health');
      if (!response.ok) {
        throw new Error(`Server responded with status: ${response.status}`);
      }
      
      const health = await response.json();
      console.log('✅ Server health check passed');
      console.log(`📊 Server status: ${health.status}`);
      console.log(`⏰ Uptime: ${Math.floor(health.uptime / 60)}m ${Math.floor(health.uptime % 60)}s`);
      
      if (health.memoryStatus) {
        console.log(`💾 Memory: ${health.memoryStatus.current.heapUsed}MB used`);
      }
      
      return true;
    } catch (error) {
      console.error('❌ Server health check failed:', error.message);
      return false;
    }
  }

  async warmupServer() {
    console.log('🔥 Warming up server with initial requests...');
    
    const warmupRequests = [
      fetch('http://localhost:3001/api/health'),
      fetch('http://localhost:3001/api/chat/topics'),
      fetch('http://localhost:3001/api/health')
    ];

    try {
      await Promise.all(warmupRequests);
      console.log('✅ Server warmup completed');
      await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2s
    } catch (error) {
      console.warn('⚠️  Server warmup had issues:', error.message);
    }
  }

  generateReport() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const reportFile = path.join(this.reportDir, `load-test-report-${timestamp}.json`);
    const htmlReportFile = path.join(this.reportDir, `load-test-report-${timestamp}.html`);

    // JSON Report
    const report = {
      timestamp: new Date().toISOString(),
      summary: this.generateSummary(),
      scenarios: this.results,
      thresholds,
      environment: {
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch
      }
    };

    fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
    console.log(`📄 JSON report saved: ${reportFile}`);

    // HTML Report
    const htmlContent = this.generateHTMLReport(report);
    fs.writeFileSync(htmlReportFile, htmlContent);
    console.log(`🌐 HTML report saved: ${htmlReportFile}`);

    return report;
  }

  generateSummary() {
    const totalRequests = this.results.reduce((sum, r) => sum + r.metrics.requests.total, 0);
    const totalErrors = this.results.reduce((sum, r) => sum + r.metrics.errors, 0);
    const avgResponseTime = this.results.reduce((sum, r) => sum + r.metrics.latency.mean, 0) / this.results.length;
    const passed = this.results.filter(r => r.passed).length;
    const failed = this.results.length - passed;

    return {
      totalScenarios: this.results.length,
      passed,
      failed,
      overallSuccess: failed === 0,
      totalRequests,
      totalErrors,
      overallErrorRate: (totalErrors / totalRequests) * 100,
      avgResponseTime: avgResponseTime,
      averageGrade: this.calculateOverallGrade()
    };
  }

  calculateOverallGrade() {
    const grades = this.results.map(r => r.grade);
    const gradeValues = { 'A': 4, 'B': 3, 'C': 2, 'D': 1, 'F': 0 };
    const avgValue = grades.reduce((sum, grade) => sum + gradeValues[grade], 0) / grades.length;
    
    if (avgValue >= 3.5) return 'A';
    if (avgValue >= 2.5) return 'B';
    if (avgValue >= 1.5) return 'C';
    if (avgValue >= 0.5) return 'D';
    return 'F';
  }

  generateHTMLReport(report) {
    return `
<!DOCTYPE html>
<html>
<head>
    <title>Load Test Report - ${report.timestamp}</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 20px; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 8px; }
        .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin: 20px 0; }
        .metric { background: #f8f9fa; padding: 15px; border-radius: 8px; text-align: center; }
        .metric-value { font-size: 2em; font-weight: bold; color: #333; }
        .metric-label { color: #666; font-size: 0.9em; }
        .scenario { background: white; border: 1px solid #ddd; border-radius: 8px; margin: 15px 0; padding: 20px; }
        .passed { border-left: 4px solid #28a745; }
        .failed { border-left: 4px solid #dc3545; }
        .grade { display: inline-block; padding: 5px 10px; border-radius: 4px; font-weight: bold; }
        .grade-A { background: #d4edda; color: #155724; }
        .grade-B { background: #d1ecf1; color: #0c5460; }
        .grade-C { background: #fff3cd; color: #856404; }
        .grade-D { background: #f8d7da; color: #721c24; }
        .grade-F { background: #f5c6cb; color: #721c24; }
        table { width: 100%; border-collapse: collapse; margin: 10px 0; }
        th, td { padding: 8px 12px; text-align: left; border-bottom: 1px solid #ddd; }
        th { background: #f8f9fa; }
        .pass { color: #28a745; }
        .fail { color: #dc3545; }
    </style>
</head>
<body>
    <div class="header">
        <h1>🚀 Load Test Report</h1>
        <p>Generated: ${report.timestamp}</p>
        <p>Overall Grade: <span class="grade grade-${report.summary.averageGrade}">${report.summary.averageGrade}</span></p>
    </div>

    <div class="summary">
        <div class="metric">
            <div class="metric-value">${report.summary.totalScenarios}</div>
            <div class="metric-label">Total Scenarios</div>
        </div>
        <div class="metric">
            <div class="metric-value" style="color: #28a745">${report.summary.passed}</div>
            <div class="metric-label">Passed</div>
        </div>
        <div class="metric">
            <div class="metric-value" style="color: #dc3545">${report.summary.failed}</div>
            <div class="metric-label">Failed</div>
        </div>
        <div class="metric">
            <div class="metric-value">${report.summary.totalRequests.toLocaleString()}</div>
            <div class="metric-label">Total Requests</div>
        </div>
        <div class="metric">
            <div class="metric-value">${report.summary.avgResponseTime.toFixed(0)}ms</div>
            <div class="metric-label">Avg Response Time</div>
        </div>
        <div class="metric">
            <div class="metric-value">${report.summary.overallErrorRate.toFixed(2)}%</div>
            <div class="metric-label">Error Rate</div>
        </div>
    </div>

    ${report.scenarios.map(scenario => `
    <div class="scenario ${scenario.passed ? 'passed' : 'failed'}">
        <h3>${scenario.scenario} <span class="grade grade-${scenario.grade}">${scenario.grade}</span></h3>
        <p>${scenario.description}</p>
        
        <table>
            <tr><th>Metric</th><th>Value</th><th>Threshold</th><th>Status</th></tr>
            <tr>
                <td>Avg Response Time</td>
                <td>${scenario.metrics.latency.mean.toFixed(1)}ms</td>
                <td>≤ ${scenario.thresholds.avgResponseTime.threshold}ms</td>
                <td class="${scenario.thresholds.avgResponseTime.passed ? 'pass' : 'fail'}">
                    ${scenario.thresholds.avgResponseTime.passed ? '✅' : '❌'}
                </td>
            </tr>
            <tr>
                <td>P95 Response Time</td>
                <td>${scenario.metrics.latency.p95.toFixed(1)}ms</td>
                <td>≤ ${scenario.thresholds.p95ResponseTime.threshold}ms</td>
                <td class="${scenario.thresholds.p95ResponseTime.passed ? 'pass' : 'fail'}">
                    ${scenario.thresholds.p95ResponseTime.passed ? '✅' : '❌'}
                </td>
            </tr>
            <tr>
                <td>Error Rate</td>
                <td>${scenario.metrics.errorRate.toFixed(2)}%</td>
                <td>≤ ${scenario.thresholds.errorRate.threshold}%</td>
                <td class="${scenario.thresholds.errorRate.passed ? 'pass' : 'fail'}">
                    ${scenario.thresholds.errorRate.passed ? '✅' : '❌'}
                </td>
            </tr>
            <tr>
                <td>Throughput</td>
                <td>${scenario.metrics.requests.average.toFixed(1)} req/s</td>
                <td>≥ ${scenario.thresholds.throughput.threshold} req/s</td>
                <td class="${scenario.thresholds.throughput.passed ? 'pass' : 'fail'}">
                    ${scenario.thresholds.throughput.passed ? '✅' : '❌'}
                </td>
            </tr>
        </table>
    </div>
    `).join('')}

    <div style="margin-top: 40px; padding: 20px; background: #f8f9fa; border-radius: 8px;">
        <h3>Environment</h3>
        <p><strong>Node.js:</strong> ${report.environment.nodeVersion}</p>
        <p><strong>Platform:</strong> ${report.environment.platform} ${report.environment.arch}</p>
        <p><strong>Timestamp:</strong> ${report.timestamp}</p>
    </div>
</body>
</html>
    `;
  }

  async runFullSuite() {
    console.log('🚀 Starting comprehensive load test suite...\n');
    
    // Pre-flight checks
    console.log('🔍 Running pre-flight checks...');
    const serverHealthy = await this.checkServerHealth();
    if (!serverHealthy) {
      console.error('❌ Server health check failed. Aborting tests.');
      process.exit(1);
    }

    await this.warmupServer();

    // Run all scenarios
    for (const scenario of scenarios) {
      try {
        await this.runScenario(scenario);
        // Brief pause between scenarios
        await new Promise(resolve => setTimeout(resolve, 5000));
      } catch (error) {
        console.error(`❌ Error running scenario ${scenario.name}:`, error);
        this.results.push({
          scenario: scenario.name,
          error: error.message,
          passed: false,
          grade: 'F'
        });
      }
    }

    // Generate final report
    console.log('\n📊 Generating final report...');
    const report = this.generateReport();
    
    // Final summary
    console.log('\n' + '═'.repeat(80));
    console.log('🎯 LOAD TEST SUMMARY');
    console.log('═'.repeat(80));
    console.log(`📋 Total Scenarios: ${report.summary.totalScenarios}`);
    console.log(`✅ Passed: ${report.summary.passed}`);
    console.log(`❌ Failed: ${report.summary.failed}`);
    console.log(`📊 Overall Success: ${report.summary.overallSuccess ? 'YES' : 'NO'}`);
    console.log(`📈 Total Requests: ${report.summary.totalRequests.toLocaleString()}`);
    console.log(`⏱️  Avg Response Time: ${report.summary.avgResponseTime.toFixed(1)}ms`);
    console.log(`🎯 Overall Grade: ${report.summary.averageGrade}`);
    console.log('═'.repeat(80));

    return report;
  }
}

// Run if called directly
if (require.main === module) {
  const tester = new LoadTester();
  tester.runFullSuite()
    .then(report => {
      const exitCode = report.summary.overallSuccess ? 0 : 1;
      process.exit(exitCode);
    })
    .catch(error => {
      console.error('❌ Load test suite failed:', error);
      process.exit(1);
    });
}

module.exports = LoadTester;